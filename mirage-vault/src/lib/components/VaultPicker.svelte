<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { onMount } from 'svelte';
  import PixelIcon from './PixelIcon.svelte';
  import type { VaultItem } from './FileCard.svelte';

  let {
    sessionItemIds,
    onselect,
    onclose
  }: {
    sessionItemIds: Set<number>;
    onselect: (itemId: number) => void;
    onclose: () => void;
  } = $props();

  let allItems: VaultItem[] = $state([]);
  let loading = $state(true);
  let addingId: number | null = $state(null);

  let availableItems = $derived(
    allItems.filter(item => !sessionItemIds.has(item.id) && item.status === 'done')
  );

  async function loadItems() {
    loading = true;
    try {
      allItems = await invoke<VaultItem[]>('list_items');
    } catch (err) {
      console.error('Failed to load vault items:', err);
    } finally {
      loading = false;
    }
  }

  async function handleSelect(itemId: number) {
    if (addingId != null) return;
    addingId = itemId;
    try {
      onselect(itemId);
    } finally {
      addingId = null;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onclose();
    }
  }

  onMount(() => {
    loadItems();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="picker-overlay" onclick={onclose} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="picker-dialog" onclick={(e: MouseEvent) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
    <div class="picker-header">
      <h3 class="picker-title">Add from Vault</h3>
      <button class="picker-close" onclick={onclose} aria-label="Close">
        <PixelIcon name="close" size={16} />
      </button>
    </div>

    <div class="picker-body">
      {#if loading}
        <div class="picker-loading">
          <div class="spinner"></div>
          <p>Loading vault items...</p>
        </div>
      {:else if availableItems.length === 0}
        <div class="picker-empty">
          <PixelIcon name="folder" size={28} />
          <p>No available items to add. All vault items are already in this session or still processing.</p>
        </div>
      {:else}
        <div class="picker-list">
          {#each availableItems as item (item.id)}
            <button
              class="picker-item"
              class:picker-item-adding={addingId === item.id}
              onclick={() => handleSelect(item.id)}
              disabled={addingId != null}
            >
              <div class="picker-item-icon">
                <PixelIcon name="file" size={18} />
              </div>
              <div class="picker-item-info">
                <span class="picker-item-name">{item.name}</span>
                <span class="picker-item-meta">
                  .{item.file_type} &middot; {item.entity_count} entities
                </span>
              </div>
              <div class="picker-item-action">
                {#if addingId === item.id}
                  <div class="spinner-sm"></div>
                {:else}
                  <span class="picker-add-label">Add</span>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
.picker-overlay {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--bg-primary) 60%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.picker-dialog {
  background: var(--bg-surface);
  border: 2px solid var(--border);
  border-radius: 0px;
  width: 90%;
  max-width: 480px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 2px solid var(--border);
  flex-shrink: 0;
}

.picker-title {
  margin: 0;
  font-family: 'Geist Pixel', monospace;
  font-size: 10px;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.picker-close {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 0px;
}

.picker-close:hover {
  color: var(--text-primary);
  background: var(--bg-elevated);
}

.picker-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.picker-loading,
.picker-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px 16px;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
}

.picker-empty p,
.picker-loading p {
  margin: 0;
  max-width: 280px;
  line-height: 1.5;
}

.picker-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.picker-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-elevated);
  border: 2px solid transparent;
  border-radius: 0px;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: border-color 0.15s, background-color 0.15s;
}

.picker-item:hover:not(:disabled) {
  border-color: var(--color-orange);
  background: var(--bg-surface);
}

.picker-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.picker-item-adding {
  border-color: var(--color-orange);
}

.picker-item-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.picker-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.picker-item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-item-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.picker-item-action {
  flex-shrink: 0;
}

.picker-add-label {
  font-family: 'Geist Pixel', monospace;
  font-size: 10px;
  color: var(--color-orange);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-top-color: var(--color-orange);
  border-radius: 50%;
  animation: spin 0.8s steps(8) infinite;
}

.spinner-sm {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--color-orange);
  border-radius: 50%;
  animation: spin 0.8s steps(8) infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
