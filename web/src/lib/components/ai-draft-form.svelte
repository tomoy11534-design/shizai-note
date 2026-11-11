<script lang="ts" module>
	import { buildPrompt as makePrompt } from '#lib/ai-draft.js';
	import { app as appState } from '#lib/app-state.svelte.js';

	// 「AIに聞く」ボタンから呼ぶ。押したその場で質問文をコピーしてから画面を開く
	// （ブラウザは、ボタンを押した直後でないとコピーを許さないため、ここで先にコピーする）
	export async function openAiDraft(id: string) {
		const it = appState.findItem(id);
		if (!it) return;
		let copied = false;
		try {
			await navigator.clipboard.writeText(makePrompt(it, appState.categoryName(it.category_id)));
			copied = true;
		} catch {
			// コピーできない端末では、開いた画面でコピーしてもらう
		}
		appState.modal = { kind: 'ai-draft', id, copied };
		if (copied) appState.toast('質問文をコピーしました。AIアプリに貼り付けて送ってください。');
	}
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { AI_APPS, buildPrompt, isPesticide, memoWithSources, parseAnswer, searchLinks, type DictKey, type Draft } from '#lib/ai-draft.js';
	import { app } from '#lib/app-state.svelte.js';
	import { DICT_FIELDS } from '#lib/dictionary.js';

	// AIアプリに聞いた答えから、辞書の下書きを作って確かめてから登録する
	let { id, copied: copiedAtOpen = false }: { id: string; copied?: boolean } = $props();

	let item = $derived(app.findItem(id));
	let categoryName = $derived(item ? app.categoryName(item.category_id) : '');
	let pesticide = $derived(item ? isPesticide(categoryName, item.usage) : false);
	const prompt = untrack(() => {
		const it = app.findItem(id);
		return it ? buildPrompt(it, app.categoryName(it.category_id)) : '';
	});

	// 開くときにコピー済みなら、はじめから「コピーしました」の表示にする
	let copied = $state(untrack(() => copiedAtOpen));
	let promptBox: HTMLTextAreaElement | undefined = $state();
	let answer = $state('');
	let draft = $state<Draft | null>(null);
	let use = $state<Record<DictKey, boolean>>({ features: false, how_to_use: false, cautions: false, crops: false });
	let keepSources = $state(true);
	let saving = $state(false);
	let parseError = $state('');

	async function copyPrompt() {
		try {
			await navigator.clipboard.writeText(prompt);
			copied = true;
			app.toast('質問文をコピーしました。AIアプリに貼り付けて送ってください。');
		} catch {
			// コピーできない端末では、文章を選んだ状態にして手でコピーしてもらう
			promptBox?.focus();
			promptBox?.select();
			app.toast('自動でコピーできませんでした。選んだ文章を長押ししてコピーしてください。', true);
		}
	}

	function read() {
		const d = parseAnswer(answer);
		if (!d) {
			draft = null;
			parseError = '答えから「【特徴】」などの見出しが見つかりませんでした。AIの答えを全部コピーして貼り付けてください。';
			return;
		}
		parseError = '';
		draft = d;
		// 下書きがある欄だけ、はじめから「使う」にしておく
		for (const f of DICT_FIELDS) use[f.key] = !!d.fields[f.key];
	}

	let chosen = $derived(draft ? DICT_FIELDS.filter((f) => use[f.key]) : []);

	async function save() {
		const cur = app.findItem(id);
		if (!cur || !draft || !chosen.length) return;
		saving = true;
		try {
			const next = { ...cur };
			for (const f of chosen) next[f.key] = draft.fields[f.key];
			if (keepSources) next.memo = memoWithSources(cur.memo, draft.sources);
			const memo = `${chosen.map((f) => f.label).join('・')}を変更（AIの下書きから）`;
			const res = await app.saveItem(next, cur.updated_at, memo);
			if (res.conflict) {
				app.toast('ほかの人が先にこの資材を更新しました。内容を確かめてから、もう一度「登録」を押してください。', true);
				return;
			}
			app.toast('辞書に登録しました。');
			app.modal = { kind: 'detail', id };
		} catch {
			// お知らせ済み
		} finally {
			saving = false;
		}
	}
</script>

