import { expect, test } from '@playwright/test';

test('group IDs stay stable during editing and generation; New group isolates votes', async ({ page, request }) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const group = page.getByLabel('Reaction group ID', { exact: true });
	await expect(group).toHaveValue(/^[a-f0-9]{16}$/);
	const original = await group.inputValue();
	const base = `groups-${Date.now()}`;
	await page.locator('#return-url').fill('https://example.com/article#intro');
	await page.locator('#content-id').click();
	await page.locator('#content-id').fill(base);
	await page.getByRole('textbox', { name: 'Name', exact: true }).first().fill('Helpful');
	await expect(group).toHaveValue(original);
	await expect(page.locator('#content-id')).toHaveValue(base);
	await expect(page.getByRole('textbox', { name: 'Name', exact: true }).first()).toHaveValue('Helpful');
	await expect(page.getByLabel('Reject votes from other URLs', { exact: true })).toBeChecked();
	await page.getByRole('button', { name: 'Generate', exact: true }).click();
	await expect(page.locator('.main-card-generated-code')).toContainText(`doc=${base}-g-${original}`);
	await request.get(`/react?doc=${base}-g-${original}&r=helpful`, { maxRedirects: 0 });
	await page.getByRole('textbox', { name: 'Name', exact: true }).first().fill('Helpful');
	await page.getByRole('button', { name: 'Generate', exact: true }).click();
	await expect(page.locator('.main-card-generated-code')).toContainText(`doc=${base}-g-${original}`);
	await page.getByRole('button', { name: 'Randomize reaction group ID', exact: true }).click();
	await expect(group).not.toHaveValue(original);
	const fresh = await group.inputValue();
	await page.getByRole('button', { name: 'Generate', exact: true }).click();
	await expect(page.locator('.main-card-generated-code')).toContainText(`doc=${base}-g-${fresh}`);
	expect(await (await request.get(`/badge?doc=${base}-g-${original}&r=helpful`)).text()).toContain('👍 1');
	expect(await (await request.get(`/badge?doc=${base}-g-${fresh}&r=helpful`)).text()).toContain('👍 0');
});

test('manual and empty groups, validation and opt-out persist', async ({ page }) => {
	const payloads: { doc: string; verifyReferrer: boolean }[] = [];
	await page.route('**/api/widgets', route => {
		const widget = route.request().postDataJSON();
		payloads.push(widget);
		return route.fulfill({ json: { widget } });
	});
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.locator('#return-url').fill('https://example.com/article');
	await page.locator('#content-id').click();
	await page.locator('#content-id').fill('manual');
	const group = page.locator('#reaction-group-id');
	await group.fill('!!!');
	await expect(group).toHaveAttribute('aria-invalid', 'false');
	await page.getByRole('button', { name: 'Generate', exact: true }).click();
	await expect(group).toHaveAttribute('aria-invalid', 'true');
	expect(payloads).toHaveLength(0);
	await group.fill('Intro');
	await page.getByRole('button', { name: 'Generate', exact: true }).click();
	await expect(page.locator('.main-card-generated-code')).toContainText('doc=manual-g-intro');
	expect(payloads[0]).toMatchObject({ doc: 'manual-g-intro', verifyReferrer: true });
	await group.clear();
	await page.getByLabel('Reject votes from other URLs', { exact: true }).uncheck();
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(group).toHaveValue(/^[a-f0-9]{16}$/);
	await expect(page.getByLabel('Reject votes from other URLs', { exact: true })).not.toBeChecked();
	await page.locator('#return-url').fill('https://example.com/article');
	await page.locator('#content-id').click();
	await page.locator('#content-id').fill('manual');
	await group.clear();
	await page.getByRole('button', { name: 'Generate', exact: true }).click();
	await expect(page.locator('.main-card-generated-code')).toContainText('doc=manual&r=');
	expect(payloads[1]).toMatchObject({ doc: 'manual', verifyReferrer: false });
	await page.locator('#content-id').fill('x'.repeat(120));
	await group.fill('preserve-me');
	await expect(group).toHaveValue('preserve-me');
	await expect(page.locator('#content-id')).toHaveValue('x'.repeat(120));
	await page.getByRole('button', { name: 'Generate', exact: true }).click();
	await expect(group).toHaveAttribute('aria-invalid', 'true');
	expect(payloads).toHaveLength(2);
});

