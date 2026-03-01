<script lang="ts">
	import { theme } from '$lib/stores/theme';
	import type { Theme } from '$lib/stores/theme';
	import PixelIcon from './PixelIcon.svelte';
	import type { IconName } from './PixelIcon.svelte';
	import MaskingStrategyConfig from './MaskingStrategyConfig.svelte';

	let currentTheme: Theme = $state('system');

	theme.subscribe((v) => (currentTheme = v));

	function setTheme(value: Theme) {
		theme.set(value);
	}

	const options: { value: Theme; label: string; icon: IconName }[] = [
		{ value: 'dark', label: 'Dark', icon: 'moon' },
		{ value: 'light', label: 'Light', icon: 'sun' },
		{ value: 'system', label: 'System', icon: 'settings' }
	];
</script>

<div class="settings-screen">
	<h2 class="settings-heading">SETTINGS</h2>

	<section class="settings-section">
		<h3 class="section-label">THEME</h3>
		<div class="theme-toggle">
			{#each options as opt}
				<button
					class="theme-option"
					class:theme-option-active={currentTheme === opt.value}
					onclick={() => setTheme(opt.value)}
					aria-pressed={currentTheme === opt.value}
				>
					<PixelIcon name={opt.icon} size={18} />
					<span class="theme-option-label">{opt.label}</span>
				</button>
			{/each}
		</div>
	</section>

	<section class="settings-section masking-section">
		<h3 class="section-label">MASKING STRATEGY</h3>
		<MaskingStrategyConfig />
	</section>
</div>

<style>
	.settings-screen {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		padding: 40px;
		width: 100%;
		height: 100%;
		overflow-y: auto;
	}

	.settings-heading {
		font-family: 'Geist Pixel', monospace;
		font-size: 14px;
		color: var(--text-primary);
		margin: 0 0 32px;
		letter-spacing: 0.05em;
	}

	.settings-section {
		width: 100%;
		max-width: 400px;
	}

	.masking-section {
		max-width: 520px;
		margin-top: 24px;
	}

	.section-label {
		font-family: 'Geist Pixel', monospace;
		font-size: 8px;
		color: var(--text-secondary);
		letter-spacing: 0.08em;
		margin: 0 0 12px;
		text-transform: uppercase;
	}

	.theme-toggle {
		display: flex;
		border: 2px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
		background: var(--bg-elevated);
	}

	.theme-option {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 10px 12px;
		border: none;
		border-radius: 0;
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
		font-family: 'Geist Pixel', monospace;
		font-size: 12px;
		transition: background-color 0.15s, color 0.15s;
	}

	.theme-option:not(:last-child) {
		border-right: 2px solid var(--border);
	}

	.theme-option:hover {
		background-color: var(--bg-surface);
		color: var(--text-primary);
	}

	.theme-option-active {
		background-color: var(--accent-orange);
		color: #fff;
	}

	.theme-option-active:hover {
		background-color: var(--accent-orange);
		color: #fff;
	}

	.theme-option-label {
		font-size: 11px;
		font-weight: 500;
	}
</style>
