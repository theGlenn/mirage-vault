<script lang="ts">
  import PixelIcon from './PixelIcon.svelte';

  export interface SessionEntry {
    id: number;
    entry_type: string;
    source_item_id: number | null;
    raw_content: string;
    decoded_content: string | null;
    created_at: string;
  }

  let {
    entry,
    itemName,
    onselect
  }: {
    entry: SessionEntry;
    itemName?: string;
    onselect: (id: number) => void;
  } = $props();

  let isInput = $derived(entry.entry_type === 'input');

  let label = $derived(
    isInput
      ? (itemName || 'Pasted text')
      : 'LLM Response'
  );

  let previewContent = $derived.by(() => {
    const text = (!isInput && entry.decoded_content) ? entry.decoded_content : entry.raw_content;
    if (!text) return '';
    return text.length > 150 ? text.slice(0, 150) + '...' : text;
  });

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

  function handleClick() {
    onselect(entry.id);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="entry-card"
  class:entry-card-input={isInput}
  class:entry-card-output={!isInput}
  onclick={handleClick}
>
  <div class="entry-header">
    <span class="entry-icon">
      {#if isInput}
        <PixelIcon name="file" size={16} />
      {:else}
        <PixelIcon name="sessions" size={16} />
      {/if}
    </span>
    <span class="entry-label">{label}</span>
    {#if !isInput && !entry.decoded_content}
      <span class="not-decoded-badge">Not decoded</span>
    {/if}
    <span class="entry-time">{formatTime(entry.created_at)}</span>
  </div>

  {#if previewContent}
    <div class="entry-preview">{previewContent}</div>
  {/if}
</div>

<style>
.entry-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  background: var(--bg-surface);
  border: 2px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}

.entry-card:hover {
  background: var(--bg-elevated);
}

.entry-card-input {
  border-color: var(--color-light-orange);
}

.entry-card-output {
  border-color: var(--color-grim-blue);
}

/* Header */
.entry-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.entry-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.entry-card-input .entry-icon {
  color: var(--color-orange);
}

.entry-card-output .entry-icon {
  color: var(--color-grim-blue);
}

.entry-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.not-decoded-badge {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.02em;
  white-space: nowrap;
  flex-shrink: 0;
  color: var(--text-muted);
  background: rgba(128, 128, 128, 0.12);
  border: 1px solid var(--text-muted);
}

.entry-time {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

/* Preview */
.entry-preview {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  word-break: break-word;
}
</style>
