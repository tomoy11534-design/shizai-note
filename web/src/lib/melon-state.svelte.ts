// 贈答メロン帳のデータ（申込・受付の上限・直売の記録）。デモ版では見本のデータを使い、何も保存しない
import { app } from './app-state.svelte.js';
import { DEFAULT_CAPACITY, type DirectSale, type MelonOrder } from './melon.js';
import { supabase } from './supabase.js';

export type OrderInput = Omit<MelonOrder, 'id' | 'household_id' | 'created_at' | 'updated_at'>;
export type SaleInput = Omit<DirectSale, 'id' | 'household_id' | 'created_at'>;

// 今日の日付（日本時間）
export const todayJst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// データベースの準備（SQLの実行）がまだのときのエラーを、分かる言葉にする
function friendly(e: { message: string; code?: string }) {
	if (e.code === '42P01' || e.code === 'PGRST205' || /melon_/.test(e.message)) {
		return '贈答メロン帳のデータベースの準備がまだです。管理している人に「add-melon-orders.sql を実行してください」と伝えてください。';
	}
	return e.message;
}

class MelonState {
	orders = $state.raw<MelonOrder[]>([]);
	sales = $state.raw<DirectSale[]>([]);
	capacities = $state.raw<Map<number, number>>(new Map());
	loaded = $state(false);
	error = $state('');
	season = $state(new Date().getMonth() >= 8 ? new Date().getFullYear() + 1 : new Date().getFullYear());

	capacity = $derived(this.capacities.get(this.season) ?? DEFAULT_CAPACITY);
	seasonOrders = $derived(this.orders.filter((o) => o.season === this.season));
	seasonSales = $derived(this.sales.filter((s) => s.sold_on.startsWith(String(this.season))));
	// 申込や直売の記録がある年と、今の年（新しい順）
	seasons = $derived(
		[...new Set([this.season, new Date().getFullYear(), new Date().getFullYear() + 1, ...this.orders.map((o) => o.season), ...this.sales.map((s) => Number(s.sold_on.slice(0, 4)))])].sort(
			(a, b) => b - a
		)
	);
	// 入力の候補（前に使った品物名・発送の時期・直売の場所）
	products = $derived([...new Set(this.orders.map((o) => o.product).filter(Boolean))]);
	timings = $derived([...new Set(this.orders.map((o) => o.ship_timing).filter(Boolean))]);
	places = $derived([...new Set(this.sales.map((s) => s.place).filter(Boolean))]);

	async load() {
		const hid = app.householdId;
		if (!hid) return;
		if (app.demo) {
			if (!this.loaded) this.useDemo(hid);
			this.loaded = true;
			return;
		}
		const [o, s, c] = await Promise.all([
			supabase.from('melon_orders').select('*').eq('household_id', hid).order('created_at'),
			supabase.from('melon_direct_sales').select('*').eq('household_id', hid).order('sold_on'),
			supabase.from('melon_seasons').select('season, capacity').eq('household_id', hid)
		]);
		const err = o.error ?? s.error ?? c.error;
		this.error = err ? friendly(err) : '';
		if (!err) {
			this.orders = o.data as MelonOrder[];
			this.sales = s.data as DirectSale[];
			this.capacities = new Map((c.data ?? []).map((r) => [r.season as number, r.capacity as number]));
		}
		this.loaded = true;
	}

	async saveOrder(input: OrderInput, id?: string) {
		const hid = app.householdId!;
		const now = new Date().toISOString();
		if (app.demo) {
			const row: MelonOrder = { ...input, id: id ?? crypto.randomUUID(), household_id: hid, created_at: this.find(id)?.created_at ?? now, updated_at: now };
			this.orders = id ? this.orders.map((o) => (o.id === id ? row : o)) : [...this.orders, row];
			return row;
		}
		const q = id
			? supabase.from('melon_orders').update({ ...input, updated_at: now }).eq('id', id)
			: supabase.from('melon_orders').insert({ ...input, household_id: hid });
		const { data, error } = await q.select().single();
		if (error) throw new Error(friendly(error));
		const row = data as MelonOrder;
		this.orders = id ? this.orders.map((o) => (o.id === id ? row : o)) : [...this.orders, row];
		return row;
	}

