export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

export function reactionPage(options: { doc: string; action: string; ticket: string; ticketId: string; siteKey: string; verified: boolean; returnUrl: string; label: string; preview?: boolean }) {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>React — PlusMark</title><link rel="stylesheet" href="/reaction-verification.css">${options.preview ? '' : '<script src="/reaction-verification.js" defer></script>'}</head><body><div class="background-pattern" aria-hidden="true"></div>
	<main>
		<h1>${escapeHtml(options.label)}</h1>
		<p id="status" role="status" aria-live="polite">${options.verified ? '• Ready. Press Submit Reaction to record your vote.' : '• Complete the security check, then press Submit Reaction.'}</p>
		<span>• Submitting adds or removes your reaction, then returns you to the source page.</span>
		<form method="post" action="${escapeHtml(options.action)}" data-verified="${options.verified}" data-site-key="${escapeHtml(options.siteKey)}" data-ticket-id="${options.ticketId}">
			<input type="hidden" name="ticket" value="${escapeHtml(options.ticket)}">
			<div id="challenge"></div>
			<button type="submit"${options.preview && options.verified ? '' : ' disabled'}>
				<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m20 6-11 11-5-5"/></svg>
				Submit Reaction
			</button>
		</form>
		<sup><sub><code>${escapeHtml(options.doc)}</code></sub></sup>
	</main>
	<noscript>
		<p>JavaScript is required to verify and record your reaction.</p>
	</noscript>
	<p id="return-link">
		<a href="${escapeHtml(options.returnUrl)}" rel="noreferrer">↩ Return immediately: '${escapeHtml(options.returnUrl)}'</a>
		<small>No vote is changed until you submit.</small>
	</p></body></html>`;
}
