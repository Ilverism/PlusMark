import { expect, test } from '@playwright/test';

test('automated probes do not create identities or add/remove votes', async ({ request }) => {
	const doc = `automated-probes-${crypto.randomUUID()}`;
	const returnUrl = 'https://example.com/markdown-source';
	const created = await request.post('/api/widgets', {
		data: { doc, returnUrl, verifyReferrer: true, reactions: [{ id: 'like', emoji: '👍', label: 'Like', description: '' }] }
	});
	expect(created.ok()).toBe(true);
	const reactionUrl = `/react?doc=${doc}&r=like`;
	const speculativeHeaders: Record<string, string>[] = [
		{ 'Sec-Purpose': 'prefetch' },
		{ 'Sec-Purpose': 'prefetch;prerender' },
		{ Purpose: 'prefetch' },
		{ 'X-Purpose': 'preview, prefetch' },
		{ 'X-Moz': 'prefetch' },
		{ Purpose: 'Prerender' }
	];
	const probes = [
		{ method: 'HEAD', headers: {} },
		...speculativeHeaders.map(headers => ({ method: 'GET', headers }))
	];
	for (const count of [0, 1]) {
		for (const probe of probes) {
			const response = await request.fetch(reactionUrl, { ...probe, maxRedirects: 0 });
			expect(response.status()).toBe(204);
			expect(await response.body()).toHaveLength(0);
			expect(response.headers()['set-cookie']).toBeUndefined();
			expect(response.headers().location).toBeUndefined();
			expect(response.headers()['cache-control']).toContain('no-store');
			expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow');
			expect(await (await request.get(`/badge?doc=${doc}&r=like`)).text()).toContain(`👍 ${count}`);
		}
		// The same visitor still adds/removes a vote through an ordinary link request.
		const click = await request.get(reactionUrl, { maxRedirects: 0 });
		expect(click.status()).toBe(302);
		expect(click.headers().location).toBe(returnUrl);
		expect(click.headers()['cache-control']).toContain('no-store');
		expect(click.headers()['x-robots-tag']).toBe('noindex, nofollow');
		expect(await (await request.get(`/badge?doc=${doc}&r=like`)).text()).toContain(`👍 ${1 - count}`);
	}
});

test('crawler guidance excludes reaction links', async ({ request }) => {
	const robots = await request.get('/robots.txt');
	expect(robots.ok()).toBe(true);
	expect(await robots.text()).toMatch(/^Disallow: \/react\s*$/m);
});

test('creates, protects, badges, and toggles a reaction widget', async ({ request }) => {
	const doc = `playwright-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const returnUrl = 'https://example.com/markdown-source';
	const reactions = [
		{
			id: 'thumbs-up',
			emoji: '👍',
			label: 'Thumbs Up',
			description: 'Like this'
		}
	];

	const createResponse = await request.post('/api/widgets', {
		data: { doc, returnUrl, reactions }
	});
	expect(createResponse.ok()).toBe(true);

	const createBody = await createResponse.json() as { editToken: string };
	expect(createBody.editToken).toBeTruthy();

	const blockedUpdate = await request.post('/api/widgets', {
		data: {
			doc,
			returnUrl,
			reactions: [{ ...reactions[0], label: 'Updated without token' }]
		}
	});
	expect(blockedUpdate.status()).toBe(409);

	const allowedUpdate = await request.post('/api/widgets', {
		data: {
			doc,
			returnUrl,
			editToken: createBody.editToken,
			reactions: [{ ...reactions[0], label: 'Updated with token' }]
		}
	});
	expect(allowedUpdate.ok()).toBe(true);

	const unknownBadge = await request.get(`/badge?doc=${doc}&r=missing`);
	expect(unknownBadge.status()).toBe(404);
	expect(unknownBadge.headers()['content-type']).toContain('image/svg+xml');

	const firstClick = await request.get(`/react?doc=${doc}&r=thumbs-up`, {
		maxRedirects: 0
	});
	expect(firstClick.status()).toBe(302);
	expect(firstClick.headers().location).toBe(returnUrl);

	const setCookie = firstClick.headers()['set-cookie'];
	expect(setCookie).toContain('pm_vid=');

	const badgeAfterClick = await request.get(`/badge?doc=${doc}&r=thumbs-up`);
	expect(await badgeAfterClick.text()).toContain('👍 1');
	expect(await badgeAfterClick.text()).toContain('filter="url(#emoji-shadow)"');
	// Camo cached stale counts without an explicit zero TTL, despite no-cache/no-store.
	expect(badgeAfterClick.headers()['cache-control']).toContain('max-age=0');

	const secondClick = await request.get(`/react?doc=${doc}&r=thumbs-up`, {
		headers: { cookie: setCookie.split(';')[0] },
		maxRedirects: 0
	});
	expect(secondClick.status()).toBe(302);

	const badgeAfterToggle = await request.get(`/badge?doc=${doc}&r=thumbs-up`);
	expect(await badgeAfterToggle.text()).toContain('👍 0');
});

test('generated Markdown ends with a renderable linked PlusMark badge', async ({ page, request }) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await expect(page.getByRole('checkbox', { name: 'Include PlusMark badge' })).toBeChecked();
	await page.getByLabel('Return URL', { exact: true }).fill('https://example.com/markdown-source');
	await page.getByLabel('Content ID', { exact: true }).click();
	await page.getByLabel('Content ID', { exact: true }).fill(`badge-output-${Date.now()}`);
	await page.getByRole('button', { name: 'Generate', exact: true }).click();
	const output = page.locator('.main-card-generated code');
	await expect(output).toContainText('/PlusMark-badge.svg)](https://plusmark.ilverism.workers.dev/)');
	const markdown = (await output.innerText()).trim();
	expect(markdown.endsWith('/PlusMark-badge.svg)](https://plusmark.ilverism.workers.dev/)')).toBe(true);
	const logo = await request.get('/PlusMark-badge.svg');
	expect(logo.ok()).toBe(true);
	expect(logo.headers()['content-type']).toContain('image/svg+xml');
	const images = [...markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1]);
	expect(images).toHaveLength(3);
	await page.evaluate(urls => {
		for (const url of urls) {
			const image = document.createElement('img');
			image.className = 'generated-badge-check';
			image.src = url;
			document.body.append(image);
		}
	}, images);
	await expect.poll(() => page.locator('.generated-badge-check').evaluateAll(images =>
		images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalHeight === 24)
	)).toBe(true);
});

test('remembers the logo preference and applies it to regenerated Markdown', async ({ page }) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const includeBadge = page.getByRole('checkbox', { name: 'Include PlusMark badge' });
	await expect(includeBadge).toBeChecked();
	await includeBadge.uncheck();
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(includeBadge).not.toBeChecked();
	await page.getByLabel('Return URL', { exact: true }).fill('https://example.com/markdown-source');
	await page.getByLabel('Content ID', { exact: true }).click();
	await page.getByLabel('Content ID', { exact: true }).fill(`badge-preference-${Date.now()}`);
	const generate = page.getByRole('button', { name: 'Generate', exact: true });
	const output = page.locator('.main-card-generated code');
	await generate.click();
	await expect(output).toContainText('/badge?');
	await expect(output).not.toContainText('PlusMark-badge.svg');
	await includeBadge.check();
	await generate.click();
	await expect(output).toContainText('PlusMark-badge.svg');
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(includeBadge).toBeChecked();
});
