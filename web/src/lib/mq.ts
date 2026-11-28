// MQ会計（戦略会計）で使う、変動費（V）と固定費（F）の分け方と、前の年とのくらべ
// 分け方は農業でよく使われる例。最後は農家さん・税理士さんの考えに合わせる

export type MqClass = 'V' | 'F';

/** 固定費（F）とみなすカテゴリ。作る量が増えても、あまり変わらない費用（機械・設備・修理・道具） */
const FIXED = ['機械部品', '修理・工賃', '施設資材', '農機具・道具', '作業用品'];
/** 変動費（V）とみなすカテゴリ。作る量に合わせて増える費用（肥料・農薬・種苗・包装・被覆・燃料） */
const VARIABLE = ['肥料', '農薬', '種苗', '包装資材', '被覆資材', '燃料'];

export const MQ_LABELS: Record<MqClass, string> = { V: '変動費', F: '固定費' };

/** カテゴリの分け方（どちらとも決めていないカテゴリは null） */
export function mqClass(categoryName: string): MqClass | null {
	const name = categoryName.trim();
	if (FIXED.includes(name)) return 'F';
	if (VARIABLE.includes(name)) return 'V';
	return null;
}

/** 前の年からの増え方（%）。前の年が0やないときは null */
export function yoyPct(prev: number | undefined, cur: number | undefined): number | null {
	if (!prev || cur === undefined) return null;
	return ((cur - prev) / prev) * 100;
}

/** 「+12%」「−8%」のように書く（小さい変化は「±0%」） */
export function pctText(p: number): string {
	const r = Math.round(p);
	return r > 0 ? `+${r}%` : r < 0 ? `−${-r}%` : '±0%';
}
