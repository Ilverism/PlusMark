import { isHttpError, isRedirect, type RequestEvent } from '@sveltejs/kit';

export type ReactionAudit = {
	phase: string;
	doc?: string;
	reaction?: string;
	submissionId?: string;
	verification?: 'turnstile' | 'pass';
	source?: string | null;
	voter?: string;
	active?: boolean;
	count?: number;
};

const bounded = (value: unknown) => typeof value === 'string' ? value.replace(/\p{Cc}/gu, '').slice(0, 512) || null : null;

export function auditSource(value: string | null | undefined) {
	if (!value) return null;
	try {
		const url = new URL(value);
		return ['http:', 'https:'].includes(url.protocol) ? bounded(url.origin + url.pathname) : null;
	} catch { return null; }
}

// Deliberately allowlist fields: never log request bodies, cookies, tokens, or raw IPs.
export async function auditReactionRequest(event: RequestEvent, handler: (audit: ReactionAudit) => Promise<Response>) {
	const audit: ReactionAudit = { phase: 'received' };
	let status = 500;
	try {
		const response = await handler(audit);
		status = response.status;
		return response;
	} catch (cause) {
		if (isHttpError(cause) || isRedirect(cause)) status = cause.status;
		throw cause;
	} finally {
		const headers = event.request.headers;
		const cf = event.platform?.cf;
		const bot = cf?.botManagement;
		console.log({
			event: 'reaction.request', at: new Date().toISOString(),
			...audit, source: auditSource(audit.source), status, method: event.request.method,
			ray: bounded(headers.get('cf-ray')),
			userAgent: bounded(headers.get('user-agent')),
			referrer: auditSource(headers.get('referer')),
			origin: auditSource(headers.get('origin')),
			fetchSite: bounded(headers.get('sec-fetch-site')),
			fetchMode: bounded(headers.get('sec-fetch-mode')),
			fetchDest: bounded(headers.get('sec-fetch-dest')),
			fetchUser: bounded(headers.get('sec-fetch-user')),
			purpose: bounded(headers.get('sec-purpose') || headers.get('purpose') || headers.get('x-purpose') || headers.get('x-moz')),
			asn: typeof cf?.asn === 'number' ? cf.asn : null, network: bounded(cf?.asOrganization), country: bounded(cf?.country),
			botScore: bot && typeof bot === 'object' && 'score' in bot && typeof bot.score === 'number' ? bot.score : null,
			verifiedBot: bot && typeof bot === 'object' && 'verifiedBot' in bot && typeof bot.verifiedBot === 'boolean' ? bot.verifiedBot : null
		});
	}
}
