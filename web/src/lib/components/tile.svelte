<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChangeBadge from './change-badge.svelte';

	// 集計の小さな箱。value の代わりに change（変動率）も渡せる
	let {
		label,
		value = '',
		change,
		sub = '',
		children
	}: { label: string; value?: string; change?: number | null; sub?: string; children?: Snippet } = $props();
</script>

<div class="tile">
	<div class="tile-label">{label}</div>
	<div class="tile-value">
		{#if change !== undefined}<ChangeBadge value={change} />{:else}{value}{/if}
	</div>
	<div class="tile-sub">{sub}{@render children?.()}</div>
</div>
