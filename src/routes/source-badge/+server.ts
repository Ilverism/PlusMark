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
	const label = `↩ ${chars.length > 48 ? `${chars.slice(0, 23).join('')}…${chars.slice(-24).join('')}` : fullLabel}`;
	// A 10px monospace label uses 6px cells without stretching the glyphs.
	const textWidth = Array.from(label).length * 6;
	const width = 29 + textWidth + 24;
	const cache = await event.platform?.caches?.open('plusmark-favicons-v1').catch(() => undefined);
	const [colors, favicon] = await Promise.all([destinationColors(returnUrl), sourceFavicon(returnUrl, cache)]);
	const title = escapeXml(`Source: ${returnUrl}`);
	const fallback = '<g transform="translate(7 4)" fill="none" stroke="#6b7280" stroke-width="1.5"><path d="M6 10l4-4M5 11H4a3 3 0 010-6h3M9 5h3a3 3 0 010 6h-1"/></g>';
	return new Response(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="24" role="img" aria-label="${title}">
<title>${title}</title><rect width="${width}" height="24" rx="12" fill="#f3f4f6"/>
<defs><clipPath id="source-label"><rect x="29" y="0" width="${textWidth + 2}" height="24"/></clipPath></defs>
${favicon ? `<image x="7" y="4" width="16" height="16" href="${favicon}"/>` : fallback}
<text x="29" y="15.5" clip-path="url(#source-label)" font-family="ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', monospace" font-size="10" fill="#111827">${escapeXml(label)}</text>
${destinationDot(colors, width - 12)}</svg>`, {
		headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'max-age=0, no-cache, no-store, must-revalidate' }
	});
};
