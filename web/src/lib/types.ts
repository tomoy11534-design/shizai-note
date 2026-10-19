// データベースの行の形（列名はデータベースと同じスネークケース）

export interface Household {
	id: string;
	name: string;
	owner_id: string;
	alert_days: number;
	price_alert_pct: number;
	gap_alert_pts: number;
	notify_enabled: boolean;
	public_notify: boolean;
}

export interface Member {
	household_id: string;
	user_id: string;
	email: string;
	display_name: string;
	role: 'owner' | 'member';
}

export interface Invite {
	household_id: string;
	email: string;
	created_at: string;
}

export interface Category {
	id: string;
	household_id: string;
	name: string;
	sort_order: number;
	public_ref: string;
}

export interface Item {
	id: string;
	household_id: string;
	name: string;
	spec: string;
	category_id: string;
	unit: string;
	stock: number;
	price: number;
	reorder_level: number | null;
	expiry: string | null;
	supplier: string;
	purpose: string;
	memo: string;
	features: string;
	how_to_use: string;
	cautions: string;
	crops: string;
	public_ref: string;
	last_purchase_date: string | null;
	updated_at: string;
	updated_by: string | null;
}

export type EventType = '登録' | '編集' | '削除' | '入庫' | '出庫' | '調整' | '過去の購入' | '取消' | '棚卸し';

export interface StockEvent {
	id: string;
	household_id: string;
	item_id: string | null;
	item_name: string;
	category_name: string;
	type: EventType;
	event_date: string;
	date_precision: 'day' | 'year';
	qty: number | null;
	stock_after: number | null;
	unit_price: number | null;
	amount: number | null;
	// 値引金額・消費税・税抜金額（明細から分かるときだけ）
	discount: number | null;
	tax: number | null;
	amount_ex_tax: number | null;
	supplier: string;
	memo: string;
	cancelled: boolean;
	ref_id: string | null;
	user_id: string | null;
	created_at: string;
}

export interface Manual {
	id: string;
	household_id: string;
	item_id: string | null;
	item_name: string;
	title: string;
	storage_path: string;
	file_name: string;
	mime_type: string;
	size: number;
	uploaded_by: string | null;
	created_at: string;
}

export interface PublicSeries {
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

export interface AppStatus {
	public_last_fetch: string | null;
	public_last_status: string;
	public_latest_period: string;
}

// RPCの戻り値
export interface MutationResult {
	item?: Item | null;
	items?: Item[];
	events?: StockEvent[];
	deleted_id?: string;
	conflict?: boolean;
	// 棚卸しで数えた品目の数
	checked?: number;
}
