// グラフ（Chart.js）の設定を作る
import type { ChartConfiguration, ChartDataset, TooltipItem } from 'chart.js';
import { publicYearAvg, type Purchase, type YearStats } from './calc.js';
import { cssVar, fmt, seriesColor, withAlpha, yen } from './format.js';
import type { Item, PublicSeries } from './types.js';

interface PricePoint {
	x: number;
	y: number | null;
	p?: Purchase;
	unit?: string;
}

type DS = ChartDataset<'line' | 'scatter', PricePoint[]> & { isPoints?: boolean };

export interface PriceSource {
	item: Item;
	slot: number;
	stats: YearStats | undefined;
	purchases: Purchase[];
	series: PublicSeries | null;
}

export function baseOptions(yTitle?: string, yFormat?: (v: number | string) => string) {
	const text2 = cssVar('--text-2');
	const grid = cssVar('--grid');
	return {
		responsive: true,
		maintainAspectRatio: false,
		animation: false as const,
		interaction: { mode: 'nearest' as const, intersect: false },
		plugins: {
			legend: { position: 'bottom' as const, labels: { color: text2, usePointStyle: true, boxWidth: 8, boxHeight: 8 } },
			tooltip: {}
		},
		scales: {
			x: { grid: { color: grid }, ticks: { color: text2 } },
			y: {
				grid: { color: grid },
				ticks: { color: text2, callback: yFormat },
				title: { display: !!yTitle, text: yTitle ?? '', color: text2 }
			}
		}
	};
}

/**
 * 価格推移のグラフ
 * mode = 'yen'：年平均単価（線）と各購入（点）。品目別の全国平均価格があれば点線で重ねる
 * mode = 'index'：最初の年＝100にそろえた自分の価格（実線）と全国の値（点線）
 */
export function priceChart(sources: PriceSource[], mode: 'yen' | 'index', lastYear: number, withPublicYen = false): ChartConfiguration | null {
	let minYear = lastYear;
	for (const s of sources) for (const y of Object.keys(s.stats ?? {}).map(Number)) minYear = Math.min(minYear, y);
	minYear = Math.max(minYear, lastYear - 9);
	const years: number[] = [];
	for (let y = minYear; y <= lastYear; y++) years.push(y);

	const datasets: DS[] = [];
	const usedPublic = new Set<string>();
	for (const s of sources) {
		const color = seriesColor(s.slot);
		const ys = s.stats ?? {};
		const own = years.filter((y) => ys[y]).map((y) => ({ x: y, y: ys[y].avg }));
		if (!own.length) continue;

		if (mode === 'yen') {
			datasets.push({ type: 'line', label: s.item.name, data: own, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6 });
			const points = s.purchases
				.filter((p) => p.year >= minYear && p.year <= lastYear)
				// 年の中での位置（月）がわかるよう、少し左右にずらす
				.map((p) => ({ x: p.year + (p.month ? ((p.month - 6.5) / 12) * 0.8 : 0), y: p.price, p, unit: s.item.unit }));
			datasets.push({
				type: 'scatter',
				label: `${s.item.name}（各購入）`,
				data: points,
				backgroundColor: withAlpha(color, 0.35),
				borderColor: color,
				borderWidth: 1,
				pointRadius: 3,
				pointHoverRadius: 5,
				isPoints: true
			});
			if (withPublicYen && s.series?.kind === 'item') {
				const pub = years.map((y) => ({ x: y, y: publicYearAvg(s.series, y) })).filter((o) => o.y);
				if (pub.length) {
					const c2 = seriesColor(s.slot + 1);
					datasets.push({ type: 'line', label: `全国平均：${s.series.name}（${s.series.unit}）`, data: pub, borderColor: c2, backgroundColor: c2, borderDash: [6, 4], borderWidth: 2, pointRadius: 3, pointStyle: 'rectRot' });
				}
			}
		} else {
			const base = own[0];
			datasets.push({
				type: 'line',
				label: s.item.name,
				data: own.map((o) => ({ x: o.x, y: base.y ? ((o.y ?? 0) / base.y) * 100 : null })),
				borderColor: color,
				backgroundColor: color,
				borderWidth: 2,
				pointRadius: 4,
				pointHoverRadius: 6
			});
			if (s.series && !usedPublic.has(s.series.key)) {
				usedPublic.add(s.series.key);
				const pubBase = publicYearAvg(s.series, base.x);
				const pub = years
					.filter((y) => y >= base.x)
					.map((y) => ({ x: y, y: pubBase ? ((publicYearAvg(s.series, y) ?? 0) / pubBase) * 100 : null }))
					.filter((o) => o.y);
				if (pub.length) {
					const label = s.series.kind === 'idx' ? s.series.name : `${s.series.name}（${s.series.unit}）`;
					datasets.push({ type: 'line', label: `全国：${label}`, data: pub, borderColor: color, backgroundColor: color, borderDash: [6, 4], borderWidth: 2, pointRadius: 3, pointStyle: 'rectRot' });
				}
			}
		}
	}
	if (!datasets.length) return null;

	const options = baseOptions(mode === 'yen' ? '円' : '指数', mode === 'yen' ? (v) => `¥${Number(v).toLocaleString('ja-JP')}` : (v) => String(v));
	return {
		type: 'line',
		data: { datasets: datasets as ChartDataset<'line', PricePoint[]>[] },
		options: {
			...options,
			scales: {
				...options.scales,
				x: {
					...options.scales.x,
					type: 'linear',
					min: minYear - 0.5,
					max: lastYear + 0.5,
					ticks: { ...options.scales.x.ticks, stepSize: 1, callback: (v) => (Number.isInteger(v) ? `${v}年` : '') }
				}
			},
			plugins: {
				...options.plugins,
				legend: {
					...options.plugins.legend,
					labels: { ...options.plugins.legend.labels, filter: (item, data) => !(data.datasets[item.datasetIndex ?? 0] as DS).isPoints }
				},
				tooltip: {
					callbacks: {
						title: (items: TooltipItem<'line'>[]) => {
							const raw = items[0].raw as PricePoint;
							return raw.p ? (raw.p.event.date_precision === 'year' ? `${raw.p.year}年` : raw.p.event.event_date) : `${Math.round(items[0].parsed.x ?? 0)}年`;
						},
						label: (ctx: TooltipItem<'line'>) => {
							const raw = ctx.raw as PricePoint;
							const name = String(ctx.dataset.label ?? '').replace('（各購入）', '');
							if (raw.p) return `${name}：${yen(raw.p.price)} × ${fmt(raw.p.qty)}${raw.unit ?? ''}${raw.p.event.supplier ? `（${raw.p.event.supplier}）` : ''}`;
							return `${name}：${mode === 'yen' ? `${yen(ctx.parsed.y)}（年平均）` : (ctx.parsed.y ?? 0).toFixed(1)}`;
						}
					}
				}
			}
		}
	} as ChartConfiguration;
}

