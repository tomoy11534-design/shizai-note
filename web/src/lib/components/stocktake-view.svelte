<script lang="ts">
	import { app, readJson, writeJson } from '#lib/app-state.svelte.js';
	import { fmt, shortDateTime } from '#lib/format.js';
	import { draftKey, draftRows, emptyDraft, type StocktakeDraft } from '#lib/stocktake.js';
	import type { Item } from '#lib/types.js';
	import Tile from './tile.svelte';

	// 棚卸し：全資材を数えて、帳簿との差をまとめて直す
	let { onclose }: { onclose: () => void } = $props();

	const key = draftKey(app.householdId!);
	let draft = $state<StocktakeDraft>(readJson<StocktakeDraft>(key) ?? emptyDraft());
	let search = $state('');
	let category = $state('');
	let onlyLeft = $state(false);
	let memo = $state('');
	let saving = $state(false);

	// 入力するたびに端末へ保存する（途中で閉じても続きから再開できる）
	$effect(() => writeJson(key, $state.snapshot(draft)));

	let rows = $derived(draftRows(draft, app.items));
	let diffRows = $derived(rows.filter((r) => r.diff !== 0));

	let list = $derived(
		app.sortItems(
			app.items.filter((item) => {
				if (category && item.category_id !== category) return false;
				if (onlyLeft && draft.counts[item.id]) return false;
				const q = search.trim().toLowerCase();
				return !q || `${item.name} ${item.spec}`.toLowerCase().includes(q);
			})
		)
	);

	function setCount(item: Item, value: string) {
		if (value.trim() === '') {
			delete draft.counts[item.id];
			return;
		}
		const n = Number(value);
		if (!Number.isFinite(n) || n < 0) return;
		// 帳簿の数は、最初に数を入れたときのものを覚えておく
		const expected = draft.counts[item.id]?.expected ?? Number(item.stock);
		draft.counts[item.id] = { counted: n, expected };
	}

	function diffText(d: number, unit: string) {
		return d === 0 ? '差なし' : `${d > 0 ? '+' : ''}${fmt(d)}${unit}`;
	}

	async function commit() {
		if (!rows.length) return app.toast('数えた資材がありません。', true);
		const lines = diffRows.slice(0, 8).map((r) => `・${r.item.name}${r.item.spec ? `（${r.item.spec}）` : ''}：${fmt(r.expected)} → ${fmt(r.counted)}${r.item.unit}`);
		const more = diffRows.length > 8 ? `\nほか ${diffRows.length - 8} 品目` : '';
		const message = diffRows.length
			? `${rows.length} 品目のうち、差がある ${diffRows.length} 品目の在庫を直します。\n${lines.join('\n')}${more}`
			: `${rows.length} 品目を数えました。帳簿との差はありません。`;
		if (!(await app.confirm(message, '確定する'))) return;
		saving = true;
		try {
			const res = await app.stocktake(
				rows.map((r) => ({ item_id: r.item.id, counted: r.counted, expected: r.expected })),
				memo
			);
			draft = emptyDraft();
			app.toast(`棚卸しを確定しました（${res.checked ?? rows.length} 品目、うち ${res.events?.length ?? 0} 品目を修正）。`);
			onclose();
		} catch {
			// お知らせ済み
		} finally {
			saving = false;
		}
	}

	async function discard() {
		if (rows.length && !(await app.confirm('入力した数をすべて消しますか？', '消す'))) return;
		draft = emptyDraft();
	}
</script>

<div class="tiles">
	<Tile label="数えた資材" value="{rows.length} 品目" sub="全 {app.items.length} 品目中" />
	<Tile label="残り" value="{app.items.length - rows.length} 品目" />
	<Tile label="帳簿と差がある資材" value="{diffRows.length} 品目" />
</div>

<div class="panel">
	<div class="panel-head">
		<h2>棚卸し</h2>
		<button type="button" class="btn" onclick={onclose}>在庫一覧に戻る</button>
	</div>
	<p class="note">
		実際に数えた数を入れていきます。入れた数はこの端末に保存されるので、途中でやめても続きから再開できます（{shortDateTime(draft.started)} から）。
		最後に「確定」を押すと、帳簿と差がある資材の在庫をまとめて直し、履歴に「棚卸し」として残します。
	</p>
	<div class="filters three">
		<input type="search" bind:value={search} placeholder="資材名で検索" aria-label="検索" />
		<select bind:value={category} aria-label="カテゴリ">
			<option value="">すべてのカテゴリ</option>
			{#each app.categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
		</select>
		<label class="check"><input type="checkbox" bind:checked={onlyLeft} /> まだ数えていない資材だけ</label>
	</div>

	{#each list as item (item.id)}
		{@const entry = draft.counts[item.id]}
		{@const diff = entry ? entry.counted - entry.expected : null}
		<div class="count-row" class:counted={entry} class:has-diff={diff}>
			<div>
				<b>{item.name}</b>{#if item.spec}<span class="spec">{item.spec}</span>{/if}
				<div class="chg-sub">{app.categoryName(item.category_id)}・帳簿 {fmt(entry?.expected ?? item.stock)}{item.unit}</div>
				{#if entry && Number(item.stock) !== entry.expected}
					<div class="chg-sub">数えたあとに在庫が動いています（今 {fmt(item.stock)}{item.unit}）。確定すると差の分だけ直します。</div>
				{/if}
			</div>
			<div class="count-input">
				<input
					type="number"
					min="0"
					step="any"
					inputmode="decimal"
					value={entry?.counted ?? ''}
					onchange={(e) => setCount(item, e.currentTarget.value)}
					aria-label="{item.name}の数えた数"
					placeholder="数"
				/>
				<span class="unit">{item.unit}</span>
				{#if !entry}
					<button type="button" class="btn btn-small" onclick={() => setCount(item, String(item.stock))}>帳簿どおり</button>
				{:else}
					<span class="count-diff" class:up={diff! > 0} class:down={diff! < 0}>{diffText(diff!, item.unit)}</span>
				{/if}
			</div>
		</div>
	{:else}
		<p class="empty">{onlyLeft && rows.length ? 'すべて数え終わりました。' : '条件に合う資材がありません。'}</p>
	{/each}

	<div class="stocktake-footer">
		<label class="field full"><span>メモ <small>履歴に一緒に残ります</small></span><input bind:value={memo} maxlength="100" placeholder="例：秋の棚卸し" /></label>
		<div class="form-actions">
			<button type="button" class="btn btn-primary" onclick={commit} disabled={saving || !rows.length}>確定する（{rows.length} 品目）</button>
			<button type="button" class="btn btn-danger" onclick={discard} disabled={!rows.length}>入力を消す</button>
		</div>
	</div>
</div>
