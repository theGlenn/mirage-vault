<script lang="ts">
	import '$lib/styles/tokens.css';
	import { onMount } from 'svelte';
	import { initTheme } from '$lib/stores/theme';

	let { children } = $props();

	onMount(() => {
		initTheme();
	});
</script>

{@render children()}
