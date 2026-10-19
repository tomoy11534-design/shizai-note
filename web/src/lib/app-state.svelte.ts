// アプリ全体の状態（データの読み込み・保存・家族の操作の同期）
import type { PostgrestError, RealtimeChannel, Session } from '@supabase/supabase-js';
import { compare, itemTags, publicRefOf, purchasesByItem, todayJst, yearStatsOf, type Comparison, type Tag } from './calc.js';
import { errorMessage } from './format.js';
import { MANUAL_BUCKET, supabase } from './supabase.js';
import type {
	AppStatus,
	Category,
	Household,
	Invite,
	Item,
	Manual,
	Member,
	MutationResult,
	PublicSeries,
	StockEvent
} from './types.js';

export type Tab = 'stock' | 'price' | 'manual' | 'history' | 'summary' | 'settings';

export type ModalState =
	| { kind: 'item'; id: string | null }
	| { kind: 'move'; id: string; move: '入庫' | '出庫' }
	| { kind: 'past'; id: string }
	| { kind: 'detail'; id: string }
	| { kind: 'upload'; id: string; back: boolean }
	| { kind: 'rename-category'; id: string };

interface Dialog {
	kind: 'confirm' | 'prompt';
	message: string;
	okLabel: string;
	value: string;
	resolve: (value: string | null) => void;
}

interface Membership {
	household_id: string;
	role: string;
	households: { name: string } | null;
}

const CACHE_PREFIX = 'shizai-note-cache-v1:';
const PUBLIC_CACHE = 'shizai-note-public-v1';
const HOUSEHOLD_KEY = 'shizai-note-household';
const TAB_KEY = 'shizai-note-tab';
export const MAX_SERIES = 5;

// localStorage は使えないこともあるので、失敗しても止まらないようにする
function readJson<T>(key: string): T | null {
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

function writeJson(key: string, value: unknown) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// 保存できなくても動作には影響しない
	}
}

// データベースのエラーを分かりやすい日本語にする
function friendly(error: PostgrestError | Error | { message: string; code?: string }): string {
	const code = 'code' in error ? error.code : '';
	if (code === '23505') return '同じ名前がすでにあります。';
	if (code === '23503' || code === '23001') return 'このカテゴリを使っている資材があるため削除できません。先に別のカテゴリへ変更してください。';
	if (code === '42501') return 'この操作をする権限がありません。';
	if (/Failed to fetch|NetworkError/i.test(error.message)) return 'インターネットにつながっていません。電波の良いところでもう一度お試しください。';
	return error.message;
}

function upsertById<T extends { id: string }>(list: T[], rows: T[]): T[] {
	const map = new Map(list.map((x) => [x.id, x]));
	for (const r of rows) map.set(r.id, r);
	return [...map.values()];
}

class AppState {
	// ----- ログイン -----
	session = $state<Session | null>(null);
	authReady = $state(false);
	memberships = $state.raw<Membership[]>([]);
	householdId = $state<string | null>(null);

	// ----- 農園のデータ（大きいので $state.raw にして、変えるときは丸ごと入れ替える） -----
	household = $state.raw<Household | null>(null);
	members = $state.raw<Member[]>([]);
	invites = $state.raw<Invite[]>([]);
	categories = $state.raw<Category[]>([]);
	items = $state.raw<Item[]>([]);
	events = $state.raw<StockEvent[]>([]);
	manuals = $state.raw<Manual[]>([]);
	publicSeries = $state.raw<PublicSeries[]>([]);
	status = $state.raw<AppStatus | null>(null);

