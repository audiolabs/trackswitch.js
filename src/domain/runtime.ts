import type { TrackDefinition, TrackRuntime } from "./types";

function clamp01(value: number): number {
	if (!Number.isFinite(value)) {
		return 1;
	}

	return Math.max(0, Math.min(1, value));
}

function clampPan(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}

	return Math.max(-1, Math.min(1, value));
}

export function createTrackRuntime(
	definition: TrackDefinition,
	_index: number,
): TrackRuntime {
	return {
		definition: definition,
		state: {
			solo: !!definition.solo,
			volume: clamp01(definition.volume ?? 1),
			pan: clampPan(definition.pan ?? 0),
		},
		gainNode: null,
		pannerNode: null,
		buffer: null,
		timing: null,
		activeSource: null,
		sourceIndex: -1,
		activeVariant: "base",
		baseSource: {
			buffer: null,
			timing: null,
			sourceIndex: -1,
			waveformSummary: null,
		},
		syncedSource: null,
		successful: false,
		errored: false,
		waveformSummary: null,
	};
}
