import { expect, test } from '@playwright/test';

test('Sonner warns on existing group updates, deduplicates retries, and follows the page theme', async ({ page }) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.locator('#return-url').fill('https://example.test/notifications');
	await page.locator('#return-url').press('Tab');
	await page.locator('#content-id').fill(`toast-${crypto.randomUUID()}`);
	const generate = page.getByRole('button', { name: 'Generate', exact: true });
	const created = page.waitForResponse(response => response.url().endsWith('/api/widgets') && response.request().method() === 'POST');
	await generate.click();
	expect((await (await created).json()).created).toBe(true);
	await expect(page.locator('.main-card-generated-code')).toContainText('/badge?doc=');
	await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
	for (let attempt = 0; attempt < 2; attempt++) {
		await page.getByLabel('Formatting', { exact: true }).selectOption(attempt === 0 ? 'column' : 'row');
		const updated = page.waitForResponse(response => response.url().endsWith('/api/widgets') && response.request().method() === 'POST');
		await generate.click();
		expect((await (await updated).json()).created).toBe(false);
		await expect(page.locator('[data-sonner-toast][data-type="warning"]')).toContainText('Existing reaction group updated');
		await expect(page.locator('[data-sonner-toast]')).toHaveCount(1);
	}
	await page.getByRole('button', { name: 'Switch to dark theme' }).click();
	await expect(page.locator('[data-sonner-toaster]')).toHaveAttribute('data-sonner-theme', 'dark');
	await page.locator('[data-sonner-toast] [data-close-button]').click();
	await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
});

test('Sonner warns on a group collision without edit access and preserves its reactions', async ({ page, request }) => {
	const doc = `toast-collision-${crypto.randomUUID()}`;
	await request.post('/api/widgets', { data: {
		doc, returnUrl: 'https://example.test/original', reactions: [{ id: 'original', emoji: '🔥', label: 'Original', description: '' }]
	} });
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.locator('#return-url').fill('https://example.test/replacement');
	await page.locator('#return-url').press('Tab');
	await page.locator('#content-id').fill(doc);
	await page.locator('#reaction-group-id').fill('');
	await page.getByRole('button', { name: 'Generate', exact: true }).click();
	await expect(page.locator('[data-sonner-toast][data-type="warning"]')).toContainText('Reaction group already exists');
	await expect(page.locator('.main-card-generated-code')).not.toContainText('/badge?doc=');
	expect(await (await request.get(`/badge?doc=${doc}&r=original`)).text()).toContain('Original');
});

test('Sonner reports invalid fields and failed requests, then clears the notification on a successful retry', async ({ page }) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const generate = page.getByRole('button', { name: 'Generate', exact: true });
	await generate.click();
	await expect(page.locator('[data-sonner-toast]')).toContainText('Check the highlighted fields');
	await page.locator('#return-url').fill('https://example.test/errors');
	await page.locator('#return-url').press('Tab');
	await page.locator('#content-id').fill(`toast-error-${crypto.randomUUID()}`);
	await page.route('**/api/widgets', route => route.abort());
	await generate.click();
	await expect(page.locator('[data-sonner-toast][data-type="error"]')).toContainText('Could not generate reactions');
	await page.unroute('**/api/widgets');
	await page.getByLabel('Formatting', { exact: true }).selectOption('column');
	await generate.click();
	await expect(page.locator('.main-card-generated-code')).toContainText('/badge?doc=');
	await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
});

