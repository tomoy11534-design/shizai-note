<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, onclose, children }: { title: string; onclose: () => void; children: Snippet } = $props();

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window {onkeydown} />

<div class="modal">
	<button type="button" class="modal-backdrop" aria-label="閉じる" onclick={onclose}></button>
	<div class="modal-body" role="dialog" aria-modal="true" aria-label={title}>
		<div class="modal-head">
			<h2>{title}</h2>
			<button type="button" class="icon-btn" aria-label="閉じる" onclick={onclose}>✕</button>
		</div>
		{@render children()}
	</div>
</div>
