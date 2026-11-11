// AIアプリ（ChatGPT・Gemini・Claude など）に聞いて、資材の辞書の下書きを作る
// アプリからAIは呼ばない（無料で使えるよう、質問文をコピーしてAIアプリに貼ってもらう）
import { DICT_FIELDS } from './dictionary.js';

export type DictKey = (typeof DICT_FIELDS)[number]['key'];

export interface Draft {
	fields: Record<DictKey, string>;
	// 調べた元のページ
	sources: string[];
}

// 答えの見出し（AIが少し違う書き方をしても読めるよう、別の言い方も受け付ける）
const HEADINGS: { key: DictKey | 'sources'; names: string[] }[] = [
	{ key: 'features', names: ['特徴'] },
	{ key: 'how_to_use', names: ['使い方', '使用方法'] },
	{ key: 'cautions', names: ['注意点', '注意事項', '使用上の注意'] },
	{ key: 'crops', names: ['対象の作物', '対象作物', '適用作物'] },
	{ key: 'sources', names: ['調べた元', '出典', '参考', '参考URL', '情報源'] }
];

const NAME_PATTERN = HEADINGS.flatMap((h) => h.names)
	.sort((a, b) => b.length - a.length)
	.join('|');
// 「【特徴】…」「特徴：…」「**特徴**：…」「## 特徴」などを見出しとして読む
const HEADING_RE = new RegExp(
	`^\\s*(?:#{1,6}\\s*)?(?:[■●◆・\\-*]\\s*)?(?:【\\s*(${NAME_PATTERN})\\s*】|\\*{0,2}(${NAME_PATTERN})\\*{0,2}\\s*(?:[：:]|$))\\s*\\**\\s*(.*)$`
);
const URL_RE = /https?:\/\/[^\s<>"'（）()「」\[\]]+/g;
// 「([サイト名](https://…))」のような、AIアプリからコピーしたときに付くリンク
const MD_LINK_RE = /\(?\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)\)?/g;

// AIアプリに貼る質問文
export function buildPrompt(item: { name: string; spec: string }, categoryName: string): string {
	const name = item.spec ? `${item.name}（${item.spec}）` : item.name;
	return [
		`農業資材「${name}」について調べて、次の形式だけで答えてください。${categoryName ? `種類は「${categoryName}」です。` : ''}`,
		'メーカーの公式ページや、農薬なら農薬登録情報など、確かな情報をもとにしてください。分からない項目は「不明」と書いてください。',
		'',
		'【特徴】成分・効き方など（200字以内）',
		'【使い方】量・倍率・時期など（300字以内）',
		'【注意点】混ぜてはいけないもの・保管など（200字以内）',
		'【対象の作物】作物名を「、」で区切って',
		'【調べた元】参考にしたページのURL（1行に1つ）'
	].join('\n');
}

// 見出しの名前から、どの欄かを決める
function keyOf(name: string) {
	return HEADINGS.find((h) => h.names.includes(name))?.key;
}

// 文章を整える（太字の記号を外し、「不明」は空にする）
function clean(text: string): string {
	const t = text
		.replace(/\*\*/g, '')
		.replace(/^\s*[-*]\s+/gm, '・')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	return /^(不明|なし|情報なし|-|—)[。.]?$/.test(t) ? '' : t;
}

// 作物の区切りを「、」にそろえる
function cleanCrops(text: string): string {
	return clean(text)
		.split(/[、,，・\/／\n]+/)
		.map((c) => c.replace(/^[\s・]+|[\s。]+$/g, ''))
		.filter((c) => c && c !== '不明')
		.join('、');
}

// AIの答えを欄ごとに分ける。見出しが1つも見つからなければ null
export function parseAnswer(answer: string): Draft | null {
	const sources: string[] = [];
	// 本文の中のリンクは、調べた元として集めて本文からは外す
	const text = answer.replace(/\r\n?/g, '\n').replace(MD_LINK_RE, (_m, _title, url: string) => {
		sources.push(url);
		return '';
	});

	const parts = new Map<string, string[]>();
	let current: string | undefined;
	for (const line of text.split('\n')) {
		const m = line.match(HEADING_RE);
		const key = m ? keyOf(m[1] ?? m[2]) : undefined;
		if (m && key) {
			current = key;
			parts.set(key, [...(parts.get(key) ?? []), m[3]]);
		} else if (current) {
			parts.get(current)!.push(line);
		}
	}
	if (!parts.size) return null;

	const fields = {} as Record<DictKey, string>;
	for (const f of DICT_FIELDS) {
		const raw = (parts.get(f.key) ?? []).join('\n');
		fields[f.key] = (f.key === 'crops' ? cleanCrops(raw) : clean(raw)).slice(0, f.max);
	}
	// 調べた元の欄にURLがなければ、答え全体からURLを探す
	const sourceText = (parts.get('sources') ?? []).join('\n');
	sources.push(...(sourceText.match(URL_RE) ?? []));
	if (!sources.length) sources.push(...(text.match(URL_RE) ?? []));
	return { fields, sources: [...new Set(sources.map((u) => u.replace(/[。、.,]+$/, '')))].slice(0, 10) };
}

// 調べた元をメモの最後に足す（1000字に収まる分だけ）
export function memoWithSources(memo: string, sources: string[], max = 1000): string {
	const fresh = sources.filter((u) => !memo.includes(u));
	if (!fresh.length) return memo;
	let out = memo.trimEnd() + (memo.trim() ? '\n' : '') + '【辞書の調べた元】';
	for (const u of fresh) {
		if ((out + '\n' + u).length > max) break;
		out += '\n' + u;
	}
	return out.endsWith('【辞書の調べた元】') ? memo : out;
}

// 農薬かどうか（倍率・回数などは公式の登録情報で確かめてもらう）
export function isPesticide(categoryName: string, usage: string): boolean {
	return /農薬/.test(categoryName) || ['病害虫防除', '除草', '生育調整'].includes(usage);
}

// 自分で調べるためのリンク
export function searchLinks(item: { name: string; spec: string }, pesticide: boolean) {
	const q = encodeURIComponent(`${item.name} ${item.spec} ${pesticide ? '農薬 適用表' : '使い方'}`.replace(/\s+/g, ' ').trim());
	return [
		{ label: 'Googleで調べる', href: `https://www.google.com/search?q=${q}` },
		...(pesticide ? [{ label: '農薬登録情報（農林水産省）', href: 'https://pesticide.maff.go.jp/' }] : [])
	];
}

// 質問を貼るAIアプリ
export const AI_APPS = [
	{ label: 'ChatGPT', href: 'https://chatgpt.com/' },
	{ label: 'Gemini', href: 'https://gemini.google.com/' },
	{ label: 'Claude', href: 'https://claude.ai/new' }
];
