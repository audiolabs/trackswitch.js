import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The two stylesheets that declare the player's *public* theming tokens on the
 * root element. Deliberately not a glob over `src/css/parts/`: the other parts
 * declare component-scoped custom properties (marker placement, track row
 * state, zoom viewport geometry) that only make sense on the element they are
 * declared on, and `docs/css/style.css` is the Jekyll site's own stylesheet
 * using an unrelated `--ts-doc-*` namespace.
 *
 * `src/css/parts/interactive.css` is excluded too — it is not among the imports
 * in `src/css/trackswitch.css`, so its tokens cannot affect a configured player.
 */
const tokenSources = [
	{ path: "src/css/parts/colors.css", selector: ".trackswitch" },
	{
		path: "src/css/parts/layout-tokens.css",
		selector: ".trackswitch.trackswitch",
	},
];

/**
 * Properties the player writes itself at runtime via `style.setProperty` —
 * playback position, marker placement, per-layer marker appearance, resolved
 * row height. None is declared at root scope today, so this list is a
 * trip-wire rather than a filter: if one ever shows up there, exposing it as a
 * user-settable token would let a config silently fight the renderer, and that
 * deserves a deliberate decision rather than a silent inclusion.
 */
const runtimeWrittenTokens = new Set([
	"--ts-marker-position",
	"--ts-marker-highlight-color",
	"--ts-marker-line-width",
	"--ts-marker-opacity",
	"--ts-marker-active-opacity",
	"--ts-track-row-height",
	"--ts-track-row-bg",
	"--ts-separator-thickness",
	"--ts-playhead-position",
	"--ts-loop-marker-a",
	"--ts-loop-marker-b",
	"--ts-loop-region-start",
	"--ts-loop-region-width",
	"--ts-zoom-viewport-left",
	"--ts-zoom-viewport-width",
]);

/**
 * A token whose value is computed from other tokens is plumbing, not a knob:
 * overriding it in isolation breaks the relationship it exists to express.
 */
const computedValuePattern = /\b(?:calc|clamp|min|max)\(/;

const declarationPattern = /^--ts-[a-z0-9-]+$/;

/** Returns the body of the first `selector { ... }` rule, brace-matched. */
function readRuleBody(css, selector, path) {
	const selectorIndex = css.indexOf(`${selector} {`);
	if (selectorIndex === -1) {
		throw new Error(`${path}: no "${selector} {" rule found.`);
	}

	const bodyStart = css.indexOf("{", selectorIndex) + 1;
	let depth = 1;
	let index = bodyStart;
	while (index < css.length && depth > 0) {
		if (css[index] === "{") depth += 1;
		if (css[index] === "}") depth -= 1;
		index += 1;
	}

	if (depth !== 0) {
		throw new Error(`${path}: unbalanced braces in the "${selector}" rule.`);
	}

	return css.slice(bodyStart, index - 1);
}

/**
 * Splits a rule body into `name: value` declarations. Values may span lines, so
 * this splits on semicolons rather than newlines. Comments go first: a comment
 * sits in the same chunk as the declaration that follows it, and would
 * otherwise be read as part of that declaration's name.
 */
function readDeclarations(body) {
	return body
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.split(";")
		.map((declaration) => declaration.trim())
		.filter((declaration) => declaration.length > 0)
		.map((declaration) => {
			const separatorIndex = declaration.indexOf(":");
			if (separatorIndex === -1) {
				return null;
			}
			return {
				name: declaration.slice(0, separatorIndex).trim(),
				value: declaration
					.slice(separatorIndex + 1)
					.trim()
					.replace(/\s+/g, " "),
			};
		})
		.filter((declaration) => declaration !== null);
}

/**
 * The public `--ts-*` tokens, in declaration order, as `{ name, value, source }`.
 * Feeds both the generated runtime allow-list and the JSON Schema's enumerated
 * `css` properties, so the two can never disagree about what is themeable.
 */
export function extractCssTokens(rootDir) {
	const tokens = [];

	for (const { path, selector } of tokenSources) {
		const css = readFileSync(resolve(rootDir, path), "utf8");
		const body = readRuleBody(css, selector, path);

		for (const { name, value } of readDeclarations(body)) {
			if (!declarationPattern.test(name)) {
				continue;
			}

			if (runtimeWrittenTokens.has(name)) {
				throw new Error(
					`${path}: "${name}" is declared on ${selector} but is also written at ` +
						"runtime by the player. Decide whether it is still renderer-owned and " +
						"update runtimeWrittenTokens in scripts/lib/css-tokens.mjs.",
				);
			}

			if (computedValuePattern.test(value)) {
				continue;
			}

			tokens.push({ name, value, source: path });
		}
	}

	const seen = new Set();
	for (const { name } of tokens) {
		if (seen.has(name)) {
			throw new Error(`Duplicate --ts-* token declaration: "${name}".`);
		}
		seen.add(name);
	}

	return tokens;
}
