<script lang="ts">
	import { untrack } from 'svelte';
	import { app } from '#lib/app-state.svelte.js';
	import { todayJst } from '#lib/calc.js';
	import { fmt, yen } from '#lib/format.js';

	// 入庫・出庫
	let { id, kind }: { id: string; kind: '入庫' | '出庫' } = $props();

	const item = untrack(() => app.findItem(id));
	let qty = $state<number | null>(null);
	let date = $state(todayJst());
	let unitPrice = $state<number | null>(item?.price ?? null);
	let supplier = $state(item?.supplier ?? '');
	let memo = $state('');
	let discount = $state<number | null>(null);
	let tax = $state<number | null>(null);
	let saving = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!qty || qty <= 0) return app.toast('数量を正しく入力してください。', true);
		saving = true;
		try {
			await app.moveStock(id, kind, kind === '入庫' ? { qty, date, unitPrice, supplier, memo, discount, tax } : { qty, memo });
			app.modal = null;
			app.toast(`${kind}を記録しました。`);
		} catch {
			// お知らせ済み
		} finally {
			saving = false;
		}
	}
</script>

{#if item}
	<form class="form-grid" autocomplete="off" onsubmit={submit}>
		<p class="note full">いまの在庫：<b>{fmt(item.stock)}{item.unit}</b></p>
		<label class="field" class:half={kind === '出庫'}><span>数量（{item.unit || '単位'}）<span class="req">必須</span></span><input type="number" min="0" step="any" inputmode="decimal" bind:value={qty} required /></label>
		{#if kind === '入庫'}
			<label class="field"><span>購入日</span><input type="date" bind:value={date} /></label>
			<label class="field"><span>購入単価（円）</span><input type="number" min="0" step="any" inputmode="decimal" bind:value={unitPrice} /></label>
			<label class="field"><span>購入先</span><input bind:value={supplier} list="supplier-list" maxlength="100" /></label>
			<label class="field"><span>値引金額（円）<small>あれば</small></span><input type="number" min="0" step="any" inputmode="decimal" bind:value={discount} /></label>
			<label class="field"><span>うち消費税（円）<small>あれば</small></span><input type="number" min="0" step="any" inputmode="decimal" bind:value={tax} /></label>
			<div class="field half"><span>支払額（自動計算）<small>単価×数量−値引</small></span><output class="calc">{yen(Math.round((qty ?? 0) * (unitPrice ?? 0)) - (discount ?? 0))}</output></div>
		{/if}
		<label class="field half"><span>メモ</span><input bind:value={memo} maxlength="500" placeholder={kind === '入庫' ? '例：春肥の分' : '例：第2ハウスで使用'} /></label>
		<div class="form-actions full">
			<button type="submit" class="btn btn-primary" disabled={saving}>{kind}を記録</button>
			<button type="button" class="btn" onclick={() => (app.modal = null)}>キャンセル</button>
		</div>
		<datalist id="supplier-list">{#each app.suppliers as s (s)}<option value={s}></option>{/each}</datalist>
	</form>
{/if}
