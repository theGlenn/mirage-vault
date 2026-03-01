<script lang="ts" module>
  import type { ItemDetail } from '$lib/components/FileViewer.svelte';
  import type { VaultItem } from '$lib/components/FileCard.svelte';
  import {
    BASE_ENTITY_TYPE_ORDER,
    normalizeEntityTypeName as normalizeEntityTypeNameForGrouping
  } from '$lib/entityColors';

  const ENTITY_TYPE_LABELS: Record<string, string> = {
    EMAIL: 'Email',
    PERSON: 'Person',
    ORG: 'Organization',
    AMT: 'Amount',
    PHONE: 'Phone',
    API_KEY: 'API Key'
  };
  const ORDERED_BASE_ENTITY_TYPES: string[] = [...BASE_ENTITY_TYPE_ORDER];

  export interface EntityGroupItem {
    original_value: string;
    token: string;
    count: number;
  }

  export interface EntityGroup {
    type: string;
    label: string;
    items: EntityGroupItem[];
  }

  export function groupEntitiesByType(entities: ItemDetail['entities']): EntityGroup[] {
    const groups: Map<string, Map<string, EntityGroupItem>> = new Map();
    for (const e of entities) {
      const type = normalizeEntityTypeNameForGrouping(e.entity_type);
      if (!type) continue;
      if (!groups.has(type)) {
        groups.set(type, new Map());
      }
      const typeMap = groups.get(type)!;
      if (typeMap.has(e.token)) {
        typeMap.get(e.token)!.count++;
      } else {
        typeMap.set(e.token, { original_value: e.original_value, token: e.token, count: 1 });
      }
    }

    const extraTypes = Array.from(groups.keys())
      .filter((type) => !ORDERED_BASE_ENTITY_TYPES.includes(type))
      .sort((a, b) => a.localeCompare(b));
    const orderedTypes = [...ORDERED_BASE_ENTITY_TYPES, ...extraTypes];

    const result: EntityGroup[] = [];
    for (const type of orderedTypes) {
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
</script>

<script lang="ts">
  import PixelIcon from './PixelIcon.svelte';
  import {
    createEntityTypeColorMap,
    normalizeEntityTypeName as normalizeEntityTypeNameForSwatch
  } from '$lib/entityColors';

  let { activeView, selectedItem, items, onrequestdeletecustomtype }: {
    activeView: 'browse' | 'sessions' | 'settings';
    selectedItem: ItemDetail | null;
    items: VaultItem[];
    onrequestdeletecustomtype: (entityType: string) => void;
  } = $props();

  let totalEntities = $derived(items.reduce((sum, item) => sum + item.entity_count, 0));

  let fileTypeBreakdown = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const ext = item.file_type || 'unknown';
      counts.set(ext, (counts.get(ext) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  });

  let entityTypeColorMap = $derived.by(() => {
    if (!selectedItem) return createEntityTypeColorMap([]);
    return createEntityTypeColorMap(selectedItem.entities.map((entity) => entity.entity_type));
  });

  function getSwatchStyle(type: string): string {
    const normalized = normalizeEntityTypeNameForSwatch(type);
    const rgb = entityTypeColorMap.get(normalized) ?? '107 114 128';
    return `background-color: rgb(${rgb} / 0.16); border-color: rgb(${rgb});`;
  }

  function canDeleteType(type: string): boolean {
    const normalized = normalizeEntityTypeNameForSwatch(type);
    return !ORDERED_BASE_ENTITY_TYPES.includes(normalized);
  }

</script>

{#if activeView === 'browse'}
  <aside class="sidebar sidebar-right">
    <div class="sidebar-header">
      <h2>{selectedItem ? 'ENTITIES' : 'VAULT'}</h2>
    </div>
    <div class="sidebar-content">
      {#if selectedItem}
        {#each groupEntitiesByType(selectedItem.entities) as group (group.type)}
          <div class="entity-group">
            <div class="entity-group-header">
              <div class="entity-group-header-left">
                <span class="entity-group-swatch" style={getSwatchStyle(group.type)}></span>
                {group.label}
              </div>
              {#if canDeleteType(group.type)}
                <button
                  class="entity-group-delete"
                  type="button"
                  onclick={() => onrequestdeletecustomtype(group.type)}
                  aria-label={`Delete custom type ${group.type}`}
                  title="Delete custom type"
                >
                  <PixelIcon name="trash" size={12} />
                </button>
              {/if}
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
      {:else if items.length > 0}
        <div class="vault-summary">
          <div class="summary-stat">
            <span class="summary-label">FILES</span>
            <span class="summary-value">{items.length}</span>
          </div>
          <div class="summary-stat">
            <span class="summary-label">ENTITIES</span>
            <span class="summary-value">{totalEntities}</span>
          </div>
          {#if fileTypeBreakdown.length > 0}
            <div class="summary-section">
              <span class="summary-section-label">BY TYPE</span>
              {#each fileTypeBreakdown as ft (ft.type)}
                <div class="type-row">
                  <span class="type-name">.{ft.type}</span>
                  <span class="type-count">{ft.count}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <p class="empty-state">No files in vault</p>
      {/if}
    </div>
  </aside>
{/if}

<style>
.sidebar {
  width: 240px;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  border-color: var(--border);
  background-color: var(--bg-secondary);
}

.sidebar-right {
  border-left: 1px solid var(--border);
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar-header h2 {
  margin: 0;
  font-family: 'Geist Pixel', monospace;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.empty-state {
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
  margin-top: 24px;
}

/* Entity groups */
.entity-group {
  margin-bottom: 16px;
}

.entity-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
}

.entity-group-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.entity-group-swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  border-bottom: 2px solid;
}

.entity-group-delete {
  border: 1px solid var(--border);
  border-radius: 6px;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-surface);
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
}

.entity-group-delete:hover {
  border-color: var(--accent-red);
  color: var(--accent-red);
  background: color-mix(in srgb, var(--accent-red) 12%, var(--bg-surface));
}

.entity-group-item {
  padding: 6px 0;
  border-bottom: 1px solid var(--bg-surface);
}

.entity-group-item:last-child {
  border-bottom: none;
}

.entity-group-item-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
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
  color: var(--text-muted);
  font-family: 'Geist Mono', 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
}

.entity-group-item-count {
  color: var(--text-muted);
  font-weight: 500;
}

/* Vault summary */
.vault-summary {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.summary-stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}

.summary-label {
  font-family: 'Geist Pixel', monospace;
  font-size: 8px;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
}

.summary-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--accent-yellow);
  font-family: 'Geist Mono', monospace;
}

.summary-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.summary-section-label {
  font-family: 'Geist Pixel', monospace;
  font-size: 8px;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.type-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.type-name {
  font-size: 13px;
  color: var(--text-primary);
  font-family: 'Geist Mono', monospace;
}

.type-count {
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 500;
}
</style>
