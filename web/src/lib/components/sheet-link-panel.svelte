<script lang="ts">
	import { app } from '#lib/app-state.svelte.js';
	import { errorMessage, shortDateTime } from '#lib/format.js';
	import { supabase } from '#lib/supabase.js';

	// Googleスプレッドシートとの連携（合言葉の発行と、同期の状態）
	interface SheetLink {
		created_at: string;
		last_import_at: string | null;
		last_import_status: string;
		last_export_at: string | null;
	}

	let link = $state<SheetLink | null>(null);
	let loaded = $state(false);
	let token = $state('');
	let busy = $state(false);

	async function load() {
		const { data } = await supabase.from('sheet_links').select('created_at, last_import_at, last_import_status, last_export_at').eq('household_id', app.householdId!).maybeSingle();
		link = data as SheetLink | null;
		loaded = true;
	}

	$effect(() => {
		if (app.householdId) void load();
	});

	async function issue() {
		if (link && !(await app.confirm('合言葉を作り直しますか？\n今の合言葉は使えなくなるので、スプレッドシートにも新しい合言葉を入れ直してください。', '作り直す'))) return;
		busy = true;
		try {
			const { data, error } = await supabase.rpc('issue_sheet_token', { p_household: app.householdId });
			if (error) throw new Error(error.message);
			token = data as string;
			await load();
		} catch (e) {
			app.toast(errorMessage(e), true);
		} finally {
			busy = false;
		}
	}

	async function remove() {
		if (!(await app.confirm('スプレッドシートとの連携をやめますか？\n合言葉が使えなくなり、取り込みも書き出しも止まります。取り込んだ記録は残ります。', 'やめる'))) return;
		const { error } = await supabase.rpc('remove_sheet_link', { p_household: app.householdId });
		if (error) return app.toast(errorMessage(error), true);
		token = '';
		await load();
		app.toast('連携をやめました。');
	}

	async function copyToken() {
		try {
			await navigator.clipboard.writeText(token);
			app.toast('合言葉をコピーしました。');
		} catch {
			app.toast('コピーできませんでした。表示されている合言葉を長押しして選んでください。', true);
		}
	}
</script>

<div class="panel">
	<h2>Googleスプレッドシートとの連携</h2>
	<p class="note">
		スプレッドシートに貼ったJAのお買上げ明細を、毎朝自動で取り込みます（「過去の購入」として記録し、在庫数は変えません）。あわせて、資材ノートの在庫一覧と履歴をスプレッドシートに書き出します。書き出したシートは見るだけにして、入力は資材ノートでしてください。
	</p>
	{#if !loaded}
		<p class="note">読み込み中…</p>
	{:else}
		{#if link}
			<ul class="sync-status">
				<li>連携を始めた日：{shortDateTime(link.created_at)}</li>
				<li>最後の取り込み：{link.last_import_at ? `${shortDateTime(link.last_import_at)}（${link.last_import_status}）` : 'まだありません'}</li>
				<li>最後の書き出し：{link.last_export_at ? shortDateTime(link.last_export_at) : 'まだありません'}</li>
			</ul>
		{:else}
			<p class="note">まだ連携していません。</p>
		{/if}

		{#if token}
			<div class="conflict">
				<p><b>合言葉</b>（この画面を閉じると、もう表示できません。他の人には教えないでください）</p>
				<p class="token">{token}</p>
				<button type="button" class="btn btn-small" onclick={copyToken}>コピー</button>
			</div>
		{/if}

		{#if app.isOwner}
			<div class="form-actions" style="margin-top:8px">
				<button type="button" class="btn btn-primary" onclick={issue} disabled={busy}>{link ? '合言葉を作り直す' : '合言葉を発行する'}</button>
				{#if link}<button type="button" class="btn btn-danger" onclick={remove}>連携をやめる</button>{/if}
			</div>
		{:else}
			<p class="note">合言葉を発行できるのは、農園の所有者だけです。</p>
		{/if}
		<p class="note">スプレッドシート側の準備（Apps Script の貼り付け）は、使い方の説明（manual.md）の「スプレッドシートとの連携」を見てください。</p>
	{/if}
</div>
