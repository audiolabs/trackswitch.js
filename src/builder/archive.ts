import { strToU8, Zip, ZipPassThrough } from "fflate";
import { type BuilderProject, buildPlayerConfig } from "./model";

export type ArchiveVariant = "project" | "standalone";
export type ArchiveEntry = string | Blob;

export interface StandaloneAssets {
	playerScript: string;
	license: string;
	thirdPartyNotices: string;
}

const FIXED_ARCHIVE_DATE = new Date(1980, 0, 1, 0, 0, 0);

function archiveEntry(path: string): ZipPassThrough {
	const entry = new ZipPassThrough(path);
	entry.mtime = FIXED_ARCHIVE_DATE;
	return entry;
}

const STANDALONE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>TrackSwitch Player</title>
  <style>
    body { margin: 0; padding: 2rem; background: #eeeeee; font-family: system-ui, sans-serif; }
    main { width: min(100%, 1000px); margin: 0 auto; }
  </style>
</head>
<body>
  <main>
    <trackswitch-player config-src="player-config.json"></trackswitch-player>
  </main>
  <script src="js/trackswitch.js"></script>
</body>
</html>
`;

const STANDALONE_README = `# TrackSwitch standalone player

This directory contains the generated player configuration, its local media,
and the TrackSwitch browser bundle used by the preview that created it.

Browsers do not reliably load configuration and media from \`file://\` URLs.
Serve this directory with any static HTTP server, for example:

    npx serve .

Then open the local URL printed by the server.
`;

export function buildArchiveEntries(
	project: BuilderProject,
	variant: ArchiveVariant,
	standaloneAssets?: StandaloneAssets,
): Map<string, ArchiveEntry> {
	const entries = new Map<string, ArchiveEntry>();
	entries.set(
		"player-config.json",
		`${JSON.stringify(buildPlayerConfig(project, "export"), null, "\t")}\n`,
	);
	for (const resource of Object.values(project.resources)) {
		entries.set(resource.exportPath, resource.file);
	}
	if (variant === "standalone") {
		if (!standaloneAssets) {
			throw new Error(
				"Standalone assets are required for a standalone archive.",
			);
		}
		entries.set("index.html", STANDALONE_HTML);
		entries.set("README.md", STANDALONE_README);
		entries.set("js/trackswitch.js", standaloneAssets.playerScript);
		entries.set("LICENSE", standaloneAssets.license);
		entries.set("THIRD_PARTY_NOTICES.md", standaloneAssets.thirdPartyNotices);
	}
	return entries;
}

async function addBlob(archive: Zip, path: string, blob: Blob): Promise<void> {
	const entry = archiveEntry(path);
	archive.add(entry);
	const reader = blob.stream().getReader();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		entry.push(value, false);
	}
	entry.push(new Uint8Array(), true);
}

export async function createArchiveBlob(
	entries: ReadonlyMap<string, ArchiveEntry>,
): Promise<Blob> {
	const chunks: ArrayBuffer[] = [];
	let resolveArchive: (blob: Blob) => void = () => undefined;
	let rejectArchive: (error: unknown) => void = () => undefined;
	const completed = new Promise<Blob>((resolve, reject) => {
		resolveArchive = resolve;
		rejectArchive = reject;
	});
	const archive = new Zip((error, chunk, final) => {
		if (error) {
			rejectArchive(error);
			return;
		}
		const copiedChunk = new Uint8Array(chunk.byteLength);
		copiedChunk.set(chunk);
		chunks.push(copiedChunk.buffer);
		if (final) resolveArchive(new Blob(chunks, { type: "application/zip" }));
	});

	try {
		for (const [path, value] of entries) {
			if (typeof value === "string") {
				const entry = archiveEntry(path);
				archive.add(entry);
				entry.push(strToU8(value), true);
			} else {
				await addBlob(archive, path, value);
			}
		}
		archive.end();
	} catch (error) {
		rejectArchive(error);
	}
	return completed;
}
