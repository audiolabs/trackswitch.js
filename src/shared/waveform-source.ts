import type { WaveformSource } from "../domain/types";

function normalizeTrackIndex(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		return null;
	}

	return Math.floor(value);
}

export function normalizeWaveformSource(
	value: WaveformSource | undefined,
): WaveformSource {
	if (value === "audible" || value === undefined) {
		return "audible";
	}

	if (Array.isArray(value)) {
		const normalized: number[] = [];
		const seen = new Set<number>();

		value.forEach((entry) => {
			const normalizedEntry = normalizeTrackIndex(entry);
			if (normalizedEntry === null || seen.has(normalizedEntry)) {
				return;
			}

			seen.add(normalizedEntry);
			normalized.push(normalizedEntry);
		});

		return normalized;
	}

	const normalized = normalizeTrackIndex(value);
	return normalized === null ? "audible" : normalized;
}

export function serializeWaveformSource(
	value: WaveformSource | undefined,
): string {
	const normalized = normalizeWaveformSource(value);
	return Array.isArray(normalized)
		? JSON.stringify(normalized)
		: String(normalized);
}

export function parseWaveformSource(value: string | null): WaveformSource {
	const raw = typeof value === "string" ? value.trim() : "";
	if (!raw || raw === "audible") {
		return "audible";
	}

	if (raw.startsWith("[")) {
		try {
			const parsed = JSON.parse(raw);
			return normalizeWaveformSource(
				Array.isArray(parsed) ? parsed : undefined,
			);
		} catch (_error) {
			return "audible";
		}
	}

	if (raw.includes(",")) {
		return normalizeWaveformSource(
			raw.split(",").map((entry) => Number(entry.trim())),
		);
	}

	return normalizeWaveformSource(Number(raw));
}

export function resolveFixedWaveformTrackIndex(
	runtimesLength: number,
	waveformSource: WaveformSource,
): number | null {
	if (waveformSource === "audible" || Array.isArray(waveformSource)) {
		return null;
	}

	return waveformSource >= 0 && waveformSource < runtimesLength
		? waveformSource
		: null;
}

export function resolveWaveformTrackIndices(
	runtimesLength: number,
	waveformSource: WaveformSource,
): number[] {
	if (waveformSource === "audible") {
		return Array.from({ length: runtimesLength }, (_value, index) => index);
	}

	if (Array.isArray(waveformSource)) {
		return waveformSource.filter(
			(trackIndex) => trackIndex >= 0 && trackIndex < runtimesLength,
		);
	}

	return waveformSource >= 0 && waveformSource < runtimesLength
		? [waveformSource]
		: [];
}
