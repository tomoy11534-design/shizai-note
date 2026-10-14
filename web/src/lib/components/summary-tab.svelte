<script lang="ts">
	import { app } from '#lib/app-state.svelte.js';
	import { PURCHASE_TYPES } from '#lib/calc.js';
	import { fmt } from '#lib/format.js';

	const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
	const colLabel = (m: number) => (m ? `${m}月` : '月不明');
	const money = (v: number | undefined) => (v ? Math.round(v).toLocaleString('ja-JP') : '');

	let year = $derived(app.ui.summaryYear);

	// 月別・カテゴリ別の購入金額（「年だけ」の購入は月不明＝0）
	let amount = $derived.by(() => {
		const map = new Map<string, Record<number, number>>();
		for (const list of app.purchases.values()) {
			for (const p of list) {
				if (p.year !== year) continue;
				const cat = p.event.category_name || 'その他';
				const row = map.get(cat) ?? {};
				row[p.month ?? 0] = (row[p.month ?? 0] ?? 0) + p.price * p.qty;
				map.set(cat, row);
			}
		}
		return map;
	});
	let amountCols = $derived([...MONTHS, ...([...amount.values()].some((r) => r[0]) ? [0] : [])]);
	let amountRows = $derived([
		...app.categories.map((c) => c.name).filter((n) => amount.has(n)),
		...[...amount.keys()].filter((n) => !app.categories.some((c) => c.name === n))
	]);
	const sum = (row: Record<number, number> | undefined, cols: number[]) => cols.reduce((s, m) => s + (row?.[m] ?? 0), 0);

	// 資材ごとの月別入出庫数
	let qty = $derived.by(() => {
		const map = new Map<string, { name: string; inn: Record<number, number>; out: Record<number, number> }>();
		for (const e of app.events) {
			if (e.cancelled || !e.item_id || e.event_date.slice(0, 4) !== String(year)) continue;
			const isIn = PURCHASE_TYPES.includes(e.type);
			if (!isIn && e.type !== '出庫') continue;
			const m = e.date_precision === 'year' ? 0 : Number(e.event_date.slice(5, 7));
			const q = Math.abs(Number(e.qty) || 0) || (isIn ? 1 : 0);
			const r = map.get(e.item_id) ?? { name: e.item_name, inn: {}, out: {} };
			const side = isIn ? r.inn : r.out;
			side[m] = (side[m] ?? 0) + q;
			map.set(e.item_id, r);
		}
		return [...map].sort((a, b) => a[1].name.localeCompare(b[1].name, 'ja'));
	});
	let qtyCols = $derived([...MONTHS, ...(qty.some(([, r]) => r.inn[0] || r.out[0]) ? [0] : [])]);
	const total = (side: Record<number, number>) => Object.values(side).reduce((s, v) => s + v, 0);
</script>

<div class="panel">
	<div class="panel-head">
		<h2>月別・カテゴリ別の購入金額</h2>
		<label class="inline">年
			<select bind:value={app.ui.summaryYear}>
				{#each app.purchaseYears as y (y)}<option value={y}>{y}年</option>{/each}
			</select>
		</label>
	</div>
	<p class="note">入庫と過去の購入の金額の合計です（円）。登録したときの最初の在庫は含みません。</p>
	<div class="table-scroll">
		<table class="data-table compact">
			<thead>
				<tr><th class="sticky-col">カテゴリ</th>{#each amountCols as m (m)}<th class="num">{colLabel(m)}</th>{/each}<th class="num">合計</th></tr>
			</thead>
			<tbody>
				{#each amountRows as cat (cat)}
					<tr>
						<td class="sticky-col">{cat}</td>
						{#each amountCols as m (m)}<td class="num">{money(amount.get(cat)?.[m])}</td>{/each}
						<td class="num">{money(sum(amount.get(cat), amountCols))}</td>
					</tr>
				{:else}
					<tr><td colspan="15" class="empty">{year}年の購入記録はありません。</td></tr>
				{/each}
				{#if amountRows.length}
					<tr class="total">
						<td class="sticky-col">合計</td>
						{#each amountCols as m (m)}<td class="num">{money(amountRows.reduce((s, c) => s + (amount.get(c)?.[m] ?? 0), 0))}</td>{/each}
						<td class="num">{money(amountRows.reduce((s, c) => s + sum(amount.get(c), amountCols), 0))}</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>

<div class="panel">
	<h2>資材ごとの月別入出庫数</h2>
	<p class="note">「入」が入庫（購入）、「出」が出庫の数量です。</p>
	<div class="table-scroll">
		<table class="data-table compact">
			<thead>
				<tr><th class="sticky-col">資材名</th>{#each qtyCols as m (m)}<th class="num">{colLabel(m)}</th>{/each}<th class="num">合計</th></tr>
			</thead>
			<tbody>
				{#each qty as [id, r] (id)}
					{@const unit = app.findItem(id)?.unit ?? ''}
					<tr>
						<td class="sticky-col">{r.name}{#if unit}<div class="chg-sub">単位：{unit}</div>{/if}</td>
						{#each qtyCols as m (m)}
							<td class="num">
								{#if r.inn[m]}<div>入 {fmt(r.inn[m])}</div>{/if}
								{#if r.out[m]}<div class="chg-sub">出 {fmt(r.out[m])}</div>{/if}
							</td>
						{/each}
						<td class="num"><div>入 {fmt(total(r.inn))}</div><div class="chg-sub">出 {fmt(total(r.out))}</div></td>
					</tr>
				{:else}
					<tr><td colspan="15" class="empty">{year}年の入出庫の記録はありません。</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
