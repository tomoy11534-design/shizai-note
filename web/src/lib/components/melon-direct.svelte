<script lang="ts">
	// 直売の記録：直売所などで売った日・場所・玉数・金額を1行ずつ入れる。1年の合計で、1玉あたりの資材費を正しく出せるようにする
	import { app } from '#lib/app-state.svelte.js';
	import { errorMessage } from '#lib/format.js';
	import { directSummary } from '#lib/melon.js';
	import { melon, todayJst } from '#lib/melon-state.svelte.js';
	import Tile from './tile.svelte';

	let soldOn = $state(todayJst());
	let place = $state('');
	let fruits = $state<number | ''>('');
	let amount = $state<number | ''>('');
	let saving = $state(false);

	let sum = $derived(directSummary(melon.seasonSales));
	let list = $derived(melon.seasonSales.toSorted((a, b) => b.sold_on.localeCompare(a.sold_on) || b.created_at.localeCompare(a.created_at)));
	const yen = (n: number) => n.toLocaleString('ja-JP');

	async function add(e: SubmitEvent) {
		e.preventDefault();
		const n = Math.round(Number(fruits) || 0);
		const a = Math.round(Number(amount) || 0);
		if (!n && !a) return app.toast('玉数か金額を入れてください。', true);
		saving = true;
		try {
			const day = soldOn || todayJst();
			await melon.addSale({ sold_on: day, place: place.trim(), fruits: n, amount: a, memo: '' });
			// 売った日の年がいま見ている年と違うときは、その年に切り替える（入れた記録が見えなくならないように）
			const y = Number(day.slice(0, 4));
			if (y !== melon.season) melon.season = y;
			app.toast(`直売の記録を入れました（${y}年）。`);
			fruits = '';
			amount = '';
		} catch (err) {
			app.toast(errorMessage(err), true);
		} finally {
			saving = false;
		}
	}

	async function remove(id: string) {
		try {
			await melon.deleteSale(id);
		} catch (err) {
			app.toast(errorMessage(err), true);
		}
	}
</script>

<div class="tiles">
	<Tile label="{melon.season}年に直売した玉数" value="{yen(sum.fruits)} 玉" sub="{sum.count}回" />
	<Tile label="直売の売上" value="{yen(sum.amount)} 円" sub={sum.fruits ? `1玉あたり ${yen(Math.round(sum.amount / sum.fruits))}円` : ''} />
</div>

<div class="panel">
	<h2>直売の記録</h2>
	<p class="note">直売所などで売った玉数と金額を、売った日ごとに入れます。だいたいで大丈夫です。JAに出した分は入れなくてOKです。</p>
	<form class="form-grid" autocomplete="off" onsubmit={add}>
		<label class="field half"><span>売った日</span><input type="date" bind:value={soldOn} /></label>
		<label class="field half"><span>場所</span><input bind:value={place} list="melon-places" maxlength="50" placeholder="例：直売所" /></label>
		<label class="field half"><span>玉数</span><input type="number" min="0" inputmode="numeric" bind:value={fruits} /></label>
		<label class="field half"><span>金額（円）</span><input type="number" min="0" inputmode="numeric" bind:value={amount} /></label>
		<div class="form-actions full"><button type="submit" class="btn btn-primary" disabled={saving}>記録する</button></div>
		<datalist id="melon-places">{#each melon.places as p (p)}<option value={p}></option>{/each}</datalist>
	</form>

	{#each list as s (s.id)}
		<div class="sale">
			<span>{Number(s.sold_on.slice(5, 7))}/{Number(s.sold_on.slice(8, 10))} {s.place}</span>
			<span class="num">{yen(s.fruits)}玉・{yen(s.amount)}円</span>
			<button type="button" class="btn btn-small" aria-label="{s.sold_on}の記録を消す" onclick={() => remove(s.id)}>消す</button>
		</div>
	{:else}
		<p class="empty">{melon.season}年の直売の記録はまだありません。</p>
	{/each}
</div>

<style>
	.sale { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: center; border-top: 1px solid var(--border); padding: 8px 0; font-size: 0.9rem; }
	.sale .num { font-variant-numeric: tabular-nums; }
</style>
