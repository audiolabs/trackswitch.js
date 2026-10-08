import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGenerator } from "ts-json-schema-generator";
import { extractCssTokens } from "./lib/css-tokens.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fromRoot = (path) => resolve(rootDir, path);

const schemaUrl =
	"https://audiolabs.github.io/trackswitch.js/schema/trackswitch.schema.json";

/**
 * The view and media discriminants the schema is expected to describe. A
 * parallel list rather than a read of the allow-lists in src/config — those are
 * TypeScript, which a plain Node script cannot import — so this catches a type
 * added without a schema regeneration, not every possible drift.
 */
const expectedViewTypes = [
	"image",
	"perTrackImage",
	"waveform",
	"pianoRoll",
	"sheetMusic",
	"warpingMatrix",
	"text",
	"separator",
	"trackList",
	"navigationBar",
];
const expectedMediaTypes = ["audio", "midi", "musicxml", "image"];

const generatorConfig = {
	path: fromRoot("src/types.ts"),
	tsconfig: fromRoot("tsconfig.json"),
	type: "TrackSwitchInit",
	// Carries the prose in src/types.ts through as `description`, which is
	// what editors show on hover — the point of publishing the schema at all.
	jsDoc: "extended",
	topRef: false,
	// `npm run typecheck` is the type check; the bundled compiler here is only
	// reading shapes, and it resolves a couple of ambient declarations differently.
	skipTypeCheck: true,
};

function isObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walk(node, visit) {
	if (Array.isArray(node)) {
		for (const child of node) {
			walk(child, visit);
		}
		return;
	}

	if (!isObject(node)) {
		return;
	}

	visit(node);
	for (const child of Object.values(node)) {
		walk(child, visit);
	}
}

function resolveRef(schema, node) {
	if (typeof node?.$ref !== "string") {
		return node;
	}

	const name = node.$ref.replace("#/definitions/", "");
	return schema.definitions?.[name] ?? node;
}

/**
 * A bare `anyOf` makes an editor offer every view's options regardless of the
 * `type` already written. Editors narrow on `oneOf` branches whose discriminant
 * is a `const`, so unions that are discriminated get restated that way.
 */
function narrowDiscriminatedUnions(schema) {
	walk(schema, (node) => {
		const branches = node.anyOf;
		if (!Array.isArray(branches) || branches.length < 2) {
			return;
		}

		const resolved = branches.map((branch) => resolveRef(schema, branch));
		const discriminated = resolved.every(
			(branch) => branch?.type === "object" && branch.properties?.type?.const,
		);
		if (!discriminated) {
			return;
		}

		resolved.forEach((branch) => {
			branch.required = Array.from(
				new Set([...(branch.required ?? []), "type"]),
			);
		});
		node.oneOf = branches;
		delete node.anyOf;
	});
}

/** Puts each token's stylesheet default in the hover text. */
function describeCssTokens(schema, tokens) {
	const overrides = schema.definitions?.TrackSwitchCssOverrides;
	if (!overrides?.properties) {
		throw new Error(
			"TrackSwitchCssOverrides did not generate as an object with enumerated " +
				"token properties; the css schema wiring needs revisiting.",
		);
	}

	// Every token generates as the same `{ type: "string" }` node, and the
	// generator hands out one shared instance — so each gets its own copy before
	// a description is attached, or the last write would describe them all.
	tokens.forEach(({ name, value }) => {
		const property = overrides.properties[name];
		if (!property) {
			throw new Error(`Schema is missing the "${name}" css token property.`);
		}
		overrides.properties[name] = {
			...property,
			description: `Default: ${value}`,
		};
	});

	const extra = Object.keys(overrides.properties).filter(
		(name) => !tokens.some((token) => token.name === name),
	);
	if (extra.length > 0) {
		throw new Error(
			`Schema declares css tokens the stylesheet does not: ${extra.join(", ")}. ` +
				"Run `npm run tokens:build` first.",
		);
	}
}

function discriminantsOf(schema, node) {
	const branches = resolveRef(schema, node).oneOf ?? [];
	return branches
		.map((branch) => resolveRef(schema, branch).properties?.type?.const)
		.filter((value) => typeof value === "string")
		.sort();
}

function assertDiscriminants(actual, expected, label) {
	const wanted = [...expected].sort();
	if (actual.join(",") !== wanted.join(",")) {
		throw new Error(
			`${label} discriminants drifted.\n  schema:   ${actual.join(", ")}\n  expected: ${wanted.join(", ")}\n` +
				"Update the expected list in scripts/generate-schema.mjs if a type was added on purpose.",
		);
	}
}

const tokens = extractCssTokens(rootDir);
const schema = createGenerator(generatorConfig).createSchema(
	generatorConfig.type,
);

narrowDiscriminatedUnions(schema);
describeCssTokens(schema, tokens);

assertDiscriminants(
	discriminantsOf(schema, schema.properties.views.items),
	expectedViewTypes,
	"View",
);
assertDiscriminants(
	discriminantsOf(
		schema,
		resolveRef(schema, schema.properties.media).additionalProperties,
	),
	expectedMediaTypes,
	"Media",
);

schema.$schema = "http://json-schema.org/draft-07/schema#";
schema.$id = schemaUrl;
schema.title = "TrackSwitch player configuration";

const json = `${JSON.stringify(schema, null, "\t")}\n`;
for (const target of [
	"docs/schema/trackswitch.schema.json",
	"dist/schema/trackswitch.schema.json",
]) {
	const path = fromRoot(target);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, json);
	console.log(`wrote ${target}`);
}
