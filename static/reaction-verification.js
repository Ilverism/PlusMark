const form = document.querySelector('form');
const status = document.querySelector('#status');
const button = form.querySelector('button[type="submit"]');
const cancelButton = form.querySelector('#cancel-submission');
const automaticOption = form.querySelector('#automatic');
const automaticRow = form.querySelector('#automatic-row');
const helpButton = form.querySelector('#automatic-help-button');
const help = form.querySelector('#automatic-help');
const preferenceKey = 'plusmark.automaticReactions';
let busy = false;
let token = '';
let widget;
let automaticOperation;
const verified = form.dataset.verified === 'true';
try { automaticOption.checked = localStorage.getItem(preferenceKey) === 'true'; } catch { /* Storage may be unavailable. Default to explicit submission. */ }

helpButton.addEventListener('focus', () => { help.hidden = false; });
helpButton.addEventListener('blur', () => { help.hidden = true; });
helpButton.addEventListener('click', () => { help.hidden = false; });
helpButton.parentElement.addEventListener('pointerenter', event => {
	if (event.pointerType !== 'touch') help.hidden = false;
});
helpButton.parentElement.addEventListener('pointerleave', () => {
	if (document.activeElement !== helpButton) help.hidden = true;
});

function hideVerificationControls() {
	button.hidden = true;
	button.disabled = true;
	automaticRow.hidden = true;
	help.hidden = true;
}

automaticOption.addEventListener('change', () => {
	try {
		if (automaticOption.checked) localStorage.setItem(preferenceKey, 'true');
		else localStorage.removeItem(preferenceKey);
	} catch { /* The option can still apply to this submission. */ }
	if (!automaticOption.checked) {
		document.cookie = `pm_automatic=; Path=/; Max-Age=0; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
	}
});
document.addEventListener('keydown', event => {
	if (event.key === 'Escape') help.hidden = true;
	if (event.key === 'Escape' && automaticOperation) {
		event.preventDefault();
		cancelAutomatic();
	}
}, { capture: true });
cancelButton.addEventListener('click', cancelAutomatic);
window.addEventListener('storage', event => {
	if ((event.key === preferenceKey && event.newValue !== 'true') || event.key === null) {
		automaticOption.checked = false;
	}
});

function ready() {
	if (busy) return;
	button.disabled = false;
	button.hidden = false;
	automaticRow.hidden = false;
	status.textContent = '• Ready. Press <b>Submit Reaction</b> to record your vote.';
}

async function cancelAutomatic() {
	const operation = automaticOperation;
	if (!operation || operation.cancelling) return;
	operation.cancelled = true;
	operation.cancelling = true;
	// Esc must stop a pending redirect, but aborting a fetch cannot undo a committed vote.
	if (operation.redirecting) window.stop();
	busy = false;
	automaticOption.disabled = false;
	cancelButton.disabled = true;
	status.textContent = '• Cancelling automatic submission…';
	try {
		const response = await fetch(form.action, {
			method: 'POST', keepalive: true, headers: { Accept: 'application/json' },
			body: new URLSearchParams({ ticket: operation.ticket, submission: 'cancel' })
		});
		const result = await response.json();
		if (!response.ok) throw new Error(result.message || result.error || 'Cancellation failed.');
		form.elements.ticket.value = result.ticket;
		form.dataset.ticketId = result.ticketId;
		const indicator = document.querySelector('#vote-delta');
		indicator.textContent = result.active ? '−1' : '+1';
		indicator.setAttribute('aria-label', result.active ? 'Remove your vote' : 'Add your vote');
		automaticOperation = undefined;
		cancelButton.hidden = true;
		ready();
		status.textContent = '• Automatic submission cancelled.';
	} catch (error) {
		status.textContent = `• ${error.message} Press Cancel (Esc) to retry.`;
	} finally {
		operation.cancelling = false;
		cancelButton.disabled = false;
	}
}

async function submit(event, automatic = false) {
	event?.preventDefault();
	if (busy || automaticOperation?.cancelled || document.prerendering || (!verified && !token)) return;
	const operation = automatic ? { ticket: form.elements.ticket.value, cancelled: false, cancelling: false, redirecting: false } : null;
	if (operation) automaticOperation = operation;
	busy = true;
	button.disabled = true;
	button.hidden = true;
	cancelButton.hidden = !automatic;
	status.textContent = '• Recording your reaction…';
	try {
		const body = new URLSearchParams(new FormData(form));
		body.set('submission', automatic ? 'automatic' : 'explicit');
		body.set('cf-turnstile-response', token);
		automaticOption.disabled = true;
		const response = await fetch(form.action, { method: 'POST', body, headers: { Accept: 'application/json' } });
		const result = await response.json();
		if (operation?.cancelled) return;
		if (!response.ok) throw new Error(result.message || result.error || 'Your reaction could not be recorded. Please try again.');
		if (operation) operation.redirecting = true;
		location.replace(result.returnUrl);
	} catch (error) {
		if (operation?.cancelled) return;
		status.textContent = '• ' + error.message;
		busy = false;
		automaticOption.disabled = false;
		if (widget !== undefined) {
			token = '';
			hideVerificationControls();
			window.turnstile.reset(widget);
		} else { button.disabled = false; button.hidden = Boolean(operation); }
	}
}

form.addEventListener('submit', submit);
function start() {
	if (verified) {
		ready();
		if (!document.hidden && automaticOption.checked && form.dataset.automatic === 'true') submit(undefined, true);
		return;
	}
	hideVerificationControls();
	const script = document.createElement('script');
	script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
	script.onload = () => {
		widget = window.turnstile.render('#challenge', {
			sitekey: form.dataset.siteKey, action: 'reaction', cData: form.dataset.ticketId,
			callback: value => {
				token = value;
				ready();
			},
			'error-callback': () => {
				token = '';
				hideVerificationControls();
				if (!busy) status.textContent = '• Verification is unavailable. Please reload to try again.';
			},
			'expired-callback': () => {
				token = '';
				hideVerificationControls();
				if (!busy) {
					status.textContent = '• Verification expired. Complete the security check again before submitting.';
					window.turnstile.reset(widget);
				}
			}
		});
	};
	script.onerror = () => { status.textContent = '• Verification could not load. Please allow Cloudflare Turnstile and reload.'; };
	document.head.append(script);
}
if (document.prerendering) document.addEventListener('prerenderingchange', start, { once: true });
else start();
