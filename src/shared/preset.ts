import type { TrackDefinition, TrackSwitchConfig } from "../domain/types";

export function parseStrictNonNegativeInt(value: string): number {
	return /^\d+$/.test(value) ? Number(value) : NaN;
}

export function parsePresetIndices(presetsAttr: string | undefined): number[] {
	if (!presetsAttr) {
		return [];
	}

	return presetsAttr
		.split(",")
		.map((preset) => parseStrictNonNegativeInt(preset.trim()))
		.filter((preset) => Number.isFinite(preset) && preset >= 0);
}

export function derivePresetNames(
	config: Pick<TrackSwitchConfig, "tracks" | "presetNames">,
): string[] {
	let maxPresetIndex = -1;

	config.tracks.forEach((track: TrackDefinition) => {
		(track.presets ?? []).forEach((index: number) => {
			if (index > maxPresetIndex) {
				maxPresetIndex = index;
			}
		});
	});

	const presetCount = Math.max(0, maxPresetIndex + 1);
	const providedNames = (config.presetNames ?? []).map((name) =>
		String(name).trim(),
	);

	return Array.from(
		{ length: presetCount },
		(_, index) => providedNames[index] || `Preset ${index}`,
	);
}