test('API verifies sources before toggling, escapes the recovery link, and preserves legacy behavior', async ({ request }) => {
	const doc = `sources-${Date.now()}`;
	const returnUrl = 'https://example.com/article?section=1&note=%22%3E%3Cscript%3E#comment';
	const reactions = [{ id: 'like', emoji: '👍', label: 'Like', description: '' }];
	expect((await request.post('/api/widgets', { data: { doc, returnUrl, reactions, verifyReferrer: 'yes' } })).status()).toBe(400);
	const response = await request.post('/api/widgets', { data: { doc, returnUrl, reactions, verifyReferrer: true } });
	const { editToken, widget } = await response.json();
	expect(widget.verifyReferrer).toBe(true);
	for (const referer of ['https://elsewhere.example/', 'https://example.com/another', 'https://example.com/article?section=2']) {
		const rejected = await request.get(`/react?doc=${doc}&r=like`, { headers: { referer }, maxRedirects: 0 });
		expect(rejected.status()).toBe(403);
		expect(rejected.headers()['cache-control']).toBe('no-store');
		const html = await rejected.text();
		expect(html).toContain('Reaction not recorded');
		expect(html).toContain('&#38;note=');
		expect(html).not.toContain('<script>');
	}
	expect(await (await request.get(`/badge?doc=${doc}&r=like`)).text()).toContain('👍 0');
	const accepted = await request.get(`/react?doc=${doc}&r=like`, { headers: { referer: returnUrl.split('#')[0] }, maxRedirects: 0 });
	expect(accepted.status()).toBe(302);
	expect(accepted.headers().location).toBe(returnUrl);
	await request.get(`/react?doc=${doc}&r=like`, { headers: { referer: 'https://elsewhere.example/' }, maxRedirects: 0 });
	expect(await (await request.get(`/badge?doc=${doc}&r=like`)).text()).toContain('👍 1');
	await request.post('/api/widgets', { data: { doc, returnUrl, reactions, editToken } });
	expect((await request.get(`/react?doc=${doc}&r=like`, { headers: { referer: 'https://elsewhere.example/' }, maxRedirects: 0 })).status()).toBe(403);
	expect((await request.get(`/react?doc=${doc}&r=like`, { maxRedirects: 0 })).status()).toBe(302);
	const legacy = `${doc}-legacy`;
	await request.post('/api/widgets', { data: { doc: legacy, returnUrl, reactions } });
	expect((await request.get(`/react?doc=${legacy}&r=like`, { headers: { referer: 'https://elsewhere.example/' }, maxRedirects: 0 })).status()).toBe(302);
});

test('unavailable or corrupt draft/token storage still permits a new draft', async ({ page }) => {
	await page.addInitScript(() => { localStorage.setItem('plusmark:reaction-draft:v1', '{broken'); });
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await expect(page.locator('#reaction-group-id')).toHaveValue(/^[a-f0-9]{16}$/);
	await page.addInitScript(() => {
		const get = Storage.prototype.getItem;
		const set = Storage.prototype.setItem;
		// Exercise this feature's storage without disabling the separate theme library.
		const blocked = (key: string) => key === 'plusmark:reaction-draft:v1' || key.startsWith('plusmark:edit-token:');
		Storage.prototype.getItem = function (key) { if (blocked(key)) throw new Error('blocked'); return get.call(this, key); };
		Storage.prototype.setItem = function (key, value) { if (blocked(key)) throw new Error('blocked'); set.call(this, key, value); };
	});
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(page.locator('#reaction-group-id')).toHaveValue(/^[a-f0-9]{16}$/);
	await page.locator('#return-url').fill('https://example.com/article');
	await page.locator('#content-id').click();
	await page.locator('#content-id').fill(`no-storage-${Date.now()}`);
	await page.getByRole('button', { name: 'Generate', exact: true }).click();
	await expect(page.locator('.main-card-generated-code')).toContainText('/badge?doc=');
	await page.getByRole('textbox', { name: 'Name', exact: true }).first().fill('Updated');
	await page.getByRole('button', { name: 'Generate', exact: true }).click();
	await expect(page.locator('.main-card-generated-code')).toContainText('Updated');
});

test('real browser navigation rejects a copied link and permits the intended page', async ({ page, request, baseURL }) => {
	const doc = `navigation-${Date.now()}`;
	const returnUrl = new URL('/source-allowed', baseURL).href;
	await request.post('/api/widgets', { data: { doc, returnUrl, verifyReferrer: true, reactions: [{ id: 'like', emoji: '👍', label: 'Like', description: '' }] } });
	await page.route('**/source-*', route => route.fulfill({ contentType: 'text/html', body: `<a href="/react?doc=${doc}&r=like">React</a>` }));
	await page.goto('/source-wrong');
	await page.getByRole('link', { name: 'React', exact: true }).click();
	await expect(page.getByRole('heading')).toHaveText('Reaction not recorded');
	await expect(page.getByRole('link', { name: 'Open the intended page' })).toHaveAttribute('href', returnUrl);
	expect(await (await request.get(`/badge?doc=${doc}&r=like`)).text()).toContain('👍 0');
	await page.getByRole('link', { name: 'Open the intended page' }).click();
	await page.getByRole('link', { name: 'React', exact: true }).click();
	await expect(page).toHaveURL(returnUrl);
	expect(await (await request.get(`/badge?doc=${doc}&r=like`)).text()).toContain('👍 1');
});
