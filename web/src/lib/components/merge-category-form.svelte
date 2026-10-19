<script lang="ts">
	import { untrack } from 'svelte';
	import { app } from '#lib/app-state.svelte.js';
	import { findSimilarCategory } from '#lib/category.js';

	// カテゴリをまとめる（表記揺れの整理）。id のカテゴリの資材を、選んだカテゴリへ移して id を削除する
	let { id }: { id: string } = $props();

	const fromName = untrack(() => app.categoryName(id));
	let others = $derived(app.categories.filter((c) => c.id !== id));
	// 似た名前のカテゴリがあれば、最初から選んでおく
	let to = $state(untrack(() => findSimilarCategory(fromName, app.categories.filter((c) => c.id !== id))?.category.id ?? ''));
	let count = $derived(app.items.filter((i) => i.category_id === id).length);
	let saving = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!to) return app.toast('まとめ先のカテゴリを選んでください。', true);
		const toName = app.categoryName(to);
		if (!(await app.confirm(`「${fromName}」の資材 ${count} 品目を「${toName}」に移して、「${fromName}」を削除します。\n過去の記録のカテゴリ名も「${toName}」にそろえます。`, 'まとめる'))) return;
		saving = true;
		try {
			await app.mergeCategory(id, to);
			app.modal = null;
			app.toast(`「${fromName}」を「${toName}」にまとめました。`);
		} catch {
			// お知らせ済み
		} finally {
			saving = false;
		}
	}
</script>

<form class="form-grid" onsubmit={submit}>
	<p class="note full">「{fromName}」（{count} 品目）を、ほかのカテゴリにまとめます。「ひりょう」と「肥料」のような表記揺れを直すときに使います。</p>
	<label class="field full"><span>まとめ先</span>
		<select bind:value={to} required>
			<option value="" disabled>選んでください</option>
			{#each others as c (c.id)}<option value={c.id}>{c.name}（{app.items.filter((i) => i.category_id === c.id).length} 品目）</option>{/each}
		</select>
	</label>
	<div class="form-actions full">
		<button type="submit" class="btn btn-primary" disabled={saving || !to}>まとめる</button>
		<button type="button" class="btn" onclick={() => (app.modal = null)}>キャンセル</button>
	</div>
</form>
