import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync('src/lib/server/reaction-page.ts', 'utf8'), {
	compilerOptions: { module: ts.ModuleKind.ESNext }
}).outputText;
const { reactionPage } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
mkdirSync('.cache-probes', { recursive: true });
let posts = 0;
let rejectNext = false;
let lastSubmission;
let cancellations = 0;
let holdVotes = false;
const heldVotes = [];
let rejectCancellation = false;
let holdRedirect = false;
const heldRedirects = [];
const server = createServer(async (req, res) => {
	const url = new URL(req.url, 'http://localhost');
	if (req.method === 'POST') {
		let body = '';
		for await (const chunk of req) body += chunk;
		lastSubmission = new URLSearchParams(body);
		if (lastSubmission.get('submission') === 'cancel') {
			cancellations++;
			if (rejectCancellation) {
				rejectCancellation = false;
				res.writeHead(503, { 'content-type': 'application/json' });
				res.end(JSON.stringify({ message: 'Cancellation temporarily unavailable.' }));
				return;
			}
			res.setHeader('content-type', 'application/json');
			res.end(JSON.stringify({ active: false, ticket: 'replacement-ticket', ticketId: 'replacement-id' }));
			return;
		}
		posts++;
		if (holdVotes) await new Promise(resolve => heldVotes.push(resolve));
		await new Promise(resolve => setTimeout(resolve, 100));
		res.writeHead(rejectNext ? 403 : 200, { 'content-type': 'application/json' });
		res.end(JSON.stringify(rejectNext ? { message: 'Test rejection' } : { returnUrl: '/done' }));
		rejectNext = false;
	} else if (url.pathname.startsWith('/reaction-verification.')) {
		res.setHeader('content-type', url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css');
		res.end(readFileSync(`static${url.pathname}`));
	} else {
		if (url.pathname === '/done' && holdRedirect) await new Promise(resolve => heldRedirects.push(resolve));
		res.setHeader('content-type', 'text/html');
		res.end(url.pathname === '/done' ? 'Done' : reactionPage({
			doc: 'github-com-ilverism-plusmarktest-issues-3-g-729f75654ebec37e',
			action: '/react', ticket: 'test-ticket', ticketId: 'test-id', siteKey: 'test-site-key',
			verified: url.searchParams.has('verified'), automatic: url.searchParams.has('automatic'), hasVoted: url.searchParams.has('voted'), returnUrl: '/done', label: '👍 Thumbs Up'
		}));
	}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
	const page = await browser.newPage();
	await page.route('https://challenges.cloudflare.com/**', route => route.fulfill({
		contentType: 'text/javascript', body: `window.turnstile = {
			render: (_, options) => { window.challenge = options; return 1; },
			reset: () => { window.resets = (window.resets || 0) + 1; }
		};`
	}));
	const base = `http://127.0.0.1:${server.address().port}`;
	const settle = () => page.waitForTimeout(200);
	const button = page.locator('button[type="submit"]');
	const checkbox = page.locator('#automatic');
	await page.goto(`${base}/react?verified=1`);
	await settle();
	assert.equal(posts, 0, 'an existing verification pass must not auto-submit');
	assert.equal(await button.isEnabled(), true);
	const initialButton = await button.boundingBox();
	await button.hover();
	await settle();
	const hoveredButton = await button.boundingBox();
	assert.ok(hoveredButton.width > initialButton.width, 'hover grows the button');
	for (const [position, size] of [['x', 'width'], ['y', 'height']]) {
		assert.ok(Math.abs(initialButton[position] + initialButton[size] / 2 - hoveredButton[position] - hoveredButton[size] / 2) < 1, 'hover keeps the button centered');
	}
	await button.focus();
	await page.keyboard.press('Enter');
	assert.equal(await button.isHidden(), true, 'button disappears during submission');
	await page.waitForURL('**/done');
	assert.equal(posts, 1, 'keyboard confirmation submits once');
	await page.goto(`${base}/react?verified=1`);
	await settle();
	assert.equal(posts, 1, 'every subsequent reaction needs confirmation too');
	await page.goto(`${base}/react`);
	await page.waitForFunction(() => Boolean(window.challenge));
	assert.equal(await button.isDisabled(), true);
	assert.equal(await button.isHidden(), true, 'submit button stays hidden during verification');
	assert.equal(await checkbox.isHidden(), true, 'checkbox row stays hidden during verification');
	await page.evaluate(() => document.querySelector('form').requestSubmit());
	assert.equal(posts, 1, 'submission before verification is ignored');
	await page.evaluate(() => window.challenge.callback('test-token'));
	await settle();
	assert.equal(posts, 1, 'Turnstile success must not auto-submit');
	assert.equal(await button.isEnabled(), true);
	assert.equal(await button.isVisible(), true);
	assert.equal(await checkbox.isVisible(), true);
	await page.evaluate(() => window.challenge['expired-callback']());
	assert.equal(await button.isDisabled(), true);
	assert.equal(await checkbox.isHidden(), true, 'verification expiry hides the controls again');
	assert.equal(posts, 1);
	await page.evaluate(() => window.challenge.callback('fresh-token'));
	await page.evaluate(() => window.challenge['error-callback']());
	assert.equal(await button.isDisabled(), true);
	await page.evaluate(() => window.challenge.callback('recovered-token'));
	rejectNext = true;
	await button.click();
	await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Test rejection'));
	assert.equal(posts, 2);
	assert.equal(await button.isHidden(), true, 'button remains hidden while retrying verification');
	assert.equal(await button.isDisabled(), true);
	await page.evaluate(() => window.challenge.callback('retry-token'));
	await settle();
	assert.equal(posts, 2, 'reverification after a failure must not auto-retry');
	await button.click();
	await page.evaluate(() => document.querySelector('form').requestSubmit());
	await page.waitForURL('**/done');
	assert.equal(posts, 3, 'repeated submission during an in-flight request is ignored');
	for (const colorScheme of ['light', 'dark']) {
		await page.emulateMedia({ colorScheme });
		for (const width of [375, 1280]) {
			await page.setViewportSize({ width, height: 800 });
			await page.goto(`${base}/react?verified=1`);
			await page.mouse.move(0, 0);
			const card = await page.locator('main').boundingBox();
			const indicator = await page.locator('#vote-delta').boundingBox();
			assert.equal(await page.locator('#vote-delta').textContent(), '+1');
			assert.ok(indicator.x > card.x + card.width / 2 && indicator.x + indicator.width < card.x + card.width, 'indicator stays inside the right edge');
			assert.ok(indicator.y >= card.y && indicator.y + indicator.height <= (await page.locator('h1').boundingBox()).y, 'indicator clears the heading');
			const action = await button.boundingBox();
			assert.ok(Math.abs(action.x + action.width / 2 - (card.x + card.width / 2)) < 1);
			assert.ok(Math.abs(action.y + action.height / 2 - (card.y + card.height)) < 6);
			assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
			await page.screenshot({ path: `.cache-probes/explicit-submit-${colorScheme}-${width}.png`, fullPage: true });
		}
	}
	assert.equal(posts, 3, 'layout checks never cast votes');
	await page.goto(`${base}/react?verified=1&voted=1`);
	assert.equal(await page.getByRole('img', { name: 'Remove your vote' }).textContent(), '−1');
	const help = page.getByRole('button', { name: 'About automatic submission' });
	const tooltip = page.getByRole('tooltip');
	assert.equal(await tooltip.isVisible(), false);
	await help.hover();
	assert.equal(await tooltip.isVisible(), true);
	assert.match(await tooltip.textContent(), /Applies to this browser until verification expires/);
	await page.mouse.move(0, 0);
	assert.equal(await tooltip.isVisible(), false);
	await help.focus();
	assert.equal(await tooltip.isVisible(), true);
	await page.keyboard.press('Escape');
	assert.equal(await tooltip.isVisible(), false);
	assert.equal(await checkbox.isChecked(), false);
	await checkbox.check();
	await page.reload();
	assert.equal(await checkbox.isChecked(), true, 'preference survives visits');
	await page.clock.install();
	await page.clock.pauseAt(new Date(Date.now() + 10_000));
	await page.clock.runFor(4000);
	assert.equal(posts, 3, 'remembered preference alone never submits');
	await page.goto(`${base}/react?verified=1&automatic=1`);
	await page.waitForURL('**/done', { timeout: 2000 });
	assert.equal(posts, 4, 'automatic submission does not wait for a timer');
	assert.equal(lastSubmission.get('submission'), 'automatic');
	await page.goto(`${base}/react?verified=1`);
	assert.equal(await checkbox.isVisible(), true);
	await page.context().addCookies([{ name: 'pm_automatic', value: 'test-grant', url: base }]);
	await checkbox.uncheck();
	assert.equal((await page.context().cookies()).some(cookie => cookie.name === 'pm_automatic'), false, 'unchecking immediately removes permission');
	await page.goto(`${base}/react?verified=1&automatic=1`);
	assert.equal(await checkbox.isChecked(), false);
	await page.clock.runFor(4000);
	assert.equal(posts, 4, 'unchecked preference prevents automatic submission');
	await checkbox.check();
	await page.clock.runFor(4000);
	assert.equal(posts, 4, 'checking the option does not immediately submit');
	await page.reload();
	await page.waitForURL('**/done', { timeout: 2000 });
	assert.equal(posts, 5);
	assert.equal(lastSubmission.get('submission'), 'automatic');
	await page.goto(`${base}/react?automatic=1`);
	await page.waitForFunction(() => Boolean(window.challenge));
	assert.equal(await checkbox.isChecked(), true, 'preference remains after verification expires');
	await page.evaluate(() => window.challenge.callback('renewed-token'));
	await page.clock.runFor(4000);
	assert.equal(posts, 5, 'fresh Turnstile success requires explicit confirmation after expiry');
	await button.click();
	await page.waitForURL('**/done');
	assert.equal(posts, 6);
	assert.equal(lastSubmission.get('submission'), 'explicit');
	assert.equal(lastSubmission.get('automatic'), 'on');
	rejectNext = true;
	await page.goto(`${base}/react?verified=1&automatic=1`);
	await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Test rejection'));
	assert.equal(posts, 7);
	await page.clock.runFor(5000);
	assert.equal(posts, 7, 'failed automatic submission never auto-retries');
	const cancelButton = page.getByRole('button', { name: 'Cancel (Esc)', exact: true });
	assert.equal(await cancelButton.isVisible(), true, 'uncertain automatic submissions remain cancellable');
	assert.equal(await checkbox.isEnabled(), true);
	await cancelButton.click();
	await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Automatic submission cancelled'));
	assert.equal(await button.isVisible(), true);
	assert.equal(cancellations, 1);
	holdVotes = true;
	await page.setViewportSize({ width: 375, height: 800 });
	await page.reload();
	assert.equal(await cancelButton.isVisible(), true);
	assert.equal(await button.isHidden(), true);
	const cancelBounds = await cancelButton.boundingBox();
	const cancelCard = await page.locator('main').boundingBox();
	assert.ok(Math.abs(cancelBounds.x + cancelBounds.width / 2 - (cancelCard.x + cancelCard.width / 2)) < 1, 'cancel button stays centered on narrow screens');
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
	await page.screenshot({ path: '.cache-probes/automatic-cancel-dark-375.png', fullPage: true });
	await page.keyboard.press('Escape');
	await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Automatic submission cancelled'));
	assert.equal(cancellations, 2);
	assert.equal(await checkbox.isEnabled(), true);
	await checkbox.uncheck();
	await checkbox.check();
	assert.equal(await checkbox.isChecked(), true);
	assert.equal(await page.locator('input[name="ticket"]').inputValue(), 'replacement-ticket');
	holdVotes = false;
	for (const release of heldVotes.splice(0)) release();
	await new Promise(resolve => setTimeout(resolve, 250));
	assert.ok(page.url().includes('/react?'), 'a late successful response cannot redirect after cancellation');
	await button.click();
	await page.waitForURL('**/done');
	assert.equal(lastSubmission.get('submission'), 'explicit');
	assert.equal(lastSubmission.get('ticket'), 'replacement-ticket');
	holdRedirect = true;
	const redirectRequest = page.waitForRequest(`${base}/done`);
	await page.goto(`${base}/react?verified=1&automatic=1`);
	await redirectRequest;
	rejectCancellation = true;
	await page.keyboard.press('Escape');
	await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Press Cancel (Esc) to retry'));
	assert.equal(await checkbox.isEnabled(), true, 'a cancellation failure leaves the preference editable');
	assert.equal(await cancelButton.isEnabled(), true, 'a failed cancellation can be retried');
	assert.equal(await button.isHidden(), true, 'a new vote cannot race an unresolved cancellation');
	await cancelButton.click();
	await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Automatic submission cancelled'));
	holdRedirect = false;
	for (const release of heldRedirects.splice(0)) release();
	await new Promise(resolve => setTimeout(resolve, 250));
	assert.ok(page.url().includes('/react?'), 'Esc stops a redirect even after the automatic vote response succeeded');
	assert.equal(await button.isVisible(), true);
	assert.equal(await checkbox.isEnabled(), true);
	console.log('Reaction page: automatic submission, cancellation before and after commit, cancellation retry, persistent opt-in, expiry, keyboard and responsive layout passed.');
} finally {
	for (const release of heldVotes) release();
	for (const release of heldRedirects) release();
	await browser.close();
	await new Promise(resolve => server.close(resolve));
}
