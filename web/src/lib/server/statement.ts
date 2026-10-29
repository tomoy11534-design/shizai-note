// JAのお買上げ明細（スプレッドシートの表）を読み取る。データベースには触らない

export interface StatementRow {
	// 同じ行を二度取り込まないための目印（「処理日#連番」）
	key: string;
	no: number | null;
	date: string;
	supplier: string;
	code: string;
	name: string;
	spec: string;
	qty: number;
	unitPrice: number;
	discount: number;
	// 値引後の支払額
	amount: number;
	tax: number | null;
	exTax: number | null;
}

// 全角英数字や半角カナをそろえ、空白を1つにまとめる
export const norm = (s: unknown) =>
	String(s ?? '')
		.normalize('NFKC')
		.replace(/\s+/g, ' ')
		.trim();

// 「1,234円」のような表示も数として読む。空なら null
function num(s: unknown): number | null {
	const t = norm(s).replace(/[,，円¥]/g, '');
	if (!t) return null;
	const n = Number(t);
	return Number.isFinite(n) ? n : null;
}

// 見出しの名前（どれか1つが合えばよい）
const HEADERS = {
	no: ['連番'],
	date: ['JA処理日', '処理日', '購入日', '日付'],
	supplier: ['取扱支所名', '支所名', '購入先'],
	code: ['品名コード'],
	name: ['品名'],
	spec: ['規格'],
	qty: ['数量'],
	unitPrice: ['単価'],
	gross: ['金額'],
	discount: ['値引金額'],
	amount: ['値引後金額'],
	tax: ['消費税'],
	exTax: ['税抜金額']
} as const;
type Field = keyof typeof HEADERS;

// 見出しの行から、それぞれの項目が何列目かを探す。明細の表でなければ null
export function findColumns(header: unknown[]) {
	const names = header.map(norm);
	const cols = {} as Partial<Record<Field, number>>;
	for (const [field, labels] of Object.entries(HEADERS) as [Field, readonly string[]][]) {
		const i = names.findIndex((n) => labels.includes(n));
		if (i >= 0) cols[field] = i;
	}
	return cols.date !== undefined && cols.name !== undefined && cols.qty !== undefined && cols.unitPrice !== undefined ? cols : null;
}

