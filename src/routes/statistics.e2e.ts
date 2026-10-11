import { expect, test } from '@playwright/test';

test('displays concise totals at the top center and handles unavailable statistics', async ({ page }) => {
	await page.route('**/api/statistics', route => route.fulfill({ json: { reactions: 12345, votes: 67890 } }));
	await page.setViewportSize({ width: 1440, height: 1100 });
	await page.goto('/');
	const counters = page.locator('.service-statistics');
	await expect(counters).toContainText('12.3K Reactions Generated / 67.9K Votes Submitted');
	const bounds = (await counters.boundingBox())!;
	expect(Math.abs(bounds.x + bounds.width / 2 - 720)).toBeLessThan(2);
	expect(bounds.y).toBeLessThan(40);
	await page.screenshot({ path: '.cache-probes/statistics-desktop.png' });
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(counters).toBeVisible();
	const small = (await counters.boundingBox())!;
	expect(small.y).toBeGreaterThan(60);
	expect((await page.locator('h2').boundingBox())!.y).toBeGreaterThanOrEqual(small.y + small.height);
	await page.screenshot({ path: '.cache-probes/statistics-mobile.png' });
	await page.route('**/api/statistics', route => route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
	await page.reload();
	await expect(counters).toContainText('— Reactions Generated / — Votes Submitted');
	await expect(page.getByLabel('Return URL', { exact: true })).toBeEnabled();
});

test('statistics endpoint counts new reactions once and has no public write endpoint', async ({ request }) => {
	const before = await (await request.get('/api/statistics')).json();
	const widget = { doc: `statistics-${crypto.randomUUID()}`, returnUrl: 'https://example.test/source', reactions: [
		{ id: 'like', emoji: '👍', label: 'Like', description: '' },
		{ id: 'fire', emoji: '🔥', label: 'Fire', description: '' }
	] };
	const response = await request.post('/api/widgets', { data: widget });
	expect(response.ok()).toBe(true);
	const { editToken } = await response.json();
	await request.post('/api/widgets', { data: { ...widget, editToken } });
	await request.get(`/badge?doc=${widget.doc}&r=like`);
	await request.get(`/react?doc=${widget.doc}&r=like`);
	const after = await (await request.get('/api/statistics')).json();
	expect(after).toEqual({ reactions: before.reactions + 2, votes: before.votes });
	expect((await request.post('/api/statistics', { data: { reactions: 9999, votes: 9999 } })).status()).toBe(405);
});
