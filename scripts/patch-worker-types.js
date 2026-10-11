import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const typesPath = fileURLToPath(new URL('../worker-configuration.d.ts', import.meta.url));
const source = readFileSync(typesPath, 'utf8');
const patched = source
	.replace(
		/mainModule: typeof import\(".*?_worker"\);/,
		'mainModule: unknown;'
	)
	.replace(
		/DurableObjectNamespace<import\(".*?_worker"\)\.(?:ReactionDocument|ServiceStatistics)>/g,
		'DurableObjectNamespace'
	);

if (patched !== source) {
	writeFileSync(typesPath, patched);
}
