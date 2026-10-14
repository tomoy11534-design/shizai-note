// 定期実行：全国データ（農業物価統計調査）を取得する（毎月1日・15日）
import { isCronRequest, runPublicFetch } from '#lib/server/jobs.js';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 60 };

export const GET: RequestHandler = async ({ request }) => {
	if (!isCronRequest(request)) return new Response('Unauthorized', { status: 401 });
	return Response.json(await runPublicFetch());
};
