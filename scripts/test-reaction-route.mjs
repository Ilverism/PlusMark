import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('wrangler'))('esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({
	stdin: { contents: `export * from './src/routes/react/+server.ts'; export * from './src/lib/server/reaction-service.ts'; export * from './src/lib/server/reaction-verification.ts';`, resolveDir: root, loader: 'ts' },
	bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022',
	plugins: [{ name: 'test-environment', setup(build) {
		build.onResolve({ filter: /^\$(app\/environment|env\/dynamic\/private)$/ }, args => ({ path: args.path, namespace: 'test' }));
		build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const dev=true; export const env={};' }));
	} }]
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const secret = 'route-test-secret';
const cookies = new Map();
const options = new Map();
const config = { PLUSMARK_HMAC_SECRET: secret, TURNSTILE_SITE_KEY: 'test-key', TURNSTILE_SECRET: 'test-secret', TURNSTILE_HOSTNAME: 'plusmark.example' };
function event(method = 'GET', body, headers = {}, jar = cookies, query = 'doc=route-test&r=like') {
	const url = new URL(`https://plusmark.example/react?${query}`);
	return { url, request: new Request(url, { method, headers, body }), platform: { env: config },
		cookies: { get: name => jar.get(name), set: (name, value, opts) => { jar.set(name, value); options.set(name, opts); } }, setHeaders() {} };
}
const stub = await api.getReactionDocumentStub(event(), 'route-test');
await stub.saveWidget({ widget: { doc: 'route-test', returnUrl: 'https://example.com/article', verifyReferrer: true, reactions: [{ id: 'like', emoji: '👍', label: '<Like>', description: '' }] }, createEditTokenHash: 'edit', editTokenHash: null });
const count = async () => (await stub.getWidget()).widget.reactions[0].count;
const ticketFrom = response => response.text().then(html => {
	assert.ok(html.includes('&#60;Like&#62;'));
	return html.match(/name="ticket" value="([^"]+)"/)[1];
});
const post = (ticket, overrides = {}) => api.POST(event('POST', new URLSearchParams({ ticket, 'cf-turnstile-response': overrides.token ?? 'token' }), { origin: 'https://plusmark.example', accept: 'application/json', ...overrides.headers }, overrides.jar, overrides.query));
const rejects = (fn, status) => assert.rejects(fn, err => err.status === status);
const originalFetch = globalThis.fetch;
let verificationCalls = 0;
let siteverify = {};
globalThis.fetch = async () => { verificationCalls++; return Response.json(siteverify); };
try {
	assert.equal((await api.HEAD(event('HEAD'))).status, 204);
	assert.equal((await api.GET(event('GET', undefined, { purpose: 'prefetch' }))).status, 204);
	assert.equal(cookies.size, 0);
	assert.equal((await api.GET(event('GET', undefined, { referer: 'https://wrong.example/' }))).status, 403);
	const ticket = await ticketFrom(await api.GET(event('GET', undefined, { referer: 'https://example.com/article' })));
	for (let n = 0; n < 5; n++) await api.GET(event());
	assert.equal(await count(), 0);
	await rejects(() => post(ticket, { headers: { origin: 'https://evil.example' } }), 403);
	await rejects(() => post(ticket + 'x'), 403);
	await rejects(() => post(ticket, { jar: new Map() }), 403);
	await rejects(() => post(ticket, { query: 'doc=other&r=like' }), 403);
	await rejects(() => post(ticket, { token: '' }), 403);
	await rejects(() => post(ticket), 403);
	assert.equal(await count(), 0);
	const claim = await api.readReactionTicket(secret, ticket);
	siteverify = { success: true, hostname: 'plusmark.example', action: 'reaction', cdata: claim.id };
	assert.equal((await post(ticket)).status, 200);
	assert.equal(await count(), 1);
	assert.equal(options.get('pm_verified').maxAge, 3600);
	assert.equal(options.get('pm_verified').httpOnly, true);
	assert.equal(options.get('pm_verified').secure, true);
	const pass = cookies.get('pm_verified');
	const callsBefore = verificationCalls;
	await Promise.all(Array.from({ length: 5 }, () => post(ticket)));
	assert.equal(await count(), 1);
	const next = await ticketFrom(await api.GET(event()));
	await post(next, { token: '' });
	assert.equal(await count(), 0);
	assert.equal(verificationCalls, callsBefore);
	assert.equal(cookies.get('pm_verified'), pass, 'using a pass must not extend its lifetime');
	const beforeEdit = await ticketFrom(await api.GET(event('GET', undefined, { referer: 'https://example.com/article' })));
	await stub.saveWidget({ widget: { doc: 'route-test', returnUrl: 'https://changed.example/article', verifyReferrer: true, reactions: [{ id: 'like', emoji: '👍', label: '<Like>', description: '' }] }, createEditTokenHash: 'edit', editTokenHash: 'edit' });
	await rejects(() => post(beforeEdit), 403);
	assert.equal(await count(), 0, 'a changed source must be rechecked at submission');
	cookies.set('pm_verified', await api.createVerificationPass(secret, cookies.get('pm_vid'), Date.now() - 3_600_001));
	await rejects(async () => post(await api.createReactionTicket(secret, 'route-test', 'like', cookies.get('pm_vid'), null), { token: '' }), 403);
	assert.equal(await count(), 0);
	const expired = await api.createReactionTicket(secret, 'route-test', 'like', cookies.get('pm_vid'), null, Date.now() - 600_001);
	await rejects(() => post(expired), 403);
	await rejects(() => api.POST(event('POST', 'x'.repeat(25000), { origin: 'https://plusmark.example', 'content-type': 'application/x-www-form-urlencoded' })), 413);
	config.TURNSTILE_SECRET = '';
	await rejects(() => api.GET(event()), 503);
	console.log('PASS: GET safety, referrer checks, CSRF, ticket binding/expiry, fail-closed verification, first vote, retries, one-hour pass, undo, body limit, missing configuration');
} finally { globalThis.fetch = originalFetch; }
