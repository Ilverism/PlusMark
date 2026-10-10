import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { test } from 'node:test';

function load(path) {
	const exports = {};
	new Function('exports', ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	}).outputText)(exports);
	return exports;
}
const widget = load('../src/lib/widget.ts');

test('group IDs isolate counters without changing legacy IDs or truncating suffixes', () => {
	assert.equal(widget.buildGroupContentId('My Document', ''), 'my-document');
	assert.equal(widget.buildGroupContentId('My Document', 'Intro'), 'my-document-g-intro');
	assert.notEqual(widget.buildGroupContentId('doc', 'a'), widget.buildGroupContentId('doc', 'b'));
	assert.equal(widget.buildGroupContentId('x'.repeat(120), 'a'), null);
	assert.equal(widget.buildGroupContentId('doc', '!!!'), null);
	assert.equal(widget.buildGroupContentId('doc', 'x'.repeat(33)), null);
	assert.equal(widget.buildGroupContentId('', 'a'), null);
	const ids = Array.from({ length: 1000 }, () => widget.createReactionGroupId());
	assert.equal(new Set(ids).size, ids.length);
	assert.ok(ids.every(id => /^[a-f0-9]{16}$/.test(id)));
});

test('referrer checking rejects known mismatches while allowing unknown sources', () => {
	const { isReactionSourceAllowed: allowed } = load('../src/lib/server/reaction-source.ts');
	const target = 'https://github.com/owner/repo/issues/1#issuecomment-123';
	for (const source of [null, '', 'not a URL', 'https://github.com/', target, target.replace('123', '456'), 'https://github.com/owner/repo/issues/1?notification=abc']) {
		assert.equal(allowed(target, source), true, String(source));
	}
	for (const source of ['https://evil.example/', 'https://github.com/owner/repo/issues/2', 'https://github.com/owner/other/issues/1', 'https://github.com.evil.example/owner/repo/issues/1']) {
		assert.equal(allowed(target, source), false, source);
	}
	assert.equal(allowed('https://example.com/?article=1', 'https://example.com/?article=2'), false);
	assert.equal(allowed('https://example.com/?article=1', 'https://example.com/?tracking=x&article=1'), true);
	assert.equal(allowed('https://example.com/?article=1', 'https://example.com/'), true);
	assert.equal(allowed('https://example.com/?a=1&a=2', 'https://example.com/?a=1'), false);
});
