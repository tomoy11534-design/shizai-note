import { describe, expect, it } from 'vitest';
import { draftRows } from './stocktake.js';
import type { Item } from './types.js';

const item = (id: string, stock: number) => ({ id, name: id, stock }) as Item;

describe('棚卸しの下書き', () => {
	const draft = { started: '', counts: { a: { counted: 8, expected: 10 }, b: { counted: 5, expected: 5 }, gone: { counted: 1, expected: 2 } } };

	it('数えた数と帳簿の数の差を出す', () => {
		const rows = draftRows(draft, [item('a', 10), item('b', 5), item('c', 3)]);
		expect(rows.map((r) => [r.item.id, r.diff])).toEqual([['a', -2], ['b', 0]]);
	});

	it('削除された資材は含めない', () => {
		expect(draftRows(draft, [item('a', 10)]).map((r) => r.item.id)).toEqual(['a']);
	});

	it('数えたあとに在庫が動いたら知らせる', () => {
		expect(draftRows(draft, [item('a', 12)])[0].moved).toBe(true);
		expect(draftRows(draft, [item('a', 10)])[0].moved).toBe(false);
	});
});
