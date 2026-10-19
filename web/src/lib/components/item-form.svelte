<script lang="ts">
	import { untrack } from 'svelte';
	import { app } from '#lib/app-state.svelte.js';
	import { findSimilarCategory } from '#lib/category.js';
	import { DICT_FIELDS } from '#lib/dictionary.js';
	import { yen } from '#lib/format.js';
	import type { Item } from '#lib/types.js';
	import PublicRefSelect from './public-ref-select.svelte';

	// 資材の登録・編集
	let { id }: { id: string | null } = $props();

	const UNITS = ['袋', '本', '箱', '枚', '個', '巻', '缶', 'kg', 'L', 'ml', 'm'];

	function toForm(item: Item | undefined) {
		return {
			name: item?.name ?? '',
			spec: item?.spec ?? '',
			product_code: item?.product_code ?? '',
			category_id: item?.category_id ?? app.categories[0]?.id ?? '',
			unit: item?.unit ?? '',
			stock: item?.stock ?? 0,
			price: item?.price ?? 0,
			reorder_level: item?.reorder_level === null || item?.reorder_level === undefined ? '' : String(item.reorder_level),
			expiry: item?.expiry ?? '',
			supplier: item?.supplier ?? '',
			public_ref: item?.public_ref ?? '',
			purpose: item?.purpose ?? '',
			memo: item?.memo ?? '',
			features: item?.features ?? '',
			how_to_use: item?.how_to_use ?? '',
			cautions: item?.cautions ?? '',
			crops: item?.crops ?? ''
		};
	}

	// 開いたときの内容で入力欄を作る（ほかの人の更新で勝手に書き換わらないよう、最初の1回だけ読む）
	const original = untrack(() => (id ? app.findItem(id) : undefined));
	let form = $state(toForm(original));
	let expected = $state(original?.updated_at ?? null);
	let conflict = $state('');
	let saving = $state(false);

	// カテゴリをその場で追加する
	const NEW_CATEGORY = '__new__';
	let addingCategory = $state(false);
	let newCategory = $state('');
	let similar = $derived(findSimilarCategory(newCategory, app.categories));

	function pickCategory(e: Event & { currentTarget: HTMLSelectElement }) {
		if (e.currentTarget.value !== NEW_CATEGORY) {
			form.category_id = e.currentTarget.value;
			return;
		}
		// 「＋ 新しいカテゴリを追加…」は選んだままにせず、入力欄に切り替える
		e.currentTarget.value = form.category_id;
		newCategory = '';
		addingCategory = true;
	}

	function useCategory(id: string) {
		form.category_id = id;
		addingCategory = false;
	}

	async function addCategory() {
		const name = newCategory.trim();
		if (!name) return app.toast('カテゴリ名を入力してください。', true);
		if (similar?.same) return useCategory(similar.category.id);
		try {
			const added = await app.addCategory(name);
			useCategory(added.id);
			app.toast(`カテゴリ「${added.name}」を追加しました。`);
		} catch {
			// お知らせ済み
		}
	}

	// 入力欄で Enter を押しても、資材の保存ではなくカテゴリの追加にする
	function onCategoryKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.isComposing) {
			e.preventDefault();
			addCategory();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			addingCategory = false;
		}
	}

	// 変更内容を人が読める形にまとめる（履歴のメモに残す）
	function describe(before: ReturnType<typeof toForm>, after: ReturnType<typeof toForm>) {
		const labels: Record<string, string> = { name: '資材名', spec: '規格', product_code: '品名コード', category_id: 'カテゴリ', unit: '単位', stock: '在庫', price: '単価', reorder_level: '発注の目安', expiry: '使用期限', supplier: '購入先', public_ref: '比較データ', purpose: '用途', memo: 'メモ', ...Object.fromEntries(DICT_FIELDS.map((f) => [f.key, f.label])) };
		// 長い文章の欄は「〜を変更」とだけ残す
		const longText = ['memo', 'purpose', 'public_ref', ...DICT_FIELDS.map((f) => f.key)];
		const show = (k: string, v: unknown) => (k === 'category_id' ? app.categoryName(String(v)) : v === '' ? '（なし）' : String(v));
		return Object.keys(labels)
			.filter((k) => String(before[k as keyof typeof before]) !== String(after[k as keyof typeof after]))
			.map((k) => (longText.includes(k) ?`${labels[k]}を変更` : `${labels[k]} ${show(k, before[k as keyof typeof before])}→${show(k, after[k as keyof typeof after])}`))
			.join('、');
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!form.name.trim()) return app.toast('資材名を入力してください。', true);
		saving = true;
		try {
			const before = toForm(id ? app.findItem(id) : undefined);
			const res = await app.saveItem({ id: id ?? undefined, ...form, reorder_level: form.reorder_level === '' ? null : Number(form.reorder_level) } as Partial<Item>, expected, id ? describe(before, form) : '');
			if (res.conflict && res.item) {
				// ほかの人が先に更新していた
				expected = res.item.updated_at;
				conflict = `${app.memberName(res.item.updated_by)}さんが先に更新しています。最新の内容を表示しました。確認してから、もう一度保存してください。`;
				form = toForm(res.item);
				return;
			}
			app.modal = null;
			app.toast(id ? '更新しました。' : '登録しました。');
		} catch {
			// お知らせ済み
		} finally {
			saving = false;
		}
	}

	async function remove() {
		if (!id || !(await app.confirm(`「${form.name}」を削除しますか？\n価格の履歴は残ります。`, '削除する'))) return;
		await app.deleteItem(id).then(() => {
			app.modal = null;
			app.toast('削除しました。');
		}, () => undefined);
	}
