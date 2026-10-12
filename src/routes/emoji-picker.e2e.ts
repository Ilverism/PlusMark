import { expect, test } from '@playwright/test';
import categories from '../lib/generated/reaction-emojis.json' with { type: 'json' };

test('fills blank or matching emoji names and preserves custom names', async ({ page }) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const name = page.getByRole('textbox', { name: 'Name', exact: true }).first();
	const trigger = page.getByRole('button', { name: /Change reaction emoji/ }).first();
	const picker = page.getByRole('dialog', { name: 'Choose an emoji' });
	for (const [initial, emojiName, expected] of [
		['', 'thumbs up', 'Thumbs Up'],
		['  tHuMbS uP  ', 'red heart', 'Red Heart'],
		['   ', 'fire', 'Fire'],
		['My custom reaction', 'red heart', 'My custom reaction']
	]) {
		await name.fill(initial);
		await trigger.click();
		if (emojiName !== 'thumbs up') {
			await picker.getByRole('searchbox', { name: 'Search emoji' }).fill(emojiName);
		}
		await picker.getByRole('button', { name: emojiName, exact: true }).click();
		await expect(name).toHaveValue(expected);
		await trigger.click();
		await expect(picker).toHaveCount(0);
	}
});

test('cycles matching emoji names across picker sessions and preserves custom names', async ({ page }) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const name = page.getByRole('textbox', { name: 'Name', exact: true }).first();
	const trigger = page.getByRole('button', { name: /Change reaction emoji/ }).first();
	const picker = page.getByRole('dialog', { name: 'Choose an emoji' });
	await name.fill('');
	await trigger.click();
	for (const [emojiName, expected] of [
		['thumbs up', 'Thumbs Up'],
		['red heart', 'Red Heart'],
		['face with tears of joy', 'Face With Tears Of Joy']
	]) {
		await picker.getByRole('button', { name: emojiName, exact: true }).click();
		await expect(name).toHaveValue(expected);
	}
	// A rapid close/reopen may cancel the outro and reuse the component instance.
	await trigger.click();
	await trigger.click();
	await picker.getByRole('button', { name: 'thumbs down', exact: true }).click();
	await expect(name).toHaveValue('Thumbs Down');
	await trigger.click();
	await expect(picker).toHaveCount(0);
	await name.fill('My Own Name');
	await trigger.click();
	await picker.getByRole('button', { name: 'red heart', exact: true }).click();
	await expect(name).toHaveValue('My Own Name');
	// Each reaction is compared against its own current emoji.
	await page.getByRole('button', { name: /Change reaction emoji/ }).nth(1).click();
	await picker.getByRole('button', { name: 'red heart', exact: true }).click();
	await expect(page.getByRole('textbox', { name: 'Name', exact: true }).nth(1)).toHaveValue('Red Heart');
	await page.getByRole('textbox', { name: 'Name', exact: true }).nth(1).fill('Custom Heart');
	await expect(picker).toHaveCount(0);
	await page.getByRole('button', { name: /Change reaction emoji/ }).nth(1).click();
	await picker.getByRole('button', { name: 'thumbs up', exact: true }).click();
	await expect(page.getByRole('textbox', { name: 'Name', exact: true }).nth(1)).toHaveValue('Custom Heart');
});

test('keeps every category accessible while deferring offscreen emoji rendering', async ({ page }) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const trigger = page.getByRole('button', { name: /Change reaction emoji/ }).first();
	await trigger.click();
	const picker = page.getByRole('dialog', { name: 'Choose an emoji' });
	const options = picker.locator('.reaction-card-emoji-option');
	const grid = picker.locator('.reaction-card-emoji-grid');

	for (const category of categories) {
		await picker.getByRole('button', { name: category.label, exact: true }).click();
		await expect(options).toHaveCount(category.emojis.length);
		await expect.poll(() => grid.evaluate(node => node.scrollTop)).toBe(0);
		await expect(options.first()).toHaveCSS('content-visibility', 'visible');
		if (category.emojis.length > 100) {
			await expect(options.last()).toHaveCSS('content-visibility', 'hidden');
		}
		// Native keyboard navigation must still reach and reveal the final emoji.
		await options.nth(category.emojis.length - 2).focus();
		await page.keyboard.press('Tab');
		await expect(options.last()).toBeFocused();
		await expect(options.last()).toHaveCSS('content-visibility', 'visible');
		await expect(options.last()).toHaveAccessibleName(category.emojis.at(-1)!.name);
	}
	const lastEmoji = categories.at(-1)!.emojis.at(-1)!;
	await page.keyboard.press('Enter');
	await expect(trigger).toHaveAccessibleName(`Change reaction emoji. Current emoji: ${lastEmoji.emoji}`);
	await trigger.click();
	await expect(picker).toHaveCount(0);
});

test('searches, selects, and repeatedly reopens without losing responsiveness', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const trigger = page.getByRole('button', { name: /Change reaction emoji/ }).first();
	await trigger.click();
	const picker = page.getByRole('dialog', { name: 'Choose an emoji' });
	const search = picker.getByRole('searchbox', { name: 'Search emoji' });
	const options = picker.locator('.reaction-card-emoji-option');
	await expect(options.first()).toHaveCSS('content-visibility', 'visible');
	const term = 'cat';
	const matches = categories.filter(category => category.id !== 'reactions')
		.flatMap(category => category.emojis).filter(entry => entry.keywords.includes(term));
	await search.fill(term);
	await expect(options).toHaveCount(matches.length);
	await options.first().click();
	await expect(trigger).toHaveAccessibleName(`Change reaction emoji. Current emoji: ${matches[0].emoji}`);
	await expect(search).toHaveValue('');
	await search.fill('no-such-emoji-12345');
	await expect(options).toHaveCount(0);
	await picker.getByRole('button', { name: 'Objects', exact: true }).click();
	await expect(options).toHaveCount(categories.find(category => category.id === 'objects')!.emojis.length);

	// Reopen while the previous panel's exit animation is still running.
	for (let cycle = 0; cycle < 5; cycle++) {
		await trigger.click();
		await trigger.click();
		await expect(picker).toHaveCount(1);
		// Svelte can cancel the outro and retain the current category.
		await picker.getByRole('button', { name: 'Reactions', exact: true }).click();
		await expect(options).toHaveCount(categories[0].emojis.length);
		await expect(options.first()).toHaveCSS('content-visibility', 'visible');
	}
	await trigger.click();
	await expect(picker).toHaveCount(0);
	await trigger.click();
	await expect(options).toHaveCount(categories[0].emojis.length);
	await expect(options.first()).toHaveCSS('content-visibility', 'visible');
	await page.setViewportSize({ width: 1000, height: 800 });
	await expect(picker).toHaveCount(0);
	expect(errors).toEqual([]);
});
