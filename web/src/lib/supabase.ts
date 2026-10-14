// ブラウザから使うSupabase（公開用キー。データはRLSで家族ごとに守られる）
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$app/env/public';

export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
	auth: {
		// メールのリンクを別のブラウザ（メールアプリ内など）で開いてもログインできるようにする
		flowType: 'implicit',
		persistSession: true,
		detectSessionInUrl: true
	}
});

export const MANUAL_BUCKET = 'manuals';
