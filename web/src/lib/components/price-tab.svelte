<script lang="ts">
	import { app, MAX_SERIES } from '#lib/app-state.svelte.js';
	import { costChange, publicChange, type Comparison } from '#lib/calc.js';
	import { categoryChart, indexChart, priceChart } from '#lib/charts.js';
	import { chgText, downloadCsv, pctPlain, periodText, seriesColor, yen } from '#lib/format.js';
	import type { Item } from '#lib/types.js';
	import ChangeBadge from './change-badge.svelte';
	import LineChart from './line-chart.svelte';
	import Tile from './tile.svelte';

	let search = $state('');
	let category = $state('');
	let sort = $state('yoy-desc');

	let year = $derived(app.ui.priceYear);
	let comps = $derived(app.items.map((item) => ({ item, c: app.compare(item, year) })));
	let withYoy = $derived(comps.filter((x) => x.c.yoy !== null && x.c.yoy !== undefined));
	let cost = $derived(costChange(app.items, app.stats, year));
	let total = $derived(app.pubMap.get('idx:農業生産資材総合') ?? null);
	let top = $derived([...withYoy].sort((a, b) => (b.c.yoy ?? 0) - (a.c.yoy ?? 0))[0]);

	// 初めて開いたときは、データが2年以上ある資材を自動で選ぶ
	$effect(() => {
		if (app.ui.chartTouched) return;
		const auto = app
			.sortItems(app.items)
			.filter((i) => Object.keys(app.stats.get(i.id) ?? {}).length >= 2)
			.slice(0, 3)
			.map((i, n) => ({ id: i.id, slot: n }));
		if (JSON.stringify(auto) !== JSON.stringify(app.ui.chartSel)) app.ui.chartSel = auto;
	});

	let rows = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const list = comps.filter((x) => (!category || x.item.category_id === category) && (!q || x.item.name.toLowerCase().includes(q)));
		const key = ({ 'yoy-desc': 'yoy', 'yoy-asc': 'yoy', 'r3-desc': 'r3', 'gap-desc': 'gap' } as Record<string, keyof Comparison>)[sort];
		if (!key) {
			const order = app.sortItems(list.map((x) => x.item));
			return order.map((i) => list.find((x) => x.item === i)!);
		}
		const dir = sort === 'yoy-asc' ? 1 : -1;
		return [...list].sort((a, b) => {
			const va = a.c[key] as number | null | undefined;
			const vb = b.c[key] as number | null | undefined;
			if (va === null || va === undefined) return 1;
			if (vb === null || vb === undefined) return -1;
			return (va - vb) * dir;
		});
	});

	function toggle<T extends { slot: number }>(list: T[], match: (x: T) => boolean, make: (slot: number) => T): T[] | null {
		if (list.some(match)) return list.filter((x) => !match(x));
		if (list.length >= MAX_SERIES) {
			app.toast(`グラフに表示できるのは${MAX_SERIES}つまでです。`, true);
			return null;
		}
		// 使われていない色の番号を割り当てる（ほかの線の色は変えない）
		let slot = 0;
		while (list.some((x) => x.slot === slot)) slot++;
		return [...list, make(slot)];
	}

	function toggleItem(item: Item) {
		app.ui.chartTouched = true;
		const next = toggle(app.ui.chartSel, (x) => x.id === item.id, (slot) => ({ id: item.id, slot }));
		if (next) app.ui.chartSel = next;
	}

	function toggleIndex(key: string) {
		const next = toggle(app.ui.indexSel, (x) => x.key === key, (slot) => ({ key, slot }));
		if (next) app.ui.indexSel = next;
	}

	let priceConfig = $derived.by(() => {
		const sources = app.ui.chartSel
			.map((s) => ({ s, item: app.findItem(s.id) }))
			.filter((x) => x.item)
			.map(({ s, item }) => ({
				item: item!,
				slot: s.slot,
				stats: app.stats.get(item!.id),
				purchases: app.purchases.get(item!.id) ?? [],
				series: app.seriesFor(item!)
			}));
		return sources.length ? priceChart(sources, app.ui.chartMode, year) : null;
	});

	let catYears = $derived([year - 2, year - 1, year]);
	let catRows = $derived(
		[
			...app.categories.map((c) => ({ label: c.name, items: app.items.filter((i) => i.category_id === c.id) })),
			{ label: '全体', items: app.items }
		]
			.map((g) => ({ label: g.label, values: catYears.map((y) => costChange(g.items, app.stats, y)) }))
			.filter((r) => r.values.some((v) => v.pct !== null))
	);

	let idxSeries = $derived(app.publicSeries.filter((s) => s.kind === 'idx'));
	let idxConfig = $derived.by(() => {
		const selected = app.ui.indexSel.map((x) => ({ series: app.pubMap.get(x.key)!, slot: x.slot })).filter((x) => x.series);
		return selected.length ? indexChart(selected, year - 3) : null;
	});

	function exportCsv() {
		const r = (v: number | null | undefined) => (v === null || v === undefined ? '' : Math.round(v));
		downloadCsv(
			[
				['資材名', 'カテゴリ', '基準年', '3年前の単価', '2年前の単価', '前年の単価', '基準年の単価', '前年比(%)', '3年前比(%)', '年平均の変動(%)', '全国 前年比(%)', '全国 3年前比(%)', '全国との差(pt)', '比べた全国データ'],
				...app.sortItems(app.items).map((i) => {
					const c = app.compare(i, year);
					return [i.name, app.categoryName(i.category_id), c.by ?? '', r(c.y3), r(c.y2), r(c.prev), r(c.cur), pctPlain(c.yoy), pctPlain(c.r3), pctPlain(c.cagr), pctPlain(c.pubYoy), pctPlain(c.pub3), pctPlain(c.gap), c.series?.name ?? ''];
				})
			],
			`shizai-kakaku-${year}.csv`
		);
	}
