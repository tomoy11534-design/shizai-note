-- 贈答メロン帳（贈答用メロンの申込・入金・発送と、直売の記録）を追加する
-- すでに schema.sql を実行したデータベースで、SQL Editor から1回実行する
-- （何度実行してもエラーにならない）

-- ===== 申込 =====
create table if not exists public.melon_orders (
	id uuid primary key default gen_random_uuid(),
	household_id uuid not null references public.households (id) on delete cascade,
	-- 何年の受付か（発送する年）
	season int not null check (season between 2000 and 2100),
	-- 注文した人
	customer_name text not null check (char_length(customer_name) between 1 and 100),
	customer_phone text not null default '' check (char_length(customer_phone) <= 30),
	customer_postal text not null default '' check (char_length(customer_postal) <= 10),
	customer_address text not null default '' check (char_length(customer_address) <= 200),
	-- お届け先（注文した人と同じなら to_same = true で、下は空）
	to_same boolean not null default true,
	to_name text not null default '' check (char_length(to_name) <= 100),
	to_phone text not null default '' check (char_length(to_phone) <= 30),
	to_postal text not null default '' check (char_length(to_postal) <= 10),
	to_address text not null default '' check (char_length(to_address) <= 200),
	-- 品物（ラブコール・食べ比べセットなど）と箱数・1箱の値段・発送の時期
	product text not null default '' check (char_length(product) <= 50),
	cases int not null default 1 check (cases between 1 and 999),
	unit_price int not null default 0 check (unit_price >= 0),
	ship_timing text not null default '' check (char_length(ship_timing) <= 30),
	-- 入金した日・発送した日・発送の連絡をした日（まだなら空）
	paid_on date,
	shipped_on date,
	notified_on date,
	memo text not null default '' check (char_length(memo) <= 500),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create index if not exists melon_orders_household_idx on public.melon_orders (household_id, season);

-- ===== 年ごとの受付の上限（ケース数） =====
create table if not exists public.melon_seasons (
	household_id uuid not null references public.households (id) on delete cascade,
	season int not null check (season between 2000 and 2100),
	capacity int not null default 50 check (capacity between 0 and 99999),
	primary key (household_id, season)
);

-- ===== 直売の記録（直売所などで売った玉数と金額） =====
create table if not exists public.melon_direct_sales (
	id uuid primary key default gen_random_uuid(),
	household_id uuid not null references public.households (id) on delete cascade,
	sold_on date not null,
	place text not null default '' check (char_length(place) <= 50),
	fruits int not null default 0 check (fruits between 0 and 99999),
	amount int not null default 0 check (amount >= 0),
	memo text not null default '' check (char_length(memo) <= 200),
	created_at timestamptz not null default now()
);
create index if not exists melon_direct_sales_household_idx on public.melon_direct_sales (household_id, sold_on);

-- ===== 見られる・書けるのは、その農園の家族だけ =====
alter table public.melon_orders enable row level security;
alter table public.melon_seasons enable row level security;
alter table public.melon_direct_sales enable row level security;

drop policy if exists "家族は申込を見られる" on public.melon_orders;
drop policy if exists "家族は申込を追加できる" on public.melon_orders;
drop policy if exists "家族は申込を変更できる" on public.melon_orders;
drop policy if exists "家族は申込を削除できる" on public.melon_orders;
create policy "家族は申込を見られる" on public.melon_orders
	for select to authenticated using (public.is_member(household_id));
create policy "家族は申込を追加できる" on public.melon_orders
	for insert to authenticated with check (public.is_member(household_id));
create policy "家族は申込を変更できる" on public.melon_orders
	for update to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "家族は申込を削除できる" on public.melon_orders
	for delete to authenticated using (public.is_member(household_id));

drop policy if exists "家族は受付の上限を見られる" on public.melon_seasons;
drop policy if exists "家族は受付の上限を決められる" on public.melon_seasons;
drop policy if exists "家族は受付の上限を変えられる" on public.melon_seasons;
create policy "家族は受付の上限を見られる" on public.melon_seasons
	for select to authenticated using (public.is_member(household_id));
create policy "家族は受付の上限を決められる" on public.melon_seasons
	for insert to authenticated with check (public.is_member(household_id));
create policy "家族は受付の上限を変えられる" on public.melon_seasons
	for update to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));

drop policy if exists "家族は直売の記録を見られる" on public.melon_direct_sales;
drop policy if exists "家族は直売の記録を追加できる" on public.melon_direct_sales;
drop policy if exists "家族は直売の記録を削除できる" on public.melon_direct_sales;
create policy "家族は直売の記録を見られる" on public.melon_direct_sales
	for select to authenticated using (public.is_member(household_id));
create policy "家族は直売の記録を追加できる" on public.melon_direct_sales
	for insert to authenticated with check (public.is_member(household_id));
create policy "家族は直売の記録を削除できる" on public.melon_direct_sales
	for delete to authenticated using (public.is_member(household_id));
