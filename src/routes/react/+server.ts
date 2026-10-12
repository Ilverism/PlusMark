import { error, json, redirect, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env as privateEnv } from '$env/dynamic/private';
import { getHmacSecret, getReactionDocumentStub, getVisitorId, getVoterHash, parseDocAndReaction } from '$lib/server/reaction-service';
import { isReactionSourceAllowed } from '$lib/server/reaction-source';
import { escapeHtml, reactionPage } from '$lib/server/reaction-page';
import { auditReactionRequest } from '$lib/server/reaction-audit';
import { createReactionTicket, createVerificationPass, hasVerificationPass, readReactionTicket, verifyTurnstile, VERIFICATION_SECONDS } from '$lib/server/reaction-verification';

const VERIFIED_COOKIE = 'pm_verified';
const REACTION_HEADERS = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' };
const PAGE_HEADERS = {
	'content-type': 'text/html; charset=utf-8',
	'content-security-policy': "default-src 'none'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'no-referrer'
};

function configuration(event: RequestEvent) {
	const bindings = event.platform?.env;
	const siteKey = bindings?.TURNSTILE_SITE_KEY;
	const secret = bindings?.TURNSTILE_SECRET || (dev ? privateEnv.TURNSTILE_SECRET : undefined);
	const hostname = dev && ['localhost', '127.0.0.1'].includes(event.url.hostname)
		? event.url.hostname : bindings?.TURNSTILE_HOSTNAME;
	if (!siteKey || !secret || !hostname || hostname !== event.url.hostname) error(503, 'Reaction verification is not configured for this host.');
	return { siteKey, secret, hostname };
}

async function parameters(event: RequestEvent) {
	const parsed = parseDocAndReaction(event);
	if (parsed instanceof Response) {
		const { error: message } = await parsed.json() as { error: string };
		error(parsed.status, message);
	}
	return parsed;
}

// Neither link previews nor ordinary GETs mutate votes.
export const HEAD: RequestHandler = () => new Response(null, { status: 204, headers: REACTION_HEADERS });
export const GET: RequestHandler = (event) => auditReactionRequest(event, async (audit) => {
	event.setHeaders(REACTION_HEADERS);
	const speculative = ['sec-purpose', 'purpose', 'x-purpose', 'x-moz'].some(header =>
		event.request.headers.get(header)?.toLowerCase().split(/[\s,;]+/).some(value => value === 'prefetch' || value === 'prerender')
	);
	if (speculative) { audit.phase = 'speculative'; return new Response(null, { status: 204 }); }
	audit.phase = 'parameters';
	const { doc, reaction } = await parameters(event);
	Object.assign(audit, { doc, reaction, phase: 'widget' });
	const stub = await getReactionDocumentStub(event, doc);
	const result = await stub.getWidget();
	if (!result.ok) error(result.status, result.message);
	const selected = result.widget.reactions.find(item => item.id === reaction);
	if (!selected) error(404, 'Unknown reaction.');
	const referrer = event.request.headers.get('referer');
	audit.source = referrer;
	audit.phase = 'source';
	if (result.widget.verifyReferrer && !isReactionSourceAllowed(result.widget.returnUrl, referrer)) {
		return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Reaction not recorded — PlusMark</title><body><main><h1>Reaction not recorded</h1><p>This badge belongs to another page. Your vote has not changed.</p><p><a href="${escapeHtml(result.widget.returnUrl)}" rel="noreferrer">Open the intended page</a> and click its badge there.</p></main></body></html>`, { status: 403, headers: PAGE_HEADERS });
	}
	audit.phase = 'configuration';
	const config = configuration(event);
	const secret = getHmacSecret(event);
	const visitor = getVisitorId(event);
	const ticket = await createReactionTicket(secret, doc, reaction, visitor, referrer);
	const claim = (await readReactionTicket(secret, ticket))!;
	const verified = await hasVerificationPass(secret, event.cookies.get(VERIFIED_COOKIE) ?? '', visitor);
	Object.assign(audit, { phase: 'page', submissionId: claim.id, verification: verified ? 'pass' : 'turnstile' });
	return new Response(reactionPage({
		action: event.url.pathname + event.url.search, ticket, ticketId: claim.id, siteKey: config.siteKey,
		doc, verified, returnUrl: result.widget.returnUrl, label: `${selected.emoji} ${selected.label}`
	}), { headers: PAGE_HEADERS });
});

async function readForm(request: Request) {
	if (request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded') error(415, 'Expected form data.');
	const reader = request.body?.getReader();
	if (!reader) error(400, 'Missing submission.');
	let size = 0;
	let body = '';
	const decoder = new TextDecoder();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > 24_576) { await reader.cancel(); error(413, 'Submission too large.'); }
			body += decoder.decode(value, { stream: true });
		}
	} finally { reader.releaseLock(); }
	return new URLSearchParams(body + decoder.decode());
}

export const POST: RequestHandler = (event) => auditReactionRequest(event, async (audit) => {
	event.setHeaders(REACTION_HEADERS);
	audit.phase = 'origin';
	if (event.request.headers.get('origin') !== event.url.origin) error(403, 'Submit the reaction from its verification page.');
	audit.phase = 'parameters';
	const { doc, reaction } = await parameters(event);
	Object.assign(audit, { doc, reaction, phase: 'configuration' });
	const config = configuration(event);
	audit.phase = 'form';
	const form = await readForm(event.request);
	audit.phase = 'ticket';
	const secret = getHmacSecret(event);
	const ticket = await readReactionTicket(secret, form.get('ticket') ?? '');
	const visitor = event.cookies.get('pm_vid');
	if (!ticket || !visitor || ticket.visitor !== visitor || ticket.doc !== doc || ticket.reaction !== reaction) {
		error(403, 'This submission is invalid or expired. Please click the badge again.');
	}
	Object.assign(audit, { submissionId: ticket.id, source: ticket.referrer, phase: 'verification' });
	const verified = await hasVerificationPass(secret, event.cookies.get(VERIFIED_COOKIE) ?? '', visitor);
	audit.verification = verified ? 'pass' : 'turnstile';
	if (!verified && !await verifyTurnstile(config.secret, form.get('cf-turnstile-response') ?? '', config.hostname, ticket.id)) {
		error(403, 'Verification failed. Please try the security check again.');
	}
	audit.phase = 'vote';
	const stub = await getReactionDocumentStub(event, doc);
	audit.voter = await getVoterHash(event, doc);
	const result = await stub.toggleReaction(reaction, audit.voter, ticket.referrer, { id: ticket.id, expiresAt: ticket.expiresAt });
	if (!result.ok) error(result.status, result.message);
	Object.assign(audit, { phase: 'accepted', active: result.active, count: result.count });
	if (!verified) event.cookies.set(VERIFIED_COOKIE, await createVerificationPass(secret, visitor), {
		path: '/', httpOnly: true, sameSite: 'lax', secure: event.url.protocol === 'https:', maxAge: VERIFICATION_SECONDS
	});
	if (event.request.headers.get('accept')?.includes('application/json')) return json({ returnUrl: result.returnUrl });
	redirect(303, result.returnUrl);
});
