<script lang="ts">
	import { app } from '#lib/app-state.svelte.js';
	import { latestPublic, PURCHASE_TYPES, publicChange, rate } from '#lib/calc.js';
	import { priceChart } from '#lib/charts.js';
	import { chgText, fmt, periodText, yen } from '#lib/format.js';
	import ChangeBadge from './change-badge.svelte';
	import FileCard from './file-card.svelte';
	import HistoryRow from './history-row.svelte';
	import LineChart from './line-chart.svelte';
	import Tile from './tile.svelte';

	// 資材の詳細
	let { id }: { id: string } = $props();

	let item = $derived(app.findItem(id));
	let c = $derived(item ? app.compare(item, app.ui.priceYear) : null);
	let ys = $derived(app.stats.get(id) ?? {});
	let years = $derived(Object.keys(ys).map(Number).sort((a, b) => b - a));
	let series = $derived(item ? app.seriesFor(item) : null);
	let latest = $derived(latestPublic(series));
	let purchases = $derived(
		app.events
			.filter((e) => e.item_id === id && PURCHASE_TYPES.includes(e.type))
			.sort((a, b) => b.event_date.localeCompare(a.event_date) || b.created_at.localeCompare(a.created_at))
	);
	let recent = $derived(app.events.filter((e) => e.item_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10));
	let files = $derived(app.manualsOf(id));
	let config = $derived(
		item && years.length
			? priceChart([{ item, slot: 0, stats: ys, purchases: app.purchases.get(id) ?? [], series }], 'yen', Math.max(app.ui.priceYear, years[0]), true)
			: null
	);
</script>

{#if item && c}
	<div class="item-tags" style="margin-bottom:8px">
		<span class="badge">{app.categoryName(item.category_id)}</span>
		{#each app.tagsOf(item) as t, i (i)}<span class="badge badge-{t.level}">{t.text}</span>{/each}
		{#if item.supplier}<span class="chg-sub">購入先：{item.supplier}</span>{/if}
	</div>

	<div class="detail-stats">
		<Tile label="在庫" value="{fmt(item.stock)}{item.unit}" sub="合計 {yen(item.stock * item.price)}" />
		<Tile label="最新の単価" value={yen(item.price)} sub={item.last_purchase_date ? `${item.last_purchase_date} 購入` : ''} />
		<Tile label="前年比{c.by ? `（${c.by}年）` : ''}" change={c.yoy} sub="3年前比 {chgText(c.r3)}" />
		<Tile label="全国の前年比" change={c.pubYoy} sub={series ? series.name : '比べるデータなし'} />
	</div>

	<div class="form-actions" style="margin-bottom:10px">
		<button type="button" class="btn" onclick={() => (app.modal = { kind: 'move', id, move: '入庫' })}>入庫</button>
		<button type="button" class="btn" onclick={() => (app.modal = { kind: 'move', id, move: '出庫' })}>出庫</button>
		<button type="button" class="btn" onclick={() => (app.modal = { kind: 'past', id })}>過去の購入を記録</button>
		<button type="button" class="btn" onclick={() => (app.modal = { kind: 'item', id })}>編集</button>
	</div>

	<p class="purpose" class:empty-purpose={!item.purpose}><span class="purpose-label">用途</span>{item.purpose || '未入力（「編集」から入力できます）'}</p>

	<h3>取扱説明書（{files.length}件）</h3>
	{#if files.length}
		<div class="files">{#each files as m (m.id)}<FileCard manual={m} />{/each}</div>
	{:else}
		<p class="note">まだ登録されていません。</p>
	{/if}
	<div class="form-actions" style="margin:8px 0 10px">
		<button type="button" class="btn" onclick={() => (app.modal = { kind: 'upload', id, back: true })}>＋ 説明書を追加（PDF・画像）</button>
	</div>

	<h3>価格の推移</h3>
	{#if config}
		<LineChart {config} label="{item.name}の価格推移" />
	{:else}
		<p class="empty">購入記録がありません。「入庫」か「過去の購入を記録」で価格を記録してください。</p>
	{/if}
	{#if latest && series}
		<p class="note">
			全国：{series.name}{series.kind === 'item' ? `（${series.unit}）` : ''}
			{series.kind === 'item' ? yen(latest.value) : latest.value}（{periodText(latest.period)}{latest.prov ? '・速報' : ''}）
		</p>
	{/if}

	{#if years.length}
		<h3>年ごとの平均単価</h3>
		<div class="table-scroll">
			<table class="data-table">
				<thead><tr><th>年</th><th class="num">年平均単価</th><th class="num">数量</th><th class="num">回数</th><th class="num">前年比</th><th class="num">全国 前年比</th></tr></thead>
				<tbody>
					{#each years as y (y)}
						<tr>
							<td>{y}年</td>
							<td class="num">{yen(ys[y].avg)}</td>
							<td class="num">{fmt(ys[y].qty)}{item.unit}</td>
							<td class="num">{ys[y].n}</td>
							<td class="num"><ChangeBadge value={ys[y - 1] ? rate(ys[y].avg, ys[y - 1].avg) : null} /></td>
							<td class="num"><ChangeBadge value={publicChange(series, y, 1)} /></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	{#if purchases.length}
		<h3>購入の記録</h3>
		<div class="table-scroll">
			<table class="data-table">
				<thead><tr><th>購入日</th><th class="num">数量</th><th class="num">単価</th><th class="num">金額</th><th>購入先</th></tr></thead>
				<tbody>
					{#each purchases as e (e.id)}
						<tr class:is-cancelled={e.cancelled}>
							<td>{e.date_precision === 'year' ? `${e.event_date.slice(0, 4)}年` : e.event_date}{#if e.type === '過去の購入'}<div class="chg-sub">過去の購入</div>{/if}</td>
							<td class="num">{fmt(Math.abs(e.qty ?? 0))}{item.unit}</td>
							<td class="num">{yen(e.unit_price)}</td>
							<td class="num">{yen(e.amount)}</td>
							<td>{e.supplier}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="note">間違えた記録は、下の「最近の記録」か履歴タブの「取消」で取り消せます。</p>
	{/if}

	<h3>最近の記録</h3>
	{#each recent as e (e.id)}<HistoryRow event={e} />{:else}<p class="empty">記録がありません。</p>{/each}

	{#if item.memo}<h3>メモ</h3><p class="pre">{item.memo}</p>{/if}
{:else}
	<p class="empty">この資材は削除されました。</p>
{/if}
