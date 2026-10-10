import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark']) {
	test(`closing animations retain their invisible final frame (${theme})`, async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark theme' }).click();
		await page.evaluate(() => {
			const samples: { kind: string; height: number; opacity: number }[] = [];
			Object.assign(window, { closingSamples: samples });
			// Observe the animation boundary before the library hides/unmounts the node.
			document.addEventListener('animationend', event => {
				const node = event.target;
				if (!(node instanceof HTMLElement) || node.dataset.state !== 'closed') return;
				if (!node.matches('[data-slot="accordion-content"], [data-slot="tooltip-content"]')) return;
				const style = getComputedStyle(node);
				samples.push({ kind: node.dataset.slot!, height: node.getBoundingClientRect().height, opacity: Number(style.opacity) });
			}, true);
		});
		const accordion = page.getByRole('button', { name: 'Usage Instructions', exact: true });
		for (let i = 0; i < 3; i++) {
			await accordion.click();
			await expect(accordion).toHaveAttribute('aria-expanded', 'true');
			const content = page.locator('[data-slot="accordion-content"]').first();
			await expect.poll(() => content.evaluate(node => node.getAnimations().every(animation => animation.playState === 'finished'))).toBe(true);
			await accordion.click();
			await expect(content).toBeHidden();
		}
		const trigger = page.locator('.main-card [data-slot="tooltip-trigger"]').first();
		for (let i = 0; i < 3; i++) {
			await trigger.hover();
			await expect(page.locator('[data-slot="tooltip-content"]')).toBeVisible();
			await page.mouse.move(1200, 700);
			await expect(page.locator('[data-slot="tooltip-content"]')).toHaveCount(0);
		}
		const samples = await page.evaluate(() => (window as unknown as { closingSamples: { kind: string; height: number; opacity: number }[] }).closingSamples);
		expect(samples.filter(sample => sample.kind === 'accordion-content')).toHaveLength(3);
		expect(samples.filter(sample => sample.kind === 'tooltip-content')).toHaveLength(3);
		for (const sample of samples) {
			if (sample.kind === 'accordion-content') expect(sample.height).toBe(0);
			else expect(sample.opacity).toBe(0);
		}
		// Reopening while a close is in progress must not leave the content stuck hidden.
		await accordion.click();
		await accordion.click();
		await accordion.click();
		await expect(accordion).toHaveAttribute('aria-expanded', 'true');
		await expect(page.locator('[data-slot="accordion-content"]').first()).toBeVisible();
		await trigger.hover();
		await expect(page.locator('[data-slot="tooltip-content"]')).toBeVisible();
	});
}