	// ----- 画面の状態 -----
	loaded = $state(false);
	pending = $state(0);
	lastLoaded = $state(0);
	toastMsg = $state<{ text: string; error: boolean; id: number } | null>(null);
	dialog = $state<Dialog | null>(null);
	modal = $state<ModalState | null>(null);
	ui = $state({
		tab: 'stock' as Tab,
		priceYear: new Date().getFullYear(),
		summaryYear: new Date().getFullYear(),
		chartMode: 'yen' as 'yen' | 'index',
		chartSel: [] as { id: string; slot: number }[],
		chartTouched: false,
		indexSel: [
			{ key: 'idx:農業生産資材総合', slot: 0 },
			{ key: 'idx:肥料', slot: 1 },
			{ key: 'idx:農業薬剤', slot: 2 }
		] as { key: string; slot: number }[]
	});

	private queue: Promise<unknown> = Promise.resolve();
	private pendingDelta = new Map<string, number>();
	private reloadAfterPending = false;
	private reloadTimer: ReturnType<typeof setTimeout> | undefined;
	private channel: RealtimeChannel | null = null;
	private toastTimer: ReturnType<typeof setTimeout> | undefined;

	// ----- 計算（データが変わったら自動で作り直す） -----
	catById = $derived(new Map(this.categories.map((c) => [c.id, c])));
	pubMap = $derived(new Map(this.publicSeries.map((s) => [s.key, s])));
	purchases = $derived(purchasesByItem(this.events));
	stats = $derived(new Map([...this.purchases].map(([id, list]) => [id, yearStatsOf(list)])));
	isOwner = $derived(!!this.household && this.household.owner_id === this.session?.user.id);
	myId = $derived(this.session?.user.id ?? '');
	suppliers = $derived(
		[...new Set([...this.items.map((i) => i.supplier), ...this.events.map((e) => e.supplier)].filter(Boolean))].sort((a, b) =>
			a.localeCompare(b, 'ja')
		)
	);
	purchaseYears = $derived(
		[...new Set([new Date().getFullYear(), ...[...this.purchases.values()].flat().map((p) => p.year)])].sort((a, b) => b - a)
	);
	// 比較結果の置き場（データが変わると空になる）
	private cmpCache = $derived.by(() => {
		void this.stats;
		void this.pubMap;
		void this.categories;
		void this.items;
		return new Map<string, Comparison>();
	});

	categoryName(id: string) {
		return this.catById.get(id)?.name ?? '';
	}

	seriesFor(item: Item): PublicSeries | null {
		const ref = publicRefOf(item, this.categories);
		if (!ref || ref === 'none') return null;
		return this.pubMap.get(ref) ?? null;
	}

	compare(item: Item, year: number): Comparison {
		const key = `${item.id}@${year}`;
		let c = this.cmpCache.get(key);
		if (!c) {
			c = compare(this.stats.get(item.id), this.seriesFor(item), year);
			this.cmpCache.set(key, c);
		}
		return c;
	}

	tagsOf(item: Item): Tag[] {
		if (!this.household) return [];
		return itemTags(item, todayJst(), this.household, this.compare(item, new Date().getFullYear()));
	}

	manualsOf(itemId: string) {
		return this.manuals.filter((m) => m.item_id === itemId).sort((a, b) => a.created_at.localeCompare(b.created_at));
	}

	memberName(userId: string | null | undefined): string {
		if (!userId) return '';
		const m = this.members.find((x) => x.user_id === userId);
		return m ? m.display_name || m.email.split('@')[0] : '（退会した家族）';
	}

	sortItems(list: Item[]): Item[] {
		const order = (id: string) => this.catById.get(id)?.sort_order ?? 9999;
		return [...list].sort((a, b) => order(a.category_id) - order(b.category_id) || a.name.localeCompare(b.name, 'ja'));
	}

	findItem(id: string) {
		return this.items.find((i) => i.id === id);
	}

	// ----- お知らせ・確認 -----
	toast(text: string, error = false) {
		clearTimeout(this.toastTimer);
		this.toastMsg = { text, error, id: Date.now() };
		this.toastTimer = setTimeout(() => (this.toastMsg = null), error ? 6000 : 2500);
	}

	confirm(message: string, okLabel = 'OK'): Promise<boolean> {
		return new Promise((resolve) => {
			this.dialog = { kind: 'confirm', message, okLabel, value: '', resolve: (v) => resolve(v !== null) };
		});
	}

