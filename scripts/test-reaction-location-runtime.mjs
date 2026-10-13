import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const dispatch = `export default {async fetch(request,env) {
 const {doc, action, args=[]} = await request.json();
 const stub=env.REACTION_DOCUMENTS.get(env.REACTION_DOCUMENTS.idFromName(doc));
 return Response.json(await stub[action](...args));
}};`;
const bundle = await build({
	stdin: { contents: `import { ReactionDocument as BaseDocument } from './src/lib/server/reaction-document.ts';
const auditLogs = [];
console.log = value => { if (value?.event === 'reaction.vote') auditLogs.push(value); };
export class ReactionDocument extends BaseDocument {
 getStatistics() { return this.ctx.storage.sql.exec('SELECT reactions, votes FROM statistics').one(); }
 getAuditLogs() { return auditLogs; }
}\n${dispatch}`, resolveDir: root, loader: 'ts' },
	bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['cloudflare:workers']
});
// Start with a populated pre-change database, then restart the same objects with the new code.
const legacy = `import {DurableObject} from 'cloudflare:workers';
export class ReactionDocument extends DurableObject {
 async seed() {
  this.ctx.storage.sql.exec("CREATE TABLE widget (doc TEXT PRIMARY KEY, return_url TEXT NOT NULL, edit_token_hash TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)");
  this.ctx.storage.sql.exec("INSERT INTO widget VALUES ('legacy','https://example.com/article','secret',1,1)");
  this.ctx.storage.sql.exec("CREATE TABLE reactions (id TEXT PRIMARY KEY, emoji TEXT NOT NULL, label TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL)");
  this.ctx.storage.sql.exec("INSERT INTO reactions VALUES ('like','👍','Like','',0)");
  this.ctx.storage.sql.exec("CREATE TABLE counts (reaction TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0)");
  this.ctx.storage.sql.exec("INSERT INTO counts VALUES ('like',1)");
  this.ctx.storage.sql.exec("CREATE TABLE votes (reaction TEXT NOT NULL, voter_hash TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (reaction,voter_hash))");
  this.ctx.storage.sql.exec("INSERT INTO votes VALUES ('like','existing-voter',1)");
  return {ok:true};
 }
}
${dispatch}`;
const options = { modules: true, compatibilityDate: '2026-05-23', durableObjects: { REACTION_DOCUMENTS: { className: 'ReactionDocument', useSQLite: true } } };
const mf = new Miniflare(convertV4MiniflareOptions({ ...options, script: legacy }));
async function rpc(doc, action, ...args) {
	const response = await mf.dispatchFetch('https://example.com/test', { method: 'POST', body: JSON.stringify({ doc, action, args }) });
	assert.equal(response.status, 200);
	return response.json();
}
const reactions = [{ id: 'like', emoji: '👍', label: 'Like', description: '' }];
const save = (doc, verifyReferrer, editTokenHash = null) => rpc(doc, 'saveWidget', {
	widget: { doc, returnUrl: 'https://example.com/article#section', reactions, verifyReferrer }, editTokenHash, createEditTokenHash: 'secret'
});
try {
	await rpc('legacy', 'seed');
	await mf.setOptions(convertV4MiniflareOptions({ ...options, script: bundle.outputFiles[0].text }));
	let legacyWidget = await rpc('legacy', 'getWidget');
	assert.equal(legacyWidget.widget.verifyReferrer, false);
	assert.equal(legacyWidget.widget.badgeTheme, 'light');
	assert.equal(legacyWidget.widget.reactions[0].count, 1);
	assert.equal(await rpc('legacy', 'hasVote', 'like', 'existing-voter'), true);
	assert.equal(await rpc('legacy', 'hasVote', 'like', 'other-voter'), false);
	assert.equal(await rpc('legacy', 'hasVote', 'other-reaction', 'existing-voter'), false);
	assert.deepEqual(await rpc('legacy', 'getStatistics'), { reactions: 0, votes: 0 }, 'historical activity is not backfilled');
	assert.equal((await rpc('legacy', 'toggleReaction', 'like', 'existing-voter', 'https://other.example/')).count, 0);
	assert.equal(await rpc('legacy', 'hasVote', 'like', 'existing-voter'), false);
	assert.equal((await save('legacy', true, 'wrong')).ok, false);
	assert.equal((await save('legacy', true, 'secret')).ok, true);
	assert.deepEqual(await rpc('legacy', 'getStatistics'), { reactions: 0, votes: 1 }, 'legacy badge regeneration does not count as creation');
	assert.equal((await rpc('legacy', 'toggleReaction', 'like', 'new', 'https://other.example/')).status, 403);
	await save('legacy', undefined, 'secret');
	assert.equal((await rpc('legacy', 'getWidget')).widget.verifyReferrer, true, 'old clients must not disable an existing guard');
	await save('legacy', false, 'secret');
	assert.equal((await rpc('legacy', 'toggleReaction', 'like', 'new', 'https://other.example/')).count, 1);

	for (const doc of ['doc-g-first', 'doc-g-second']) assert.equal((await save(doc, true)).ok, true);
	assert.equal((await rpc('doc-g-first', 'toggleReaction', 'like', 'same-user', 'https://example.com/article')).count, 1);
	assert.equal(await rpc('doc-g-first', 'hasVote', 'like', 'same-user'), true);
	assert.equal(await rpc('doc-g-second', 'hasVote', 'like', 'same-user'), false);
	const denied = await rpc('doc-g-first', 'toggleReaction', 'like', 'same-user', 'https://example.com/other');
	assert.equal(denied.status, 403);
	assert.equal(denied.returnUrl, 'https://example.com/article#section');
	assert.equal((await rpc('doc-g-first', 'getBadge', 'like')).reaction.count, 1, 'denied undo must not change the count');
	assert.equal((await rpc('doc-g-second', 'getBadge', 'like')).reaction.count, 0);
	assert.equal((await rpc('doc-g-second', 'toggleReaction', 'like', 'same-user', null)).count, 1);
	assert.equal((await rpc('doc-g-first', 'toggleReaction', 'like', 'same-user', 'https://example.com/')).count, 0);
	const submission = { id: crypto.randomUUID(), expiresAt: Date.now() + 600_000 };
	const retries = await Promise.all(Array.from({ length: 8 }, () => rpc('doc-g-first', 'toggleReaction', 'like', 'same-user', 'https://example.com/', submission)));
	assert.ok(retries.every(result => result.ok && result.count === 1 && result.active));
	const committedLogs = (await rpc('doc-g-first', 'getAuditLogs')).filter(log => log.submissionId === submission.id);
	assert.equal(committedLogs.length, 1, 'concurrent receipt retries must log only one committed vote');
	assert.equal(committedLogs[0].doc, 'doc-g-first');
	assert.equal(committedLogs[0].count, 1);
	assert.equal((await rpc('doc-g-first', 'toggleReaction', 'like', 'other-user', null, submission)).status, 409);
	assert.equal((await rpc('doc-g-first', 'toggleReaction', 'like', 'same-user', null, { id: 'expired', expiresAt: Date.now() - 1 })).status, 410);
	await mf.setOptions(convertV4MiniflareOptions({ ...options, script: bundle.outputFiles[0].text + '\n// restart' }));
	assert.equal(await rpc('doc-g-first', 'hasVote', 'like', 'same-user'), true);
	assert.equal((await rpc('doc-g-first', 'toggleReaction', 'like', 'same-user', null, submission)).count, 1);
	assert.equal((await rpc('doc-g-first', 'getAuditLogs')).length, 0, 'receipt replay after restart is not a new vote');
	assert.equal((await rpc('doc-g-first', 'getBadge', 'like')).reaction.count, 1);
	assert.equal((await rpc('doc-g-first', 'toggleReaction', 'like', 'same-user', null, { ...submission, id: crypto.randomUUID() })).count, 0);
	assert.equal((await rpc('doc-g-first', 'getWidget')).widget.verifyReferrer, true);
	assert.equal((await rpc('doc-g-second', 'getBadge', 'like')).reaction.count, 1);
	await save('cancel-test', false);
	const auto = () => ({ id: crypto.randomUUID(), expiresAt: Date.now() + 600_000, automatic: true });
	const cancelledFirst = auto();
	assert.equal((await rpc('cancel-test', 'cancelReaction', 'like', 'visitor', cancelledFirst)).active, false);
	assert.equal((await rpc('cancel-test', 'toggleReaction', 'like', 'visitor', null, cancelledFirst)).status, 409, 'cancel arriving first prevents the vote');
	const added = auto();
	await rpc('cancel-test', 'toggleReaction', 'like', 'visitor', null, added);
	await mf.setOptions(convertV4MiniflareOptions({ ...options, script: bundle.outputFiles[0].text + '\n// cancel restart' }));
	assert.equal((await rpc('cancel-test', 'cancelReaction', 'like', 'other', added)).status, 409);
	assert.equal((await rpc('cancel-test', 'cancelReaction', 'like', 'visitor', added)).active, false, 'cancellation reverses an addition after restart');
	assert.equal((await rpc('cancel-test', 'cancelReaction', 'like', 'visitor', added)).active, false, 'repeated cancellation cannot toggle again');
	await rpc('cancel-test', 'toggleReaction', 'like', 'visitor');
	const removed = auto();
	await rpc('cancel-test', 'toggleReaction', 'like', 'visitor', null, removed);
	assert.equal((await rpc('cancel-test', 'cancelReaction', 'like', 'visitor', removed)).active, true, 'cancellation restores a removed vote');
	const superseded = auto();
	await rpc('cancel-test', 'toggleReaction', 'like', 'visitor', null, superseded);
	await rpc('cancel-test', 'toggleReaction', 'like', 'visitor', null, auto());
	await rpc('cancel-test', 'toggleReaction', 'like', 'visitor', null, auto());
	assert.equal((await rpc('cancel-test', 'cancelReaction', 'like', 'visitor', superseded)).active, false, 'cancellation must not change later votes, even after an add/remove cycle');
	assert.equal((await rpc('cancel-test', 'getWidget')).widget.reactions[0].count, 0);
	const race = auto();
	await Promise.all([rpc('cancel-test', 'toggleReaction', 'like', 'visitor', null, race), rpc('cancel-test', 'cancelReaction', 'like', 'visitor', race)]);
	assert.equal(await rpc('cancel-test', 'hasVote', 'like', 'visitor'), false, 'vote/cancel race leaves the original state');
	console.log('PASS: production SQLite migration, legacy votes/tokens, guard updates/persistence, rejected undo, independent groups, unknown sources, restart');
} finally {
	await mf.dispose();
}
