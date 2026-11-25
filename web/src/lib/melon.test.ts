import { describe, expect, it } from 'vitest';
import { directSummary, formatPostal, invitation, pastCustomers, seasonSummary, shippedNotice, shippingLabel, stageOf, type MelonOrder } from './melon.js';

// テスト用の申込（必要なところだけ変える）
function order(p: Partial<MelonOrder>): MelonOrder {
	return {
		id: Math.random().toString(36).slice(2),
		household_id: 'h',
		season: 2027,
		customer_name: '山田 花子',
		customer_phone: '090-1111-2222',
		customer_postal: '8680000',
		customer_address: '熊本県球磨郡多良木町1-2',
		to_same: true,
		to_name: '',
		to_phone: '',
		to_postal: '',
		to_address: '',
		product: '食べ比べセット',
		cases: 1,
		unit_price: 5000,
		ship_timing: '6月',
		paid_on: null,
		shipped_on: null,
		notified_on: null,
		memo: '',
		created_at: '2026-12-01T00:00:00Z',
		updated_at: '2026-12-01T00:00:00Z',
		...p
	};
}

describe('申込の段階', () => {
	it('入金 → 発送 → 連絡 の順に進む', () => {
		expect(stageOf(order({}))).toBe('unpaid');
		expect(stageOf(order({ paid_on: '2027-04-01' }))).toBe('unshipped');
		expect(stageOf(order({ paid_on: '2027-04-01', shipped_on: '2027-06-01' }))).toBe('unnotified');
		expect(stageOf(order({ paid_on: '2027-04-01', shipped_on: '2027-06-01', notified_on: '2027-06-01' }))).toBe('done');
	});

	it('1年分のまとめ：受付ケース数・残り・入金待ちの金額', () => {
		const s = seasonSummary([order({ cases: 2 }), order({ cases: 3, paid_on: '2027-04-01' })], 50);
		expect(s).toMatchObject({ orders: 2, cases: 5, left: 45, total: 25000, unpaidAmount: 10000 });
		expect(s.count).toEqual({ unpaid: 1, unshipped: 1, unnotified: 0, done: 0 });
	});
});

describe('送り先と連絡の文', () => {
	it('郵便番号を 123-4567 の形にそろえる', () => {
		expect(formatPostal('8680000')).toBe('868-0000');
		expect(formatPostal('８６８－００００')).toBe('868-0000');
		expect(formatPostal('不明')).toBe('不明');
	});

	it('注文した人に送るときは、お届け先だけ', () => {
		const t = shippingLabel(order({}));
		expect(t).toContain('〒868-0000');
		expect(t).toContain('山田 花子 様');
		expect(t).not.toContain('ご依頼主');
	});

	it('別の人に送るときは、ご依頼主もつける', () => {
		const o = order({ to_same: false, to_name: '佐藤 一郎', to_postal: '1000001', to_address: '東京都千代田区1-1' });
		const t = shippingLabel(o);
		expect(t.indexOf('佐藤 一郎 様')).toBeLessThan(t.indexOf('【ご依頼主】'));
		expect(t).toContain('〒100-0001');
		expect(shippedNotice(o, '球磨きむら農園')).toContain('お届け先：佐藤 一郎 様');
	});

	it('案内文に年と農園名が入る', () => {
		const t = invitation('山田 花子', 2027, '球磨きむら農園');
		expect(t).toContain('2027年');
		expect(t.endsWith('球磨きむら農園')).toBe(true);
	});
});

describe('去年までのお客さん', () => {
	it('今年まだ注文していない人だけを、いちばん新しい注文で1人1回出す', () => {
		const list = pastCustomers(
			[
				order({ season: 2025, customer_name: '山田 花子', cases: 1 }),
				order({ season: 2026, customer_name: '山田花子', cases: 2 }),
				order({ season: 2026, customer_name: '鈴木 次郎', customer_phone: '080-3333-4444' }),
				order({ season: 2027, customer_name: '鈴木 次郎', customer_phone: '08033334444' })
			],
			2027
		);
		expect(list).toHaveLength(1);
		expect(list[0].last.cases).toBe(2);
		expect(list[0].seasons).toEqual([2026, 2025]);
	});
});

describe('直売', () => {
	it('玉数と金額を足す', () => {
		const s = directSummary([
			{ id: '1', household_id: 'h', sold_on: '2027-06-01', place: '道の駅', fruits: 10, amount: 15000, memo: '', created_at: '' },
			{ id: '2', household_id: 'h', sold_on: '2027-06-02', place: '', fruits: 5, amount: 8000, memo: '', created_at: '' }
		]);
		expect(s).toEqual({ count: 2, fruits: 15, amount: 23000 });
	});
});
