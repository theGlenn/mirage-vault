<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
  import { open } from '@tauri-apps/plugin-dialog';
  import { onMount } from 'svelte';
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
  import type { UploadProgress, UploadStage } from '$lib/types/upload';
  import { STAGE_PROGRESS, generateTrackingId } from '$lib/types/upload';
  import { logger } from '$lib/logging';

  const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.csv', '.json', '.pdf'];

  let activeView: ActiveView = $state('browse');
  let items: VaultItem[] = $state([]);
  let selectedItemId: number | null = $state(null);
  let selectedItem: ItemDetail | null = $state(null);
  let viewMode: 'masked' | 'original' = $state('masked');
  let dragOver = $state(false);
  let errorMessage = $state('');
  let uploadStates: Map<string, UploadProgress> = $state(new Map());
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

  // --- Upload state helpers ---

  function updateUploadState(trackingId: string, updates: Partial<UploadProgress>) {
    const current = uploadStates.get(trackingId);
    if (!current) return;
    const updated = { ...current, ...updates };
    // Auto-set progress from stage if stage changed
    if (updates.stage && updates.stage !== 'error' && updates.progress === undefined) {
      updated.progress = STAGE_PROGRESS[updates.stage];
    }
    const next = new Map(uploadStates);
    next.set(trackingId, updated);
    uploadStates = next;
  }

  function removeUploadState(trackingId: string) {
    const next = new Map(uploadStates);
    next.delete(trackingId);
    uploadStates = next;
  }

  function createUploadEntry(opts: {
    filePath: string;
    fileName: string;
    fileType: string;
    isPaste?: boolean;
  }): string {
    const trackingId = generateTrackingId();
    const entry: UploadProgress = {
      trackingId,
      filePath: opts.filePath,
      fileName: opts.fileName,
      fileType: opts.fileType,
      stage: 'drag',
      progress: STAGE_PROGRESS.drag,
      itemId: null,
      error: null,
      errorStage: null,
      rawContent: null,
      rawPdfBytes: null,
      startedAt: Date.now(),
      isPaste: opts.isPaste ?? false,
    };
    const next = new Map(uploadStates);
    next.set(trackingId, entry);
    uploadStates = next;
    return trackingId;
  }

  function getUploadForSelectedItem(): UploadProgress | undefined {
    if (selectedItemId == null) return undefined;
    return Array.from(uploadStates.values()).find(u => u.itemId === selectedItemId);
  }

  // --- Item selection ---

  async function selectItem(id: number) {
    selectedItemId = id;
    viewMode = 'masked';
    const item = await invoke<ItemDetail>('get_item', { itemId: id });
    selectedItem = item;
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

  // --- Helper: build entities array + save hash mappings ---

  async function saveHashMappingsIfNeeded(result: Awaited<ReturnType<typeof maskWithStrategy>>, itemId: number) {
    if (result.strategy === 'ollama') {
      const hashMappings = result.mappings
        .filter((m) => m.hash)
        .map((m) => ({
          hash: m.hash!,
          original: m.original,
          entity_type: m.type
        }));
      if (hashMappings.length > 0) {
        await invoke('save_hash_mappings', { itemId, mappings: hashMappings });
      }
    }
  }

  function buildEntities(result: Awaited<ReturnType<typeof maskWithStrategy>>) {
    return result.mappings.map((m) => ({
      entity_type: m.type,
      original_value: m.original,
      token: m.token || m.hash || '[MASKED]',
      span_start: m.start,
      span_end: m.end
    }));
  }

  // --- Staged ingest: text files ---

  async function ingestFilePath(path: string, name: string, trackingId: string) {
    const ext = getExtension(name).replace('.', '');

    // Stage: reading
    updateUploadState(trackingId, { stage: 'reading' });
    logger.info('Reading file', { trackingId, file: name, stage: 'reading' });
    const text = await invoke<string>('read_file_text', { path });
    updateUploadState(trackingId, { rawContent: text });

    // Stage: saving (phase 1 — save raw with status 'processing')
    updateUploadState(trackingId, { stage: 'saving' });
    logger.info('Saving to DB', { trackingId, file: name, stage: 'saving' });
    const itemId = await invoke<number>('save_item', {
      name,
      fileType: ext,
      rawContent: text,
      maskedContent: '',
      entities: [],
      status: 'processing'
    });
    updateUploadState(trackingId, { itemId });
    await refreshItems();

    // Stage: processing (phase 2 — mask + update)
    await runMasking(trackingId, itemId, text, name);
  }

  // --- Staged ingest: PDF files ---

  async function ingestPdfFilePath(path: string, name: string, trackingId: string) {
    // Stage: reading
    updateUploadState(trackingId, { stage: 'reading' });
    logger.info('Reading PDF', { trackingId, file: name, stage: 'reading' });
    const bytes = await invoke<number[]>('read_file_bytes', { path });
    const pdfResult = await invoke<PdfExtractResult>('extract_pdf_text', { content: bytes });
    updateUploadState(trackingId, { rawContent: pdfResult.text, rawPdfBytes: bytes });

    // Stage: saving (phase 1)
    updateUploadState(trackingId, { stage: 'saving' });
    logger.info('Saving PDF to DB', { trackingId, file: name, stage: 'saving' });
    const itemId = await invoke<number>('save_item', {
      name,
      fileType: 'pdf',
      rawContent: pdfResult.text,
      maskedContent: '',
      entities: [],
      status: 'processing',
      warning: pdfResult.has_warning ? 'Some pages in this PDF could not be extracted. Results may be incomplete.' : undefined,
      rawPdfBytes: bytes
    });
    updateUploadState(trackingId, { itemId });
    await refreshItems();

    // Stage: processing (phase 2)
    await runMasking(trackingId, itemId, pdfResult.text, name);
  }

  // --- Shared masking phase (phase 2) ---

  async function runMasking(trackingId: string, itemId: number, text: string, name: string) {
    updateUploadState(trackingId, { stage: 'processing' });
    logger.info('Running masking', { trackingId, file: name, stage: 'processing', itemId });

    const result = await maskWithStrategy(text);
    const entities = buildEntities(result);

    await invoke('update_item_masking', {
      itemId,
      maskedContent: result.maskedText,
      entities,
      status: 'done'
    });

    await saveHashMappingsIfNeeded(result, itemId);

    // Done
    updateUploadState(trackingId, { stage: 'done' });
    logger.info('Upload complete', { trackingId, file: name, stage: 'done', itemId });
    await refreshItems();

    // Re-fetch selected item if it was this one
    if (selectedItemId === itemId) {
      selectedItem = await invoke<ItemDetail>('get_item', { itemId });
    }

    // Clean up after a brief delay so user sees the 100% state
    setTimeout(() => removeUploadState(trackingId), 1500);
  }

  // --- File selection dialog ---

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
        logger.info('Files selected via dialog', { file: selected.join(', ') });
        await handleFileDrop(selected);
      }
    } catch (err) {
      logger.error('Failed to select files', { file: String(err) });
      errorMessage = 'Failed to select files: ' + (err instanceof Error ? err.message : String(err));
    }
  }

  // --- Paste submit ---

  async function handlePasteSubmit() {
    if (!pasteText.trim()) return;
    errorMessage = '';
    pasteProcessing = true;

    const text = pasteText;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const name = `Pasted text - ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const trackingId = createUploadEntry({
      filePath: '',
      fileName: name,
      fileType: 'txt',
      isPaste: true,
    });

    try {
      // Paste skips reading stage — go straight to saving
      updateUploadState(trackingId, { stage: 'saving', rawContent: text });
      logger.info('Saving pasted text', { trackingId, file: name, stage: 'saving' });

      const itemId = await invoke<number>('save_item', {
        name,
        fileType: 'txt',
        rawContent: text,
        maskedContent: '',
        entities: [],
        status: 'processing'
      });
      updateUploadState(trackingId, { itemId });
      await refreshItems();

      // Masking phase
      await runMasking(trackingId, itemId, text, name);
      pasteText = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Paste processing failed', { trackingId, file: name, stage: 'error' });
      const current = uploadStates.get(trackingId);
      updateUploadState(trackingId, {
        stage: 'error',
        error: msg,
        errorStage: current?.stage ?? 'saving',
      });
      errorMessage = msg;
    } finally {
      pasteProcessing = false;
    }
  }

  // --- Clipboard / export ---

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

  // --- Delete / export all ---

  let confirmDeleteItem: VaultItem | null = $state(null);
  let exportingAll = $state(false);

  async function deleteItem(item: VaultItem) {
    await invoke('delete_item', { itemId: item.id });
    // Clean up any matching upload state
    for (const [tid, u] of uploadStates) {
      if (u.itemId === item.id) {
        removeUploadState(tid);
        break;
      }
    }
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

  // --- File drop handler (staged, per-file error handling) ---

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

    // Create tracking entries for all files upfront (ghost cards)
    const trackingEntries: { path: string; name: string; trackingId: string }[] = [];
    for (const { path, name } of validPaths) {
      const ext = getExtension(name).replace('.', '');
      const trackingId = createUploadEntry({ filePath: path, fileName: name, fileType: ext });
      trackingEntries.push({ path, name, trackingId });
    }

    logger.info(`Processing ${trackingEntries.length} file(s)`, {
      file: trackingEntries.map(e => e.name).join(', ')
    });

    // Process sequentially with per-file error handling
    for (const { path, name, trackingId } of trackingEntries) {
      try {
        const ext = getExtension(name);
        if (ext === '.pdf') {
          await ingestPdfFilePath(path, name, trackingId);
        } else {
          await ingestFilePath(path, name, trackingId);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('File processing failed', { trackingId, file: name, stage: 'error' });
        const current = uploadStates.get(trackingId);
        updateUploadState(trackingId, {
          stage: 'error',
          error: msg,
          errorStage: current?.stage ?? 'reading',
        });
        // Continue to next file — don't abort
      }
    }
  }

  // --- Retry failed upload ---

  async function retryUpload(trackingId: string) {
    const upload = uploadStates.get(trackingId);
    if (!upload || upload.stage !== 'error') return;

    logger.info('Retrying upload', { trackingId, file: upload.fileName, stage: upload.errorStage ?? 'unknown' });

    // Clear error state
    updateUploadState(trackingId, { stage: 'reading', error: null, errorStage: null });

    try {
      if (upload.itemId != null && upload.rawContent != null) {
        // Item already in DB — just retry masking
        await runMasking(trackingId, upload.itemId, upload.rawContent, upload.fileName);
      } else if (upload.isPaste && upload.rawContent != null) {
        // Paste retry — re-save and mask
        updateUploadState(trackingId, { stage: 'saving' });
        const itemId = await invoke<number>('save_item', {
          name: upload.fileName,
          fileType: upload.fileType,
          rawContent: upload.rawContent,
          maskedContent: '',
          entities: [],
          status: 'processing'
        });
        updateUploadState(trackingId, { itemId });
        await refreshItems();
        await runMasking(trackingId, itemId, upload.rawContent, upload.fileName);
      } else if (upload.filePath) {
        // Re-ingest from file
        const ext = getExtension(upload.fileName);
        if (ext === '.pdf') {
          await ingestPdfFilePath(upload.filePath, upload.fileName, trackingId);
        } else {
          await ingestFilePath(upload.filePath, upload.fileName, trackingId);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Retry failed', { trackingId, file: upload.fileName });
      const current = uploadStates.get(trackingId);
      updateUploadState(trackingId, {
        stage: 'error',
        error: msg,
        errorStage: current?.stage ?? 'reading',
      });
    }
  }

  // --- Retry handler for FileViewer (finds trackingId by selected item) ---

  function handleRetry() {
    const upload = getUploadForSelectedItem();
    if (upload) {
      retryUpload(upload.trackingId);
    }
  }

  // Load items on mount and set up Tauri drag-drop events
  onMount(() => {
    refreshItems().catch(err => {
      logger.error('Failed to refresh items', { file: String(err) });
      errorMessage = 'Failed to load vault items: ' + (err instanceof Error ? err.message : String(err));
    });

    const webview = getCurrentWebviewWindow();
    let unlisten: (() => void) | undefined;

    webview.onDragDropEvent(async (event) => {
      logger.debug('Drag-drop event', { stage: event.payload.type });
      if (event.payload.type === 'enter') {
        dragOver = true;
      } else if (event.payload.type === 'leave') {
        dragOver = false;
      } else if (event.payload.type === 'drop') {
        dragOver = false;
        logger.info('Files dropped', { file: event.payload.paths.join(', ') });
        try {
          await handleFileDrop(event.payload.paths);
        } catch (err) {
          logger.error('Failed to handle file drop', { file: String(err) });
          errorMessage = 'Failed to process files: ' + (err instanceof Error ? err.message : String(err));
        }
      }
    }).then(fn => {
      unlisten = fn;
      logger.info('Drag-drop listener registered');
    }).catch(err => {
      logger.error('Failed to register drag-drop listener', { file: String(err) });
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
          uploadProgress={getUploadForSelectedItem()}
          onclose={() => { selectedItemId = null; selectedItem = null; }}
          oncopy={copyMaskedText}
          onexport={exportFile}
          onexportpdf={exportMaskedPdf}
          ontoggleviewmode={(mode) => viewMode = mode}
          onretry={handleRetry}
        />
      {/if}
      <FileBrowser
        items={filteredItems}
        {uploadStates}
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
:global(html), :global(body) {
  margin: 0;
  padding: 0;
  overflow: hidden;
  height: 100%;
}

:root {
  font-family: 'Geist', 'SF Pro Display', -apple-system, sans-serif;
  font-size: 14px;
  line-height: 22px;
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
  border-radius: 8px;
  border: 2px solid var(--border-accent);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 100;
  pointer-events: none;
  font-family: 'Geist', sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}


</style>
