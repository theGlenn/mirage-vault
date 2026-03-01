<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import PixelIcon from './PixelIcon.svelte';
  import type { SessionEntry } from './SessionEntryCard.svelte';

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

  interface SessionEntityOutput {
    entity_type: string;
    original_value: string;
    token: string;
  }

  const TOKEN_PATTERN = /\[\[(\w+)[_:](\w+)\]\]/g;

  let {
    entry,
    sessionId,
    sessionEntities,
    onclose,
    onrefresh
  }: {
    entry: SessionEntry;
    sessionId: number;
    sessionEntities: SessionEntityOutput[];
    onclose: () => void;
    onrefresh: () => void;
  } = $props();

  let isInput = $derived(entry.entry_type === 'input');

  // View mode: for input entries toggle masked/original; for output entries toggle raw/decoded
  let viewMode: 'masked' | 'original' = $state('masked');
  let itemDetail: ItemDetail | null = $state(null);
  let loadingItem = $state(false);
  let decoding = $state(false);
  let copyFeedback = $state(false);

  // For input entries, load full item detail if source_item_id exists
  $effect(() => {
    if (isInput && entry.source_item_id != null) {
      loadItemDetail(entry.source_item_id);
    }
  });

  async function loadItemDetail(itemId: number) {
    loadingItem = true;
    try {
      itemDetail = await invoke<ItemDetail>('get_item', { itemId });
    } catch (err) {
      console.error('Failed to load item detail:', err);
    } finally {
      loadingItem = false;
    }
  }

  // Build a token → original_value map from session entities for highlighting
  let tokenMap = $derived.by(() => {
    const map = new Map<string, string>();
    for (const entity of sessionEntities) {
      map.set(entity.token, entity.original_value);
    }
    return map;
  });

  // Current content to display
  let displayContent = $derived.by(() => {
    if (isInput) {
      if (viewMode === 'masked') {
        // Show masked content from item detail or entry raw_content
        return itemDetail?.masked_content ?? entry.raw_content;
      } else {
        // Show original content from item detail
        return itemDetail?.raw_content ?? entry.raw_content;
      }
    } else {
      // Output entry
      if (viewMode === 'masked') {
        // Raw content with tokens
        return entry.raw_content;
      } else {
        // Decoded content
        return entry.decoded_content ?? entry.raw_content;
      }
    }
  });

  // Segments with token highlighting for masked/raw views
  interface ContentSegment {
    text: string;
    isToken: boolean;
    originalValue?: string;
  }

  let contentSegments = $derived.by((): ContentSegment[] => {
    const text = displayContent;
    if (!text) return [];

    // Only highlight tokens in masked/raw views
    const shouldHighlight = viewMode === 'masked';

    if (!shouldHighlight) {
      return [{ text, isToken: false }];
    }

    TOKEN_PATTERN.lastIndex = 0;
    const segments: ContentSegment[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = TOKEN_PATTERN.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ text: text.substring(lastIndex, match.index), isToken: false });
      }

      const token = match[0];
      const original = tokenMap.get(token);
      segments.push({ text: token, isToken: true, originalValue: original });
      lastIndex = match.index + token.length;
    }

    if (lastIndex < text.length) {
      segments.push({ text: text.substring(lastIndex), isToken: false });
    }

    return segments.length ? segments : [{ text, isToken: false }];
  });

  let hasDecoded = $derived(entry.decoded_content != null);
  let showDecodeButton = $derived(!isInput && !hasDecoded);

  async function handleDecode() {
    decoding = true;
    try {
      await invoke('decode_session_entry', { sessionId, entryId: entry.id });
      onrefresh();
    } catch (err) {
      console.error('Failed to decode entry:', err);
    } finally {
      decoding = false;
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(displayContent);
      copyFeedback = true;
      setTimeout(() => { copyFeedback = false; }, 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onclose();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('entry-popup-overlay')) {
      onclose();
    }
  }

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const h = date.getHours();
    const min = String(date.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${m}/${d} ${h12}:${min} ${ampm}`;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="entry-popup-overlay" onclick={handleBackdropClick} role="presentation">
  <div class="entry-popup" role="dialog" aria-modal="true">
    <div class="popup-header">
      <span class="header-icon" class:header-icon-input={isInput} class:header-icon-output={!isInput}>
        {#if isInput}
          <PixelIcon name="file" size={18} />
        {:else}
          <PixelIcon name="sessions" size={18} />
        {/if}
      </span>
      <span class="header-label">
        {isInput ? 'Input Entry' : 'LLM Response'}
      </span>
      <span class="header-time">{formatTime(entry.created_at)}</span>
      <button class="popup-close" onclick={onclose} aria-label="Close">
        <PixelIcon name="close" size={20} />
      </button>
    </div>

    <div class="popup-toolbar">
      <div class="view-toggle">
        <button
          class="toggle-btn"
          class:toggle-btn-active={viewMode === 'masked'}
          onclick={() => { viewMode = 'masked'; }}
        >
          {isInput ? 'Masked' : 'Raw'}
        </button>
        <button
          class="toggle-btn"
          class:toggle-btn-active={viewMode === 'original'}
          onclick={() => { viewMode = 'original'; }}
          disabled={!isInput && !hasDecoded}
        >
          {isInput ? 'Original' : 'Decoded'}
        </button>
      </div>

      <div class="toolbar-actions">
        {#if showDecodeButton}
          <button class="toolbar-btn decode-btn" onclick={handleDecode} disabled={decoding}>
            {#if decoding}
              <div class="btn-spinner"></div>
            {/if}
            Decode
          </button>
        {/if}
        <button class="toolbar-btn" onclick={handleCopy}>
          {copyFeedback ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>

    {#if loadingItem && isInput}
      <div class="popup-content popup-loading">
        <div class="spinner"></div>
        <p>Loading file content...</p>
      </div>
    {:else}
      <div class="popup-content">{#each contentSegments as seg}{#if seg.isToken}<span
              class="token-highlight"
              class:token-known={seg.originalValue != null}
              data-tooltip={seg.originalValue ? `→ ${seg.originalValue}` : 'Unknown token'}
            >{seg.text}</span>{:else}{seg.text}{/if}{/each}</div>
    {/if}
  </div>
</div>

<style>
.entry-popup-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.entry-popup {
  width: 90%;
  height: 90%;
  background: var(--bg-surface);
  border: 2px solid var(--border);
  border-radius: 0px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.popup-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.header-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.header-icon-input {
  color: var(--accent-orange);
}

.header-icon-output {
  color: var(--color-grim-blue);
}

.header-label {
  font-family: 'Geist Pixel', monospace;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex: 1;
}

.header-time {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.popup-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.popup-close:hover {
  color: var(--text-primary);
}

/* Toolbar */
.popup-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.view-toggle {
  display: flex;
  background-color: var(--bg-elevated);
  border-radius: 0px;
  padding: 2px;
  border: 2px solid var(--border);
}

.toggle-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 0px;
  background: none;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
  font-family: 'Geist Pixel', monospace;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.toggle-btn:hover:not(.toggle-btn-active):not(:disabled) {
  color: var(--text-primary);
}

.toggle-btn-active {
  background-color: var(--accent-orange);
  color: #fff;
}

.toggle-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.toolbar-btn {
  padding: 6px 14px;
  border: 2px solid var(--border);
  border-radius: 0px;
  background: var(--bg-surface);
  font-size: 10px;
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
  font-family: 'Geist Pixel', monospace;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  transition: background-color 0.15s, border-color 0.15s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.toolbar-btn:hover:not(:disabled) {
  background-color: var(--bg-elevated);
  border-color: var(--border-accent);
}

.toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.decode-btn {
  border-color: var(--color-grim-blue);
  color: var(--color-grim-blue);
}

.decode-btn:hover:not(:disabled) {
  background-color: rgba(96, 165, 200, 0.1);
  border-color: var(--color-grim-blue);
}

.btn-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--border);
  border-top-color: var(--color-grim-blue);
  border-radius: 50%;
  animation: spin 0.8s steps(8) infinite;
}

/* Content */
.popup-content {
  flex: 1;
  margin: 0;
  padding: 16px;
  overflow: auto;
  font-family: 'Geist Mono', 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--text-primary);
  text-align: start;
}

.popup-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
  font-size: 14px;
}

.popup-loading p {
  margin: 0;
}

/* Token highlighting */
.token-highlight {
  border-radius: 2px;
  padding: 1px 3px;
  cursor: help;
  position: relative;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.token-known {
  background-color: rgba(232, 117, 26, 0.16);
  border-bottom: 2px solid var(--accent-orange);
}

.token-highlight:not(.token-known) {
  background-color: rgba(128, 128, 128, 0.12);
  border-bottom: 2px solid var(--text-muted);
}

.token-highlight:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 8px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 400;
  border-radius: 0px;
  border: 1px solid var(--border);
  white-space: nowrap;
  z-index: 60;
  pointer-events: none;
}

/* Spinner */
.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border);
  border-top-color: var(--accent-orange);
  border-radius: 50%;
  animation: spin 0.8s steps(8) infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
