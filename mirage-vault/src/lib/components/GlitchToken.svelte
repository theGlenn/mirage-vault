<script lang="ts">
  let {
    displayText,
    phase = 'masked',
    hovered = false,
    onmouseenter,
    onmouseleave,
  }: {
    displayText: string;
    phase?: 'masked' | 'decoding' | 'decoded';
    hovered?: boolean;
    onmouseenter?: () => void;
    onmouseleave?: () => void;
  } = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
  class="token-glitch"
  class:token-glitch-decoding={phase === 'decoding'}
  class:token-glitch-decoded={phase === 'decoded'}
  class:token-glitch-hovered={hovered}
  {onmouseenter}
  {onmouseleave}
>{displayText}</span>

<style>
.token-glitch {
  border-radius: 2px;
  padding: 1px 4px;
  cursor: pointer;
  position: relative;
  font-weight: 600;
  letter-spacing: 0.05em;
  font-family: 'Geist Mono', monospace;
  display: inline;
  background-color: rgba(245, 197, 66, 0.18);
  border-bottom: 2px solid var(--accent-yellow);
  color: var(--accent-yellow);
  transition: background-color 0.2s ease, color 0.15s ease, text-shadow 0.15s ease;
}

.token-glitch-hovered {
  background-color: rgba(245, 197, 66, 0.28);
  text-shadow: 0 0 6px rgba(245, 197, 66, 0.4);
}

.token-glitch-decoding {
  background-color: rgba(245, 197, 66, 0.24);
  color: var(--text-primary);
  animation: glitch-pulse 0.3s ease-in-out infinite alternate;
}

.token-glitch-decoded {
  background-color: rgba(118, 242, 34, 0.14);
  border-bottom-color: var(--color-green);
  color: var(--color-green);
  text-shadow: 0 0 4px rgba(118, 242, 34, 0.3);
}

@keyframes glitch-pulse {
  from { text-shadow: 0 0 4px rgba(245, 197, 66, 0.3); }
  to   { text-shadow: 0 0 10px rgba(245, 197, 66, 0.6); }
}
</style>
