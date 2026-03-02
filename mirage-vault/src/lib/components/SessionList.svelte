<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { onMount } from 'svelte';
  import PixelIcon from './PixelIcon.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';

  export interface SessionSummary {
    id: number;
    name: string;
    status: string;
    item_count: number;
    entry_count: number;
    created_at: string;
    updated_at: string;
  }

  let {
    onselectsession
  }: {
    onselectsession: (id: number) => void;
  } = $props();

  let sessions: SessionSummary[] = $state([]);
  let confirmDeleteSession: SessionSummary | null = $state(null);

  let sortedSessions = $derived.by(() => {
    const active = sessions.filter(s => s.status === 'active');
    const archived = sessions.filter(s => s.status === 'archived');
    return [...active, ...archived];
  });

  async function refreshSessions() {
    sessions = await invoke<SessionSummary[]>('list_sessions');
  }

  async function createSession() {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const name = `Session — ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const id = await invoke<number>('create_session', { name });
    onselectsession(id);
  }

  async function archiveSession(session: SessionSummary) {
    if (session.status === 'archived') {
      await invoke('unarchive_session', { sessionId: session.id });
    } else {
      await invoke('archive_session', { sessionId: session.id });
    }
    await refreshSessions();
  }

  async function deleteSession(session: SessionSummary) {
    await invoke('delete_session', { sessionId: session.id });
    confirmDeleteSession = null;
    await refreshSessions();
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

  onMount(() => {
    refreshSessions();
  });
</script>

{#if sessions.length === 0}
  <div class="empty-state">
    <div class="empty-icon">
      <PixelIcon name="sessions" size={48} />
    </div>
    <p class="empty-text">No sessions yet</p>
    <p class="empty-hint">Create a session to group files and decode LLM responses</p>
    <button class="action-btn" onclick={createSession}>
      New Session
    </button>
  </div>
{:else}
  <div class="session-browser">
    <div class="toolbar">
      <button class="action-btn" onclick={createSession}>
        <PixelIcon name="sessions" size={16} />
        <span>New Session</span>
      </button>
    </div>
    <div class="session-grid">
      {#each sortedSessions as session (session.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div
          class="session-card"
          class:session-card-archived={session.status === 'archived'}
          onclick={() => onselectsession(session.id)}
        >
          <div class="session-card-header">
            <span class="session-card-name">{session.name}</span>
            {#if session.status === 'archived'}
              <span class="session-status-badge session-status-archived">archived</span>
            {:else}
              <span class="session-status-badge session-status-active">active</span>
            {/if}
          </div>

          <div class="session-card-meta">
            <span class="session-card-count">{session.item_count} file{session.item_count !== 1 ? 's' : ''}</span>
            <span class="session-card-separator">&middot;</span>
            <span class="session-card-count">{session.entry_count} entr{session.entry_count !== 1 ? 'ies' : 'y'}</span>
          </div>

          <div class="session-card-date">
            Updated {formatDate(session.updated_at)}
          </div>

          <div class="session-card-actions">
            <button
              class="card-action-btn"
              onclick={(e: MouseEvent) => { e.stopPropagation(); archiveSession(session); }}
              aria-label={session.status === 'archived' ? 'Unarchive' : 'Archive'}
              title={session.status === 'archived' ? 'Unarchive' : 'Archive'}
            >
              <PixelIcon name={session.status === 'archived' ? 'unlock' : 'lock'} size={14} />
            </button>
            <button
              class="card-action-btn card-action-delete"
              onclick={(e: MouseEvent) => { e.stopPropagation(); confirmDeleteSession = session; }}
              aria-label="Delete session"
              title="Delete"
            >
              <PixelIcon name="trash" size={14} />
            </button>
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}

{#if confirmDeleteSession}
  <ConfirmDialog
    message="Delete session <strong>{confirmDeleteSession.name}</strong>? All entries will be removed. Files in the vault will not be affected."
    confirmLabel="Delete"
    cancelLabel="Cancel"
    onconfirm={() => confirmDeleteSession && deleteSession(confirmDeleteSession)}
    oncancel={() => confirmDeleteSession = null}
  />
{/if}

<style>
/* Empty state */
.empty-state {
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
}

.empty-icon {
  color: var(--text-muted);
}

.empty-text {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: var(--text-secondary);
  font-family: 'Geist Pixel', monospace;
}

.empty-hint {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}

/* Action button */
.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 2px solid var(--color-light-orange);
  border-radius: 8px;
  background-color: var(--color-orange);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: 'Geist Pixel', monospace;
  transition: background-color 0.2s;
}

.action-btn:hover {
  background-color: var(--accent-deep);
  border-color: var(--accent-deep);
}

/* Session browser */
.session-browser {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  position: relative;
}

.toolbar {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-bottom: 2px solid var(--border);
}

.session-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  padding: 20px;
  padding-bottom: 60px;
}

/* Session card */
.session-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: var(--bg-surface);
  border: 2px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}

.session-card:hover {
  background: var(--bg-elevated);
  border-color: var(--border-accent);
}

.session-card-archived {
  opacity: 0.55;
}

.session-card-archived:hover {
  opacity: 0.75;
}

/* Card header */
.session-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.session-card-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

/* Status badge */
.session-status-badge {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.session-status-active {
  color: var(--color-orange);
  background: color-mix(in srgb, var(--color-orange) 12%, transparent);
  border: 1px solid var(--color-light-orange);
}

.session-status-archived {
  color: var(--text-muted);
  background: rgba(128, 128, 128, 0.12);
  border: 1px solid var(--text-muted);
}

/* Card meta */
.session-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.session-card-count {
  color: var(--accent-yellow);
  font-weight: 500;
}

.session-card-separator {
  color: var(--text-muted);
}

/* Card date */
.session-card-date {
  font-size: 11px;
  color: var(--text-muted);
}

/* Card actions (hover) */
.session-card-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: none;
  gap: 4px;
}

.session-card:hover .session-card-actions {
  display: flex;
}

.card-action-btn {
  padding: 4px;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
  transition: color 0.15s;
}

.card-action-btn:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.card-action-delete {
  color: var(--accent-red);
}

.card-action-delete:hover {
  color: var(--accent-red);
}
</style>
