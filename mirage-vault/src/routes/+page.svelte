<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
  import { open } from '@tauri-apps/plugin-dialog';
  import { onMount } from 'svelte';
  import { detect } from '$lib/detectors';
  import { mask } from '$lib/masker';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import type { ActiveView } from '$lib/components/Sidebar.svelte';
  import FileBrowser from '$lib/components/FileBrowser.svelte';
  import SearchBar from '$lib/components/SearchBar.svelte';
  import FileViewer from '$lib/components/FileViewer.svelte';
  import type { ItemDetail } from '$lib/components/FileViewer.svelte';
  import type { VaultItem } from '$lib/components/FileCard.svelte';
  import EntityPanel from '$lib/components/EntityPanel.svelte';
  import SettingsScreen from '$lib/components/SettingsScreen.svelte';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import { maskWithStrategy } from '$lib/masking';

  const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.csv', '.json', '.pdf'];

  let activeView: ActiveView = $state('browse');
  let items: VaultItem[] = $state([]);
  let selectedItemId: number | null = $state(null);
  let selectedItem: ItemDetail | null = $state(null);
  let viewMode: 'masked' | 'original' = $state('masked');
  let dragOver = $state(false);
  let errorMessage = $state('');
  let processing = $state(false);
  let pasteText = $state('');
  let pasteProcessing = $state(false);
  let searchQuery = $state('');
  let toastMessage = $state('');
  let toastTimeout: ReturnType<typeof setTimeout> | null = null;

  let filteredItems: VaultItem[] = $derived(
    searchQuery
      ? items.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : items
  );

  
  async function selectItem(id: number) {
    selectedItemId = id;
    viewMode = 'masked';
    const item = await invoke<ItemDetail>('get_item', { itemId: id });
    /*if (extractHashTokenOccurrences(item.masked_content).length > 0) {
      try {
        const hashMappings = await invoke<HashMappingOutput[]>('get_hash_mappings', { itemId: id });
        item.entities = resolveHashEntities(item, hashMappings);
      } catch (err) {
        console.warn('Failed to load hash mappings for item:', id, err);
        item.entities = resolveHashEntities(item, []);
      }
    }*/
    selectedItem = item;
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const y = date.getFullYear();
    const h = date.getHours();
    const min = String(date.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${m}/${d}/${y} ${h12}:${min} ${ampm}`;
  }

  function getExtension(filename: string): string {
    const dot = filename.lastIndexOf('.');
    return dot >= 0 ? filename.substring(dot).toLowerCase() : '';
  }

  async function refreshItems() {
    items = await invoke<VaultItem[]>('list_items');
  }

  interface PdfExtractResult {
    text: string;
    page_count: number;
    has_warning: boolean;
  }

  async function ingestFilePath(path: string, name: string) {
    const ext = getExtension(name).replace('.', '');
    const text = await invoke<string>('read_file_text', { path });
    
    // Use configured masking strategy (NLP or Ollama)
    const result = await maskWithStrategy(text);
    
    const entities = result.mappings.map((m) => ({
      entity_type: m.type,
      original_value: m.original,
      token: m.token || m.hash || '[MASKED]',
      span_start: m.start,
      span_end: m.end
    }));

    const itemId = await invoke<number>('save_item', {
      name,
      fileType: ext,
      rawContent: text,
      maskedContent: result.maskedText,
      entities
    });
    
    // Save hash mappings if using Ollama (hash-based masking)
    if (result.strategy === 'ollama') {
      const hashMappings = result.mappings
        .filter((m) => m.hash)
        .map((m) => ({
          hash: m.hash!,
          original: m.original,
          entity_type: m.type
        }));
      
      if (hashMappings.length > 0) {
        await invoke('save_hash_mappings', {
          itemId,
          mappings: hashMappings
        });
      }
    }
  }

  async function ingestPdfFilePath(path: string, name: string) {
    const bytes = await invoke<number[]>('read_file_bytes', { path });

    const pdfResult = await invoke<PdfExtractResult>('extract_pdf_text', { content: bytes });

    // Use configured masking strategy (NLP or Ollama)
    const result = await maskWithStrategy(pdfResult.text);

    const entities = result.mappings.map((m) => ({
      entity_type: m.type,
      original_value: m.original,
      token: m.token || m.hash || '[MASKED]',
      span_start: m.start,
      span_end: m.end
    }));

    const itemId = await invoke<number>('save_item', {
      name,
      fileType: 'pdf',
      rawContent: pdfResult.text,
      maskedContent: result.maskedText,
      entities,
      warning: pdfResult.has_warning ? 'Some pages in this PDF could not be extracted. Results may be incomplete.' : undefined,
      rawPdfBytes: bytes
    });
    
    // Save hash mappings if using Ollama (hash-based masking)
    if (result.strategy === 'ollama') {
      const hashMappings = result.mappings
        .filter((m) => m.hash)
        .map((m) => ({
          hash: m.hash!,
          original: m.original,
          entity_type: m.type
        }));
      
      if (hashMappings.length > 0) {
        await invoke('save_hash_mappings', {
          itemId,
          mappings: hashMappings
        });
      }
    }
  }


  async function selectFiles() {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: 'Text and PDF files',
            extensions: ['txt', 'md', 'csv', 'json', 'pdf']
          }
        ]
      });
      
      if (selected && selected.length > 0) {
        console.log('Selected files:', selected);
        await handleFileDrop(selected);
      }
    } catch (err) {
      console.error('Failed to select files:', err);
      errorMessage = 'Failed to select files: ' + (err instanceof Error ? err.message : String(err));
    }
  }
  async function handlePasteSubmit() {
    if (!pasteText.trim()) return;
    errorMessage = '';
    pasteProcessing = true;
    try {
      const text = pasteText;
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const name = `Pasted text - ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

      // Use configured masking strategy (NLP or Ollama)
      const result = await maskWithStrategy(text);
      const entities = result.mappings.map((m) => ({
        entity_type: m.type,
        original_value: m.original,
        token: m.token || m.hash || '[MASKED]',
        span_start: m.start,
        span_end: m.end
      }));

      const itemId = await invoke<number>('save_item', {
        name,
        fileType: 'txt',
        rawContent: text,
        maskedContent: result.maskedText,
        entities
      });
    
    // Save hash mappings if using Ollama (hash-based masking)
    if (result.strategy === 'ollama') {
      const hashMappings = result.mappings
        .filter((m) => m.hash)
        .map((m) => ({
          hash: m.hash!,
          original: m.original,
          entity_type: m.type
        }));
      
      if (hashMappings.length > 0) {
        await invoke('save_hash_mappings', {
          itemId,
          mappings: hashMappings
        });
      }
    }

      pasteText = '';
      await refreshItems();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'An error occurred during processing.';
    } finally {
      pasteProcessing = false;
    }
  }

  async function copyMaskedText() {
    if (!selectedItem) return;
    await navigator.clipboard.writeText(selectedItem.masked_content);
    if (toastTimeout) clearTimeout(toastTimeout);
    toastMessage = 'Copied to clipboard';
    toastTimeout = setTimeout(() => { toastMessage = ''; }, 2000);
  }

  async function exportFile() {
    if (!selectedItem) return;
    const isPdf = selectedItem.file_type === 'pdf';
    await invoke('export_file', {
      fileName: isPdf ? selectedItem.name.replace(/\.pdf$/i, '.txt') : selectedItem.name,
      content: selectedItem.masked_content,
      fileExtension: isPdf ? 'txt' : selectedItem.file_type
    });
  }

  async function exportMaskedPdf() {
    if (!selectedItem || selectedItem.file_type !== 'pdf' || !selectedItem.raw_pdf_bytes) return;

    // Build unique replacement pairs from entities
    const seen = new Set<string>();
    const replacements: { original: string; token: string }[] = [];
    for (const e of selectedItem.entities) {
      const key = `${e.original_value}\0${e.token}`;
      if (!seen.has(key)) {
        seen.add(key);
        replacements.push({ original: e.original_value, token: e.token });
      }
    }

    try {
      const result = await invoke<boolean>('export_masked_pdf', {
        pdfBytes: selectedItem.raw_pdf_bytes,
        replacements,
        fileName: selectedItem.name
      });
      if (result) {
        if (toastTimeout) clearTimeout(toastTimeout);
        toastMessage = 'Masked PDF exported';
        toastTimeout = setTimeout(() => { toastMessage = ''; }, 2000);
      }
    } catch {
      if (toastTimeout) clearTimeout(toastTimeout);
      toastMessage = 'PDF export failed — falling back to text export';
      toastTimeout = setTimeout(() => { toastMessage = ''; }, 2000);
      await exportFile();
    }
  }

  let confirmDeleteItem: VaultItem | null = $state(null);
  let exportingAll = $state(false);

  async function deleteItem(item: VaultItem) {
    await invoke('delete_item', { itemId: item.id });
    if (selectedItemId === item.id) {
      selectedItemId = null;
      selectedItem = null;
    }
    confirmDeleteItem = null;
    await refreshItems();
  }

  async function exportAll() {
    if (items.length === 0) return;
    exportingAll = true;
    try {
      const zipItems = [];
      for (const item of items) {
        const detail = await invoke<ItemDetail>('get_item', { itemId: item.id });
        const isPdf = detail.file_type === 'pdf';
        zipItems.push({
          name: isPdf ? detail.name.replace(/\.pdf$/i, '.txt') : detail.name,
          fileType: isPdf ? 'txt' : detail.file_type,
          maskedContent: detail.masked_content
        });
      }
      await invoke('export_zip', { items: zipItems });
    } catch (err) {
      if (toastTimeout) clearTimeout(toastTimeout);
      toastMessage = err instanceof Error ? err.message : 'Export failed';
      toastTimeout = setTimeout(() => { toastMessage = ''; }, 2000);
    } finally {
      exportingAll = false;
    }
  }

  async function handleFileDrop(paths: string[]) {
    errorMessage = '';

    const invalidFiles: string[] = [];
    const validPaths: { path: string; name: string }[] = [];

    for (const path of paths) {
      const name = path.replace(/\\/g, '/').split('/').pop() || path;
      const ext = getExtension(name);
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        invalidFiles.push(name);
      } else {
        validPaths.push({ path, name });
      }
    }

    if (invalidFiles.length > 0) {
      errorMessage = `Unsupported file type(s): ${invalidFiles.join(', ')}. Only .txt, .md, .csv, .json, and .pdf files are accepted.`;
      return;
    }

    processing = true;
    try {
      for (const { path, name } of validPaths) {
        const ext = getExtension(name);
        if (ext === '.pdf') {
          await ingestPdfFilePath(path, name);
        } else {
          await ingestFilePath(path, name);
        }
      }
      await refreshItems();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'An error occurred during processing.';
    } finally {
      processing = false;
    }
  }

  // Load items on mount and set up Tauri drag-drop events
  onMount(() => {
    refreshItems().catch(err => {
      console.error('Failed to refresh items:', err);
      errorMessage = 'Failed to load vault items: ' + (err instanceof Error ? err.message : String(err));
    });

    const webview = getCurrentWebviewWindow();
    let unlisten: (() => void) | undefined;

    webview.onDragDropEvent(async (event) => {
      console.log('Drag-drop event:', event.payload.type);
      if (event.payload.type === 'enter') {
        dragOver = true;
      } else if (event.payload.type === 'leave') {
        dragOver = false;
      } else if (event.payload.type === 'drop') {
        dragOver = false;
        console.log('Files dropped:', event.payload.paths);
        try {
          await handleFileDrop(event.payload.paths);
        } catch (err) {
          console.error('Failed to handle file drop:', err);
          errorMessage = 'Failed to process files: ' + (err instanceof Error ? err.message : String(err));
        }
      }
    }).then(fn => { 
      unlisten = fn; 
      console.log('Drag-drop listener registered');
    }).catch(err => {
      console.error('Failed to register drag-drop listener:', err);
      errorMessage = 'Failed to initialize drag-drop: ' + (err instanceof Error ? err.message : String(err));
    });

    return () => {
      unlisten?.();
    };
  });
