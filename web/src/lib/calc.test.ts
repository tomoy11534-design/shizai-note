import { describe, expect, it } from 'vitest';
import { compare, costChange, itemTags, publicChange, purchasesByItem, recentItemIds, yearStatsOf } from './calc.js';
import type { Item, PublicSeries, StockEvent } from './types.js';

// テスト用の購入記録を作る
function ev(p: Partial<StockEvent>): StockEvent {
	return {
		id: Math.random().toString(36),
		household_id: 'h',
		item_id: 'a',
		item_name: '肥料A',
		category_name: '肥料',
		type: '入庫',
		event_date: '2026-04-01',
		date_precision: 'day',
		qty: 1,
		stock_after: 0,
		unit_price: 1000,
		amount: 1000,
		discount: null,
		tax: null,
		amount_ex_tax: null,
		supplier: '',
		memo: '',
		cancelled: false,
		ref_id: null,
		user_id: null,
		created_at: '2026-04-01T00:00:00Z',
		...p
	};
}

const item = (p: Partial<Item> = {}): Item => ({
	id: 'a',
	household_id: 'h',
	name: '肥料A',
	spec: '',
	product_code: '',
	category_id: 'c',
	unit: '袋',
	stock: 10,
	price: 1000,
	reorder_level: null,
	expiry: null,
	supplier: '',
	purpose: '',
	usage: '',
	memo: '',
	features: '',
	how_to_use: '',
	cautions: '',
	crops: '',
	public_ref: '',
	last_purchase_date: null,
	updated_at: '',
	updated_by: null,
	...p
});

describe('年平均単価', () => {
	it('数量で重み付けした平均になる', () => {
		const map = purchasesByItem([
			ev({ event_date: '2025-03-01', qty: 10, unit_price: 1000 }),
			ev({ event_date: '2025-09-01', qty: 30, unit_price: 1400 })
		]);
		const stats = yearStatsOf(map.get('a')!);
		// (1000×10 + 1400×30) ÷ 40 = 1300
		expect(stats[2025].avg).toBe(1300);
	});

	it('取り消した記録・入庫以外・削除した資材の記録は使わない', () => {
		const map = purchasesByItem([
			ev({ unit_price: 1000 }),
			ev({ unit_price: 9999, cancelled: true }),
			ev({ type: '出庫', unit_price: null }),
			ev({ item_id: null, unit_price: 5000 })
		]);
		expect(map.get('a')!.length).toBe(1);
		expect(map.has('null')).toBe(false);
	});

	it('過去の購入で数量がなければ1として数える', () => {
		const map = purchasesByItem([ev({ type: '過去の購入', qty: null, unit_price: 800, event_date: '2023-01-01', date_precision: 'year' })]);
		const p = map.get('a')![0];
		expect(p.qty).toBe(1);
		expect(p.month).toBeNull();
	});
});

describe('前年比・3年前比', () => {
	const stats = yearStatsOf(
		purchasesByItem([
			ev({ event_date: '2023-04-01', unit_price: 1000 }),
			ev({ event_date: '2025-04-01', unit_price: 1100 }),
			ev({ event_date: '2026-04-01', unit_price: 1210 })
		]).get('a')!
	);

	it('前年比と3年前比を計算する', () => {
		const c = compare(stats, null, 2026);
		expect(c.by).toBe(2026);
		expect(c.yoy).toBeCloseTo(10, 6);
		expect(c.r3).toBeCloseTo(21, 6);
		// 3年で21％ → 毎年およそ6.56％
		expect(c.cagr).toBeCloseTo((Math.pow(1.21, 1 / 3) - 1) * 100, 6);
	});

	it('比べる年のデータがなければ null', () => {
		const c = compare(stats, null, 2025);
		expect(c.prev).toBeNull();
		expect(c.yoy).toBeNull();
	});

	it('基準年に購入がなければ、それ以前の最新の年を基準にする', () => {
		const c = compare(stats, null, 2027);
		expect(c.by).toBe(2026);
	});
});

