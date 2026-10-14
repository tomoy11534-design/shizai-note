// メール送信（Resend のAPIを使う。設定がなければ送らない）
import { MAIL_FROM, RESEND_API_KEY } from '$app/env/private';

export function mailEnabled() {
	return Boolean(RESEND_API_KEY && MAIL_FROM);
}

export async function sendMail(to: string[], subject: string, text: string) {
	if (!mailEnabled() || !to.length) return false;
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ from: MAIL_FROM, to, subject, text })
	});
	if (!res.ok) throw new Error(`メールを送れませんでした（${res.status}）：${await res.text()}`);
	return true;
}
