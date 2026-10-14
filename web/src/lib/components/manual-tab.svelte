<script lang="ts">
	import { app } from '#lib/app-state.svelte.js';
	import FileCard from './file-card.svelte';
	import Tile from './tile.svelte';

	let search = $state('');
	let category = $state('');
	let filter = $state('');

	let withManual = $derived(app.items.filter((i) => app.manualsOf(i.id).length).length);

	let list = $derived(
		app.sortItems(
			app.items.filter((item) => {
				const files = app.manualsOf(item.id);
				if (category && item.category_id !== category) return false;
				if (filter === 'has' && !files.length) return false;
				if (filter === 'none' && files.length) return false;
				if (filter === 'nopurpose' && item.purpose) return false;
				const q = search.trim().toLowerCase();
				if (q && !`${item.name} ${item.purpose} ${files.map((f) => `${f.title} ${f.file_name}`).join(' ')}`.toLowerCase().includes(q)) return false;
				return true;
			})
		)
	);

	// 削除した資材の説明書も、消さずに残しておく
	let orphans = $derived.by(() => {
		const ids = new Set(app.items.map((i) => i.id));
		const q = search.trim().toLowerCase();
		return app.manuals.filter((m) => (!m.item_id || !ids.has(m.item_id)) && (!q || `${m.item_name} ${m.title}`.toLowerCase().includes(q)));
	});
</script>

<div class="tiles">
	<Tile label="登録した説明書" value="{app.manuals.length} 件" />
	<Tile label="説明書がある資材" value="{withManual} 品目" sub="全 {app.items.length} 品目中" />
	<Tile label="説明書がない資材" value="{app.items.length - withManual} 品目" />
	<Tile label="用途が未入力" value="{app.items.filter((i) => !i.purpose).length} 品目" />
</div>

<div class="panel">
	<h2>取扱説明書と用途</h2>
	<p class="note">資材ごとに、取扱説明書（PDF・画像）と「何のために使うか」をまとめて管理します。スマホではカメラで撮った写真もそのまま登録できます。</p>
	<div class="filters three">
		<input type="search" bind:value={search} placeholder="資材名・用途・説明書の表題で検索" aria-label="検索" />
		<select bind:value={category} aria-label="カテゴリ">
			<option value="">すべてのカテゴリ</option>
			{#each app.categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
		</select>
		<select bind:value={filter} aria-label="絞り込み">
			<option value="">すべての資材</option>
			<option value="has">説明書あり</option>
			<option value="none">説明書なし</option>
			<option value="nopurpose">用途が未入力</option>
		</select>
	</div>

	{#each list as item (item.id)}
		{@const files = app.manualsOf(item.id)}
		<div class="manual-item">
			<div class="manual-head">
				<div>
					<button type="button" class="item-name" onclick={() => (app.modal = { kind: 'detail', id: item.id })}>{item.name}</button>
					<span class="badge">{app.categoryName(item.category_id)}</span>
				</div>
				<div class="item-buttons">
					<button type="button" class="btn btn-small" onclick={() => (app.modal = { kind: 'upload', id: item.id, back: false })}>＋ 説明書</button>
					<button type="button" class="btn btn-small" onclick={() => (app.modal = { kind: 'item', id: item.id })}>用途を編集</button>
				</div>
			</div>
			<p class="purpose" class:empty-purpose={!item.purpose}><span class="purpose-label">用途</span>{item.purpose || '未入力'}</p>
			{#if files.length}
				<div class="files">{#each files as m (m.id)}<FileCard manual={m} />{/each}</div>
			{:else}
				<p class="note">説明書はまだありません。</p>
			{/if}
		</div>
	{:else}
		<p class="empty">条件に合う資材がありません。</p>
	{/each}

	{#if orphans.length && !category && filter !== 'none' && filter !== 'nopurpose'}
		<div class="manual-item">
			<div class="manual-head"><b>削除した資材の説明書</b></div>
			<div class="files">{#each orphans as m (m.id)}<FileCard manual={m} prefix="{m.item_name}：" />{/each}</div>
		</div>
	{/if}
</div>
