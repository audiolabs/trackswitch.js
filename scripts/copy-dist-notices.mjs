import { cpSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
	cpSync(resolve(rootDir, file), resolve(rootDir, "dist", file));
}