	prompt(message: string, value = ''): Promise<string | null> {
		return new Promise((resolve) => {
			this.dialog = { kind: 'prompt', message, okLabel: '保存', value, resolve };
		});
	}

	closeDialog(value: string | null) {
		const d = this.dialog;
		this.dialog = null;
		d?.resolve(value);
	}

	setTab(tab: Tab) {
		this.ui.tab = tab;
		writeJson(TAB_KEY, tab);
	}

	// ----- ログイン -----
	async initAuth() {
		const saved = readJson<Tab>(TAB_KEY);
		if (saved) this.ui.tab = saved;
		const { data } = await supabase.auth.getSession();
		this.session = data.session;
		supabase.auth.onAuthStateChange((event, session) => {
			const changedUser = session?.user.id !== this.session?.user.id;
			this.session = session;
			if (event === 'SIGNED_OUT') this.reset();
			else if (changedUser && session) void this.afterLogin();
		});
		if (this.session) await this.afterLogin();
		this.authReady = true;

		// 画面に戻ってきたら最新データを読み込む
		document.addEventListener('visibilitychange', () => {
			if (!document.hidden && this.householdId && Date.now() - this.lastLoaded > 30_000) void this.loadHousehold();
		});
	}

	async afterLogin() {
		// 招待されていれば、その農園に参加する
		await supabase.rpc('accept_invites');
		await this.loadMemberships();
		const saved = readJson<string>(HOUSEHOLD_KEY);
		const pick = this.memberships.find((m) => m.household_id === saved) ?? this.memberships[0];
		if (pick) await this.openHousehold(pick.household_id);
		this.authReady = true;
	}

	async loadMemberships() {
		const { data, error } = await supabase
			.from('household_members')
			.select('household_id, role, households(name)')
			.eq('user_id', this.session?.user.id ?? '');
		if (error) this.toast(friendly(error), true);
		this.memberships = (data ?? []) as unknown as Membership[];
	}

	async sendLoginMail(email: string) {
		const { error } = await supabase.auth.signInWithOtp({
			email,
			options: { emailRedirectTo: location.origin, shouldCreateUser: true }
		});
		if (error) throw new Error(friendly(error));
	}

	async verifyCode(email: string, token: string) {
		const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
		if (error) throw new Error('コードが正しくないか、期限が切れています。もう一度メールを送ってください。');
	}

	async signOut() {
		await supabase.auth.signOut();
		this.reset();
	}

	private reset() {
		this.channel?.unsubscribe();
		this.channel = null;
		this.householdId = null;
		this.household = null;
		this.memberships = [];
		this.members = [];
		this.invites = [];
		this.categories = [];
		this.items = [];
		this.events = [];
		this.manuals = [];
		this.loaded = false;
		this.modal = null;
	}

	// ----- 農園 -----
	async createHousehold(name: string) {
		const { data, error } = await supabase.rpc('create_household', { p_name: name });
		if (error) throw new Error(friendly(error));
		await this.loadMemberships();
		await this.openHousehold(data as string);
	}

	async openHousehold(id: string) {
		this.householdId = id;
		writeJson(HOUSEHOLD_KEY, id);
		// 前回のデータがあれば先に表示する
		const cached = readJson<Record<string, unknown>>(CACHE_PREFIX + id);
		if (cached) {
			this.applySnapshot(cached);
			this.loaded = true;
		}
		const pub = readJson<{ series: PublicSeries[] }>(PUBLIC_CACHE);
		if (pub?.series) this.publicSeries = pub.series;
		this.subscribe(id);
		await this.loadHousehold();
	}

	private applySnapshot(s: Record<string, unknown>) {
		this.household = s.household as Household;
		this.members = s.members as Member[];
		this.invites = (s.invites as Invite[]) ?? [];
		this.categories = s.categories as Category[];
		this.items = s.items as Item[];
		this.events = s.events as StockEvent[];
		this.manuals = s.manuals as Manual[];
	}

