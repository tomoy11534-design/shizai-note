<script lang="ts">
	import { app } from '#lib/app-state.svelte.js';
	import { CANCELABLE_TYPES, PURCHASE_TYPES } from '#lib/calc.js';
	import { fmt, shortDateTime, yen } from '#lib/format.js';
	import type { StockEvent } from '#lib/types.js';

	// 記録1件分の表示
	let { event: e }: { event: StockEvent } = $props();

	let unit = $derived((e.item_id && app.findItem(e.item_id)?.unit) || '');
	let isPurchase = $derived(PURCHASE_TYPES.includes(e.type));
	let dateText = $derived(e.date_precision === 'year' ? `${e.event_date.slice(0, 4)}年` : e.event_date);
	// 記録には資材名しか残らないので、規格は今の資材から探す
	let spec = $derived(e.item_id ? (app.findItem(e.item_id)?.spec ?? '') : '');
	let canCancel = $derived(CANCELABLE_TYPES.includes(e.type) && !e.cancelled);

	async function cancel() {
		const ok = await app.confirm(
			`「${e.item_name}」の${e.type}（${dateText}）を取り消しますか？` +
				(e.type === '過去の購入' ? '' : '\n在庫も元に戻します。') +
				'\n記録は「取消済み」として残ります。',
			'取り消す'
		);
		if (!ok) return;
		await app.cancelEvent(e.id).then(() => app.toast('取り消しました。'), () => undefined);
	}
</script>

<div class="history-row" class:is-cancelled={e.cancelled}>
	<div class="history-main">
		<b>{e.type}</b>
		{e.item_name}{#if spec}<span class="spec">{spec}</span>{/if}
		{#if e.type === '登録'}在庫 {fmt(e.qty)}{unit}
		{:else if e.qty !== null && e.type !== '編集'}{e.type === '過去の購入' || e.qty <= 0 ? '' : '+'}{fmt(e.qty)}{unit}{/if}
		{#if e.stock_after !== null && e.type !== '過去の購入'}<span class="chg-sub"> → 在庫 {fmt(e.stock_after)}{unit}</span>{/if}
		{#if e.cancelled}<span class="badge">取消済み</span>{/if}
	</div>
	<div class="history-amount">
		{#if isPurchase}{yen(e.amount)}<div class="chg-sub">@{yen(e.unit_price)}{#if e.discount}・値引 {yen(e.discount)}{/if}{#if e.tax != null}・うち税 {yen(e.tax)}{/if}</div>{/if}
	</div>
	<div class="history-meta">
		{isPurchase ? `購入日 ${dateText}` : shortDateTime(e.created_at)}
		・{app.memberName(e.user_id)}
		{#if isPurchase && e.supplier}・{e.supplier}{/if}
		{#if e.memo}・{e.memo}{/if}
		{#if isPurchase}・記録 {shortDateTime(e.created_at)}{/if}
	</div>
	<div>{#if canCancel}<button type="button" class="btn btn-small" onclick={cancel}>取消</button>{/if}</div>
</div>
