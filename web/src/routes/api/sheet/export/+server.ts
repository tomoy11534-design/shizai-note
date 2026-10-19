// スプレッドシートの Apps Script に、在庫一覧と履歴を渡す（農園の合言葉が必要）
import { buildExport, householdFromToken } from '#lib/server/sheet-sync.js';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 60 };

export const GET: RequestHandler = async ({ request }) => {
	const householdId = await householdFromToken(request);
	if (!householdId) return Response.json({ ok: false, message: '合言葉が違います。資材ノートの設定タブで発行した合言葉を入れてください。' }, { status: 401 });
	try {
		return Response.json(await buildExport(householdId));
	} catch (e) {
		return Response.json({ ok: false, message: e instanceof Error ? e.message : String(e) }, { status: 500 });
	}
};
