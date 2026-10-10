export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

export function reactionPage(options: { action: string; ticket: string; ticketId: string; siteKey: string; verified: boolean; returnUrl: string; label: string }) {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>React — PlusMark</title><link rel="stylesheet" href="/reaction-verification.css"><script src="/reaction-verification.js" defer></script></head><body><main>
	<h1>${escapeHtml(options.label)}</h1><p id="status" role="status" aria-live="polite">${options.verified ? 'Recording your reaction…' : 'Please complete the security check to record your reaction.'}</p>
	<form method="post" action="${escapeHtml(options.action)}" data-verified="${options.verified}" data-site-key="${escapeHtml(options.siteKey)}" data-ticket-id="${options.ticketId}">
	<input type="hidden" name="ticket" value="${escapeHtml(options.ticket)}"><div id="challenge"></div><button type="submit" disabled>Continue</button></form>
	<noscript><p>JavaScript is required to verify and record your reaction.</p></noscript><p><a href="${escapeHtml(options.returnUrl)}" rel="noreferrer">Return without reacting</a></p></main></body></html>`;
}
