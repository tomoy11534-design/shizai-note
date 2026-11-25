<script lang="ts">
	// 申込の一覧：上に今年のまとめ、絞り込み、1件ずつのカード（入金・発送・連絡のボタンと、コピー）
	import { app } from '#lib/app-state.svelte.js';
	import { errorMessage } from '#lib/format.js';
	import { melon } from '#lib/melon-state.svelte.js';
	import { destination, itemText, seasonSummary, shippedNotice, shippingLabel, stageOf, STAGE_LABELS, type OrderStage } from '#lib/melon.js';
	import Tile from './tile.svelte';

	let { onedit }: { onedit: (id?: string) => void } = $props();

	let filter = $state<'' | OrderStage>('');
	let editingCap = $state(false);
	let capInput = $state('');
	let busy = $state('');

	let summary = $derived(seasonSummary(melon.seasonOrders, melon.capacity));
	// 並びは申込が来た順のまま（ボタンを押してもカードが動かないように）。段階ごとに見たいときは上の絞り込みを使う
	const ORDER: OrderStage[] = ['unpaid', 'unshipped', 'unnotified', 'done'];
	let list = $derived(melon.seasonOrders.filter((o) => !filter || stageOf(o) === filter).toSorted((a, b) => a.created_at.localeCompare(b.created_at)));

	const yen = (n: number) => n.toLocaleString('ja-JP');
	const md = (d: string | null) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '');
	let farm = $derived(app.household?.name ?? '');

	async function mark(id: string, field: 'paid_on' | 'shipped_on' | 'notified_on', on: boolean) {
		busy = id + field;
		try {
			await melon.mark(id, field, on);
		} catch (err) {
			app.toast(errorMessage(err), true);
		} finally {
			busy = '';
		}
	}

	async function saveCap() {
		const n = Math.round(Number(capInput));
		if (!Number.isFinite(n) || n < 0) return app.toast('ケース数を数字で入れてください。', true);
		try {
			await melon.setCapacity(n);
			editingCap = false;
		} catch (err) {
			app.toast(errorMessage(err), true);
		}
	}
</script>

<div class="tiles">
	<Tile label="受付したケース" value="{summary.cases} / {melon.capacity}" sub="{summary.orders}件の申込" />
	<Tile label="残り" value="{summary.left} ケース" sub={summary.left < 0 ? '上限をこえています' : ''} />
	<Tile label="入金待ち" value="{summary.count.unpaid} 件" sub={summary.unpaidAmount ? `${yen(summary.unpaidAmount)}円` : ''} />
	<Tile label="発送待ち・連絡待ち" value="{summary.count.unshipped} 件・{summary.count.unnotified} 件" />
</div>

<div class="panel">
	<div class="panel-head">
		<h2>{melon.season}年の申込</h2>
		<button type="button" class="btn btn-primary" onclick={() => onedit()}>＋ 申込を入れる</button>
	</div>
	<p class="note">
		受付の上限は {melon.capacity} ケースです。
		{#if editingCap}
			<input class="cap-input" type="number" min="0" inputmode="numeric" bind:value={capInput} aria-label="受付の上限（ケース）" />
			<button type="button" class="btn btn-small" onclick={saveCap}>決める</button>
			<button type="button" class="btn btn-small" onclick={() => (editingCap = false)}>やめる</button>
		{:else}
			<button type="button" class="link-btn" onclick={() => { capInput = String(melon.capacity); editingCap = true; }}>上限を変える</button>
		{/if}
	</p>
	<div class="chips" role="group" aria-label="絞り込み">
		<button type="button" class="chip" class:active={filter === ''} onclick={() => (filter = '')}>すべて {melon.seasonOrders.length}</button>
		{#each ORDER as s (s)}
			<button type="button" class="chip" class:active={filter === s} onclick={() => (filter = filter === s ? '' : s)}>{STAGE_LABELS[s]} {summary.count[s]}</button>
		{/each}
	</div>

	{#each list as o (o.id)}
		{@const stage = stageOf(o)}
		{@const to = destination(o)}
		<article class="order" class:done={stage === 'done'}>
			<div class="order-head">
				<button type="button" class="item-name" onclick={() => onedit(o.id)}>{o.customer_name} 様</button>
				<span class="badge" class:badge-warn={stage === 'unpaid'}>{STAGE_LABELS[stage]}</span>
			</div>
			<p class="order-line">{itemText(o)}・{yen(o.cases * o.unit_price)}円{o.ship_timing ? `・${o.ship_timing}発送` : ''}</p>
			{#if !o.to_same}<p class="order-line">お届け先：{to.name} 様</p>{/if}
			{#if o.memo}<p class="order-line memo">メモ：{o.memo}</p>{/if}
			<div class="steps" role="group" aria-label="進み具合">
				<button type="button" class="step" class:on={!!o.paid_on} disabled={busy === o.id + 'paid_on'} aria-pressed={!!o.paid_on} onclick={() => mark(o.id, 'paid_on', !o.paid_on)}>
					{o.paid_on ? `✓ 入金 ${md(o.paid_on)}` : '入金あり'}
				</button>
				<button type="button" class="step" class:on={!!o.shipped_on} disabled={busy === o.id + 'shipped_on'} aria-pressed={!!o.shipped_on} onclick={() => mark(o.id, 'shipped_on', !o.shipped_on)}>
					{o.shipped_on ? `✓ 発送 ${md(o.shipped_on)}` : '発送した'}
				</button>
				<button type="button" class="step" class:on={!!o.notified_on} disabled={busy === o.id + 'notified_on'} aria-pressed={!!o.notified_on} onclick={() => mark(o.id, 'notified_on', !o.notified_on)}>
					{o.notified_on ? `✓ 連絡 ${md(o.notified_on)}` : '連絡した'}
				</button>
			</div>
			<div class="item-buttons">
				<button type="button" class="btn btn-small" onclick={() => melon.copy(shippingLabel(o), '送り先')}>送り先をコピー</button>
				<button type="button" class="btn btn-small" onclick={() => melon.copy(shippedNotice(o, farm), '発送の連絡文')}>発送の連絡文をコピー</button>
				<button type="button" class="btn btn-small" onclick={() => onedit(o.id)}>直す</button>
			</div>
		</article>
	{:else}
		<p class="empty">{filter ? `${STAGE_LABELS[filter]}の申込はありません。` : `${melon.season}年の申込はまだありません。「＋ 申込を入れる」から入れてください。`}</p>
	{/each}
</div>

<style>
	/* 申込のカード：名前と段階 → 品物 → 進み具合のボタン（大きめ）→ コピーなど */
	.order { border-top: 1px solid var(--border); padding: 12px 0; display: grid; gap: 6px; }
	.order.done { opacity: 0.7; }
	.order-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
	.order-line { margin: 0; font-size: 0.9rem; }
	.order-line.memo { color: var(--muted); }
	.steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
	.step { font: inherit; font-size: 0.9rem; min-height: 44px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); color: var(--text); cursor: pointer; padding: 4px 6px; }
	.step.on { background: var(--brand-soft); border-color: var(--brand); color: var(--brand-dark); font-weight: bold; }
	.cap-input { width: 6em; display: inline-block; }
	.link-btn { background: none; border: none; padding: 0; color: var(--brand); text-decoration: underline; font: inherit; cursor: pointer; }
</style>
