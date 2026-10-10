import { expect, test } from '@playwright/test';

test('auto-fills from a complete URL without overwriting manual IDs', async ({ page, context }) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const url = page.getByLabel('Return URL', { exact: true });
	const id = page.getByLabel('Content ID', { exact: true });
	await url.pressSequentially('https://example.com/my-article');
	await expect(id).toHaveValue('');
	await url.press('Tab');
	await expect(id).toHaveValue('example-com-my-article');
	await url.fill('https://example.com/updated');
	await url.press('Tab');
	await expect(id).toHaveValue('example-com-updated');
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.evaluate(() => navigator.clipboard.writeText('https://github.com/owner/repo/issues/1#comment-2'));
	await url.fill('');
	await url.press('Control+V');
	await expect(id).toHaveValue('github-com-owner-repo-issues-1-comment-2');
	await id.fill('my-custom-id');
	await url.fill('https://example.com/another');
	await url.press('Tab');
	await expect(id).toHaveValue('my-custom-id');
	await id.clear();
	await url.fill('https://example.com/final');
	await url.press('Tab');
	await expect(id).toHaveValue('');
	await url.fill('');
	await url.press('Control+V');
	await expect(id).toHaveValue('github-com-owner-repo-issues-1-comment-2');
	await id.fill('my-custom-id');
	await url.fill('');
	await url.press('Control+V');
	await expect(id).toHaveValue('my-custom-id');
});

for (const theme of ['light', 'dark']) {
	test(`reveals invalid fields on Generate and clears errors when corrected (${theme})`, async ({ page }) => {
		let requests = 0;
		await page.route('**/api/widgets', async route => {
			requests++;
			await route.fulfill({ json: { widget: route.request().postDataJSON() } });
		});
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark theme' }).click();
		const url = page.getByLabel('Return URL', { exact: true });
		const id = page.getByLabel('Content ID', { exact: true });
		const name = page.getByRole('textbox', { name: 'Name', exact: true }).first();
		await url.fill('not a URL');
		await id.fill(' ');
		await name.fill(' ');
		await expect(page.locator('input[aria-invalid="true"]')).toHaveCount(0);
		const normalBackground = await url.evaluate(el => getComputedStyle(el).backgroundColor);
		await page.getByRole('button', { name: 'Generate', exact: true }).click();
		for (const field of [url, id, name]) await expect(field).toHaveAttribute('aria-invalid', 'true');
		await expect.poll(() => url.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(normalBackground);
		expect(requests).toBe(0);
		await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeVisible();
		await expect(page.locator('.main-card-generated')).toHaveCount(0);
		await url.fill('ftp://example.com');
		await expect(url).toHaveAttribute('aria-invalid', 'true');
		await url.fill('https://example.com/article');
		await id.fill('valid-id');
		await name.fill('Helpful');
		await expect(page.locator('input[aria-invalid="true"]')).toHaveCount(0);
		await page.getByRole('button', { name: 'Generate', exact: true }).click();
		await expect(page.locator('.main-card-generated')).toContainText('Helpful');
		expect(requests).toBe(1);
	});
}
