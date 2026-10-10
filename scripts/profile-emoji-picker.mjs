import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.argv[2] ?? 'http://127.0.0.1:4173';
const label = process.argv[3] ?? 'profile';
const browser = await chromium.launch({ headless: true });
try {
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	const client = await page.context().newCDPSession(page);
	await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
	await client.send('LayerTree.enable');
	let layerCount = 0;
	client.on('LayerTree.layerTreeDidChange', event => { layerCount = event.layers?.length ?? 0; });
	await page.addInitScript(() => {
		window.pickerMeasurements = { clicks: [], tasks: [] };
		new PerformanceObserver(list => {
			window.pickerMeasurements.tasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration })));
		}).observe({ type: 'longtask', buffered: true });
		document.addEventListener('click', event => {
			const closing = event.target.closest('.reaction-card-emoji-button') && document.querySelector('.reaction-card-emoji-grid');
			const entry = { start: performance.now(), nextPaintMs: null, readyPaintMs: null };
			window.pickerMeasurements.clicks.push(entry);
			requestAnimationFrame(() => requestAnimationFrame(() => { entry.nextPaintMs = performance.now() - entry.start; }));
			function waitForContent() {
				const option = document.querySelector('.reaction-card-emoji-option');
				const ready = closing ? !document.querySelector('.reaction-card-emoji-grid')
					: option && getComputedStyle(option).contentVisibility !== 'hidden';
				if (ready) {
					requestAnimationFrame(() => requestAnimationFrame(() => { entry.readyPaintMs = performance.now() - entry.start; }));
				} else requestAnimationFrame(waitForContent);
			}
			requestAnimationFrame(waitForContent);
		}, true);
	});
	await page.goto(url);
	await page.getByRole('button', { name: /Change reaction emoji/ }).first().waitFor();
	const results = [];
	async function click(name, locator) {
		const index = await page.evaluate(() => window.pickerMeasurements.clicks.length);
		await locator.click();
		await page.waitForFunction(i => window.pickerMeasurements.clicks[i]?.readyPaintMs != null, index);
		await page.waitForTimeout(450);
		const data = await page.evaluate(i => {
			const entry = window.pickerMeasurements.clicks[i];
			return { ...entry, longTasks: window.pickerMeasurements.tasks.filter(t => t.start + t.duration >= entry.start),
				buttons: document.querySelectorAll('.reaction-card-emoji-option').length };
		}, index);
		results.push({ action: name, ...data, layerCount });
		console.log(JSON.stringify(results.at(-1)));
	}
	const trigger = page.getByRole('button', { name: /Change reaction emoji/ }).first();
	await click('cold open', trigger);
	await page.getByRole('button', { name: 'Objects', exact: true }).waitFor();
	for (let cycle = 0; cycle < 3; cycle++) {
		for (const category of ['Objects', 'Symbols', 'Travel', 'Reactions']) {
			await click(category, page.getByRole('button', { name: category, exact: true }));
		}
		await click('close', trigger);
		await click('warm open', trigger);
	}
	await mkdir('.cache-probes', { recursive: true });
	await page.screenshot({ path: `.cache-probes/emoji-${label}.png` });
	await writeFile(`.cache-probes/emoji-${label}.json`, JSON.stringify({ url, cpuSlowdown: 4, results }, null, 2));
} finally {
	await browser.close();
}
