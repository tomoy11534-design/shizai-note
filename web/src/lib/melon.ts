// 贈答メロン帳の計算（画面やデータベースに関係しない部分。テストしやすいようにここにまとめる）

export interface MelonOrder {
	id: string;
	household_id: string;
	season: number;
	customer_name: string;
	customer_phone: string;
	customer_postal: string;
	customer_address: string;
	to_same: boolean;
	to_name: string;
	to_phone: string;
	to_postal: string;
	to_address: string;
	product: string;
	cases: number;
	unit_price: number;
	ship_timing: string;
	paid_on: string | null;
	shipped_on: string | null;
	notified_on: string | null;
	memo: string;
	created_at: string;
	updated_at: string;
}

export interface DirectSale {
	id: string;
	household_id: string;
	sold_on: string;
	place: string;
	fruits: number;
	amount: number;
	memo: string;
	created_at: string;
}

export const DEFAULT_CAPACITY = 50;

// 申込の今の段階（入金 → 発送 → 発送の連絡、の順に進む）
export type OrderStage = 'unpaid' | 'unshipped' | 'unnotified' | 'done';
export const STAGE_LABELS: Record<OrderStage, string> = {
	unpaid: '入金待ち',
	unshipped: '発送待ち',
	unnotified: '連絡待ち',
	done: '完了'
};

/** 申込の段階。入金がまだなら、発送済みでも「入金待ち」にする（入金のもれを見落とさないため） */
export function stageOf(o: Pick<MelonOrder, 'paid_on' | 'shipped_on' | 'notified_on'>): OrderStage {
	if (!o.paid_on) return 'unpaid';
	if (!o.shipped_on) return 'unshipped';
	if (!o.notified_on) return 'unnotified';
	return 'done';
}

/** 1年分の申込のまとめ（受付したケース数・残り・段階ごとの件数・金額） */
export function seasonSummary(orders: MelonOrder[], capacity: number) {
	const cases = orders.reduce((s, o) => s + o.cases, 0);
	const count = { unpaid: 0, unshipped: 0, unnotified: 0, done: 0 } as Record<OrderStage, number>;
	for (const o of orders) count[stageOf(o)]++;
	const total = orders.reduce((s, o) => s + o.cases * o.unit_price, 0);
	const paid = orders.filter((o) => o.paid_on).reduce((s, o) => s + o.cases * o.unit_price, 0);
	return { orders: orders.length, cases, left: capacity - cases, count, total, unpaidAmount: total - paid };
}

// 品物の名前をくらべやすくする（全角・半角や空白のちがいを気にしない）
export const productKey = (s: string) => s.normalize('NFKC').replace(/\s+/g, '');

export interface ProductRow {
	product: string;
	cases: number;
	/** 上限（決めていない品物は null） */
	cap: number | null;
	left: number | null;
}

/**
 * 品物ごとの受付ケース数と残り
 * 上限を決めた品物を決めた順に並べ、そのあとに上限を決めていない品物（申込にだけある品物）を並べる
 */
export function productSummary(orders: Pick<MelonOrder, 'product' | 'cases'>[], caps: Record<string, number>): ProductRow[] {
	const rows = new Map<string, ProductRow>();
	for (const [product, cap] of Object.entries(caps)) rows.set(productKey(product), { product, cases: 0, cap, left: cap });
	for (const o of orders) {
		const k = productKey(o.product);
		let r = rows.get(k);
		if (!r) rows.set(k, (r = { product: o.product.trim() || '（品物の名前なし）', cases: 0, cap: null, left: null }));
		r.cases += o.cases;
		if (r.cap !== null) r.left = r.cap - r.cases;
	}
	return [...rows.values()];
}

/** 全部あわせた上限（品物ごとに決めていれば、その合計） */
export function totalCapacity(capacity: number, caps: Record<string, number>): number {
	const v = Object.values(caps);
	return v.length ? v.reduce((s, n) => s + n, 0) : capacity;
}

/** 品物ごとの残りを知らせる文（ホームページの「残り◯ケース」を直してもらうときに貼る） */
export function remainingText(rows: ProductRow[], season: number): string {
	const lines = [`${season}年の贈答用メロンの残り（電話・LINE・ホームページの申込をあわせた数）`];
	for (const r of rows) if (r.left !== null) lines.push(`・${r.product}：残り${Math.max(0, r.left)}ケース（受付${r.cases}／${r.cap}）`);
	return lines.join('\n');
}

