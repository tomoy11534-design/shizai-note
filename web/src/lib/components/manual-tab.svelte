<script lang="ts">
	import { app } from '#lib/app-state.svelte.js';
	import { dictionaryText, hasDictionary } from '#lib/dictionary.js';
	import DictionaryView from './dictionary-view.svelte';
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
				if (filter === 'nodict' && hasDictionary(item)) return false;
				const q = search.trim().toLowerCase();
				if (q && !`${item.name} ${item.spec} ${item.purpose} ${dictionaryText(item)} ${files.map((f) => `${f.title} ${f.file_name}`).join(' ')}`.toLowerCase().includes(q)) return false;
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

<div class="tiles compact">
	<Tile label="登録した説明書" value="{app.manuals.length} 件" />
	<Tile label="説明書がある資材" value="{withManual} 品目" sub="全 {app.items.length} 品目中" />
	<Tile label="説明書がない資材" value="{app.items.length - withManual} 品目" />
	<Tile label="辞書が未入力" value="{app.items.filter((i) => !hasDictionary(i)).length} 品目" sub="用途が未入力 {app.items.filter((i) => !i.purpose).length} 品目" />
</div>

<div class="panel">
	<h2>資材の辞書と説明書</h2>
	<p class="note">資材ごとに、用途・特徴・使い方・注意点・対象の作物と、取扱説明書（PDF・画像）をまとめて管理します。スマホではカメラで撮った写真もそのまま登録できます。</p>
	<div class="filters three">
		<input type="search" bind:value={search} placeholder="資材名・辞書の内容・説明書の表題で検索" aria-label="検索" />
		<select bind:value={category} aria-label="カテゴリ">
			<option value="">すべてのカテゴリ</option>
			{#each app.categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
		</select>
		<select bind:value={filter} aria-label="絞り込み">
			<option value="">すべての資材</option>
			<option value="has">説明書あり</option>
			<option value="none">説明書なし</option>
			<option value="nopurpose">用途が未入力</option>
			<option value="nodict">辞書が未入力</option>
		</select>
	</div>

	{#each list as item (item.id)}
		{@const files = app.manualsOf(item.id)}
		{@const blank = !item.purpose && !hasDictionary(item)}
		<div class="manual-item" class:is-blank={blank && !files.length}>
			<div class="manual-head">
				<div>
					<button type="button" class="item-name" onclick={() => (app.modal = { kind: 'detail', id: item.id })}>{item.name}</button>{#if item.spec}<span class="spec">{item.spec}</span>{/if}
					<span class="badge">{app.categoryName(item.category_id)}</span>
					{#if blank}<span class="chg-sub">用途・辞書 未入力</span>{/if}
				</div>
				<div class="item-buttons">
					<button type="button" class="btn btn-small" onclick={() => (app.modal = { kind: 'upload', id: item.id, back: false })}>＋ 説明書</button>
					<button type="button" class="btn btn-small" onclick={() => (app.modal = { kind: 'item', id: item.id })}>辞書を編集</button>
				</div>
			</div>
			{#if item.purpose}<p class="purpose"><span class="purpose-label">用途</span>{item.purpose}</p>{/if}
			{#if hasDictionary(item)}<DictionaryView {item} />{/if}
			{#if files.length}
				<div class="files">{#each files as m (m.id)}<FileCard manual={m} />{/each}</div>
			{/if}
		</div>
	{:else}
		<p class="empty">条件に合う資材がありません。</p>
	{/each}

	{#if orphans.length && !category && filter !== 'none' && filter !== 'nopurpose' && filter !== 'nodict'}
		<div class="manual-item">
			<div class="manual-head"><b>削除した資材の説明書</b></div>
			<div class="files">{#each orphans as m (m.id)}<FileCard manual={m} prefix="{m.item_name}：" />{/each}</div>
		</div>
	{/if}
</div>
