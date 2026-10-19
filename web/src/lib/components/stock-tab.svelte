<script lang="ts">
	import { app, readJson } from '#lib/app-state.svelte.js';
	import { costChange, publicChange } from '#lib/calc.js';
	import { dictionaryText } from '#lib/dictionary.js';
	import { draftKey, draftRows, type StocktakeDraft } from '#lib/stocktake.js';
	import { chgText, downloadCsv, fmt, pctPlain, yen } from '#lib/format.js';
	import type { Item } from '#lib/types.js';
	import ChangeBadge from './change-badge.svelte';
	import StocktakeView from './stocktake-view.svelte';
	import Tile from './tile.svelte';

	let search = $state('');
	let category = $state('');
	let supplier = $state('');
	let status = $state('');

	// 棚卸しの画面を開いているか。途中の下書きがあれば、件数を知らせる
	let stocktaking = $state(false);
	let draftCount = $derived.by(() => {
		if (stocktaking || !app.householdId) return 0;
		const d = readJson<StocktakeDraft>(draftKey(app.householdId));
		return d ? draftRows(d, app.items).length : 0;
	});

	const thisYear = new Date().getFullYear();

	let list = $derived(
		app.sortItems(
			app.items.filter((item) => {
				if (category && item.category_id !== category) return false;
				if (supplier && item.supplier !== supplier) return false;
				const q = search.trim().toLowerCase();
				if (q && !`${item.name} ${item.memo} ${item.supplier} ${item.purpose} ${dictionaryText(item)}`.toLowerCase().includes(q)) return false;
				if (status) {
					const keys = app.tagsOf(item).map((t) => t.key);
					if (status === 'attention' ? !keys.length : !keys.includes(status as never)) return false;
				}
				return true;
			})
		)
	);

	let stockValue = $derived(list.reduce((sum, i) => sum + Math.round((Number(i.stock) || 0) * (Number(i.price) || 0)), 0));
	let bought = $derived(
		[...app.purchases.values()].flat().reduce((sum, p) => (p.year === thisYear ? sum + p.price * p.qty : sum), 0)
	);
	let cost = $derived(costChange(app.items, app.stats, thisYear));
	let total = $derived(app.pubMap.get('idx:農業生産資材総合') ?? null);
	let attention = $derived(app.sortItems(app.items).map((item) => ({ item, tags: app.tagsOf(item) })).filter((x) => x.tags.length));

	function exportCsv() {
		downloadCsv(
			[
				['資材名', 'カテゴリ', '在庫数', '単位', '単価', '合計金額', '発注の目安', '使用期限', '購入先', '用途', 'メモ', '前年比(%)', '更新日時', '更新者'],
				...app.sortItems(app.items).map((i) => [
					i.name, app.categoryName(i.category_id), i.stock, i.unit, i.price, Math.round(i.stock * i.price), i.reorder_level, i.expiry,
					i.supplier, i.purpose, i.memo, pctPlain(app.compare(i, thisYear).yoy), i.updated_at, app.memberName(i.updated_by)
				])
			],
			`shizai-zaiko-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`
		);
	}

	function cardClass(item: Item) {
		const keys = app.tagsOf(item).map((t) => t.key);
		return keys.includes('out') ? 'is-out' : keys.includes('low') ? 'is-low' : '';
	}
</script>

