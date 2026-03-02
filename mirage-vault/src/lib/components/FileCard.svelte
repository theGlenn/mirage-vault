<script lang="ts">
  import { onDestroy } from 'svelte';
  import PixelIcon from './PixelIcon.svelte';
  import type { IconName } from './PixelIcon.svelte';
  import type { UploadProgress } from '$lib/types/upload';
  import { STAGE_PROGRESS } from '$lib/types/upload';

  export interface VaultItem {
    id: number;
    name: string;
    file_type: string;
    entity_count: number;
    created_at: string;
    warning: string | null;
    status: string;
  }

  let {
    item,
    uploadProgress,
    onselect,
    ondelete
  }: {
    item: VaultItem;
    uploadProgress?: UploadProgress;
    onselect: (id: number) => void;
    ondelete: (item: VaultItem) => void;
  } = $props();

  let isProcessing = $derived(
    uploadProgress?.stage === 'processing' ||
    uploadProgress?.stage === 'reading' ||
    uploadProgress?.stage === 'parsing' ||
    uploadProgress?.stage === 'saving'
  );

  let isLlmProcessing = $derived(
    uploadProgress?.stage === 'processing' ||
    (!uploadProgress && item.status === 'processing')
  );

  let isError = $derived(uploadProgress?.stage === 'error');
  let progressPercent = $derived(uploadProgress?.progress ?? (item.status === 'done' ? 100 : 0));
  let showProgressBar = $derived(
    (uploadProgress != null && uploadProgress.stage !== 'done') ||
    item.status === 'processing'
  );

  // --- Rotating processing messages ---
  const PROCESSING_HINTS: { text: string; icon: IconName }[] = [
    { text: 'Hiding your data from the bad guys', icon: 'shield' },
    { text: "They'll never catch you", icon: 'zap' },
    { text: 'Keepin\' your data safe!', icon: 'lock' },
    { text: 'Scrambling the evidence...', icon: 'eye' },
    { text: 'Your secrets are safe with us', icon: 'unlock' },
    { text: 'Making you invisible', icon: 'shield' },
    { text: 'Cloaking in progress...', icon: 'zap' },
    { text: 'Nothing to see here, officer', icon: 'eye' },
  ];

  let hintIndex = $state(Math.floor(Math.random() * PROCESSING_HINTS.length));
  let hintInterval: ReturnType<typeof setInterval> | undefined;

  $effect(() => {
    if (isLlmProcessing) {
      hintIndex = Math.floor(Math.random() * PROCESSING_HINTS.length);
      hintInterval = setInterval(() => {
        let next: number;
        do {
          next = Math.floor(Math.random() * PROCESSING_HINTS.length);
        } while (next === hintIndex && PROCESSING_HINTS.length > 1);
        hintIndex = next;
      }, 4000);
    } else {
      if (hintInterval) clearInterval(hintInterval);
      hintInterval = undefined;
    }
  });

  onDestroy(() => {
    if (hintInterval) clearInterval(hintInterval);
  });

  let currentHint = $derived(PROCESSING_HINTS[hintIndex]);

  // --- Typewriter effect ---
  let displayedText = $state('');
  let typewriterTimeout: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const text = currentHint.text;
    // Clear previous typewriter
    if (typewriterTimeout) clearTimeout(typewriterTimeout);
    displayedText = '';

    if (!isLlmProcessing) return;

    let i = 0;
    function typeNext() {
      if (i < text.length) {
        displayedText = text.slice(0, i + 1);
        i++;
        typewriterTimeout = setTimeout(typeNext, 35);
      }
    }
    typewriterTimeout = setTimeout(typeNext, 35);
  });

  onDestroy(() => {
    if (typewriterTimeout) clearTimeout(typewriterTimeout);
  });

  let typingDone = $derived(displayedText.length >= currentHint.text.length);

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
<div
  class="file-card"
  class:file-card-error={isError}
  class:file-card-processing={isProcessing || item.status === 'processing'}
  onclick={handleClick}
