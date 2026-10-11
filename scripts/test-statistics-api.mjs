import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const code = ts.transpileModule(await readFile(new URL('../src/routes/api/statistics/+server.ts', import.meta.url), 'utf8'), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const exports = {};
new Function('require', 'exports', code)(name => {
	if (name === '$app/environment') return { dev: false };
	if (name === '@sveltejs/kit') return { json: (body, options) => Response.json(body, options) };
	if (name === '$lib/server/dev-statistics') return { devStatistics: {} };
	throw new Error(name);
}, exports);
let reads = 0;
let fail = false;
const cached = new Map();
const event = {
	url: new URL('https://example.test/api/statistics?ignored=123'),
	platform: {
		caches: { open: async () => ({
			match: async key => cached.get(key.url)?.clone(),
			put: async (key, response) => { cached.set(key.url, response.clone()); }
		}) },
		env: { SERVICE_STATISTICS: { getByName: () => ({ getTotals: async () => {
			reads++; if (fail) throw Error('outage');
			return { reactions: 12, votes: 34 };
		} }) } }
	}
};
assert.deepEqual(await (await exports.GET(event)).json(), { reactions: 12, votes: 34 });
assert.equal((await exports.GET(event)).headers.get('cache-control'), 'public, max-age=60');
assert.equal(reads, 1, 'cached reads must bypass the statistics object');
fail = true;
assert.equal((await exports.GET(event)).status, 200, 'cached totals remain available during an outage');
cached.clear();
const unavailable = await exports.GET(event);
assert.equal(unavailable.status, 503);
assert.equal(unavailable.headers.get('cache-control'), 'no-store');
assert.equal(cached.size, 0, 'failures must not poison the cache');
fail = false;
event.platform.caches.open = async () => { throw Error('cache outage'); };
assert.equal((await exports.GET(event)).status, 200);
console.log('PASS: production statistics cache, object outage, uncached error, and cache outage');
