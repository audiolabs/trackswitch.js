export interface JsonSchema {
	$ref?: string;
	type?: string | string[];
	const?: unknown;
	enum?: unknown[];
	description?: string;
	default?: unknown;
	properties?: Record<string, JsonSchema>;
	required?: string[];
	additionalProperties?: boolean | JsonSchema;
	propertyNames?: JsonSchema;
	items?: JsonSchema | JsonSchema[];
	minItems?: number;
	maxItems?: number;
	oneOf?: JsonSchema[];
	anyOf?: JsonSchema[];
	definitions?: Record<string, JsonSchema>;
}

export const BUILDER_MEDIA_TYPES = [
	"audio",
	"midi",
	"musicxml",
	"image",
] as const;
export const BUILDER_VIEW_TYPES = [
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
] as const;

export function resolveSchema(root: JsonSchema, node: JsonSchema): JsonSchema {
	const prefix = "#/definitions/";
	const visited = new Set<string>();
	let current = node;
	while (current.$ref) {
		if (!current.$ref.startsWith(prefix)) {
			throw new Error(`Unsupported schema reference: ${current.$ref}`);
		}
		if (visited.has(current.$ref)) {
			throw new Error(`Circular schema reference: ${current.$ref}`);
		}
		visited.add(current.$ref);
		const definition = root.definitions?.[current.$ref.slice(prefix.length)];
		if (!definition)
			throw new Error(`Missing schema definition: ${current.$ref}`);
		current = definition;
	}
	return current;
}

export function getDefinition(root: JsonSchema, name: string): JsonSchema {
	const definition = root.definitions?.[name];
	if (!definition) throw new Error(`Missing schema definition: ${name}`);
	return definition;
}

export function getDiscriminatedSchema(
	root: JsonSchema,
	definitionName: string,
	discriminant: string,
): JsonSchema {
	const union = resolveSchema(root, getDefinition(root, definitionName));
	const branch = (union.oneOf ?? union.anyOf ?? [])
		.map((candidate) => resolveSchema(root, candidate))
		.find((candidate) => candidate.properties?.type?.const === discriminant);
	if (!branch) {
		throw new Error(
			`Schema ${definitionName} has no "${discriminant}" branch.`,
		);
	}
	return branch;
}

function discriminants(root: JsonSchema, definitionName: string): string[] {
	const union = resolveSchema(root, getDefinition(root, definitionName));
	return (union.oneOf ?? union.anyOf ?? [])
		.map((candidate) => resolveSchema(root, candidate).properties?.type?.const)
		.filter((value): value is string => typeof value === "string")
		.sort();
}

function assertSameValues(
	actual: readonly string[],
	expected: readonly string[],
	label: string,
): void {
	const wanted = [...expected].sort();
	if (actual.join(",") !== wanted.join(",")) {
		throw new Error(
			`${label} schema coverage drifted. Schema: ${actual.join(", ")}; builder: ${wanted.join(", ")}.`,
		);
	}
}

function assertFormSchemaSupported(
	root: JsonSchema,
	node: JsonSchema,
	path: string,
	visited = new Set<JsonSchema>(),
): void {
	const schema = resolveSchema(root, node);
	if (visited.has(schema)) return;
	visited.add(schema);
	const union = schema.oneOf ?? schema.anyOf;
	if (union) {
		union.forEach((branch, index) => {
			assertFormSchemaSupported(
				root,
				branch,
				`${path}.option${String(index + 1)}`,
				visited,
			);
		});
		return;
	}
	if (schema.const !== undefined) return;
	if (Array.isArray(schema.type)) {
		for (const type of schema.type) {
			if (!["string", "number", "integer", "boolean"].includes(type)) {
				throw new Error(`${path} uses unsupported schema type "${type}".`);
			}
		}
		return;
	}
	if (["string", "number", "integer", "boolean"].includes(schema.type ?? "")) {
		return;
	}
	if (schema.type === "array") {
		if (!schema.items) throw new Error(`${path} has an untyped array.`);
		const items = Array.isArray(schema.items) ? schema.items : [schema.items];
		items.forEach((item, index) => {
			assertFormSchemaSupported(
				root,
				item,
				`${path}[${String(index)}]`,
				visited,
			);
		});
		return;
	}
	if (schema.type === "object") {
		for (const [key, property] of Object.entries(schema.properties ?? {})) {
			assertFormSchemaSupported(root, property, `${path}.${key}`, visited);
		}
		if (typeof schema.additionalProperties === "object") {
			assertFormSchemaSupported(
				root,
				schema.additionalProperties,
				`${path}.*`,
				visited,
			);
		} else if (schema.additionalProperties === true) {
			throw new Error(`${path} has untyped additional properties.`);
		}
		return;
	}
	throw new Error(
		`${path} uses unsupported schema type "${schema.type ?? "unknown"}".`,
	);
}

export function assertBuilderSchemaCoverage(root: JsonSchema): void {
	assertSameValues(
		discriminants(root, "MediaEntryConfig"),
		BUILDER_MEDIA_TYPES,
		"Media",
	);
	assertSameValues(
		discriminants(root, "TrackSwitchViewConfig"),
		BUILDER_VIEW_TYPES,
		"View",
	);
	for (const type of BUILDER_MEDIA_TYPES) {
		assertFormSchemaSupported(
			root,
			getDiscriminatedSchema(root, "MediaEntryConfig", type),
			`media.${type}`,
		);
	}
	for (const type of BUILDER_VIEW_TYPES) {
		assertFormSchemaSupported(
			root,
			getDiscriminatedSchema(root, "TrackSwitchViewConfig", type),
			`views.${type}`,
		);
	}
	for (const definition of [
		"AlignmentConfig",
		"MarkerSequenceSourceConfig",
		"PresetConfig",
		"TrackSwitchCssOverrides",
	]) {
		assertFormSchemaSupported(
			root,
			getDefinition(root, definition),
			definition,
		);
	}
	const features = root.properties?.features;
	if (!features) throw new Error("Generated schema has no features block.");
	assertFormSchemaSupported(root, features, "features");
}
