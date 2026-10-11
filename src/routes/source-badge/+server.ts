import { error, type RequestHandler } from '@sveltejs/kit';
import { normalizeDocId } from '$lib/widget';
import { getReactionDocumentStub } from '$lib/server/reaction-service';
import { destinationColors, destinationDot, escapeXml } from '$lib/server/destination-marker';
import { sourceFavicon } from '$lib/server/source-favicon';

export const GET: RequestHandler = async (event) => {
	const doc = normalizeDocId(event.url.searchParams.get('doc') ?? '');
	if (!doc) error(400, 'A valid doc query parameter is required.');
	const result = await (await getReactionDocumentStub(event, doc)).getWidget();
	if (!result.ok) error(result.status, result.message);
	const returnUrl = result.widget.returnUrl;
	const url = new URL(returnUrl);
	const fullLabel = `${url.host}${url.pathname === '/' ? '' : url.pathname}${url.search}${url.hash}`;
	const chars = Array.from(fullLabel);
	const label = chars.length > 48 ? `${chars.slice(0, 23).join('')}…${chars.slice(-24).join('')}` : fullLabel;
	const textWidth = Math.max(40, Array.from(label).length * 7);
	const width = 34 + textWidth + 26;
	const cache = await event.platform?.caches?.open('plusmark-favicons-v1').catch(() => undefined);
	const [colors, favicon] = await Promise.all([destinationColors(returnUrl), sourceFavicon(returnUrl, cache)]);
	const title = escapeXml(`Source: ${returnUrl}`);
	const fallback = '<g transform="translate(10 4)" fill="none" stroke="#6b7280" stroke-width="1.5"><path d="M6 10l4-4M5 11H4a3 3 0 010-6h3M9 5h3a3 3 0 010 6h-1"/></g>';
	return new Response(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="24" role="img" aria-label="${title}">
<title>${title}</title><rect width="${width}" height="24" rx="12" fill="#f3f4f6"/>
${favicon ? `<image x="10" y="4" width="16" height="16" href="${favicon}"/>` : fallback}
<text x="34" y="16" textLength="${textWidth}" lengthAdjust="spacingAndGlyphs" font-family="system-ui, sans-serif" font-size="12" fill="#111827">${escapeXml(label)}</text>
${destinationDot(colors, width - 10)}</svg>`, {
		headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'max-age=0, no-cache, no-store, must-revalidate' }
	});
};
