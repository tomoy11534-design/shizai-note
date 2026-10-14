<script lang="ts">
	// 変動率を矢印と色の両方で表す（色だけに頼らない）
	let { value }: { value: number | null | undefined } = $props();
</script>

{#if value === null || value === undefined || !Number.isFinite(value)}
	<span class="chg na">—</span>
{:else if Math.abs(value) < 0.05}
	<span class="chg flat">→ ±0.0%</span>
{:else if value > 0}
	<span class="chg up">↑ +{value.toFixed(1)}%</span>
{:else}
	<span class="chg down">↓ −{Math.abs(value).toFixed(1)}%</span>
{/if}