{#if item}
	<div class="ai-draft">
		<section class="ai-step">
			<h3><span class="ai-num">1</span>質問文をコピーして、AIアプリで聞く</h3>
			<textarea class="ai-prompt" bind:this={promptBox} readonly rows="6" value={prompt} aria-label="AIアプリに貼る質問文"></textarea>
			<div class="form-actions">
				<button type="button" class="btn btn-primary" onclick={copyPrompt}>{copied ? 'もう一度コピー' : '質問文をコピー'}</button>
			</div>
			{#if copied}
				<p class="note"><b>質問文はコピーしてあります。</b>下のボタンでAIアプリを開いて、貼り付けて送ってください。無料のままで使えます。</p>
			{:else}
				<p class="note">コピーしたら、AIアプリを開いて貼り付けて送ってください。無料のままで使えます。</p>
			{/if}
			<div class="ai-links">
				{#each AI_APPS as a (a.href)}<a class="btn btn-small" href={a.href} target="_blank" rel="noopener noreferrer">{a.label}を開く</a>{/each}
			</div>
		</section>

		<section class="ai-step">
			<h3><span class="ai-num">2</span>AIの答えを貼り付ける</h3>
			<textarea bind:value={answer} rows="6" placeholder="AIアプリの答えを全部コピーして、ここに貼り付けてください" aria-label="AIの答え"></textarea>
			<div class="form-actions">
				<button type="button" class="btn btn-primary" onclick={read} disabled={!answer.trim()}>答えを読み取る</button>
			</div>
			{#if parseError}<p class="conflict" role="alert">{parseError}</p>{/if}
		</section>

		{#if draft}
			<section class="ai-step">
				<h3><span class="ai-num">3</span>合っているか確かめて登録する</h3>
				<p class="note">下書きは直してから登録できます。登録する欄にだけチェックを入れてください。</p>
				{#if pesticide}
					<p class="conflict">農薬の倍率・使用時期・回数は、まちがえると危険です。<b>必ずラベルか農薬登録情報で確かめてください。</b></p>
				{/if}
				{#each DICT_FIELDS as f (f.key)}
					<div class="ai-field" class:off={!use[f.key]}>
						<label class="ai-check"><input type="checkbox" bind:checked={use[f.key]} />{f.label}を登録する</label>
						{#if item[f.key]}<p class="ai-now"><span>今の内容</span>{item[f.key]}</p>{/if}
						{#if f.rows === 1}
							<input bind:value={draft.fields[f.key]} maxlength={f.max} aria-label="{f.label}の下書き" placeholder="（AIの答えにありませんでした）" />
						{:else}
							<textarea bind:value={draft.fields[f.key]} rows={f.rows + 1} maxlength={f.max} aria-label="{f.label}の下書き" placeholder="（AIの答えにありませんでした）"></textarea>
						{/if}
					</div>
				{/each}

				<div class="ai-sources">
					<b>調べた元</b>
					{#if draft.sources.length}
						<ul>{#each draft.sources as u (u)}<li><a href={u} target="_blank" rel="noopener noreferrer">{u}</a></li>{/each}</ul>
						<label class="ai-check"><input type="checkbox" bind:checked={keepSources} />調べた元のURLをメモに残す</label>
					{:else}
						<p class="note">AIの答えにURLがありませんでした。下のリンクで確かめてください。</p>
					{/if}
					<div class="ai-links">
						{#each searchLinks(item, pesticide) as l (l.href)}<a class="btn btn-small" href={l.href} target="_blank" rel="noopener noreferrer">{l.label}</a>{/each}
					</div>
				</div>

				<div class="form-actions">
					<button type="button" class="btn btn-primary" onclick={save} disabled={saving || !chosen.length}>{chosen.length ? `${chosen.length}つの欄を登録する` : '登録する欄を選んでください'}</button>
					<button type="button" class="btn" onclick={() => (app.modal = { kind: 'detail', id })}>やめる</button>
				</div>
			</section>
		{/if}
	</div>
{:else}
	<p class="empty">この資材は削除されました。</p>
{/if}

<style>
	.ai-draft { display: grid; gap: 18px; }
	.ai-step { display: grid; gap: 8px; }
	.ai-step h3 { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 1rem; }
	.ai-num {
		display: inline-grid;
		place-items: center;
		width: 1.6em;
		height: 1.6em;
		border-radius: 50%;
		background: var(--brand);
		color: #fff;
		font-size: 0.85rem;
		flex: none;
	}
	.ai-prompt { font-size: 0.85rem; color: var(--muted); }
	.ai-links { display: flex; flex-wrap: wrap; gap: 6px; }
	.ai-links a { text-decoration: none; }
	.ai-field { display: grid; gap: 4px; padding: 8px 0; border-top: 1px solid var(--border); }
	.ai-field.off input:not([type='checkbox']),
	.ai-field.off textarea { opacity: 0.5; }
	.ai-check { display: flex; align-items: center; gap: 6px; font-weight: bold; font-size: 0.9rem; }
	.ai-check input { width: 20px; height: 20px; }
	.ai-now { margin: 0; font-size: 0.82rem; color: var(--muted); white-space: pre-wrap; overflow-wrap: anywhere; }
	.ai-now span { font-weight: bold; margin-right: 6px; }
	.ai-sources { display: grid; gap: 6px; font-size: 0.88rem; }
	.ai-sources ul { margin: 0; padding-left: 1.2em; }
	.ai-sources a { overflow-wrap: anywhere; }
</style>
