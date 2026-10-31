// 価格の変動率などの計算（画面やサーバーに依存しない純粋な関数）
import type { Category, Household, Item, PublicSeries, StockEvent } from './types.js';

export const PURCHASE_TYPES = ['入庫', '過去の購入'];
export const CANCELABLE_TYPES = ['入庫', '出庫', '調整', '過去の購入', '棚卸し'];

export interface Purchase {
	event: StockEvent;
	year: number;
	month: number | null; // 年だけ分かっている購入は null
	price: number;
	qty: number;
}

export interface YearStat {
	amt: number;
	qty: number;
	n: number;
	avg: number | null;
}

export type YearStats = Record<number, YearStat>;

export interface Comparison {
	hasData: boolean;
	series: PublicSeries | null;
	by?: number; // 実際に基準にした年
	cur?: number | null;
	prev?: number | null;
	y2?: number | null;
	y3?: number | null;
	yoy?: number | null;
	r3?: number | null;
	cagr?: number | null;
	pubYoy?: number | null;
	pub3?: number | null;
	gap?: number | null;
}

export function average(list: number[]): number | null {
	return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
}

// 変動率（％）
export function rate(current: number | null | undefined, base: number | null | undefined): number | null {
	return current !== null && current !== undefined && base ? (current / base - 1) * 100 : null;
}

// 履歴から、資材ごとの購入記録を取り出す（取り消したもの・資材を削除したものは除く）
export function purchasesByItem(events: StockEvent[]): Map<string, Purchase[]> {
	const map = new Map<string, Purchase[]>();
	for (const e of events) {
		if (!PURCHASE_TYPES.includes(e.type) || e.cancelled || !e.item_id || e.unit_price === null) continue;
		const year = Number(e.event_date.slice(0, 4));
		if (!year) continue;
		const purchase: Purchase = {
			event: e,
			year,
			month: e.date_precision === 'year' ? null : Number(e.event_date.slice(5, 7)),
			price: Number(e.unit_price),
			qty: Math.abs(Number(e.qty) || 0) || 1
		};
		const list = map.get(e.item_id) ?? [];
		list.push(purchase);
		map.set(e.item_id, list);
	}
	return map;
}

// 年平均単価 ＝ その年の購入金額の合計 ÷ その年の購入数量の合計（数量で重み付け）
export function yearStatsOf(purchases: Purchase[]): YearStats {
	const stats: YearStats = {};
	for (const p of purchases) {
		const s = (stats[p.year] ??= { amt: 0, qty: 0, n: 0, avg: null });
		s.amt += p.price * p.qty;
		s.qty += p.qty;
		s.n++;
	}
	for (const s of Object.values(stats)) s.avg = s.qty ? s.amt / s.qty : null;
	return stats;
}

// 全国データの変動率：基準年にある月と同じ月どうしの平均で比べる
export function publicChange(series: PublicSeries | null, year: number, back: number): number | null {
	if (!series) return null;
	const months = Object.keys(series.data)
		.filter((k) => k.startsWith(`${year}-`))
		.map((k) => k.slice(5))
		.filter((m) => series.data[`${year - back}-${m}`] !== undefined);
	if (!months.length) return null;
	const a = average(months.map((m) => series.data[`${year}-${m}`]));
	const b = average(months.map((m) => series.data[`${year - back}-${m}`]));
	return rate(a, b);
}

// 全国データのその年の平均（取得できている月だけ）
export function publicYearAvg(series: PublicSeries | null, year: number): number | null {
	if (!series) return null;
	return average(
		Object.keys(series.data)
			.filter((k) => k.startsWith(`${year}-`))
			.map((k) => series.data[k])
	);
}

export function latestPublic(series: PublicSeries | null) {
	if (!series) return null;
	const keys = Object.keys(series.data).sort();
	if (!keys.length) return null;
	const period = keys[keys.length - 1];
	return { period, value: series.data[period], prov: series.prov.includes(period) };
}

/**
 * 資材の価格比較
 * 基準年に購入がなければ、基準年以前でデータがある最新の年を基準にする
 */
