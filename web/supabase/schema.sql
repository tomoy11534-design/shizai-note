-- =====================================================================
-- 資材ノート データベース定義
-- Supabase の「SQL Editor」にこのファイルの中身を貼り付けて、1回だけ実行する
-- =====================================================================

-- ===== 農園（家族で共有する単位） =====
create table public.households (
	id uuid primary key default gen_random_uuid(),
	name text not null check (char_length(name) between 1 and 50),
	owner_id uuid not null references auth.users (id) on delete cascade,
	alert_days int not null default 30 check (alert_days between 1 and 365),
	price_alert_pct numeric not null default 10 check (price_alert_pct >= 0),
	gap_alert_pts numeric not null default 5 check (gap_alert_pts >= 0),
	notify_enabled boolean not null default false,
	public_notify boolean not null default true,
	created_at timestamptz not null default now()
);

create table public.household_members (
	household_id uuid not null references public.households (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	email text not null,
	display_name text not null default '' check (char_length(display_name) <= 20),
	role text not null default 'member' check (role in ('owner', 'member')),
	joined_at timestamptz not null default now(),
	primary key (household_id, user_id)
);

-- 家族の招待（メールアドレスで招待し、その人がログインすると参加する）
create table public.household_invites (
	household_id uuid not null references public.households (id) on delete cascade,
	email text not null check (email = lower(email)),
	invited_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	primary key (household_id, email)
);

-- ===== カテゴリ・資材 =====
create table public.categories (
	id uuid primary key default gen_random_uuid(),
	household_id uuid not null references public.households (id) on delete cascade,
	name text not null check (char_length(name) between 1 and 30),
	sort_order int not null default 0,
	public_ref text not null default '',
	unique (household_id, name)
);

create table public.items (
	id uuid primary key default gen_random_uuid(),
	household_id uuid not null references public.households (id) on delete cascade,
	name text not null check (char_length(name) between 1 and 100),
	-- 使われているカテゴリは削除できない（restrict）
	category_id uuid not null references public.categories (id) on delete restrict,
	unit text not null default '' check (char_length(unit) <= 20),
	stock numeric not null default 0 check (stock >= 0),
	price numeric not null default 0 check (price >= 0),
	reorder_level numeric check (reorder_level >= 0),
	expiry date,
	supplier text not null default '' check (char_length(supplier) <= 100),
	purpose text not null default '' check (char_length(purpose) <= 1000),
	memo text not null default '' check (char_length(memo) <= 1000),
	-- 資材の辞書（特徴・使い方・注意点・対象の作物）
	features text not null default '' check (char_length(features) <= 1000),
	how_to_use text not null default '' check (char_length(how_to_use) <= 1000),
	cautions text not null default '' check (char_length(cautions) <= 1000),
	crops text not null default '' check (char_length(crops) <= 200),
	public_ref text not null default '',
	last_purchase_date date,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	updated_by uuid references auth.users (id) on delete set null
);
create index items_household_idx on public.items (household_id);

-- ===== 入出庫・価格の記録（履歴） =====
create table public.stock_events (
	id uuid primary key default gen_random_uuid(),
	household_id uuid not null references public.households (id) on delete cascade,
	-- 資材を削除しても記録は残す（資材名は記録時の名前を保存）
	item_id uuid references public.items (id) on delete set null,
	item_name text not null,
	category_name text not null default '',
	type text not null check (type in ('登録', '編集', '削除', '入庫', '出庫', '調整', '過去の購入', '取消')),
	-- 購入日。年だけ分かる場合は1月1日にして date_precision を 'year' にする
	event_date date not null default (now() at time zone 'Asia/Tokyo')::date,
	date_precision text not null default 'day' check (date_precision in ('day', 'year')),
	qty numeric,
	stock_after numeric,
	unit_price numeric check (unit_price >= 0),
	amount numeric,
	supplier text not null default '',
	memo text not null default '',
	cancelled boolean not null default false,
	ref_id uuid,
	user_id uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now()
);
create index stock_events_household_idx on public.stock_events (household_id, created_at);
create index stock_events_item_idx on public.stock_events (item_id);

-- ===== 取扱説明書 =====
create table public.manuals (
	id uuid primary key default gen_random_uuid(),
	household_id uuid not null references public.households (id) on delete cascade,
	item_id uuid references public.items (id) on delete set null,
	item_name text not null,
	title text not null check (char_length(title) between 1 and 100),
	storage_path text not null unique,
	file_name text not null default '',
	mime_type text not null,
	size bigint not null default 0,
	uploaded_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now()
);
create index manuals_household_idx on public.manuals (household_id);

-- ===== 全国の物価データ（農業物価統計調査）：全員共通 =====
create table public.public_series (
	key text primary key,
	kind text not null check (kind in ('idx', 'item')),
	grp text not null default '',
	name text not null,
	spec text not null default '',
	unit text not null default '',
	sort_order int not null default 0,
	data jsonb not null default '{}',
	prov jsonb not null default '[]',
	updated_at timestamptz not null default now()
);

create table public.app_state (
	id int primary key default 1 check (id = 1),
	public_last_fetch timestamptz,
	public_last_status text not null default '',
	public_latest_period text not null default '',
	public_source_url text not null default ''
);
insert into public.app_state (id) values (1);

-- =====================================================================
-- 権限の確認に使う関数
-- =====================================================================
create function public.is_member(h uuid) returns boolean
language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from public.household_members m where m.household_id = h and m.user_id = auth.uid()
	);
