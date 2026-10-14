import { defineEnvVars } from '@sveltejs/kit/env';

// テスト（Vitest）の実行中かどうか
const testing = Boolean((globalThis as { process?: { env?: Record<string, string> } }).process?.env?.VITEST);

// 必須の値：空ならエラーにする（テストのときは仮の値を使う）
const required = (name: string) => (value: string | undefined) => {
	if (!value && testing) return 'http://localhost:54321';
	if (!value) throw new Error(`環境変数 ${name} が設定されていません（.env を確認してください）`);
	return value;
};

// 任意の値：なければ空文字
const optional = (value: string | undefined) => value ?? '';

export const variables = defineEnvVars({
	PUBLIC_SUPABASE_URL: {
		public: true,
		static: true,
		description: 'SupabaseのプロジェクトURL（例：https://xxxx.supabase.co）',
		schema: required('PUBLIC_SUPABASE_URL')
	},
	PUBLIC_SUPABASE_PUBLISHABLE_KEY: {
		public: true,
		static: true,
		description: 'Supabaseの公開用キー（sb_publishable_ で始まるもの）',
		schema: required('PUBLIC_SUPABASE_PUBLISHABLE_KEY')
	},
	SUPABASE_SECRET_KEY: {
		description: 'Supabaseの秘密キー（sb_secret_ で始まるもの）。全国データの保存とメール通知に使う',
		schema: optional
	},
	CRON_SECRET: {
		description: '定期実行（Vercel Cron）を確かめるための合言葉',
		schema: optional
	},
	RESEND_API_KEY: {
		description: 'メール送信サービスResendのAPIキー（メール通知を使う場合）',
		schema: optional
	},
	MAIL_FROM: {
		description: 'メールの送信元（例：資材ノート <notify@example.com>）',
		schema: optional
	},
	APP_URL: {
		description: 'アプリのURL（メールに載せる）',
		schema: optional
	}
});
