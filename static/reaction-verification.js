const form = document.querySelector('form');
const status = document.querySelector('#status');
const button = form.querySelector('button');
let busy = false;
let token = '';
let widget;
let automatic = true;

async function submit(event) {
	event?.preventDefault();
	if (busy || document.prerendering) return;
	busy = true;
	button.disabled = true;
	status.textContent = 'Recording your reaction…';
	try {
		const body = new URLSearchParams(new FormData(form));
		body.set('cf-turnstile-response', token);
		const response = await fetch(form.action, { method: 'POST', body, headers: { Accept: 'application/json' } });
		const result = await response.json();
		if (!response.ok) throw new Error(result.message || result.error || 'Your reaction could not be recorded. Please try again.');
		location.replace(result.returnUrl);
	} catch (error) {
		status.textContent = error.message;
		busy = false;
		automatic = false;
		button.textContent = 'Try again';
		if (widget !== undefined) {
			token = '';
			window.turnstile.reset(widget);
		} else button.disabled = false;
	}
}

form.addEventListener('submit', submit);
function start() {
	if (form.dataset.verified === 'true') { void submit(); return; }
	const script = document.createElement('script');
	script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
	script.onload = () => {
		widget = window.turnstile.render('#challenge', {
			sitekey: form.dataset.siteKey, action: 'reaction', cData: form.dataset.ticketId,
			callback: value => {
				token = value;
				if (automatic) void submit();
				else button.disabled = false;
			},
			'error-callback': () => { status.textContent = 'Verification is unavailable. Please reload to try again.'; },
			'expired-callback': () => { token = ''; window.turnstile.reset(widget); }
		});
	};
	script.onerror = () => { status.textContent = 'Verification could not load. Please allow Cloudflare Turnstile and reload.'; };
	document.head.append(script);
}
if (document.prerendering) document.addEventListener('prerenderingchange', start, { once: true });
else start();