	// 入金・発送・連絡の日付だけを変える（ボタン1つで済むように）
	async mark(id: string, field: 'paid_on' | 'shipped_on' | 'notified_on', on: boolean) {
		const cur = this.find(id);
		if (!cur) return;
		const { id: _id, household_id: _h, created_at: _c, updated_at: _u, ...input } = cur;
		await this.saveOrder({ ...input, [field]: on ? todayJst() : null }, id);
	}

	async deleteOrder(id: string) {
		if (!app.demo) {
			const { error } = await supabase.from('melon_orders').delete().eq('id', id);
			if (error) throw new Error(friendly(error));
		}
		this.orders = this.orders.filter((o) => o.id !== id);
	}

	async setCapacity(capacity: number) {
		if (!app.demo) {
			const { error } = await supabase.from('melon_seasons').upsert({ household_id: app.householdId, season: this.season, capacity });
			if (error) throw new Error(friendly(error));
		}
		this.capacities = new Map([...this.capacities, [this.season, capacity]]);
	}

	async addSale(input: SaleInput) {
		const hid = app.householdId!;
		if (app.demo) {
			this.sales = [...this.sales, { ...input, id: crypto.randomUUID(), household_id: hid, created_at: new Date().toISOString() }];
			return;
		}
		const { data, error } = await supabase.from('melon_direct_sales').insert({ ...input, household_id: hid }).select().single();
		if (error) throw new Error(friendly(error));
		this.sales = [...this.sales, data as DirectSale];
	}

	async deleteSale(id: string) {
		if (!app.demo) {
			const { error } = await supabase.from('melon_direct_sales').delete().eq('id', id);
			if (error) throw new Error(friendly(error));
		}
		this.sales = this.sales.filter((s) => s.id !== id);
	}

	// コピーできなかったときに、文を見せて手でコピーしてもらう
	copyFallback = $state<{ title: string; text: string } | null>(null);

	async copy(text: string, title: string) {
		try {
			await navigator.clipboard.writeText(text);
			app.toast(`${title}をコピーしました。貼りつけて使ってください。`);
		} catch {
			this.copyFallback = { title, text };
		}
	}

	find(id: string | undefined) {
		return id ? this.orders.find((o) => o.id === id) : undefined;
	}

	// デモ版の見本（架空の人）
	private useDemo(hid: string) {
		const y = this.season;
		const base = { household_id: hid, customer_postal: '', customer_address: '', to_same: true, to_name: '', to_phone: '', to_postal: '', to_address: '', memo: '', unit_price: 5000, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
		const o = (p: Partial<MelonOrder>): MelonOrder => ({ id: crypto.randomUUID(), season: y, customer_name: '', customer_phone: '', product: '食べ比べセット', cases: 1, ship_timing: '6月', paid_on: null, shipped_on: null, notified_on: null, ...base, ...p });
		this.orders = [
			o({ customer_name: '山田 花子', customer_phone: '090-0000-1111', customer_postal: '8680000', customer_address: '熊本県球磨郡○○町1-2-3', cases: 2, paid_on: `${y}-03-10` }),
			o({ customer_name: '佐藤 一郎', customer_phone: '080-0000-2222', customer_postal: '8600000', customer_address: '熊本県熊本市○○区4-5', to_same: false, to_name: '佐藤 美咲', to_phone: '03-0000-3333', to_postal: '1000000', to_address: '東京都○○区6-7-8', product: 'ラブコール', ship_timing: '4月下旬' }),
			o({ customer_name: '鈴木 次郎', customer_phone: '090-0000-4444', cases: 3, paid_on: `${y}-03-01`, shipped_on: `${y}-04-25` }),
			o({ season: y - 1, customer_name: '高橋 春子', customer_phone: '080-0000-5555', cases: 1, paid_on: `${y - 1}-03-01`, shipped_on: `${y - 1}-06-05`, notified_on: `${y - 1}-06-05` }),
			o({ season: y - 1, customer_name: '山田 花子', customer_phone: '090-0000-1111', cases: 1, paid_on: `${y - 1}-03-01`, shipped_on: `${y - 1}-06-05`, notified_on: `${y - 1}-06-05` })
		];
		this.sales = [{ id: crypto.randomUUID(), household_id: hid, sold_on: `${y}-06-08`, place: '直売所', fruits: 24, amount: 36000, memo: '', created_at: '' }];
	}
}

export const melon = new MelonState();
