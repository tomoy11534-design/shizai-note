import type { Item } from './types.js';

// 棚卸しの下書き（数えた数と、数えたときの帳簿の数）。端末に保存して、途中でやめても続きから再開できる
export interface StocktakeDraft {
	started: string;
	counts: Record<string, { counted: number; expected: number }>;
}

export const draftKey = (householdId: string) => `shizai-note-stocktake:${householdId}`;

export function emptyDraft(): StocktakeDraft {
	return { started: new Date().toISOString(), counts: {} };
}

// 下書きのうち、今もある資材の分だけを、差といっしょに返す
export function draftRows(draft: StocktakeDraft, items: Item[]) {
	return items
		.filter((item) => draft.counts[item.id])
		.map((item) => {
			const { counted, expected } = draft.counts[item.id];
			return { item, counted, expected, diff: counted - expected, moved: Number(item.stock) !== expected };
		});
}