describe('全国データとの比較', () => {
	const series: PublicSeries = {
		key: 'idx:肥料',
		kind: 'idx',
		grp: '肥料',
		name: '肥料',
		spec: '',
		unit: '',
		sort_order: 0,
		// 2026年は8月まで。2025年は12か月分ある
		data: {
			...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`2025-${String(i + 1).padStart(2, '0')}`, i < 8 ? 100 : 200])),
			...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`2026-${String(i + 1).padStart(2, '0')}`, 110]))
		},
		prov: []
	};

	it('同じ月どうしで比べる（今年の途中までと、前年の同じ期間）', () => {
		// 9〜12月の値（200）は比べない
		expect(publicChange(series, 2026, 1)).toBeCloseTo(10, 6);
	});

	it('自分の前年比との差を出す', () => {
		const stats = yearStatsOf(
			purchasesByItem([ev({ event_date: '2025-04-01', unit_price: 1000 }), ev({ event_date: '2026-04-01', unit_price: 1200 })]).get('a')!
		);
		const c = compare(stats, series, 2026);
		expect(c.pubYoy).toBeCloseTo(10, 6);
		expect(c.gap).toBeCloseTo(10, 6);
	});
});

describe('資材費全体の変動率', () => {
	it('前年と同じ量を買った場合の変化率', () => {
		const events = [
			ev({ item_id: 'a', event_date: '2025-04-01', qty: 10, unit_price: 1000 }),
			ev({ item_id: 'a', event_date: '2026-04-01', qty: 5, unit_price: 1200 }),
			ev({ item_id: 'b', event_date: '2025-04-01', qty: 10, unit_price: 3000 }),
			ev({ item_id: 'b', event_date: '2026-04-01', qty: 20, unit_price: 3000 })
		];
		const map = purchasesByItem(events);
		const stats = new Map([...map].map(([k, v]) => [k, yearStatsOf(v)]));
		const r = costChange([item({ id: 'a' }), item({ id: 'b' })], stats, 2026);
		// (1200×10 + 3000×10) ÷ (1000×10 + 3000×10) − 1 = 5％
		expect(r.pct).toBeCloseTo(5, 6);
		expect(r.n).toBe(2);
	});
});

describe('注意表示', () => {
	const settings = { alert_days: 30, price_alert_pct: 10, gap_alert_pts: 5 };

	it('在庫切れ・残りわずか・期限を判定する', () => {
		expect(itemTags(item({ stock: 0 }), '2026-10-14', settings).map((t) => t.text)).toEqual(['在庫切れ']);
		expect(itemTags(item({ stock: 3, reorder_level: 3 }), '2026-10-14', settings).map((t) => t.text)).toEqual(['残りわずか']);
		expect(itemTags(item({ expiry: '2026-10-01' }), '2026-10-14', settings).map((t) => t.text)).toEqual(['期限切れ']);
		expect(itemTags(item({ expiry: '2026-11-10' }), '2026-10-14', settings).map((t) => t.text)).toEqual(['期限間近']);
		expect(itemTags(item({ expiry: '2026-12-31' }), '2026-10-14', settings)).toEqual([]);
	});

	it('値上がり注意と全国より高め', () => {
		const tags = itemTags(item(), '2026-10-14', settings, { hasData: true, series: null, yoy: 12, gap: 6 });
		expect(tags.map((t) => t.text)).toEqual(['値上がり注意', '全国より高め']);
	});

	it('直近1年に購入か使用の記録がある資材だけを選ぶ', () => {
		const today = '2026-11-01';
		const ids = recentItemIds(
			[
				ev({ item_id: 'bought', type: '入庫', event_date: '2025-11-01' }),
				ev({ item_id: 'past', type: '過去の購入', event_date: '2026-03-01' }),
				ev({ item_id: 'used', type: '出庫', event_date: '2026-10-01' }),
				ev({ item_id: 'old', type: '入庫', event_date: '2025-10-31' }),
				ev({ item_id: 'cancelled', type: '入庫', event_date: '2026-10-01', cancelled: true }),
				ev({ item_id: 'registered', type: '登録', event_date: '2026-10-01' }),
				ev({ item_id: 'counted', type: '棚卸し', event_date: '2026-10-01' }),
				ev({ item_id: null, type: '入庫', event_date: '2026-10-01' })
			],
			today
		);
		expect([...ids].sort()).toEqual(['bought', 'past', 'used']);
	});
});
