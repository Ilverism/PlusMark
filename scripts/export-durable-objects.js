import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const workerPath = fileURLToPath(new URL('../build/cloudflare/_worker.js', import.meta.url));
const exportLines = [
	'export { ReactionDocument } from "../../src/lib/server/reaction-document.ts";',
	'export { ServiceStatistics } from "../../src/lib/server/service-statistics.ts";'
];
const worker = readFileSync(workerPath, 'utf8');

const missing = exportLines.filter(line => !worker.includes(line));
if (missing.length) writeFileSync(workerPath, `${worker.trimEnd()}\n${missing.join('\n')}\n`);
