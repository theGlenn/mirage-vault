<script lang="ts">
  import PixelIcon from './PixelIcon.svelte';

  interface EntityDetail {
    id: number;
    entity_type: string;
    original_value: string;
    token: string;
    span_start: number;
    span_end: number;
  }

  export interface ItemDetail {
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

  interface TextSegment {
    text: string;
    entity?: EntityDetail;
  }

  interface ContentBlock {
    type: 'content' | 'marker';
    text: string;
    start: number;
    end: number;
  }

  const ENTITY_TYPE_LABELS: Record<string, string> = {
    EMAIL: 'Email',
    PERSON: 'Person',
    ORG: 'Organization',
    AMT: 'Amount',
    PHONE: 'Phone',
    API_KEY: 'API Key'
  };

  const MASK_TOKEN_PATTERN = /\[\[[A-Z_]+:[A-Za-z0-9]+\]\]/g;
  const MASK_ASCII_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?/';

  function normalizeToken(token: string): string {
    return token.trim().toLowerCase();
  }

  function extractHashFromToken(token: string): string | null {
    const tokenMatch = token.match(/\[\[[A-Z_]+:([A-Za-z0-9]+)\]\]/i);
    if (tokenMatch?.[1]) {
      return tokenMatch[1].toLowerCase();
    }

    const raw = token.trim();
    if (/^[A-Za-z0-9]{8}$/.test(raw)) {
      return raw.toLowerCase();
    }

    return null;
  }

  function hashString(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash) + input.charCodeAt(i);
      hash |= 0;
    }
    return hash >>> 0;
  }

  function obfuscateAscii(seedInput: string, desiredLength: number): string {
    const length = Math.max(6, Math.min(desiredLength, 24));
    let seed = hashString(seedInput) || 0x9e3779b9;
    let output = '';

    for (let i = 0; i < length; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const idx = Math.abs(seed) % MASK_ASCII_CHARS.length;
      output += MASK_ASCII_CHARS[idx];
    }

    return output;
  }

  function buildMaskedSegments(text: string, entities: EntityDetail[]): TextSegment[] {
    MASK_TOKEN_PATTERN.lastIndex = 0;

    const byToken = new Map<string, EntityDetail[]>();
    const byHash = new Map<string, EntityDetail[]>();
    for (const entity of entities) {
      const normalized = normalizeToken(entity.token);
      const tokenQueue = byToken.get(normalized) ?? [];
      tokenQueue.push(entity);
      byToken.set(normalized, tokenQueue);

      const hash = extractHashFromToken(entity.token);
      if (hash) {
        const hashQueue = byHash.get(hash) ?? [];
        hashQueue.push(entity);
        byHash.set(hash, hashQueue);
      }
    }

    const segments: TextSegment[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = MASK_TOKEN_PATTERN.exec(text)) !== null) {
      const token = match[0];
      if (match.index > lastIndex) {
        segments.push({ text: text.substring(lastIndex, match.index) });
      }

      const normalizedToken = normalizeToken(token);
      const tokenQueue = byToken.get(normalizedToken);
      let entity = tokenQueue?.shift();

      if (!entity) {
        const hash = extractHashFromToken(token);
        if (hash) {
          const hashQueue = byHash.get(hash);
          entity = hashQueue?.shift();
        }
      }

      const sourceLength = entity?.original_value.length || token.length;
      const obfuscated = obfuscateAscii(`${token}|${entity?.original_value ?? ''}`, sourceLength);
      segments.push({ text: obfuscated, entity });
      lastIndex = match.index + token.length;
    }

    if (lastIndex < text.length) {
      segments.push({ text: text.substring(lastIndex) });
    }

    return segments.length ? segments : [{ text }];
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

  let {
    selectedItem,
    viewMode,
    onclose,
    oncopy,
    onexport,
    onexportpdf,
    ontoggleviewmode
  }: {
    selectedItem: ItemDetail;
    viewMode: 'masked' | 'original';
    onclose: () => void;
    oncopy: () => void;
    onexport: () => void;
    onexportpdf: () => void;
    ontoggleviewmode: (mode: 'masked' | 'original') => void;
  } = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onclose();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('fileviewer-overlay')) {
      onclose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="fileviewer-overlay" onclick={handleBackdropClick} role="presentation">
  <div class="fileviewer-popup" role="dialog" aria-modal="true">
    <div class="fileviewer-header">
      <h2 class="fileviewer-title">{selectedItem.name}</h2>
      <button class="fileviewer-close" onclick={onclose} aria-label="Close">
        <PixelIcon name="close" size={20} />
      </button>
    </div>

    <div class="fileviewer-toolbar">
      <div class="view-toggle">
        <button
          class="toggle-btn"
          class:toggle-btn-active={viewMode === 'masked'}
          onclick={() => ontoggleviewmode('masked')}
        >Masked</button>
        <button
          class="toggle-btn"
          class:toggle-btn-active={viewMode === 'original'}
          onclick={() => ontoggleviewmode('original')}
        >Original</button>
      </div>
      <div class="toolbar-actions">
        <button class="toolbar-btn" onclick={oncopy}>Copy</button>
        <button class="toolbar-btn" onclick={onexport}>Export</button>
        {#if selectedItem.file_type === 'pdf' && selectedItem.raw_pdf_bytes}
          <button class="toolbar-btn" onclick={onexportpdf}>Export PDF</button>
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
        <PixelIcon name="alert" size={16} />
        <span>{selectedItem.warning}</span>
      </div>
    {/if}

    {#if viewMode === 'masked'}
      <div class="viewer-content">{#each splitByPageMarkers(selectedItem.masked_content) as seg}{#if seg.type === 'marker'}<div class="page-marker">{seg.text}</div>{:else}{#each buildMaskedSegments(seg.text, selectedItem.entities) as segment}{#if segment.entity}<span class="entity-highlight masked-obfuscated entity-{segment.entity.entity_type.toLowerCase()}" data-tooltip="{'\u2192'} {segment.entity.original_value}">{segment.text}</span>{:else}{segment.text}{/if}{/each}{/if}{/each}</div>
    {:else}
      <div class="viewer-content">{#each splitByPageMarkers(selectedItem.raw_content) as seg}{#if seg.type === 'marker'}<div class="page-marker">{seg.text}</div>{:else}{#each buildHighlightedSegments(seg.text, getEntitiesForBlock(selectedItem.entities, seg)) as segment}{#if segment.entity}<span class="entity-highlight entity-{segment.entity.entity_type.toLowerCase()}" data-tooltip="{'\u2192'} {segment.entity.token}">{segment.text}</span>{:else}{segment.text}{/if}{/each}{/if}{/each}</div>
    {/if}
  </div>
</div>

<style>
.fileviewer-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.fileviewer-popup {
  width: 90%;
  height: 90%;
  background: var(--bg-surface);
  border: 2px solid var(--border);
  border-radius: 0px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.fileviewer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.fileviewer-title {
  margin: 0;
  font-family: 'Press Start 2P', monospace;
  font-size: 10px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 12px;
}

.fileviewer-close {
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

.fileviewer-close:hover {
  color: var(--text-primary);
}

.fileviewer-toolbar {
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
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
  font-family: inherit;
}

.toggle-btn:hover:not(.toggle-btn-active) {
  color: var(--text-primary);
}

.toggle-btn-active {
  background-color: var(--accent-orange);
  color: #fff;
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
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
  font-family: inherit;
  transition: background-color 0.15s, border-color 0.15s;
}

.toolbar-btn:hover {
  background-color: var(--bg-elevated);
  border-color: var(--border-accent);
}

.entity-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
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
  border-radius: 0px;
  border-bottom: 2px solid;
}

.warning-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background-color: rgba(245, 158, 11, 0.15);
  border-bottom: 1px solid var(--accent-yellow);
  font-size: 13px;
  color: var(--accent-yellow);
  flex-shrink: 0;
}

.viewer-content {
  flex: 1;
  margin: 0;
  padding: 16px;
  overflow: auto;
  font-family: 'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--text-primary);
}

.page-marker {
  text-align: center;
  color: var(--text-muted);
  padding: 8px 0;
  margin: 8px 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  font-family: 'Press Start 2P', monospace;
  font-size: 8px;
  letter-spacing: 0.04em;
  white-space: normal;
}

.entity-highlight {
  border-radius: 0px;
  padding: 1px 2px;
  cursor: help;
  position: relative;
  border-bottom: 2px solid;
}

.masked-obfuscated {
  letter-spacing: 0.04em;
  font-weight: 600;
}

.entity-highlight:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 8px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 11px;
  border-radius: 0px;
  border: 1px solid var(--border);
  white-space: nowrap;
  z-index: 60;
  pointer-events: none;
}

.entity-email { background-color: rgba(37, 99, 235, 0.15); border-bottom-color: var(--entity-email); }
.entity-person { background-color: rgba(22, 163, 74, 0.15); border-bottom-color: var(--entity-person); }
.entity-org { background-color: rgba(234, 88, 12, 0.15); border-bottom-color: var(--entity-org); }
.entity-amt { background-color: rgba(220, 38, 38, 0.15); border-bottom-color: var(--entity-amt); }
.entity-phone { background-color: rgba(147, 51, 234, 0.15); border-bottom-color: var(--entity-phone); }
.entity-api_key { background-color: rgba(107, 114, 128, 0.15); border-bottom-color: var(--entity-api-key); }
</style>
