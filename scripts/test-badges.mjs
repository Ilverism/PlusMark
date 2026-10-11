import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { formatReactionCount } from '../src/lib/reaction-count.ts';
import { buildMarkdownSnippet } from '../src/lib/widget.ts';
import * as marker from '../src/lib/server/destination-marker.ts';

const routeSource = await readFile(new URL('../src/routes/badge/+server.ts', import.meta.url), 'utf8');
const compiledRoute = ts.transpileModule(routeSource, {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

async function renderBadge(count, emoji = '👍', label = 'Like', options = {}) {
	const exports = {};
	new Function('require', 'exports', compiledRoute)(name => {
		if (name === '$lib/server/destination-marker') return marker;
		if (name === '$lib/reaction-count') return { formatReactionCount };
		if (name === '$lib/server/reaction-service') return {
			parseDocAndReaction: () => ({ doc: options.doc ?? 'test', reaction: 'like' }),
			getReactionDocumentStub: async () => {
				options.onRead?.();
				return { getBadge: async () => ({
					ok: true, reaction: { count, emoji, label }, returnUrl: options.returnUrl ?? 'https://example.com/article',
					throttled: options.throttled ?? false, refreshAt: options.refreshAt ?? 0
				}) };
			}
		};
		throw new Error(`Unexpected import ${name}`);
	}, exports);
	return exports.GET({ url: new URL('https://example.com/badge?doc=test&r=like'), platform: { caches: { open: async () => options.cache } } });
}

test('throttled SVG has a gray hourglass, extra space, and a delayed-count label', async () => {
	const normal = await (await renderBadge(2315)).text();
	const throttled = await (await renderBadge(2315, '👍', 'Like', { throttled: true })).text();
	assert.ok(!normal.includes('data-throttled'));
	assert.match(throttled, /data-throttled="true"/);
	assert.match(throttled, /stroke="#9ca3af"/);
	assert.match(throttled, /count updates delayed/);
	assert.equal(Number(throttled.match(/width="(\d+)"/)[1]), Number(normal.match(/width="(\d+)"/)[1]) + 16);
	const dotX = Number(throttled.match(/cx="(\d+)"/)[1]);
	const hourglassX = Number(throttled.match(/data-throttled="true" transform="translate\((\d+)/)[1]);
	assert.ok(hourglassX + 9 < dotX - 5, 'hourglass and destination dot must not overlap');
	assert.match(throttled, /clip-path="url\(#count-slot\)"/);
});

test('destination markers are stable, use the saved URL, and distinguish fragments', async () => {
	assert.deepEqual(await marker.destinationColors('https://EXAMPLE.com:443/a#one'), await marker.destinationColors('https://example.com/a#one'));
	assert.notDeepEqual(await marker.destinationColors('https://example.com/a#one'), await marker.destinationColors('https://example.com/a#two'));
	const first = await (await renderBadge(1)).text();
	const next = await (await renderBadge(2)).text();
	assert.equal(first.match(/<linearGradient.*?<\/linearGradient>/s)[0], next.match(/<linearGradient.*?<\/linearGradient>/s)[0]);
	assert.match(first, /Source: https:\/\/example.com\/article/);
});

test('source badge is optional, inline, before branding, and links directly to the return URL', () => {
	const widget = { doc: 'example', returnUrl: 'https://example.com/a_(b)?x=1&y=2#section', reactions: [{ id: 'like', emoji: '👍', label: 'Like', description: '' }] };
	const markdown = buildMarkdownSnippet(widget, 'https://badges.example', true, true);
	assert.ok(markdown.includes('/source-badge?doc=example)](<https://example.com/a_(b)?x=1&y=2#section>)'));
	assert.ok(markdown.indexOf('/source-badge?') < markdown.indexOf('/PlusMark-badge.svg'));
	assert.ok(!/[\r\n]/.test(markdown));
	assert.ok(!buildMarkdownSnippet(widget, 'https://badges.example', true, false).includes('/source-badge?'));
});

test('snapshot cache bypasses the Durable Object, expires on publication, and isolates documents', async t => {
	let now = 1_800_000_000_000;
	t.mock.method(Date, 'now', () => now);
	let reads = 0;
	const values = new Map();
	const cache = {
		match: async request => values.get(request.url)?.clone(),
		put: async (request, response) => { values.set(request.url, response.clone()); }
	};
	const options = { cache, throttled: true, refreshAt: now + 60_000, onRead: () => reads++ };
	const first = await (await renderBadge(300, '👍', 'Like', options)).text();
	const hit = await renderBadge(500, '👍', 'Like', options);
	assert.match(hit.headers.get('cache-control'), /no-store/);
	assert.equal(await hit.text(), first);
	assert.equal(reads, 1);
	await renderBadge(4, '👍', 'Other', { ...options, doc: 'other' });
	assert.equal(reads, 2);
	now += 60_000;
	const fresh = await (await renderBadge(500, '👍', 'Like', { ...options, throttled: false, refreshAt: 0 })).text();
	assert.equal(reads, 3);
	assert.match(fresh, />500<\/text>/);
	assert.ok(!fresh.includes('data-throttled'));
});

test('cache outages do not break badge delivery', async () => {
	const cache = { match: async () => { throw new Error('unavailable'); }, put: async () => { throw new Error('full'); } };
	const response = await renderBadge(300, '👍', 'Like', { cache, throttled: true, refreshAt: Date.now() + 60_000 });
	assert.equal(response.status, 200);
	assert.match(await response.text(), /data-throttled="true"/);
});

test('truncates compact counts without rounding across a display boundary', () => {
	for (const [count, expected] of [
		[0, '0'], [999, '999'], [1000, '1k'], [1099, '1k'], [1100, '1.1k'],
		[2315, '2.3k'], [2388, '2.3k'], [2399, '2.3k'], [2400, '2.4k'],
		[999999, '999.9k'], [1000000, '1m'], [1300114, '1.3m'], [1323521, '1.3m'],
		[999999999, '999.9m'], [1000000000, '1b'], [1000000000000, '1t']
	]) assert.equal(formatReactionCount(count), expected, String(count));
});

test('appends exactly one linked logo badge after all reaction badges', () => {
	const markdown = buildMarkdownSnippet({ doc: 'example', returnUrl: 'https://example.com', reactions: [
		{ id: 'like', emoji: '👍', label: 'Like', description: '' },
		{ id: 'love', emoji: '❤️', label: 'Love', description: '' }
	] }, 'https://badges.example/');
	assert.equal(markdown.split(') [![').length, 3);
	assert.ok(!/[\r\n]/.test(markdown));
	assert.ok(markdown.endsWith('[![PlusMark](https://badges.example/PlusMark-badge.svg)](https://plusmark.ilverism.workers.dev/)'));
	assert.equal(markdown.match(/PlusMark-badge\.svg/g).length, 1);
	assert.ok(markdown.includes('/react?doc=example&r=love'));
});

test('can omit the PlusMark badge without changing reaction links', () => {
	const widget = { doc: 'example', returnUrl: 'https://example.com', reactions: [
		{ id: 'like', emoji: '👍', label: 'Like', description: '' }
	] };
	const markdown = buildMarkdownSnippet(widget, 'https://badges.example', false);
	assert.ok(!markdown.includes('PlusMark-badge.svg'));
	assert.equal(markdown, buildMarkdownSnippet(widget, 'https://badges.example').split(' [![PlusMark]')[0]);
});

test('badge responses are identical within a display range and escape SVG content', async () => {
	const first = await renderBadge(2315);
	assert.match(first.headers.get('cache-control'), /max-age=0/);
	const svg = await first.text();
	assert.equal(svg, await (await renderBadge(2388)).text());
	assert.match(svg, /<text x="34" y="16">2\.3k<\/text>/);
	assert.match(svg, /<text[^>]+filter="url\(#emoji-shadow\)"/);
	assert.match(await (await renderBadge(1323521)).text(), />1\.3m<\/text>/);
	const escaped = await (await renderBadge(1, '<&', '"<unsafe>')).text();
	assert.ok(!escaped.includes('<unsafe>'));
	assert.ok(escaped.includes('&quot;&lt;unsafe&gt;'));
	assert.ok(escaped.includes('&lt;&amp;'));
});
