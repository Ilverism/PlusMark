import { expect, test } from '@playwright/test';

test('only preferences restore; old drafts are removed and edit tokens become session-only', async ({ page, context }) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.evaluate(() => {
		localStorage.setItem('plusmark:reaction-draft:v1', JSON.stringify({ contentId: 'old-content', returnUrl: 'https://example.com/old', reactionGroupId: 'old-group', verifyReferrer: false, contentIdEdited: true, reactions: [{ emoji: '❤️', name: 'Old reaction', description: 'Old description' }] }));
		localStorage.setItem('plusmark:edit-token:old-content', 'old-token');
	});
	await page.getByLabel('Include PlusMark badge', { exact: true }).uncheck();
	await page.getByRole('button', { name: 'Switch to dark theme' }).click();
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(page.locator('#return-url')).toHaveValue('');
	await expect(page.locator('#content-id')).toHaveValue('');
	await expect(page.locator('#reaction-group-id')).toHaveValue(/^[a-f0-9]{16}$/);
	await expect(page.getByRole('textbox', { name: 'Name', exact: true }).first()).toHaveValue('Thumbs Up');
	await expect(page.getByLabel('Reject votes from other URLs', { exact: true })).not.toBeChecked();
	await expect(page.getByLabel('Include PlusMark badge', { exact: true })).not.toBeChecked();
	await expect(page.locator('html')).toHaveClass(/dark/);
	expect(await page.evaluate(() => localStorage.getItem('plusmark:reaction-draft:v1'))).toBeNull();
	expect(await page.evaluate(() => localStorage.getItem('plusmark:edit-token:old-content'))).toBeNull();
	expect(await page.evaluate(() => sessionStorage.getItem('plusmark:edit-token:old-content'))).toBe('old-token');
	const group = await page.locator('#reaction-group-id').inputValue();
	await page.locator('#return-url').fill('https://example.com/new');
	await page.locator('#content-id').click();
	await page.locator('#content-id').fill('new-content');
	await page.getByRole('textbox', { name: 'Name', exact: true }).first().fill('New reaction');
	await page.getByLabel('Reject votes from other URLs', { exact: true }).check();
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(page.locator('#return-url')).toHaveValue('');
	await expect(page.locator('#content-id')).toHaveValue('');
	await expect(page.locator('#reaction-group-id')).not.toHaveValue(group);
	await expect(page.getByRole('textbox', { name: 'Name', exact: true }).first()).toHaveValue('Thumbs Up');
	await expect(page.getByLabel('Reject votes from other URLs', { exact: true })).toBeChecked();
	const freshTab = await context.newPage();
	await freshTab.goto('/');
	await freshTab.waitForLoadState('networkidle');
	expect(await freshTab.evaluate(() => sessionStorage.getItem('plusmark:edit-token:old-content'))).toBeNull();
	await expect(freshTab.getByLabel('Include PlusMark badge', { exact: true })).not.toBeChecked();
	await expect(freshTab.getByLabel('Reject votes from other URLs', { exact: true })).toBeChecked();
});

test('locale still survives a reload', async ({ page }) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.locator('#language-picker').selectOption('es');
	await page.waitForLoadState('networkidle');
	await expect(page.locator('#language-picker')).toHaveValue('es');
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(page.locator('#language-picker')).toHaveValue('es');
	await expect(page.locator('#content-id')).toHaveValue('');
});
