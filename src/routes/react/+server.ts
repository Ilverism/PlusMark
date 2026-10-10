import { error, redirect, type RequestHandler } from '@sveltejs/kit';
import {
	getReactionDocumentStub,
	getVoterHash,
	parseDocAndReaction
} from '$lib/server/reaction-service';

const REACTION_HEADERS = {
	'cache-control': 'no-store',
	'x-robots-tag': 'noindex, nofollow'
};

// Override SvelteKit's HEAD-to-GET fallback without touching voter state.
export const HEAD: RequestHandler = () => new Response(null, { status: 204, headers: REACTION_HEADERS });

export const GET: RequestHandler = async (event) => {
	event.setHeaders(REACTION_HEADERS);
	// Only explicit speculation signals are ignored; ordinary link clicks still work.
	const speculative = ['sec-purpose', 'purpose', 'x-purpose', 'x-moz'].some(header =>
		event.request.headers.get(header)?.toLowerCase().split(/[\s,;]+/).some(value =>
			value === 'prefetch' || value === 'prerender'
		)
	);
	if (speculative) return new Response(null, { status: 204 });

	const parsed = parseDocAndReaction(event);

	if (parsed instanceof Response) {
		const { error: message } = await parsed.json() as { error: string };
		error(parsed.status, message);
	}

	const voterHash = await getVoterHash(event, parsed.doc);
	const stub = await getReactionDocumentStub(event, parsed.doc);
	const result = await stub.toggleReaction(parsed.reaction, voterHash, event.request.headers.get('referer'));

	if (!result.ok) {
		if (result.status === 403 && result.returnUrl) {
			const href = result.returnUrl.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
			return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Reaction not recorded — PlusMark</title><body><main><h1>Reaction not recorded</h1><p>This badge belongs to another page. Your vote has not changed.</p><p><a href="${href}" rel="noreferrer">Open the intended page</a> and click its badge there.</p></main></body></html>`, {
				status: 403,
				headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'", 'x-content-type-options': 'nosniff' }
			});
		}
		error(result.status, result.message);
	}

	redirect(302, result.returnUrl);
};