test('ID tag checkbox generates the saved full ID in each format and copies it unchanged', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const toggle = page.getByRole('checkbox', { name: 'Include ID tag' });
	await expect(toggle).not.toBeChecked();
	await page.locator('#return-url').fill('https://example.test/id-tag');
	await page.locator('#content-id').fill(`id-tag-${Date.now()}`);
	await toggle.check();
	for (const source of [true, false]) {
		await page.getByRole('checkbox', { name: 'Include source badge' }).setChecked(source);
		for (const format of ['row', 'column', 'table-no-desc', 'table-with-desc']) {
			await page.getByLabel('Formatting', { exact: true }).selectOption(format);
			await page.getByRole('button', { name: 'Generate', exact: true }).click();
			const output = page.locator('.main-card-generated-code');
			await expect(output).toContainText('<sup><sub><code>');
			const text = (await output.textContent())!.trim();
			const doc = new URL(text.match(/https?:\/\/[^\s)]+\/badge\?[^)]+/)![0]).searchParams.get('doc');
			expect(doc).toMatch(/-g-[a-z0-9]+$/);
			const tag = `<sup><sub><code>${doc}</code></sub></sup>`;
			expect(text.split(tag)).toHaveLength(2);
			if (format === 'row') expect(text.endsWith(`\n\n${tag}`)).toBe(true);
			if (format === 'column') expect(text.split('\n').at(-2)).toBe(tag);
			if (format.startsWith('table-')) {
				const rows = text.split('\n').map(row => row.slice(2, -2).split(' | '));
				expect(rows[0][2]).toBe(source ? 'Source' : 'ID');
				expect(rows[format === 'table-with-desc' ? 3 : 2][2]).toContain(tag);
			}
			await page.getByRole('button', { name: 'Copy', exact: true }).click();
			expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(text);
		}
	}
	await toggle.uncheck();
	await page.getByRole('button', { name: 'Generate', exact: true }).click();
	await expect(page.locator('.main-card-generated-code')).toContainText('/badge?doc=');
	await expect(page.locator('.main-card-generated-code')).not.toContainText('<sup>');
});

test('probes do not create identities and ordinary GETs do not vote', async ({ request }) => {
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
	for (let visit = 0; visit < 2; visit++) {
		for (const probe of probes) {
			const response = await request.fetch(reactionUrl, { ...probe, maxRedirects: 0 });
			expect(response.status()).toBe(204);
			expect(await response.body()).toHaveLength(0);
			expect(response.headers()['set-cookie']).toBeUndefined();
			expect(response.headers().location).toBeUndefined();
			expect(response.headers()['cache-control']).toContain('no-store');
			expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow');
			expect(await (await request.get(`/badge?doc=${doc}&r=like`)).text()).toContain('👍 0');
		}
		// Ordinary link fetches also remain read-only until a verified POST.
		const click = await request.get(reactionUrl, { maxRedirects: 0 });
		expect(click.status()).toBe(200);
		expect(await click.text()).toContain('name="ticket"');
		expect(click.headers()['cache-control']).toContain('no-store');
		expect(click.headers()['x-robots-tag']).toBe('noindex, nofollow');
		expect(await (await request.get(`/badge?doc=${doc}&r=like`)).text()).toContain('👍 0');
	}
});

test('verification rejects a fake token and permits an explicit retry without an automatic loop', async ({ page, request }) => {
	const doc = `verification-failure-${crypto.randomUUID()}`;
	await request.post('/api/widgets', { data: { doc, returnUrl: 'https://example.com/', reactions: [{ id: 'like', emoji: '👍', label: 'Like', description: '' }] } });
	await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', route => route.fulfill({
		contentType: 'text/javascript', body: `window.turnstile = {
			render(selector, options) { this.options=options; window.verifyReaction = () => options.callback('invalid-test-token'); return 'test'; },
			reset() { setTimeout(()=>this.options.callback('invalid-test-token'),0); }
		};`
	}));
	let posts = 0;
	page.on('request', req => { if (req.method() === 'POST' && req.url().includes('/react?')) posts++; });
	await page.goto(`/react?doc=${doc}&r=like`);
	await page.waitForFunction(() => 'verifyReaction' in window);
	await expect(page.locator('form button')).toBeHidden();
	expect(posts).toBe(0);
	await page.evaluate(() => (window as unknown as { verifyReaction: () => void }).verifyReaction());
	await expect(page.getByRole('status')).toContainText('Verification failed', { timeout: 15000 });
	const retry = page.getByRole('button', { name: 'Try again' });
	await expect(retry).toBeVisible();
	await expect(retry).toBeEnabled();
	expect(posts).toBe(1);
	await retry.click();
	await expect(page.getByRole('status')).toContainText('Verification failed', { timeout: 15000 });
	await expect(retry).toBeEnabled();
	expect(posts).toBe(2);
	expect(await (await request.get(`/badge?doc=${doc}&r=like`)).text()).toContain('👍 0');
});