$$;

create function public.is_owner(h uuid) returns boolean
language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from public.household_members m
		where m.household_id = h and m.user_id = auth.uid() and m.role = 'owner'
	);
$$;

-- =====================================================================
-- 行ごとのアクセス制限（RLS）：同じ農園の家族だけが見られる
-- =====================================================================
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.stock_events enable row level security;
alter table public.manuals enable row level security;
alter table public.public_series enable row level security;
alter table public.app_state enable row level security;

create policy "家族は農園を見られる" on public.households
	for select to authenticated using (public.is_member(id));
create policy "家族は注意表示の設定を変えられる" on public.households
	for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

create policy "家族は家族一覧を見られる" on public.household_members
	for select to authenticated using (public.is_member(household_id));
create policy "所有者は家族を外せる" on public.household_members
	for delete to authenticated using (public.is_owner(household_id) and role <> 'owner');

create policy "所有者は招待を見られる" on public.household_invites
	for select to authenticated using (public.is_owner(household_id));
create policy "所有者は招待できる" on public.household_invites
	for insert to authenticated with check (public.is_owner(household_id));
create policy "所有者は招待を取り消せる" on public.household_invites
	for delete to authenticated using (public.is_owner(household_id));

create policy "家族はカテゴリを見られる" on public.categories
	for select to authenticated using (public.is_member(household_id));
create policy "家族はカテゴリを追加できる" on public.categories
	for insert to authenticated with check (public.is_member(household_id));
create policy "家族はカテゴリを変更できる" on public.categories
	for update to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "家族はカテゴリを削除できる" on public.categories
	for delete to authenticated using (public.is_member(household_id));

-- 資材と記録の変更は、下の関数（RPC）を通してだけ行う
create policy "家族は資材を見られる" on public.items
	for select to authenticated using (public.is_member(household_id));
create policy "家族は記録を見られる" on public.stock_events
	for select to authenticated using (public.is_member(household_id));

create policy "家族は説明書を見られる" on public.manuals
	for select to authenticated using (public.is_member(household_id));
create policy "家族は説明書を登録できる" on public.manuals
	for insert to authenticated with check (public.is_member(household_id) and uploaded_by = auth.uid());
create policy "家族は説明書の表題を変えられる" on public.manuals
	for update to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "家族は説明書を削除できる" on public.manuals
	for delete to authenticated using (public.is_member(household_id));

create policy "ログインした人は全国データを見られる" on public.public_series
	for select to authenticated using (true);