</script>

<form class="form-grid" autocomplete="off" onsubmit={submit}>
	{#if conflict}<div class="conflict full">{conflict}</div>{/if}
	<label class="field full"><span>資材名<span class="req">必須</span></span><input bind:value={form.name} required maxlength="100" placeholder="例：化成肥料 8-8-8" /></label>
	<label class="field half"><span>規格 <small>容量・サイズ・型番など</small></span><input bind:value={form.spec} maxlength="100" placeholder="例：20KG、500ML" /></label>
	<label class="field half"><span>品名コード <small>JAの明細のコード</small></span><input bind:value={form.product_code} maxlength="30" inputmode="numeric" placeholder="例：10900315" /></label>
	{#if addingCategory}
		<div class="field full">
			<label for="new-category"><span>新しいカテゴリ</span></label>
			<div class="row-form">
				<!-- svelte-ignore a11y_autofocus -->
				<input id="new-category" bind:value={newCategory} onkeydown={onCategoryKey} maxlength="30" placeholder="例：土壌改良材" autofocus />
				<button type="button" class="btn btn-primary" onclick={addCategory} disabled={!newCategory.trim()}>{similar?.same ? 'そちらを使う' : '追加'}</button>
				<button type="button" class="btn" onclick={() => (addingCategory = false)}>やめる</button>
			</div>
			{#if similar}
				<p class="conflict" role="status">
					{similar.same ? `「${similar.category.name}」がすでにあります。` : `似た名前の「${similar.category.name}」があります。`}
					{#if !similar.same}<button type="button" class="btn btn-small" onclick={() => useCategory(similar!.category.id)}>「{similar.category.name}」を使う</button>{/if}
				</p>
			{/if}
		</div>
	{:else}
		<label class="field half"><span>カテゴリ</span>
			<select value={form.category_id} onchange={pickCategory}>
				{#each app.categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
				<option value={NEW_CATEGORY}>＋ 新しいカテゴリを追加…</option>
			</select>
		</label>
	{/if}
	<label class="field half"><span>単位</span><input bind:value={form.unit} list="unit-list" maxlength="20" placeholder="例：袋" /></label>
	<label class="field"><span>在庫数</span><input type="number" min="0" step="any" inputmode="decimal" bind:value={form.stock} /></label>
	<label class="field"><span>単価（円）</span><input type="number" min="0" step="any" inputmode="decimal" bind:value={form.price} /></label>
	<div class="field half"><span>合計金額（自動計算）</span><output class="calc">{yen((Number(form.stock) || 0) * (Number(form.price) || 0))}</output></div>
	<label class="field half"><span>発注の目安 <small>この数以下で「残りわずか」</small></span><input type="number" min="0" step="any" inputmode="decimal" bind:value={form.reorder_level} placeholder="空欄なら知らせない" /></label>
	<label class="field half"><span>使用期限</span><input type="date" bind:value={form.expiry} /></label>
	<label class="field half"><span>購入先</span><input bind:value={form.supplier} list="supplier-list" maxlength="100" placeholder="例：JA" /></label>
	<label class="field half"><span>比べる全国データ</span><PublicRefSelect bind:value={form.public_ref} withInherit /></label>
	<label class="field full"><span>用途 <small>何のために使うか</small></span><textarea bind:value={form.purpose} rows="2" maxlength="1000" placeholder="例：トマトの元肥。10aあたり4袋"></textarea></label>
	<p class="form-section full"><b>資材の辞書</b>　特徴や使い方を書いておくと、説明書タブで一覧・検索できます</p>
	{#each DICT_FIELDS as f (f.key)}
		<label class="field full"><span>{f.label}</span>
			{#if f.rows === 1}
				<input bind:value={form[f.key]} maxlength={f.max} placeholder={f.placeholder} />
			{:else}
				<textarea bind:value={form[f.key]} rows={f.rows} maxlength={f.max} placeholder={f.placeholder}></textarea>
			{/if}
		</label>
	{/each}
	<label class="field full"><span>メモ</span><textarea bind:value={form.memo} rows="2" maxlength="1000"></textarea></label>
	<div class="form-actions full">
		<button type="submit" class="btn btn-primary" disabled={saving}>{id ? '更新する' : '登録する'}</button>
		{#if id}<button type="button" class="btn btn-danger" onclick={remove}>削除</button>{/if}
		<button type="button" class="btn" onclick={() => (app.modal = null)}>キャンセル</button>
	</div>
	{#if !id}<p class="note full">登録したときの在庫は、購入金額や価格の計算には入りません。価格の履歴は「入庫」や「過去の購入」で記録します。</p>{/if}
	<datalist id="unit-list">{#each UNITS as u (u)}<option value={u}></option>{/each}</datalist>
	<datalist id="supplier-list">{#each app.suppliers as s (s)}<option value={s}></option>{/each}</datalist>
</form>
