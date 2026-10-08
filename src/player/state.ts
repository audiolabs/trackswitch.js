import { clamp01, clampNonNegative, clampPan } from "../shared/math";
import type {
	LoopMarker,
	PlaybackOrigin,
	PlayerState,
	TrackDefinition,
	TrackId,
	TrackListGroup,
	TrackPanAlgorithm,
	TrackRuntime,
	TrackSwitchViewConfig,
} from "../types";

export type PlayerAction =
	| { type: "set-playing"; playing: boolean }
	| { type: "toggle-repeat" }
	| { type: "set-repeat"; enabled: boolean }
	| {
			type: "set-position";
			position: number;
			/** Omitted whenever the caller only knows the reference coordinate. */
			anchor?: PlaybackOrigin | null;
	  }
	| { type: "set-start-time"; startTime: number }
	| { type: "set-seeking"; seeking: boolean }
	| { type: "set-volume"; volume: number }
	| { type: "set-pan"; pan: number }
	| {
			type: "set-loop-point";
			marker: LoopMarker;
			position: number;
			minDistance: number;
	  }
	| { type: "toggle-loop" }
	| { type: "clear-loop" };

export function createInitialPlayerState(repeat: boolean): PlayerState {
	return {
		playing: false,
		repeat: repeat,
		position: 0,
		positionOrigin: null,
		startTime: 0,
		currentlySeeking: false,
		loop: {
			pointA: null,
			pointB: null,
			enabled: false,
		},
		volume: 1,
		pan: 0,
	};
}

function withLoopState(
	state: PlayerState,
	loop: PlayerState["loop"],
): PlayerState {
	return {
		...state,
		loop: loop,
	};
}

function applyLoopPoint(
	state: PlayerState,
	action: Extract<PlayerAction, { type: "set-loop-point" }>,
): PlayerState {
	const nextLoop = {
		...state.loop,
	};

	if (action.marker === "A") {
		nextLoop.pointA = clampNonNegative(action.position);
	} else {
		nextLoop.pointB = clampNonNegative(action.position);
	}

	if (
		nextLoop.pointA !== null &&
		nextLoop.pointB !== null &&
		nextLoop.pointA > nextLoop.pointB
	) {
		const swap = nextLoop.pointA;
		nextLoop.pointA = nextLoop.pointB;
		nextLoop.pointB = swap;
	}

	if (
		nextLoop.pointA !== null &&
		nextLoop.pointB !== null &&
		nextLoop.pointB - nextLoop.pointA < action.minDistance
	) {
		if (action.marker === "A") {
			nextLoop.pointA = null;
		} else {
			nextLoop.pointB = null;
		}
		nextLoop.enabled = false;
	}

	return withLoopState(state, nextLoop);
}

function toggleLoop(state: PlayerState): PlayerState {
	if (state.loop.pointA === null || state.loop.pointB === null) {
		return state;
	}

	return withLoopState(state, {
		...state.loop,
		enabled: !state.loop.enabled,
	});
}

function clearLoop(state: PlayerState): PlayerState {
	return withLoopState(state, {
		pointA: null,
		pointB: null,
		enabled: false,
	});
}

export function playerStateReducer(
	state: PlayerState,
	action: PlayerAction,
): PlayerState {
	switch (action.type) {
		case "set-playing":
			return {
				...state,
				playing: action.playing,
			};

		case "toggle-repeat":
			return {
				...state,
				repeat: !state.repeat,
			};

		case "set-repeat":
			return {
				...state,
				repeat: action.enabled,
			};

		case "set-position":
			return {
				...state,
				position: clampNonNegative(action.position),
				positionOrigin: action.anchor ?? null,
			};

		case "set-start-time":
			return {
				...state,
				startTime: action.startTime,
			};

		case "set-seeking":
			return {
				...state,
				currentlySeeking: action.seeking,
			};

		case "set-volume":
			return {
				...state,
				volume: clamp01(action.volume),
			};

		case "set-pan":
			return {
				...state,
				pan: clampPan(action.pan),
			};

		case "set-loop-point":
			return applyLoopPoint(state, action);

		case "toggle-loop":
			return toggleLoop(state);

		case "clear-loop":
			return clearLoop(state);

		default:
			return state;
	}
}

export function createTrackRuntime(
	definition: TrackDefinition,
	_index: number,
): TrackRuntime {
	return {
		definition: definition,
		state: {
			solo: !!definition.solo,
			// A malformed (non-finite) configured volume reads as unset, i.e. full.
			volume: clamp01(
				Number.isFinite(definition.volume) ? (definition.volume as number) : 1,
			),
			pan: clampPan(definition.pan ?? 0),
		},
		panAlgorithm: "balance",
		gainNode: null,
		pannerNode: null,
		panUpmixNode: null,
		panSplitterNode: null,
		panGainLeftNode: null,
		panGainRightNode: null,
		panMergerNode: null,
		buffer: null,
		timing: null,
		sourceSampleRate: null,
		loudnessGain: 1,
		activeSource: null,
		sourceIndex: -1,
		activeVariant: "base",
		baseSource: {
			buffer: null,
			timing: null,
			sourceIndex: -1,
			sourceSampleRate: null,
			waveformSummary: null,
			loudnessGain: 1,
		},
		syncedSource: null,
		successful: false,
		errored: false,
		waveformSummary: null,
	};
}