	private writeCache() {
		if (!this.householdId) return;
		writeJson(CACHE_PREFIX + this.householdId, {
			household: this.household,
			members: this.members,
			invites: this.invites,
			categories: this.categories,
			items: this.items,
			events: this.events,
			manuals: this.manuals
		});
	}

	// 記録は1回に1000件までしか取れないので、分けて全部取る
	private async fetchAllEvents(householdId: string): Promise<StockEvent[]> {
		const all: StockEvent[] = [];
		for (let from = 0; ; from += 1000) {
			const { data, error } = await supabase
				.from('stock_events')
				.select('*')
				.eq('household_id', householdId)
				.order('created_at')
				.range(from, from + 999);
			if (error) throw error;
			all.push(...(data as StockEvent[]));
			if (!data || data.length < 1000) return all;
		}
	}

	async loadHousehold() {
		const h = this.householdId;
		if (!h) return;
		// 保存中に読み込むと、画面が一瞬古い値に戻るので、保存が終わってから読む
		if (this.pending > 0) {
			this.reloadAfterPending = true;
			return;
		}
		try {
			const [hh, mem, inv, cats, items, events, manuals, st] = await Promise.all([
				supabase.from('households').select('*').eq('id', h).single(),
				supabase.from('household_members').select('*').eq('household_id', h),
				supabase.from('household_invites').select('*').eq('household_id', h),
				supabase.from('categories').select('*').eq('household_id', h).order('sort_order'),
				supabase.from('items').select('*').eq('household_id', h),
				this.fetchAllEvents(h),
				supabase.from('manuals').select('*').eq('household_id', h),
				supabase.from('app_state').select('public_last_fetch, public_last_status, public_latest_period').eq('id', 1).maybeSingle()
			]);
			for (const r of [hh, mem, inv, cats, items, manuals]) if (r.error) throw r.error;
			if (this.pending > 0 || this.householdId !== h) {
				this.reloadAfterPending = true;
				return;
			}
			this.household = hh.data as Household;
			this.members = mem.data as Member[];
			this.invites = (inv.data ?? []) as Invite[];
			this.categories = cats.data as Category[];
			this.items = items.data as Item[];
			this.events = events;
			this.manuals = manuals.data as Manual[];
			this.loaded = true;
			this.lastLoaded = Date.now();
			this.writeCache();
			await this.loadPublic((st.data as AppStatus) ?? null);
		} catch (e) {
			this.toast(`読み込みに失敗しました：${friendly(e as Error)}`, true);
		}
	}

	// 全国データは大きいので、新しく取得されたときだけ読み直す
	async loadPublic(status: AppStatus | null) {
		this.status = status;
		const cached = readJson<{ fetchedAt: string | null; series: PublicSeries[] }>(PUBLIC_CACHE);
		if (cached?.series?.length && cached.fetchedAt === (status?.public_last_fetch ?? null)) {
			if (this.publicSeries !== cached.series && !this.publicSeries.length) this.publicSeries = cached.series;
			return;
		}
		const { data, error } = await supabase.from('public_series').select('*').order('sort_order');
		if (error) return;
		this.publicSeries = data as PublicSeries[];
		writeJson(PUBLIC_CACHE, { fetchedAt: status?.public_last_fetch ?? null, series: data });
	}

