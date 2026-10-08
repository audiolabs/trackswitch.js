import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const docsAssets = [
	{
		source: "dist/js/trackswitch.js",
		docs: "docs/js/trackswitch.js",
	},
	{
		source: "dist/interactive/trackswitch-interactive.js",
		docs: "docs/js/trackswitch-interactive.js",
	},
	{
		source: "dist/interactive/trackswitch-interactive-worker.js",
		docs: "docs/js/trackswitch-interactive-worker.js",
	},
	{
		source: "dist/docs/trackswitch-builder.js",
		docs: "docs/js/trackswitch-builder.js",
	},
	{
		source: "LICENSE",
		docs: "docs/assets/builder/LICENSE",
	},
	{
		source: "THIRD_PARTY_NOTICES.md",
		docs: "docs/assets/builder/THIRD_PARTY_NOTICES.md",
	},
];

/**
 * Media that belongs to someone else and is large enough that committing it
 * would weigh down the repository. It is fetched into the (git-ignored) docs
 * assets folders at build time, so the published site always carries whatever
 * the upstream host currently serves.
 *
 * A file is either a plain name, or `{ from, to }` when the demo renames it.
 *
 * Every URL below points at the publisher's stable `content` path rather than a
 * CMS media link, because those carry a content hash that changes whenever the
 * file is re-uploaded.
 */
const remoteDocsAssets = [
	{
		docs: "docs/assets/chorale-bricks",
		baseUrl:
			"https://www.audiolabs-erlangen.de/content/resources/MIR/00_2025-ChoraleBricks/0_Drese_JesuGehVoran/tracks",
		files: [
			"01_cl.m4a",
			"01_fh.m4a",
			"01_fl.m4a",
			"01_ob.m4a",
			"01_tp.m4a",
			"02_cl.m4a",
			"02_eh.m4a",
			"02_fh.m4a",
			"02_tp.m4a",
			"03_bar.m4a",
			"03_bs.m4a",
			"04_bar.m4a",
			"04_bcl.m4a",
			"04_bs.m4a",
			"04_tb.m4a",
			"04_tba.m4a",
		],
	},
	{
		docs: "docs/assets/per-track-image",
		baseUrl:
			"https://www.audiolabs-erlangen.de/content/resources/00_2016-SPL-MAR-KALMAN",
		files: [
			{ from: "spl_input.wav", to: "input.wav" },
			{ from: "spl_desired.wav", to: "desired.wav" },
			{ from: "spl_L15_kalman.wav", to: "kalman.wav" },
			{ from: "spl_L15_rls-scd.wav", to: "rls-scd.wav" },
			{ from: "spl_L15_rls-scd-mle.wav", to: "rls-scd-mle.wav" },
			{ from: "spl_input.png", to: "input.png" },
			{ from: "spl_desired.png", to: "desired.png" },
			{ from: "spl_L15_kalman.png", to: "kalman.png" },
			{ from: "spl_L15_rls-scd.png", to: "rls-scd.png" },
			{ from: "spl_L15_rls-scd-mle.png", to: "rls-scd-mle.png" },
		],
	},
	{
		docs: "docs/assets/multi-instrument-transcription",
		baseUrl:
			"https://www.audiolabs-erlangen.de/content/resources/MIR/00_2026-ChoraleWind/0_Drese_JesuGehVoran/tracks",
		files: ["01_as.mp3", "02_cl.mp3", "03_tb.mp3", "04_tba.mp3"],
	},
	{
		docs: "docs/assets/multi-instrument-transcription",
		baseUrl:
			"https://www.audiolabs-erlangen.de/content/resources/MIR/00_2026-ChoraleWind/0_Drese_JesuGehVoran",
		files: [
			{ from: "126_Drese_JesuGehVoran_02-expr.mid", to: "transcription.mid" },
		],
	},
	{
		docs: "docs/assets/global-image",
		baseUrl:
			"https://www.audiolabs-erlangen.de/content/resources/MIR/00_2024-RealTimePLP-ControlSignals",
		files: [
			{ from: "audio/example-1/normal/Mix.mp3", to: "mix.mp3" },
			{ from: "audio/example-1/normal/Kick.mp3", to: "kick.mp3" },
			{ from: "audio/example-1/normal/Bass.mp3", to: "bass.mp3" },
			{ from: "audio/example-1/normal/Piano.mp3", to: "piano.mp3" },
			{ from: "img/example-1-normal.png", to: "example-1-normal.png" },
		],
	},
	{
		docs: "docs/assets/repeat",
		baseUrl: "https://commons.wikimedia.org/wiki/Special:Redirect/file",
		files: [
			{
				from: "Wolfgang_Amadeus_Mozart_-_sonata_no._16_in_c_major%2C_k.545_%27sonata_facile%27_-_i._allegro.ogg",
				to: "mozart-k545-musopen.ogg",
			},
			{
				from: "Mozart_-_Piano_Sonata_No._16_in_C_major_-_I._Allegro.ogg",
				to: "mozart-k545-krueger.ogg",
			},
		],
	},
];

// A clean checkout has nothing to reuse, so CI always downloads fresh. Locally
// the existing file is kept unless a refresh is asked for.
const refreshRemoteAssets =
	process.argv.includes("--refresh") || process.env.REFRESH_DOCS_ASSETS === "1";

function fromRoot(path) {
	return resolve(rootDir, path);
}

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

async function downloadRemoteAsset(url, targetPath) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(
			`Failed to download ${url}: ${String(response.status)} ${response.statusText}`,
		);
	}

	writeFileSync(targetPath, Buffer.from(await response.arrayBuffer()));
}

for (const { docs, baseUrl, files } of remoteDocsAssets) {
	const targetDir = fromRoot(docs);
	mkdirSync(targetDir, { recursive: true });

	const entries = files.map((file) =>
		typeof file === "string" ? { from: file, to: file } : file,
	);
	const pending = entries.filter(
		({ to }) => refreshRemoteAssets || !existsSync(join(targetDir, to)),
	);

	if (pending.length === 0) {
		console.log(`${docs}: ${String(entries.length)} files already present`);
		continue;
	}

	console.log(
		`${docs}: downloading ${String(pending.length)} of ${String(entries.length)} files from ${baseUrl}`,
	);

	await Promise.all(
		pending.map(({ from, to }) =>
			downloadRemoteAsset(`${baseUrl}/${from}`, join(targetDir, to)),
		),
	);
}

/**
 * Media derived from assets that are already in the repository. Committing the
 * results would double their weight for no gain, so they are computed into the
 * (git-ignored) docs assets folders at build time instead.
 *
 * The scripts bring their own dependencies through `uv run`, so nothing has to
 * be installed alongside them, and they skip whatever is already there unless a
 * refresh is asked for.
 */
const derivedDocsAssets = [
	{
		docs: "docs/assets/separation",
		script: "docs/_scripts/make-separation-stems.py",
		packages: ["librosa", "soundfile"],
	},
];

for (const { docs, script, packages } of derivedDocsAssets) {
	const args = ["run", "--quiet"];
	for (const packageName of packages) {
		args.push("--with", packageName);
	}
	args.push(fromRoot(script));
	if (refreshRemoteAssets) {
		args.push("--refresh");
	}

	const result = spawnSync("uv", args, { cwd: rootDir, stdio: "inherit" });
	if (result.error || result.status !== 0) {
		throw new Error(
			`Failed to generate ${docs} with ${script}: ${
				result.error
					? result.error.message
					: `uv exited with ${String(result.status)}`
			}. It needs uv (https://docs.astral.sh/uv/).`,
		);
	}
}
