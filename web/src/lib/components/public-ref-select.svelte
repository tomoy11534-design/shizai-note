<script lang="ts">
	import { app } from '#lib/app-state.svelte.js';

	// 比べる全国データの選択欄
	let {
		value = $bindable(''),
		withInherit = false,
		onchange
	}: { value?: string; withInherit?: boolean; onchange?: (v: string) => void } = $props();

	let idx = $derived(app.publicSeries.filter((s) => s.kind === 'idx'));
	let groups = $derived.by(() => {
		const map = new Map<string, typeof app.publicSeries>();
		for (const s of app.publicSeries.filter((x) => x.kind === 'item')) map.set(s.grp, [...(map.get(s.grp) ?? []), s]);
		return [...map];
	});
	// まだ取得していないデータが選ばれている場合
	let unknown = $derived(value && value !== 'none' && !app.pubMap.has(value) ? value : '');
</script>

<select bind:value onchange={() => onchange?.(value)}>
	{#if withInherit}<option value="">カテゴリの設定に従う</option>{/if}
	<option value="none">比べない</option>
	{#if unknown}
		<option value={unknown}>{unknown.replace(/^(idx|item):/, '').split('|')[0]}（データ未取得）</option>
	{/if}
	{#if idx.length}
		<optgroup label="価格指数（類別）">
			{#each idx as s (s.key)}<option value={s.key}>{s.name}</option>{/each}
		</optgroup>
	{/if}
	{#each groups as [grp, list] (grp)}
		<optgroup label="全国平均価格：{grp}">
			{#each list as s (s.key)}<option value={s.key}>{s.name}（{s.spec}・{s.unit}）</option>{/each}
		</optgroup>
	{/each}
</select>
