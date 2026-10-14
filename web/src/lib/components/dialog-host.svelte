<script lang="ts">
	import { app } from '#lib/app-state.svelte.js';

	// 確認・入力の小窓（ブラウザの confirm / prompt は使わない）
	let value = $state('');
	let input: HTMLInputElement | undefined = $state();
	let okButton: HTMLButtonElement | undefined = $state();

	$effect(() => {
		if (app.dialog) {
			value = app.dialog.value;
			queueMicrotask(() => (app.dialog?.kind === 'prompt' ? input?.focus() : okButton?.focus()));
		}
	});

	function submit(e: SubmitEvent) {
		e.preventDefault();
		app.closeDialog(app.dialog?.kind === 'prompt' ? value : 'ok');
	}
</script>

{#if app.dialog}
	<div class="modal top">
		<button type="button" class="modal-backdrop" aria-label="キャンセル" onclick={() => app.closeDialog(null)}></button>
		<div class="modal-body small" role="alertdialog" aria-modal="true" aria-label="確認"><form onsubmit={submit}>
			{#if app.dialog.kind === 'prompt'}
				<label class="field"><span>{app.dialog.message}</span><input bind:this={input} bind:value maxlength="100" /></label>
			{:else}
				<p class="pre">{app.dialog.message}</p>
			{/if}
			<div class="form-actions">
				<button type="submit" class="btn btn-primary" bind:this={okButton}>{app.dialog.okLabel}</button>
				<button type="button" class="btn" onclick={() => app.closeDialog(null)}>キャンセル</button>
			</div>
		</form></div>
	</div>
{/if}
