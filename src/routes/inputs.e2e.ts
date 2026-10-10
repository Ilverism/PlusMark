import { expect, test } from '@playwright/test';

test('shadcn fields update generated Markdown and persist the badge preference', async ({ page }) => {
	await page.route('**/api/widgets', async route => {
		const widget = route.request().postDataJSON();
		await route.fulfill({ json: { widget } });
	});
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const badge = page.getByRole('checkbox', { name: 'Include PlusMark badge' });
	await badge.focus();
	await page.keyboard.press('Space');
	await expect(badge).not.toBeChecked();
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(badge).not.toBeChecked();
	await page.getByRole('textbox', { name: 'Return URL', exact: true }).fill('https://example.com/article');
	// Commit the URL auto-fill before selecting the ID text to replace.
	await page.getByRole('textbox', { name: 'Content ID', exact: true }).click();
	await page.getByRole('textbox', { name: 'Content ID', exact: true }).fill('input-migration');
	await page.getByLabel('Reaction Group ID', { exact: true }).clear();
	const names = page.locator('.reaciton-card-body [data-slot="input"]');
	await names.nth(0).fill('Useful');
	await names.nth(1).fill('This helped me');
	const request = page.waitForRequest('**/api/widgets');
	await page.getByRole('button', { name: 'Generate', exact: true }).click();
	expect((await request).postDataJSON()).toMatchObject({
		doc: 'input-migration', returnUrl: 'https://example.com/article',
		reactions: expect.arrayContaining([expect.objectContaining({ label: 'Useful', description: 'This helped me' })])
	});
	await expect(page.locator('.main-card-generated')).toContainText('Useful');
	await expect(page.locator('.main-card-generated')).not.toContainText('PlusMark-badge.svg');
});

test('shadcn search filters emoji and clears in both themes', async ({ page }) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	for (const theme of ['light', 'dark']) {
		if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark theme' }).click();
		const trigger = page.getByRole('button', { name: /Change reaction emoji/ }).first();
		await trigger.click();
		const search = page.getByRole('searchbox', { name: 'Search emoji' });
		await expect(search).toHaveAttribute('data-slot', 'input');
		await search.fill('no-emoji-matches-this');
		await expect(page.locator('.reaction-card-emoji-option')).toHaveCount(0);
		await search.clear();
		await expect(page.locator('.reaction-card-emoji-option').first()).toBeVisible();
		await trigger.click();
	}
});
