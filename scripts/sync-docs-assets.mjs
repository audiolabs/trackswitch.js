import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { docsAssets, fromRoot } from "./build-assets.mjs";

for (const { source, docs } of docsAssets) {
	const sourcePath = fromRoot(source);
	const targetPath = fromRoot(docs);

	if (!existsSync(sourcePath)) {
		throw new Error(`Missing source path: ${sourcePath}`);
	}

	rmSync(targetPath, { recursive: true, force: true });
	mkdirSync(dirname(targetPath), { recursive: true });
	cpSync(sourcePath, targetPath, { recursive: true });
}
