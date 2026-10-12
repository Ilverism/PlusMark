import { expect, test } from '@playwright/test';

for (const preference of [
	{ browser: 'dark', saved: null, expected: 'dark' },
	{ browser: 'light', saved: null, expected: 'light' },
	{ browser: 'light', saved: 'dark', expected: 'dark' },
	{ browser: 'dark', saved: 'light', expected: 'light' },
	{ browser: 'dark', saved: 'system', expected: 'dark' }
] as const) {
	test(`badge theme defaults to ${preference.expected} with browser ${preference.browser} and saved ${preference.saved}`, async ({ page }) => {
		await page.emulateMedia({ colorScheme: preference.browser });
		await page.addInitScript(saved => {
			if (saved !== null) localStorage.setItem('plusmark:theme', saved);
		}, preference.saved);
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		const badgeTheme = page.getByLabel('Badge Theme', { exact: true });
		await expect(badgeTheme).toHaveValue(preference.expected);
		await badgeTheme.selectOption('soft-dark');
		await page.getByRole('button', { name: /Switch to .* theme/ }).click();
		await expect(badgeTheme).toHaveValue('soft-dark');
	});
}

test('theme toggle preserves edits and persists across reloads', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'light' });
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await expect(page.locator('html')).not.toHaveClass(/dark/);
	await page.getByPlaceholder('my-markdown-document', { exact: true }).fill('theme-preview');
	const lightBackground = await page.locator('.main-card').evaluate(el => getComputedStyle(el).backgroundColor);
	const toggle = page.getByRole('button', { name: 'Switch to dark theme' });
	await toggle.focus();
	await page.keyboard.press('Enter');
	await expect(page.locator('html')).toHaveClass(/dark/);
	await expect(page.getByPlaceholder('my-markdown-document', { exact: true })).toHaveValue('theme-preview');
	await expect.poll(() => page.locator('.main-card').evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(lightBackground);
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(page.locator('html')).toHaveClass(/dark/);
	await page.getByRole('button', { name: 'Switch to light theme' }).click();
	await page.reload();
	await expect(page.locator('html')).not.toHaveClass(/dark/);
});
