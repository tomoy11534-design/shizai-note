-- カテゴリをまとめる機能を追加する
-- すでに schema.sql を実行したデータベースで、SQL Editor から1回実行する
-- （何度実行してもエラーにならない）

-- カテゴリをまとめる：p_from の資材をすべて p_to に移して、p_from を削除する（表記揺れの整理用）
-- 過去の記録のカテゴリ名も p_to の名前にそろえ、集計が分かれないようにする
create or replace function public.merge_category(p_from uuid, p_to uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
	src public.categories;
	dst public.categories;
	it public.items;
	ev public.stock_events;
	its jsonb := '[]'::jsonb;
	evs jsonb := '[]'::jsonb;
begin
	if p_from = p_to then raise exception 'まとめ先には、別のカテゴリを選んでください。'; end if;
	select * into src from public.categories where id = p_from for update;
	select * into dst from public.categories where id = p_to;
	if src.id is null or dst.id is null or src.household_id <> dst.household_id then
		raise exception 'カテゴリが見つかりません。画面を読み込み直してください。';
	end if;
	if not public.is_member(src.household_id) then raise exception '権限がありません。'; end if;

	for it in
		update public.items set category_id = dst.id, updated_at = now(), updated_by = auth.uid()
		where category_id = src.id returning *
	loop
		insert into public.stock_events (household_id, item_id, item_name, category_name, type, qty, stock_after, memo)
		values (it.household_id, it.id, it.name, dst.name, '編集', 0, it.stock,
			'カテゴリ ' || src.name || '→' || dst.name || '（カテゴリをまとめる）')
		returning * into ev;
		its := its || to_jsonb(it);
		evs := evs || to_jsonb(ev);
	end loop;

	update public.stock_events set category_name = dst.name
	where household_id = src.household_id and category_name = src.name;
	delete from public.categories where id = src.id;

	return jsonb_build_object('items', its, 'events', evs);
end;
$$;

-- 関数を使えるのはログインした人だけ
revoke execute on function public.merge_category(uuid, uuid) from public, anon;
grant execute on function public.merge_category(uuid, uuid) to authenticated;
