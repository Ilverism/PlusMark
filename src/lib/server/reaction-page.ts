export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

export function reactionPage(options: { doc: string; action: string; ticket: string; ticketId: string; siteKey: string; verified: boolean; automatic?: boolean; hasVoted?: boolean; returnUrl: string; label: string; preview?: boolean }) {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>React — PlusMark</title>
	<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png">
	<link rel="icon" type="image/svg+xml" href="/favicon.svg">
	<link rel="shortcut icon" href="/favicon.ico">
	<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
	<link rel="manifest" href="/site.webmanifest">
	<link rel="stylesheet" href="/reaction-verification.css">${options.preview ? '' : '<script src="/reaction-verification.js" defer></script>'}</head><body><div class="background-pattern" aria-hidden="true"></div>
	<main>
		<span id="vote-delta" role="img" aria-label="${options.hasVoted ? 'Remove your vote' : 'Add your vote'}">${options.hasVoted ? '−1' : '+1'}</span>
		<h1>${escapeHtml(options.label)}</h1>
		<p id="status" role="status" aria-live="polite">${options.verified ? '• Ready. Press <b>Submit Reaction</b> to record your vote.' : '• Complete the security check, then press <b>Submit Reaction</b>.'}</p>
		<span>• Submitting adds (or removes) your reaction vote, then returns you to the source page.</span>
		<form method="post" action="${escapeHtml(options.action)}" data-verified="${options.verified}" data-automatic="${options.automatic === true}" data-site-key="${escapeHtml(options.siteKey)}" data-ticket-id="${options.ticketId}">
			<input type="hidden" name="ticket" value="${escapeHtml(options.ticket)}">
			<div id="challenge"></div>
			<div id="automatic-row"${options.verified ? '' : ' hidden'}>
				<label class="automatic-option"><input id="automatic" name="automatic" type="checkbox" aria-describedby="automatic-help"> <span>Submit future reactions automatically (temporary)</span></label>
				<span class="automatic-help-trigger">
					<button type="button" id="automatic-help-button" aria-label="About automatic submission" aria-describedby="automatic-help">
						<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
					</button>
					<span id="automatic-help" role="tooltip" hidden>Applies to this browser until verification expires. Manual verification is required again afterward.</span>
				</span>
			</div>
			<button id="cancel-submission" class="reaction-action" type="button" hidden>
				<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m18 6-12 12M6 6l12 12"/></svg>
				Cancel (Esc)
			</button>
			<button class="reaction-action" type="submit"${options.verified ? '' : ' hidden'}${options.preview && options.verified ? '' : ' disabled'}>
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
		<small>Your vote will not be recorded if you leave without submitting.</small>
	</p></body></html>`;
}