	// 家族が操作したら、すぐ画面に反映する
	private subscribe(householdId: string) {
		this.channel?.unsubscribe();
		const filter = `household_id=eq.${householdId}`;
		const reload = () => this.scheduleReload();
		this.channel = supabase
			.channel(`household-${householdId}`)
			.on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter }, reload)
			.on('postgres_changes', { event: '*', schema: 'public', table: 'stock_events', filter }, reload)
			.on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter }, reload)
			.on('postgres_changes', { event: '*', schema: 'public', table: 'manuals', filter }, reload)
			.subscribe();
	}

	private scheduleReload() {
		clearTimeout(this.reloadTimer);
		this.reloadTimer = setTimeout(() => void this.loadHousehold(), 800);
	}

	// ----- 保存（1件ずつ順番に送る） -----
	private async run<T>(fn: () => Promise<T>): Promise<T> {
		this.pending++;
		const task = this.queue.then(fn);
		this.queue = task.catch(() => undefined);
		try {
			return await task;
		} catch (e) {
			this.toast(errorMessage(e), true);
			throw e;
		} finally {
			this.pending--;
			if (this.pending === 0 && this.reloadAfterPending) {
				this.reloadAfterPending = false;
				this.scheduleReload();
			}
		}
	}

	private async rpc(name: string, args: Record<string, unknown>): Promise<MutationResult> {
		const { data, error } = await supabase.rpc(name, args);
		if (error) throw new Error(friendly(error));
		return (data ?? {}) as MutationResult;
	}

	apply(res: MutationResult) {
		if (res.item) this.items = upsertById(this.items, [res.item]);
		if (res.deleted_id) this.items = this.items.filter((i) => i.id !== res.deleted_id);
		if (res.events?.length) this.events = upsertById(this.events, res.events);
		this.writeCache();
	}

	// ----- 資材 -----
	saveItem(p: Partial<Item>, expected: string | null, changeMemo: string) {
		return this.run(async () => {
			const res = await this.rpc('save_item', {
				p_household: this.householdId,
				p,
				p_expected: expected,
				p_change_memo: changeMemo
			});
			if (res.conflict) {
				if (res.item) this.items = upsertById(this.items, [res.item]);
			} else this.apply(res);
			return res;
		});
	}

	deleteItem(id: string) {
		return this.run(async () => this.apply(await this.rpc('delete_item', { p_item: id })));
	}

	// ＋／−ボタン：先に画面に反映し、保存は裏で行う
	async quickAdjust(id: string, delta: number) {
		const item = this.findItem(id);
		if (!item) return;
		const before = Number(item.stock) || 0;
		const after = Math.max(0, before + delta);
		const d = after - before;
		if (!d) return;
		const setStock = (fn: (s: number) => number) =>
			(this.items = this.items.map((i) => (i.id === id ? { ...i, stock: fn(Number(i.stock) || 0) } : i)));
		setStock(() => after);
		this.pendingDelta.set(id, (this.pendingDelta.get(id) ?? 0) + d);
		try {
			const res = await this.run(() => this.rpc('move_stock', { p_item: id, p_kind: '調整', p_qty: d, p_date: null, p_unit_price: null, p_supplier: null, p_memo: null }));
			const rest = (this.pendingDelta.get(id) ?? 0) - d;
			this.pendingDelta.set(id, rest);
			// まだ保存待ちの増減があれば、それを足して表示する
			if (res.item) res.item = { ...res.item, stock: Number(res.item.stock) + rest };
			this.apply(res);
		} catch {
			this.pendingDelta.set(id, (this.pendingDelta.get(id) ?? 0) - d);
			setStock((s) => Math.max(0, s - d));
		}
	}

	moveStock(id: string, kind: '入庫' | '出庫', p: { qty: number; date?: string; unitPrice?: number | null; supplier?: string; memo?: string }) {
		return this.run(async () =>
			this.apply(
				await this.rpc('move_stock', {
					p_item: id,
					p_kind: kind,
					p_qty: p.qty,
					p_date: p.date || null,
					p_unit_price: p.unitPrice ?? null,
					p_supplier: p.supplier ?? null,
					p_memo: p.memo ?? ''
				})
			)
		);
	}

	addPastPurchase(id: string, p: { date: string; precision: 'day' | 'year'; qty: number | null; unitPrice: number; supplier: string; memo: string }) {
		return this.run(async () =>
			this.apply(
				await this.rpc('add_past_purchase', {
					p_item: id,
					p_date: p.precision === 'year' ? `${p.date}-01-01` : p.date,
					p_precision: p.precision,
					p_qty: p.qty,
					p_unit_price: p.unitPrice,
					p_supplier: p.supplier,
					p_memo: p.memo
				})
			)
		);
	}

	cancelEvent(id: string) {
		return this.run(async () => this.apply(await this.rpc('cancel_event', { p_event: id })));
	}

	// ----- カテゴリ -----
	private async reloadCategories() {
		const { data, error } = await supabase.from('categories').select('*').eq('household_id', this.householdId!).order('sort_order');
		if (error) throw new Error(friendly(error));
		this.categories = data as Category[];
		this.writeCache();
	}

	// カテゴリを追加して、追加したカテゴリを返す
	addCategory(name: string) {
		return this.run(async () => {
			const max = Math.max(0, ...this.categories.map((c) => c.sort_order));
			const { error } = await supabase
				.from('categories')
				.insert({ household_id: this.householdId, name: name.trim(), sort_order: max + 1, public_ref: 'idx:農業生産資材総合' });
			// 同じ名前を家族が先に追加していたときは、エラーにせずそちらを使う
			if (error && error.code !== '23505') throw new Error(friendly(error));
			await this.reloadCategories();
			const added = this.categories.find((c) => c.name === name.trim());
			if (!added) throw new Error('カテゴリを追加できませんでした。');
			return added;
		});
	}

	renameCategory(id: string, name: string) {
		return this.run(async () => {
			const { error } = await supabase.from('categories').update({ name: name.trim() }).eq('id', id);
			if (error) throw new Error(friendly(error));
			await this.reloadCategories();
		});
	}

	moveCategory(id: string, dir: -1 | 1) {
		return this.run(async () => {
			const list = [...this.categories];
			const i = list.findIndex((c) => c.id === id);
			const j = i + dir;
			if (i < 0 || j < 0 || j >= list.length) return;
			[list[i], list[j]] = [list[j], list[i]];
			// 並び順を振り直して保存する
			const changed = list.map((c, n) => ({ c, order: n + 1 })).filter((x) => x.c.sort_order !== x.order);
			for (const x of changed) {
				const { error } = await supabase.from('categories').update({ sort_order: x.order }).eq('id', x.c.id);
				if (error) throw new Error(friendly(error));
			}
			await this.reloadCategories();
		});
	}

	deleteCategory(id: string) {
		return this.run(async () => {
			const { error } = await supabase.from('categories').delete().eq('id', id);
			if (error) throw new Error(friendly(error));
			await this.reloadCategories();
		});
	}

	setCategoryPublic(id: string, ref: string) {
		return this.run(async () => {
			const { error } = await supabase.from('categories').update({ public_ref: ref }).eq('id', id);
			if (error) throw new Error(friendly(error));
			await this.reloadCategories();
		});
	}

	// ----- 農園の設定・家族 -----
	saveHousehold(p: Partial<Household>) {
		return this.run(async () => {
			const { data, error } = await supabase.from('households').update(p).eq('id', this.householdId!).select().single();
			if (error) throw new Error(friendly(error));
			this.household = data as Household;
			this.writeCache();
		});
	}

	setDisplayName(name: string) {
		return this.run(async () => {
			const { error } = await supabase.rpc('set_display_name', { p_household: this.householdId, p_name: name });
			if (error) throw new Error(friendly(error));
			this.members = this.members.map((m) => (m.user_id === this.myId ? { ...m, display_name: name.trim().slice(0, 20) } : m));
			this.writeCache();
		});
	}

	invite(email: string) {
		return this.run(async () => {
			const e = email.trim().toLowerCase();
			const { error } = await supabase.from('household_invites').insert({ household_id: this.householdId, email: e });
			if (error) throw new Error(friendly(error));
			const { data } = await supabase.from('household_invites').select('*').eq('household_id', this.householdId!);
			this.invites = (data ?? []) as Invite[];
		});
	}

	cancelInvite(email: string) {
		return this.run(async () => {
			const { error } = await supabase.from('household_invites').delete().eq('household_id', this.householdId!).eq('email', email);
			if (error) throw new Error(friendly(error));
			this.invites = this.invites.filter((i) => i.email !== email);
		});
	}

	removeMember(userId: string) {
		return this.run(async () => {
			const { error } = await supabase.from('household_members').delete().eq('household_id', this.householdId!).eq('user_id', userId);
			if (error) throw new Error(friendly(error));
			this.members = this.members.filter((m) => m.user_id !== userId);
		});
	}

	// 全国データを今すぐ取得する（サーバーで農林水産省のExcelを読む）
	async refreshPublic() {
		return this.run(async () => {
			const res = await fetch('/api/public-data/refresh', {
				method: 'POST',
				headers: { Authorization: `Bearer ${this.session?.access_token ?? ''}` }
			});
			const body = (await res.json().catch(() => ({ ok: false, message: `取得に失敗しました（${res.status}）` }))) as { ok: boolean; message: string };
			const { data } = await supabase.from('app_state').select('public_last_fetch, public_last_status, public_latest_period').eq('id', 1).maybeSingle();
			await this.loadPublic((data as AppStatus) ?? null);
			return body;
		});
	}

	// ----- 取扱説明書 -----
	uploadManual(itemId: string, file: { blob: Blob; name: string; type: string }, title: string) {
		return this.run(async () => {
			const item = this.findItem(itemId);
			if (!item) throw new Error('この資材は、ほかの人がすでに削除しています。');
			const ext = (file.name.match(/\.[A-Za-z0-9]+$/)?.[0] ?? '').toLowerCase();
			const path = `${this.householdId}/${crypto.randomUUID()}${ext}`;
			const up = await supabase.storage.from(MANUAL_BUCKET).upload(path, file.blob, { contentType: file.type, upsert: false });
			if (up.error) throw new Error(`ファイルを保存できませんでした：${up.error.message}`);
			const { data, error } = await supabase
				.from('manuals')
				.insert({
					household_id: this.householdId,
					item_id: itemId,
					item_name: item.name,
					title: (title || file.name.replace(/\.[^.]+$/, '')).slice(0, 100),
					storage_path: path,
					file_name: file.name,
					mime_type: file.type,
					size: file.blob.size,
					uploaded_by: this.myId
				})
				.select()
				.single();
			if (error) {
				// 記録できなかったら、ファイルも消しておく
				await supabase.storage.from(MANUAL_BUCKET).remove([path]);
				throw new Error(friendly(error));
			}
			this.manuals = upsertById(this.manuals, [data as Manual]);
			this.writeCache();
		});
	}

	renameManual(id: string, title: string) {
		return this.run(async () => {
			const { data, error } = await supabase.from('manuals').update({ title: title.trim().slice(0, 100) }).eq('id', id).select().single();
			if (error) throw new Error(friendly(error));
			this.manuals = upsertById(this.manuals, [data as Manual]);
			this.writeCache();
		});
	}

	deleteManual(id: string) {
		return this.run(async () => {
			const m = this.manuals.find((x) => x.id === id);
			if (!m) return;
			const { error } = await supabase.from('manuals').delete().eq('id', id);
			if (error) throw new Error(friendly(error));
			await supabase.storage.from(MANUAL_BUCKET).remove([m.storage_path]);
			this.manuals = this.manuals.filter((x) => x.id !== id);
			this.writeCache();
		});
	}

	// 説明書を見るための一時的なURL（1時間有効）
	private signedCache = new Map<string, { url: string; until: number }>();
	async signedUrl(path: string): Promise<string> {
		const hit = this.signedCache.get(path);
		if (hit && hit.until > Date.now()) return hit.url;
		const { data, error } = await supabase.storage.from(MANUAL_BUCKET).createSignedUrl(path, 3600);
		if (error) throw new Error(friendly(error));
		this.signedCache.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60 * 1000 });
		return data.signedUrl;
	}
}

export const app = new AppState();
