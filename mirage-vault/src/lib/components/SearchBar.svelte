<script lang="ts">
  import PixelIcon from './PixelIcon.svelte';

  let { value = $bindable('') }: { value: string } = $props();
</script>

<div class="search-bar">
  <div class="search-icon">
    <PixelIcon name="search" size={18} />
  </div>
  <input
    type="text"
    class="search-input"
    placeholder="Search files..."
    bind:value
  />
  {#if value}
    <button class="search-clear" onclick={() => value = ''}>
      <PixelIcon name="close" size={16} />
    </button>
  {/if}
</div>

<style>
.search-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: color-mix(in srgb, var(--bg-surface) 80%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-top: 1px solid var(--border);
  border-radius: 0px;
  z-index: 10;
}

.search-icon {
  display: flex;
  align-items: center;
  color: var(--text-muted);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  font-family: inherit;
  font-size: 13px;
  color: var(--text-primary);
  padding: 0;
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: var(--text-muted);
  flex-shrink: 0;
  border-radius: 0px;
}

.search-clear:hover {
  color: var(--text-primary);
}
</style>
