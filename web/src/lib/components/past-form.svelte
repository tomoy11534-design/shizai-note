<script lang="ts">
	import { untrack } from 'svelte';
	import { app } from '#lib/app-state.svelte.js';
	import { yen } from '#lib/format.js';

	// 過去の購入（今の在庫は変えない）。続けて何件でも入力できる
	let { id }: { id: string } = $props();

	const item = untrack(() => app.findItem(id));
	const thisYear = new Date().getFullYear();
	const years = Array.from({ length: 16 }, (_, i) => thisYear - i);

	let mode = $state<'day' | 'year'>('day');
	let date = $state('');
	let year = $state(thisYear - 1);
	let unitPrice = $state<number | null>(null);
	let qty = $state<number | null>(null);
	let supplier = $state(item?.supplier ?? '');
	let memo = $state('');
	let discount = $state<number | null>(null);
	let tax = $state<number | null>(null);
	let saving = $state(false);
	let done = $state<string[]>([]);
	let priceInput: HTMLInputElement | undefined = $state();

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const d = mode === 'day' ? date : String(year);
		if (!d) return app.toast('購入日を入力してください。', true);
		if (unitPrice === null || unitPrice < 0) return app.toast('購入単価を入力してください。', true);
		saving = true;
		try {
			await app.addPastPurchase(id, { date: d, precision: mode, qty, unitPrice, supplier, memo, discount, tax });
			done = [`${mode === 'day' ? d : `${d}年`}　${yen(unitPrice)}${qty ? ` × ${qty}` : ''}`, ...done];
			unitPrice = null;
			qty = null;
			memo = '';
			discount = null;
			tax = null;
			priceInput?.focus();
			app.toast('記録しました。続けて入力できます。');
		} catch {
			// お知らせ済み
		} finally {
			saving = false;
		}
	}
</script>

{#if item}
	<form class="form-grid" autocomplete="off" onsubmit={submit}>
		<p class="note full">今の在庫は変わりません。アプリを使い始める前の価格を記録すると、前年比や3年前比を計算できるようになります。続けて何件でも入力できます。</p>
		<div class="field full">
			<span>購入日</span>
			<div class="seg" role="group" aria-label="購入日の入力方法">
				<button type="button" class:active={mode === 'day'} onclick={() => (mode = 'day')}>日付で入力</button>
				<button type="button" class:active={mode === 'year'} onclick={() => (mode = 'year')}>年だけ入力</button>
			</div>
		</div>
		{#if mode === 'day'}
			<label class="field half"><span>日付</span><input type="date" bind:value={date} /></label>
		{:else}
			<label class="field half"><span>年</span><select bind:value={year}>{#each years as y (y)}<option value={y}>{y}年</option>{/each}</select></label>
		{/if}
		<label class="field half"><span>購入単価（円）<span class="req">必須</span></span><input bind:this={priceInput} type="number" min="0" step="any" inputmode="decimal" bind:value={unitPrice} required /></label>
		<label class="field half"><span>数量（{item.unit || '単位'}）<small>省略すると1</small></span><input type="number" min="0" step="any" inputmode="decimal" bind:value={qty} /></label>
		<label class="field half"><span>購入先</span><input bind:value={supplier} list="supplier-list" maxlength="100" /></label>
		<label class="field half"><span>値引金額（円）<small>あれば</small></span><input type="number" min="0" step="any" inputmode="decimal" bind:value={discount} /></label>
		<label class="field half"><span>うち消費税（円）<small>あれば</small></span><input type="number" min="0" step="any" inputmode="decimal" bind:value={tax} /></label>
		<label class="field full"><span>メモ</span><input bind:value={memo} maxlength="500" /></label>
		<div class="form-actions full">
			<button type="submit" class="btn btn-primary" disabled={saving}>記録する</button>
			<button type="button" class="btn" onclick={() => (app.modal = { kind: 'detail', id })}>閉じる</button>
		</div>
		{#if done.length}
			<p class="note full">記録済み：<br />{#each done as d, i (i)}{d}<br />{/each}</p>
		{/if}
		<datalist id="supplier-list">{#each app.suppliers as s (s)}<option value={s}></option>{/each}</datalist>
	</form>
{/if}
