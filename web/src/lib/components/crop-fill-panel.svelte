<script lang="ts">
	// 「対象の作物」が空の資材を、買った金額の多い順に並べて、その場で作物を入れられるようにする
	// 集計タブを作物別にしたときだけ出す。ふだんは閉じておき、邪魔にならないようにする
	import { app } from '#lib/app-state.svelte.js';
	import { cropShares } from '#lib/usage.js';

	const STEP = 20;
	let shown = $state(STEP);
	// 入力中の作物（資材IDごと）と、保存中の資材
	let draft = $state<Record<string, string>>({});
	let saving = $state('');

	// 作物が空で、買った記録がある資材（記録が全部の年の合計金額つき）
	let list = $derived.by(() => {
		const rows: { id: string; name: string; spec: string; category: string; total: number }[] = [];
		for (const item of app.items) {
			if (item.crops.trim()) continue;
			const total = (app.purchases.get(item.id) ?? []).reduce((s, p) => s + p.price * p.qty, 0);
			if (total > 0) rows.push({ id: item.id, name: item.name, spec: item.spec, category: app.categoryName(item.category_id), total });
		}
		return rows.sort((a, b) => b.total - a.total);
	});
	let sum = $derived(list.reduce((s, r) => s + r.total, 0));

	// 入力の候補：ほかの資材で使っている作物名（「メロン6棟」の数は外す）と「共通」
	let cropNames = $derived.by(() => {
		const names = new Set<string>();
		for (const i of app.items) for (const [name] of cropShares(i.crops)) names.add(name);
		names.add('共通');
		return [...names];
	});

	const yen = (v: number) => Math.round(v).toLocaleString('ja-JP');

	async function save(id: string) {
		const crops = (draft[id] ?? '').trim();
		const cur = app.findItem(id);
		if (!cur) return;
		if (!crops) return app.toast('作物を入力してください。', true);
		saving = id;
		try {
			const res = await app.saveItem({ ...cur, crops }, cur.updated_at, '対象の作物を変更（集計タブから）');
			if (res.conflict) return app.toast('ほかの人が先にこの資材を更新しました。もう一度入れてください。', true);
			app.toast(`「${cur.name}」を「${crops}」にしました。`);
			delete draft[id];
		} catch {
			// お知らせ済み
		} finally {
			saving = '';
		}
	}
</script>

{#if list.length}
	<details class="panel crop-fill">
		<summary>
			<b>作物が決まっていない資材</b>
			<span class="chg-sub">{list.length}品目・全部の年で {yen(sum)}円</span>
		</summary>
		<p class="note">
			ここにある資材は、上の表で「作物の指定なし」に入っています。使う作物を入れて <b>保存</b> を押すと、上の表にすぐ反映されます。
			買った金額が多い順なので、上から数個だけ入れても十分です。全部埋める必要はありません。
		</p>
		<ul class="note fill-tips">
			<li>いくつかの作物に使うもの：「メロン、キュウリ」（金額を等分します）</li>
			<li>割合を決めたいもの：「米60、メロン40」（数の割合で分けます）</li>
			<li>どの作物にも使うもの（燃料・機械など）：「共通」（この一覧から消えます）</li>
		</ul>
		<datalist id="crop-names">{#each cropNames as c (c)}<option value={c}></option>{/each}</datalist>
		<div class="fill-list">
			{#each list.slice(0, shown) as r (r.id)}
				<form class="fill-row" onsubmit={(e) => { e.preventDefault(); save(r.id); }}>
					<div class="fill-name">
						<button type="button" class="item-name" onclick={() => (app.modal = { kind: 'detail', id: r.id })}>{r.name}</button>
						<div class="chg-sub">{r.category}・{yen(r.total)}円{r.spec ? `・${r.spec}` : ''}</div>
					</div>
					<div class="row-form">
						<input type="text" list="crop-names" bind:value={draft[r.id]} placeholder="例：米" aria-label="{r.name}の作物" />
						<button type="submit" class="btn btn-small" disabled={saving === r.id}>保存</button>
					</div>
				</form>
			{/each}
		</div>
		{#if list.length > shown}
			<p><button type="button" class="btn" onclick={() => (shown += STEP)}>続きを表示（残り {list.length - shown}品目）</button></p>
		{/if}
	</details>
{/if}

<style>
	/* 閉じているときは1行だけ。開くと資材が縦に並ぶ */
	.crop-fill summary { cursor: pointer; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
	.crop-fill[open] summary { margin-bottom: 8px; }
	.fill-tips { margin: 4px 0 12px; padding-left: 1.2em; }
	.fill-list { display: grid; gap: 10px; }
	.fill-row { display: grid; gap: 6px; padding: 10px 0; border-top: 1px solid var(--border); }
	.fill-name { min-width: 0; }
	.fill-row input { flex: 1 1 auto; min-width: 0; }
	@media (min-width: 720px) {
		.fill-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; }
	}
</style>
