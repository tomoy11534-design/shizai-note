<script lang="ts">
	// 贈答用メロンの申込を入れる・直す。prefill は「去年のお客さんから今年の申込を作る」ときの下書き
	import { untrack } from 'svelte';
	import { app } from '#lib/app-state.svelte.js';
	import { errorMessage } from '#lib/format.js';
	import { melon, type OrderInput } from '#lib/melon-state.svelte.js';
	import type { MelonOrder } from '#lib/melon.js';

	let { id, prefill, onclose }: { id?: string; prefill?: MelonOrder; onclose: () => void } = $props();

	// 開いたときの内容で入力欄を作る（最初の1回だけ読む）
	const src = untrack(() => melon.find(id) ?? prefill);
	const editId = untrack(() => id);
	let f = $state<OrderInput>({
		season: untrack(() => melon.season),
		customer_name: src?.customer_name ?? '',
		customer_phone: src?.customer_phone ?? '',
		customer_postal: src?.customer_postal ?? '',
		customer_address: src?.customer_address ?? '',
		to_same: src?.to_same ?? true,
		to_name: src?.to_name ?? '',
		to_phone: src?.to_phone ?? '',
		to_postal: src?.to_postal ?? '',
		to_address: src?.to_address ?? '',
		product: src?.product ?? '',
		cases: src?.cases ?? 1,
		unit_price: src?.unit_price ?? 5000,
		ship_timing: src?.ship_timing ?? '',
		paid_on: editId ? (src?.paid_on ?? null) : null,
		shipped_on: editId ? (src?.shipped_on ?? null) : null,
		notified_on: editId ? (src?.notified_on ?? null) : null,
		memo: editId ? (src?.memo ?? '') : ''
	});
	if (editId && src) f.season = src.season;
	let saving = $state(false);
	let confirmDelete = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!f.customer_name.trim()) return app.toast('注文した人の名前を入れてください。', true);
		saving = true;
		try {
			await melon.saveOrder({ ...f, customer_name: f.customer_name.trim(), cases: Math.max(1, Math.round(Number(f.cases) || 1)), unit_price: Math.max(0, Math.round(Number(f.unit_price) || 0)) }, id);
			app.toast(id ? '申込を直しました。' : `${f.customer_name.trim()} 様の申込を入れました。`);
			onclose();
		} catch (err) {
			app.toast(errorMessage(err), true);
		} finally {
			saving = false;
		}
	}

	async function remove() {
		if (!id) return;
		try {
			await melon.deleteOrder(id);
			app.toast('申込を消しました。');
			onclose();
		} catch (err) {
			app.toast(errorMessage(err), true);
		}
	}

	// 日付の欄を空にできるように（空文字は null として保存する）
	const dateValue = (v: string | null) => v ?? '';
	const setDate = (k: 'paid_on' | 'shipped_on' | 'notified_on', v: string) => (f[k] = v || null);
</script>

<form class="form-grid" autocomplete="off" onsubmit={submit}>
	<p class="form-section full">注文した人</p>
	<label class="field full"><span>名前<span class="req">必須</span></span><input bind:value={f.customer_name} maxlength="100" required /></label>
	<label class="field half"><span>電話番号</span><input type="tel" bind:value={f.customer_phone} maxlength="30" /></label>
	<label class="field half"><span>郵便番号</span><input inputmode="numeric" bind:value={f.customer_postal} maxlength="10" placeholder="例：8680000" /></label>
	<label class="field full"><span>住所</span><input bind:value={f.customer_address} maxlength="200" /></label>

	<div class="field full">
		<span>お届け先</span>
		<div class="seg" role="group" aria-label="お届け先">
			<button type="button" class:active={f.to_same} onclick={() => (f.to_same = true)}>注文した人と同じ</button>
			<button type="button" class:active={!f.to_same} onclick={() => (f.to_same = false)}>別の人に送る</button>
		</div>
	</div>
	{#if !f.to_same}
		<label class="field full"><span>送る相手の名前</span><input bind:value={f.to_name} maxlength="100" /></label>
		<label class="field half"><span>電話番号</span><input type="tel" bind:value={f.to_phone} maxlength="30" /></label>
		<label class="field half"><span>郵便番号</span><input inputmode="numeric" bind:value={f.to_postal} maxlength="10" /></label>
		<label class="field full"><span>住所</span><input bind:value={f.to_address} maxlength="200" /></label>
	{/if}

	<p class="form-section full">品物</p>
	<label class="field full"><span>品物の名前</span><input bind:value={f.product} list="melon-products" maxlength="50" placeholder="例：食べ比べセット" /></label>
	<label class="field half"><span>箱数</span><input type="number" min="1" inputmode="numeric" bind:value={f.cases} /></label>
	<label class="field half"><span>1箱の値段（円）</span><input type="number" min="0" inputmode="numeric" bind:value={f.unit_price} /></label>
	<label class="field half"><span>発送の時期</span><input bind:value={f.ship_timing} list="melon-timings" maxlength="30" placeholder="例：6月" /></label>
	<p class="field half note">合計 {(Math.max(1, Number(f.cases) || 1) * (Number(f.unit_price) || 0)).toLocaleString('ja-JP')}円</p>

	{#if id}
		<p class="form-section full">進み具合（空にすると「まだ」に戻ります）</p>
		<label class="field half"><span>入金した日</span><input type="date" value={dateValue(f.paid_on)} onchange={(e) => setDate('paid_on', e.currentTarget.value)} /></label>
		<label class="field half"><span>発送した日</span><input type="date" value={dateValue(f.shipped_on)} onchange={(e) => setDate('shipped_on', e.currentTarget.value)} /></label>
		<label class="field half"><span>連絡した日</span><input type="date" value={dateValue(f.notified_on)} onchange={(e) => setDate('notified_on', e.currentTarget.value)} /></label>
	{/if}
	<label class="field full"><span>メモ</span><input bind:value={f.memo} maxlength="500" placeholder="例：のし希望、日付指定あり" /></label>

	<div class="form-actions full">
		<button type="submit" class="btn btn-primary" disabled={saving}>{id ? '直す' : '申込を入れる'}</button>
		<button type="button" class="btn" onclick={onclose}>閉じる</button>
	</div>
	{#if id}
		<div class="form-actions full">
			{#if confirmDelete}
				<span class="note">この申込を消しますか？（元に戻せません）</span>
				<button type="button" class="btn btn-danger" onclick={remove}>消す</button>
				<button type="button" class="btn" onclick={() => (confirmDelete = false)}>やめる</button>
			{:else}
				<button type="button" class="btn btn-danger btn-small" onclick={() => (confirmDelete = true)}>この申込を消す</button>
			{/if}
		</div>
	{/if}
	<datalist id="melon-products">{#each melon.products as p (p)}<option value={p}></option>{/each}</datalist>
	<datalist id="melon-timings">{#each melon.timings as t (t)}<option value={t}></option>{/each}</datalist>
</form>