test('verified-page script posts once and returns to the saved URL', async ({ page, request, baseURL }) => {
	const doc = `verification-navigation-${crypto.randomUUID()}`;
	const returnUrl = new URL('/test-return', baseURL).href;
	await request.post('/api/widgets', { data: { doc, returnUrl, reactions: [{ id: 'like', emoji: '👍', label: 'Like', description: '' }] } });
	let posts = 0;
	let challenges = 0;
	await page.route('https://challenges.cloudflare.com/**', route => { challenges++; return route.abort(); });
	await page.route('**/test-return', route => route.fulfill({ contentType: 'text/html', body: '<h1>Returned</h1>' }));
	await page.route('**/react?**', async route => {
		if (route.request().method() === 'POST') {
			posts++;
			expect(route.request().headers().origin).toBe(new URL(baseURL!).origin);
			expect(new URLSearchParams(route.request().postData()!).get('ticket')).toBeTruthy();
			return route.fulfill({ json: { returnUrl } });
		}
		// Exercise the fast-path browser script; real authorization is covered by the route tests.
		const response = await route.fetch();
		await route.fulfill({ response, body: (await response.text()).replace('data-verified="false"', 'data-verified="true"') });
	});
	await page.goto(`/react?doc=${doc}&r=like`);
	await expect(page).toHaveURL(returnUrl);
	expect(posts).toBe(1);
	expect(challenges).toBe(0);
});

test('crawler guidance excludes reaction links', async ({ request }) => {
	const robots = await request.get('/robots.txt');
	expect(robots.ok()).toBe(true);
	expect(await robots.text()).toMatch(/^Disallow: \/react\s*$/m);
});

test('source badges identify the saved destination, match reaction dots, and render as images', async ({ page, request }) => {
	const doc = `source-badge-${crypto.randomUUID()}`;
	const returnUrl = 'https://example.test/a-long-document-path/with-more-sections?name=%22%3Cunsafe%3E#comment-123';
	await request.post('/api/widgets', { data: { doc, returnUrl, reactions: [{ id: 'like', emoji: '👍', label: 'Like', description: '' }] } });
	const source = await request.get(`/source-badge?doc=${doc}&returnUrl=https://evil.example/`);
	expect(source.status()).toBe(200);
	expect(source.headers()['content-type']).toContain('image/svg+xml');
	const svg = await source.text();
	expect(svg).toContain(`Source: ${returnUrl}`);
	expect(svg).not.toContain('evil.example');
	const reaction = await (await request.get(`/badge?doc=${doc}&r=like`)).text();
	expect(svg.match(/<linearGradient.*?<\/linearGradient>/s)?.[0]).toBe(reaction.match(/<linearGradient.*?<\/linearGradient>/s)?.[0]);
	expect((await request.get('/source-badge')).status()).toBe(400);
	expect((await request.get('/source-badge?doc=not-a-real-doc')).status()).toBe(404);
	await page.goto('/');
	await page.evaluate(url => {
		const img = document.createElement('img'); img.id = 'source-badge-check'; img.src = url; document.body.append(img);
	}, `/source-badge?doc=${doc}`);
	await expect.poll(() => page.locator('#source-badge-check').evaluate(img => (img as HTMLImageElement).naturalHeight)).toBe(24);
});

test('formatting selects row, column or tables, copies newlines, and resets on reload', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const formatting = page.getByLabel('Formatting', { exact: true });
	await expect(formatting).toHaveValue('row');
	await page.locator('#return-url').fill('https://example.test/table');
	await page.locator('#content-id').fill(`formatting-${Date.now()}`);
	for (const [format, lines] of [['table-no-desc', 3], ['table-with-desc', 4], ['column', 4], ['row', 1]] as const) {
		await formatting.selectOption(format);
		await page.getByRole('button', { name: 'Generate', exact: true }).click();
		const output = page.locator('.main-card-generated-code');
		await expect(output).toContainText('/badge?doc=');
		const text = (await output.textContent())!.trim();
		expect(text.split('\n')).toHaveLength(lines);
		if (format.startsWith('table-')) expect(text.split('\n')[0]).toBe('| Thumbs Up | Thumbs Down | Source | PlusMark |');
		if (format === 'column') expect(text.split('\n')).toHaveLength(4);
		if (format === 'table-with-desc') expect(text.split('\n')[3]).toBe('| I like this! | I dislike this! |  |  |');
		await page.getByRole('button', { name: 'Copy', exact: true }).click();
		await expect(page.getByRole('status')).toContainText('Copied!');
		expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(text);
	}
	await formatting.selectOption('table-with-desc');
	await page.reload();
	await expect(formatting).toHaveValue('row');
});