export function compare(stats: YearStats | undefined, series: PublicSeries | null, baseYear: number): Comparison {
	const ys = stats ?? {};
	const years = Object.keys(ys)
		.map(Number)
		.filter((y) => y <= baseYear)
		.sort((a, b) => a - b);
	const res: Comparison = { hasData: years.length > 0, series };
	if (!years.length) return res;

	const by = years[years.length - 1];
	const avgOf = (y: number) => ys[y]?.avg ?? null;
	res.by = by;
	res.cur = avgOf(by);
	res.prev = avgOf(by - 1);
	res.y2 = avgOf(by - 2);
	res.y3 = avgOf(by - 3);
	res.yoy = rate(res.cur, res.prev);
	res.r3 = rate(res.cur, res.y3);
	res.cagr = res.y3 && res.cur !== null ? (Math.pow(res.cur / res.y3, 1 / 3) - 1) * 100 : null;
	if (series) {
		res.pubYoy = publicChange(series, by, 1);
		res.pub3 = publicChange(series, by, 3);
	}
	res.gap = res.yoy !== null && res.pubYoy !== null && res.pubYoy !== undefined ? res.yoy - res.pubYoy : null;
	return res;
}

/**
 * 資材費全体の変動率（前の年と同じ量を買った場合に何％変わるか）
 * Σ（今年の単価 × 前年の数量）÷ Σ（前年の単価 × 前年の数量）− 1
 */
export function costChange(items: Item[], statsMap: Map<string, YearStats>, year: number) {
	let a = 0;
	let b = 0;
	let n = 0;
	for (const item of items) {
		const s = statsMap.get(item.id);
		const now = s?.[year];
		const before = s?.[year - 1];
		if (!now?.avg && now?.avg !== 0) continue;
		if (!before?.avg) continue;
		a += now.avg * before.qty;
		b += before.avg * before.qty;
		n++;
	}
	return { pct: b ? (a / b - 1) * 100 : null, n };
}

// 資材が比べる全国データ（資材の設定 → カテゴリの設定の順）
export function publicRefOf(item: Item, categories: Category[]): string {
	if (item.public_ref) return item.public_ref;
	return categories.find((c) => c.id === item.category_id)?.public_ref ?? '';
}

export interface Tag {
	key: 'out' | 'low' | 'expiry' | 'priceup';
	text: string;
	level: 'danger' | 'warn';
}

// 日付文字列（yyyy-mm-dd）に日数を足す
export function addDays(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

// 資材の注意表示（在庫切れ・残りわずか・期限・値上がり）
export function itemTags(item: Item, today: string, settings: Pick<Household, 'alert_days' | 'price_alert_pct' | 'gap_alert_pts'>, cmp?: Comparison): Tag[] {
	const tags: Tag[] = [];
	const stock = Number(item.stock) || 0;
	if (stock <= 0) tags.push({ key: 'out', text: '在庫切れ', level: 'danger' });
	else if (item.reorder_level !== null && stock <= Number(item.reorder_level)) {
		tags.push({ key: 'low', text: '残りわずか', level: 'warn' });
	}
	if (item.expiry) {
		if (item.expiry < today) tags.push({ key: 'expiry', text: '期限切れ', level: 'danger' });
		else if (item.expiry <= addDays(today, Number(settings.alert_days) || 30)) {
			tags.push({ key: 'expiry', text: '期限間近', level: 'warn' });
		}
	}
	if (cmp?.yoy !== null && cmp?.yoy !== undefined && cmp.yoy >= Number(settings.price_alert_pct)) {
		tags.push({ key: 'priceup', text: '値上がり注意', level: 'warn' });
	}
	if (cmp?.gap !== null && cmp?.gap !== undefined && cmp.gap >= Number(settings.gap_alert_pts)) {
		tags.push({ key: 'priceup', text: '全国より高め', level: 'warn' });
	}
	return tags;
}

// 直近1年に購入か使用の記録がある資材（登録や棚卸しだけでは「使っている」とみなさない）
export function recentItemIds(events: StockEvent[], today: string): Set<string> {
	const since = addDays(today, -365);
	const ids = new Set<string>();
	for (const e of events) {
		if (e.item_id && !e.cancelled && e.event_date >= since && [...PURCHASE_TYPES, '出庫'].includes(e.type)) ids.add(e.item_id);
	}
	return ids;
}

// 日本時間の今日（yyyy-mm-dd）
export function todayJst(now = new Date()): string {
	return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