>
  {#if isProcessing || item.status === 'processing'}
    <div class="file-card-stage-badge">{uploadProgress?.stage ?? 'processing'}</div>
  {:else if isError}
    <div class="file-card-error-icon">
      <PixelIcon name="alert" size={16} />
    </div>
  {:else}
    <button class="file-card-delete" onclick={handleDelete} aria-label="Delete {item.name}">
      <PixelIcon name="trash" size={16} />
    </button>
  {/if}

  <div class="file-card-icon-row">
    <div class="file-card-icon" style="color: {getFileTypeColor(item.file_type)}">
      <PixelIcon name={getFileIcon(item.file_type)} size={32} />
    </div>
    <span class="file-card-type">.{item.file_type}</span>
  </div>
  <div class="file-card-name">
    {#if item.warning}
      <PixelIcon name="alert" size={14} />
    {/if}
    <span class="file-card-name-text">{item.name}</span>
  </div>
  <div class="file-card-meta">
    {#if isLlmProcessing}
      <span class="file-card-hint-meta">
        <PixelIcon name={currentHint.icon} size={22} />
        <span>{displayedText}{#if typingDone}<span class="animated-dots"></span>{/if}</span>
      </span>
    {:else if isProcessing || item.status === 'processing'}
      <span class="file-card-stage">{uploadProgress?.stage ?? 'processing'}<span class="animated-dots"></span></span>
    {:else if isError}
      <span class="file-card-error-text">Error</span>
    {:else}
      <span class="file-card-entities">{item.entity_count} entities</span>
    {/if}
  </div>

  {#if !isError && !isProcessing && item.status === 'done'}
    <div class="file-card-date">{formatDate(item.created_at)}</div>
  {/if}

  {#if showProgressBar}
    <div class="file-card-progress-track">
      <div
        class="file-card-progress-fill"
        class:file-card-progress-error={isError}
        style="width: {isError ? STAGE_PROGRESS[uploadProgress?.errorStage ?? 'reading'] : progressPercent}%"
      ></div>
    </div>
  {/if}
</div>

<style>
.file-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  padding-left: 14px;
  background: var(--bg-surface);
  border: 2px solid var(--border);
  border-left: 4px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
  text-align: left;
  font-family: inherit;
  color: inherit;
  width: 100%;
  min-height: 0;
  box-sizing: border-box;
}

.file-card:hover {
  background: var(--bg-elevated);
  border-left: 4px solid var(--border-accent);
}

.file-card-error {
  border-color: var(--accent-red);
  border-left: 4px solid var(--accent-red);
}

.file-card-error:hover {
  border-left: 4px solid var(--accent-red);
}

.file-card-processing {
  border-left: 4px solid var(--accent-orange);
}

.file-card-processing:hover {
  border-left: 4px solid var(--accent-orange);
}

.file-card-delete {
  position: absolute;
  top: 8px;
  right: 8px;
  display: none;
  padding: 4px;
  border: none;
  border-radius: 4px;
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

.file-card-stage-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
  text-transform: capitalize;   
  color: var(--color-orange);
  background: rgba(232, 117, 26, 0.12);
  border: 1px solid var(--accent-orange);
  border-radius: 4px;
  letter-spacing: 0.02em;
}

.file-card-error-icon {
  position: absolute;
  top: 8px;
  right: 8px;
  color: var(--accent-red);
}

.file-card-error-text {
  color: var(--accent-red);
  font-weight: 500;
  font-size: 12px;
}

.file-card-stage {
  color: var(--accent-orange);
  font-weight: 500;
  font-size: 12px;
  text-transform: capitalize;
}

.file-card-icon-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-card-icon {
  color: var(--text-secondary);
}

.file-card-hint-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--accent-orange);
  font-weight: 500;
  font-size: 12px;
}

.animated-dots::after {
  content: '';
  animation: dots 1.5s steps(4, end) infinite;
}

@keyframes dots {
  0% { content: ''; }
  25% { content: '.'; }
  50% { content: '..'; }
  75% { content: '...'; }
  100% { content: ''; }
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
  border-radius: 4px;
  background: var(--bg-elevated);
}

.file-card-date {
  font-size: 11px;
  color: var(--text-muted);
}

/* Bottom progress bar */
.file-card-progress-track {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 5px;
  background: var(--bg-elevated);
  border-radius: 0 0 6px 6px;
  overflow: hidden;
}

.file-card-progress-fill {
  height: 100%;
  background: var(--accent-orange);
  transition: width 0.4s ease;
  border-radius: 0 0 6px 6px;
}

.file-card-progress-error {
  background: var(--accent-red);
}
</style>
