// 定期実行：毎朝、注意が必要な資材をメールで知らせる
import { isCronRequest, runDailyNotify } from '#lib/server/jobs.js';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 60 };

export const GET: RequestHandler = async ({ request }) => {
	if (!isCronRequest(request)) return new Response('Unauthorized', { status: 401 });
	return Response.json(await runDailyNotify());
};
