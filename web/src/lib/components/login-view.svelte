<script lang="ts">
	import { app } from '#lib/app-state.svelte.js';
	import { errorMessage } from '#lib/format.js';

	// ログイン：メールに届くリンクを押すか、6桁のコードを入力する（パスワードは不要）
	let email = $state('');
	let code = $state('');
	let sent = $state(false);
	let busy = $state(false);
	let error = $state('');

	async function send(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		error = '';
		try {
			await app.sendLoginMail(email.trim());
			sent = true;
		} catch (err) {
			error = errorMessage(err);
		} finally {
			busy = false;
		}
	}

	async function verify(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		error = '';
		try {
			await app.verifyCode(email.trim(), code.trim());
		} catch (err) {
			error = errorMessage(err);
		} finally {
			busy = false;
		}
	}
</script>

<div class="center-box">
	<div class="panel">
		<h2>資材ノートにログイン</h2>
		{#if !sent}
			<p class="note">メールアドレスを入力すると、ログイン用のメールが届きます。パスワードは不要です。家族に招待された人は、招待されたメールアドレスを入力してください。</p>
			<form class="settings-grid" onsubmit={send}>
				<label>メールアドレス<input type="email" bind:value={email} required autocomplete="email" placeholder="example@gmail.com" /></label>
				<button type="submit" class="btn btn-primary" disabled={busy}>{busy ? '送信中…' : 'ログイン用のメールを送る'}</button>
			</form>
		{:else}
			<p class="note">{email} にメールを送りました。メールの中のリンクを押すか、メールに書かれた6桁のコードを入力してください。</p>
			<form class="settings-grid" onsubmit={verify}>
				<label>コード<input bind:value={code} inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456" /></label>
				<button type="submit" class="btn btn-primary" disabled={busy || !code}>ログイン</button>
			</form>
			<p class="note"><button type="button" class="link" onclick={() => (sent = false)}>メールアドレスを入力し直す</button></p>
		{/if}
		{#if error}<p class="conflict">{error}</p>{/if}
	</div>
</div>