test('source badge defaults on and can be omitted from generated output', async ({ page }) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const toggle = page.getByRole('checkbox', { name: 'Include source badge' });
	await expect(toggle).toBeChecked();
	await page.locator('#return-url').fill('https://example.test/article#section');
	await page.locator('#content-id').fill(`source-option-${Date.now()}`);
	await page.getByRole('button', { name: 'Generate', exact: true }).click();
	await expect(page.locator('.main-card-generated-code')).toContainText('/source-badge?doc=');
	await expect(page.locator('.main-card-generated-code')).toContainText('](<https://example.test/article#section>)');
	await toggle.uncheck();
	await page.getByRole('button', { name: 'Generate', exact: true }).click();
	await expect(page.locator('.main-card-generated-code')).toContainText('/badge?doc=');
	await expect(page.locator('.main-card-generated-code')).not.toContainText('/source-badge?');
});

test('creates, protects, and renders a reaction widget without voting on GET', async ({ request }) => {
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
	expect(firstClick.status()).toBe(200);
	expect(await firstClick.text()).toContain('data-verified="false"');

	const setCookie = firstClick.headers()['set-cookie'];
	expect(setCookie).toContain('pm_vid=');

	const badgeAfterClick = await request.get(`/badge?doc=${doc}&r=thumbs-up`);
	expect(await badgeAfterClick.text()).toContain('👍 0');
	expect(await badgeAfterClick.text()).toContain('filter="url(#emoji-shadow)"');
	// Camo cached stale counts without an explicit zero TTL, despite no-cache/no-store.
	expect(badgeAfterClick.headers()['cache-control']).toContain('max-age=0');

	const secondClick = await request.get(`/react?doc=${doc}&r=thumbs-up`, {
		headers: { cookie: setCookie.split(';')[0] },
		maxRedirects: 0
	});
	expect(secondClick.status()).toBe(200);

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
	expect(images).toHaveLength(4);
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

test('badge themes generate matching reaction/source images without changing the branding badge', async ({ page, request }) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const select = page.getByLabel('Badge Theme', { exact: true });
	await expect(select).toHaveValue('light');
	await page.locator('#return-url').fill('https://example.test/themes');
	await page.locator('#content-id').fill(`theme-${crypto.randomUUID()}`);
	const branding = await (await request.get('/PlusMark-badge.svg')).text();
	let reactionUrl = '';
	for (const [theme, background, border] of [
		['light', '#f6f8fa', '#d1d9e0'], ['dark', '#212830', '#3d444d'], ['soft-dark', '#2a313c', '#3d444d']
	]) {
		await select.selectOption(theme);
		await page.getByRole('button', { name: 'Generate', exact: true }).click();
		const output = page.locator('.main-card-generated-code');
		await expect(output).toContainText(`/source-badge?`);
		const markdown = (await output.textContent())!.trim();
		const images = [...markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1]);
		expect(images).toHaveLength(4);
		expect(images[2]).toContain(`&theme=${theme}`);
		expect(images[3]).toMatch(/\/PlusMark-badge\.svg$/);
		if (reactionUrl) expect(images[0]).toBe(reactionUrl);
		reactionUrl = images[0];
		for (const url of images.slice(0, 3)) {
			const svg = await (await request.get(url)).text();
			expect(svg).toContain(`fill="${background}" stroke="${border}"`);
			expect(svg).toContain('height="24"');
		}
		expect(await (await request.get(images[3])).text()).toBe(branding);
	}
	await page.reload();
	await expect(select).toHaveValue('light');
});

test('badge theme validation rejects unknown values and old clients preserve a saved theme', async ({ request }) => {
	const payload = { doc: `theme-api-${crypto.randomUUID()}`, returnUrl: 'https://example.test/', reactions: [{ id: 'like', emoji: '👍', label: 'Like', description: '' }] };
	for (const badgeTheme of ['invalid', '<svg>', null, {}, 1]) {
		expect((await request.post('/api/widgets', { data: { ...payload, badgeTheme } })).status()).toBe(400);
	}
	const created = await (await request.post('/api/widgets', { data: { ...payload, badgeTheme: 'dark' } })).json();
	expect(created.widget.badgeTheme).toBe('dark');
	expect((await request.post('/api/widgets', { data: { ...payload, badgeTheme: 'light' } })).status()).toBe(409);
	const updated = await (await request.post('/api/widgets', { data: { ...payload, editToken: created.editToken } })).json();
	expect(updated.widget.badgeTheme).toBe('dark');
});
