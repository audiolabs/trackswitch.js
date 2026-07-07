import { normalizeFeatures } from "../domain/options";
import type {
	NormalizedTrackGroupLayout,
	NormalizedTrackSwitchConfig,
	TrackDefinition,
	TrackSwitchInit,
	TrackSwitchUiElement,
	TrackSwitchVariant,
	TrackSwitchWaveformUiElement,
} from "../domain/types";
import { injectConfiguredUiElements, normalizeUiElement } from "./ui-elements";
import { assertAllowedKeys, toConfigRecord } from "./validation";

const objectHasOwn = (
	Object as unknown as {
		hasOwn(object: object, property: PropertyKey): boolean;
	}
).hasOwn;

export const TRACKS_REQUIRED_ERROR =
	'TrackSwitch requires at least one ui entry with type "trackGroup" and non-empty trackGroup.';
const initAllowedKeys = ["presetNames", "features", "alignment", "ui"] as const;
const alignmentAllowedKeys = [
	"csv",
	"referenceTimeColumn",
	"referenceTimeColumnSync",
	"outOfRange",
] as const;

export interface NormalizeTrackSwitchOptions {
	variant: TrackSwitchVariant;
}

function validateInitKeys(init: TrackSwitchInit): void {
	const initRecord = toConfigRecord(init, "init");
	assertAllowedKeys(initRecord, initAllowedKeys, "init");

	if (init.alignment === undefined) {
		return;
	}

	const alignmentRecord = toConfigRecord(init.alignment, "alignment");
	assertAllowedKeys(alignmentRecord, alignmentAllowedKeys, "alignment");
}

function hasValidTrackSources(track: TrackDefinition): boolean {
	if (!Array.isArray(track.sources) || track.sources.length === 0) {
		return false;
	}

	return track.sources.some(
		(source) => typeof source.src === "string" && source.src.trim().length > 0,
	);
}

function resolveTracksFromUi(resolvedUi: TrackSwitchUiElement[] | undefined): {
	tracks: TrackDefinition[];
	trackGroups: NormalizedTrackGroupLayout[];
} {
	if (!resolvedUi || resolvedUi.length === 0) {
		return { tracks: [], trackGroups: [] };
	}

	const tracks: TrackDefinition[] = [];
	const trackGroups: NormalizedTrackGroupLayout[] = [];
	let groupIndex = 0;

	resolvedUi.forEach((entry) => {
		if (entry.type !== "trackGroup") {
			return;
		}

		if (!Array.isArray(entry.trackGroup) || entry.trackGroup.length === 0) {
			throw new Error("Each ui trackGroup must contain at least one track.");
		}

		const startTrackIndex = tracks.length;
		entry.trackGroup.forEach((track) => {
			if (!hasValidTrackSources(track)) {
				throw new Error(
					"Each track in ui trackGroup must define at least one valid source src.",
				);
			}

			tracks.push(track);
		});

		trackGroups.push({
			groupIndex: groupIndex,
			startTrackIndex: startTrackIndex,
			trackCount: entry.trackGroup.length,
			rowHeight: entry.rowHeight,
		});

		groupIndex += 1;
	});

	return { tracks, trackGroups };
}

function hasPerTrackImageUi(
	resolvedUi: TrackSwitchUiElement[] | undefined,
): boolean {
	if (!resolvedUi) {
		return false;
	}

	return resolvedUi.some((entry) => entry.type === "perTrackImage");
}

function hasSheetMusicUi(
	resolvedUi: TrackSwitchUiElement[] | undefined,
): boolean {
	if (!resolvedUi) {
		return false;
	}

	return resolvedUi.some((entry) => entry.type === "sheetMusic");
}

function hasWarpingMatrixInferScoreBpm(
	resolvedUi: TrackSwitchUiElement[] | undefined,
): boolean {
	if (!resolvedUi) {
		return false;
	}

	return resolvedUi.some(
		(entry) => entry.type === "warpingMatrix" && entry.bpm === "infer_score",
	);
}

