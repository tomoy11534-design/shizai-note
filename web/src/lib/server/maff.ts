// 農林水産省「農業物価統計調査」の機械判読用Excelを読み取る
import { strFromU8, unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

export const MAFF_PAGE_URL = 'https://www.maff.go.jp/j/tokei/kouhyou/noubukka/';
// この月以降だけ保存する（データ量を抑えるため）
export const PUBLIC_SINCE = '2015-01';

export interface ParsedSeries {
	key: string;
	kind: 'idx' | 'item';
	grp: string;
	name: string;
	spec: string;
	unit: string;
	sort_order: number;
	data: Record<string, number>;
	prov: string[];
}

// 行番号 → { 列記号: 値 }
export type Grid = Map<number, Record<string, string>>;

type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@_',
	parseTagValue: false,
	trimValues: false,
	isArray: (name) => ['si', 'r', 'row', 'c', 'sheet', 'Relationship'].includes(name)
});

// <t> などの文字を取り出す（属性付きの場合は #text に入る）
function textOf(node: unknown): string {
	if (node === null || node === undefined) return '';
	if (typeof node === 'string' || typeof node === 'number') return String(node);
	if (typeof node === 'object' && '#text' in (node as XmlNode)) return String((node as XmlNode)['#text']);
	return '';
}

