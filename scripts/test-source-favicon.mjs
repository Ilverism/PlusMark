import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sourceFavicon } from '../src/lib/server/source-favicon.ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZuoAAAAASUVORK5CYII=', 'base64');
test('embeds bounded PNGs and caches by hostname without sharing page paths', async () => {
	const entries = new Map(); let calls = 0;
	const cache = { match: async key => entries.get(key.url)?.clone(), put: async (key, response) => entries.set(key.url, response) };
	const fetcher = async (url, init) => {
		calls++; assert.equal(url.hostname, 'www.google.com'); assert.equal(init.redirect, 'manual');
		assert.equal(url.searchParams.get('domain'), 'example.com'); assert.ok(!url.href.includes('private-path'));
		return new Response(png, { headers: { 'content-type': 'image/png' } });
	};
	const first = await sourceFavicon('https://example.com/private-path', cache, fetcher);
	assert.equal(first, `data:image/png;base64,${png.toString('base64')}`);
	assert.equal(await sourceFavicon('https://example.com/other', cache, fetcher), first);
	assert.equal(calls, 1);
});

test('unsafe redirects, private hostnames, SVG, oversized images, and outages fall back', async () => {
	for (const url of ['http://localhost/a', 'http://127.0.0.1/a', 'http://[::1]/a', 'http://server.internal/a']) {
		assert.equal(await sourceFavicon(url, undefined, async () => { assert.fail('must not fetch'); }), null);
	}
	let calls = 0;
	assert.equal(await sourceFavicon('https://example.com', undefined, async () => {
		calls++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } });
	}), null);
	assert.equal(calls, 1);
	for (const fetcher of [
		async () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }),
		async () => new Response(new Uint8Array(32769), { headers: { 'content-type': 'image/png' } }),
		async () => new Response('not png', { headers: { 'content-type': 'image/png' } }),
		async () => new Response(null, { status: 404 }),
		async () => { throw new Error('offline'); }
	]) assert.equal(await sourceFavicon('https://example.com', undefined, fetcher), null);
});

test('permits only bounded redirects to the provider image host', async () => {
	let calls = 0;
	assert.ok(await sourceFavicon('https://github.com', undefined, async url => {
		calls++;
		if (calls === 1) return new Response(null, { status: 302, headers: { location: 'https://t2.gstatic.com/faviconV2?test=1' } });
		assert.equal(url.hostname, 't2.gstatic.com');
		return new Response(png, { headers: { 'content-type': 'image/png' } });
	}));
	assert.equal(calls, 2);
});
