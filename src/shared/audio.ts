import type { TrackSourceDefinition, TrackTiming } from "../types";

export function inferSourceMimeType(
	sourceUrl: string,
	sourceType: string | undefined,
	mimeTypeTable: Record<string, string>,
): string {
	if (sourceType) {
		return sourceType.endsWith(";") ? sourceType : `${sourceType};`;
	}

	// Object URLs carry no filename, so there is nothing to sniff. Sniffing them
	// anyway picks up the dot in the origin's hostname and yields a bogus type.
	if (sourceUrl.startsWith("blob:")) {
		return "";
	}

	// Data URLs state their media type up front.
	if (sourceUrl.startsWith("data:")) {
		const declared = sourceUrl.slice("data:".length).split(/[;,]/)[0].trim();
		return declared ? `${declared};` : "";
	}

	const withoutHash = sourceUrl.split("#")[0];
	const cleanUrl = withoutHash.split("?")[0];
	const lastSegment = cleanUrl.slice(cleanUrl.lastIndexOf("/") + 1);
	const extIndex = lastSegment.lastIndexOf(".");
	const ext = extIndex >= 0 ? lastSegment.slice(extIndex).toLowerCase() : "";

	if (!ext) {
		return "";
	}

	if (mimeTypeTable[ext]) {
		return mimeTypeTable[ext];
	}

	return `audio/${ext.slice(1)};`;
}

export function calculateTrackTiming(
	source: TrackSourceDefinition,
	bufferDuration: number,
): TrackTiming {
	const startOffsetMs = Number(source.startOffsetMs ?? 0);
	const endOffsetMs = Number(source.endOffsetMs ?? 0);

	const startOffset = Number.isFinite(startOffsetMs) ? startOffsetMs / 1000 : 0;
	const endOffset = Number.isFinite(endOffsetMs) ? endOffsetMs / 1000 : 0;

	const trimStart = startOffset > 0 ? startOffset : 0;
	const padStart = startOffset < 0 ? -startOffset : 0;
	const trimEnd = endOffset > 0 ? endOffset : 0;
	const padEnd = endOffset < 0 ? -endOffset : 0;

	let audioDuration = bufferDuration - trimStart - trimEnd;
	audioDuration = audioDuration > 0 ? audioDuration : 0;

	return {
		trimStart: trimStart,
		padStart: padStart,
		audioDuration: audioDuration,
		effectiveDuration: padStart + audioDuration + padEnd,
	};
}
