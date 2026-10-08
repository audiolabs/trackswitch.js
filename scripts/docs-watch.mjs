import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modes = [
	"browser",
	"interactive-browser",
	"interactive-worker",
	"builder",
];

const children = modes.map((mode) =>
	spawn("npx", ["vite", "build", "--mode", mode], {
		cwd: rootDir,
		stdio: "inherit",
		env: { ...process.env, TRACKSWITCH_DOCS_WATCH: "1" },
	}),
);

function stop() {
	for (const child of children) child.kill();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) {
	child.on("exit", (code) => {
		if (code) {
			stop();
			process.exitCode = code;
		}
	});
}