function asArray<T>(v: T | T[] | undefined): T[] {
	return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

export function colIndex(letters: string): number {
	let n = 0;
	for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
	return n;
}

/**
 * xlsxファイルを読み、名前が patterns に合うシートを表にして返す
 * （xlsxの中身はzipに入ったXML）
 */
export function readXlsx(bytes: Uint8Array, patterns: RegExp[]): (Grid | null)[] {
	const meta = unzipSync(bytes, {
		filter: (f) => ['xl/sharedStrings.xml', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels'].includes(f.name)
	});
	const xml = (name: string) => (meta[name] ? (parser.parse(strFromU8(meta[name])) as XmlNode) : {});

	// 共有文字列（ふりがな rPh は除く）
	const sst = (xml('xl/sharedStrings.xml').sst ?? {}) as XmlNode;
	const shared = asArray(sst.si as XmlNode[]).map((si) => {
		let s = textOf(si.t);
		for (const r of asArray(si.r as XmlNode[])) s += textOf(r.t);
		return s;
	});

	// シート名 → ファイルの場所
	const rels = (xml('xl/_rels/workbook.xml.rels').Relationships ?? {}) as XmlNode;
	const relMap = new Map(asArray(rels.Relationship as XmlNode[]).map((r) => [String(r['@_Id']), String(r['@_Target'])]));
	const workbook = (xml('xl/workbook.xml').workbook ?? {}) as XmlNode;
	const sheets = asArray(((workbook.sheets ?? {}) as XmlNode).sheet as XmlNode[]).map((s) => {
		const target = relMap.get(String(s['@_r:id'])) ?? '';
		return { name: String(s['@_name']), path: target.startsWith('/') ? target.slice(1) : `xl/${target}` };
	});

	const wanted = patterns.map((p) => sheets.find((s) => p.test(s.name)) ?? null);
	const paths = new Set(wanted.filter((s) => s).map((s) => s!.path));
	const files = unzipSync(bytes, { filter: (f) => paths.has(f.name) });

	return wanted.map((sheet) => {
		if (!sheet || !files[sheet.path]) return null;
		const root = parser.parse(strFromU8(files[sheet.path])) as XmlNode;
		const sheetData = (((root.worksheet ?? {}) as XmlNode).sheetData ?? {}) as XmlNode;
		const grid: Grid = new Map();
		for (const row of asArray(sheetData.row as XmlNode[])) {
			const cells: Record<string, string> = {};
			for (const c of asArray(row.c as XmlNode[])) {
				const col = String(c['@_r']).replace(/\d+/g, '');
				const type = String(c['@_t'] ?? '');
				let value = '';
				if (type === 's') value = shared[Number(textOf(c.v))] ?? '';
				else if (type === 'inlineStr') value = textOf(((c.is ?? {}) as XmlNode).t);
				else value = textOf(c.v);
				cells[col] = value;
			}
			grid.set(Number(row['@_r']), cells);
		}
		return grid;
	});
}

/**
 * 表から月別の系列を取り出す
 * 表の形：見出し行（階層・名称・銘柄等級・単位）のあとに、
 * A列「概数／確定」、B列「月／年平均」、E列「2026年8月」の行が続く
 */
export function extractSeries(grid: Grid, kind: 'idx' | 'item', startOrder = 0): ParsedSeries[] {
	const rowNos = [...grid.keys()].sort((a, b) => a - b);
	const cell = (r: number, c: string) => String(grid.get(r)?.[c] ?? '');
	const find = (test: (r: number) => boolean) => rowNos.find(test);

	const levelRow = find((r) => cell(r, 'F').startsWith('階層'));
	const specRow = find((r) => cell(r, 'F').startsWith('銘柄'));
	const unitRow = find((r) => cell(r, 'F') === '単位');
	const headRow = find((r) => cell(r, 'A').startsWith('概数値'));
	if (!levelRow || !specRow || !unitRow || !headRow) {
		throw new Error('統計表の形式が想定と違うため、読み取れませんでした。');
	}
	const groupRow = levelRow + 2;
	const nameRow = specRow - 1;

	const columns = Object.keys(grid.get(nameRow) ?? {}).filter((c) => colIndex(c) >= colIndex('G') && cell(nameRow, c));
	columns.sort((a, b) => colIndex(a) - colIndex(b));
	const series = columns.map((c, i) => {
		const name = cell(nameRow, c);
		const spec = cell(specRow, c);
		const unit = cell(unitRow, c);
		return {
			col: c,
			key: kind === 'idx' ? `idx:${name}` : `item:${name}|${spec}|${unit}`,
			kind,
			grp: cell(groupRow, c),
			name,
			spec,
			unit,
			sort_order: startOrder + i,
			data: {} as Record<string, number>,
			prov: [] as string[]
		};
	});

	for (const r of rowNos) {
		if (r <= headRow || !cell(r, 'B').startsWith('月')) continue;
		const m = cell(r, 'E').match(/(\d{4})年(\d{1,2})月/);
		if (!m) continue;
		const period = `${m[1]}-${m[2].padStart(2, '0')}`;
		if (period < PUBLIC_SINCE) continue;
		const provisional = cell(r, 'A').startsWith('概数');
		for (const s of series) {
			const raw = cell(r, s.col);
			const v = Number(raw);
			if (raw !== '' && Number.isFinite(v)) {
				s.data[period] = v;
				if (provisional) s.prov.push(period);
			}
		}
	}

	// データがない列と、同じキーの重複を除く
	const seen = new Set<string>();
	return series
		.filter((s) => Object.keys(s.data).length && !seen.has(s.key) && seen.add(s.key))
		.map(({ col: _col, ...rest }) => rest);
}

// Excelの中身から、価格指数（類別）と品目別価格を取り出す
export function parseMaffWorkbook(bytes: Uint8Array) {
	const [idxGrid, itemGrid] = readXlsx(bytes, [/^2\(1\).*指数/, /^2\(3\)/]);
	if (!idxGrid || !itemGrid) throw new Error('Excelファイルの中に、農業生産資材の表が見つかりませんでした。');
	const idx = extractSeries(idxGrid, 'idx', 0);
	const series = idx.concat(extractSeries(itemGrid, 'item', 1000));
	const latest = series.reduce((max, s) => {
		const keys = Object.keys(s.data).sort();
		const last = keys[keys.length - 1] ?? '';
		return last > max ? last : max;
	}, '');
	return { series, latest };
}

// 農林水産省のページから、最新の「機械判読用」Excelのリンクを探す
export function findMachineReadableUrl(html: string): string {
	const m = html.match(/機械判読用[\s\S]{0,300}?href="([^"]*sinfid=\d+[^"]*)"/);
	if (!m) throw new Error('農林水産省のページで、機械判読用のExcelファイルが見つかりませんでした。');
	return m[1].replace(/&amp;/g, '&');
}
