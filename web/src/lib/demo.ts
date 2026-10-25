// デモ版（ログインせずに見られる見本の農園）
// データはブラウザの中だけに置き、データベースの関数（RPC）と同じ動きをここで再現する。何も保存しない
import { todayJst } from './calc.js';
import type { Category, Household, Item, Member, MutationResult, StockEvent } from './types.js';

export const DEMO_HOUSEHOLD = 'demo-household';
export const DEMO_USER = 'demo-owner';
const DEMO_FAMILY = 'demo-family';

export interface DemoData {
	household: Household;
	members: Member[];
	categories: Category[];
	items: Item[];
	events: StockEvent[];
}

// 見本の資材。prices は「何年前」ごとの購入単価（0 = 今年）
interface Seed {
	name: string;
	spec: string;
	code: string;
	cat: string;
	unit: string;
	stock: number;
	reorder: number | null;
	expiryDays?: number;
	supplier: string;
	ref?: string;
	prices: [number, number, number, number];
	qty: number;
	out: number;
	purpose?: string;
	features?: string;
	how?: string;
	cautions?: string;
	crops?: string;
}

const CATEGORIES: [string, string][] = [
	['肥料', 'idx:肥料'],
	['農薬', 'idx:農業薬剤'],
	['種苗', 'idx:種苗及び苗木'],
	['包装資材', 'idx:諸材料'],
	['被覆資材', 'idx:諸材料'],
	['燃料', 'idx:光熱動力'],
	['機械部品', 'idx:農機具'],
	['その他', 'idx:農業生産資材総合']
];

const SEEDS: Seed[] = [
	{
		name: '高度化成肥料 15-15-15', spec: '20KG', code: '10900315', cat: '肥料', unit: '袋', stock: 12, reorder: 5, supplier: 'JA',
		ref: 'item:高度化成|N15％･P15％･K15％|樹脂袋20㎏', prices: [4850, 4380, 4250, 4750], qty: 10, out: 4,
		purpose: 'トマトの元肥。10aあたり4袋', features: '窒素・りん酸・加里を15%ずつ含む。効き目が早い',
		how: '定植の2週間前に全面にまいて耕す', cautions: '石灰と同時にまかない（1週間あける）', crops: 'トマト、ナス、キュウリ'
	},
	{
		name: '苦土石灰', spec: '20KG', code: '10200120', cat: '肥料', unit: '袋', stock: 8, reorder: 3, supplier: 'JA',
		ref: 'item:水酸化苦土|苦土50～60％|紙袋20㎏', prices: [1250, 1180, 1100, 1050], qty: 10, out: 3,
		purpose: '土の酸度調整（pH6.0〜6.5を目安）', features: 'カルシウムとマグネシウムを補う', how: '10aあたり100kgを目安に、植え付けの2週間以上前にまく',
		cautions: '化成肥料と混ぜない', crops: '野菜全般'
	},
	{
		name: '有機入り配合肥料 8-8-8', spec: '20KG', code: '10900808', cat: '肥料', unit: '袋', stock: 6, reorder: 4, supplier: 'ホームセンター',
		prices: [3600, 3400, 3350, 3200], qty: 6, out: 2, purpose: '追肥', crops: 'トマト、ナス'
	},
	{
		name: 'スミチオン乳剤', spec: '500ML', code: '20100500', cat: '農薬', unit: '本', stock: 3, reorder: 2, expiryDays: 400, supplier: 'JA',
		ref: 'item:ＭＥＰ乳剤|ＭＥＰ50％|500ml', prices: [2120, 2050, 1880, 1800], qty: 3, out: 1,
		purpose: 'アブラムシ・カメムシの防除', features: '有機リン系の殺虫剤', how: '1000〜2000倍にうすめて散布',
		cautions: '収穫前日数を守る。蚕・魚に注意', crops: 'トマト、ナス、キャベツ'
	},
	{
		name: 'ダコニール1000', spec: '500ML', code: '20200500', cat: '農薬', unit: '本', stock: 2, reorder: 1, expiryDays: 600, supplier: 'JA',
		ref: 'item:ＴＰＮ水和剤|ＴＰＮ40％|500ml', prices: [2480, 2500, 2420, 2300], qty: 2, out: 1,
		purpose: '疫病・葉かび病の予防', features: '幅広い病気に効く殺菌剤', how: '1000倍にうすめて散布', crops: 'トマト、キュウリ'
	},
	{
		name: '展着剤 アプローチBI', spec: '500ML', code: '20900500', cat: '農薬', unit: '本', stock: 1, reorder: null, expiryDays: 20, supplier: 'JA',
		prices: [1210, 1180, 1150, 1100], qty: 2, out: 1, purpose: '農薬に混ぜて、葉への付きをよくする'
	},
	{
		name: 'トマト苗 桃太郎', spec: '9cmポット', code: '', cat: '種苗', unit: '本', stock: 0, reorder: null, supplier: '種苗店',
		ref: 'item:トマト苗|銘柄等級なし|１本', prices: [218, 205, 195, 190], qty: 200, out: 0, crops: 'トマト'
	},
	{
		name: '野菜用段ボール', spec: '10KG用', code: '30100010', cat: '包装資材', unit: '枚', stock: 120, reorder: 200, supplier: 'JA',
		ref: 'item:野菜用段ボール|10kg入り用|１箱', prices: [146, 140, 138, 130], qty: 500, out: 300, purpose: 'トマトの出荷用'
	},
	{
		name: '農業用ビニール', spec: '0.1mm×135cm×100m', code: '', cat: '被覆資材', unit: '本', stock: 2, reorder: 1, supplier: '資材店',
		ref: 'item:農業用ビニール|厚さ0.1mm・幅1.35ｍ|100ｍ', prices: [25200, 23000, 21800, 20500], qty: 2, out: 1,
		purpose: 'ハウスの張り替え（3年ごと）'
	},
	{
		name: 'A重油', spec: '200L', code: '', cat: '燃料', unit: 'ドラム', stock: 3, reorder: 2, supplier: '石油店',
		ref: 'item:重油|燃料用(Ａ重油)|200Ｌ', prices: [28600, 24800, 23100, 22500], qty: 4, out: 3, purpose: 'ハウスの暖房機'
	},
	{
		name: '軽油', spec: '18L', code: '', cat: '燃料', unit: '缶', stock: 4, reorder: 2, supplier: '石油店',
		ref: 'item:軽油|引取税込みのもの|18Ｌ', prices: [2870, 2850, 2800, 2780], qty: 6, out: 4, purpose: 'トラクター・管理機'
	}
];

