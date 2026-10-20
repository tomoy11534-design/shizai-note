<script lang="ts">
	import { app } from '#lib/app-state.svelte.js';
	import { errorMessage } from '#lib/format.js';

	// ログイン：Googleアカウントで入るか、メールに届くリンクを押す・6桁のコードを入力する（パスワードは不要）
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

	async function google() {
		busy = true;
		error = '';
		try {
			await app.signInWithGoogle();
		} catch (err) {
			error = errorMessage(err);
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
			<button type="button" class="btn btn-google" onclick={google} disabled={busy}>
				<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.2 1.5-5 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
				Googleでログイン
			</button>
			<p class="or"><span>または</span></p>
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
