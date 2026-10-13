import { badgePalette, type BadgeTheme } from '$lib/badge-theme';
import type { RequestHandler } from '@sveltejs/kit';
import { getReactionDocumentStub, parseDocAndReaction } from '$lib/server/reaction-service';
import { formatReactionCount } from '$lib/reaction-count';
import { destinationColors, destinationDot, escapeXml } from '$lib/destination-marker';

const BADGE_HEADERS = {
	'content-type': 'image/svg+xml; charset=utf-8',
	'cache-control': 'max-age=0, no-cache, no-store, must-revalidate',
};

export const GET: RequestHandler = async (event) => {
	const parsed = parseDocAndReaction(event);

	if (parsed instanceof Response) {
		const { error } = await parsed.json() as { error: string };
		return svgBadgeResponse('?', error, parsed.status);
	}

	// Cache only throttled snapshots, ahead of the Durable Object lookup. Keep
	// downstream no-cache headers so Camo does not acquire another freshness delay.
	const cache = await event.platform?.caches?.open('plusmark-badges-v3').catch(() => undefined);
	const cacheUrl = new URL('/_plusmark-badge-cache/v3', event.url);
	cacheUrl.searchParams.set('doc', parsed.doc);
	cacheUrl.searchParams.set('r', parsed.reaction);
	const cacheKey = new Request(cacheUrl);
	const cached = await cache?.match(cacheKey).catch(() => undefined);
	if (cached && Number(cached.headers.get('x-plusmark-refresh-at')) > Date.now()) {
		return new Response(cached.body, { headers: BADGE_HEADERS });
	}

	const stub = await getReactionDocumentStub(event, parsed.doc);
	const result = await stub.getBadge(parsed.reaction);

	if (!result.ok) {
		return svgBadgeResponse('?', result.message, result.status);
	}

	const colors = await destinationColors(result.returnUrl);
	const response = svgBadgeResponse(result.reaction.emoji, formatReactionCount(result.reaction.count), 200, result.reaction.label, result.throttled, colors, result.returnUrl, result.badgeTheme);
	const ttl = Math.floor((result.refreshAt - Date.now()) / 1000);
	if (cache && result.throttled && ttl > 0) {
		const snapshot = response.clone();
		snapshot.headers.set('cache-control', `public, max-age=${ttl}`);
		snapshot.headers.set('x-plusmark-refresh-at', String(result.refreshAt));
		const write = cache.put(cacheKey, snapshot).catch(() => undefined);
		if (event.platform?.ctx) event.platform.ctx.waitUntil(write);
		else await write;
	}
	return response;
};

function svgBadgeResponse(emoji: string, text: string, status: number, label = 'PlusMark reaction', throttled = false, colors?: [string, string], returnUrl = '', theme: BadgeTheme = 'light'): Response {
	const palette = badgePalette(theme);
	const display = `${emoji} ${text}`;
	const contentWidth = Math.max(54, Math.min(260, 36 + Array.from(text).length * 9));
	const markerWidth = colors ? 16 : 0;
	const width = contentWidth + (throttled ? 16 : 0) + markerWidth;
	const escapedDisplay = escapeXml(display);
	const escapedLabel = escapeXml(label);
	const delayNote = throttled ? ' — count updates delayed during high traffic' : '';
	const sourceNote = returnUrl ? ` — Source: ${escapeXml(returnUrl)}` : '';

	return new Response(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="24" role="img" aria-label="${escapedLabel} ${escapedDisplay}${delayNote}${sourceNote}">
<title>${escapedLabel} ${escapedDisplay}${delayNote}${sourceNote}</title>
<defs>
  <clipPath id="emoji-slot"><rect x="3" y="0" width="24" height="24"/></clipPath>
  <clipPath id="count-slot"><rect x="29" y="0" width="${contentWidth - 35}" height="24"/></clipPath>
  <filter id="emoji-shadow" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
    <feDropShadow dx="0" dy="0.6" stdDeviation="0.7" flood-color="#000" flood-opacity="0.3"/>
  </filter>
</defs>
<rect x="0.5" y="0.5" width="${width - 1}" height="23" rx="11.5" fill="${palette.background}" stroke="${palette.border}"/>
<g font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="14" fill="${palette.text}">
  <g clip-path="url(#emoji-slot)"><text x="7" y="17" filter="url(#emoji-shadow)">${escapeXml(emoji)}</text></g>
  <g clip-path="url(#count-slot)"><text x="29" y="17">${escapeXml(text)}</text></g>
</g>
${colors ? destinationDot(colors, width - 12) : ''}
${throttled ? `<g data-throttled="true" transform="translate(${width - markerWidth - 15} 6)" fill="none" stroke="${palette.muted}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M1 0h8M1 12h8M2 0v2c0 2 6 6 6 8v2M8 0v2c0 2-6 6-6 8v2"/>
  <path d="M3 10h4"/>
</g>` : ''}
</svg>`,
		{ status, headers: BADGE_HEADERS }
	);
}
