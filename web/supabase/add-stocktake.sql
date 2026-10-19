-- 棚卸しの機能を追加する
-- すでに schema.sql を実行したデータベースで、SQL Editor から1回実行する
-- （何度実行してもエラーにならない）

-- 記録の種類に「棚卸し」を足す
alter table public.stock_events drop constraint if exists stock_events_type_check;
alter table public.stock_events add constraint stock_events_type_check
	check (type in ('登録', '編集', '削除', '入庫', '出庫', '調整', '過去の購入', '取消', '棚卸し'));

-- 記録を取り消す（消さずに「取消済み」にする）。入庫・出庫・調整・棚卸しは在庫も元に戻す
create or replace function public.cancel_event(p_event uuid) returns jsonb
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
	if target.type not in ('入庫', '出庫', '調整', '過去の購入', '棚卸し') then raise exception 'この記録は取り消せません。'; end if;
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

-- 棚卸し：数えた数に合わせて、まとめて在庫を直す
-- p_counts は [{item_id, counted（数えた数）, expected（数えたときの帳簿の数）}]
-- 数えたあとに入庫・出庫があっても消えないよう、「数えた数 − 帳簿の数」の差だけを今の在庫に足す
create or replace function public.stocktake(p_household uuid, p_counts jsonb, p_memo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
	c jsonb;
	cur public.items;
	it public.items;
	cat_name text;
	counted numeric;
	expected numeric;
	delta numeric;
	ev public.stock_events;
	its jsonb := '[]'::jsonb;
	evs jsonb := '[]'::jsonb;
	n int := 0;
	note text := nullif(trim(coalesce(p_memo, '')), '');
begin
	if not public.is_member(p_household) then raise exception '権限がありません。'; end if;
	if jsonb_typeof(p_counts) is distinct from 'array' then raise exception '棚卸しの内容が正しくありません。'; end if;

	for c in select * from jsonb_array_elements(p_counts) loop
		counted := (c ->> 'counted')::numeric;
		if counted is null or counted < 0 then raise exception '数えた数を正しく入力してください。'; end if;
		select * into cur from public.items where id = (c ->> 'item_id')::uuid and household_id = p_household for update;
		-- 数えている間に削除された資材は飛ばす
		if not found then continue; end if;
		n := n + 1;
		expected := coalesce((c ->> 'expected')::numeric, cur.stock);
		delta := greatest(counted - expected, -cur.stock);
		if delta = 0 then continue; end if;

		update public.items set stock = stock + delta, updated_at = now(), updated_by = auth.uid()
		where id = cur.id returning * into it;
		select name into cat_name from public.categories where id = it.category_id;
		insert into public.stock_events (household_id, item_id, item_name, category_name, type, qty, stock_after, memo)
		values (it.household_id, it.id, it.name, coalesce(cat_name, ''), '棚卸し', delta, it.stock,
			'帳簿 ' || trim_scale(expected) || it.unit || ' → 実数 ' || trim_scale(counted) || it.unit
				|| coalesce('（' || note || '）', ''))
		returning * into ev;
		its := its || to_jsonb(it);
		evs := evs || to_jsonb(ev);
	end loop;

	return jsonb_build_object('items', its, 'events', evs, 'checked', n);
end;
$$;

-- 関数を使えるのはログインした人だけ
revoke execute on function public.stocktake(uuid, jsonb, text) from public, anon;
grant execute on function public.stocktake(uuid, jsonb, text) to authenticated;
