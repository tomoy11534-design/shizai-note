import type { Category } from './types.js';

// 表記揺れを比べるために名前をそろえる（全角半角・大文字小文字・空白・カタカナとひらがな）
export function categoryKey(name: string) {
	return name
		.normalize('NFKC')
		.toLowerCase()
		.replace(/\s+/g, '')
		.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

// 1文字だけ違う（入れ替え・追加・削除）かどうか
function oneEditApart(a: string, b: string) {
	if (Math.abs(a.length - b.length) > 1) return false;
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
	return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

// 追加しようとしている名前と、同じ・似ているカテゴリを探す
export function findSimilarCategory(name: string, categories: Category[]): { category: Category; same: boolean } | null {
	const key = categoryKey(name);
	if (!key) return null;
	const same = categories.find((c) => categoryKey(c.name) === key);
	if (same) return { category: same, same: true };
	const near = categories.find((c) => {
		const k = categoryKey(c.name);
		// 短い名前どうしは偶然1文字違うことが多いので、3文字以上のときだけ比べる
		if (Math.min(k.length, key.length) >= 3 && oneEditApart(k, key)) return true;
		return Math.min(k.length, key.length) >= 2 && (k.includes(key) || key.includes(k));
	});
	return near ? { category: near, same: false } : null;
}
