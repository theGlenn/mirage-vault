<script lang="ts">
  import PixelIcon from './PixelIcon.svelte';
  import type { IconName } from './PixelIcon.svelte';

  export interface VaultItem {
    id: number;
    name: string;
    file_type: string;
    entity_count: number;
    created_at: string;
    warning: string | null;
  }

  let {
    item,
    onselect,
    ondelete
  }: {
    item: VaultItem;
    onselect: (id: number) => void;
    ondelete: (item: VaultItem) => void;
  } = $props();

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

  function handleClick() {
    onselect(item.id);
  }

  function handleDelete(e: MouseEvent) {
    e.stopPropagation();
    ondelete(item);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="file-card" onclick={handleClick}>
  <button class="file-card-delete" onclick={handleDelete} aria-label="Delete {item.name}">
    <PixelIcon name="trash" size={16} />
  </button>
  <div class="file-card-icon">
    <PixelIcon name={getFileIcon(item.file_type)} size={32} />
  </div>
  <div class="file-card-name">
    {#if item.warning}
      <PixelIcon name="alert" size={14} />
    {/if}
    <span class="file-card-name-text">{item.name}</span>
  </div>
  <div class="file-card-meta">
    <span class="file-card-entities">{item.entity_count} entities</span>
    <span class="file-card-type">.{item.file_type}</span>
  </div>
  <div class="file-card-date">{formatDate(item.created_at)}</div>
</div>

<style>
.file-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: var(--bg-surface);
  border: 2px solid var(--border);
  border-radius: 0px;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
  text-align: left;
  font-family: inherit;
  color: inherit;
  width: 100%;
}

.file-card:hover {
  background: var(--bg-elevated);
  border-left: 4px solid var(--border-accent);
}

.file-card-delete {
  position: absolute;
  top: 8px;
  right: 8px;
  display: none;
  padding: 4px;
  border: none;
  border-radius: 0px;
  background: none;
  color: var(--accent-red);
  cursor: pointer;
  font-family: inherit;
}

.file-card:hover .file-card-delete {
  display: block;
}

.file-card-delete:hover {
  background: var(--bg-surface);
}

.file-card-icon {
  color: var(--text-secondary);
}

.file-card-name {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
}

.file-card-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.file-card-entities {
  color: var(--accent-yellow);
  font-weight: 500;
}

.file-card-type {
  color: var(--text-muted);
  font-size: 11px;
  padding: 1px 6px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
}

.file-card-date {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
