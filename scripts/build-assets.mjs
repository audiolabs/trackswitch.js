import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const runtimeAssets = [];

export const docsAssets = [
	{
		source: "dist/js/trackswitch.js",
		docs: "docs/js/trackswitch.js",
	},
	{
		source: "dist/js/trackswitch-interactive-worker.js",
		docs: "docs/js/trackswitch-interactive-worker.js",
	},
	...runtimeAssets.map(({ dist, docs }) => ({
		source: dist,
		docs,
	})),
	{
		source: "examples/default/data",
		docs: "docs/assets/multitracks",
	},
	{
		source: "examples/sync/data",
		docs: "docs/assets/alignment",
	},
];

export function fromRoot(path) {
	return resolve(rootDir, path);
}
