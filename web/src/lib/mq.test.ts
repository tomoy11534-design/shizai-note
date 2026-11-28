import { describe, expect, it } from 'vitest';
import { mqClass, pctText, yoyPct } from './mq.js';

describe('MQ会計の分け方', () => {
	it('肥料・農薬・燃料などは変動費、機械・修理・道具は固定費、その他は決めない', () => {
		expect(mqClass('肥料')).toBe('V');
		expect(mqClass('燃料')).toBe('V');
		expect(mqClass('修理・工賃')).toBe('F');
		expect(mqClass('農機具・道具')).toBe('F');
		expect(mqClass('その他')).toBeNull();
	});

	it('前の年からの増え方', () => {
		expect(yoyPct(100, 112)).toBeCloseTo(12);
		expect(yoyPct(0, 50)).toBeNull();
		expect(yoyPct(undefined, 50)).toBeNull();
		expect(pctText(12.4)).toBe('+12%');
		expect(pctText(-8.6)).toBe('−9%');
		expect(pctText(0.3)).toBe('±0%');
	});
});
