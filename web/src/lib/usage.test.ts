import { describe, expect, it } from 'vitest';
import { guessCrop, guessUsage, splitCrops } from './usage.js';

describe('用途区分', () => {
	it('品名で決まるものは、カテゴリより品名を優先する', () => {
		expect(guessUsage('バスタ液', '農薬')).toBe('除草');
		expect(guessUsage('アドマイヤー1粒', '種苗')).toBe('病害虫防除');
		expect(guessUsage('エンジンオイル', '燃料')).toBe('機械の整備・修理');
		expect(guessUsage('球磨茶ペットボトル', 'その他')).toBe('飲食（農業以外）');
	});

	it('品名で決まらなければカテゴリから決め、どちらでもなければ空', () => {
		expect(guessUsage('ベストガード粒', '農薬')).toBe('病害虫防除');
		expect(guessUsage('軽油(配達)', '燃料')).toBe('燃料');
		expect(guessUsage('ふしぎな品物', 'その他')).toBe('');
	});
});

describe('作物', () => {
	it('品名に書いてある作物を返す', () => {
		expect(guessCrop('水稲種子 くまさんの輝き')).toBe('米');
		expect(guessCrop('担)フルスロットル箱粒剤')).toBe('米');
		expect(guessCrop('アンデスメロンシール')).toBe('メロン');
		expect(guessCrop('胡瓜苗 瑞穂×昇竜')).toBe('キュウリ');
	});

	it('作物と紛らわしい品名は作物にしない', () => {
		expect(guessCrop('稲荷鹿薄鎌片刃180mm')).toBe('');
		expect(guessCrop('肥後培土(バラ)0.5立米')).toBe('');
		expect(guessCrop('米ぬか15kg(人吉共栄)')).toBe('');
		expect(guessCrop('森のくまさんペットボトル')).toBe('');
		expect(guessCrop('しいたけ菌種駒 クリタケ')).toBe('');
	});

	it('対象の作物を1つずつに分ける', () => {
		expect(splitCrops('トマト、ナス・キュウリ')).toEqual(['トマト', 'ナス', 'キュウリ']);
		expect(splitCrops('')).toEqual([]);
	});
});
