/** A best-effort location check, not proof of origin or an authentication boundary. */
export function isReactionSourceAllowed(returnUrl: string, referrer: string | null): boolean {
	if (!referrer) return true;
	let source: URL;
	try {
		source = new URL(referrer);
	} catch {
		return true;
	}
	if (source.protocol !== 'https:' && source.protocol !== 'http:') return true;
	const target = new URL(returnUrl);
	if (source.origin !== target.origin) return false;
	// An origin-only header cannot establish which page was visited.
	if (source.pathname === '/' && !source.search) return true;
	if (source.pathname !== target.pathname) return false;
	// Permit additional tracking parameters, but preserve configured page selectors.
	for (const key of new Set(target.searchParams.keys())) {
		if (JSON.stringify(source.searchParams.getAll(key)) !== JSON.stringify(target.searchParams.getAll(key))) return false;
	}
	return true;
}

export function reactionSourceFailure(returnUrl: string) {
	return { ok: false as const, status: 403, message: 'This reaction belongs to another page.', returnUrl };
}