function assertNoFeatureMode(init: TrackSwitchInit): void {
	if (
		init.features &&
		typeof init.features === "object" &&
		objectHasOwn(init.features, "mode")
	) {
		throw new Error(
			"Invalid feature key: mode. Use the default or sync TrackSwitch variant instead.",
		);
	}
}

function isAlignmentTrack(track: TrackDefinition): boolean {
	return !!track.alignment;
}

function isAlignmentWaveform(
	entry: TrackSwitchUiElement,
): entry is TrackSwitchWaveformUiElement {
	return (
		entry.type === "waveform" &&
		(!!entry.alignedPlayhead || !!entry.showAlignmentPoints)
	);
}

function validateVariantConfig(
	variant: TrackSwitchVariant,
	init: TrackSwitchInit,
	resolvedUi: TrackSwitchUiElement[] | undefined,
	tracks: TrackDefinition[],
): void {
	if (variant === "default") {
		if (tracks.some(isAlignmentTrack)) {
			throw new Error(
				"Invalid default player configuration: track alignment config requires the sync player variant.",
			);
		}
		if (resolvedUi?.some((entry) => entry.type === "warpingMatrix")) {
			throw new Error(
				"Invalid default player configuration: warpingMatrix requires the sync player variant.",
			);
		}
		if (resolvedUi?.some(isAlignmentWaveform)) {
			throw new Error(
				"Invalid default player configuration: aligned waveform options require the sync player variant.",
			);
		}
		return;
	}

	if (!init.alignment) {
		throw new Error(
			"Invalid sync player configuration: alignment config is required.",
		);
	}

	tracks.forEach((track) => {
		const column = track.alignment?.column;
		if (typeof column !== "string" || column.trim().length === 0) {
			throw new Error(
				"Invalid sync player configuration: each track requires alignment.column.",
			);
		}
	});
}

export function normalizeInit(
	root: HTMLElement,
	init: TrackSwitchInit,
	options: NormalizeTrackSwitchOptions,
): NormalizedTrackSwitchConfig {
	const normalized = normalizeTrackSwitchConfig(init, options);
	injectConfiguredUiElements(root, normalized.ui);
	return normalized;
}

export function normalizeTrackSwitchConfig(
	init: TrackSwitchInit,
	options: NormalizeTrackSwitchOptions,
): NormalizedTrackSwitchConfig {
	validateInitKeys(init);
	assertNoFeatureMode(init);

	const resolvedUi = Array.isArray(init.ui)
		? init.ui.map(normalizeUiElement)
		: undefined;
	const normalizedFeatures = normalizeFeatures(init.features);
	const usesExclusiveSoloMode =
		normalizedFeatures.exclusiveSolo || options.variant === "sync";
	if (hasPerTrackImageUi(resolvedUi) && !usesExclusiveSoloMode) {
		throw new Error(
			"Invalid init configuration: perTrackImage requires features.exclusiveSolo to be true.",
		);
	}
	if (
		hasWarpingMatrixInferScoreBpm(resolvedUi) &&
		!hasSheetMusicUi(resolvedUi)
	) {
		throw new Error(
			'Invalid init configuration: ui.warpingMatrix bpm "infer_score" requires a sheetMusic ui element.',
		);
	}

	const resolvedTrackData = resolveTracksFromUi(resolvedUi);
	validateVariantConfig(
		options.variant,
		init,
		resolvedUi,
		resolvedTrackData.tracks,
	);

	if (resolvedTrackData.tracks.length === 0) {
		throw new Error(TRACKS_REQUIRED_ERROR);
	}

	return {
		variant: options.variant,
		tracks: resolvedTrackData.tracks,
		presetNames: init.presetNames,
		features: init.features,
		alignment: init.alignment,
		ui: resolvedUi,
		trackGroups: resolvedTrackData.trackGroups,
	};
}
