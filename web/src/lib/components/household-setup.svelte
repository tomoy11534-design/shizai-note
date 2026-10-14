<script lang="ts">
	import { app } from '#lib/app-state.svelte.js';
	import { errorMessage } from '#lib/format.js';

	// はじめて使うとき：農園（家族で共有する単位）を作る
	let name = $state('');
	let busy = $state(false);
	let error = $state('');

	async function create(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		error = '';
		try {
			await app.createHousehold(name.trim());
		} catch (err) {
			error = errorMessage(err);
		} finally {
			busy = false;
		}
	}

	async function recheck() {
		busy = true;
		await app.afterLogin();
		busy = false;
		if (!app.householdId) error = 'まだ招待されていないようです。招待した人に、メールアドレスが合っているか確認してもらってください。';
	}
</script>

<div class="center-box">
	<div class="panel">
		<h2>農園を作る</h2>
		<p class="note">はじめての方は、農園の名前を決めてください。家族はあとから設定タブで招待できます。</p>
		<form class="settings-grid" onsubmit={create}>
			<label>農園の名前<input bind:value={name} required maxlength="50" placeholder="例：山田農園" /></label>
			<button type="submit" class="btn btn-primary" disabled={busy}>作成する</button>
		</form>
	</div>
	<div class="panel">
		<h2>家族に招待された方</h2>
		<p class="note">招待した人に、あなたのメールアドレス（{app.session?.user.email}）を招待してもらってから、下のボタンを押してください。</p>
		<button type="button" class="btn" disabled={busy} onclick={recheck}>招待を確認する</button>
	</div>
	{#if error}<p class="conflict">{error}</p>{/if}
	<p class="note"><button type="button" class="link" onclick={() => app.signOut()}>別のメールアドレスでログインし直す</button></p>
</div>
