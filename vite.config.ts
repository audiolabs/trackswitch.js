import { resolve } from "node:path";
import { defineConfig, type UserConfig } from "vite";

const rootDir = import.meta.dirname;
const banner = [
	"/*!",
	" * trackswitch (https://github.com/audiolabs/trackswitch.js)",
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
	"interactive-browser": {
		build: {
			...commonBuild,
			outDir: "dist/interactive",
			assetsInlineLimit: Number.MAX_SAFE_INTEGER,
			lib: {
				entry: resolve(rootDir, "extensions/interactive-alignment/browser.ts"),
				name: "TrackSwitchInteractive",
				formats: ["iife"],
				fileName: () => "trackswitch-interactive.js",
			},
			rollupOptions: {
				output: iifeOutput,
			},
		},
	},
	"interactive-worker": {
		build: {
			...commonBuild,
			// Loaded as a module worker: Pyodide no longer supports classic
			// workers, and the CDN runtime is pulled in via dynamic import().
			target: "es2020",
			outDir: "dist/interactive",
			lib: {
				entry: resolve(
					rootDir,
					"extensions/interactive-alignment/worker/alignment-worker.ts",
				),
				formats: ["es"],
				fileName: () => "trackswitch-interactive-worker.js",
			},
			rollupOptions: {
				output: {
					banner,
					inlineDynamicImports: true,
				},
			},
		},
	},
	builder: {
		build: {
			...commonBuild,
			outDir: "dist/docs",
			assetsInlineLimit: Number.MAX_SAFE_INTEGER,
			lib: {
				entry: resolve(rootDir, "src/builder/index.ts"),
				name: "TrackSwitchBuilder",
				formats: ["iife"],
				fileName: () => "trackswitch-builder.js",
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

export default defineConfig(({ mode }) => {
	const buildTarget = Object.hasOwn(buildTargets, mode) ? mode : "browser";
	const config = buildTargets[buildTarget as keyof typeof buildTargets];

	// `npm run docs:watch` writes the bundles straight into the Jekyll site;
	// their file names already match the ones docs:assets copies them to.
	if (process.env.TRACKSWITCH_DOCS_WATCH === "1") {
		return {
			...config,
			build: { ...config.build, outDir: "docs/js", watch: {} },
		};
	}

	return config;
});
