<script lang="ts">
	import { app } from '#lib/app-state.svelte.js';
	import { PURCHASE_TYPES } from '#lib/calc.js';
	import HistoryRow from './history-row.svelte';

	let search = $state('');
	let itemId = $state('');
	let period = $state('all');
	let type = $state('');
	let limit = $state(200);

	// 資材の選択肢（削除した資材も含める）
	let names = $derived.by(() => {
		const map = new Map<string, string>();
		for (const e of app.events) if (e.item_id) map.set(e.item_id, e.item_name);
		for (const i of app.items) map.set(i.id, i.name);
		return [...map].sort((a, b) => a[1].localeCompare(b[1], 'ja'));
	});

	const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

	let list = $derived.by(() => {
		const now = new Date();
		const thisMonth = ym(now);
		const lastMonth = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
		const q = search.trim().toLowerCase();
		return app.events
			.filter((e) => {
				if (itemId && e.item_id !== itemId) return false;
				if (type === 'purchase' ? !PURCHASE_TYPES.includes(e.type) : type && e.type !== type) return false;
				const d = e.event_date;
				if (period === 'thisMonth' && d.slice(0, 7) !== thisMonth) return false;
				if (period === 'lastMonth' && d.slice(0, 7) !== lastMonth) return false;
				if (period === 'thisYear' && d.slice(0, 4) !== String(now.getFullYear())) return false;
				if (period === 'lastYear' && d.slice(0, 4) !== String(now.getFullYear() - 1)) return false;
				if (q) {
					// 規格と品名コードは記録に残らないので、今の資材から探す
					const item = e.item_id ? app.findItem(e.item_id) : undefined;
					if (!`${e.item_name} ${item?.spec ?? ''} ${item?.product_code ?? ''} ${e.type} ${e.supplier ?? ''} ${e.memo ?? ''} ${d} ${app.memberName(e.user_id)}`.toLowerCase().includes(q)) return false;
				}
				return true;
			})
			.sort((a, b) => b.created_at.localeCompare(a.created_at));
	});
</script>

<div class="panel">
	<h2>入出庫・価格の記録</h2>
	<div class="filters history-filters">
		<input type="search" bind:value={search} oninput={() => (limit = 200)} placeholder="資材名・購入先・メモ・明細No.などで検索" aria-label="検索" />
		<select bind:value={itemId} onchange={() => (limit = 200)} aria-label="資材">
			<option value="">すべての資材</option>
			{#each names as [id, name] (id)}<option value={id}>{name}{app.findItem(id) ? '' : '（削除済み）'}</option>{/each}
		</select>
		<select bind:value={period} onchange={() => (limit = 200)} aria-label="期間">
			<option value="all">すべての期間</option>
			<option value="thisMonth">今月</option>
			<option value="lastMonth">先月</option>
			<option value="thisYear">今年</option>
			<option value="lastYear">昨年</option>
		</select>
		<select bind:value={type} onchange={() => (limit = 200)} aria-label="種類">
			<option value="">すべての種類</option>
			<option value="purchase">購入（入庫・過去の購入）</option>
			{#each ['入庫', '出庫', '調整', '棚卸し', '過去の購入', '登録', '編集', '削除', '取消'] as t (t)}<option value={t}>{t === '調整' ? '数量の調整' : t}</option>{/each}
		</select>
	</div>
	{#each list.slice(0, limit) as e (e.id)}
		<HistoryRow event={e} />
	{:else}
		<p class="empty">記録がありません。</p>
	{/each}
	{#if list.length > limit}
		<div class="list-foot"><button type="button" class="btn" onclick={() => (limit += 200)}>さらに表示（残り {list.length - limit} 件）</button></div>
	{/if}
</div>
