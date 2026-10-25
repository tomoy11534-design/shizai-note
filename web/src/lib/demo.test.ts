import { describe, expect, it } from 'vitest';
import { purchasesByItem } from './calc.js';
import { demoData, demoRpc } from './demo.js';

describe('demoData', () => {
	it('最後の記録の在庫が、資材の在庫と一致する', () => {
		const d = demoData(new Date('2026-10-25T00:00:00Z'));
		for (const item of d.items) {
			const last = d.events.filter((e) => e.item_id === item.id && e.stock_after !== null && e.type !== '過去の購入').at(-1);
			expect(last?.stock_after).toBe(item.stock);
		}
	});

	it('4年分の購入記録がある', () => {
		const d = demoData(new Date('2026-10-25T00:00:00Z'));
		const years = new Set([...purchasesByItem(d.events).values()].flat().map((p) => p.year));
		expect([...years].sort()).toEqual([2023, 2024, 2025, 2026]);
	});

	it('1月でも今年の購入は今月より後にならない', () => {
		const d = demoData(new Date('2026-01-20T00:00:00Z'));
		expect(d.events.every((e) => e.event_date <= '2026-01-31')).toBe(true);
	});
});

describe('demoRpc', () => {
	const d = demoData(new Date('2026-10-25T00:00:00Z'));
	const item = d.items[0];

	it('入庫で在庫と単価が変わる', () => {
		const res = demoRpc(d, 'move_stock', { p_item: item.id, p_kind: '入庫', p_qty: 2, p_date: '2026-10-25', p_unit_price: 5000, p_supplier: 'JA' });
		expect(res.item?.stock).toBe(item.stock + 2);
		expect(res.item?.price).toBe(5000);
		expect(res.events?.[0].amount).toBe(10000);
	});

	it('在庫より多くは出庫できない', () => {
		expect(() => demoRpc(d, 'move_stock', { p_item: item.id, p_kind: '出庫', p_qty: item.stock + 1 })).toThrow('在庫が足りません');
	});

	it('棚卸しは差だけを反映する', () => {
		const res = demoRpc(d, 'stocktake', { p_counts: [{ item_id: item.id, counted: item.stock - 1, expected: item.stock }], p_memo: '' });
		expect(res.items?.[0].stock).toBe(item.stock - 1);
		expect(res.checked).toBe(1);
	});
});
