-- 資材に「品名コード」（JAの明細にあるコード）を追加する
-- すでに schema.sql を実行したデータベースで、SQL Editor から1回実行する
-- （何度実行してもエラーにならない）

alter table public.items
	add column if not exists product_code text not null default '' check (char_length(product_code) <= 30);

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
		insert into public.items (household_id, name, spec, product_code, category_id, unit, stock, price, reorder_level, expiry,
			supplier, purpose, memo, features, how_to_use, cautions, crops, public_ref, updated_by)
		values (p_household, trim(p ->> 'name'), trim(coalesce(p ->> 'spec', '')), trim(coalesce(p ->> 'product_code', '')), (p ->> 'category_id')::uuid, coalesce(p ->> 'unit', ''),
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
		product_code = trim(coalesce(p ->> 'product_code', cur.product_code)),
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