// 「2025/1/6」「2025-01-06」「2025年1月6日」を「2025-01-06」にする
export function parseDate(s: unknown): string | null {
	const m = norm(s).match(/^(\d{4})\s*[/\-.年]\s*(\d{1,2})\s*[/\-.月]\s*(\d{1,2})/);
	if (!m) return null;
	const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
	if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
	return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// 表（見出しの行＋データの行）を読み取る。読めない行は errors に理由を入れる
export function parseStatement(header: unknown[], rows: unknown[][]) {
	const cols = findColumns(header);
	const out: StatementRow[] = [];
	const errors: string[] = [];
	if (!cols) return { rows: out, errors: ['見出しに「処理日」「品名」「数量」「単価」が見つかりません。'] };
	const get = (r: unknown[], f: Field) => (cols[f] === undefined ? '' : r[cols[f]!]);

	rows.forEach((r, i) => {
		const name = norm(get(r, 'name'));
		if (!name) return;
		const line = `${i + 2}行目（${name}）`;
		const date = parseDate(get(r, 'date'));
		const qty = num(get(r, 'qty'));
		if (!date) return errors.push(`${line}：処理日が読めません。`);
		if (qty === null || qty === 0) return errors.push(`${line}：数量が読めません。`);
		const discount = num(get(r, 'discount')) ?? 0;
		let unitPrice = num(get(r, 'unitPrice')) ?? 0;
		// 値引後金額がなければ「金額−値引」、金額もなければ「単価×数量−値引」
		const amount = num(get(r, 'amount')) ?? (num(get(r, 'gross')) ?? Math.round(unitPrice * qty)) - discount;
		// ガスのように単価が0のときは、支払額÷数量を単価にする
		if (!unitPrice) unitPrice = Math.round(Math.abs(amount / qty));
		const no = num(get(r, 'no'));
		const spec = norm(get(r, 'spec'));
		out.push({
			key: no !== null ? `${date}#${no}` : `${date}#${name}#${spec}#${qty}#${amount}`,
			no,
			date,
			supplier: norm(get(r, 'supplier')),
			code: norm(get(r, 'code')),
			name,
			spec,
			qty,
			unitPrice,
			discount,
			amount,
			tax: num(get(r, 'tax')),
			exTax: num(get(r, 'exTax'))
		});
	});
	return { rows: out, errors };
}

// 品名からカテゴリを決める（上から順に、最初に当てはまったもの）。どれでもなければ null
const RULES: [string, RegExp][] = [
	['修理・工賃', /点検|修理|交換|取付|工事費|諸経費|^作業$/],
	['その他', /甘酒|カルビー|ヌードル|黒酢|パリパリサンド|収穫野菜|電池|茶|綾鷹|ウォーター|らっきょう|家の光|印鑑|百均|スタンプ|ゴム印|数字セット|紙管なしロール|ボンド|かみそり|米びつ|ミツバチ|カイト|エビアン|送料/],
	['燃料', /油脂類|ガス|灯油|軽油|ガソリン|オイル|不凍液/],
	['機械部品', /ポンプ|替刃|イグニッション|フィルター\(|カプラー|ブレード|ベアリング|トメワ|プーリー|パッキン|スプリング|モア|ツメ|ワイヤ|カバー交換|フレキシブルカバー|プラグ|カートリッジ|フイルタ|センサー|ランプ|バーナイフ|Rピン|グリース|鋸刃|ヤスリ|チャック/],
	['農機具・道具', /鎌|トング|草刈機|水分測定器|じょうろ|鋏|小刀|シルキー|らく助|油さし|ミスト機/],
	['作業用品', /パワーグラブ|シューズ|ズボン|もんぺ|帽子|紳士半長|快適農活|グリップ|長靴|手袋|背抜き|指先強化|腕カバー|アームカバー|エーローブ|ヤッケ|ハット|ぴたり一番|ビニトップ|ファイバータッチ|先丸|マスク|吸収缶/],
	// 「100粒」は種の数。「アドマイヤー1粒」のような1桁は粒剤（農薬）
	['種苗', /レノンハートメロン|種子|苗|\d{2,}粒|ツブ|種駒|ズッキーニ\(KZ|ソルゴー|オガ菌|しいたけ菌/],
	['施設資材', /セルトレー|サイロ|エルボー|パイプ|ホース|ツユトール|継手|ジョイント|ビス|番線|ステンレス線|ガイシ|ゲートフック|バンド|パッカ|キャップ|インシュロック|キュウリネット|誘引ピンチ|カンキ|ステープル|ラセン杭|撚り線|ベンチ|光分解テープ|チューブフィルター|インシュロット|接木テープ/],
	['肥料', /過石|葉面マグ|ナチュール|くん炭|魚粕|トウミツ|元気一番|マリンスター|肥料|液肥|ケイカル|ケイフン|油粕|米ぬか|培土|床土|くまオール|くま454|ジシアン|燐硝安|マリンカル|珪酸加里|ユウキ|ペレット|有機|ふすま|MKK|すくすく|HB101|MOX|パフォーム|EM菌|糖蜜|ペンタキープ|メリット|クレフノン/],
	['包装資材', /袋|ボードン|化粧箱|シール|DB|メロンネット|ストレー|30Kポリ|シーリングテープ|バインダーひも|玉巻|ロープ|カットテープ/],
	['被覆資材', /クリンテート|晴天|ノービエース|イースター|アグリトップ|ビニール|マルチ|透明ポリ|ムテキムサシ|ベジセイバー|シルバー|ブルーシート|ハウステープ|パイオラン/],
	['農薬', /ブラシン|フロアブル|水和|乳剤|粒剤|液剤|顆粒|水溶|粒|忌避|キンチョール|バスタ|プリグロックス|タッチダウン|ジベレリン|トマトトーン|スクミン|スクミノン|スワルスキー|エコピタ|クリンチャー|ジョーカー|モグラ|コラトツプ|モンカット|ファンベル|フォリオゴールド|タチガレエース|ランネート/]
];

export function guessCategory(name: string): string | null {
	return RULES.find(([, re]) => re.test(name))?.[0] ?? null;
}
