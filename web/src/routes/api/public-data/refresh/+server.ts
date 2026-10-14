// 画面の「今すぐ取得」ボタンから呼ばれる（ログインした家族だけ）
import { runPublicFetch } from '#lib/server/jobs.js';
import { adminClient, userFromRequest } from '#lib/server/supabase-admin.js';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 60 };

export const POST: RequestHandler = async ({ request }) => {
	const user = await userFromRequest(request);
	if (!user) return Response.json({ ok: false, message: 'ログインしてください。' }, { status: 401 });

	const db = adminClient();
	const { count } = await db.from('household_members').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
	if (!count) return Response.json({ ok: false, message: '農園に参加していません。' }, { status: 403 });

	// 何度も押されたときに、農林水産省のサーバーへ負担をかけないようにする
	const { data: state } = await db.from('app_state').select('public_last_fetch, public_last_status').eq('id', 1).single();
	const last = state?.public_last_fetch ? Date.parse(state.public_last_fetch) : 0;
	if (state?.public_last_status === '成功' && Date.now() - last < 10 * 60 * 1000) {
		return Response.json({ ok: true, message: '10分以内に取得したばかりです。最新のデータを表示しています。' });
	}
	return Response.json(await runPublicFetch());
};
