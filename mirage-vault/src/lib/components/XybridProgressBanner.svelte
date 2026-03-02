<script lang="ts">
  import type { XybridStatus } from '$lib/stores/xybridState';

  let {
    status,
    progress,
    error,
    onretry,
    ondismiss,
  }: {
    status: XybridStatus;
    progress: number;
    error: string | null;
    onretry: () => void;
    ondismiss: () => void;
  } = $props();

  const funnyPhrases = [
    'waking up the brain worms...',
    'untangling the thinking spaghetti...',
    'feeding the hamsters in the GPU...',
    'loading 4 billion tiny opinions...',
    'warming up the prediction juice...',
    'stacking very small matrices...',
    'inflating the tensor balloons...',
    'pouring weights into buckets...',
    'convincing silicon to think...',
    'downloading questionable wisdom...',
    'assembling a very small brain...',
    'shaking the magic 8-ball really hard...',
  ];

  let phraseIndex = $state(Math.floor(Math.random() * funnyPhrases.length));
  let phraseInterval: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    if (status === 'downloading' || status === 'loading') {
      phraseInterval = setInterval(() => {
        phraseIndex = (phraseIndex + 1) % funnyPhrases.length;
      }, 3000);
    } else {
      if (phraseInterval) {
        clearInterval(phraseInterval);
        phraseInterval = null;
      }
    }
    return () => {
      if (phraseInterval) clearInterval(phraseInterval);
    };
  });

  let progressPercent = $derived(
    progress >= 0 ? Math.round(progress * 100) : 0,
  );

  let visible = $derived(
    status === 'downloading' ||
    status === 'loading' ||
    status === 'error',
  );
</script>

{#if visible}
  <div class="xybrid-banner" class:banner-error={status === 'error'}>
    <div class="banner-content">
      {#if status === 'downloading'}
        <span class="banner-label">ADVANCED PROTECTION:</span>
        <span class="banner-phrase">{funnyPhrases[phraseIndex]}</span>
        <div class="progress-track">
          <div class="progress-fill" style="width: {progressPercent}%"></div>
        </div>
        <span class="banner-value">{progressPercent}%</span>
      {:else if status === 'loading'}
        <span class="banner-label">ADVANCED PROTECTION:</span>
        <span class="banner-phrase">{funnyPhrases[phraseIndex]}</span>
        <span class="banner-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>
      {:else if status === 'error'}
        <span class="banner-label">ERROR</span>
        <span class="banner-error-msg">{error}</span>
        <button class="banner-btn" onclick={onretry}>RETRY</button>
        <button class="banner-btn banner-btn-dismiss" onclick={ondismiss}>DISMISS</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .xybrid-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 200;
    background: var(--bg-elevated);
    border-bottom: 2px solid var(--color-orange);
    padding: 8px 16px;
    font-family: 'Geist Pixel', monospace;
  }

  .banner-content {
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 700px;
    margin: 0 auto;
  }

  .banner-label {
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--color-orange);
    white-space: nowrap;
  }

  .banner-phrase {
    font-size: 10px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .banner-value {
    font-size: 10px;
    color: var(--text-primary);
    min-width: 30px;
    text-align: right;
  }

  .progress-track {
    flex: 1;
    height: 4px;
    background: var(--bg-surface);
    border-radius: 2px;
    overflow: hidden;
    min-width: 60px;
  }

  .progress-fill {
    height: 100%;
    background: var(--color-orange);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .banner-dots {
    display: flex;
    gap: 4px;
  }

  .dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--color-orange);
    animation: dot-pulse 1.2s ease-in-out infinite;
  }

  .dot:nth-child(2) {
    animation-delay: 0.2s;
  }

  .dot:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes dot-pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }

  .banner-error {
    border-bottom-color: var(--accent-red);
  }

  .banner-error .banner-label {
    color: var(--accent-red);
  }

  .banner-error-msg {
    flex: 1;
    font-size: 10px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .banner-btn {
    font-size: 9px;
    letter-spacing: 0.05em;
    padding: 4px 10px;
    border: 1px solid var(--border-accent);
    border-radius: 4px;
    background: none;
    color: var(--text-primary);
    cursor: pointer;
    white-space: nowrap;
  }

  .banner-btn:hover {
    background: var(--bg-surface);
  }

  .banner-btn-dismiss {
    color: var(--text-secondary);
  }
</style>