/** お届け先（「注文した人と同じ」なら注文した人） */
export function destination(o: MelonOrder) {
	return o.to_same
		? { name: o.customer_name, phone: o.customer_phone, postal: o.customer_postal, address: o.customer_address }
		: { name: o.to_name, phone: o.to_phone, postal: o.to_postal, address: o.to_address };
}

// 郵便番号を「123-4567」の形にそろえる（7桁でなければそのまま）
export function formatPostal(s: string): string {
	const d = s.normalize('NFKC').replace(/[^0-9]/g, '');
	return d.length === 7 ? `${d.slice(0, 3)}-${d.slice(3)}` : s.trim();
}

/** 伝票に書き写す送り先（ご依頼主つき） */
export function shippingLabel(o: MelonOrder): string {
	const to = destination(o);
	const lines = ['【お届け先】'];
	if (to.postal) lines.push(`〒${formatPostal(to.postal)}`);
	if (to.address) lines.push(to.address);
	lines.push(`${to.name} 様`);
	if (to.phone) lines.push(`TEL ${to.phone}`);
	if (!o.to_same) {
		lines.push('', '【ご依頼主】');
		if (o.customer_postal) lines.push(`〒${formatPostal(o.customer_postal)}`);
		if (o.customer_address) lines.push(o.customer_address);
		lines.push(`${o.customer_name} 様`);
		if (o.customer_phone) lines.push(`TEL ${o.customer_phone}`);
	}
	lines.push('', `品物：${itemText(o)}`);
	return lines.join('\n');
}

export const itemText = (o: Pick<MelonOrder, 'product' | 'cases'>) => `${o.product || 'メロン'} ${o.cases}箱`;

/** 発送したことを知らせる文（LINEやメールに貼る） */
export function shippedNotice(o: MelonOrder, farm: string): string {
	const to = destination(o);
	const lines = [`${o.customer_name} 様`, '', `このたびはご注文ありがとうございました。`, `${itemText(o)}を発送しました。`];
	if (!o.to_same) lines.push(`お届け先：${to.name} 様`);
	lines.push('届くまで、今しばらくお待ちください。', '', farm);
	return lines.join('\n');
}

/** 去年までのお客さんへの、今年の受付の案内文 */
export function invitation(name: string, season: number, farm: string): string {
	return [
		`${name} 様`,
		'',
		'昨年はメロンをご注文いただき、ありがとうございました。',
		`今年（${season}年）も、贈答用メロンのご注文を受け付けています。`,
		'数に限りがありますので、ご希望の際はお早めにご連絡ください。',
		'',
		farm
	].join('\n');
}

// 同じお客さんかどうか（名前と電話番号。電話番号がなければ名前だけ）
const customerKey = (o: Pick<MelonOrder, 'customer_name' | 'customer_phone'>) =>
	`${o.customer_name.normalize('NFKC').replace(/\s+/g, '')}|${o.customer_phone.normalize('NFKC').replace(/[^0-9]/g, '')}`;

/**
 * 前の年までに注文があって、今年はまだ注文がないお客さん
 * いちばん新しい注文を代表にして、新しい順に並べる
 */
export function pastCustomers(orders: MelonOrder[], season: number): { last: MelonOrder; seasons: number[] }[] {
	const thisYear = new Set(orders.filter((o) => o.season === season).map(customerKey));
	const map = new Map<string, { last: MelonOrder; seasons: Set<number> }>();
	for (const o of orders) {
		if (o.season >= season) continue;
		const k = customerKey(o);
		if (thisYear.has(k)) continue;
		const cur = map.get(k);
		if (!cur) map.set(k, { last: o, seasons: new Set([o.season]) });
		else {
			cur.seasons.add(o.season);
			if (o.season > cur.last.season || (o.season === cur.last.season && o.created_at > cur.last.created_at)) cur.last = o;
		}
	}
	return [...map.values()]
		.map((c) => ({ last: c.last, seasons: [...c.seasons].sort((a, b) => b - a) }))
		.sort((a, b) => b.last.season - a.last.season || a.last.customer_name.localeCompare(b.last.customer_name, 'ja'));
}

/** 直売の1年分のまとめ */
export function directSummary(sales: DirectSale[]) {
	return {
		count: sales.length,
		fruits: sales.reduce((s, x) => s + x.fruits, 0),
		amount: sales.reduce((s, x) => s + x.amount, 0)
	};
}
