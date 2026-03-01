<script lang="ts">
  import PixelIcon from './PixelIcon.svelte';
  import type { IconName } from './PixelIcon.svelte';
  import FileCard from './FileCard.svelte';
  import type { VaultItem } from './FileCard.svelte';
  import type { UploadProgress } from '$lib/types/upload';

  let {
    items,
    uploadStates,
    errorMessage,
    dragOver,
    pasteText = $bindable(''),
    pasteProcessing = false,
    exportingAll = false,
    onselectfile,
    ondeletefile,
    onselectfiles,
    onpastesubmit,
    onexportall
  }: {
    items: VaultItem[];
    uploadStates: Map<string, UploadProgress>;
    errorMessage: string;
    dragOver: boolean;
    pasteText?: string;
    pasteProcessing?: boolean;
    exportingAll?: boolean;
    onselectfile: (id: number) => void;
    ondeletefile: (item: VaultItem) => void;
    onselectfiles: () => void;
    onpastesubmit: () => void;
    onexportall: () => void;
  } = $props();

  let showPastePanel = $state(false);

  let isAnyUploading = $derived(
    Array.from(uploadStates.values()).some(u => u.stage !== 'done' && u.stage !== 'error')
  );

  let pendingUploads = $derived(
    Array.from(uploadStates.values()).filter(u => u.itemId === null && u.stage !== 'done')
  );

  function getUploadForItem(itemId: number): UploadProgress | undefined {
    return Array.from(uploadStates.values()).find(u => u.itemId === itemId);
  }

  function getFileTypeColor(fileType: string): string {
    switch (fileType) {
      case 'txt': return 'var(--filetype-txt)';
      case 'pdf': return 'var(--filetype-pdf)';
      case 'csv': return 'var(--filetype-csv)';
      case 'json': return 'var(--filetype-json)';
      case 'md': return 'var(--filetype-md)';
      default: return 'var(--text-secondary)';
    }
  }

  function getFileIcon(fileType: string): IconName {
    switch (fileType) {
      case 'txt': return 'file';
      case 'pdf': return 'file-alt';
      case 'csv': return 'table';
      case 'json': return 'code';
      case 'md': return 'article';
      default: return 'file';
    }
  }
</script>

