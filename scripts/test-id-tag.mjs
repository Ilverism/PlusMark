import assert from 'node:assert/strict';
import test from 'node:test';
import { compile } from 'mdsvex';
import { buildMarkdownSnippet } from '../src/lib/widget.ts';

const widget = {
	doc: 'example-content-g-1234567890abcdef', returnUrl: 'https://example.com/page',
	reactions: [
		{ id: 'like', emoji: '👍', label: 'Like', description: 'I like this!' },
		{ id: 'fire', emoji: '🔥', label: 'Fire', description: 'Great!' }
	]
};
const tag = `<sup><sub><code>${widget.doc}</code></sub></sup>`;

test('ID tag is opt-in and uses the full group ID in row and column layouts', () => {
	for (const source of [false, true]) for (const branding of [false, true]) {
		for (const format of ['row', 'column']) {
			const original = buildMarkdownSnippet(widget, 'https://badges.example', branding, source, format);
			assert.ok(!original.includes('<sup>'));
			assert.equal(buildMarkdownSnippet(widget, 'https://badges.example', branding, source, format, false), original);
			const output = buildMarkdownSnippet(widget, 'https://badges.example', branding, source, format, true);
			if (format === 'row') assert.equal(output, `${original}\n\n${tag}`);
			else {
				const lines = original.split('\n');
				lines.splice(lines.length - Number(branding), 0, tag);
				assert.equal(output, lines.join('\n'));
			}
		}
	}
});

test('tables place the ID in the source cell or an independent ID column', async () => {
	for (const source of [false, true]) for (const branding of [false, true]) {
		for (const format of ['table-no-desc', 'table-with-desc']) {
			const output = buildMarkdownSnippet(widget, 'https://badges.example', branding, source, format, true);
			const rows = output.split('\n').map(row => row.slice(2, -2).split(' | '));
			const columns = 3 + Number(branding);
			assert.equal(rows.length, format === 'table-with-desc' ? 4 : 3);
			assert.ok(rows.every(row => row.length === columns));
			assert.equal(rows[0][2], source ? 'Source' : 'ID');
			assert.equal(rows.flat().filter(cell => cell.includes(tag)).length, 1);
			if (format === 'table-with-desc') {
				assert.equal(rows[3][2], tag);
				assert.equal(rows[3][0], 'I like this!');
				assert.ok(!rows[2][2].includes(tag));
			} else {
				assert.ok(rows[2][2].endsWith(source ? `<br/>${tag}` : tag));
			}
			const { code } = await compile(output);
			assert.equal((code.match(/<th[ >]/g) ?? []).length, columns);
			assert.equal((code.match(/<td[ >]/g) ?? []).length, columns * (format === 'table-with-desc' ? 2 : 1));
			assert.equal((code.match(/<img\s/g) ?? []).length, 2 + Number(source) + Number(branding));
			assert.ok(code.includes(tag));
		}
	}
});

test('ID without a group suffix is displayed intact and ID text cannot insert HTML', () => {
	const output = buildMarkdownSnippet({ ...widget, doc: 'content-only' }, 'https://badges.example', false, false, 'row', true);
	assert.ok(output.includes('<code>content-only</code>'));
	const escaped = buildMarkdownSnippet({ ...widget, doc: '<script>|&`' }, 'https://badges.example', false, false, 'table-no-desc', true);
	assert.ok(!escaped.includes('<script>'));
	assert.ok(escaped.includes('<code>&#60;script&#62;&#124;&#38;&#96;</code>'));
});
