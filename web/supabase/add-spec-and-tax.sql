-- 「規格」と、購入の「値引金額・消費税・税抜金額」を追加する
-- すでに schema.sql を実行したデータベースで、SQL Editor から1回実行する
-- （何度実行してもエラーにならない）

alter table public.items
	add column if not exists spec text not null default '' check (char_length(spec) <= 100);
alter table public.stock_events
	add column if not exists discount numeric,
	add column if not exists tax numeric,
	add column if not exists amount_ex_tax numeric;

-- 資材を登録・更新する。p_expected（編集を始めたときの更新日時）と違えば、上書きせずに最新の内容を返す
create or replace function public.save_item(p_household uuid, p jsonb, p_expected timestamptz, p_change_memo text)
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
		insert into public.items (household_id, name, spec, category_id, unit, stock, price, reorder_level, expiry,
			supplier, purpose, memo, features, how_to_use, cautions, crops, public_ref, updated_by)
		values (p_household, trim(p ->> 'name'), trim(coalesce(p ->> 'spec', '')), (p ->> 'category_id')::uuid, coalesce(p ->> 'unit', ''),
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
		spec = trim(coalesce(p ->> 'spec', cur.spec)),
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

-- 引数が増えるので、古い形の関数を消してから作り直す
drop function if exists public.move_stock(uuid, text, numeric, date, numeric, text, text);
drop function if exists public.move_stock(uuid, text, numeric, date, numeric, text, text, numeric, numeric);
create function public.move_stock(
	p_item uuid, p_kind text, p_qty numeric, p_date date, p_unit_price numeric, p_supplier text, p_memo text,
	p_discount numeric default null, p_tax numeric default null
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
			stock_after, unit_price, amount, discount, tax, supplier, memo)
		values (it.household_id, it.id, it.name, coalesce(cat_name, ''), '入庫', d, delta, it.stock, v_price,
			round(v_price * delta) - coalesce(nullif(p_discount, 0), 0), nullif(p_discount, 0), p_tax, v_sup, coalesce(p_memo, ''))
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

drop function if exists public.add_past_purchase(uuid, date, text, numeric, numeric, text, text);
drop function if exists public.add_past_purchase(uuid, date, text, numeric, numeric, text, text, numeric, numeric);
-- 過去の購入を記録する（今の在庫は変えない）。p_precision が 'year' なら年だけ分かっている
create function public.add_past_purchase(
	p_item uuid, p_date date, p_precision text, p_qty numeric, p_unit_price numeric, p_supplier text, p_memo text,
	p_discount numeric default null, p_tax numeric default null
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
		qty, stock_after, unit_price, amount, discount, tax, supplier, memo)
	values (cur.household_id, cur.id, cur.name, coalesce(cat_name, ''), '過去の購入', p_date,
		case when p_precision = 'year' then 'year' else 'day' end, q, cur.stock, p_unit_price,
		round(p_unit_price * q) - coalesce(nullif(p_discount, 0), 0), nullif(p_discount, 0), p_tax,
		coalesce(p_supplier, ''), coalesce(p_memo, ''))
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

-- 関数を使えるのはログインした人だけ
revoke execute on function public.move_stock(uuid, text, numeric, date, numeric, text, text, numeric, numeric) from public, anon;
grant execute on function public.move_stock(uuid, text, numeric, date, numeric, text, text, numeric, numeric) to authenticated;
revoke execute on function public.add_past_purchase(uuid, date, text, numeric, numeric, text, text, numeric, numeric) from public, anon;
grant execute on function public.add_past_purchase(uuid, date, text, numeric, numeric, text, text, numeric, numeric) to authenticated;
