// Googleスプレッドシートとの連携（明細の取り込みと、在庫一覧・履歴の書き出し）
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { guessCategory, parseStatement, type StatementRow } from './statement.js';
import { adminClient } from './supabase-admin.js';

type Db = SupabaseClient;

// 合言葉から農園を探す。合わなければ null
export async function householdFromToken(request: Request) {
	const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
	if (!token) return null;
	const hash = createHash('sha256').update(token, 'utf8').digest('hex');
	const { data } = await adminClient().from('sheet_links').select('household_id').eq('token_hash', hash).maybeSingle();
	return (data?.household_id as string | undefined) ?? null;
}

// 1000件ずつ全部読む（Supabase は1回に1000件まで）
async function fetchAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
	const all: T[] = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await query(from, from + 999);
		if (error) throw new Error(error.message);
		all.push(...(data ?? []));
		if (!data || data.length < 1000) return all;
	}
}

interface ItemRow {
	id: string;
	name: string;
	spec: string;
	category_id: string;
	product_code: string;
	price: number;
	supplier: string;
	last_purchase_date: string | null;
}
interface PurchaseRow {
	id: string;
	item_id: string;
	event_date: string;
	qty: number;
	unit_price: number;
	amount: number;
	discount: number | null;
	tax: number | null;
	amount_ex_tax: number | null;
	memo: string;
}

const itemKey = (name: string, spec: string) => `${name}\u0000${spec}`;
const todayJst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

export interface SheetTable {
	sheet: string;
	header: unknown[];
	rows: unknown[][];
}

/**
 * 明細の表を取り込む。取り込み済みの行（処理日#連番）は飛ばすので、同じ表を何度送ってもよい
 * 購入は「過去の購入」として記録する（在庫数は変えない）。返品（数量がマイナス）は元の購入から差し引く
 */