</script>

<div class="app-layout">
  <!-- Left Sidebar: Navigation -->
  <Sidebar {activeView} onnavigate={(view) => { activeView = view; if (view === 'settings') { selectedItemId = null; selectedItem = null; } }} />

  <!-- Center: Content Area -->
  <main
    class="content-viewer"
    ondragover={(e: DragEvent) => e.preventDefault()}
    ondrop={(e: DragEvent) => e.preventDefault()}
  >
    {#if activeView === 'settings'}
      <SettingsScreen />
    {:else}
      {#if selectedItem}
        <FileViewer
          {selectedItem}
          {viewMode}
          onclose={() => { selectedItemId = null; selectedItem = null; }}
          oncopy={copyMaskedText}
          onexport={exportFile}
          onexportpdf={exportMaskedPdf}
          ontoggleviewmode={(mode) => viewMode = mode}
        />
      {/if}
      <FileBrowser
        items={filteredItems}
        {processing}
        {errorMessage}
        {dragOver}
        bind:pasteText
        {pasteProcessing}
        {exportingAll}
        onselectfile={(id) => selectItem(id)}
        ondeletefile={(item) => confirmDeleteItem = item}
        onselectfiles={selectFiles}
        onpastesubmit={handlePasteSubmit}
        onexportall={exportAll}
      />
      {#if items.length > 0}
        <SearchBar bind:value={searchQuery} />
      {/if}
      {#if confirmDeleteItem}
        <ConfirmDialog
          message="Delete <strong>{confirmDeleteItem.name}</strong>? This cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onconfirm={() => confirmDeleteItem && deleteItem(confirmDeleteItem)}
          oncancel={() => confirmDeleteItem = null}
        />
      {/if}
    {/if}
  </main>

  <!-- Right Sidebar: Entity Panel -->
  <EntityPanel {activeView} {selectedItem} {items} />
</div>

{#if toastMessage}
  <div class="toast">{toastMessage}</div>
{/if}

<style>
:root {
  font-family: 'JetBrains Mono', 'SF Mono', Monaco, monospace;
  font-size: 16px;
  line-height: 24px;
  font-weight: 400;
  color: var(--text-primary);
  background-color: var(--bg-primary);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background-color: var(--bg-primary);
}

.content-viewer {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-color: var(--bg-primary);
  position: relative;
}

/* Toast */
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 13px;
  border-radius: 0px;
  border: 2px solid var(--border-accent);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 100;
  pointer-events: none;
  font-family: 'JetBrains Mono', 'SF Mono', Monaco, monospace;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}


</style>