create policy "ログインした人は取得状況を見られる" on public.app_state
	for select to authenticated using (true);

-- 所有者は変えられない。メール通知の設定を変えられるのは所有者だけ
create function public.households_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
	if new.owner_id <> old.owner_id or new.id <> old.id then
		raise exception '農園の所有者は変更できません。';
	end if;
	if (new.notify_enabled is distinct from old.notify_enabled or new.public_notify is distinct from old.public_notify)
		and not public.is_owner(old.id) then
		raise exception 'メール通知を変更できるのは、農園の所有者だけです。';
	end if;
	return new;
end;
$$;
create trigger households_guard before update on public.households
	for each row execute function public.households_guard();

-- 説明書で書き換えられるのは表題だけ
revoke update on public.manuals from authenticated;
grant update (title) on public.manuals to authenticated;

-- =====================================================================
-- 農園の作成・招待の受け入れ・表示名
-- =====================================================================
create function public.create_household(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
	h uuid;
	cats text[][] := array[
		['肥料', 'idx:肥料'], ['農薬', 'idx:農業薬剤'], ['種苗', 'idx:種苗及び苗木'],
		['包装資材', 'idx:諸材料'], ['被覆資材', 'idx:諸材料'], ['燃料', 'idx:光熱動力'],
		['機械部品', 'idx:農機具'], ['その他', 'idx:農業生産資材総合']
	];
begin
	if auth.uid() is null then raise exception 'ログインしてください。'; end if;
	insert into public.households (name, owner_id) values (trim(p_name), auth.uid()) returning id into h;
	insert into public.household_members (household_id, user_id, email, role)
		values (h, auth.uid(), lower(coalesce(auth.jwt() ->> 'email', '')), 'owner');
	for i in 1 .. array_length(cats, 1) loop
		insert into public.categories (household_id, name, sort_order, public_ref) values (h, cats[i][1], i, cats[i][2]);
	end loop;
	return h;
end;
$$;

-- ログインした人あての招待があれば、その農園に参加する
create function public.accept_invites() returns int
language plpgsql security definer set search_path = '' as $$
declare
	my_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
	n int := 0;
	r record;
begin
	if auth.uid() is null or my_email = '' then return 0; end if;
	for r in select * from public.household_invites where email = my_email loop
		insert into public.household_members (household_id, user_id, email, role)
			values (r.household_id, auth.uid(), my_email, 'member')
			on conflict do nothing;
		n := n + 1;
	end loop;
	delete from public.household_invites where email = my_email;
	return n;
end;
$$;

create function public.set_display_name(p_household uuid, p_name text) returns void
language sql security definer set search_path = '' as $$
	update public.household_members set display_name = left(trim(p_name), 20)
	where household_id = p_household and user_id = auth.uid();
$$;

-- =====================================================================
-- 資材の登録・編集・削除
-- =====================================================================

-- 資材を登録・更新する。p_expected（編集を始めたときの更新日時）と違えば、上書きせずに最新の内容を返す
create function public.save_item(p_household uuid, p jsonb, p_expected timestamptz, p_change_memo text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
	it public.items;
	cur public.items;
	cat_name text;
	ev public.stock_events;
begin
	if not public.is_member(p_household) then raise exception '権限がありません。'; end if;
	select name into cat_name from public.categories
		where id = (p ->> 'category_id')::uuid and household_id = p_household;
	if cat_name is null then raise exception 'カテゴリを選んでください。'; end if;

	if p ->> 'id' is null or p ->> 'id' = '' then
		insert into public.items (household_id, name, category_id, unit, stock, price, reorder_level, expiry,
			supplier, purpose, memo, features, how_to_use, cautions, crops, public_ref, updated_by)
		values (p_household, trim(p ->> 'name'), (p ->> 'category_id')::uuid, coalesce(p ->> 'unit', ''),
			coalesce((p ->> 'stock')::numeric, 0), coalesce((p ->> 'price')::numeric, 0),
			nullif(p ->> 'reorder_level', '')::numeric, nullif(p ->> 'expiry', '')::date,
			coalesce(p ->> 'supplier', ''), coalesce(p ->> 'purpose', ''), coalesce(p ->> 'memo', ''),
			coalesce(p ->> 'features', ''), coalesce(p ->> 'how_to_use', ''), coalesce(p ->> 'cautions', ''),
			coalesce(p ->> 'crops', ''), coalesce(p ->> 'public_ref', ''), auth.uid())
		returning * into it;
		insert into public.stock_events (household_id, item_id, item_name, category_name, type, qty, stock_after, unit_price, supplier)
		values (p_household, it.id, it.name, cat_name, '登録', it.stock, it.stock, it.price, it.supplier)
		returning * into ev;
		return jsonb_build_object('item', to_jsonb(it), 'events', jsonb_build_array(to_jsonb(ev)));
	end if;

	select * into cur from public.items where id = (p ->> 'id')::uuid and household_id = p_household for update;
	if not found then raise exception 'この資材は、ほかの人がすでに削除しています。'; end if;
	if p_expected is not null and cur.updated_at <> p_expected then
		return jsonb_build_object('conflict', true, 'item', to_jsonb(cur));
	end if;

	update public.items set
		name = trim(p ->> 'name'),
		category_id = (p ->> 'category_id')::uuid,
		unit = coalesce(p ->> 'unit', ''),
		stock = coalesce((p ->> 'stock')::numeric, 0),
		price = coalesce((p ->> 'price')::numeric, 0),
		reorder_level = nullif(p ->> 'reorder_level', '')::numeric,
		expiry = nullif(p ->> 'expiry', '')::date,
		supplier = coalesce(p ->> 'supplier', ''),
		purpose = coalesce(p ->> 'purpose', ''),
		memo = coalesce(p ->> 'memo', ''),
		-- 辞書の欄がない古い画面から保存されたときは、今の内容を残す
		features = coalesce(p ->> 'features', cur.features),
		how_to_use = coalesce(p ->> 'how_to_use', cur.how_to_use),
		cautions = coalesce(p ->> 'cautions', cur.cautions),
		crops = coalesce(p ->> 'crops', cur.crops),
		public_ref = coalesce(p ->> 'public_ref', ''),
		updated_at = now(),
		updated_by = auth.uid()
	where id = cur.id
	returning * into it;

	insert into public.stock_events (household_id, item_id, item_name, category_name, type, qty, stock_after, memo)
	values (p_household, it.id, it.name, cat_name, '編集', it.stock - cur.stock, it.stock, coalesce(p_change_memo, ''))
	returning * into ev;
	return jsonb_build_object('item', to_jsonb(it), 'events', jsonb_build_array(to_jsonb(ev)));
end;
$$;

create function public.delete_item(p_item uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
	cur public.items;
	cat_name text;
	ev public.stock_events;
begin
	select * into cur from public.items where id = p_item for update;
	if not found then return jsonb_build_object('deleted_id', p_item, 'events', '[]'::jsonb); end if;
	if not public.is_member(cur.household_id) then raise exception '権限がありません。'; end if;
	select name into cat_name from public.categories where id = cur.category_id;
	insert into public.stock_events (household_id, item_id, item_name, category_name, type, qty, stock_after, memo)
	values (cur.household_id, null, cur.name, coalesce(cat_name, ''), '削除', -cur.stock, 0, '資材を削除（価格の履歴は残す）')
	returning * into ev;
	delete from public.items where id = p_item;
	return jsonb_build_object('deleted_id', p_item, 'events', jsonb_build_array(to_jsonb(ev)));
end;
$$;

-- =====================================================================
-- 在庫の増減：「今の数に足す・引く」ので、同時に操作しても数がずれない
-- =====================================================================
create function public.move_stock(
	p_item uuid, p_kind text, p_qty numeric, p_date date, p_unit_price numeric, p_supplier text, p_memo text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
	cur public.items;
	it public.items;
	cat_name text;
	delta numeric;
	d date := coalesce(p_date, (now() at time zone 'Asia/Tokyo')::date);
	v_price numeric;
	v_sup text;
	ev public.stock_events;
begin
	select * into cur from public.items where id = p_item for update;
	if not found then raise exception 'この資材は、ほかの人がすでに削除しています。'; end if;
	if not public.is_member(cur.household_id) then raise exception '権限がありません。'; end if;
	select name into cat_name from public.categories where id = cur.category_id;

	if p_kind = '調整' then
		delta := greatest(coalesce(p_qty, 0), -cur.stock);
		if delta = 0 then return jsonb_build_object('item', to_jsonb(cur), 'events', '[]'::jsonb); end if;
	elsif p_kind in ('入庫', '出庫') then
		if coalesce(p_qty, 0) <= 0 then raise exception '数量を正しく入力してください。'; end if;
		if p_kind = '出庫' and p_qty > cur.stock then
			raise exception '在庫が足りません（いまの在庫：%）。', cur.stock || cur.unit;
		end if;
		delta := case when p_kind = '入庫' then p_qty else -p_qty end;
	else
		raise exception '操作の種類が正しくありません。';
	end if;

	if p_kind = '入庫' then
		v_price := coalesce(p_unit_price, cur.price);
		v_sup := coalesce(nullif(trim(p_supplier), ''), cur.supplier);
		-- いちばん新しい購入なら、資材の単価と購入先を更新する
		update public.items as i set
			stock = i.stock + delta,
			price = case when i.last_purchase_date is null or d >= i.last_purchase_date then v_price else i.price end,
			supplier = case when i.last_purchase_date is null or d >= i.last_purchase_date then v_sup else i.supplier end,
			last_purchase_date = greatest(coalesce(i.last_purchase_date, d), d),
			updated_at = now(), updated_by = auth.uid()
		where i.id = p_item returning * into it;
		insert into public.stock_events (household_id, item_id, item_name, category_name, type, event_date, qty,
			stock_after, unit_price, amount, supplier, memo)
		values (it.household_id, it.id, it.name, coalesce(cat_name, ''), '入庫', d, delta, it.stock, v_price,
			round(v_price * delta), v_sup, coalesce(p_memo, ''))
		returning * into ev;
	else
		update public.items set stock = stock + delta, updated_at = now(), updated_by = auth.uid()
		where id = p_item returning * into it;
		insert into public.stock_events (household_id, item_id, item_name, category_name, type, qty, stock_after, memo)
		values (it.household_id, it.id, it.name, coalesce(cat_name, ''), p_kind, delta, it.stock, coalesce(p_memo, ''))
		returning * into ev;
	end if;
	return jsonb_build_object('item', to_jsonb(it), 'events', jsonb_build_array(to_jsonb(ev)));
end;
$$;

-- 過去の購入を記録する（今の在庫は変えない）。p_precision が 'year' なら年だけ分かっている
create function public.add_past_purchase(
	p_item uuid, p_date date, p_precision text, p_qty numeric, p_unit_price numeric, p_supplier text, p_memo text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
	cur public.items;
	it public.items;
	cat_name text;
	q numeric := case when coalesce(p_qty, 0) > 0 then p_qty else 1 end;
	ev public.stock_events;
begin
	select * into cur from public.items where id = p_item for update;
	if not found then raise exception 'この資材は、ほかの人がすでに削除しています。'; end if;
	if not public.is_member(cur.household_id) then raise exception '権限がありません。'; end if;
	if p_date is null then raise exception '購入日（または年）を入力してください。'; end if;
	if p_unit_price is null or p_unit_price < 0 then raise exception '購入単価を入力してください。'; end if;
	select name into cat_name from public.categories where id = cur.category_id;

	insert into public.stock_events (household_id, item_id, item_name, category_name, type, event_date, date_precision,
		qty, stock_after, unit_price, amount, supplier, memo)
	values (cur.household_id, cur.id, cur.name, coalesce(cat_name, ''), '過去の購入', p_date,
		case when p_precision = 'year' then 'year' else 'day' end, q, cur.stock, p_unit_price,
		round(p_unit_price * q), coalesce(p_supplier, ''), coalesce(p_memo, ''))
	returning * into ev;

	-- 日付が分かっていて、いちばん新しい購入なら単価を更新する
	it := cur;
	if p_precision <> 'year' and (cur.last_purchase_date is null or p_date > cur.last_purchase_date) then
		update public.items set price = p_unit_price, last_purchase_date = p_date, updated_at = now(), updated_by = auth.uid()
		where id = p_item returning * into it;
	end if;
	return jsonb_build_object('item', to_jsonb(it), 'events', jsonb_build_array(to_jsonb(ev)));
end;
$$;

-- 記録を取り消す（消さずに「取消済み」にする）。入庫・出庫・調整は在庫も元に戻す
create function public.cancel_event(p_event uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
	target public.stock_events;
	cur public.items;
	it public.items;
	latest public.stock_events;
	ev public.stock_events;
begin
	select * into target from public.stock_events where id = p_event for update;
	if not found then raise exception '記録が見つかりません。'; end if;
	if not public.is_member(target.household_id) then raise exception '権限がありません。'; end if;
	if target.type not in ('入庫', '出庫', '調整', '過去の購入') then raise exception 'この記録は取り消せません。'; end if;
	if target.cancelled then raise exception 'この記録はすでに取り消されています。'; end if;

	update public.stock_events set cancelled = true where id = p_event returning * into target;

	select * into cur from public.items where id = target.item_id for update;
	if found then
		it := cur;
		if target.type <> '過去の購入' then
			update public.items set stock = greatest(0, stock - coalesce(target.qty, 0)), updated_at = now(), updated_by = auth.uid()
			where id = cur.id returning * into it;
		end if;
		-- 購入を取り消したら、残っている最新の購入から単価を計算し直す
		if target.type in ('入庫', '過去の購入') then
			select * into latest from public.stock_events
			where item_id = cur.id and type in ('入庫', '過去の購入') and not cancelled and date_precision = 'day'
			order by event_date desc, created_at desc limit 1;
			update public.items set
				last_purchase_date = latest.event_date,
				price = coalesce(latest.unit_price, items.price),
				updated_at = now(), updated_by = auth.uid()
			where id = cur.id returning * into it;
		end if;
	end if;

	insert into public.stock_events (household_id, item_id, item_name, category_name, type, qty, stock_after, ref_id, memo)
	values (target.household_id, target.item_id, target.item_name, target.category_name, '取消',
		case when target.type = '過去の購入' then null else -coalesce(target.qty, 0) end,
		it.stock, target.id, target.type || '（' || to_char(target.event_date, 'YYYY-MM-DD') || '）を取り消し')
	returning * into ev;

	return jsonb_build_object('item', case when it.id is null then null else to_jsonb(it) end,
		'events', jsonb_build_array(to_jsonb(target), to_jsonb(ev)));
end;
$$;

-- =====================================================================
-- 関数を使えるのはログインした人だけ
-- =====================================================================
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

-- =====================================================================
-- 家族の操作をすぐ画面に反映する（Realtime）
-- =====================================================================
alter publication supabase_realtime add table public.items, public.stock_events, public.categories, public.manuals;

-- =====================================================================
-- 取扱説明書のファイル置き場（Storage）
-- ファイルの場所は「農園ID/ファイル名」。同じ農園の家族だけが読み書きできる
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('manuals', 'manuals', false, 20971520, array['application/pdf', 'image/*']);

create policy "家族は説明書ファイルを見られる" on storage.objects
	for select to authenticated
	using (bucket_id = 'manuals' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "家族は説明書ファイルを登録できる" on storage.objects
	for insert to authenticated
	with check (bucket_id = 'manuals' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "家族は説明書ファイルを削除できる" on storage.objects
	for delete to authenticated
	using (bucket_id = 'manuals' and public.is_member(((storage.foldername(name))[1])::uuid));