export async function importStatement(householdId: string, tables: SheetTable[]) {
	const db = adminClient();
	const errors: string[] = [];
	const parsed: StatementRow[] = [];
	for (const t of tables) {
		const r = parseStatement(t.header, t.rows);
		parsed.push(...r.rows);
		errors.push(...r.errors.map((e) => `「${t.sheet}」${e}`));
	}

	const doneKeys = new Set(
		(
			await fetchAll<{ row_key: string }>((a, b) => db.from('sheet_imported_rows').select('row_key').eq('household_id', householdId).range(a, b))
		).map((r) => r.row_key)
	);
	const seen = new Set<string>();
	const fresh = parsed
		.filter((r) => !doneKeys.has(r.key) && !seen.has(r.key) && seen.add(r.key))
		.sort((a, b) => a.date.localeCompare(b.date) || (a.no ?? 0) - (b.no ?? 0));
	const result = { ok: true, rows: parsed.length, added: 0, newItems: 0, returns: 0, skipped: parsed.length - fresh.length, errors };
	if (!fresh.length) return finish(db, householdId, result);

	const items = await fetchAll<ItemRow>((a, b) =>
		db.from('items').select('id, name, spec, category_id, product_code, price, supplier, last_purchase_date').eq('household_id', householdId).range(a, b)
	);
	const { data: cats, error: catError } = await db.from('categories').select('id, name').eq('household_id', householdId).order('sort_order');
	if (catError) throw new Error(catError.message);
	const catId = new Map((cats ?? []).map((c) => [c.name as string, c.id as string]));
	const catName = new Map((cats ?? []).map((c) => [c.id as string, c.name as string]));
	const byKey = new Map(items.map((i) => [itemKey(i.name, i.spec), i]));
	const byName = new Map(items.map((i) => [i.name, i]));

	// 新しい資材を登録する。カテゴリは、同じ品名の資材があればそれに合わせ、なければ品名から決める
	const purchases = fresh.filter((r) => r.qty > 0);
	const missing = new Map<string, StatementRow>();
	for (const r of purchases) if (!byKey.has(itemKey(r.name, r.spec))) missing.set(itemKey(r.name, r.spec), r);
	const fallback = catId.get('その他') ?? cats?.[0]?.id;
	const newRows = [...missing.values()].map((r) => ({
		household_id: householdId,
		name: r.name.slice(0, 100),
		spec: r.spec.slice(0, 100),
		product_code: r.code.slice(0, 30),
		category_id: byName.get(r.name)?.category_id ?? catId.get(guessCategory(r.name) ?? '') ?? fallback,
		unit: '',
		stock: 0,
		price: r.unitPrice,
		supplier: r.supplier
	}));
	for (let i = 0; i < newRows.length; i += 100) {
		const { data, error } = await db.from('items').insert(newRows.slice(i, i + 100)).select('id, name, spec, category_id, product_code, price, supplier, last_purchase_date');
		if (error) throw new Error(`資材を登録できませんでした：${error.message}`);
		for (const it of data as ItemRow[]) byKey.set(itemKey(it.name, it.spec), it);
		await insertEvents(
			db,
			(data as ItemRow[]).map((it) => ({
				household_id: householdId, item_id: it.id, item_name: it.name, category_name: catName.get(it.category_id) ?? '', type: '登録',
				event_date: todayJst(), date_precision: 'day', qty: 0, stock_after: 0, unit_price: it.price, amount: null, discount: null,
				tax: null, amount_ex_tax: null, supplier: it.supplier, memo: 'スプレッドシートの明細から取り込み', user_id: null
			}))
		);
	}
	result.newItems = newRows.length;

	// 購入を記録する
	const ledger: { household_id: string; row_key: string; event_id: string | null }[] = [];
	const inserted = await insertEvents(
		db,
		purchases.map((r) => {
			const it = byKey.get(itemKey(r.name, r.spec))!;
			return {
				household_id: householdId, item_id: it.id, item_name: it.name, category_name: catName.get(it.category_id) ?? '', type: '過去の購入',
				event_date: r.date, date_precision: 'day', qty: r.qty, stock_after: 0, unit_price: r.unitPrice, amount: r.amount,
				discount: r.discount || null, tax: r.tax, amount_ex_tax: r.exTax, supplier: r.supplier,
				memo: r.no !== null ? `明細 No.${r.no}` : '明細', user_id: null
			};
		})
	);
	purchases.forEach((r, i) => ledger.push({ household_id: householdId, row_key: r.key, event_id: inserted[i]?.id ?? null }));
	result.added = purchases.length;

	// 資材ごとに、いちばん新しい購入で単価・購入先・最終購入日を更新する（品名コードは空なら入れる）
	const latest = new Map<string, StatementRow>();
	for (const r of purchases) {
		const id = byKey.get(itemKey(r.name, r.spec))!.id;
		const cur = latest.get(id);
		if (!cur || r.date >= cur.date) latest.set(id, r);
	}
	const updates = [...latest].flatMap(([id, r]) => {
		const it = [...byKey.values()].find((x) => x.id === id)!;
		const body: Record<string, unknown> = {};
		if (!it.product_code && r.code) body.product_code = r.code.slice(0, 30);
		if (!it.last_purchase_date || r.date >= it.last_purchase_date) Object.assign(body, { price: r.unitPrice, supplier: r.supplier, last_purchase_date: r.date });
		return Object.keys(body).length ? [{ id, body }] : [];
	});
	for (let i = 0; i < updates.length; i += 10) {
		await Promise.all(updates.slice(i, i + 10).map((u) => db.from('items').update({ ...u.body, updated_at: new Date().toISOString() }).eq('id', u.id)));
	}

	// 返品：同じ資材・同じ単価で、数量が足りる直近の購入から差し引く
	for (const r of fresh.filter((x) => x.qty < 0)) {
		const it = byKey.get(itemKey(r.name, r.spec));
		const target = it ? await findPurchaseFor(db, it.id, r) : null;
		if (!target) {
			errors.push(`${r.date} ${r.name}：返品（数量 ${r.qty}）の元になる購入が見つからないので、取り込みませんでした。`);
			continue;
		}
		const qty = Number(target.qty) + r.qty;
		const add = (a: number | null, b: number | null) => (a === null && b === null ? null : (Number(a) || 0) + (Number(b) || 0));
		const { error } = await db
			.from('stock_events')
			.update({
				qty: qty || Number(target.qty),
				amount: Number(target.amount) + r.amount,
				discount: add(target.discount, r.discount) || null,
				tax: add(target.tax, r.tax),
				amount_ex_tax: add(target.amount_ex_tax, r.exTax),
				// 全部返品したときは、記録を「取消済み」にして価格の計算から外す
				cancelled: qty === 0,
				memo: `${target.memo}・返品 ${-r.qty} を差し引き${r.no !== null ? `（明細 No.${r.no}）` : ''}`
			})
			.eq('id', target.id);
		if (error) throw new Error(`返品を記録できませんでした：${error.message}`);
		ledger.push({ household_id: householdId, row_key: r.key, event_id: target.id });
		result.returns++;
	}

	for (let i = 0; i < ledger.length; i += 500) {
		const { error } = await db.from('sheet_imported_rows').insert(ledger.slice(i, i + 500));
		if (error) throw new Error(`取り込み済みの印をつけられませんでした：${error.message}`);
	}
	return finish(db, householdId, result);
}

