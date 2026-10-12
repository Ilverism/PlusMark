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
const server = createServer(async (req, res) => {
	const url = new URL(req.url, 'http://localhost');
	if (req.method === 'POST') {
		posts++;
		await new Promise(resolve => setTimeout(resolve, 100));
		res.writeHead(rejectNext ? 403 : 200, { 'content-type': 'application/json' });
		res.end(JSON.stringify(rejectNext ? { message: 'Test rejection' } : { returnUrl: '/done' }));
		rejectNext = false;
	} else if (url.pathname.startsWith('/reaction-verification.')) {
		res.setHeader('content-type', url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css');
		res.end(readFileSync(`static${url.pathname}`));
	} else {
		res.setHeader('content-type', 'text/html');
		res.end(url.pathname === '/done' ? 'Done' : reactionPage({
			doc: 'github-com-ilverism-plusmarktest-issues-3-g-729f75654ebec37e',
			action: '/react', ticket: 'test-ticket', ticketId: 'test-id', siteKey: 'test-site-key',
			verified: url.searchParams.has('verified'), returnUrl: '/done', label: '👍 Thumbs Up'
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
	const button = page.getByRole('button', { name: /Submit reaction/i });
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
	await page.evaluate(() => document.querySelector('form').requestSubmit());
	assert.equal(posts, 1, 'submission before verification is ignored');
	await page.evaluate(() => window.challenge.callback('test-token'));
	await settle();
	assert.equal(posts, 1, 'Turnstile success must not auto-submit');
	assert.equal(await button.isEnabled(), true);
	await page.evaluate(() => window.challenge['expired-callback']());
	assert.equal(await button.isDisabled(), true);
	assert.equal(posts, 1);
	await page.evaluate(() => window.challenge.callback('fresh-token'));
	await page.evaluate(() => window.challenge['error-callback']());
	assert.equal(await button.isDisabled(), true);
	await page.evaluate(() => window.challenge.callback('recovered-token'));
	rejectNext = true;
	await button.click();
	await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Test rejection'));
	assert.equal(posts, 2);
	assert.equal(await button.isVisible(), true, 'button reappears after a failed submission');
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
			const action = await button.boundingBox();
			assert.ok(Math.abs(action.x + action.width / 2 - (card.x + card.width / 2)) < 1);
			assert.ok(Math.abs(action.y + action.height / 2 - (card.y + card.height)) < 6);
			assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
			await page.screenshot({ path: `.cache-probes/explicit-submit-${colorScheme}-${width}.png`, fullPage: true });
		}
	}
	assert.equal(posts, 3, 'layout checks never cast votes');
	console.log('Reaction page: explicit submission, pass reuse, expiry, retries, keyboard and responsive layout passed.');
} finally {
	await browser.close();
	await new Promise(resolve => server.close(resolve));
}
