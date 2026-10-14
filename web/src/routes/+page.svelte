<script lang="ts">
	import { onMount } from 'svelte';
	import { app, type Tab } from '#lib/app-state.svelte.js';
	import HistoryTab from '#lib/components/history-tab.svelte';
	import HouseholdSetup from '#lib/components/household-setup.svelte';
	import ItemDetail from '#lib/components/item-detail.svelte';
	import ItemForm from '#lib/components/item-form.svelte';
	import LoginView from '#lib/components/login-view.svelte';
	import ManualTab from '#lib/components/manual-tab.svelte';
	import Modal from '#lib/components/modal.svelte';
	import MoveForm from '#lib/components/move-form.svelte';
	import PastForm from '#lib/components/past-form.svelte';
	import PriceTab from '#lib/components/price-tab.svelte';
	import RenameCategoryForm from '#lib/components/rename-category-form.svelte';
	import SettingsTab from '#lib/components/settings-tab.svelte';
	import StockTab from '#lib/components/stock-tab.svelte';
	import SummaryTab from '#lib/components/summary-tab.svelte';
	import UploadForm from '#lib/components/upload-form.svelte';

	const TABS: { id: Tab; icon: string; label: string }[] = [
		{ id: 'stock', icon: '📦', label: '在庫' },
		{ id: 'price', icon: '📈', label: '価格' },
		{ id: 'manual', icon: '📎', label: '説明書' },
		{ id: 'history', icon: '📝', label: '履歴' },
		{ id: 'summary', icon: '📊', label: '集計' },
		{ id: 'settings', icon: '⚙', label: '設定' }
	];

	onMount(() => {
		void app.initAuth();
	});

	// 小窓の題名
	let modalTitle = $derived.by(() => {
		const m = app.modal;
		if (!m) return '';
		const name = 'id' in m && m.id ? (m.kind === 'rename-category' ? '' : (app.findItem(m.id)?.name ?? '')) : '';
		switch (m.kind) {
			case 'item':
				return m.id ? '資材を編集' : '資材を登録';
			case 'move':
				return `${m.move}：${name}`;
			case 'past':
				return `過去の購入：${name}`;
			case 'detail':
				return name || '資材の詳細';
			case 'upload':
				return `説明書を追加：${name}`;
			case 'rename-category':
				return 'カテゴリ名の変更';
		}
	});

	let syncText = $derived.by(() => {
		if (app.pending > 0) return '保存中…';
		if (!app.lastLoaded) return '読み込み中…';
		const d = new Date(app.lastLoaded);
		return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 更新`;
	});
</script>

{#if !app.authReady}
	<p class="loading">読み込んでいます…</p>
{:else if !app.session}
	<header class="app-header"><h1>資材ノート</h1></header>
	<LoginView />
{:else if !app.householdId}
	<header class="app-header"><h1>資材ノート</h1></header>
	<HouseholdSetup />
{:else}
	<header class="app-header">
		<h1>{app.household?.name ?? '資材ノート'}</h1>
		<div class="header-right">
			<span class="sync" aria-live="polite">{syncText}</span>
			<button type="button" class="icon-btn" title="最新に更新" aria-label="最新に更新" onclick={() => app.loadHousehold()}>⟳</button>
		</div>
	</header>

	<div class="tabs" role="tablist" aria-label="画面の切り替え">
		{#each TABS as t (t.id)}
			<button type="button" role="tab" aria-selected={app.ui.tab === t.id} class:active={app.ui.tab === t.id} onclick={() => { app.setTab(t.id); window.scrollTo(0, 0); }}>
				<span class="tab-icon" aria-hidden="true">{t.icon}</span>{t.label}
			</button>
		{/each}
	</div>

	<main class="container">
		{#if !app.loaded}
			<p class="loading">データを読み込んでいます…</p>
		{:else if app.ui.tab === 'stock'}
			<StockTab />
		{:else if app.ui.tab === 'price'}
			<PriceTab />
		{:else if app.ui.tab === 'manual'}
			<ManualTab />
		{:else if app.ui.tab === 'history'}
			<HistoryTab />
		{:else if app.ui.tab === 'summary'}
			<SummaryTab />
		{:else}
			<SettingsTab />
		{/if}
	</main>

	{#if app.modal}
		{@const m = app.modal}
		<Modal title={modalTitle} onclose={() => (app.modal = null)}>
			{#key JSON.stringify(m)}
				{#if m.kind === 'item'}<ItemForm id={m.id} />
				{:else if m.kind === 'move'}<MoveForm id={m.id} kind={m.move} />
				{:else if m.kind === 'past'}<PastForm id={m.id} />
				{:else if m.kind === 'detail'}<ItemDetail id={m.id} />
				{:else if m.kind === 'upload'}<UploadForm id={m.id} back={m.back} />
				{:else if m.kind === 'rename-category'}<RenameCategoryForm id={m.id} />{/if}
			{/key}
		</Modal>
	{/if}
{/if}
