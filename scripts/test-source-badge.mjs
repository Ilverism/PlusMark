import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as themes from '../src/lib/badge-theme.ts';
import * as marker from '../src/lib/server/destination-marker.ts';

const githubMark = await readFile(new URL('../src/lib/assets/github-mark.svg', import.meta.url), 'utf8');
const compiled = ts.transpileModule(await readFile(new URL('../src/routes/source-badge/+server.ts', import.meta.url), 'utf8'), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

async function render(returnUrl, badgeTheme, favicon) {
	let faviconCalls = 0;
	const exports = {};
	new Function('require', 'exports', compiled)(name => {
		if (name === '$lib/assets/github-mark.svg?raw') return githubMark;
		if (name === '$lib/badge-theme') return themes;
		if (name === '$lib/server/destination-marker') return marker;
		if (name === '$lib/widget') return { normalizeDocId: value => value };
		if (name === '@sveltejs/kit') return { error: () => assert.fail('unexpected route error') };
		if (name === '$lib/server/source-favicon') return { sourceFavicon: async () => { faviconCalls++; return favicon; } };
		if (name === '$lib/server/reaction-service') return {
			getReactionDocumentStub: async () => ({ getWidget: async () => ({ ok: true, widget: { returnUrl, badgeTheme } }) })
		};
		throw Error(`Unexpected import ${name}`);
	}, exports);
	const response = await exports.GET({ url: new URL('https://plusmark.example/source-badge?doc=test') });
	return { svg: await response.text(), faviconCalls };
}

test('GitHub source badges use a transparent bundled mark in every theme without fetching a favicon', async () => {
	for (const [theme, palette] of Object.entries(themes.BADGE_THEMES)) {
		for (const host of ['github.com', 'www.github.com', 'GITHUB.COM']) {
			const { svg, faviconCalls } = await render(`https://${host}/owner/repo`, theme, 'data:image/png;base64,white');
			assert.equal(faviconCalls, 0);
			assert.ok(svg.includes(`<g transform="translate(7 4)" fill="${palette.text}">${githubMark}</g>`));
			assert.ok(!svg.includes('<image'));
			assert.match(svg, /data-destination-marker/);
			assert.match(svg, /x="29" y="15.5"/);
		}
	}
});

test('other hosts keep their favicon or fallback, including GitHub lookalikes and hosted user sites', async () => {
	for (const host of ['example.com', 'github.com.evil.example', 'notgithub.com', 'user.github.io']) {
		const { svg, faviconCalls } = await render(`https://${host}/`, 'dark', 'data:image/png;base64,original');
		assert.equal(faviconCalls, 1);
		assert.match(svg, /<image x="7" y="4" width="16" height="16" href="data:image\/png;base64,original"/);
		assert.ok(!svg.includes(githubMark));
	}
	const { svg } = await render('https://example.com/', 'dark', null);
	assert.ok(!svg.includes('<image'));
	assert.ok(svg.includes(`stroke="${themes.BADGE_THEMES.dark.muted}"`));
});
