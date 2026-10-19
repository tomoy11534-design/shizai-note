import { describe, expect, it } from 'vitest';
import { categoryKey, findSimilarCategory } from './category.js';
import type { Category } from './types.js';

const cats = ['肥料', '農薬', '土壌改良剤', 'マルチ', 'その他'].map((name, i) => ({ id: String(i), household_id: 'h', name, sort_order: i, public_ref: '' }) as Category);

describe('カテゴリの表記揺れ', () => {
	it('全角半角・大文字小文字・空白・カタカナとひらがなをそろえる', () => {
		expect(categoryKey(' ＰＥ フィルム ')).toBe(categoryKey('peふぃるむ'));
	});

	it('そろえると同じ名前は「同じ」と判定する', () => {
		expect(findSimilarCategory(' まるち ', cats)).toMatchObject({ category: { name: 'マルチ' }, same: true });
	});

	it('1文字違いや、含んでいる名前は「似ている」と判定する', () => {
		expect(findSimilarCategory('土壌改良材', cats)).toMatchObject({ category: { name: '土壌改良剤' }, same: false });
		expect(findSimilarCategory('有機肥料', cats)).toMatchObject({ category: { name: '肥料' }, same: false });
	});

	it('関係のない名前は何も返さない', () => {
		expect(findSimilarCategory('燃料', cats)).toBeNull();
		expect(findSimilarCategory('  ', cats)).toBeNull();
	});
});
