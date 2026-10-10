import { expect, test } from '@playwright/test';

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
