export const VERIFICATION_SECONDS = 3600;
export type ReactionTicket = {
	purpose: 'reaction'; id: string; doc: string; reaction: string;
	visitor: string; referrer: string | null; expiresAt: number;
};

const encoder = new TextEncoder();
const encode = (bytes: Uint8Array) => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''))
	.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const key = (secret: string) => crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

async function sign(secret: string, claim: object) {
	const body = encode(encoder.encode(JSON.stringify(claim)));
	const signature = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(`plusmark-verification:${body}`));
	return `${body}.${encode(new Uint8Array(signature))}`;
}

async function read(secret: string, token: string, now: number): Promise<Record<string, unknown> | null> {
	try {
		if (token.length > 16384) return null;
		const parts = token.split('.');
		if (parts.length !== 2 || !parts.every(p => /^[A-Za-z0-9_-]+$/.test(p))) return null;
		if (!await crypto.subtle.verify('HMAC', await key(secret), decode(parts[1]), encoder.encode(`plusmark-verification:${parts[0]}`))) return null;
		const claim = JSON.parse(new TextDecoder().decode(decode(parts[0])));
		return claim && typeof claim.expiresAt === 'number' && claim.expiresAt > now ? claim : null;
	} catch { return null; }
}

export function createVerificationPass(secret: string, visitor: string, now = Date.now()) {
	return sign(secret, { purpose: 'verified', visitor, expiresAt: now + VERIFICATION_SECONDS * 1000 });
}

export async function hasVerificationPass(secret: string, token: string, visitor: string, now = Date.now()) {
	const claim = await read(secret, token, now);
	return claim?.purpose === 'verified' && claim.visitor === visitor;
}

export function createReactionTicket(secret: string, doc: string, reaction: string, visitor: string, referrer: string | null, now = Date.now()) {
	return sign(secret, { purpose: 'reaction', id: crypto.randomUUID(), doc, reaction, visitor, referrer, expiresAt: now + 600_000 });
}

export async function readReactionTicket(secret: string, token: string, now = Date.now()): Promise<ReactionTicket | null> {
	const claim = await read(secret, token, now);
	if (!claim || claim.purpose !== 'reaction' || !['id', 'doc', 'reaction', 'visitor'].every(k => typeof claim[k] === 'string')
		|| (claim.referrer !== null && typeof claim.referrer !== 'string')) return null;
	return claim as ReactionTicket;
}

export async function verifyTurnstile(secret: string, token: string, hostname: string, ticketId: string, fetcher: typeof fetch = fetch) {
	if (!token || token.length > 2048) return false;
	try {
		const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
			method: 'POST', body: new URLSearchParams({ secret, response: token }),
			signal: AbortSignal.timeout(8000)
		});
		if (!response.ok) return false;
		const result = await response.json() as Record<string, unknown>;
		return result.success === true && result.hostname === hostname && result.action === 'reaction' && result.cdata === ticketId;
	} catch { return false; }
}
