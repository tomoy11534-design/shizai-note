<script lang="ts">
	import { app } from '#lib/app-state.svelte.js';
	import { errorMessage } from '#lib/format.js';
	import { prepareUpload } from '#lib/upload.js';

	// 取扱説明書の追加（複数のファイルをまとめて登録できる）
	let { id, back }: { id: string; back: boolean } = $props();

	let files = $state<FileList | null>(null);
	// カメラで撮影した写真（撮るたびに追加する）
	let photos = $state<File[]>([]);
	let camera = $state<FileList | null>(null);
	$effect(() => {
		if (camera?.length) photos = [...photos, ...camera];
	});
	let title = $state('');
	let progress = $state('');
	let saving = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const list = [...(files ?? []), ...photos];
		if (!list.length) return;
		saving = true;
		let ok = 0;
		for (const [i, file] of list.entries()) {
			progress = `登録中… ${i + 1} / ${list.length}（${file.name}）`;
			try {
				const prepared = await prepareUpload(file);
				const t = title.trim() ? (list.length > 1 ? `${title.trim()}（${i + 1}）` : title.trim()) : '';
				await app.uploadManual(id, prepared, t);
				ok++;
			} catch (err) {
				app.toast(errorMessage(err), true);
			}
		}
		saving = false;
		progress = `${ok}件を登録しました。`;
		if (ok) {
			app.toast(`${ok}件の説明書を登録しました。`);
			app.modal = back ? { kind: 'detail', id } : null;
		}
	}
</script>

<form class="form-grid" autocomplete="off" onsubmit={submit}>
	<label class="field full">
		<span>ファイル（PDF・画像）<span class="req">必須</span> <small>複数選べます。スマホではカメラで撮影もできます</small></span>
		<input type="file" accept="application/pdf,image/*" multiple required={!photos.length} bind:files />
	</label>
	<label class="field full">
		<span>カメラで撮影 <small>スマホのみ。何枚でも撮れます</small></span>
		<input type="file" accept="image/*" capture="environment" bind:files={camera} />
		{#if photos.length}<small>撮影済み：{photos.length}枚</small>{/if}
	</label>
	<label class="field full">
		<span>表題 <small>省略するとファイル名になります</small></span>
		<input bind:value={title} maxlength="100" placeholder="例：取扱説明書、使用量の早見表、ラベル写真" />
	</label>
	<div class="form-actions full">
		<button type="submit" class="btn btn-primary" disabled={saving}>登録する</button>
		<button type="button" class="btn" onclick={() => (app.modal = back ? { kind: 'detail', id } : null)}>キャンセル</button>
	</div>
	{#if progress}<p class="upload-progress full" aria-live="polite">{progress}</p>{/if}
	<p class="note full">ファイルは家族だけが見られる場所に保存されます。大きな写真は自動で縮小します（1ファイル20MBまで）。</p>
</form>
