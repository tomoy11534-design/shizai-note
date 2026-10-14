import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// ライブラリ以外はルーン（Svelte 5の書き方）を必ず使う
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Vercelに公開する。Supabaseを東京に作る前提で、関数も東京（hnd1）で動かす
			adapter: adapter({ regions: ['hnd1'] })
		})
	],
	test: {
		include: ['src/**/*.test.ts']
	}
});
