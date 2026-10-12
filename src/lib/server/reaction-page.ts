export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

export function reactionPage(options: { action: string; ticket: string; ticketId: string; siteKey: string; verified: boolean; returnUrl: string; label: string; preview?: boolean }) {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>React — PlusMark</title><link rel="stylesheet" href="/reaction-verification.css">${options.preview ? '' : '<script src="/reaction-verification.js" defer></script>'}</head><body><div class="background-pattern" aria-hidden="true"></div>
	<main>
		<h1>${escapeHtml(options.label)}</h1>
		<p id="status" role="status" aria-live="polite">${options.verified ? '• Recording your reaction…' : '• Complete the security check to record your reaction.'}</p>
		<span>• You will be automatically redirected to the Return URL upon completion (press <b>Esc</b> to cancel).</span>
		<form method="post" action="${escapeHtml(options.action)}" data-verified="${options.verified}" data-site-key="${escapeHtml(options.siteKey)}" data-ticket-id="${options.ticketId}">
			<input type="hidden" name="ticket" value="${escapeHtml(options.ticket)}">
			<div id="challenge"></div>
			<button type="submit" hidden disabled>Try again</button>
			<sup><sub><code>xyz123</code></sub></sup>
		</form>
	</main>
	<noscript>
		<p>JavaScript is required to verify and record your reaction.</p>
	</noscript>
	<p id="return-link">
		<a href="${escapeHtml(options.returnUrl)}" rel="noreferrer">↩ Return immediately: '${escapeHtml(options.returnUrl)}'</a>
		<small>(Your vote may be discarded if you return early)</small>
	</p></body></html>`;
}
