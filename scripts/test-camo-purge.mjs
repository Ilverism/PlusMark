import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import ts from 'typescript';
import * as camo from '../src/lib/server/github-camo.ts';
import * as counts from '../src/lib/reaction-count.ts';
import * as throttle from '../src/lib/server/badge-throttle.ts';
import * as reactionSource from '../src/lib/server/reaction-source.ts';

// Execute the actual Durable Object's SQL against SQLite; replace only the
// Workers base class and external purge request so failures/timing are repeatable.
const source = await readFile(new URL('../src/lib/server/reaction-document.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const statisticsExports = {};
new Function('exports', ts.transpileModule(await readFile(new URL('../src/lib/server/document-statistics.ts', import.meta.url), 'utf8'), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText)(statisticsExports);

async function fixture(t, purge) {
	const db = new DatabaseSync(':memory:');
	t.after(() => db.close());
	let alarm = null;
	const ctx = { id: { toString: () => 'test' }, storage: {
		sql: { exec: (sql, ...args) => {
			const rows = db.prepare(sql).all(...args);
			return { toArray: () => rows, one: () => { assert.equal(rows.length, 1); return rows[0]; } };
		} },
		transactionSync: callback => callback(),
		getAlarm: async () => alarm,
		setAlarm: async value => { alarm = value; },
		deleteAlarm: async () => { alarm = null; }
	} };
	const exports = {};
	new Function('require', 'exports', compiled)(name => {
		if (name === 'cloudflare:workers') return { DurableObject: class {
			constructor(state) { this.ctx = state; this.env = { SERVICE_STATISTICS: { getByName: () => ({ record: async () => {} }) } }; }
		} };
		if (name === './document-statistics') return statisticsExports;
		if (name === './github-camo') return { ...camo, purgeCamoUrl: purge };
		if (name === '../reaction-count') return counts;
		if (name === './badge-throttle') return throttle;
		if (name === './reaction-source') return reactionSource;
		throw new Error(`Unexpected import ${name}`);
	}, exports);
	const document = new exports.ReactionDocument(ctx, {});
	await document.saveWidget({
		widget: { doc: 'test', returnUrl: 'https://github.com/example/repo', reactions: [
			{ id: 'like', emoji: '👍', label: 'Like', description: '' }
		] }, editTokenHash: null, createEditTokenHash: 'test'
	});
	document.storeCamoTargets([{
		reaction: 'like', canonicalUrl: 'https://example.com/badge?doc=test&r=like',
		camoUrl: 'https://camo.githubusercontent.com/test/image'
	}], Date.now());
	await document.toggleReaction('like', 'viewer1');
	db.prepare('UPDATE camo_targets SET next_purge_at = ?').run(Date.now() - 1);
	return { document, db, restart: () => new exports.ReactionDocument(ctx, {}), alarm: () => alarm, row: () => db.prepare('SELECT * FROM camo_targets').get() };
}

test('busy reactions publish once a minute, survive restart, and flush after traffic settles', async t => {
	let now = 1_800_000_000_000;
	t.mock.method(Date, 'now', () => now);
	const f = await fixture(t, async () => 200);
	let document = f.document;
	for (let i = 2; i <= 299; i++) await document.toggleReaction('like', `viewer${i}`);
	assert.equal((await document.getBadge('like')).throttled, false);
	await document.toggleReaction('like', 'viewer300');
	assert.equal((await document.getBadge('like')).throttled, true);
	const pending = f.row().purge_pending;
	for (let i = 301; i <= 380; i++) await document.toggleReaction('like', `viewer${i}`);
	assert.equal(f.row().purge_pending, pending);
	assert.equal((await document.getWidget()).widget.reactions[0].count, 380);
	assert.equal((await document.getBadge('like')).reaction.count, 300);
	document = f.restart();
	assert.equal((await document.getBadge('like')).reaction.count, 300);
	now += 30_000;
	await document.toggleReaction('like', 'viewer381');
	now += 30_000;
	await document.alarm();
	assert.equal((await document.getBadge('like')).reaction.count, 381);
	assert.equal((await document.getBadge('like')).throttled, true);
	now += 30_000;
	await document.alarm();
	assert.equal((await document.getBadge('like')).throttled, false);
	assert.equal((await document.getBadge('like')).reaction.count, 381);
	assert.ok(f.row().purge_pending > 0, 'clearing the indicator queues a final purge');
});

test('indicator transitions invalidate even when abbreviated counts do not change', async t => {
	let now = 1_800_000_000_000;
	t.mock.method(Date, 'now', () => now);
	const { document, db, row } = await fixture(t, async () => 200);
	db.prepare('UPDATE counts SET count = 2300').run();
	// Repeated add/remove actions count toward load even when the total stays near 2.3k.
	for (let i = 2; i <= 299; i++) await document.toggleReaction('like', 'repeated-viewer');
	db.prepare('UPDATE camo_targets SET purge_pending = 0, next_purge_at = 0').run();
	await document.toggleReaction('like', 'repeated-viewer');
	assert.equal(row().purge_pending, 1);
	assert.equal((await document.getBadge('like')).throttled, true);
	now += 60_000;
	await document.alarm();
	assert.equal((await document.getBadge('like')).throttled, false);
});

test('a failed purge remains scheduled for retry', async t => {
	const { document, row } = await fixture(t, async () => 503);
	await document.runCamoPurgeBatch(Date.now());
	assert.ok(row().purge_pending > 0);
	assert.ok(row().next_purge_at > Date.now());
	assert.ok(row().next_purge_at - row().last_purge_attempt_at >= 15 * 60_000);
	assert.equal(row().last_purge_status, 503);
});

test('a reaction arriving during a purge is not discarded', async t => {
	let finish;
	let started;
	let attempts = 0;
	const didStart = new Promise(resolve => { started = resolve; });
	const { document, row } = await fixture(t, () => {
		if (++attempts > 1) return Promise.resolve(200);
		started();
		return new Promise(resolve => { finish = resolve; });
	});
	const work = document.runCamoPurgeBatch(Date.now());
	await didStart;
	await document.toggleReaction('like', 'viewer2');
	finish(200);
	await work;
	assert.ok(row().purge_pending > 0);
	assert.ok(row().next_purge_at > Date.now());
	await document.runCamoPurgeBatch(row().next_purge_at + 1);
	assert.equal(attempts, 2);
	assert.equal(row().purge_pending, 0);
});

test('a successful purge clears the completed work', async t => {
	const { document, row } = await fixture(t, async () => 200);
	await document.runCamoPurgeBatch(Date.now());
	assert.equal(row().purge_pending, 0);
	assert.equal(row().next_purge_at, 0);
});

test('a permanent rejection does not retry indefinitely', async t => {
	const { document, row } = await fixture(t, async () => 403);
	await document.runCamoPurgeBatch(Date.now());
	assert.equal(row().purge_pending, 0);
	assert.equal(row().last_purge_status, 403);
});

test('only displayed count changes queue purges, while exact totals and pending work survive', async t => {
	const { document, db, row } = await fixture(t, async () => 200);
	db.prepare('UPDATE counts SET count = 2315').run();
	db.prepare('UPDATE camo_targets SET purge_pending = 0, next_purge_at = 0').run();
	assert.equal((await document.toggleReaction('like', 'viewer2')).count, 2316);
	assert.equal(row().purge_pending, 0);

	db.prepare('UPDATE counts SET count = 2399').run();
	assert.equal((await document.toggleReaction('like', 'viewer3')).count, 2400);
	assert.equal(row().purge_pending, 1);
	assert.equal((await document.toggleReaction('like', 'viewer3')).count, 2399);
	assert.equal(row().purge_pending, 2);
	assert.equal((await document.toggleReaction('like', 'viewer2')).count, 2398);
	assert.equal(row().purge_pending, 2);
	assert.equal((await document.getBadge('like')).reaction.count, 2398);
});

test('theme edits preserve votes, survive restart, and queue a Camo refresh only when changed', async t => {
	const f = await fixture(t, async () => 200);
	await f.document.alarm();
	const widget = (await f.document.getWidget()).widget;
	assert.equal(widget.badgeTheme, 'light');
	const save = (badgeTheme, editTokenHash = 'test') => f.document.saveWidget({
		widget: { ...widget, badgeTheme }, editTokenHash, createEditTokenHash: 'test'
	});
	assert.equal((await save('dark', 'wrong')).ok, false);
	assert.equal((await f.document.getBadge('like')).badgeTheme, 'light');
	assert.equal(f.row().purge_pending, 0);
	for (const badgeTheme of ['dark', 'soft-dark', 'light']) {
		const before = f.row().purge_pending;
		assert.equal((await save(badgeTheme)).widget.badgeTheme, badgeTheme);
		assert.equal(f.row().purge_pending, before + 1);
		await save(badgeTheme);
		await save(undefined);
		assert.equal(f.row().purge_pending, before + 1, 'same theme and old clients do not queue redundant purges');
		const badge = await f.restart().getBadge('like');
		assert.equal(badge.badgeTheme, badgeTheme);
		assert.equal(badge.reaction.count, 1);
	}
});
