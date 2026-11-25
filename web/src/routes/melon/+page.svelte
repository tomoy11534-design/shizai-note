<script lang="ts">
	// 贈答メロン帳：贈答用メロンの申込・入金・発送・連絡と、去年のお客さん、直売の記録
	// ログインと農園（家族）は資材ノートと同じものを使う。画面は資材ノートと分けて、迷わないようにする
	import { onMount } from 'svelte';
	import { app } from '#lib/app-state.svelte.js';
	import HouseholdSetup from '#lib/components/household-setup.svelte';
	import LoginView from '#lib/components/login-view.svelte';
	import MelonDirect from '#lib/components/melon-direct.svelte';
	import MelonOrderForm from '#lib/components/melon-order-form.svelte';
	import MelonOrders from '#lib/components/melon-orders.svelte';
	import MelonPast from '#lib/components/melon-past.svelte';
	import Modal from '#lib/components/modal.svelte';
	import { melon } from '#lib/melon-state.svelte.js';
	import type { MelonOrder } from '#lib/melon.js';

	type MelonTab = 'orders' | 'past' | 'direct';
	const TABS: { id: MelonTab; icon: string; label: string }[] = [
		{ id: 'orders', icon: '📦', label: '申込' },
		{ id: 'past', icon: '💌', label: '去年のお客さん' },
		{ id: 'direct', icon: '🏪', label: '直売' }
	];
	let tab = $state<MelonTab>('orders');
	// 申込の入力欄（id があれば直す、prefill があれば前の注文を下書きにして新しく入れる）
	let form = $state<{ id?: string; prefill?: MelonOrder } | null>(null);

	onMount(() => {
		void app.initAuth();
	});

	// 農園が決まったら、メロンのデータを読む
	$effect(() => {
		if (app.householdId) void melon.load();
	});

	function prefill(o: MelonOrder) {
		form = { prefill: o };
	}
</script>

<svelte:head><title>贈答メロン帳</title></svelte:head>

{#if !app.authReady}
	<p class="loading">読み込んでいます…</p>
{:else if !app.session && !app.demo}
	<header class="app-header"><h1>贈答メロン帳</h1></header>
	<LoginView />
{:else if !app.householdId}
	<header class="app-header"><h1>贈答メロン帳</h1></header>
	<HouseholdSetup />
{:else}
	<header class="app-header">
		<h1>贈答メロン帳</h1>
		<div class="header-right">
			<label class="season">
				<span class="visually-hidden">受付の年</span>
				<select bind:value={melon.season}>
					{#each melon.seasons as y (y)}<option value={y}>{y}年</option>{/each}
				</select>
			</label>
			<a class="header-link" href={app.demo ? '/?demo' : '/'}>資材ノート</a>
		</div>
	</header>

	{#if app.demo}
		<div class="demo-banner" role="note">
			<span>デモ版です。見本のデータで自由に操作できます（保存はされず、開き直すと元に戻ります）。</span>
		</div>
	{/if}

	<div class="tabs" role="tablist" aria-label="画面の切り替え">
		{#each TABS as t (t.id)}
			<button type="button" role="tab" aria-selected={tab === t.id} class:active={tab === t.id} onclick={() => { tab = t.id; window.scrollTo(0, 0); }}>
				<span class="tab-icon" aria-hidden="true">{t.icon}</span>{t.label}
			</button>
		{/each}
	</div>

	<main class="container melon">
		{#if !melon.loaded}
			<p class="loading">データを読み込んでいます…</p>
		{:else if melon.error}
			<div class="panel"><p>{melon.error}</p></div>
		{:else if tab === 'orders'}
			<MelonOrders onedit={(id) => (form = { id })} />
		{:else if tab === 'past'}
			<MelonPast onprefill={(o) => { prefill(o); }} />
		{:else}
			<MelonDirect />
		{/if}
	</main>

	{#if form}
		<Modal title={form.id ? '申込を直す' : form.prefill ? `今年の申込：${form.prefill.customer_name} 様` : '申込を入れる'} onclose={() => (form = null)}>
			{#key JSON.stringify(form)}
				<MelonOrderForm id={form.id} prefill={form.prefill} onclose={() => (form = null)} />
			{/key}
		</Modal>
	{/if}

	{#if melon.copyFallback}
		{@const c = melon.copyFallback}
		<Modal title="{c.title}（長押ししてコピー）" onclose={() => (melon.copyFallback = null)}>
			<p class="note">自動でコピーできませんでした。下の文字を長押しして全部選び、コピーしてください。</p>
			<textarea class="copy-text" readonly rows="10" value={c.text}></textarea>
		</Modal>
	{/if}
{/if}

<style>
	/* 見出しの右：年の切り替えと、資材ノートへ戻るリンク */
	.season select { background: rgba(255, 255, 255, 0.15); color: #fff; border-color: rgba(255, 255, 255, 0.5); font-weight: bold; width: auto; }
	.season option { color: initial; }
	.melon { max-width: 760px; }
	.copy-text { width: 100%; box-sizing: border-box; font: inherit; }
	.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
