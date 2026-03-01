<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { onMount, tick } from 'svelte';
  import PixelIcon from './PixelIcon.svelte';
  import SessionEntryCard from './SessionEntryCard.svelte';
  import SessionEntryPopup from './SessionEntryPopup.svelte';
  import VaultPicker from './VaultPicker.svelte';

  interface SessionEntryOutput {
    id: number;
    entry_type: string;
    source_item_id: number | null;
    raw_content: string;
    decoded_content: string | null;
    created_at: string;
  }

  interface SessionItemOutput {
    id: number;
    name: string;
    file_type: string;
    entity_count: number;
    added_at: string;
  }

  interface SessionDetailData {
    id: number;
    name: string;
    status: string;
    created_at: string;
    updated_at: string;
    entries: SessionEntryOutput[];
    items: SessionItemOutput[];
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
    entities: { id: number; entity_type: string; original_value: string; token: string; span_start: number; span_end: number }[];
  }

  let {
    sessionId,
    dragOver = false,
    onback,
    ondropfiles
  }: {
    sessionId: number;
    dragOver?: boolean;
    onback: () => void;
    ondropfiles?: (paths: string[]) => void;
  } = $props();

  let session: SessionDetailData | null = $state(null);
  let editingName = $state(false);
  let nameInput = $state('');
  let pasteText = $state('');
  let submitting = $state(false);
  let feedAreaEl: HTMLDivElement | undefined = $state(undefined);
  let showVaultPicker = $state(false);
  let linkingItem = $state(false);
  let selectedEntryId: number | null = $state(null);

  interface SessionEntityOutput {
    entity_type: string;
    original_value: string;
    token: string;
  }

  let sessionEntities: SessionEntityOutput[] = $state([]);

  // Set of item IDs already in this session
  let sessionItemIds = $derived.by(() => {
    if (!session) return new Set<number>();
    return new Set(session.items.map(item => item.id));
  });

  // Map source_item_id → item name for entry cards
  let itemNameMap = $derived.by(() => {
    if (!session) return new Map<number, string>();
    const map = new Map<number, string>();
    for (const item of session.items) {
      map.set(item.id, item.name);
    }
    return map;
  });

  // Entries sorted by created_at ascending (oldest first, newest at bottom)
  let sortedEntries = $derived.by(() => {
    if (!session) return [];
    return [...session.entries].sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
  });

  let submitDisabled = $derived(!pasteText.trim() || submitting);

  let selectedEntry = $derived.by(() => {
    if (selectedEntryId == null || !session) return null;
    return session.entries.find(e => e.id === selectedEntryId) ?? null;
  });

  async function loadSessionEntities() {
    try {
      sessionEntities = await invoke<SessionEntityOutput[]>('get_session_entities', { sessionId });
    } catch (err) {
      console.error('Failed to load session entities:', err);
    }
  }

  function handleEntrySelect(entryId: number) {
    selectedEntryId = entryId;
    loadSessionEntities();
  }

  async function handleEntryPopupRefresh() {
    await loadSession();
    await loadSessionEntities();
  }

  export async function loadSession() {
    session = await invoke<SessionDetailData>('get_session', { sessionId });
    nameInput = session.name;
  }

  async function saveName() {
    if (!session) return;
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === session.name) {
      nameInput = session.name;
      editingName = false;
      return;
    }
    await invoke('update_session', { sessionId: session.id, name: trimmed });
    await loadSession();
    editingName = false;
  }

  function handleNameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveName();
    } else if (e.key === 'Escape') {
      nameInput = session?.name ?? '';
      editingName = false;
    }
  }

  async function scrollToBottom() {
    await tick();
    if (feedAreaEl) {
      feedAreaEl.scrollTop = feedAreaEl.scrollHeight;
    }
  }

  async function handlePasteSubmit() {
    const text = pasteText.trim();
    if (!text || submitting) return;
    submitting = true;

    try {
      const entryId = await invoke<number>('add_session_entry', {
        sessionId,
        entryType: 'output',
        rawContent: text,
        sourceItemId: null
      });

      await invoke('decode_session_entry', { sessionId, entryId });

      await loadSession();
      pasteText = '';
      await scrollToBottom();
    } catch (err) {
      console.error('Failed to submit paste:', err);
    } finally {
      submitting = false;
    }
  }

  function handlePasteKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handlePasteSubmit();
    }
  }

  async function handleVaultItemSelect(itemId: number) {
    linkingItem = true;
    try {
      // Link item to session
      await invoke('add_item_to_session', { sessionId, itemId });

      // Reconcile tokens with session namespace
      await invoke('reconcile_item_tokens', { sessionId, itemId });

      // Get the item's masked content for the input entry
      const item = await invoke<ItemDetail>('get_item', { itemId });

      // Create an input entry with the masked content
      await invoke('add_session_entry', {
        sessionId,
        entryType: 'input',
        rawContent: item.masked_content,
        sourceItemId: itemId
      });

      // Refresh session data
      await loadSession();
      await scrollToBottom();
    } catch (err) {
      console.error('Failed to add vault item to session:', err);
    } finally {
      linkingItem = false;
      showVaultPicker = false;
    }
  }

  function handleDropZoneDragOver(e: DragEvent) {
    e.preventDefault();
  }

  function handleDropZoneDrop(e: DragEvent) {
    e.preventDefault();
    // HTML drag-drop for in-browser items — Tauri native drops are handled by +page.svelte
    if (e.dataTransfer?.files?.length) {
      const paths = Array.from(e.dataTransfer.files).map(f => f.name);
      // Note: HTML File API doesn't give full paths, Tauri native drop handler does
    }
  }

  onMount(() => {
    loadSession();
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="session-detail"
  class:session-detail-dragover={dragOver}
  ondragover={handleDropZoneDragOver}
  ondrop={handleDropZoneDrop}
  role="region"
  aria-label="Session detail"
>
  {#if session}
    <div class="session-header">
      <button class="back-btn" onclick={onback} aria-label="Back to sessions">
        <PixelIcon name="chevron-left" size={20} />
      </button>

      <div class="header-name-area">
        {#if editingName}
          <input
            class="name-input"
            type="text"
            bind:value={nameInput}
            onblur={saveName}
            onkeydown={handleNameKeydown}
          />
        {:else}
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
          <span class="session-name" onclick={() => { editingName = true; }} title="Click to rename">
            {session.name}
          </span>
        {/if}
      </div>

      <button
        class="add-files-btn"
        onclick={() => { showVaultPicker = true; }}
        disabled={linkingItem}
        aria-label="Add files to session"
      >
        <PixelIcon name="upload" size={14} />
        <span>Add Files</span>
      </button>

      {#if session.status === 'archived'}
        <span class="status-badge status-archived">archived</span>
      {:else}
        <span class="status-badge status-active">active</span>
      {/if}
    </div>

    <div class="feed-area" bind:this={feedAreaEl}>
      {#if sortedEntries.length === 0}
        <div class="feed-empty">
          <PixelIcon name="sessions" size={32} />
          <p>No entries yet. Add files or paste LLM output to get started.</p>
        </div>
      {:else}
        <div class="feed-list">
          {#each sortedEntries as entry (entry.id)}
            <SessionEntryCard
              {entry}
              itemName={entry.source_item_id != null ? itemNameMap.get(entry.source_item_id) : undefined}
              onselect={handleEntrySelect}
            />
          {/each}
        </div>
      {/if}
    </div>

    <div class="paste-input-area">
      <textarea
        class="paste-textarea"
        placeholder="Paste LLM response here to decode..."
        bind:value={pasteText}
        onkeydown={handlePasteKeydown}
        disabled={submitting}
        rows={3}
      ></textarea>
      <button
        class="paste-submit-btn"
        onclick={handlePasteSubmit}
        disabled={submitDisabled}
        aria-label="Submit for decoding"
      >
        {#if submitting}
          <div class="submit-spinner"></div>
        {:else}
          <PixelIcon name="chevron-right" size={18} />
        {/if}
      </button>
    </div>

    {#if dragOver}
      <div class="drop-overlay">
        <PixelIcon name="upload" size={40} />
        <p>Drop files to add to session</p>
      </div>
    {/if}

    {#if selectedEntry}
      <SessionEntryPopup
        entry={selectedEntry}
        {sessionId}
        {sessionEntities}
        onclose={() => { selectedEntryId = null; }}
        onrefresh={handleEntryPopupRefresh}
      />
    {/if}

    {#if showVaultPicker}
      <VaultPicker
        {sessionItemIds}
        onselect={handleVaultItemSelect}
        onclose={() => { showVaultPicker = false; }}
      />
    {/if}
  {:else}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading session...</p>
    </div>
  {/if}
</div>

<style>
.session-detail {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.session-detail-dragover {
  outline: 2px solid var(--accent-orange);
  outline-offset: -2px;
}

/* Header */
.session-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 2px solid var(--border);
  background: var(--bg-secondary);
  flex-shrink: 0;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.15s, background-color 0.15s;
}

.back-btn:hover {
  color: var(--text-primary);
  background: var(--bg-elevated);
}

.header-name-area {
  flex: 1;
  min-width: 0;
}

.session-name {
  font-family: 'Geist Pixel', monospace;
  font-size: 10px;
  color: var(--text-primary);
  cursor: text;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.session-name:hover {
  color: var(--accent-orange);
}

.name-input {
  width: 100%;
  border: 2px solid var(--accent-orange);
  border-radius: 6px;
  padding: 4px 8px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-family: 'Geist Pixel', monospace;
  font-size: 10px;
  box-sizing: border-box;
  outline: none;
}

/* Add Files button */
.add-files-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 2px solid var(--border);
  border-radius: 0px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 10px;
  font-family: 'Geist Pixel', monospace;
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 0.15s, background-color 0.15s, color 0.15s;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.add-files-btn:hover:not(:disabled) {
  border-color: var(--accent-orange);
  color: var(--accent-orange);
  background: var(--bg-elevated);
}

.add-files-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Status badge */
.status-badge {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: 0.02em;
  white-space: nowrap;
  flex-shrink: 0;
}

.status-active {
  color: var(--accent-orange);
  background: rgba(232, 117, 26, 0.12);
  border: 1px solid var(--accent-orange);
}

.status-archived {
  color: var(--text-muted);
  background: rgba(128, 128, 128, 0.12);
  border: 1px solid var(--text-muted);
}

/* Feed area */
.feed-area {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding-bottom: 100px;
}

.feed-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
}

/* Paste input area */
.paste-input-area {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 16px;
  background: color-mix(in srgb, var(--bg-surface) 80%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-top: 1px solid var(--border);
  z-index: 10;
}

.paste-textarea {
  flex: 1;
  background: var(--bg-elevated);
  border: 2px solid var(--border);
  border-radius: 0px;
  padding: 8px 12px;
  color: var(--text-primary);
  font-family: 'Geist Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
  min-height: 40px;
  max-height: 150px;
  outline: none;
  transition: border-color 0.15s;
}

.paste-textarea::placeholder {
  color: var(--text-muted);
}

.paste-textarea:focus {
  border-color: var(--accent-orange);
}

.paste-textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.paste-submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 2px solid var(--accent-orange);
  border-radius: 0px;
  background: var(--accent-orange);
  color: var(--bg-primary);
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s, background-color 0.15s;
}

.paste-submit-btn:hover:not(:disabled) {
  background: var(--accent-red);
  border-color: var(--accent-red);
}

.paste-submit-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.submit-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--bg-primary);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s steps(8) infinite;
}

/* Drop zone overlay */
.drop-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: color-mix(in srgb, var(--bg-primary) 85%, transparent);
  border: 2px dashed var(--accent-orange);
  color: var(--accent-orange);
  font-family: 'Geist Pixel', monospace;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  z-index: 40;
  pointer-events: none;
  animation: pulse-border 1.5s ease-in-out infinite;
}

.drop-overlay p {
  margin: 0;
}

@keyframes pulse-border {
  0%, 100% { border-color: var(--accent-orange); }
  50% { border-color: var(--accent-yellow); }
}

.feed-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
  padding: 48px 32px;
}

.feed-empty p {
  margin: 0;
  max-width: 300px;
  line-height: 1.5;
}

/* Loading */
.loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
  font-size: 14px;
}

.loading p {
  margin: 0;
}

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
