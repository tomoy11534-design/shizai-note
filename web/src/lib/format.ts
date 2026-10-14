// 表示用の小さな関数

export function fmt(value: number | null | undefined, digits = 2): string {
	return Number(value || 0).toLocaleString('ja-JP', { maximumFractionDigits: digits });
}

export function yen(value: number | null | undefined): string {
	return value === null || value === undefined || !Number.isFinite(value) ? '—' : `¥${Math.round(value).toLocaleString('ja-JP')}`;
}

// +12.5 のような符号付きの数字（％なし）
export function pctPlain(value: number | null | undefined): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return '';
	return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
}

// ↑+12.5% のような短い表示
export function chgText(value: number | null | undefined): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return '—';
	return `${value > 0.05 ? '↑' : value < -0.05 ? '↓' : '→'}${pctPlain(value)}%`;
}

export function sizeText(bytes: number): string {
	const n = Number(bytes) || 0;
	return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;
}

// 2026-08 → 2026年8月
export function periodText(period: string): string {
	return period ? `${period.slice(0, 4)}年${Number(period.slice(5, 7))}月` : '';
}

// 日時を「10/14 09:30」の形にする
export function shortDateTime(iso: string | null | undefined): string {
	if (!iso) return '';
	const d = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// CSVファイルとして保存する（Excelで文字化けしないよう先頭にBOMを付ける）
export function downloadCsv(rows: (string | number | null | undefined)[][], fileName: string) {
	const cell = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
	const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
	const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
	const a = document.createElement('a');
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// CSSの色（変数）を読む。グラフの色に使う
export function cssVar(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function seriesColor(slot: number): string {
	return cssVar(`--series-${slot + 1}`);
}

export function withAlpha(hex: string, alpha: number): string {
	const h = hex.replace('#', '');
	return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${alpha})`;
}

export function errorMessage(e: unknown): string {
	if (e && typeof e === 'object' && 'message' in e) return String((e as { message: string }).message);
	return String(e);
}
