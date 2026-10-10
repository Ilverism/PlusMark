import { expect, test } from '@playwright/test';

test('theme toggle preserves edits and persists across reloads', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark' });
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