// 年ごとの購入月（今年は今月までのぶんだけ使う）
const BUY_MONTHS = [2, 5, 9];

function pad(n: number) {
	return String(n).padStart(2, '0');
}

export function demoData(now = new Date()): DemoData {
	const today = todayJst(now);
	const year = Number(today.slice(0, 4));
	const month = Number(today.slice(5, 7));
	const day = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
	let seq = 0;
	const id = (p: string) => `demo-${p}-${++seq}`;

	const household: Household = {
		id: DEMO_HOUSEHOLD,
		name: 'みどり農園（デモ）',
		owner_id: DEMO_USER,
		alert_days: 30,
		price_alert_pct: 10,
		gap_alert_pts: 5,
		notify_enabled: true,
		public_notify: true
	};
	const members: Member[] = [
		{ household_id: DEMO_HOUSEHOLD, user_id: DEMO_USER, email: 'demo@example.com', display_name: 'たろう', role: 'owner' },
		{ household_id: DEMO_HOUSEHOLD, user_id: DEMO_FAMILY, email: 'family@example.com', display_name: 'はなこ', role: 'member' }
	];
	const categories: Category[] = CATEGORIES.map(([name, ref], i) => ({
		id: `demo-cat-${i + 1}`,
		household_id: DEMO_HOUSEHOLD,
		name,
		sort_order: i + 1,
		public_ref: ref
	}));
	const catId = (name: string) => categories.find((c) => c.name === name)!.id;

	const items: Item[] = [];
	const events: StockEvent[] = [];
	const event = (p: Partial<StockEvent> & Pick<StockEvent, 'item_id' | 'item_name' | 'category_name' | 'type' | 'event_date'>): StockEvent => ({
		id: id('ev'),
		household_id: DEMO_HOUSEHOLD,
		date_precision: 'day',
		qty: null,
		stock_after: null,
		unit_price: null,
		amount: null,
		discount: null,
		tax: null,
		amount_ex_tax: null,
		supplier: '',
		memo: '',
		cancelled: false,
		ref_id: null,
		user_id: DEMO_USER,
		created_at: `${p.event_date}T09:00:00+09:00`,
		...p
	});

	SEEDS.forEach((s, n) => {
		const itemId = `demo-item-${n + 1}`;
		const base = { item_id: itemId, item_name: s.name, category_name: s.cat, supplier: s.supplier };
		// 去年までは、JAの明細から取り込んだ「過去の購入」
		for (let back = 3; back >= 1; back--) {
			BUY_MONTHS.forEach((m, k) => {
				// 同じ年の中でも、少しずつ値段を変える
				const price = Math.round(s.prices[back] * (1 + (k - 1) * 0.01));
				events.push(event({ ...base, type: '過去の購入', event_date: day(year - back, m, 10 + n), qty: s.qty, unit_price: price, amount: Math.round(price * s.qty), memo: 'JAお買上げ明細から取り込み' }));
			});
		}

		// 今年は、1月に登録してから入庫・出庫を記録している
		const moves: StockEvent[] = [];
		let delta = 0;
		BUY_MONTHS.filter((m) => m <= month).forEach((m, k) => {
			const price = Math.round(s.prices[0] * (1 + (k - 1) * 0.01));
			moves.push(event({ ...base, type: '入庫', event_date: day(year, m, 10 + n), qty: s.qty, unit_price: price, amount: Math.round(price * s.qty), memo: '' }));
			delta += s.qty;
			if (s.out && m + 1 <= month) {
				moves.push(event({ ...base, type: '出庫', event_date: day(year, m + 1, 5 + n), qty: -s.out, supplier: '', memo: '' }));
				delta -= s.out;
			}
		});
		// 最後の在庫が見本の数になるよう、登録したときの在庫を決める
		let stock = Math.max(0, s.stock - delta);
		const lastBuy = moves.filter((e) => e.type === '入庫').at(-1);
		events.push(event({ ...base, type: '登録', event_date: day(year, 1, 5), qty: stock, stock_after: stock, unit_price: lastBuy?.unit_price ?? s.prices[1] }));
		for (const e of moves) {
			stock = Math.max(0, stock + Number(e.qty));
			e.stock_after = stock;
			events.push(e);
		}
		// 入庫が多くて見本の数より多いときは、今日までに使った分として出庫する
		if (stock > s.stock) {
			const used = stock - s.stock;
			stock = s.stock;
			events.push(event({ ...base, type: '出庫', event_date: today, qty: -used, stock_after: stock, supplier: '', created_at: `${today}T07:00:00+09:00` }));
		}

		const lastPast = events.filter((e) => e.item_id === itemId && e.unit_price !== null && e.type !== '登録').at(-1);
		items.push({
			id: itemId,
			household_id: DEMO_HOUSEHOLD,
			name: s.name,
			spec: s.spec,
			product_code: s.code,
			category_id: catId(s.cat),
			unit: s.unit,
			stock,
			price: lastPast?.unit_price ?? s.prices[0],
			reorder_level: s.reorder,
			expiry: s.expiryDays ? addDaysTo(today, s.expiryDays) : null,
			supplier: s.supplier,
			purpose: s.purpose ?? '',
			memo: '',
			features: s.features ?? '',
			how_to_use: s.how ?? '',
			cautions: s.cautions ?? '',
			crops: s.crops ?? '',
			public_ref: s.ref ?? '',
			last_purchase_date: lastPast?.event_date ?? null,
			updated_at: `${today}T08:00:00+09:00`,
			updated_by: n % 3 === 0 ? DEMO_FAMILY : DEMO_USER
		});
	});

	events.sort((a, b) => a.created_at.localeCompare(b.created_at));
	return { household, members, categories, items, events };
}