</script>

<div class="panel">
	<div class="panel-head">
		<h2>価格の変動</h2>
		<label class="inline">基準年
			<select bind:value={app.ui.priceYear}>
				{#each app.purchaseYears as y (y)}<option value={y}>{y}年</option>{/each}
			</select>
		</label>
	</div>
	<p class="note">年平均単価 ＝ その年の購入金額の合計 ÷ 購入数量の合計。全国の値は農林水産省「農業物価統計調査」（同じ月どうしで比較）。</p>
	<div class="tiles">
		<Tile label="資材費の変動率（{year}年・前年比）" change={cost.pct} sub={cost.n ? `${cost.n}品目で計算` : '前年と両方の購入記録が必要'} />
		<Tile label="全国の資材価格（総合・前年比）" change={publicChange(total, year, 1)} sub={total ? `3年前比 ${chgText(publicChange(total, year, 3))}` : '全国データ未取得'} />
		<Tile
			label="値上がり／値下がりした資材"
			value="{withYoy.filter((x) => (x.c.yoy ?? 0) >= 0.05).length} ／ {withYoy.filter((x) => (x.c.yoy ?? 0) <= -0.05).length}"
			sub="前年比が出せる {withYoy.length} 品目中"
		/>
		<Tile label="いちばん上がった資材" value={top?.item.name ?? '—'}>{#if top}<ChangeBadge value={top.c.yoy} />{/if}</Tile>
	</div>
</div>

<div class="panel">
	<div class="panel-head">
		<h2>価格の推移</h2>
		<div class="seg" role="group" aria-label="表示の切り替え">
			<button type="button" class:active={app.ui.chartMode === 'yen'} onclick={() => (app.ui.chartMode = 'yen')}>金額（円）</button>
			<button type="button" class:active={app.ui.chartMode === 'index'} onclick={() => (app.ui.chartMode = 'index')}>指数（最初の年＝100）</button>
		</div>
	</div>
	<p class="note">下の表で ☑ を付けた資材（最大{MAX_SERIES}つ）を表示します。「指数」にすると全国の値動き（点線）と比べられます。</p>
	{#if priceConfig}
		<LineChart config={priceConfig} label="資材の価格推移のグラフ" tall />
	{:else}
		<p class="empty">下の表で ☑ を付けると、その資材の価格推移を表示します。</p>
	{/if}
</div>

<div class="panel">
	<div class="panel-head">
		<h2>資材ごとの変動率</h2>
		<button type="button" class="btn" onclick={exportCsv}>CSVで出力</button>
	</div>
	<div class="filters three">
		<input type="search" bind:value={search} placeholder="資材名で検索" aria-label="検索" />
		<select bind:value={category} aria-label="カテゴリ">
			<option value="">すべてのカテゴリ</option>
			{#each app.categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
		</select>
		<select bind:value={sort} aria-label="並べ替え">
			<option value="yoy-desc">前年比の大きい順</option>
			<option value="yoy-asc">前年比の小さい順</option>
			<option value="r3-desc">3年前比の大きい順</option>
			<option value="gap-desc">全国との差の大きい順</option>
			<option value="name">資材名順</option>
		</select>
	</div>
	<div class="table-scroll">
		<table class="data-table">
			<thead>
				<tr>
					<th>グラフ</th><th class="sticky-col">資材名</th><th class="num">3年前</th><th class="num">2年前</th><th class="num">前年</th>
					<th class="num">基準年</th><th class="num">前年比</th><th class="num">3年前比</th><th class="num">年平均の変動</th>
					<th class="num">全国 前年比</th><th class="num">全国 3年前比</th><th class="num">全国との差</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as { item, c } (item.id)}
					{@const sel = app.ui.chartSel.find((s) => s.id === item.id)}
					<tr>
						<td>
							<label class="inline">
								<input type="checkbox" checked={!!sel} disabled={!c.hasData} onchange={() => toggleItem(item)} aria-label="{item.name}をグラフに表示" />
								{#if sel}<span class="swatch" style="background:{seriesColor(sel.slot)}"></span>{/if}
							</label>
						</td>
						<td class="sticky-col">
							<button type="button" class="item-name" onclick={() => (app.modal = { kind: 'detail', id: item.id })}>{item.name}</button>{#if item.spec}<span class="spec">{item.spec}</span>{/if}{#if c.yoy !== null && c.yoy !== undefined && c.yoy >= Number(app.household?.price_alert_pct)}<span class="badge badge-danger">値上がり注意</span>{/if}
							<div class="chg-sub">
								{app.categoryName(item.category_id)}{c.hasData && c.by !== year ? `・${c.by}年が基準` : ''}{c.series ? `・全国：${c.series.name}` : ''}
							</div>
						</td>
						{#if !c.hasData}
							<td colspan="10" class="chg-sub">購入記録がありません（入庫か「過去の購入」を記録してください）</td>
						{:else}
							<td class="num">{yen(c.y3)}</td>
							<td class="num">{yen(c.y2)}</td>
							<td class="num">{yen(c.prev)}</td>
							<td class="num"><b>{yen(c.cur)}</b></td>
							<td class="num">{#if c.prev}<ChangeBadge value={c.yoy} />{:else}<span class="chg-sub">{(c.by ?? 0) - 1}年のデータなし</span>{/if}</td>
							<td class="num">{#if c.y3}<ChangeBadge value={c.r3} />{:else}<span class="chg-sub">{(c.by ?? 0) - 3}年のデータなし</span>{/if}</td>
							<td class="num">{#if c.cagr === null || c.cagr === undefined}<span class="chg na">—</span>{:else}<span class="chg-sub">毎年 {pctPlain(c.cagr)}%</span>{/if}</td>
							<td class="num"><ChangeBadge value={c.pubYoy} /></td>
							<td class="num"><ChangeBadge value={c.pub3} /></td>
							<td class="num">
								{#if c.gap === null || c.gap === undefined}<span class="chg na">—</span>
								{:else}<span class="chg {c.gap > 0.05 ? 'up' : c.gap < -0.05 ? 'down' : 'flat'}">{pctPlain(c.gap)}pt</span>{/if}
							</td>
						{/if}
					</tr>
				{:else}
					<tr><td colspan="12" class="empty">資材がありません。</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<div class="panel">
	<h2>カテゴリ別の資材費の変動率</h2>
	<p class="note">「前の年と同じ量を買ったら、資材費が何％変わるか」。両方の年に購入記録がある資材だけで計算します。</p>
	{#if catRows.length}
		<LineChart config={categoryChart(catRows, catYears)} label="カテゴリ別の資材費の変動率のグラフ" />
	{/if}
	<div class="table-scroll">
		<table class="data-table">
			<thead><tr><th>カテゴリ</th>{#each catYears as y (y)}<th class="num">{y}年</th>{/each}</tr></thead>
			<tbody>
				{#each catRows as r (r.label)}
					<tr class:total={r.label === '全体'}>
						<td>{r.label}</td>
						{#each r.values as v, i (i)}
							<td class="num"><ChangeBadge value={v.pct} />{#if v.n}<div class="chg-sub">{v.n}品目</div>{/if}</td>
						{/each}
					</tr>
				{:else}
					<tr><td colspan="4" class="empty">2年続けて購入記録がある資材がまだありません。</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<div class="panel">
	<div class="panel-head">
		<h2>全国の農業生産資材価格指数</h2>
		{#if app.status?.public_latest_period}<span class="note">最新：{periodText(app.status.public_latest_period)}分</span>{/if}
	</div>
	<p class="note">2020年＝100。選んだ類別（最大{MAX_SERIES}つ）の月ごとの推移です。出典：農林水産省「農業物価統計調査」</p>
	{#if idxSeries.length}
		<div class="chips">
			{#each idxSeries as s (s.key)}
				{@const sel = app.ui.indexSel.find((x) => x.key === s.key)}
				<button type="button" class="chip" class:active={!!sel} aria-pressed={!!sel} onclick={() => toggleIndex(s.key)}>
					{#if sel}<span class="swatch" style="background:{seriesColor(sel.slot)}"></span>{/if}{s.name}
				</button>
			{/each}
		</div>
		{#if idxConfig}<LineChart config={idxConfig} label="全国の農業生産資材価格指数のグラフ" />{/if}
	{:else}
		<p class="empty">全国データがまだ取得されていません。設定タブの「今すぐ取得」を押してください。</p>
	{/if}
</div>
