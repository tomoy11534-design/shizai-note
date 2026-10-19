import type { Item } from './types.js';

// 資材の辞書の項目（入力欄・表示・検索で共通に使う）
export const DICT_FIELDS = [
	{ key: 'features', label: '特徴', max: 1000, rows: 2, placeholder: '例：窒素・リン酸・カリが各8%。ゆっくり効く' },
	{ key: 'how_to_use', label: '使い方', max: 1000, rows: 3, placeholder: '例：植え付けの2週間前に10aあたり4袋。土とよく混ぜる' },
	{ key: 'cautions', label: '注意点', max: 1000, rows: 2, placeholder: '例：石灰と同時にまかない。湿気を避けて保管' },
	{ key: 'crops', label: '対象の作物', max: 200, rows: 1, placeholder: '例：トマト、ナス、キュウリ' }
] as const satisfies readonly { key: keyof Item; label: string; max: number; rows: number; placeholder: string }[];

// 辞書がひとつでも入力されているか
export function hasDictionary(item: Item) {
	return DICT_FIELDS.some((f) => item[f.key]);
}

// 検索用に、辞書の内容をひとつの文字列にまとめる
export function dictionaryText(item: Item) {
	return DICT_FIELDS.map((f) => item[f.key]).join(' ');
}
