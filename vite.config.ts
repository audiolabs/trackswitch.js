import { resolve } from "node:path";
import { defineConfig, type Plugin, type UserConfig } from "vite";

const rootDir = __dirname;
const banner = [
	"/*!",
	" * trackswitch.js (https://github.com/audiolabs/trackswitch.js)",
	" * Copyright 2026 International Audio Laboratories Erlangen",
	" * Licensed under MIT (https://github.com/audiolabs/trackswitch.js/blob/master/LICENSE)",
	" */",
].join("\n");

const commonBuild = {
	emptyOutDir: false,
	target: "es2017",
	sourcemap: false,
} as const;

const iifeOutput = {
	banner,
	inlineDynamicImports: true,
} as const;

function examplesRootPlugin(): Plugin {
	return {
		name: "trackswitch-examples-root",
		configureServer(server) {
			server.middlewares.use((request, response, next) => {
				if (request.url === "/" || request.url === "/index.html") {
					response.statusCode = 302;
					response.setHeader("Location", "/examples/");
					response.end();
					return;
				}

				next();
			});
		},
	};
}

const devConfig = {
	root: rootDir,
	plugins: [examplesRootPlugin()],
	server: {
		host: "0.0.0.0",
		port: 8000,
		fs: {
			allow: [rootDir],
		},
	},
} satisfies UserConfig;

const buildTargets = {
	browser: {
		build: {
			...commonBuild,
			outDir: "dist/js",
			assetsInlineLimit: Number.MAX_SAFE_INTEGER,
			lib: {
				entry: resolve(rootDir, "src/browser.ts"),
				name: "TrackSwitch",
				formats: ["iife"],
				fileName: () => "trackswitch.js",
			},
			rollupOptions: {
				output: iifeOutput,
			},
		},
	},
	worker: {
		build: {
			...commonBuild,
			outDir: "dist/js",
			lib: {
				entry: resolve(rootDir, "src/interactive/worker/alignment-worker.ts"),
				name: "TrackSwitchSyncWorker",
				formats: ["iife"],
				fileName: () => "trackswitch-interactive-worker.js",
			},
			rollupOptions: {
				output: iifeOutput,
			},
		},
	},
	esm: {
		build: {
			...commonBuild,
			outDir: "dist/esm",
			lib: {
				entry: {
					index: resolve(rootDir, "src/index.ts"),
					element: resolve(rootDir, "src/element.ts"),
					react: resolve(rootDir, "src/react.ts"),
					vue: resolve(rootDir, "src/vue.ts"),
					svelte: resolve(rootDir, "src/svelte.ts"),
					interactive: resolve(rootDir, "src/interactive.ts"),
				},
				formats: ["es"],
			},
			rollupOptions: {
				external: ["react", "vue"],
				output: {
					banner,
					entryFileNames: "[name].js",
					chunkFileNames: "chunks/[name]-[hash].js",
					assetFileNames: "assets/[name]-[hash][extname]",
				},
			},
		},
	},
} satisfies Record<string, UserConfig>;

export default defineConfig(({ command, mode }) => {
	if (command === "serve") {
		return devConfig;
	}

	const buildTarget = mode === "production" ? "browser" : mode;

	if (!Object.hasOwn(buildTargets, buildTarget)) {
		throw new Error(`Unknown Vite build mode: ${buildTarget}`);
	}

	return buildTargets[buildTarget as keyof typeof buildTargets];
});
