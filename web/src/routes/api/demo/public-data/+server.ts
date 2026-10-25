// デモ版で使う全国データ（農林水産省の公開統計なので、ログインしなくても返す）
// 読むだけ。CDNに1日置いて、データベースへの問い合わせを減らす
import { adminClient } from '#lib/server/supabase-admin.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const db = adminClient();
	const [series, state] = await Promise.all([
		db.from('public_series').select('*').order('sort_order'),
		db.from('app_state').select('public_last_fetch, public_last_status, public_latest_period').eq('id', 1).maybeSingle()
	]);
	if (series.error) return Response.json({ message: '全国データを読み込めませんでした。' }, { status: 500 });
	return Response.json(
		{ status: state.data ?? null, series: series.data },
		{ headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400' } }
	);
};
