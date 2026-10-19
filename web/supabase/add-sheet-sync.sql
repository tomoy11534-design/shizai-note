-- Googleスプレッドシートとの連携を追加する
-- すでに schema.sql を実行したデータベースで、SQL Editor から1回実行する
-- （何度実行してもエラーにならない）

-- =====================================================================
-- Googleスプレッドシートとの連携
-- スプレッドシートの Apps Script が、農園ごとの合言葉でアプリに明細を送り、在庫一覧を受け取る
-- =====================================================================
create table if not exists public.sheet_links (
	household_id uuid primary key references public.households (id) on delete cascade,
	-- 合言葉そのものは保存せず、SHA-256 のハッシュだけを持つ
	token_hash text not null,
	created_at timestamptz not null default now(),
	last_import_at timestamptz,
	last_import_status text not null default '',
	last_export_at timestamptz
);
alter table public.sheet_links enable row level security;
drop policy if exists "家族は連携の状態を見られる" on public.sheet_links;
create policy "家族は連携の状態を見られる" on public.sheet_links
	for select to authenticated using (public.is_member(household_id));

-- 取り込み済みの明細の行（「処理日#連番」）。同じ行を二度取り込まないために使う。サーバーだけが読み書きする
create table if not exists public.sheet_imported_rows (
	household_id uuid not null references public.households (id) on delete cascade,
	row_key text not null,
	event_id uuid references public.stock_events (id) on delete set null,
	created_at timestamptz not null default now(),
	primary key (household_id, row_key)
);
alter table public.sheet_imported_rows enable row level security;

-- 合言葉を発行する（所有者だけ）。作り直すと、前の合言葉は使えなくなる
create or replace function public.issue_sheet_token(p_household uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
	token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
	if not public.is_owner(p_household) then raise exception '合言葉を発行できるのは、農園の所有者だけです。'; end if;
	insert into public.sheet_links (household_id, token_hash)
	values (p_household, encode(sha256(convert_to(token, 'UTF8')), 'hex'))
	on conflict (household_id) do update set token_hash = excluded.token_hash, created_at = now();
	return token;
end;
$$;

-- 連携をやめる（所有者だけ）
create or replace function public.remove_sheet_link(p_household uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
	if not public.is_owner(p_household) then raise exception '連携をやめられるのは、農園の所有者だけです。'; end if;
	delete from public.sheet_links where household_id = p_household;
end;
$$;

-- 関数を使えるのはログインした人だけ
revoke execute on function public.issue_sheet_token(uuid) from public, anon;
grant execute on function public.issue_sheet_token(uuid) to authenticated;
revoke execute on function public.remove_sheet_link(uuid) from public, anon;
grant execute on function public.remove_sheet_link(uuid) to authenticated;
