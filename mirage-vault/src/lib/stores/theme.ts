import { writable } from 'svelte/store';

export type Theme = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'aether-theme';

function getEffectiveTheme(theme: Theme): 'dark' | 'light' {
	if (theme === 'system') {
		return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}
	return theme;
}

function applyTheme(theme: Theme): void {
	document.documentElement.setAttribute('data-theme', getEffectiveTheme(theme));
}

export const theme = writable<Theme>('system');

export function initTheme(): void {
	const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
	const initial: Theme = stored && ['dark', 'light', 'system'].includes(stored) ? stored : 'system';

	theme.set(initial);
	applyTheme(initial);

	theme.subscribe((value) => {
		localStorage.setItem(STORAGE_KEY, value);
		applyTheme(value);
	});

	// Listen for system preference changes when in 'system' mode
	window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
		let current: Theme = 'system';
		theme.subscribe((v) => (current = v))();
		if (current === 'system') {
			applyTheme('system');
		}
	});
}
