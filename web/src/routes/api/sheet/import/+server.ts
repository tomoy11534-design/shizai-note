// スプレッドシートの Apps Script から、明細の表を受け取って取り込む（農園の合言葉が必要）
import { householdFromToken, importStatement, type SheetTable } from '#lib/server/sheet-sync.js';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 60 };

export const POST: RequestHandler = async ({ request }) => {
	const householdId = await householdFromToken(request);
	if (!householdId) return Response.json({ ok: false, message: '合言葉が違います。資材ノートの設定タブで発行した合言葉を入れてください。' }, { status: 401 });
	const body = (await request.json().catch(() => null)) as { tables?: SheetTable[] } | null;
	if (!Array.isArray(body?.tables)) return Response.json({ ok: false, message: '送られてきた内容が正しくありません。' }, { status: 400 });
	try {
		return Response.json(await importStatement(householdId, body.tables));
	} catch (e) {
		return Response.json({ ok: false, message: e instanceof Error ? e.message : String(e) }, { status: 500 });
	}
};