{#if items.length === 0 && pendingUploads.length === 0}
  <div
    class="drop-zone"
    class:drop-zone-active={dragOver}
    role="region"
    aria-label="File drop zone"
  >
    <div class="drop-zone-icon">
      <PixelIcon name="upload" size={48} />
    </div>
    {#if isAnyUploading}
      <p class="drop-zone-text">Processing files...</p>
    {:else}
      <p class="drop-zone-text">Drop .txt .md .csv .json or .pdf files here</p>
    {/if}
    <button class="action-btn" onclick={onselectfiles} disabled={isAnyUploading}>
      {isAnyUploading ? 'Processing...' : 'Select Files'}
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
        class="action-btn"
        onclick={onpastesubmit}
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
{:else}
  <div class="file-browser" class:file-browser-dragover={dragOver}>
    <div class="toolbar">
      <div class="toolbar-left">
        <button class="toolbar-btn" onclick={onselectfiles} disabled={isAnyUploading}>
          <PixelIcon name="upload" size={16} />
          <span>Select Files</span>
        </button>
        <button class="toolbar-btn" onclick={() => showPastePanel = !showPastePanel} disabled={isAnyUploading}>
          <PixelIcon name="clipboard" size={16} />
          <span>Paste Text</span>
        </button>
      </div>
      <div class="toolbar-right">
        <button class="toolbar-btn" onclick={onexportall} disabled={exportingAll || items.length === 0}>
          <PixelIcon name="download" size={16} />
          <span>{exportingAll ? 'Exporting...' : 'Export All'}</span>
        </button>
      </div>
    </div>
    {#if showPastePanel}
      <div class="paste-panel">
        <textarea
          class="paste-textarea"
          placeholder="Paste text to redact..."
          bind:value={pasteText}
          disabled={pasteProcessing}
          rows="3"
        ></textarea>
        <div class="paste-panel-actions">
          <button
            class="action-btn action-btn-sm"
            onclick={onpastesubmit}
            disabled={pasteProcessing || !pasteText.trim()}
          >
            {pasteProcessing ? 'Processing...' : 'Redact & Save'}
          </button>
          <button class="action-btn-secondary action-btn-sm" onclick={() => showPastePanel = false}>
            Cancel
          </button>
        </div>
      </div>
    {/if}
    <div class="file-grid">
      {#each pendingUploads as upload (upload.trackingId)}
        <div class="file-card file-card-pending">
          <div class="file-card-stage-badge">{upload.stage}</div>
          <div class="file-card-icon" style="color: {getFileTypeColor(upload.fileType)}">
            <PixelIcon name={getFileIcon(upload.fileType)} size={32} />
          </div>
          <div class="file-card-name">
            <span class="file-card-name-text">{upload.fileName}</span>
          </div>
          <div class="file-card-meta">
            <span class="file-card-stage">{upload.stage}...</span>
            <span class="file-card-type">.{upload.fileType}</span>
          </div>
          <div class="file-card-progress-track">
            <div class="file-card-progress-fill" style="width: {upload.progress}%"></div>
          </div>
        </div>
      {/each}
      {#each items as item (item.id)}
        <FileCard
          {item}
          uploadProgress={getUploadForItem(item.id)}
          onselect={onselectfile}
          ondelete={ondeletefile}
        />
      {/each}
    </div>
    {#if errorMessage}
      <p class="grid-error">{errorMessage}</p>
    {/if}
  </div>
{/if}

<style>
/* Drop zone (empty state) */
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
  border: 2px dashed var(--border);
  border-radius: 12px;
  background: var(--bg-surface);
  color: var(--text-muted);
  transition: border-color 0.2s, background-color 0.2s;
}

.drop-zone-active {
  border-color: var(--accent-orange);
  background-color: rgba(232, 117, 26, 0.05);
  animation: pulse-border 1.5s ease-in-out infinite;
}

@keyframes pulse-border {
  0%, 100% { border-color: var(--accent-orange); }
  50% { border-color: var(--accent-yellow); }
}

.drop-zone-icon {
  color: var(--text-muted);
}

.drop-zone-active .drop-zone-icon {
  color: var(--accent-orange);
}

.drop-zone-text {
  margin: 0;
  font-size: 14px;
}

.drop-zone-error {
  margin: 0;
  font-size: 13px;
  color: var(--accent-red);
  text-align: center;
  max-width: 360px;
}

/* Action button */
.action-btn {
  padding: 8px 16px;
  border: 2px solid var(--accent-orange);
  border-radius: 8px;
  background-color: var(--accent-orange);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: 'Geist Pixel', monospace;
  transition: background-color 0.2s;
  margin-top: 4px;
}

.action-btn:hover:not(:disabled) {
  background-color: var(--accent-deep);
  border-color: var(--accent-deep);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Paste area */
.paste-divider {
  font-size: 12px;
  color: var(--text-muted);
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
  border: 2px solid var(--border);
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  resize: vertical;
  background: var(--bg-surface);
  color: var(--text-primary);
  box-sizing: border-box;
  text-align: start;
}

.paste-textarea:focus {
  outline: none;
  border-color: var(--accent-orange);
}

/* File browser (grid state) */
.file-browser {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  position: relative;
  border: 2px solid transparent;
  transition: border-color 0.2s;
}

.file-browser-dragover {
  border-color: var(--accent-orange);
  animation: pulse-border 1.5s ease-in-out infinite;
}

/* Toolbar */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-bottom: 2px solid var(--border);
  gap: 8px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 12px;
  font-family: 'Geist Pixel', monospace;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s;
}

.toolbar-btn:hover:not(:disabled) {
  background: var(--bg-elevated);
  border-color: var(--accent-orange);
  color: var(--accent-orange);
}

.toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Paste panel (expandable) */
.paste-panel {
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-bottom: 2px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.paste-panel-actions {
  display: flex;
  gap: 8px;
}

.action-btn-sm {
  padding: 5px 12px;
  font-size: 12px;
  margin-top: 0;
}

.action-btn-secondary {
  padding: 8px 16px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background-color: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: 'Geist Pixel', monospace;
  transition: background-color 0.2s;
}

.action-btn-secondary:hover {
  background-color: var(--bg-surface);
  border-color: var(--text-muted);
}

.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  padding: 20px;
  padding-bottom: 60px;
}

.grid-error {
  margin: 0;
  padding: 12px 20px;
  font-size: 13px;
  color: var(--accent-red);
}

/* Pending upload ghost cards */

.file-card-pending {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  padding-left: 14px;
  background: var(--bg-surface);
  border: 2px solid var(--border);
  border-left: 4px solid var(--accent-orange);
  border-radius: 8px;
  cursor: default;
  opacity: 0.7;
  text-align: left;
  width: 100%;
  min-height: 0;
  box-sizing: border-box;
}

.file-card-pending .file-card-stage-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
  text-transform: capitalize;
  color: var(--accent-orange);
  background: rgba(232, 117, 26, 0.12);
  border: 1px solid var(--accent-orange);
  border-radius: 4px;
  letter-spacing: 0.02em;
}

.file-card-pending .file-card-icon {
  color: var(--text-secondary);
}

.file-card-pending .file-card-name {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
}

.file-card-pending .file-card-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-card-pending .file-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.file-card-pending .file-card-stage {
  color: var(--accent-orange);
  font-weight: 500;
  font-size: 12px;
  text-transform: capitalize;
}

.file-card-pending .file-card-type {
  color: var(--text-muted);
  font-size: 11px;
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-elevated);
}

.file-card-pending .file-card-progress-track {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 5px;
  background: var(--bg-elevated);
  border-radius: 0 0 6px 6px;
  overflow: hidden;
}

.file-card-pending .file-card-progress-fill {
  height: 100%;
  background: var(--accent-orange);
  transition: width 0.4s ease;
  border-radius: 0 0 6px 6px;
}
</style>
