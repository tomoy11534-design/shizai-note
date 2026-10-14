<script lang="ts">
	import '../app.css';
	import { app } from '#lib/app-state.svelte.js';
	import DialogHost from '#lib/components/dialog-host.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href="/icon.svg" />
</svelte:head>

{@render children()}

<DialogHost />

{#if app.toastMsg}
	{#key app.toastMsg.id}
		<div class="toast" class:error={app.toastMsg.error} role="status">{app.toastMsg.text}</div>
	{/key}
{/if}
