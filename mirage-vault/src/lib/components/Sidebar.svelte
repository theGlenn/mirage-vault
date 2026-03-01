<script lang="ts">
	import PixelIcon from './PixelIcon.svelte';

	export type ActiveView = 'browse' | 'sessions' | 'settings';

	let { activeView = 'browse', onnavigate }: { activeView: ActiveView; onnavigate: (view: ActiveView) => void } = $props();
</script>

<aside class="sidebar-nav">
	<div class="sidebar-brand">
		<img src="/logo.png" alt="Mistral Mirage" class="brand-logo" />
	</div>

	<nav class="sidebar-menu">
		<button
			class="nav-item"
			class:nav-item-active={activeView === 'browse'}
			onclick={() => onnavigate('browse')}
			aria-current={activeView === 'browse' ? 'page' : undefined}
		>
			<PixelIcon name="folder" size={20} />
			<span class="nav-label">BROWSE</span>
		</button>
		<button
			class="nav-item"
			class:nav-item-active={activeView === 'sessions'}
			onclick={() => onnavigate('sessions')}
			aria-current={activeView === 'sessions' ? 'page' : undefined}
		>
			<PixelIcon name="sessions" size={20} />
			<span class="nav-label">SESSIONS</span>
		</button>
		<button
			class="nav-item"
			class:nav-item-active={activeView === 'settings'}
			onclick={() => onnavigate('settings')}
			aria-current={activeView === 'settings' ? 'page' : undefined}
		>
			<PixelIcon name="settings" size={20} />
			<span class="nav-label">SETTINGS</span>
		</button>
	</nav>
</aside>

<style>
	.sidebar-nav {
		width: 64px;
		min-width: 64px;
		display: flex;
		flex-direction: column;
		background-color: var(--bg-secondary);
		border-right: 1px solid var(--border);
	}

	.sidebar-brand {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 12px 4px;
		border-bottom: 1px solid var(--border-accent);
	}

	.brand-logo {
		width: 44px;
		height: 44px;
		object-fit: contain;
		border-radius: 8px;
	}

	.sidebar-menu {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 4px;
	}

	.nav-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 10px 4px;
		border: none;
		border-radius: 6px;
		background: none;
		color: var(--text-secondary);
		cursor: pointer;
		font-family: inherit;
		transition: background-color 0.15s, color 0.15s;
		border-left: 2px solid transparent;
	}

	.nav-item:hover {
		background-color: var(--bg-elevated);
		color: var(--text-primary);
	}

	.nav-item-active {
		background-color: var(--bg-elevated);
		color: var(--accent-orange);
		border-left-color: var(--accent-orange);
	}

	.nav-label {
		font-family: 'Geist Pixel', monospace;
		font-size: 6px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
</style>