function addDaysTo(date: string, days: number) {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

// ----- データベースの関数の代わり -----
interface DemoDb {
	items: Item[];
	events: StockEvent[];
	categories: Category[];
}

type Args = Record<string, unknown>;

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function newId() {
	return crypto.randomUUID?.() ?? `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function demoRpc(db: DemoDb, name: string, args: Args): MutationResult {
	const nowIso = new Date().toISOString();
	const today = todayJst();
	const findItem = (itemId: unknown) => {
		const it = db.items.find((i) => i.id === itemId);
		if (!it) throw new Error('この資材は、ほかの人がすでに削除しています。');
		return it;
	};
	const catName = (catId: string) => db.categories.find((c) => c.id === catId)?.name ?? '';
	const event = (it: Pick<Item, 'id' | 'name' | 'category_id'> | null, p: Partial<StockEvent> & Pick<StockEvent, 'type'>): StockEvent => ({
		id: newId(),
		household_id: DEMO_HOUSEHOLD,
		item_id: it?.id ?? null,
		item_name: it?.name ?? '',
		category_name: it ? catName(it.category_id) : '',
		event_date: today,
		date_precision: 'day',
		qty: null,
		stock_after: null,
		unit_price: null,
		amount: null,
		discount: null,
		tax: null,
		amount_ex_tax: null,
		supplier: '',
		memo: '',
		cancelled: false,
		ref_id: null,
		user_id: DEMO_USER,
		created_at: nowIso,
		...p
	});
	const amountOf = (price: number, qty: number, discount: number | null) => Math.round(price * qty) - (discount || 0);

	switch (name) {
		case 'save_item': {
			const p = args.p as Partial<Item>;
			if (!db.categories.some((c) => c.id === p.category_id)) throw new Error('カテゴリを選んでください。');
			const fields = {
				name: str(p.name).trim(),
				spec: str(p.spec).trim(),
				product_code: str(p.product_code).trim(),
				category_id: str(p.category_id),
				unit: str(p.unit),
				stock: num(p.stock) ?? 0,
				price: num(p.price) ?? 0,
				reorder_level: num(p.reorder_level),
				expiry: p.expiry || null,
				supplier: str(p.supplier),
				purpose: str(p.purpose),
				memo: str(p.memo),
				features: str(p.features),
				how_to_use: str(p.how_to_use),
				cautions: str(p.cautions),
				crops: str(p.crops),
				public_ref: str(p.public_ref),
				updated_at: nowIso,
				updated_by: DEMO_USER
			};
			if (!p.id) {
				const it: Item = { id: newId(), household_id: DEMO_HOUSEHOLD, last_purchase_date: null, ...fields };
				return { item: it, events: [event(it, { type: '登録', qty: it.stock, stock_after: it.stock, unit_price: it.price, supplier: it.supplier })] };
			}
			const cur = findItem(p.id);
			const it: Item = { ...cur, ...fields };
			return { item: it, events: [event(it, { type: '編集', qty: it.stock - cur.stock, stock_after: it.stock, memo: str(args.p_change_memo) })] };
		}

		case 'delete_item': {
			const cur = db.items.find((i) => i.id === args.p_item);
			if (!cur) return { deleted_id: str(args.p_item), events: [] };
			const ev = event(cur, { type: '削除', qty: -cur.stock, stock_after: 0, memo: '資材を削除（価格の履歴は残す）' });
			return { deleted_id: cur.id, events: [{ ...ev, item_id: null }] };
		}

		case 'move_stock': {
			const cur = findItem(args.p_item);
			const kind = str(args.p_kind);
			const qty = num(args.p_qty) ?? 0;
			let delta: number;
			if (kind === '調整') {
				delta = Math.max(qty, -cur.stock);
				if (!delta) return { item: cur, events: [] };
			} else {
				if (qty <= 0) throw new Error('数量を正しく入力してください。');
				if (kind === '出庫' && qty > cur.stock) throw new Error(`在庫が足りません（いまの在庫：${cur.stock}${cur.unit}）。`);
				delta = kind === '入庫' ? qty : -qty;
			}
			if (kind !== '入庫') {
				const it = { ...cur, stock: cur.stock + delta, updated_at: nowIso, updated_by: DEMO_USER };
				return { item: it, events: [event(it, { type: kind as StockEvent['type'], qty: delta, stock_after: it.stock, memo: str(args.p_memo) })] };
			}
			const d = str(args.p_date) || today;
			const price = num(args.p_unit_price) ?? cur.price;
			const sup = str(args.p_supplier).trim() || cur.supplier;
			const discount = num(args.p_discount) || null;
			// いちばん新しい購入なら、資材の単価と購入先を更新する
			const latest = !cur.last_purchase_date || d >= cur.last_purchase_date;
			const it: Item = {
				...cur,
				stock: cur.stock + delta,
				price: latest ? price : cur.price,
				supplier: latest ? sup : cur.supplier,
				last_purchase_date: latest ? d : cur.last_purchase_date,
				updated_at: nowIso,
				updated_by: DEMO_USER
			};
			const ev = event(it, {
				type: '入庫', event_date: d, qty: delta, stock_after: it.stock, unit_price: price, amount: amountOf(price, delta, discount),
				discount, tax: num(args.p_tax), supplier: sup, memo: str(args.p_memo)
			});
			return { item: it, events: [ev] };
		}

		case 'add_past_purchase': {
			const cur = findItem(args.p_item);
			const d = str(args.p_date);
			const price = num(args.p_unit_price);
			if (!d) throw new Error('購入日（または年）を入力してください。');
			if (price === null || price < 0) throw new Error('購入単価を入力してください。');
			const q = (num(args.p_qty) ?? 0) > 0 ? Number(args.p_qty) : 1;
			const precision = args.p_precision === 'year' ? 'year' : 'day';
			const discount = num(args.p_discount) || null;
			const ev = event(cur, {
				type: '過去の購入', event_date: d, date_precision: precision, qty: q, stock_after: cur.stock, unit_price: price,
				amount: amountOf(price, q, discount), discount, tax: num(args.p_tax), supplier: str(args.p_supplier), memo: str(args.p_memo)
			});
			// 日付が分かっていて、いちばん新しい購入なら単価を更新する
			const it = precision !== 'year' && (!cur.last_purchase_date || d > cur.last_purchase_date)
				? { ...cur, price, last_purchase_date: d, updated_at: nowIso, updated_by: DEMO_USER }
				: cur;
			return { item: it, events: [ev] };
		}

		case 'cancel_event': {
			const t = db.events.find((e) => e.id === args.p_event);
			if (!t) throw new Error('記録が見つかりません。');
			if (!['入庫', '出庫', '調整', '過去の購入', '棚卸し'].includes(t.type)) throw new Error('この記録は取り消せません。');
			if (t.cancelled) throw new Error('この記録はすでに取り消されています。');
			const target = { ...t, cancelled: true };
			let it = db.items.find((i) => i.id === t.item_id) ?? null;
			if (it) {
				if (t.type !== '過去の購入') it = { ...it, stock: Math.max(0, it.stock - (Number(t.qty) || 0)) };
				// 購入を取り消したら、残っている最新の購入から単価を計算し直す
				if (t.type === '入庫' || t.type === '過去の購入') {
					const latest = db.events
						.filter((e) => e.item_id === it!.id && e.id !== t.id && (e.type === '入庫' || e.type === '過去の購入') && !e.cancelled && e.date_precision === 'day')
						.sort((a, b) => b.event_date.localeCompare(a.event_date) || b.created_at.localeCompare(a.created_at))[0];
					it = { ...it, last_purchase_date: latest?.event_date ?? null, price: latest?.unit_price ?? it.price };
				}
				it = { ...it, updated_at: nowIso, updated_by: DEMO_USER };
			}
			const ev = event(null, {
				item_id: t.item_id, item_name: t.item_name, category_name: t.category_name, type: '取消',
				qty: t.type === '過去の購入' ? null : -(Number(t.qty) || 0), stock_after: it?.stock ?? null, ref_id: t.id,
				memo: `${t.type}（${t.event_date}）を取り消し`
			});
			return { item: it, events: [target, ev] };
		}

		case 'stocktake': {
			const counts = args.p_counts as { item_id: string; counted: number; expected: number }[];
			const note = str(args.p_memo).trim();
			const items: Item[] = [];
			const events: StockEvent[] = [];
			let checked = 0;
			for (const c of counts) {
				if (c.counted === null || c.counted < 0) throw new Error('数えた数を正しく入力してください。');
				const cur = db.items.find((i) => i.id === c.item_id);
				if (!cur) continue;
				checked++;
				const expected = c.expected ?? cur.stock;
				const delta = Math.max(c.counted - expected, -cur.stock);
				if (!delta) continue;
				const it = { ...cur, stock: cur.stock + delta, updated_at: nowIso, updated_by: DEMO_USER };
				items.push(it);
				events.push(event(it, { type: '棚卸し', qty: delta, stock_after: it.stock, memo: `帳簿 ${expected}${it.unit} → 実数 ${c.counted}${it.unit}${note ? `（${note}）` : ''}` }));
			}
			return { items, events, checked };
		}

		case 'merge_category': {
			const src = db.categories.find((c) => c.id === args.p_from);
			const dst = db.categories.find((c) => c.id === args.p_to);
			if (src?.id === dst?.id) throw new Error('まとめ先には、別のカテゴリを選んでください。');
			if (!src || !dst) throw new Error('カテゴリが見つかりません。画面を読み込み直してください。');
			const items = db.items.filter((i) => i.category_id === src.id).map((i) => ({ ...i, category_id: dst.id, updated_at: nowIso, updated_by: DEMO_USER }));
			const events = items.map((it) => ({ ...event(it, { type: '編集' as const, qty: 0, stock_after: it.stock, memo: `カテゴリ ${src.name}→${dst.name}（カテゴリをまとめる）` }), category_name: dst.name }));
			return { items, events };
		}
	}
	throw new Error('デモ版では使えない操作です。');
}
