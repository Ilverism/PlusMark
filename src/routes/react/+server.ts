import { error, redirect, type RequestHandler } from '@sveltejs/kit';
import {
	getReactionDocumentStub,
	getVoterHash,
	parseDocAndReaction
} from '$lib/server/reaction-service';

export const GET: RequestHandler = async (event) => {
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
				headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'", 'x-content-type-options': 'nosniff' }
			});
		}
		error(result.status, result.message);
	}

	redirect(302, result.returnUrl);
};
