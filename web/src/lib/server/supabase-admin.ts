// 秘密キーで接続するSupabase（サーバーの定期実行だけで使う。RLSを通らないので取り扱い注意）
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SECRET_KEY } from '$app/env/private';
import { PUBLIC_SUPABASE_URL } from '$app/env/public';

export function adminClient() {
	if (!SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY が設定されていません。');
	return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
}

// ログインした人のトークンを確かめて、その人の情報を返す
export async function userFromRequest(request: Request) {
	const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
	if (!token) return null;
	const { data, error } = await adminClient().auth.getUser(token);
	return error ? null : data.user;
}
