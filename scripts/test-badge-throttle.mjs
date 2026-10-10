import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Use Wrangler's installed workerd runtime; no test routes enter the app bundle.
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { Miniflare } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const result = await build({
	stdin: { contents: `
import { ReactionDocument as ProductionDocument } from './src/lib/server/reaction-document.ts';
import { GET } from './src/routes/badge/+server.ts';
export class ReactionDocument extends ProductionDocument {
 async publication() { return this.ctx.storage.sql.exec('SELECT * FROM badge_publications WHERE reaction = ?', 'like').toArray()[0]; }
}
export default { async fetch(request, env, ctx) {
 const url = new URL(request.url);
 const doc = url.searchParams.get('doc') || 'throttle-runtime';
 const stub = env.REACTION_DOCUMENTS.get(env.REACTION_DOCUMENTS.idFromName(doc));
 if (url.pathname === '/badge') return GET({ url, platform: { env, ctx, caches } });
 const command = await request.json();
 if (command.action === 'create') return Response.json(await stub.saveWidget({
  widget: { doc, returnUrl: 'https://example.com/article', reactions: [
   {id:'like',emoji:'👍',label:'Like',description:''}, {id:'love',emoji:'❤️',label:'Love',description:''}
  ] }, editTokenHash:null, createEditTokenHash:'test'
 }));
 if (command.action === 'votes') {
  let result;
  for(let i=command.start;i<command.start+command.count;i++) result=await stub.toggleReaction('like','voter-'+i);
  return Response.json(result);
 }
 if (command.action === 'widget') return Response.json(await stub.getWidget());
 if (command.action === 'publication') return Response.json({ok:true, state:await stub.publication()});
 return Response.json(await stub.getBadge('like'));
}};
`, resolveDir: root, loader: 'ts' },
	bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
	external: ['cloudflare:workers'],
	plugins: [{ name: 'local-test-service', setup(build) {
		build.onResolve({ filter: /^\$lib\/server\/reaction-service$/ }, () => ({ path: 'service', namespace: 'test' }));
		build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
export function parseDocAndReaction(event) { return { doc:event.url.searchParams.get('doc'), reaction:event.url.searchParams.get('r') }; }
export async function getReactionDocumentStub(event, doc) { const ns=event.platform.env.REACTION_DOCUMENTS; return ns.get(ns.idFromName(doc)); }
` }));
		build.onResolve({ filter: /^\$lib\// }, args => ({ path: `${root}src/lib/${args.path.slice(5)}.ts` }));
	} }]
});
const mf = new Miniflare({
	modules: true, script: result.outputFiles[0].text, compatibilityDate: '2026-05-23',
	durableObjects: { REACTION_DOCUMENTS: { className: 'ReactionDocument', useSQLite: true } }
});
const command = async body => {
	const response = await mf.dispatchFetch('https://example.com/command', { method: 'POST', body: JSON.stringify(body) });
	assert.equal(response.status, 200);
	const result = await response.json();
	assert.equal(result.ok, true);
	return result;
};
const badge = () => mf.dispatchFetch('https://example.com/badge?doc=throttle-runtime&r=like');
try {
	await command({ action: 'create' });
	assert.ok(!(await (await badge()).text()).includes('data-throttled'));
	for (let start = 0; start < 300; start += 50) await command({ action: 'votes', start, count: 50 });
	const hot = await (await badge()).text();
	assert.match(hot, /data-throttled="true"/);
	assert.match(hot, />300<\/text>/);
	await command({ action: 'votes', start: 300, count: 20 });
	assert.equal(await (await badge()).text(), hot);
	assert.equal((await command({ action: 'widget' })).widget.reactions[0].count, 320);
	const quiet = await mf.dispatchFetch('https://example.com/badge?doc=throttle-runtime&r=love');
	assert.ok(!(await quiet.text()).includes('data-throttled'));
	await mkdir(new URL('../.cache-probes/', import.meta.url), { recursive: true });
	await writeFile(new URL('../.cache-probes/throttled-badge.svg', import.meta.url), hot);
	console.log('workerd: 320 exact votes; badge snapshot 300; hourglass visible; other reaction remains live. Waiting for the real alarm...');
	await new Promise(resolve => setTimeout(resolve, 65_000));
	const { state } = await command({ action: 'publication' });
	assert.equal(state.throttled_until, 0, 'alarm must clear throttling before any badge read');
	assert.equal(state.published_count, 320, 'alarm must publish the last votes without a reader');
	const fresh = await (await badge()).text();
	assert.match(fresh, />320<\/text>/);
	assert.ok(!fresh.includes('data-throttled'));
	await writeFile(new URL('../.cache-probes/refreshed-badge.svg', import.meta.url), fresh);
	assert.equal((await command({ action: 'votes', start: 0, count: 1 })).count, 319);
	assert.match(await (await badge()).text(), />319<\/text>/);
	console.log('workerd: cooldown cleared the hourglass and published 320; subsequent undo immediately shows 319. PASS');
} finally {
	await mf.dispose();
}