{#if stocktaking}
<StocktakeView onclose={() => (stocktaking = false)} />
{:else}
{#if draftCount}
	<div class="panel attention">
		<p>棚卸しの途中です（{draftCount} 品目を入力済み）。 <button type="button" class="btn btn-small" onclick={() => (stocktaking = true)}>続きから再開</button></p>
	</div>
{/if}

<div class="tiles">
	<Tile label="品目数" value="{list.length} 品目" sub={list.length === app.items.length ? '' : `全 ${app.items.length} 品目中`} />
	<Tile label="在庫金額" value={yen(stockValue)} sub="表示中の資材の合計" />
	<Tile label="{thisYear}年の購入金額" value={yen(bought)} sub="入庫・過去の購入" />
	<Tile
		label="資材費の前年比"
		change={cost.pct}
		sub={cost.n ? `${cost.n}品目で計算${total ? `／全国 ${chgText(publicChange(total, thisYear, 1))}` : ''}` : '前年と今年の購入記録が必要'}
	/>
</div>

{#if attention.length}
	<div class="panel attention">
		<h2>注意が必要な資材（{attention.length}件）</h2>
		<ul>
			{#each attention.slice(0, 30) as { item, tags } (item.id)}
				<li>
					<button type="button" class="item-name" onclick={() => (app.modal = { kind: 'detail', id: item.id })}>{item.name}</button>
					{#each tags as t, i (i)}<span class="badge badge-{t.level}">{t.text}</span>{/each}
					<span class="chg-sub">在庫 {fmt(item.stock)}{item.unit}{item.expiry ? `・期限 ${item.expiry}` : ''}</span>
				</li>
			{/each}
		</ul>
		{#if attention.length > 30}<p class="note">ほか {attention.length - 30} 件</p>{/if}
	</div>
{/if}

<div class="panel">
	<div class="panel-head">
		<h2>在庫一覧</h2>
		<div class="item-buttons">
			<button type="button" class="btn" onclick={() => (stocktaking = true)}>📋 棚卸し</button>
			<button type="button" class="btn btn-primary" onclick={() => (app.modal = { kind: 'item', id: null })}>＋ 資材を登録</button>
		</div>
	</div>
	<div class="filters">
		<input type="search" bind:value={search} placeholder="資材名・用途・メモ・購入先で検索" aria-label="検索" />
		<select bind:value={category} aria-label="カテゴリ">
			<option value="">すべてのカテゴリ</option>
			{#each app.categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
		</select>
		<select bind:value={supplier} aria-label="購入先">
			<option value="">すべての購入先</option>
			{#each app.suppliers as s (s)}<option value={s}>{s}</option>{/each}
		</select>
		<select bind:value={status} aria-label="状態">
			<option value="">すべての状態</option>
			<option value="attention">注意が必要なもの</option>
			<option value="out">在庫切れ</option>
			<option value="low">残りわずか</option>
			<option value="expiry">期限切れ・期限間近</option>
			<option value="priceup">値上がり注意</option>
		</select>
	</div>

	{#each list as item (item.id)}
		{@const c = app.compare(item, thisYear)}
		{@const tags = app.tagsOf(item)}
		{@const files = app.manualsOf(item.id).length}
		<div class="item-card {cardClass(item)}">
			<div>
				<button type="button" class="item-name" onclick={() => (app.modal = { kind: 'detail', id: item.id })}>{item.name}</button>
				<div class="item-tags">
					<span class="badge">{app.categoryName(item.category_id)}</span>
					{#each tags as t, i (i)}<span class="badge badge-{t.level}">{t.text}</span>{/each}
					{#if item.supplier}<span class="chg-sub">{item.supplier}</span>{/if}
					{#if files}<span class="badge" title="取扱説明書">📎 {files}</span>{/if}
				</div>
				{#if item.purpose}<div class="chg-sub">用途：{item.purpose}</div>{/if}
				{#if item.memo}<div class="chg-sub">{item.memo}</div>{/if}
			</div>
			<div class="item-money">
				<div class="item-total">{yen(item.stock * item.price)}</div>
				<div class="item-price">{yen(item.price)}{item.unit ? ` / ${item.unit}` : ''}</div>
				<div class="item-trend">
					{#if c.hasData}
						前年比 <ChangeBadge value={c.yoy} />
						{#if c.by !== thisYear}<span class="chg-sub">（{c.by}年）</span>{/if}
						{#if c.series}<div class="chg-sub">全国 {chgText(c.pubYoy)}</div>{/if}
					{:else}
						<span class="chg-sub">購入記録なし</span>
					{/if}
				</div>
			</div>
			<div class="item-actions">
				<div class="stepper">
					<button type="button" aria-label="在庫を1減らす" onclick={() => app.quickAdjust(item.id, -1)}>−</button>
					<span class="stock">{fmt(item.stock)}{item.unit}</span>
					<button type="button" aria-label="在庫を1増やす" onclick={() => app.quickAdjust(item.id, 1)}>＋</button>
				</div>
				<div class="item-buttons">
					<button type="button" class="btn btn-small" onclick={() => (app.modal = { kind: 'move', id: item.id, move: '入庫' })}>入庫</button>
					<button type="button" class="btn btn-small" onclick={() => (app.modal = { kind: 'move', id: item.id, move: '出庫' })}>出庫</button>
					<button type="button" class="btn btn-small" onclick={() => (app.modal = { kind: 'item', id: item.id })}>編集</button>
				</div>
			</div>
		</div>
	{:else}
		<p class="empty">{app.items.length ? '条件に合う資材がありません。' : '資材が登録されていません。「＋ 資材を登録」から登録してください。'}</p>
	{/each}
	<div class="list-foot"><button type="button" class="btn" onclick={exportCsv}>CSVで出力</button></div>
</div>
{/if}
