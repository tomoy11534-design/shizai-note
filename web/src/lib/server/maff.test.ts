import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findMachineReadableUrl, parseMaffWorkbook } from './maff.js';

describe('農林水産省のページからリンクを探す', () => {
	it('機械判読用のExcelのURLを取り出す', () => {
		const html =
			'閲覧用〔<a href="https://www.e-stat.go.jp/stat-search/files/data?sinfid=000040387164&amp;ext=xls">Excel：e-Stat</a>〕<br>' +
			'機械判読用〔<a href="https://www.e-stat.go.jp/stat-search/files/data?sinfid=000040419961&amp;ext=xls">Excel：e-Stat</a>〕';
		expect(findMachineReadableUrl(html)).toBe('https://www.e-stat.go.jp/stat-search/files/data?sinfid=000040419961&ext=xls');
	});
});

// 実際のExcelファイルで確かめる（環境変数 MAFF_XLSX にファイルの場所を入れたときだけ実行）
const fixture = (globalThis as { process?: { env?: Record<string, string> } }).process?.env?.MAFF_XLSX ?? '';
describe.skipIf(!fixture || !existsSync(fixture))('実際の統計表を読む', () => {
	it('価格指数と品目別価格を取り出せる', () => {
		const { series, latest } = parseMaffWorkbook(new Uint8Array(readFileSync(fixture)));
		const idx = series.filter((s) => s.kind === 'idx');
		const items = series.filter((s) => s.kind === 'item');
		expect(idx.length).toBeGreaterThanOrEqual(15);
		expect(items.length).toBeGreaterThanOrEqual(100);
		expect(latest).toMatch(/^\d{4}-\d{2}$/);

		const fert = series.find((s) => s.key === 'idx:肥料');
		expect(fert?.data[latest]).toBeGreaterThan(50);
		// ふりがなが混ざっていない
		const kasei = items.find((s) => s.name === '高度化成');
		expect(kasei?.unit).toBe('樹脂袋20㎏');
		expect(kasei?.grp).toBe('肥料');
	});
});
