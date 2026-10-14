<script lang="ts">
	import { app } from '#lib/app-state.svelte.js';
	import { sizeText } from '#lib/format.js';
	import type { Manual } from '#lib/types.js';

	// 取扱説明書1件分の表示
	let { manual, prefix = '' }: { manual: Manual; prefix?: string } = $props();

	let isImage = $derived(manual.mime_type.startsWith('image/'));
	let thumb = $state('');

	// 画像は一時的なURLで縮小表示する
	$effect(() => {
		if (!isImage) return;
		let alive = true;
		app.signedUrl(manual.storage_path).then(
			(url) => alive && (thumb = url),
			() => undefined
		);
		return () => (alive = false);
	});

	async function open() {
		// 先に新しいタブを開いておく（あとで開くとブロックされることがあるため）
		const win = window.open('', '_blank');
		try {
			const url = await app.signedUrl(manual.storage_path);
			if (win) win.location.href = url;
			else location.href = url;
		} catch (e) {
			win?.close();
			app.toast(e instanceof Error ? e.message : String(e), true);
		}
	}

	async function rename() {
		const title = await app.prompt('説明書の表題', manual.title);
		if (title === null || !title.trim()) return;
		await app.renameManual(manual.id, title).then(() => app.toast('表題を変更しました。'), () => undefined);
	}

	async function remove() {
		if (!(await app.confirm(`説明書「${manual.title}」を削除しますか？\nファイルも削除され、元に戻せません。`, '削除する'))) return;
		await app.deleteManual(manual.id).then(() => app.toast('削除しました。'), () => undefined);
	}
</script>

<div class="file-card">
	<button type="button" class="file-thumb" onclick={open} aria-label="{manual.title}を開く">
		{#if isImage && thumb}<img src={thumb} alt="" loading="lazy" />{:else}{isImage ? '🖼' : '📄'}{/if}
	</button>
	<div class="file-info">
		<div class="file-title">{prefix}{manual.title}</div>
		<div class="file-meta">
			{isImage ? '画像' : 'PDF'}・{sizeText(manual.size)}・{app.memberName(manual.uploaded_by)}・{manual.created_at.slice(0, 10)}
		</div>
	</div>
	<div class="file-actions">
		<button type="button" class="btn" onclick={open}>開く</button>
		<button type="button" class="btn" onclick={rename}>表題</button>
		<button type="button" class="btn btn-danger" onclick={remove}>削除</button>
	</div>
</div>
