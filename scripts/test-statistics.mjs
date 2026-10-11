import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { Miniflare } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');
const bundle = await build({
	stdin: { resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts', contents: `
import { ReactionDocument } from './src/lib/server/reaction-document.ts';
import { ServiceStatistics } from './src/lib/server/service-statistics.ts';
export class TestDocument extends ReactionDocument {
 async flush() {
  this.ctx.storage.sql.exec('UPDATE statistics SET next_sync_at = 1 WHERE id = 1');
  await this.alarm();
  return this.local();
 }
 async local() { return { ...this.ctx.storage.sql.exec('SELECT * FROM statistics').one(), alarm: await this.ctx.storage.getAlarm() }; }
}
export class TestStatistics extends ServiceStatistics {
 failure = false;
 setFailure(value) { this.failure = value; }
 record(id, totals) { super.record(id, totals); if(this.failure) throw Error('Lost acknowledgment'); }
}
export default {async fetch(request,env) {
 const {doc,action,args=[]} = await request.json();
 const stub = doc === '$totals' ? env.SERVICE_STATISTICS.getByName('global') : env.REACTION_DOCUMENTS.getByName(doc);
 return Response.json((await stub[action](...args)) ?? null);
}};` },
	bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['cloudflare:workers']
});
const options = { modules: true, compatibilityDate: '2026-05-23', script: bundle.outputFiles[0].text, durableObjects: {
	REACTION_DOCUMENTS: { className: 'TestDocument', useSQLite: true },
	SERVICE_STATISTICS: { className: 'TestStatistics', useSQLite: true }
} };
const mf = new Miniflare(options);
async function rpc(doc, action, ...args) {
	const response = await mf.dispatchFetch('https://example.test/', { method: 'POST', body: JSON.stringify({ doc, action, args }) });
	assert.equal(response.status, 200, await response.clone().text());
	return response.json();
}
const reaction = id => ({ id, emoji: '👍', label: id, description: '' });
const save = (doc, ids, token = null) => rpc(doc, 'saveWidget', {
	widget: { doc, returnUrl: 'https://example.test/article', verifyReferrer: true, reactions: ids.map(reaction) },
	editTokenHash: token, createEditTokenHash: 'secret'
});
const totals = () => rpc('$totals', 'getTotals');
try {
	assert.deepEqual(await totals(), { reactions: 0, votes: 0 });
	assert.equal((await save('first', ['like', 'fire'])).ok, true);
	assert.ok((await rpc('first', 'local')).alarm > Date.now(), 'even non-GitHub widgets must schedule statistics');
	assert.deepEqual(await totals(), { reactions: 0, votes: 0 }, 'delivery is batched');
	await rpc('first', 'flush');
	assert.deepEqual(await totals(), { reactions: 2, votes: 0 });
	await save('first', ['like', 'fire'], 'secret');
	await save('first', ['like'], 'secret');
	await save('first', ['like', 'fire'], 'secret');
	assert.equal((await save('first', ['unauthorized'], 'wrong')).ok, false);
	await rpc('first', 'getBadge', 'like');
	await rpc('first', 'getWidget');
	assert.equal((await rpc('first', 'toggleReaction', 'like', 'voter', 'https://evil.test')).ok, false);
	const receipt = { id: 'same-submission', expiresAt: Date.now() + 600_000 };
	await Promise.all(Array.from({ length: 8 }, () => rpc('first', 'toggleReaction', 'like', 'voter', 'https://example.test/article', receipt)));
	await rpc('first', 'flush');
	assert.deepEqual(await totals(), { reactions: 2, votes: 1 }, 'reads, regeneration, re-additions, rejection, and retries do not inflate totals');
	await mf.setOptions({ ...options, script: options.script + '\n// restart' });
	await rpc('first', 'toggleReaction', 'like', 'voter', 'https://example.test/article', receipt);
	await rpc('first', 'toggleReaction', 'like', 'voter', 'https://example.test/article', { ...receipt, id: 'undo' });
	await save('first', ['like', 'fire', 'new'], 'secret');
	await save('second', ['like']);
	await rpc('$totals', 'setFailure', true);
	const failed = await rpc('first', 'flush');
	assert.ok(failed.next_sync_at > Date.now());
	assert.ok(failed.alarm > Date.now(), 'failed delivery is rescheduled');
	await rpc('$totals', 'setFailure', false);
	await rpc('first', 'flush');
	await rpc('second', 'flush');
	assert.deepEqual(await totals(), { reactions: 4, votes: 2 }, 'lost acknowledgments do not double count; removals do count');
	await rpc('$totals', 'record', 'out-of-order', { reactions: 3, votes: 9 });
	await rpc('$totals', 'record', 'out-of-order', { reactions: 1, votes: 2 });
	await rpc('$totals', 'record', 'out-of-order', { reactions: 3, votes: 9 });
	assert.deepEqual(await totals(), { reactions: 7, votes: 11 });
	await mf.setOptions({ ...options, script: options.script + '\n// second restart' });
	assert.deepEqual(await totals(), { reactions: 7, votes: 11 }, 'global totals survive restarts');
	console.log('PASS: SQLite statistics, distinct badges, atomic votes, retries, restart, removals, failed delivery, rescheduling, stale snapshots');
} finally { await mf.dispose(); }
