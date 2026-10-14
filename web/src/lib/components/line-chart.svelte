<script lang="ts">
	import { Chart, registerables, type ChartConfiguration } from 'chart.js';

	Chart.register(...registerables);

	// Chart.js のグラフ。config が変わったら描き直す
	let { config, label, tall = false }: { config: ChartConfiguration; label: string; tall?: boolean } = $props();
	let canvas: HTMLCanvasElement;

	$effect(() => {
		Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
		const chart = new Chart(canvas, config);
		return () => chart.destroy();
	});
</script>

<div class="chart-box" class:tall><canvas bind:this={canvas} aria-label={label}></canvas></div>
