import { describe, expect, it } from 'vitest';
import { findColumns, guessCategory, parseDate, parseStatement } from './statement.js';

const HEADER = ['連番', 'ＪＡ処理日', '取扱支所名', '品名コード', '品名', '規格', '数量', '単価', '金額', '値引金額', '値引後金額', '消費税', '税抜金額'];

describe('お買上げ明細の読み取り', () => {
	it('見出しから列の位置を探す。明細でない表は null', () => {
		expect(findColumns(HEADER)).toMatchObject({ no: 0, date: 1, name: 4, qty: 6, amount: 10 });
		expect(findColumns(['品名', '費目区分', '数量合計'])).toBeNull();
	});

	it('いろいろな書き方の日付を読む', () => {
		expect(parseDate('2025/1/6')).toBe('2025-01-06');
		expect(parseDate('2025年12月28日')).toBe('2025-12-28');
		expect(parseDate('令和7年')).toBeNull();
	});

	it('全角をそろえ、値引後金額を支払額にする', () => {
		const { rows, errors } = parseStatement(HEADER, [
			['1', '2025/01/17', 'ＪＡグリーン上球磨', '30200502 ', 'ベストガード粒', '3KG   ', '2', '3,994', '7,966', '22', '7,944', '725', '7,263']
		]);
		expect(errors).toEqual([]);
		expect(rows[0]).toMatchObject({ key: '2025-01-17#1', supplier: 'JAグリーン上球磨', code: '30200502', spec: '3KG', qty: 2, unitPrice: 3994, discount: 22, amount: 7944, tax: 725 });
	});

	it('単価が0なら、支払額÷数量を単価にする', () => {
		const { rows } = parseStatement(HEADER, [['1', '2025/01/06', '中央ガス販売所', '', 'ガス（供給センタ－）', '', '3.3', '0', '4247', '0', '4247', '386', '3861']]);
		expect(rows[0].unitPrice).toBe(1287);
	});

	it('品名が空の行は飛ばし、日付や数量が読めない行は理由を返す', () => {
		const { rows, errors } = parseStatement(HEADER, [
			['', '', '', '', '', '', '', '', '', '', '', '', ''],
			['2', 'きのう', '', '', '肥料A', '', '1', '100', '', '', '', '', '']
		]);
		expect(rows).toEqual([]);
		expect(errors[0]).toContain('処理日');
	});

	it('品名からカテゴリを決める', () => {
		expect(guessCategory('ベストガード粒')).toBe('農薬');
		expect(guessCategory('肥後培土(袋物)')).toBe('肥料');
		expect(guessCategory('灯油(配達)')).toBe('燃料');
		expect(guessCategory('ふしぎな品物')).toBeNull();
	});
});