/** Resolves the `trackList` views into groups, numbered in declaration order. */
export function buildTrackGroups(
	views: TrackSwitchViewConfig[],
): TrackListGroup[] {
	const groups: TrackListGroup[] = [];

	views.forEach((view) => {
		if (view.type !== "trackList") {
			return;
		}

		groups.push({
			groupIndex: groups.length,
			trackIds: view.tracks,
			title: view.title,
			comparisonGroup: view.comparisonGroup ?? null,
			exclusiveSolo: view.comparisonGroup !== undefined,
			rowHeight: view.rowHeight,
			trackVolumeControls: view.trackVolumeControls ?? false,
			trackPanControls: view.trackPanControls ?? "none",
			channelColorIcons: view.channelColorIcons ?? true,
		});
	});

	return groups;
}

export function resolveGroupTrackIndexes(
	runtimes: TrackRuntime[],
	group: TrackListGroup | undefined,
): number[] {
	if (!group) {
		return [];
	}

	return group.trackIds
		.map((trackId) =>
			runtimes.findIndex((runtime) => runtime.definition.id === trackId),
		)
		.filter((index) => index >= 0);
}

/**
 * Every track an exclusive selection reaches: the list's own rows, plus those of
 * any other list sharing its `comparisonGroup`. A list without one answers for itself,
 * which is what a shift-click asks about.
 */
export function resolveSoloScopeTrackIndexes(
	runtimes: TrackRuntime[],
	trackGroups: TrackListGroup[],
	groupIndex: number,
): number[] {
	const group = trackGroups[groupIndex];
	if (!group || group.comparisonGroup === null) {
		return resolveGroupTrackIndexes(runtimes, group);
	}

	const indexes = new Set<number>();
	trackGroups.forEach((candidate) => {
		if (candidate.comparisonGroup !== group.comparisonGroup) {
			return;
		}
		resolveGroupTrackIndexes(runtimes, candidate).forEach((trackIndex) => {
			indexes.add(trackIndex);
		});
	});

	return [...indexes];
}

/** The group a track belongs to — the first list naming it, since lists may repeat a track. */
export function findGroupIndexForTrack(
	trackGroups: TrackListGroup[],
	trackId: TrackId,
): number {
	return trackGroups.findIndex((group) => group.trackIds.includes(trackId));
}

/**
 * Picks the tracks that sound before the listener touches anything. A selection
 * needs exactly one — lists sharing a `comparisonGroup` therefore open with one audible
 * track between them, the first row of the first list to speak up. An ordinary
 * list plays all of its tracks unless the config already speaks about solo state.
 */
export function applyInitialGroupSolos(
	runtimes: TrackRuntime[],
	trackGroups: TrackListGroup[],
): void {
	const hasExplicitSoloConfiguration = runtimes.some(
		(runtime) => typeof runtime.definition.solo === "boolean",
	);

	trackGroups.forEach((group) => {
		const trackIndexes = resolveGroupTrackIndexes(runtimes, group);
		if (trackIndexes.length === 0) {
			return;
		}

		if (group.exclusiveSolo) {
			const scopeIndexes = resolveSoloScopeTrackIndexes(
				runtimes,
				trackGroups,
				group.groupIndex,
			);
			// A selection sounds one track, so a config naming several keeps the first.
			const selectedIndex = scopeIndexes.find(
				(index) => runtimes[index].state.solo,
			);
			const targetIndex = selectedIndex ?? trackIndexes[0];
			scopeIndexes.forEach((index) => {
				runtimes[index].state.solo = index === targetIndex;
			});
			return;
		}

		if (trackIndexes.some((index) => runtimes[index].state.solo)) {
			return;
		}

		if (!hasExplicitSoloConfiguration) {
			trackIndexes.forEach((index) => {
				runtimes[index].state.solo = true;
			});
		}
	});
}

/**
 * Tracks default to the "balance" pan algorithm (set in createTrackRuntime).
 * A trackList view can override that per track by requesting "pan" instead.
 */
export function applyTrackPanAlgorithms(
	runtimes: TrackRuntime[],
	trackGroups: TrackListGroup[],
): void {
	const tracksWithPanControls = new Set<string>();

	trackGroups.forEach((group) => {
		if (group.trackPanControls === "none") {
			return;
		}

		group.trackIds.forEach((trackId) => {
			tracksWithPanControls.add(trackId);
			const runtime = runtimes.find(
				(candidate) => candidate.definition.id === trackId,
			);
			if (runtime) {
				runtime.panAlgorithm = group.trackPanControls as TrackPanAlgorithm;
			}
		});
	});

	runtimes.forEach((runtime) => {
		if (!tracksWithPanControls.has(runtime.definition.id)) {
			runtime.state.pan = 0;
			runtime.panAlgorithm = "balance";
		}
	});
}

/** Restores the neutral gain for tracks without a configured volume control. */
export function resetDisabledTrackVolumeControls(
	runtimes: TrackRuntime[],
	trackGroups: TrackListGroup[],
): void {
	const tracksWithVolumeControls = new Set<string>();

	trackGroups.forEach((group) => {
		if (!group.trackVolumeControls) {
			return;
		}
		group.trackIds.forEach((trackId) => {
			tracksWithVolumeControls.add(trackId);
		});
	});

	runtimes.forEach((runtime) => {
		if (!tracksWithVolumeControls.has(runtime.definition.id)) {
			runtime.state.volume = 1;
		}
	});
}
