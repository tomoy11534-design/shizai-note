<script lang="ts">
	import { DICT_FIELDS, hasDictionary } from '#lib/dictionary.js';
	import type { Item } from '#lib/types.js';

	// 資材の辞書（入力済みの項目だけ表示する）
	let { item, emptyText = '辞書は未入力です（「編集」から入力できます）' }: { item: Item; emptyText?: string } = $props();
</script>

{#if hasDictionary(item)}
	<dl class="dict">
		{#each DICT_FIELDS as f (f.key)}
			{#if item[f.key]}
				<dt>{f.label}</dt>
				<dd>{item[f.key]}</dd>
			{/if}
		{/each}
	</dl>
{:else}
	<p class="purpose empty-purpose">{emptyText}</p>
{/if}
