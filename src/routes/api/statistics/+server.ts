import { dev } from '$app/environment';
import { json, type RequestHandler } from '@sveltejs/kit';
import { devStatistics } from '$lib/server/dev-statistics';
import type { ServiceStatistics } from '$lib/server/service-statistics';

export const GET: RequestHandler = async (event) => {
	if (dev) return json(devStatistics, { headers: { 'cache-control': 'no-store' } });
	const cache = await event.platform?.caches?.open('plusmark-statistics-v1').catch(() => undefined);
	const key = new Request(new URL('/api/statistics', event.url));
	const cached = await cache?.match(key).catch(() => undefined);
	if (cached) return cached;
	try {
		const namespace = event.platform?.env.SERVICE_STATISTICS;
		if (!namespace) throw new Error('Missing statistics binding');
		const stub = namespace.getByName('global') as unknown as Pick<ServiceStatistics, 'getTotals'>;
		const response = json(await stub.getTotals(), { headers: { 'cache-control': 'public, max-age=60' } });
		if (cache) {
			const write = cache.put(key, response.clone()).catch(() => undefined);
			if (event.platform?.ctx) event.platform.ctx.waitUntil(write);
			else await write;
		}
		return response;
	} catch {
		return json({ error: 'Statistics temporarily unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } });
	}
};
