import { describe, expect, it } from 'vitest';
import { buildPrompt, isPesticide, memoWithSources, parseAnswer, searchLinks } from './ai-draft.js';

describe('質問文', () => {
	it('資材名・規格・カテゴリと、答えの形を入れる', () => {
		const p = buildPrompt({ name: '高度化成肥料', spec: '20KG' }, '肥料');
		expect(p).toContain('「高度化成肥料（20KG）」');
		expect(p).toContain('「肥料」');
		expect(p).toContain('【対象の作物】');
	});
});

describe('AIの答えを欄に分ける', () => {
	it('【見出し】の形を読む', () => {
		const d = parseAnswer(
			[
				'【特徴】窒素・リン酸・カリが各8%。',
				'【使い方】元肥として10aあたり4袋。',
				'土とよく混ぜる。',
				'【注意点】不明',
				'【対象の作物】トマト, ナス／キュウリ',
				'【調べた元】',
				'https://example.com/a',
				'https://example.com/b。'
			].join('\n')
		)!;
		expect(d.fields.features).toBe('窒素・リン酸・カリが各8%。');
		expect(d.fields.how_to_use).toBe('元肥として10aあたり4袋。\n土とよく混ぜる。');
		expect(d.fields.cautions).toBe('');
		expect(d.fields.crops).toBe('トマト、ナス、キュウリ');
		expect(d.sources).toEqual(['https://example.com/a', 'https://example.com/b']);
	});

	it('太字や「：」、見出しだけの行、本文中のリンクも読む', () => {
		const d = parseAnswer(
			[
				'はい、調べました。',
				'**特徴**：殺虫剤です ([メーカー](https://maker.example/p))',
				'## 使い方',
				'- 1000倍に薄めて散布',
				'- 収穫7日前まで',
				'注意事項: 蚕に影響あり',
				'適用作物：水稲'
			].join('\n')
		)!;
		expect(d.fields.features).toBe('殺虫剤です');
		expect(d.fields.how_to_use).toBe('・1000倍に薄めて散布\n・収穫7日前まで');
		expect(d.fields.cautions).toBe('蚕に影響あり');
		expect(d.fields.crops).toBe('水稲');
		expect(d.sources).toEqual(['https://maker.example/p']);
	});

	it('見出しがなければ読めない', () => {
		expect(parseAnswer('すみません、分かりませんでした。')).toBeNull();
	});

	it('長すぎる答えは欄の上限で切る', () => {
		const d = parseAnswer(`【特徴】${'あ'.repeat(1200)}`)!;
		expect(d.fields.features).toHaveLength(1000);
	});
});

describe('メモに調べた元を残す', () => {
	it('今のメモの後ろに足し、すでにあるURLは足さない', () => {
		expect(memoWithSources('', ['https://a'])).toBe('【辞書の調べた元】\nhttps://a');
		expect(memoWithSources('メモ', ['https://a'])).toBe('メモ\n【辞書の調べた元】\nhttps://a');
		expect(memoWithSources('https://a', ['https://a'])).toBe('https://a');
	});

	it('上限を超えるときは入る分だけ。1つも入らなければそのまま', () => {
		expect(memoWithSources('x'.repeat(990), ['https://example.com/long'])).toBe('x'.repeat(990));
	});
});

describe('農薬の判定と調べるリンク', () => {
	it('カテゴリか用途区分で農薬と判断し、農薬なら登録情報のリンクも出す', () => {
		expect(isPesticide('農薬', '')).toBe(true);
		expect(isPesticide('その他', '除草')).toBe(true);
		expect(isPesticide('肥料', '土づくり・施肥')).toBe(false);
		expect(searchLinks({ name: 'バスタ液', spec: '' }, true)).toHaveLength(2);
		expect(searchLinks({ name: '化成肥料', spec: '20KG' }, false)[0].href).toContain(encodeURIComponent('化成肥料 20KG 使い方'));
	});
});
