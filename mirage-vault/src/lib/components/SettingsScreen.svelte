<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { save } from '@tauri-apps/plugin-dialog';
	import { theme } from '$lib/stores/theme';
	import type { Theme } from '$lib/stores/theme';
	import PixelIcon from './PixelIcon.svelte';
	import type { IconName } from './PixelIcon.svelte';
	import MaskingStrategyConfig from './MaskingStrategyConfig.svelte';

	// --- Theme ---
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

	// --- MCP Server ---
	interface McpServerStatus {
		running: boolean;
		port: number | null;
	}

	let mcpStatus: McpServerStatus = $state({ running: false, port: null });
	let mcpLoading = $state(false);
	let mcpError = $state('');
	let mcpbExportError = $state('');

	async function refreshMcpStatus() {
		try {
			mcpStatus = await invoke<McpServerStatus>('get_mcp_server_status');
			mcpError = '';
		} catch (e) {
			mcpError = String(e);
		}
	}

	async function toggleMcpServer() {
		mcpLoading = true;
		mcpError = '';
		try {
			if (mcpStatus.running) {
				await invoke('stop_mcp_server');
			} else {
				await invoke('start_mcp_server');
			}
			await refreshMcpStatus();
		} catch (e) {
			mcpError = String(e);
		} finally {
			mcpLoading = false;
		}
	}

	async function handleExportMcpb() {
		mcpbExportError = '';
		try {
			const destPath = await save({
				defaultPath: 'mirage-vault.mcpb',
				filters: [{ name: 'MCP Bundle', extensions: ['mcpb'] }]
			});
			if (destPath) {
				await invoke('export_mcpb', { destPath });
			}
		} catch (e) {
			mcpbExportError = String(e);
		}
	}

	// Poll status on mount
	$effect(() => {
		refreshMcpStatus();
	});
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

	<section class="settings-section mcp-section">
		<h3 class="section-label">MCP SERVER</h3>

		<div class="mcp-status-row">
			<span class="status-dot" class:status-running={mcpStatus.running}></span>
			<span class="mcp-status-text">
				{#if mcpStatus.running}
					Running on port {mcpStatus.port}
				{:else}
					Stopped
				{/if}
			</span>
			<button
				class="mcp-toggle-btn"
				class:mcp-toggle-stop={mcpStatus.running}
				onclick={toggleMcpServer}
				disabled={mcpLoading}
			>
				{#if mcpLoading}
					...
				{:else if mcpStatus.running}
					Stop
				{:else}
					Start
				{/if}
			</button>
		</div>

		{#if mcpError}
			<p class="mcp-error">{mcpError}</p>
		{/if}

		<div class="mcp-connect">
			<h4 class="subsection-label">Connect to Claude Desktop</h4>
			<button class="mcp-download-btn" onclick={handleExportMcpb}>
				<PixelIcon name="download" size={16} />
				<span>Download Extension (.mcpb)</span>
			</button>
			{#if mcpbExportError}
				<p class="mcp-error">{mcpbExportError}</p>
			{/if}
			<p class="mcp-hint">Double-click the downloaded file to install in Claude Desktop.</p>
		</div>

		<div class="mcp-connect">
			<h4 class="subsection-label">Web Services</h4>
			<p class="mcp-hint">
				Add this URL as an MCP server in claude.ai or Le Chat:
			</p>
			<code class="mcp-url">http://127.0.0.1:3420/mcp</code>
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

	.mcp-section {
		max-width: 460px;
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

	/* Theme toggle */
	.theme-toggle {
		display: flex;
		border: 2px solid var(--border);
		border-radius: 0px;
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
		background-color: var(--color-orange);
		color: #fff;
	}

	.theme-option-active:hover {
		background-color: var(--color-orange);
		color: #fff;
	}

	.theme-option-label {
		font-size: 11px;
		font-weight: 500;
	}

	/* MCP Server */
	.mcp-status-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		border: 2px solid var(--border);
		border-radius: 0px;
		background: var(--bg-elevated);
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 0px;
		background: var(--text-muted);
		flex-shrink: 0;
	}

	.status-running {
		background: #4caf50;
	}

	.mcp-status-text {
		flex: 1;
		font-family: 'Geist Mono', monospace;
		font-size: 12px;
		color: var(--text-primary);
	}

	.mcp-toggle-btn {
		padding: 6px 14px;
		border: 2px solid var(--color-grim-blue, var(--border-accent));
		border-radius: 0px;
		background: transparent;
		color: var(--color-grim-blue, var(--text-primary));
		font-family: 'Geist Pixel', monospace;
		font-size: 10px;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		transition: background-color 0.15s, color 0.15s;
	}

	.mcp-toggle-btn:hover {
		background: var(--color-grim-blue, var(--border-accent));
		color: #fff;
	}

	.mcp-toggle-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.mcp-toggle-stop {
		border-color: var(--text-muted);
		color: var(--text-muted);
	}

	.mcp-toggle-stop:hover {
		background: var(--text-muted);
		color: #fff;
	}

	.mcp-error {
		font-family: 'Geist Mono', monospace;
		font-size: 11px;
		color: #ef5350;
		margin: 8px 0 0;
	}

	.mcp-connect {
		margin-top: 16px;
	}

	.subsection-label {
		font-family: 'Geist Pixel', monospace;
		font-size: 8px;
		color: var(--text-secondary);
		letter-spacing: 0.06em;
		margin: 0 0 8px;
		text-transform: uppercase;
	}

	.mcp-download-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		border: 2px solid var(--border);
		border-radius: 0px;
		background: var(--bg-elevated);
		color: var(--text-primary);
		font-family: 'Geist Pixel', monospace;
		font-size: 11px;
		cursor: pointer;
		transition: background-color 0.15s, border-color 0.15s;
	}

	.mcp-download-btn:hover {
		background: var(--bg-surface);
		border-color: var(--color-grim-blue, var(--border-accent));
	}

	.mcp-hint {
		font-family: 'Geist Mono', monospace;
		font-size: 11px;
		color: var(--text-secondary);
		margin: 8px 0 0;
		line-height: 1.5;
	}

	.mcp-url {
		display: block;
		margin-top: 6px;
		padding: 8px 12px;
		border: 2px solid var(--border);
		border-radius: 0px;
		background: var(--bg-elevated);
		font-family: 'Geist Mono', monospace;
		font-size: 12px;
		color: var(--color-grim-blue, var(--text-primary));
		user-select: all;
	}
</style>
