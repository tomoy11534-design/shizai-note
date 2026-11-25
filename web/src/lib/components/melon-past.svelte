<script lang="ts">
	// 去年までのお客さん：今年まだ注文がない人の一覧。案内文のコピーと、前の注文から今年の申込を作るボタン
	import { app } from '#lib/app-state.svelte.js';
	import { melon } from '#lib/melon-state.svelte.js';
	import { invitation, itemText, pastCustomers, type MelonOrder } from '#lib/melon.js';

	let { onprefill }: { onprefill: (o: MelonOrder) => void } = $props();

	let list = $derived(pastCustomers(melon.orders, melon.season));
	let farm = $derived(app.household?.name ?? '');
</script>

<div class="panel">
	<h2>去年までのお客さん（{melon.season}年はまだ注文なし）</h2>
	<p class="note">
		前の年に注文してくれた人のうち、{melon.season}年の申込がまだない人です。案内文をコピーして、LINEやメールで送れます。
		「今年の申込を作る」を押すと、前の注文の名前・住所・品物が入った状態で申込を入れられます。
	</p>
	{#each list as c (c.last.id)}
		<article class="past">
			<div>
				<b>{c.last.customer_name} 様</b>
				{#if c.last.customer_phone}<span class="chg-sub">TEL {c.last.customer_phone}</span>{/if}
			</div>
			<p class="note past-line">前の注文：{c.last.season}年 {itemText(c.last)}（注文した年：{c.seasons.map((y) => `${y}年`).join('・')}）</p>
			<div class="item-buttons">
				<button type="button" class="btn btn-small" onclick={() => melon.copy(invitation(c.last.customer_name, melon.season, farm), '案内文')}>案内文をコピー</button>
				<button type="button" class="btn btn-small" onclick={() => onprefill(c.last)}>今年の申込を作る</button>
			</div>
		</article>
	{:else}
		<p class="empty">{melon.orders.some((o) => o.season < melon.season) ? 'みんな今年も注文してくれています。' : `${melon.season}年より前の申込がまだありません。来年からここに出ます。`}</p>
	{/each}
</div>

<style>
	.past { border-top: 1px solid var(--border); padding: 10px 0; display: grid; gap: 4px; }
	.past .chg-sub { margin-left: 8px; }
	.past-line { margin: 0; }
</style>