// カテゴリ別の資材費の変動率（年ごとの棒グラフ）
export function categoryChart(rows: { label: string; values: { pct: number | null; n: number }[] }[], years: number[]): ChartConfiguration {
	const colors = [cssVar('--ordinal-1'), cssVar('--ordinal-2'), cssVar('--ordinal-3')];
	const options = baseOptions('前年比（%）', (v) => `${v}%`);
	return {
		type: 'bar',
		data: {
			labels: rows.map((r) => r.label),
			datasets: years.map((y, i) => ({
				label: `${y}年`,
				data: rows.map((r) => r.values[i].pct),
				backgroundColor: colors[i],
				borderRadius: 4,
				borderSkipped: false,
				maxBarThickness: 28
			}))
		},
		options: {
			...options,
			interaction: { mode: 'index', intersect: false },
			plugins: {
				...options.plugins,
				tooltip: {
					callbacks: {
						label: (ctx) => {
							const v = rows[ctx.dataIndex].values[ctx.datasetIndex];
							return `${years[ctx.datasetIndex]}年：${v.pct === null ? 'データなし' : `${v.pct > 0 ? '+' : ''}${v.pct.toFixed(1)}%（${v.n}品目）`}`;
						}
					}
				}
			}
		}
	} as ChartConfiguration;
}

// 全国の価格指数（月ごと）
export function indexChart(selected: { series: PublicSeries; slot: number }[], startYear: number): ChartConfiguration {
	const periods = new Set<string>();
	for (const s of selected) for (const k of Object.keys(s.series.data)) if (Number(k.slice(0, 4)) >= startYear) periods.add(k);
	const labels = [...periods].sort();
	const options = baseOptions('指数（2020年＝100）', (v) => String(v));
	return {
		type: 'line',
		data: {
			labels: labels.map((k) => `${k.slice(0, 4)}/${Number(k.slice(5))}`),
			datasets: selected.map((s) => ({
				label: s.series.name,
				data: labels.map((k) => s.series.data[k] ?? null),
				borderColor: seriesColor(s.slot),
				backgroundColor: seriesColor(s.slot),
				borderWidth: 2,
				pointRadius: 0,
				pointHoverRadius: 5,
				spanGaps: true
			}))
		},
		options: {
			...options,
			interaction: { mode: 'index', intersect: false },
			scales: { ...options.scales, x: { ...options.scales.x, ticks: { ...options.scales.x.ticks, maxTicksLimit: 12 } } },
			plugins: {
				...options.plugins,
				tooltip: {
					callbacks: {
						label: (ctx) => {
							const s = selected[ctx.datasetIndex].series;
							return `${s.name}：${ctx.parsed.y}${s.prov.includes(labels[ctx.dataIndex]) ? '（速報）' : ''}`;
						}
					}
				}
			}
		}
	} as ChartConfiguration;
}
