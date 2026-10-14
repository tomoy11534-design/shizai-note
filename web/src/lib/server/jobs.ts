// 定期実行の処理（全国データの取得・毎日のメール通知）
import { APP_URL, CRON_SECRET } from '$app/env/private';
import { addDays, todayJst } from '../calc.js';
import { sendMail } from './mail.js';
import { findMachineReadableUrl, MAFF_PAGE_URL, parseMaffWorkbook, type ParsedSeries } from './maff.js';
import { adminClient } from './supabase-admin.js';

// Vercel Cron からの呼び出しかを確かめる
export function isCronRequest(request: Request) {
	return Boolean(CRON_SECRET) && request.headers.get('authorization') === `Bearer ${CRON_SECRET}`;
}

// 農園ごとの家族のメールアドレス
async function memberEmails(householdIds: string[]) {
	const { data } = await adminClient().from('household_members').select('household_id, email').in('household_id', householdIds);
	const map = new Map<string, string[]>();
	for (const m of data ?? []) map.set(m.household_id, [...(map.get(m.household_id) ?? []), m.email]);
	return map;
}

/**
 * 全国データを取得して保存する
 * 新しい月のデータが入ったら、希望している農園にメールで知らせる
 */
export async function runPublicFetch() {
	const db = adminClient();
	const { data: state } = await db.from('app_state').select('*').eq('id', 1).single();
	try {
		const url = state?.public_source_url || findMachineReadableUrl(await (await fetch(MAFF_PAGE_URL)).text());
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Excelファイルを取得できませんでした（HTTP ${res.status}）。`);
		const { series, latest } = parseMaffWorkbook(new Uint8Array(await res.arrayBuffer()));
		if (!series.length) throw new Error('データを読み取れませんでした。');

		const now = new Date().toISOString();
		for (let i = 0; i < series.length; i += 50) {
			const { error } = await db.from('public_series').upsert(series.slice(i, i + 50).map((s) => ({ ...s, updated_at: now })));
			if (error) throw new Error(`保存に失敗しました：${error.message}`);
		}
		await db.from('app_state').update({ public_last_fetch: now, public_last_status: '成功', public_latest_period: latest }).eq('id', 1);

		if (state?.public_latest_period && latest > state.public_latest_period) await notifyPublicUpdate(series, latest);
		return { ok: true, message: `${latest.replace('-', '年')}月分までのデータを取得しました。` };
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		await db.from('app_state').update({ public_last_fetch: new Date().toISOString(), public_last_status: `失敗：${message}` }).eq('id', 1);
		return { ok: false, message };
	}
}

async function notifyPublicUpdate(series: ParsedSeries[], latest: string) {
	const names = ['農業生産資材総合', '肥料', '農業薬剤', '諸材料', '光熱動力', '農機具'];
	const prevPeriod = `${Number(latest.slice(0, 4)) - 1}${latest.slice(4)}`;
	const lines = names
		.map((n) => {
			const s = series.find((x) => x.key === `idx:${n}`);
			if (!s?.data[latest] || !s.data[prevPeriod]) return null;
			const pct = (s.data[latest] / s.data[prevPeriod] - 1) * 100;
			return `・${n}：${s.data[latest]}（前年同月比 ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%）`;
		})
		.filter(Boolean);
	if (!lines.length) return;

	const { data: households } = await adminClient().from('households').select('id').eq('public_notify', true);
	const emails = await memberEmails((households ?? []).map((h) => h.id));
	const to = [...new Set([...emails.values()].flat())];
	if (!to.length) return;
	// 宛先が見えないよう1人ずつ送る
	for (const addr of to) {
		await sendMail(
			[addr],
			`【資材ノート】農業物価指数（${latest}）が公表されました`,
			'農林水産省「農業物価統計調査」の農業生産資材価格指数（2020年＝100）が更新されました。\n\n' +
				`${lines.join('\n')}\n\n※ 最新の値は速報値（概数値）です。\n\nアプリを開く：${APP_URL}\n`
		);
	}
}

// 毎朝の通知：発注が必要な資材・使用期限が近い資材を知らせる
export async function runDailyNotify() {
	const db = adminClient();
	const { data: households } = await db.from('households').select('*').eq('notify_enabled', true);
	if (!households?.length) return { sent: 0 };
	const emails = await memberEmails(households.map((h) => h.id));
	const today = todayJst();
	let sent = 0;

	for (const h of households) {
		const { data: items } = await db.from('items').select('name, unit, stock, reorder_level, expiry').eq('household_id', h.id);
		const limit = addDays(today, h.alert_days);
		const order: string[] = [];
		const expiry: string[] = [];
		for (const item of items ?? []) {
			const stock = Number(item.stock) || 0;
			if (stock <= 0) order.push(`・${item.name}：在庫切れ`);
			else if (item.reorder_level !== null && stock <= Number(item.reorder_level)) {
				order.push(`・${item.name}：残り${stock}${item.unit}（目安 ${item.reorder_level}${item.unit}）`);
			}
			if (item.expiry && item.expiry < today) expiry.push(`・${item.name}：期限切れ（${item.expiry}）`);
			else if (item.expiry && item.expiry <= limit) expiry.push(`・${item.name}：期限間近（${item.expiry}）`);
		}
		if (!order.length && !expiry.length) continue;

		let body = `${h.name}の資材についてのお知らせです。\n\n`;
		if (order.length) body += `■ 発注が必要な資材\n${order.join('\n')}\n\n`;
		if (expiry.length) body += `■ 使用期限に注意が必要な資材\n${expiry.join('\n')}\n\n`;
		body += `アプリを開く：${APP_URL}\n`;
		if (await sendMail(emails.get(h.id) ?? [], `【資材ノート】注意が必要な資材が${order.length + expiry.length}件あります`, body)) sent++;
	}
	return { sent };
}
