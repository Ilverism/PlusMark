import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const verification = {};
new Function('exports', ts.transpileModule(readFileSync(new URL('../src/lib/server/reaction-verification.ts', import.meta.url), 'utf8'), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText)(verification);
const secret = 'test-signing-secret';
const now = 1_800_000_000_000;

test('verification passes are signed, visitor-bound, and expire after one hour', async () => {
	const pass = await verification.createVerificationPass(secret, 'visitor', now);
	assert.equal(await verification.hasVerificationPass(secret, pass, 'visitor', now + 3_599_999), true);
	for (const [token, visitor, time, key] of [
		[pass, 'other', now, secret], [pass, 'visitor', now + 3_600_000, secret],
		[pass + 'x', 'visitor', now, secret], [pass, 'visitor', now, 'wrong'], ['', 'visitor', now, secret]
	]) assert.equal(await verification.hasVerificationPass(key, token, visitor, time), false);
});

test('tickets preserve source context, bind the action, and reject tampering/expiry', async () => {
	const token = await verification.createReactionTicket(secret, 'doc', 'like', 'visitor', 'https://example.com/source', now);
	const ticket = await verification.readReactionTicket(secret, token, now);
	assert.equal(ticket.doc, 'doc'); assert.equal(ticket.reaction, 'like');
	assert.equal(ticket.visitor, 'visitor'); assert.equal(ticket.referrer, 'https://example.com/source');
	assert.match(ticket.id, /^[a-f0-9-]{36}$/);
	assert.equal(await verification.readReactionTicket(secret, token, now + 600_000), null);
	assert.equal(await verification.readReactionTicket(secret, token + 'x', now), null);
	assert.equal(await verification.hasVerificationPass(secret, token, 'visitor', now), false);
});

test('Siteverify enforces success, hostname, action, ticket binding, and fails closed', async () => {
	const good = { success: true, hostname: 'plusmark.example', action: 'reaction', cdata: 'ticket-id' };
	let calls = 0;
	const fetcher = async (url, options) => {
		calls++;
		assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
		assert.equal(options.method, 'POST');
		assert.equal(options.body.get('secret'), 'turnstile-secret');
		assert.equal(options.body.get('response'), 'token');
		return Response.json(good);
	};
	const check = (fetcher, token = 'token') => verification.verifyTurnstile('turnstile-secret', token, 'plusmark.example', 'ticket-id', fetcher);
	assert.equal(await check(fetcher), true);
	assert.equal(await check(fetcher, ''), false);
	assert.equal(await check(fetcher, 'x'.repeat(2049)), false);
	assert.equal(calls, 1);
	for (const change of [{ success: false }, { success: 'true' }, { hostname: 'localhost' }, { action: 'login' }, { cdata: 'other' }]) {
		assert.equal(await check(async () => Response.json({ ...good, ...change })), false);
	}
	assert.equal(await check(async () => new Response('unavailable', { status: 503 })), false);
	assert.equal(await check(async () => new Response('not JSON')), false);
	assert.equal(await check(async () => { throw new Error('offline'); }), false);
});
