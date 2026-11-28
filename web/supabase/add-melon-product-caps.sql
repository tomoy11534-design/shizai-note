-- 贈答メロン帳：受付の上限を品物ごとに決められるようにする（例：ラブコール50・アンデス50）
-- add-melon-orders.sql を実行したあとに、SQL Editor から1回実行する（何度実行してもエラーにならない）
-- product_caps は {"品物の名前": ケース数} の形。空なら、今まで通り capacity（全部あわせた上限）を使う
alter table public.melon_seasons
	add column if not exists product_caps jsonb not null default '{}'::jsonb;