async function insertEvents(db: Db, rows: Record<string, unknown>[]) {
	const out: { id: string }[] = [];
	for (let i = 0; i < rows.length; i += 200) {
		const { data, error } = await db.from('stock_events').insert(rows.slice(i, i + 200)).select('id');
		if (error) throw new Error(`記録を保存できませんでした：${error.message}`);
		out.push(...(data as { id: string }[]));
	}
	return out;
}

async function findPurchaseFor(db: Db, itemId: string, r: StatementRow) {
	const { data } = await db
		.from('stock_events')
		.select('id, item_id, event_date, qty, unit_price, amount, discount, tax, amount_ex_tax, memo')
		.eq('item_id', itemId)
		.in('type', ['過去の購入', '入庫'])
		.eq('cancelled', false)
		.eq('unit_price', r.unitPrice)
		.gte('qty', -r.qty)
		.lte('event_date', r.date)
		.order('event_date', { ascending: false })
		.limit(1);
	return ((data ?? [])[0] as PurchaseRow | undefined) ?? null;
}

async function finish<T extends { added: number; newItems: number; returns: number; skipped: number; errors: string[] }>(db: Db, householdId: string, result: T) {
	const status = `追加 ${result.added} 件（新しい資材 ${result.newItems} 件）・返品 ${result.returns} 件・取り込み済み ${result.skipped} 件${result.errors.length ? `・読めなかった行 ${result.errors.length} 件` : ''}`;
	await db.from('sheet_links').update({ last_import_at: new Date().toISOString(), last_import_status: status }).eq('household_id', householdId);
	return { ...result, message: status };
}

// 在庫一覧と履歴を、スプレッドシートにそのまま貼れる表（2次元の配列）にする
export async function buildExport(householdId: string) {
	const db = adminClient();
	const [items, events, { data: cats }, { data: members }] = await Promise.all([
		fetchAll<Record<string, unknown>>((a, b) => db.from('items').select('*').eq('household_id', householdId).range(a, b)),
		fetchAll<Record<string, unknown>>((a, b) =>
			db.from('stock_events').select('*').eq('household_id', householdId).order('event_date', { ascending: false }).order('created_at', { ascending: false }).range(a, b)
		),
		db.from('categories').select('id, name, sort_order').eq('household_id', householdId),
		db.from('household_members').select('user_id, display_name, email').eq('household_id', householdId)
	]);
	const cat = new Map((cats ?? []).map((c) => [c.id, c]));
	const who = new Map((members ?? []).map((m) => [m.user_id, m.display_name || String(m.email).split('@')[0]]));
	const order = (id: unknown) => cat.get(id)?.sort_order ?? 9999;
	items.sort((a, b) => order(a.category_id) - order(b.category_id) || String(a.name).localeCompare(String(b.name), 'ja'));

	const stock = [
		['資材名', '規格', '品名コード', 'カテゴリ', '在庫数', '単位', '単価', '在庫金額', '購入先', '最後の購入日', '使用期限', '用途', '対象の作物', 'メモ', '更新日時'],
		...items.map((i) => [
			i.name, i.spec, i.product_code, cat.get(i.category_id)?.name ?? '', Number(i.stock), i.unit, Number(i.price),
			Math.round(Number(i.stock) * Number(i.price)), i.supplier, i.last_purchase_date ?? '', i.expiry ?? '', i.purpose, i.crops, i.memo,
			String(i.updated_at).slice(0, 16).replace('T', ' ')
		])
	];
	const history = [
		['日付', '種類', '資材名', 'カテゴリ', '数量', '在庫（後）', '単価', '支払額', '値引', '消費税', '購入先', 'メモ', '取消', '操作した人'],
		...events.map((e) => [
			e.date_precision === 'year' ? String(e.event_date).slice(0, 4) : e.event_date, e.type, e.item_name, e.category_name, e.qty ?? '',
			e.stock_after ?? '', e.unit_price ?? '', e.amount ?? '', e.discount ?? '', e.tax ?? '', e.supplier, e.memo, e.cancelled ? '取消済み' : '',
			e.user_id ? (who.get(e.user_id) ?? '') : ''
		])
	];
	await db.from('sheet_links').update({ last_export_at: new Date().toISOString() }).eq('household_id', householdId);
	return { ok: true, exportedAt: new Date().toISOString(), stock, history };
}
