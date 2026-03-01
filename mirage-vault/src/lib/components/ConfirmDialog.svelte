<script lang="ts">
  let {
    message,
    confirmLabel = 'Delete',
    cancelLabel = 'Cancel',
    onconfirm,
    oncancel
  }: {
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      oncancel();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="confirm-overlay" onclick={oncancel} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="confirm-dialog" onclick={(e: MouseEvent) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
    <p class="confirm-message">{@html message}</p>
    <div class="confirm-actions">
      <button class="confirm-cancel" onclick={oncancel}>{cancelLabel}</button>
      <button class="confirm-delete" onclick={onconfirm}>{confirmLabel}</button>
    </div>
  </div>
</div>

<style>
.confirm-overlay {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--bg-primary) 60%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.confirm-dialog {
  background: var(--bg-surface);
  border-radius: 0px;
  border: 2px solid var(--border);
  padding: 24px;
  max-width: 360px;
  width: 90%;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.confirm-message {
  margin: 0 0 20px;
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.5;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.confirm-cancel {
  padding: 8px 16px;
  border: 2px solid var(--border);
  border-radius: 0px;
  background: var(--bg-elevated);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
  font-family: inherit;
}

.confirm-cancel:hover {
  background-color: var(--bg-surface);
}

.confirm-delete {
  padding: 8px 16px;
  border: 2px solid var(--accent-red);
  border-radius: 0px;
  background: var(--accent-red);
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  cursor: pointer;
  font-family: inherit;
}

.confirm-delete:hover {
  background: var(--accent-deep);
  border-color: var(--accent-deep);
}
</style>
