<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
  import { open } from '@tauri-apps/plugin-dialog';
  import { onMount } from 'svelte';
  import { maskWithStrategy, getCurrentStrategyInfo } from '$lib/masking';
  import MaskingStrategyConfig from '$lib/components/MaskingStrategyConfig.svelte';

  const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.csv', '.json', '.pdf'];

  interface VaultItem {
    id: number;
    name: string;
    file_type: string;
    entity_count: number;
    created_at: string;
    warning: string | null;
  }

  interface EntityDetail {
    id: number;
    entity_type: string;
    original_value: string;
    token: string;
    span_start: number;
    span_end: number;
  }

  interface ItemDetail {
    id: number;
    name: string;
    file_type: string;
    raw_content: string;
    masked_content: string;
    created_at: string;
    warning: string | null;
    raw_pdf_bytes: number[] | null;
    entities: EntityDetail[];
  }

  const ENTITY_TYPE_LABELS: Record<string, string> = {
    EMAIL: 'Email',
    PERSON: 'Person',
    ORG: 'Organization',
    AMT: 'Amount',
    PHONE: 'Phone',
    API_KEY: 'API Key'
  };

  interface EntityGroupItem {
    original_value: string;
    token: string;
    count: number;
  }

  interface EntityGroup {
    type: string;
    label: string;
    items: EntityGroupItem[];
  }

  function groupEntitiesByType(entities: EntityDetail[]): EntityGroup[] {
    const groups: Map<string, Map<string, EntityGroupItem>> = new Map();
    for (const e of entities) {
      if (!groups.has(e.entity_type)) {
        groups.set(e.entity_type, new Map());
      }
      const typeMap = groups.get(e.entity_type)!;
      if (typeMap.has(e.token)) {
        typeMap.get(e.token)!.count++;
      } else {
        typeMap.set(e.token, { original_value: e.original_value, token: e.token, count: 1 });
      }
    }

    const typeOrder = ['EMAIL', 'PERSON', 'ORG', 'AMT', 'PHONE', 'API_KEY'];
    const result: EntityGroup[] = [];
    for (const type of typeOrder) {
      const typeMap = groups.get(type);
      if (typeMap && typeMap.size > 0) {
        result.push({
          type,
          label: ENTITY_TYPE_LABELS[type] || type,
          items: Array.from(typeMap.values())
        });
      }
    }
    return result;
  }

  interface TextSegment {
    text: string;
    entity?: EntityDetail;
  }

  function buildHighlightedSegments(text: string, entities: EntityDetail[]): TextSegment[] {
    if (!entities.length) return [{ text }];
    const sorted = [...entities].sort((a, b) => a.span_start - b.span_start);
    const segments: TextSegment[] = [];
    let pos = 0;
    for (const entity of sorted) {
      if (entity.span_start > pos) {
        segments.push({ text: text.substring(pos, entity.span_start) });
      }
      segments.push({ text: text.substring(entity.span_start, entity.span_end), entity });
      pos = entity.span_end;
    }
    if (pos < text.length) {
      segments.push({ text: text.substring(pos) });
    }
    return segments;
  }

  interface ContentBlock {
    type: 'content' | 'marker';
    text: string;
    start: number;
    end: number;
  }

  function splitByPageMarkers(text: string): ContentBlock[] {
    const blocks: ContentBlock[] = [];
    let lastIndex = 0;
    const regex = /\n*--- Page \d+ ---\n*/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        blocks.push({ type: 'content', text: text.substring(lastIndex, match.index), start: lastIndex, end: match.index });
      }
      const markerText = match[0].replace(/^\n+|\n+$/g, '');
      blocks.push({ type: 'marker', text: markerText, start: match.index, end: match.index + match[0].length });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      blocks.push({ type: 'content', text: text.substring(lastIndex), start: lastIndex, end: text.length });
    }
    if (blocks.length === 0) {
      blocks.push({ type: 'content', text, start: 0, end: text.length });
    }
    return blocks;
  }

  function getEntitiesForBlock(entities: EntityDetail[], block: ContentBlock): EntityDetail[] {
    return entities
      .filter(e => e.span_start >= block.start && e.span_end <= block.end)
      .map(e => ({ ...e, span_start: e.span_start - block.start, span_end: e.span_end - block.start }));
  }

  let items: VaultItem[] = $state([]);
  let selectedItemId: number | null = $state(null);
  let selectedItem: ItemDetail | null = $state(null);
  let viewMode: 'masked' | 'original' = $state('masked');
  let dragOver = $state(false);
  let errorMessage = $state('');
  let processing = $state(false);
  let pasteText = $state('');
  let pasteProcessing = $state(false);
  let toastMessage = $state('');
  let toastTimeout: ReturnType<typeof setTimeout> | null = null;

  async function selectItem(id: number) {
    selectedItemId = id;
    viewMode = 'masked';
    selectedItem = await invoke<ItemDetail>('get_item', { itemId: id });
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
  <!-- Left Sidebar: File List -->
  <aside class="sidebar sidebar-left">
    <div class="sidebar-header">
      <h2>Files</h2>
      {#if items.length > 0}
        <button class="export-all-btn" onclick={exportAll} disabled={exportingAll}>
          {exportingAll ? 'Exporting...' : 'Export All'}
        </button>
      {/if}
    </div>
    <div class="sidebar-content">
      {#if items.length === 0}
        <p class="empty-state">No files in vault</p>
      {:else}
        {#each items as item (item.id)}
          <div class="file-item-row">
            <button
              class="file-item"
              class:file-item-selected={selectedItemId === item.id}
              onclick={() => selectItem(item.id)}
            >
              <div class="file-item-top">
                <span class="file-name">{item.name}</span>
                {#if item.warning}<span class="file-warning-icon" title="Extraction warning">&#9888;</span>{/if}
                <span class="file-badge" class:file-badge-pdf={item.file_type === 'pdf'}>.{item.file_type}</span>
              </div>
              <div class="file-item-meta">
                <span class="file-entity-count">{item.entity_count} {item.entity_count === 1 ? 'entity' : 'entities'}</span>
                <span class="file-date">{formatDate(item.created_at)}</span>
              </div>
            </button>
            <button
              class="delete-btn"
              title="Delete item"
              onclick={(e: MouseEvent) => { e.stopPropagation(); confirmDeleteItem = item; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                <path d="M10 11v6"></path>
                <path d="M14 11v6"></path>
              </svg>
            </button>
          </div>
        {/each}
      {/if}
    </div>
  </aside>

  <!-- Center: Content Viewer -->
  <main
    class="content-viewer"
    ondragover={(e: DragEvent) => e.preventDefault()}
    ondrop={(e: DragEvent) => e.preventDefault()}
  >
    {#if selectedItem}
      <div class="viewer-container">
        <div class="viewer-toolbar">
          <div class="view-toggle">
            <button
              class="toggle-btn"
              class:toggle-btn-active={viewMode === 'masked'}
              onclick={() => viewMode = 'masked'}
            >Masked</button>
            <button
              class="toggle-btn"
              class:toggle-btn-active={viewMode === 'original'}
              onclick={() => viewMode = 'original'}
            >Original</button>
          </div>
          <div class="toolbar-actions">
            <button class="toolbar-btn" onclick={copyMaskedText}>Copy</button>
            <button class="toolbar-btn" onclick={exportFile}>Export</button>
            {#if selectedItem.file_type === 'pdf' && selectedItem.raw_pdf_bytes}
              <button class="toolbar-btn" onclick={exportMaskedPdf}>Export PDF (experimental)</button>
            {/if}
          </div>
        </div>
        {#if viewMode === 'original'}
          <div class="entity-legend">
            {#each Object.entries(ENTITY_TYPE_LABELS) as [type, label]}
              <span class="legend-item">
                <span class="legend-swatch entity-{type.toLowerCase()}"></span>
                {label}
              </span>
            {/each}
          </div>
        {/if}
        {#if selectedItem.warning}
          <div class="warning-banner">
            <span class="warning-banner-icon">&#9888;</span>
            <span>{selectedItem.warning}</span>
          </div>
        {/if}
        {#if viewMode === 'masked'}
          <div class="viewer-content">{#each splitByPageMarkers(selectedItem.masked_content) as seg}{#if seg.type === 'marker'}<div class="page-marker">{seg.text}</div>{:else}{seg.text}{/if}{/each}</div>
        {:else}
          <div class="viewer-content">{#each splitByPageMarkers(selectedItem.raw_content) as seg}{#if seg.type === 'marker'}<div class="page-marker">{seg.text}</div>{:else}{#each buildHighlightedSegments(seg.text, getEntitiesForBlock(selectedItem.entities, seg)) as segment}{#if segment.entity}<span class="entity-highlight entity-{segment.entity.entity_type.toLowerCase()}" data-tooltip="{'\u2192'} {segment.entity.token}">{segment.text}</span>{:else}{segment.text}{/if}{/each}{/if}{/each}</div>
        {/if}
      </div>
    {:else}
      <div
        class="drop-zone"
        class:drop-zone-active={dragOver}
        role="region"
        aria-label="File drop zone"
      >
        <div class="drop-zone-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="12" y1="18" x2="12" y2="12"></line>
            <line x1="9" y1="15" x2="12" y2="12"></line>
            <line x1="15" y1="15" x2="12" y2="12"></line>
          </svg>
        </div>
        {#if processing}
          <div class="loading-spinner"></div>
          <p class="drop-zone-text">Processing files...</p>
        {:else}
          <p class="drop-zone-text">Drop .txt, .md, .csv, .json, or .pdf files here</p>
        {/if}
          <button class="paste-submit" onclick={selectFiles} disabled={processing} style="margin-top: 12px;">
            {processing ? 'Processing...' : 'Select Files'}
          </button>

        <div class="paste-divider">or paste text</div>

        <div class="paste-area">
          <textarea
            class="paste-textarea"
            placeholder="Paste text to redact..."
            bind:value={pasteText}
            disabled={pasteProcessing}
            rows="4"
          ></textarea>
          <button
            class="paste-submit"
            onclick={handlePasteSubmit}
            disabled={pasteProcessing || !pasteText.trim()}
          >
            {#if pasteProcessing}
              Processing...
            {:else}
              Redact & Save
            {/if}
          </button>
        </div>

        {#if errorMessage}
          <p class="drop-zone-error">{errorMessage}</p>
        {/if}
      </div>
    {/if}
  </main>

  <!-- Right Sidebar: Entity Panel -->
  <aside class="sidebar sidebar-right">
    <div class="sidebar-header">
      <h2>Entities</h2>
    </div>
    <div class="sidebar-content">
      {#if selectedItem}
        {#each groupEntitiesByType(selectedItem.entities) as group (group.type)}
          <div class="entity-group">
            <div class="entity-group-header">
              <span class="entity-group-swatch entity-{group.type.toLowerCase()}"></span>
              {group.label}
            </div>
            {#each group.items as item (item.token)}
              <div class="entity-group-item">
                <div class="entity-group-item-value">{item.original_value}</div>
                <div class="entity-group-item-meta">
                  <span class="entity-group-item-token">{item.token}</span>
                  <span class="entity-group-item-count">{item.count}x</span>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="empty-state">No entities detected</p>
        {/each}
      {:else}
        <p class="empty-state">No file selected</p>
      {/if}
    </div>
    
    <!-- Masking Strategy Configuration -->
    <div class="sidebar-section">
      <div class="sidebar-header">
        <h2>Masking Strategy</h2>
      </div>
      <div class="sidebar-content">
        <MaskingStrategyConfig />
      </div>
    </div>
  </aside>
</div>

{#if toastMessage}
  <div class="toast">{toastMessage}</div>
{/if}

{#if confirmDeleteItem}
  <div class="confirm-overlay" onclick={() => confirmDeleteItem = null} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_interactive_supports_focus a11y_interactive_supports_focus -->
    <div class="confirm-dialog" onclick={(e: MouseEvent) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
      <p class="confirm-message">Delete <strong>{confirmDeleteItem.name}</strong>? This cannot be undone.</p>
      <div class="confirm-actions">
        <button class="confirm-cancel" onclick={() => confirmDeleteItem = null}>Cancel</button>
        <button class="confirm-delete" onclick={() => confirmDeleteItem && deleteItem(confirmDeleteItem)}>Delete</button>
      </div>
    </div>
  </div>
{/if}

<style>
:root {
  font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 24px;
  font-weight: 400;
  color: #0f0f0f;
  background-color: #f6f6f6;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  width: 240px;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  border-color: #e0e0e0;
  background-color: #fafafa;
}

.sidebar-left {
  border-right: 1px solid #e0e0e0;
}

.sidebar-right {
  border-left: 1px solid #e0e0e0;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #666;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.empty-state {
  color: #999;
  font-size: 13px;
  text-align: center;
  margin-top: 24px;
}

.content-viewer {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  max-width: 480px;
  margin: 24px;
  padding: 48px 32px;
  border: 2px dashed #ccc;
  border-radius: 12px;
  color: #888;
  transition: border-color 0.2s, background-color 0.2s;
}

.drop-zone-active {
  border-color: #396cd8;
  background-color: rgba(57, 108, 216, 0.05);
}

.drop-zone-icon {
  color: #bbb;
}

.drop-zone-active .drop-zone-icon {
  color: #396cd8;
}

.drop-zone-text {
  margin: 0;
  font-size: 14px;
}

.drop-zone-error {
  margin: 0;
  font-size: 13px;
  color: #d93025;
  text-align: center;
  max-width: 360px;
}

.file-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border-radius: 6px;
  margin-bottom: 4px;
  font-size: 13px;
  cursor: pointer;
  border: none;
  background: none;
  text-align: left;
  width: 100%;
  color: inherit;
  font-family: inherit;
  transition: background-color 0.15s;
}

.file-item:hover {
  background-color: #eee;
}

.file-item-selected {
  background-color: #e0ecff;
}

.file-item-selected:hover {
  background-color: #d4e3ff;
}

.file-item-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.file-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background-color: #e8e8e8;
  color: #666;
  flex-shrink: 0;
}

.file-badge-pdf {
  background-color: #fee2e2;
  color: #dc2626;
  font-weight: 600;
}

.file-item-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #888;
}

.file-entity-count {
  color: #666;
}

.file-date {
  color: #999;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e0e0e0;
  border-top-color: #396cd8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.paste-divider {
  font-size: 12px;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 4px 0;
}

.paste-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.paste-textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  resize: vertical;
  background: #fff;
  color: #0f0f0f;
  box-sizing: border-box;
}

.paste-textarea:focus {
  outline: none;
  border-color: #396cd8;
}

.paste-submit {
  align-self: flex-end;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background-color: #396cd8;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.paste-submit:hover:not(:disabled) {
  background-color: #2d5bc4;
}

.paste-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.viewer-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.viewer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.view-toggle {
  display: flex;
  background-color: #e8e8e8;
  border-radius: 6px;
  padding: 2px;
}

.toggle-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  background: none;
  font-size: 13px;
  font-weight: 500;
  color: #666;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
  font-family: inherit;
}

.toggle-btn:hover:not(.toggle-btn-active) {
  color: #333;
}

.toggle-btn-active {
  background-color: #fff;
  color: #0f0f0f;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.viewer-content {
  flex: 1;
  margin: 0;
  padding: 16px;
  overflow: auto;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: #0f0f0f;
}

.page-marker {
  text-align: center;
  color: #999;
  font-size: 12px;
  padding: 8px 0;
  margin: 8px 0;
  border-top: 1px solid #e0e0e0;
  border-bottom: 1px solid #e0e0e0;
  font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  letter-spacing: 0.04em;
  white-space: normal;
}

.entity-highlight {
  border-radius: 2px;
  padding: 1px 2px;
  cursor: help;
  position: relative;
  border-bottom: 2px solid;
}

.entity-highlight:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 8px;
  background: #333;
  color: #fff;
  font-size: 11px;
  border-radius: 4px;
  white-space: nowrap;
  z-index: 10;
  pointer-events: none;
}

.entity-email { background-color: rgba(37, 99, 235, 0.15); border-bottom-color: #2563eb; }
.entity-person { background-color: rgba(22, 163, 74, 0.15); border-bottom-color: #16a34a; }
.entity-org { background-color: rgba(234, 88, 12, 0.15); border-bottom-color: #ea580c; }
.entity-amt { background-color: rgba(220, 38, 38, 0.15); border-bottom-color: #dc2626; }
.entity-phone { background-color: rgba(147, 51, 234, 0.15); border-bottom-color: #9333ea; }
.entity-api_key { background-color: rgba(107, 114, 128, 0.15); border-bottom-color: #6b7280; }

.entity-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid #e0e0e0;
  font-size: 12px;
  color: #666;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.legend-swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 2px;
  border-bottom: 2px solid;
}

.entity-group {
  margin-bottom: 16px;
}

.entity-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #555;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid #e0e0e0;
}

.entity-group-swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  border-bottom: 2px solid;
}

.entity-group-item {
  padding: 6px 0;
  border-bottom: 1px solid #f0f0f0;
}

.entity-group-item:last-child {
  border-bottom: none;
}

.entity-group-item-value {
  font-size: 13px;
  font-weight: 500;
  color: #222;
  word-break: break-all;
}

.entity-group-item-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2px;
  font-size: 11px;
}

.entity-group-item-token {
  color: #888;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
}

.entity-group-item-count {
  color: #999;
  font-weight: 500;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.toolbar-btn {
  padding: 6px 14px;
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
  font-weight: 500;
  color: #333;
  cursor: pointer;
  font-family: inherit;
  transition: background-color 0.15s, border-color 0.15s;
}

.toolbar-btn:hover {
  background-color: #f0f0f0;
  border-color: #bbb;
}

.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  background: #333;
  color: #fff;
  font-size: 13px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  z-index: 100;
  pointer-events: none;
}

.export-all-btn {
  padding: 4px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  font-size: 11px;
  font-weight: 500;
  color: #333;
  cursor: pointer;
  font-family: inherit;
  transition: background-color 0.15s, border-color 0.15s;
}

.export-all-btn:hover:not(:disabled) {
  background-color: #f0f0f0;
  border-color: #bbb;
}

.export-all-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.file-item-row {
  display: flex;
  align-items: center;
  gap: 2px;
}

.file-item-row .file-item {
  flex: 1;
  min-width: 0;
}

.delete-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: none;
  color: #999;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background-color 0.15s, color 0.15s;
}

.file-item-row:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background-color: #fee2e2;
  color: #dc2626;
}

.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.confirm-dialog {
  background: #fff;
  border-radius: 10px;
  padding: 24px;
  max-width: 360px;
  width: 90%;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.confirm-message {
  margin: 0 0 20px;
  font-size: 14px;
  color: #333;
  line-height: 1.5;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.confirm-cancel {
  padding: 8px 16px;
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
  font-weight: 500;
  color: #333;
  cursor: pointer;
  font-family: inherit;
}

.confirm-cancel:hover {
  background-color: #f0f0f0;
}

.confirm-delete {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: #dc2626;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  cursor: pointer;
  font-family: inherit;
}

.confirm-delete:hover {
  background: #b91c1c;
}

.warning-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background-color: #fef3c7;
  border-bottom: 1px solid #f59e0b;
  font-size: 13px;
  color: #92400e;
  flex-shrink: 0;
}

.warning-banner-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.file-warning-icon {
  font-size: 12px;
  color: #d97706;
  flex-shrink: 0;
}

@media (prefers-color-scheme: dark) {
  :root {
    color: #f6f6f6;
    background-color: #1a1a1a;
  }

  .sidebar {
    background-color: #222;
    border-color: #333;
  }

  .sidebar-left {
    border-right-color: #333;
  }

  .sidebar-right {
    border-left-color: #333;
  }

  .sidebar-header {
    border-bottom-color: #333;
  }

  .sidebar-header h2 {
    color: #999;
  }

  .drop-zone {
    border-color: #444;
    color: #888;
  }

  .drop-zone-active {
    border-color: #5b8def;
    background-color: rgba(91, 141, 239, 0.08);
  }

  .drop-zone-active .drop-zone-icon {
    color: #5b8def;
  }

  .drop-zone-icon {
    color: #555;
  }

  .drop-zone-error {
    color: #f28b82;
  }

  .file-badge {
    background-color: #333;
    color: #aaa;
  }

  .file-badge-pdf {
    background-color: rgba(220, 38, 38, 0.2);
    color: #f87171;
  }

  .file-item:hover {
    background-color: #2a2a2a;
  }

  .file-item-selected {
    background-color: #1e3a5f;
  }

  .file-item-selected:hover {
    background-color: #234570;
  }

  .file-entity-count {
    color: #999;
  }

  .file-date {
    color: #777;
  }

  .loading-spinner {
    border-color: #444;
    border-top-color: #5b8def;
  }

  .paste-textarea {
    background: #2a2a2a;
    color: #f6f6f6;
    border-color: #444;
  }

  .paste-textarea:focus {
    border-color: #5b8def;
  }

  .paste-submit {
    background-color: #5b8def;
  }

  .paste-submit:hover:not(:disabled) {
    background-color: #4a7ddf;
  }

  .viewer-toolbar {
    border-bottom-color: #333;
  }

  .view-toggle {
    background-color: #333;
  }

  .toggle-btn {
    color: #999;
  }

  .toggle-btn:hover:not(.toggle-btn-active) {
    color: #ccc;
  }

  .toggle-btn-active {
    background-color: #444;
    color: #f6f6f6;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .viewer-content {
    color: #f6f6f6;
  }

  .page-marker {
    color: #777;
    border-top-color: #444;
    border-bottom-color: #444;
  }

  .entity-highlight:hover::after {
    background: #555;
  }

  .entity-legend {
    border-bottom-color: #333;
    color: #999;
  }

  .entity-group-header {
    color: #999;
    border-bottom-color: #333;
  }

  .entity-group-item {
    border-bottom-color: #2a2a2a;
  }

  .entity-group-item-value {
    color: #e0e0e0;
  }

  .entity-group-item-token {
    color: #777;
  }

  .entity-group-item-count {
    color: #777;
  }

  .toolbar-btn {
    background: #333;
    color: #ddd;
    border-color: #555;
  }

  .toolbar-btn:hover {
    background-color: #444;
    border-color: #666;
  }

  .export-all-btn {
    background: #333;
    color: #ddd;
    border-color: #555;
  }

  .export-all-btn:hover:not(:disabled) {
    background-color: #444;
    border-color: #666;
  }

  .toast {
    background: #555;
  }

  .delete-btn {
    color: #777;
  }

  .delete-btn:hover {
    background-color: rgba(220, 38, 38, 0.2);
    color: #f87171;
  }

  .confirm-dialog {
    background: #2a2a2a;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }

  .confirm-message {
    color: #e0e0e0;
  }

  .confirm-cancel {
    background: #333;
    color: #ddd;
    border-color: #555;
  }

  .confirm-cancel:hover {
    background-color: #444;
  }

  .warning-banner {
    background-color: rgba(245, 158, 11, 0.15);
    border-bottom-color: #b45309;
    color: #fbbf24;
  }

  .file-warning-icon {
    color: #fbbf24;
  }
}
</style>
