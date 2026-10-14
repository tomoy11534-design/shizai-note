<script lang="ts">
	import { untrack } from 'svelte';
	import { app } from '#lib/app-state.svelte.js';

	// カテゴリ名の変更（資材にも自動で反映される）
	let { id }: { id: string } = $props();
	let name = $state(untrack(() => app.categoryName(id)));

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!name.trim()) return;
		app.renameCategory(id, name).then(() => {
			app.modal = null;
			app.toast('変更しました。');
		}, () => undefined);
	}
</script>

<form class="form-grid" onsubmit={submit}>
	<label class="field full"><span>新しい名前</span><input bind:value={name} maxlength="30" required /></label>
	<p class="note full">このカテゴリの資材にも反映されます。</p>
	<div class="form-actions full">
		<button type="submit" class="btn btn-primary">変更する</button>
		<button type="button" class="btn" onclick={() => (app.modal = null)}>キャンセル</button>
	</div>
</form>
