import { badgePalette } from '$lib/badge-theme';
// GitHub Octicons (MIT); license is beside the bundled asset.
import githubMark from '$lib/assets/github-mark.svg?raw';
import { error, type RequestHandler } from '@sveltejs/kit';
import { normalizeDocId } from '$lib/widget';
import { getReactionDocumentStub } from '$lib/server/reaction-service';
import { destinationColors, destinationDot, escapeXml } from '$lib/destination-marker';
import { sourceFavicon } from '$lib/server/source-favicon';

export const GET: RequestHandler = async (event) => {
	const doc = normalizeDocId(event.url.searchParams.get('doc') ?? '');
	if (!doc) error(400, 'A valid doc query parameter is required.');
	const result = await (await getReactionDocumentStub(event, doc)).getWidget();
	if (!result.ok) error(result.status, result.message);
	const returnUrl = result.widget.returnUrl;
	const palette = badgePalette(result.widget.badgeTheme);
	const url = new URL(returnUrl);
	const isGitHub = url.hostname === 'github.com' || url.hostname === 'www.github.com';
	const fullLabel = `${url.host}${url.pathname === '/' ? '' : url.pathname}${url.search}${url.hash}`;
	const chars = Array.from(fullLabel);
	const label = `↩ ${chars.length > 48 ? `${chars.slice(0, 23).join('')}…${chars.slice(-24).join('')}` : fullLabel}`;
	// A 10px monospace label uses 6px cells without stretching the glyphs.
	const textWidth = Array.from(label).length * 6;
	const width = 29 + textWidth + 24;
	const cache = isGitHub ? undefined : await event.platform?.caches?.open('plusmark-favicons-v1').catch(() => undefined);
	const [colors, favicon] = await Promise.all([destinationColors(returnUrl), isGitHub ? null : sourceFavicon(returnUrl, cache)]);
	const title = escapeXml(`Source: ${returnUrl}`);
	const fallback = `<g transform="translate(7 4)" fill="none" stroke="${palette.muted}" stroke-width="1.5"><path d="M6 10l4-4M5 11H4a3 3 0 010-6h3M9 5h3a3 3 0 010 6h-1"/></g>`;
	const icon = isGitHub
		? `<g transform="translate(7 4)" fill="${palette.text}">${githubMark}</g>`
		: favicon ? `<image x="7" y="4" width="16" height="16" href="${favicon}"/>` : fallback;
	return new Response(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="24" role="img" aria-label="${title}">
<title>${title}</title><rect x="0.5" y="0.5" width="${width - 1}" height="23" rx="11.5" fill="${palette.background}" stroke="${palette.border}"/>
<defs><clipPath id="source-label"><rect x="29" y="0" width="${textWidth + 2}" height="24"/></clipPath></defs>
${icon}
<text x="29" y="15.5" clip-path="url(#source-label)" font-family="ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', monospace" font-size="10" fill="${palette.text}">${escapeXml(label)}</text>
${destinationDot(colors, width - 12)}</svg>`, {
		headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'max-age=0, no-cache, no-store, must-revalidate' }
	});
};
