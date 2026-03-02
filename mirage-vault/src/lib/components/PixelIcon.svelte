<script lang="ts">
	export type IconName =
		| 'folder'
		| 'file'
		| 'file-alt'
		| 'table'
		| 'code'
		| 'article'
		| 'search'
		| 'close'
		| 'settings'
		| 'download'
		| 'clipboard'
		| 'trash'
		| 'upload'
		| 'sun'
		| 'moon'
		| 'alert'
		| 'chevron-down'
		| 'chevron-left'
		| 'chevron-right'
		| 'lock'
		| 'unlock'
		| 'shield'
		| 'eye'
		| 'zap'
		| 'sessions';

	// Add colors handling
	type Props = {
		name: IconName;
		size?: number;
		color?: string; // Optional color prop
	};
	let { name, size = 24, color }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	fill={color || 'currentColor'}
	viewBox="0 0 24 24"
	shape-rendering="crispEdges"
	aria-hidden="true"
>
	{#if name === 'folder'}
		<path d="M4 4h6v2H4zm0 14h16v2H4zM20 8h2v10h-2zM2 6h2v12H2zm8 0h10v2H10z" />
	{:else if name === 'file'}
		<path d="M6 4H4v16h2zm10-2H6v2h10zm4 4h-2v14h2zm-2 14H6v2h12zM16 4h2v2h-2zm-4 0h2v6h-2z" />
		<path d="M12 8h6v2h-6z" />
	{:else if name === 'file-alt'}
		<path d="M6 4H4v16h2zm10-2H6v2h10zm4 4h-2v14h2zm-2 14H6v2h12zM16 4h2v2h-2zm-4 0h2v6h-2z" />
		<path d="M12 8h6v2h-6zm-4 8h8v2H8zm0-4h8v2H8zm0-4h2v2H8z" />
	{:else if name === 'table'}
		<path d="M4 2h16v2H4zm0 18h16v2H4zM2 4h2v16H2zm18 0h2v16h-2zM4 8h16v2H4zm0 6h16v2H4z" />
		<path d="M8 4h2v16H8zm6 0h2v16h-2z" />
	{:else if name === 'code'}
		<path d="M8 5h2v2H8V5ZM6 7h2v2H6V7ZM4 9h2v2H4V9Zm-2 2h2v2H2v-2Zm2 2h2v2H4v-2Zm2 2h2v2H6v-2Zm2 2h2v2H8v-2Zm8-12h-2v2h2V5Zm2 2h-2v2h2V7Zm2 2h-2v2h2V9Zm2 2h-2v2h2v-2Zm-2 2h-2v2h2v-2Zm-2 2h-2v2h2v-2Zm-2 2h-2v2h2v-2Z" />
	{:else if name === 'article'}
		<path d="M8 2h12v2H8zM6 4h2v16H6zm14 0h2v16h-2zM4 20h16v2H4zm-2-9h2v9H2zm2-2h2v2H4zm6-3h8v2h-8zm0 4h8v2h-8zm0-2h2v2h-2zm6 0h2v2h-2zm-6 5h8v2h-8zm0 3h4v2h-4z" />
	{:else if name === 'search'}
		<path d="M22 22h-2v-2h2v2Zm-2-2h-2v-2h2v2Zm-6-2H6v-2h8v2Zm4 0h-2v-2h2v2ZM6 16H4v-2h2v2Zm10 0h-2v-2h2v2ZM4 14H2V6h2v8Zm14 0h-2V6h2v8ZM6 6H4V4h2v2Zm10 0h-2V4h2v2Zm-2-2H6V2h8v2Z" />
	{:else if name === 'close'}
		<path d="M5 5h2v2H5zm4 4h2v2H9zm2 2h2v2h-2zm2-2h2v2h-2zm4-4h2v2h-2zM7 7h2v2H7zm8 0h2v2h-2zM7 15h2v2H7zm2-2h2v2H9zm4 0h2v2h-2zm2 2h2v2h-2zM5 17h2v2H5zm12 0h2v2h-2z" />
	{:else if name === 'settings'}
		<path d="M10 2h4v2h-4zm0 18h4v2h-4zM2 10h2v4H2zm18 0h2v4h-2zM10 4h4v2h-4zm0 14h4v-2h-4zM4 10h2v4H4zm14 0h2v4h-2zM6 6h2v2H6zm10 0h2v2h-2zm0 10h2v2h-2zM6 16h2v2H6zm4-6h4v2h-4zm0 2h4v2h-4zM8 10h2v4H8zm6 0h2v4h-2z" />
	{:else if name === 'download'}
		<path d="M21 15v4h-2v-4zm-2 4v2H5v-2zM5 15v4H3v-4zm8-12v14h-2V3z" />
		<path d="M7 11v2h10v-2zm2 2v2h2v-2zm4 0v2h2v-2z" />
		<path d="M15 11v2h2v-2z" />
	{:else if name === 'clipboard'}
		<path d="M4 6h2v14H4zm2 14h12v2H6zM18 6h2v14h-2zM6 4h2v2H6zm10 0h2v2h-2zm-6-2h4v2h-4zm0 4h4v2h-4zM8 2h2v6H8zm6 0h2v6h-2z" />
	{:else if name === 'trash'}
		<path d="M6 7h2v2H6zm14 0h2v10h-2zM8 5h12v2H8zM4 9h2v2H4zm-2 2h2v2H2zm2 2h2v2H4zm2 2h2v2H6zm2 2h12v2H8zm6-6h2v2h-2zm2 2h2v2h-2zm0-4h2v2h-2zm-4 4h2v2h-2zm0-4h2v2h-2z" />
	{:else if name === 'upload'}
		<path d="M19 21H5v-2h14v2ZM5 19H3v-4h2v4Zm16 0h-2v-4h2v4ZM13 5h2v2h2v2h-4v8h-2V9H7V7h2V5h2V3h2v2Z" />
	{:else if name === 'sun'}
		<path d="M11 0h2v4h-2zm0 20h2v4h-2zM0 11h4v2H0zm20 0h4v2h-2zm-2-6h-2V3h2zm-2 2h-2V5h2zM6 5h2v2H6zM4 3h2v2H4zm14 14h2v2h-2zm-2-2h2v2h-2zM6 17H4v-2h2zm-2 2h2v2H4zM8 8h8v2H8zm0 6h8v2H8zM6 10h2v4H6zm10 0h2v4h-2z" />
	{:else if name === 'moon'}
		<path d="M18 22H8v-2h10v2ZM8 20H6v-2h2v2Zm12 0h-2v-2h2v2ZM6 18H4v-2h2v2Zm16 0h-2v-4h-2v-2h2v-2h2v8ZM4 16H2V6h2v10Zm14 0h-6v-2h6v2Zm-6-2h-2v-2h2v2Zm-2-2H8V6h2v6ZM6 6H4V4h2v2Zm8-2h-2v2h-2V4H6V2h8v2Z" />
	{:else if name === 'alert'}
		<path d="M11 2h2v2h-2zm-2 2h2v2H9zm4 0h2v2h-2zM7 6h2v2H7zm8 0h2v2h-2zM5 8h2v2H5zm12 0h2v2h-2zM3 10h2v2H3zm14 0h2v2h-2zM1 12h2v2H1zm18 0h2v2h-2zm-18 2h20v2H1zm0 2h22v2H1zm0 2h22v2H1zm10-8h2v4h-2zm0 6h2v2h-2z" />
	{:else if name === 'chevron-down'}
		<path d="M13 16h-2v-2h2v2Zm-2-2H9v-2h2v2Zm4 0h-2v-2h2v2Zm-6-2H7v-2h2v2Zm8 0h-2v-2h2v2ZM7 10H5V8h2v2Zm12 0h-2V8h2v2Z" />
	{:else if name === 'chevron-left'}
		<path d="M8 13v-2h2v2H8Zm2-2V9h2v2h-2Zm0 4v-2h2v2h-2Zm2-6V7h2v2h-2Zm0 8v-2h2v2h-2Zm2-8V5h2v2h-2Zm0 12v-2h2v2h-2Z" />
	{:else if name === 'chevron-right'}
		<path d="M16 13v-2h-2v2h2Zm-2-2V9h-2v2h2Zm0 4v-2h-2v2h2Zm-2-6V7h-2v2h2Zm0 8v-2h-2v2h2ZM10 7V5H8v2h2Zm0 12v-2H8v2h2Z" />
	{:else if name === 'lock'}
		<path d="M5 8h14v2H5zm0 12h14v2H5zM3 10h2v10H3zm16 0h2v10h-2zM7 4h2v4H7zm2-2h6v2H9zm6 2h2v4h-2z" />
	{:else if name === 'unlock'}
		<path d="M5 8h14v2H5zm0 12h14v2H5zM3 10h2v10H3zm16 0h2v10h-2zM7 4h2v4H7zm2-2h6v2H9zm6 2h2v2h-2z" />
	{:else if name === 'shield'}
		<path d="M4 2h16v2H4zM2 4h2v10H2zm18 0h2v10h-2zM4 14h2v2H4zm2 2h2v2H6zm2 2h2v2H8zm2 2h4v2h-4zm8-6h-2v2h2zm-2 2h-2v2h2zm-2 2h-2v2h2z" />
	{:else if name === 'eye'}
		<path d="M16 20H8v-2h8v2Zm-8-2H4v-2h4v2Zm12 0h-4v-2h4v2ZM4 16H2v-2h2v2Zm10-6h-2v2h2v-2h2v4h-2v2h-4v-2H8v-4h2V8h4v2Zm8 6h-2v-2h2v2ZM2 14H0v-4h2v4Zm22 0h-2v-4h2v4ZM4 10H2V8h2v2Zm18 0h-2V8h2v2ZM8 8H4V6h4v2Zm12 0h-4V6h4v2Zm-4-2H8V4h8v2Z" />
	{:else if name === 'zap'}
		<path d="M4 13h8v6h2v2h-2v2h-2v-8H2v-4h2v2Zm12 6h-2v-2h2v2Zm2-2h-2v-2h2v2Zm2-2h-2v-2h2v2Zm-6-6h8v4h-2v-2h-8V5h-2V3h2V1h2v8Zm-8 2H4V9h2v2Zm2-2H6V7h2v2Zm2-2H8V5h2v2Z" />
	{:else if name === 'sessions'}
		<path d="M6 2h12v2H6zM4 4h2v10H4zm14 0h2v10h-2zM6 14h12v2H6zM6 14h2v2H6zM4 16h2v2H4zM2 18h2v2H2zM8 6h8v2H8zM8 10h6v2H8z" />
	{/if}
</svg>
