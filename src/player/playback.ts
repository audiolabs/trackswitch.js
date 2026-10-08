import type { TrackTimelineProjector } from "../media/waveform-engine";
import { resolveAudibleWaveformTrackIndex } from "../media/waveform-engine";
import type { Alignment } from "../model/alignment";
import { loadMarkerSequences, moveRuntimeMarker } from "../model/marker";
import {
	playerTimeline,
	probeMediaProfiles,
	resolveImplicitTimelineUnit,
	timelineId,
} from "../model/timeline";
import { closestInRoot, getOwnerWindow } from "../shared/dom";
import { clamp } from "../shared/math";
import type { LoopMarker, PlaybackOrigin, TrackRuntime } from "../types";
import type { PianoRollSeekSurfaceMetadata } from "../views/piano-roll";
import type {
	ImageSeekSurfaceMetadata,
	WaveformTimelineContext,
} from "../views/renderer";
import {
	getTimelineTimeWidth,
	resolveTimelinePlaybackFollowScrollLeft,
} from "../views/surface";
import {
	applyReferenceReadoutUnit,
	toggleSoloWithinAlignment,
} from "./alignment";
import {
	type ControllerPointerEvent,
	getPointerPageX,
	getSeekMetrics,
} from "./input";
import { placeMarkerFromEvent, updateMarkerAdjust } from "./marker-editing";
import { resetMarkerClicks, scheduleMarkerClicks } from "./marker-sonification";
import { snapLoopEndToMarker } from "./markers";
import type { TrackSwitchControllerImpl } from "./player";
import {
	createPositionEventPayload,
	createTrackStateEventPayload,
	createUiState,
	pauseOtherControllers,
	unregisterController,
} from "./player";
import { type PlayerAction, playerStateReducer } from "./state";

function getLoadErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}

	const fallback = String(error ?? "").trim();
	if (fallback.length > 0 && fallback !== "[object Object]") {
		return fallback;
	}

	return "Unexpected error while loading TrackSwitch.";
}

export async function load(ctx: TrackSwitchControllerImpl): Promise<void> {
	if (ctx.isDestroyed || ctx.isLoaded || ctx.isLoading) {
		return;
	}

	ctx.isLoading = true;
	ctx.renderer.setOverlayLoading(true);
	try {
		const prepared = await ctx.audioEngine.prepareForPlaybackStart();
		if (!prepared) {
			ctx.isLoading = false;
			ctx.renderer.setOverlayLoading(false);
			ctx.handleError(
				"Web Audio API is not supported in your browser. Please consider upgrading.",
			);
			return;
		}

		if (!ctx.iOSPlaybackUnlocked) {
			ctx.iOSPlaybackUnlocked = true;
			await ctx.audioEngine.unlockIOSPlayback();
		}

		ctx.globalSyncEnabled = false;
		ctx.syncLockedTrackIndexes.clear();
		ctx.preSyncSoloStates = null;
		ctx.soloMode = "lists";

		ctx.runtimes.forEach((runtime: TrackRuntime) => {
			runtime.successful = false;
			runtime.errored = false;
			runtime.buffer = null;
			runtime.gainNode = null;
			runtime.pannerNode = null;
			runtime.panUpmixNode = null;
			runtime.panSplitterNode = null;
			runtime.panGainLeftNode = null;
			runtime.panGainRightNode = null;
			runtime.panMergerNode = null;
			runtime.timing = null;
			runtime.sourceSampleRate = null;
			runtime.loudnessGain = 1;
			runtime.activeSource = null;
			runtime.sourceIndex = -1;
			runtime.activeVariant = "base";
			runtime.baseSource = {
				buffer: null,
				timing: null,
				sourceIndex: -1,
				sourceSampleRate: null,
				waveformSummary: null,
				loudnessGain: 1,
			};
			runtime.syncedSource = null;
			runtime.waveformSummary = null;
		});

		await ctx.audioEngine.loadTracks(ctx.runtimes);

		if (ctx.isDestroyed) {
			return;
		}

		ctx.runtimes.forEach((runtime: TrackRuntime) => {
			if (runtime.baseSource.buffer) {
				runtime.baseSource.waveformSummary = ctx.waveformEngine.createSummary(
					runtime.baseSource.buffer,
				);
			}

			if (runtime.syncedSource?.buffer) {
				runtime.syncedSource.waveformSummary = ctx.waveformEngine.createSummary(
					runtime.syncedSource.buffer,
				);
			}

			const activeSource =
				runtime.activeVariant === "synced"
					? runtime.syncedSource
					: runtime.baseSource;
			runtime.waveformSummary = activeSource
				? activeSource.waveformSummary
				: null;
		});

		ctx.isLoading = false;
		ctx.renderer.setOverlayLoading(false);

		const erroredTracks = ctx.runtimes.filter(
			(runtime: TrackRuntime) => runtime.errored,
		);

		if (erroredTracks.length > 0) {
			ctx.handleError("One or more audio files failed to load.");
			return;
		}

		ctx.longestDuration = ctx.findLongestDuration();
		ctx.alignment = null;
		ctx.alignmentPlaybackTrackIndex = null;

		// Every medium is parsed before the alignment resolves so it can read
		// their natural extents and unit conversions.
		await ctx.renderSheetMusic();

		if (ctx.isDestroyed) {
			return;
		}

		await ctx.renderer.loadMidiSources();

		if (ctx.isDestroyed) {
			return;
		}

		if (ctx.alignmentConfig) {
			const alignmentError = await ctx.initializeAlignmentMode();
			if (alignmentError) {
				ctx.handleError(alignmentError);
				return;
			}
		} else {
			// No alignment resolves the media profiles, so probe them here — but
			// only for a `media.timelineUnit`, the one thing left that needs a
			// conversion out of seconds.
			ctx.mediaProfiles = resolveImplicitTimelineUnit(ctx.media)
				? await probeMediaProfiles({
						media: ctx.media,
						runtimes: ctx.runtimes,
						midiBySource: ctx.renderer.getLoadedMidiBySource(),
						measuresByMediaId:
							ctx.sheetMusicEngine.getAvailableMeasuresByMediaId(),
					})
				: new Map();
			applyReferenceReadoutUnit(ctx);
		}

		if (ctx.isDestroyed) {
			return;
		}

		await ctx.attachSheetMusicMeasureMaps();

		if (ctx.isDestroyed) {
			return;
		}

		const alignment = ctx.alignment as Alignment | null;
		ctx.markerUndoStack = [];
		ctx.markerSequences = await loadMarkerSequences(
			ctx.markersConfig,
			alignment,
			ctx.media,
			alignment?.profiles ?? ctx.mediaProfiles,
			ctx.longestDuration,
		);

		if (ctx.isDestroyed) {
			return;
		}

		await ctx.renderer.initializePianoRollDisplays(
			ctx.longestDuration,
			ctx.isAlignmentMode(),
		);
		// The notes exist now, so the first paint can already drop the channels
		// whose track starts out silent.
		ctx.renderer.updatePianoRollChannelVisibility(ctx.runtimes);

		if (ctx.isDestroyed) {
			return;
		}

		ctx.isLoaded = true;
		ctx.renderer.hideOverlayOnLoaded();

		ctx.updateMainControls();
		ctx.applyTrackProperties();

		ctx.emit("loaded", {
			longestDuration: ctx.longestDuration,
		});
	} catch (error) {
		if (ctx.isDestroyed) {
			return;
		}

		ctx.isLoading = false;
		ctx.renderer.setOverlayLoading(false);
		ctx.handleError(getLoadErrorMessage(error));
	}
}

export function destroy(ctx: TrackSwitchControllerImpl): void {
	if (ctx.isDestroyed) {
		return;
	}
	ctx.isDestroyed = true;

	if (ctx.timerMonitorPosition) {
		clearInterval(ctx.timerMonitorPosition);
		ctx.timerMonitorPosition = null;
	}
	if (ctx.resizeDebounceTimer) {
		clearTimeout(ctx.resizeDebounceTimer);
		ctx.resizeDebounceTimer = null;
	}
	if (ctx.waveformRenderFrameId !== null) {
		cancelAnimationFrame(ctx.waveformRenderFrameId);
		ctx.waveformRenderFrameId = null;
	}
	ctx.seekingElement = null;
	ctx.rightClickDragging = false;
	ctx.loopDragStart = null;
	ctx.draggingMarker = null;
	ctx.pinchZoomState = null;
	ctx.pendingWaveformTouchSeek = null;
	ctx.waveformMinimapDragState = null;

	if (ctx.state.playing) {
		ctx.stopAudio();
	}

	ctx.inputBinder.unbind();
	ctx.sheetMusicEngine.destroy();
	ctx.renderer.destroy();
	ctx.audioEngine.disconnect();

	ctx.listeners.loaded.clear();
	ctx.listeners.error.clear();
	ctx.listeners.position.clear();
	ctx.listeners.trackState.clear();

	unregisterController(ctx);
}

export function togglePlay(ctx: TrackSwitchControllerImpl): void {
	if (ctx.state.playing) {
		ctx.pause();
	} else {
		ctx.play();
	}
}

export function play(ctx: TrackSwitchControllerImpl): void {
	if (ctx.isDestroyed || !ctx.isLoaded) {
		return;
	}
	if (ctx.state.playing) {
		return;
	}

	let startPosition = ctx.state.position;

	if (ctx.hasReachedPlaybackEnd()) {
		startPosition = 0;
	}

	if (
		ctx.navigationBar?.controls.includes("looping") &&
		ctx.state.loop.enabled &&
		ctx.state.loop.pointA !== null &&
		ctx.state.loop.pointB !== null &&
		(ctx.state.position < ctx.state.loop.pointA ||
			ctx.state.position > ctx.state.loop.pointB)
	) {
		startPosition = ctx.state.loop.pointA;
	}

	ctx.startAudio(startPosition);
	ctx.pauseOthers();
	ctx.dispatch({ type: "set-playing", playing: true });
	ctx.updatePlaybackPositionUi();
}

export function pause(ctx: TrackSwitchControllerImpl): void {
	if (!ctx.state.playing) {
		return;
	}

	const position = ctx.currentPlaybackReferencePosition();
	const anchor = ctx.currentPlaybackAnchor();
	ctx.stopAudio();

	ctx.dispatch({ type: "set-position", position: position, anchor: anchor });
	ctx.dispatch({ type: "set-playing", playing: false });

	ctx.updateMainControls();
}

export function stop(ctx: TrackSwitchControllerImpl): void {
	if (ctx.state.playing) {
		ctx.stopAudio();
	}

	ctx.dispatch({ type: "set-position", position: 0 });
	ctx.dispatch({ type: "set-playing", playing: false });
	ctx.updateMainControls();
}

export function seekTo(ctx: TrackSwitchControllerImpl, seconds: number): void {
	const nextPosition = clamp(seconds, 0, ctx.longestDuration);

	if (ctx.state.playing) {
		ctx.stopAudio();
		ctx.startAudio(nextPosition);
	} else {
		ctx.dispatch({ type: "set-position", position: nextPosition });
	}

	ctx.updateMainControls();
}

export function seekRelative(
	ctx: TrackSwitchControllerImpl,
	seconds: number,
): void {
	let nextPosition = ctx.state.position + seconds;
	nextPosition = clamp(nextPosition, 0, ctx.longestDuration);

	if (
		ctx.navigationBar?.controls.includes("looping") &&
		ctx.state.loop.enabled &&
		ctx.state.loop.pointA !== null &&
		ctx.state.loop.pointB !== null
	) {
		const loopStart = ctx.state.loop.pointA;
		const loopEnd = ctx.state.loop.pointB;
		const loopLength = loopEnd - loopStart;
		if (loopLength > 0) {
			let relative = nextPosition - loopStart;
			relative = ((relative % loopLength) + loopLength) % loopLength;
			nextPosition = loopStart + relative;
		}
	}

	if (ctx.state.playing) {
		ctx.stopAudio();
		ctx.startAudio(nextPosition);
	} else {
		ctx.dispatch({ type: "set-position", position: nextPosition });
	}

	ctx.updateMainControls();
}

export function setRepeat(
	ctx: TrackSwitchControllerImpl,
	enabled: boolean,
): void {
	ctx.dispatch({ type: "set-repeat", enabled: enabled });
	ctx.updateMainControls();
}

export function setVolume(
	ctx: TrackSwitchControllerImpl,
	volumeZeroToOne: number,
): void {
	if (!ctx.navigationBar?.controls.includes("globalVolume")) {
		ctx.dispatch({ type: "set-volume", volume: 1 });
		ctx.audioEngine.setMasterVolume(1);
		ctx.renderer.setVolumeSlider(1);
		return;
	}

	ctx.dispatch({ type: "set-volume", volume: volumeZeroToOne });
	ctx.audioEngine.setMasterVolume(ctx.state.volume);
	ctx.renderer.setVolumeSlider(ctx.state.volume);
}

export function setPan(
	ctx: TrackSwitchControllerImpl,
	panMinusOneToOne: number,
): void {
	if (!ctx.navigationBar?.controls.includes("globalPan")) {
		ctx.dispatch({ type: "set-pan", pan: 0 });
		ctx.audioEngine.setMasterPan(0);
		ctx.renderer.setPanSlider(0);
		return;
	}

	ctx.dispatch({ type: "set-pan", pan: panMinusOneToOne });
	ctx.audioEngine.setMasterPan(ctx.state.pan);
	ctx.renderer.setPanSlider(ctx.state.pan);
}

export function setTrackVolume(
	ctx: TrackSwitchControllerImpl,
	trackIndex: number,
	volumeZeroToOne: number,
): void {
	if (
		!Number.isInteger(trackIndex) ||
		trackIndex < 0 ||
		trackIndex >= ctx.runtimes.length
	) {
		return;
	}

	if (ctx.isTrackSyncLocked(trackIndex)) {
		return;
	}

	const runtime = ctx.runtimes[trackIndex];
	runtime.state.volume = clamp(volumeZeroToOne, 0, 1);
	ctx.applyTrackProperties();
}

export function setTrackPan(
	ctx: TrackSwitchControllerImpl,
	trackIndex: number,
	panMinusOneToOne: number,
): void {
	if (
		!Number.isInteger(trackIndex) ||
		trackIndex < 0 ||
		trackIndex >= ctx.runtimes.length
	) {
		return;
	}

	if (ctx.isTrackSyncLocked(trackIndex)) {
		return;
	}

	const runtime = ctx.runtimes[trackIndex];
	const panSupported =
		runtime.panAlgorithm === "balance" ||
		ctx.audioEngine.supportsStereoPanning();
	runtime.state.pan = panSupported ? clamp(panMinusOneToOne, -1, 1) : 0;
	ctx.applyTrackProperties();
}

export function setLoopPoint(
	ctx: TrackSwitchControllerImpl,
	marker: LoopMarker,
): boolean {
	if (!ctx.navigationBar?.controls.includes("looping")) {
		return false;
	}

	const position = ctx.state.playing
		? ctx.currentPlaybackReferencePosition()
		: ctx.state.position;
	const currentPoint =
		marker === "A" ? ctx.state.loop.pointA : ctx.state.loop.pointB;
	if (
		currentPoint !== null &&
		Math.abs(currentPoint - position) < ctx.loopMinDistance
	) {
		ctx.state = {
			...ctx.state,
			loop: {
				...ctx.state.loop,
				enabled: false,
				pointA: marker === "A" ? null : ctx.state.loop.pointA,
				pointB: marker === "B" ? null : ctx.state.loop.pointB,
			},
		};
		ctx.updateMainControls();
		return false;
	}

	ctx.dispatch({
		type: "set-loop-point",
		marker: marker,
		position: position,
		minDistance: ctx.loopMinDistance,
	});

	const nextPoint =
		marker === "A" ? ctx.state.loop.pointA : ctx.state.loop.pointB;
	if (nextPoint === null) {
		ctx.updateMainControls();
		return false;
	}

	if (ctx.state.loop.pointA !== null && ctx.state.loop.pointB !== null) {
		const loopA = ctx.state.loop.pointA;
		const loopB = ctx.state.loop.pointB;
		activateLoopRange(ctx, loopA, loopB);
	}

	ctx.updateMainControls();
	return true;
}

export function activateLoopRange(
	ctx: TrackSwitchControllerImpl,
	loopA: number,
	loopB: number,
): void {
	ctx.state = {
		...ctx.state,
		loop: {
			...ctx.state.loop,
			enabled: true,
		},
	};

	if (
		ctx.state.playing &&
		(ctx.state.position < loopA || ctx.state.position > loopB)
	) {
		ctx.stopAudio();
		ctx.startAudio(loopA);
	}
}

export function toggleLoop(ctx: TrackSwitchControllerImpl): boolean {
	if (!ctx.navigationBar?.controls.includes("looping")) {
		return false;
	}

	if (ctx.state.loop.pointA === null || ctx.state.loop.pointB === null) {
		return false;
	}

	ctx.dispatch({ type: "toggle-loop" });

	if (
		ctx.state.loop.enabled &&
		ctx.state.loop.pointA !== null &&
		ctx.state.loop.pointB !== null &&
		(ctx.state.position < ctx.state.loop.pointA ||
			ctx.state.position > ctx.state.loop.pointB)
	) {
		if (ctx.state.playing) {
			ctx.stopAudio();
			ctx.startAudio(ctx.state.loop.pointA);
		} else {
			ctx.dispatch({
				type: "set-position",
				position: ctx.state.loop.pointA,
			});
		}
	}

	ctx.updateMainControls();
	return true;
}

export function clearLoop(ctx: TrackSwitchControllerImpl): void {
	ctx.dispatch({ type: "clear-loop" });
	ctx.rightClickDragging = false;
	ctx.loopDragStart = null;
	ctx.draggingMarker = null;
	ctx.updateMainControls();
}

/**
 * Exclusivity is scoped to one selection: a second list keeps whatever it had
 * selected unless it shares the clicked list's `comparisonGroup`. Alignment is the
 * exception: it resolves the whole player to one solo unit, and a click reads as a
 * move within that hierarchy.
 */
export function toggleSolo(
	ctx: TrackSwitchControllerImpl,
	trackIndex: number,
	exclusive: boolean,
	groupIndex?: number,
): void {
	const runtime = ctx.runtimes[trackIndex];
	if (!runtime) {
		return;
	}

	if (ctx.isTrackSyncLocked(trackIndex)) {
		return;
	}

	const resolvedGroupIndex = groupIndex ?? ctx.groupIndexForTrack(trackIndex);
	const previousUnitIndex = ctx.activeSoloUnitIndex();

	if (ctx.soloMode === "alignment") {
		toggleSoloWithinAlignment(ctx, trackIndex, resolvedGroupIndex, exclusive);
	} else {
		const singleSoloMode =
			exclusive || ctx.isGroupExclusive(resolvedGroupIndex);
		const currentState = runtime.state.solo;

		if (singleSoloMode) {
			ctx
				.trackIndexesInSoloScope(resolvedGroupIndex)
				.forEach((index: number) => {
					ctx.runtimes[index].state.solo = false;
				});
		}

		runtime.state.solo = singleSoloMode && currentState ? true : !currentState;
	}

	ctx.applyTrackProperties();
	ctx.finishSoloUnitSwitch(previousUnitIndex);
}

export function applyPreset(
	ctx: TrackSwitchControllerImpl,
	presetId: string,
): void {
	const preset = ctx.presets[presetId];
	if (!preset) {
		return;
	}

	const trackIds = new Set(preset.tracks);
	ctx.runtimes.forEach((runtime: TrackRuntime) => {
		runtime.state.solo = trackIds.has(runtime.definition.id);
	});

	// A preset may name more than the current mode can play at once — an
	// exclusive list then keeps the first of its named tracks, and alignment
	// keeps the first named solo unit.
	ctx.collapseToSingleSelection();

	ctx.applyTrackProperties();
}

/** Phase A — render the scores; their measure extents feed alignment resolution. */
export async function renderSheetMusic(
	ctx: TrackSwitchControllerImpl,
): Promise<void> {
	const hosts = ctx.renderer.getPreparedSheetMusicHosts();

	if (hosts.length === 0) {
		ctx.sheetMusicEngine.destroy();
		return;
	}

	await ctx.sheetMusicEngine.initialize(hosts);
}

/** Phase B — attach the alignment-derived measure maps to the rendered scores. */
export async function attachSheetMusicMeasureMaps(
	ctx: TrackSwitchControllerImpl,
): Promise<void> {
	if (ctx.sheetMusicEngine.entries.length === 0) {
		return;
	}

	await ctx.sheetMusicEngine.attachMeasureMaps(
		(measureColumn: string, source: string) =>
			ctx.buildSheetMusicMeasureMaps(measureColumn, source),
	);
	ctx.sheetMusicEngine.updatePosition(
		ctx.state.position,
		ctx.isSyncReferenceAxisActive(),
	);
}

export function dispatch(
	ctx: TrackSwitchControllerImpl,
	action: PlayerAction,
): void {
	ctx.state = playerStateReducer(ctx.state, action);
	// Position and loop points are reference-timeline coordinates.
	const positionTimeline = playerTimeline(ctx.alignment);
	if (action.type === "set-position") {
		ctx.runtimeMarkers = moveRuntimeMarker(
			ctx.runtimeMarkers,
			"playhead",
			positionTimeline,
			ctx.state.position,
		);
	} else if (action.type === "set-loop-point") {
		ctx.runtimeMarkers = moveRuntimeMarker(
			ctx.runtimeMarkers,
			action.marker === "A" ? "loopA" : "loopB",
			positionTimeline,
			action.marker === "A" ? ctx.state.loop.pointA : ctx.state.loop.pointB,
		);
	} else if (action.type === "clear-loop") {
		ctx.runtimeMarkers = moveRuntimeMarker(
			ctx.runtimeMarkers,
			"loopA",
			positionTimeline,
			null,
		);
		ctx.runtimeMarkers = moveRuntimeMarker(
			ctx.runtimeMarkers,
			"loopB",
			positionTimeline,
			null,
		);
	}
}

export function pauseOthers(ctx: TrackSwitchControllerImpl): void {
	if (!ctx.features.muteOtherPlayerInstances) {
		return;
	}

	pauseOtherControllers(ctx);
}

export function startAudio(
	ctx: TrackSwitchControllerImpl,
	newPosition: number | undefined,
	snippetDuration: number | undefined,
): void {
	const requestedPosition =
		typeof newPosition === "number" ? newPosition : ctx.state.position;
	let enginePosition = requestedPosition;
	let nextReferencePosition = requestedPosition;
	let nextAnchor: PlaybackOrigin | null = null;

	if (ctx.isAlignmentMode() && ctx.alignment) {
		const activeTrackIndex = ctx.getAlignmentPlaybackTrackIndex();
		if (activeTrackIndex < 0) {
			return;
		}

		// An anchor for ctx position already says where on ctx track to start;
		// re-deriving it from the reference would round it to the edge of any
		// stretch the alignment holds at one reference value.
		enginePosition =
			ctx.trackPlaybackPosition(activeTrackIndex, requestedPosition) ??
			ctx.referenceToTrackTime(activeTrackIndex, requestedPosition);
		nextReferencePosition = ctx.trackToReferenceTime(
			activeTrackIndex,
			enginePosition,
			requestedPosition,
		);
		ctx.alignmentPlaybackTrackIndex = activeTrackIndex;
		nextAnchor = ctx.trackPlaybackAnchor(activeTrackIndex, enginePosition);
	} else {
		ctx.alignmentPlaybackTrackIndex = null;
	}

	const startResult = ctx.audioEngine.start(
		ctx.runtimes,
		enginePosition,
		snippetDuration,
	);
	if (!startResult) {
		ctx.alignmentPlaybackTrackIndex = null;
		return;
	}

	ctx.dispatch({
		type: "set-position",
		position: clamp(nextReferencePosition, 0, ctx.longestDuration),
		anchor: nextAnchor,
	});
	ctx.dispatch({ type: "set-start-time", startTime: startResult.startTime });
	resetMarkerClicks(ctx, ctx.state.position);
	if (snippetDuration === undefined) {
		// A marker right at the start is due now, not at the monitor's first tick.
		scheduleMarkerClicks(ctx);
	}

	if (ctx.timerMonitorPosition) {
		clearInterval(ctx.timerMonitorPosition);
	}

	ctx.timerMonitorPosition = setInterval(() => {
		ctx.monitorPosition();
	}, 16);
}

export function stopAudio(ctx: TrackSwitchControllerImpl): void {
	ctx.audioEngine.stop(ctx.runtimes);
	resetMarkerClicks(ctx, null);
	ctx.alignmentPlaybackTrackIndex = null;
	if (ctx.timerMonitorPosition) {
		clearInterval(ctx.timerMonitorPosition);
		ctx.timerMonitorPosition = null;
	}
}

export function monitorPosition(ctx: TrackSwitchControllerImpl): void {
	if (ctx.isDestroyed) {
		return;
	}

	if (ctx.state.playing && !ctx.state.currentlySeeking) {
		const currentPosition = ctx.currentPlaybackReferencePosition();
		ctx.dispatch({
			type: "set-position",
			position: currentPosition,
			anchor: ctx.currentPlaybackAnchor(),
		});
		scheduleMarkerClicks(ctx);
	}

	if (
		ctx.navigationBar?.controls.includes("looping") &&
		ctx.state.loop.enabled &&
		ctx.state.loop.pointB !== null &&
		ctx.state.position >= ctx.state.loop.pointB &&
		!ctx.state.currentlySeeking
	) {
		ctx.stopAudio();
		ctx.startAudio(ctx.state.loop.pointA ?? 0);
		return;
	}

	// Playback ends when the selected audio runs out. It can omit the final
	// reference occurrence and therefore end before the reference extent.
	if (ctx.hasReachedPlaybackEnd() && !ctx.state.currentlySeeking) {
		ctx.stopAudio();

		if (ctx.state.repeat) {
			ctx.dispatch({ type: "set-position", position: 0 });
			ctx.startAudio(0);
			ctx.dispatch({ type: "set-playing", playing: true });
		} else {
			ctx.dispatch({ type: "set-playing", playing: false });
		}
	}

	ctx.updateMainControls();
}

/**
 * True once there is nothing left to play. In alignment mode that is decided by
 * the lead track: under `extrapolate` its own duration decides, so a recording
 * keeps sounding through material the alignment does not cover; under `hold`
 * playback stops where that coverage ends, mirroring the clamp already applied
 * when playback starts outside coverage. (`error` never reaches this: projecting
 * the live position throws as soon as it leaves coverage.) Otherwise the shared
 * duration decides.
 */
export function hasReachedPlaybackEnd(ctx: TrackSwitchControllerImpl): boolean {
	if (
		ctx.isAlignmentMode() &&
		ctx.alignment &&
		ctx.alignmentPlaybackTrackIndex !== null
	) {
		const trackIndex = ctx.alignmentPlaybackTrackIndex;
		const runtime = ctx.runtimes[trackIndex];
		const trackDuration = runtime?.timing?.effectiveDuration;
		if (
			runtime &&
			trackDuration !== undefined &&
			Number.isFinite(trackDuration) &&
			trackDuration > 0
		) {
			if (
				ctx.alignment.outsideCoverage === "hold" &&
				!ctx.shouldBypassAlignmentMapping(trackIndex)
			) {
				const coverageEnd = ctx.alignment.projection.coverage(
					timelineId(runtime.definition.id),
					ctx.alignment.referenceTimeline,
				)?.end;
				if (coverageEnd !== undefined && Number.isFinite(coverageEnd)) {
					return ctx.currentPlaybackTrackPosition() >= coverageEnd;
				}
			}
			return ctx.currentPlaybackTrackPosition() >= trackDuration;
		}
	}

	return ctx.state.position >= ctx.longestDuration;
}

export function seekFromEvent(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
	usePreviewSnippet: boolean,
	animate = false,
): void {
	const seekTimelineContext = ctx.getSeekTimelineContext(ctx.seekingElement);
	const metrics = getSeekMetrics(
		ctx.seekingElement,
		event,
		seekTimelineContext.duration,
	);
	if (!metrics) {
		return;
	}

	const newPosition = seekTimelineContext.toReferenceTime(metrics.time);
	// A seek on a surface with its own timeline means the spot that was
	// clicked, not the reference value it summarizes to — inside a stretch the
	// alignment holds at one reference value those are not the same place.
	const anchor = seekTimelineContext.toAnchor?.(metrics.time) ?? null;

	if (metrics.posXRel >= 0 && metrics.posXRel <= metrics.seekWidth) {
		if (ctx.state.playing) {
			ctx.dispatch({ type: "set-position", position: newPosition, anchor });
			ctx.stopAudio();
			ctx.startAudio(newPosition, usePreviewSnippet ? 0.03 : undefined);
		} else {
			ctx.dispatch({ type: "set-position", position: newPosition, anchor });
		}
	} else {
		ctx.dispatch({ type: "set-position", position: newPosition, anchor });
	}

	ctx.updateMainControls(animate);
}

export function findLongestDuration(ctx: TrackSwitchControllerImpl): number {
	let longest = 0;

	ctx.runtimes.forEach((runtime: TrackRuntime) => {
		const duration = (
			ctx.constructor as typeof TrackSwitchControllerImpl
		).getRuntimeDuration(runtime);

		if (duration > longest) {
			longest = duration;
		}
	});

	return longest;
}

export function handleError(
	ctx: TrackSwitchControllerImpl,
	message: string,
): void {
	ctx.isLoaded = false;
	ctx.isLoading = false;
	ctx.alignment = null;
	ctx.alignmentPlaybackTrackIndex = null;
	ctx.globalSyncEnabled = false;
	ctx.syncLockedTrackIndexes.clear();
	ctx.preSyncSoloStates = null;
	ctx.soloMode = "lists";

	ctx.stopAudio();

	if (ctx.resizeDebounceTimer) {
		clearTimeout(ctx.resizeDebounceTimer);
		ctx.resizeDebounceTimer = null;
	}
	if (ctx.waveformRenderFrameId !== null) {
		cancelAnimationFrame(ctx.waveformRenderFrameId);
		ctx.waveformRenderFrameId = null;
	}
	ctx.pinchZoomState = null;
	ctx.waveformMinimapDragState = null;
	ctx.sheetMusicEngine.destroy();
	ctx.renderer.destroyPianoRollDisplays();

	ctx.renderer.showError(message, ctx.runtimes);
	ctx.emit("error", { message: message });
}

interface SeekTimelineContext {
	duration: number;
	toReferenceTime(timelineTime: number): number;
	fromReferenceTime(referenceTime: number): number;
	formatValue(timelineTime: number): string;
	toAnchor?(timelineTime: number): PlaybackOrigin | null;
	playbackPosition?(): number | null;
}

const WAVEFORM_WHEEL_ZOOM_SPEED = 0.002;
const WAVEFORM_TRACKPAD_DELTA_BOOST = 8;
const WAVEFORM_ZOOM_OUT_DELTA_BOOST = 1.35;
const WAVEFORM_MAX_WHEEL_DELTA = 240;

function normalizeWaveformWheelDelta(event: WheelEvent): number {
	let deltaY = event.deltaY;

	if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
		deltaY *= 16;
	} else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
		const ownerNode =
			event.currentTarget instanceof Node
				? event.currentTarget
				: event.target instanceof Node
					? event.target
					: null;
		deltaY *= Math.max(1, getOwnerWindow(ownerNode).innerHeight);
	} else if (Math.abs(deltaY) < 16) {
		deltaY *= WAVEFORM_TRACKPAD_DELTA_BOOST;
	}

	if (deltaY > 0) {
		deltaY *= WAVEFORM_ZOOM_OUT_DELTA_BOOST;
	}

	return clamp(deltaY, -WAVEFORM_MAX_WHEEL_DELTA, WAVEFORM_MAX_WHEEL_DELTA);
}

function handleWaveformAuxiliarySeekState(
	controller: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): boolean {
	if (controller.waveformMinimapDragState) {
		if (updateTimelineMinimapDrag(controller, event)) {
			event.preventDefault();
			event.stopPropagation();
		}
		return true;
	}

	if (controller.pendingWaveformTouchSeek) {
		if (controller.tryActivatePendingWaveformTouchSeek(event)) {
			event.preventDefault();
			event.stopPropagation();
		}
		return true;
	}

	if (controller.pinchZoomState) {
		if (controller.updatePinchZoom(event)) {
			event.preventDefault();
		}
		return true;
	}

	return false;
}

function updateDraggedLoopMarker(
	controller: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): boolean {
	if (controller.draggingMarker === null) {
		return false;
	}

	event.preventDefault();
	const seekTimelineContext = controller.getSeekTimelineContext(
		controller.seekingElement,
	);
	const metrics = getSeekMetrics(
		controller.seekingElement,
		event,
		seekTimelineContext.duration,
	);
	if (!metrics) {
		return true;
	}

	let newTime = metrics.time;
	if (controller.draggingMarker === "A") {
		const loopPointB =
			controller.state.loop.pointB === null
				? null
				: seekTimelineContext.fromReferenceTime(controller.state.loop.pointB);
		if (loopPointB !== null) {
			newTime = snapLoopEndToMarker(
				controller,
				controller.seekingElement,
				event,
				newTime,
				loopPointB,
			);
			newTime = Math.min(newTime, loopPointB - controller.loopMinDistance);
		}
		newTime = Math.max(0, newTime);
		controller.state = {
			...controller.state,
			loop: {
				...controller.state.loop,
				pointA: seekTimelineContext.toReferenceTime(newTime),
			},
		};
	} else {
		const loopPointA =
			controller.state.loop.pointA === null
				? null
				: seekTimelineContext.fromReferenceTime(controller.state.loop.pointA);
		if (loopPointA !== null) {
			newTime = snapLoopEndToMarker(
				controller,
				controller.seekingElement,
				event,
				newTime,
				loopPointA,
			);
			newTime = Math.max(newTime, loopPointA + controller.loopMinDistance);
		}
		newTime = Math.min(seekTimelineContext.duration, newTime);
		controller.state = {
			...controller.state,
			loop: {
				...controller.state.loop,
				pointB: seekTimelineContext.toReferenceTime(newTime),
			},
		};
	}

	controller.updateMainControls();
	return true;
}

function updateRightClickLoopSelection(
	controller: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): boolean {
	if (
		!controller.navigationBar?.controls.includes("looping") ||
		!controller.rightClickDragging
	) {
		return false;
	}

	event.preventDefault();

	const seekTimelineContext = controller.getSeekTimelineContext(
		controller.seekingElement,
	);
	const metrics = getSeekMetrics(
		controller.seekingElement,
		event,
		seekTimelineContext.duration,
	);
	if (!metrics || controller.loopDragStart === null) {
		return true;
	}

	const loopStart = controller.loopDragStart;
	const snappedTime = snapLoopEndToMarker(
		controller,
		controller.seekingElement,
		event,
		metrics.time,
		loopStart,
	);
	const movingForward = snappedTime >= loopStart;
	const loopEnd = movingForward
		? Math.min(
				seekTimelineContext.duration,
				Math.max(snappedTime, loopStart + controller.loopMinDistance),
			)
		: Math.max(
				0,
				Math.min(snappedTime, loopStart - controller.loopMinDistance),
			);
	const mappedStart = seekTimelineContext.toReferenceTime(
		movingForward ? loopStart : loopEnd,
	);
	const mappedEnd = seekTimelineContext.toReferenceTime(
		movingForward ? loopEnd : loopStart,
	);

	controller.state = {
		...controller.state,
		loop: {
			...controller.state.loop,
			pointA: Math.min(mappedStart, mappedEnd),
			pointB: Math.max(mappedStart, mappedEnd),
			enabled: false,
		},
	};

	controller.updateMainControls();
	return true;
}
export function onSeekMove(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	if (!ctx.isLoaded) {
		return;
	}

	if (updateMarkerAdjust(ctx, event)) {
		return;
	}

	if (updatePianoRollPanDrag(ctx, event)) {
		return;
	}

	if (handleWaveformAuxiliarySeekState(ctx, event)) {
		return;
	}

	if (updateDraggedLoopMarker(ctx, event)) {
		return;
	}

	if (updateRightClickLoopSelection(ctx, event)) {
		return;
	}

	if (ctx.state.currentlySeeking) {
		event.preventDefault();
		ctx.seekFromEvent(event);
	}
}

export function onWaveformZoomWheel(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	const wheelEvent = event.originalEvent as WheelEvent | undefined;
	const deltaY = wheelEvent ? normalizeWaveformWheelDelta(wheelEvent) : 0;
	if (typeof deltaY !== "number" || !Number.isFinite(deltaY) || deltaY === 0) {
		return;
	}

	const wrapper = closestInRoot(ctx.root, event.target, ".waveform-wrap");
	if (!wrapper) {
		return;
	}

	const seekWrap = wrapper.querySelector(
		'.seekwrap[data-seek-surface="waveform"]',
	);
	if (!(seekWrap instanceof HTMLElement)) {
		return;
	}

	const zoomDuration = ctx.getSeekTimelineContext(seekWrap).duration;
	if (!ctx.renderer.isWaveformZoomEnabled(seekWrap, zoomDuration)) {
		return;
	}

	const currentZoom = ctx.renderer.getWaveformZoom(seekWrap);
	if (currentZoom === null) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();

	const zoomFactor = Math.exp(-1 * deltaY * WAVEFORM_WHEEL_ZOOM_SPEED);
	const nextZoom = currentZoom * zoomFactor;
	const changed = ctx.renderer.setWaveformZoom(
		seekWrap,
		nextZoom,
		zoomDuration,
		Number.isFinite(event.pageX) ? event.pageX : undefined,
	);

	if (changed) {
		ctx.requestWaveformRender();
		ctx.updateMainControls();
	}
}

export function onPianoRollZoomWheel(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	const wheelEvent = event.originalEvent as WheelEvent | undefined;
	const deltaY = wheelEvent ? normalizeWaveformWheelDelta(wheelEvent) : 0;
	if (typeof deltaY !== "number" || !Number.isFinite(deltaY) || deltaY === 0) {
		return;
	}

	const wrapper = closestInRoot(ctx.root, event.target, ".piano-roll-wrap");
	if (!wrapper) {
		return;
	}

	const seekWrap = wrapper.querySelector(
		'.seekwrap[data-seek-surface="piano-roll"]',
	);
	if (!(seekWrap instanceof HTMLElement)) {
		return;
	}

	const zoomDuration = ctx.getSeekTimelineContext(seekWrap).duration;
	if (!ctx.renderer.isPianoRollZoomEnabled(seekWrap, zoomDuration)) {
		return;
	}

	const currentZoom = ctx.renderer.getPianoRollZoom(seekWrap);
	if (currentZoom === null) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();

	const zoomFactor = Math.exp(-1 * deltaY * WAVEFORM_WHEEL_ZOOM_SPEED);
	const nextZoom = currentZoom * zoomFactor;
	const changed = ctx.renderer.setPianoRollZoom(
		seekWrap,
		nextZoom,
		zoomDuration,
		Number.isFinite(event.pageX) ? event.pageX : undefined,
	);

	if (changed) {
		ctx.updateMainControls();
	}
}

function updateTimelineMinimapDrag(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): boolean {
	if (!ctx.waveformMinimapDragState) {
		return false;
	}

	if (event.type === "touchmove" && ctx.getActiveTouchCount(event) >= 2) {
		ctx.endWaveformMinimapDrag();
		return false;
	}

	if (!Number.isFinite(event.pageX)) {
		return true;
	}

	const rect = ctx.waveformMinimapDragState.minimapNode.getBoundingClientRect();
	const minimapWidth = Math.max(
		1,
		rect.width || ctx.waveformMinimapDragState.minimapNode.clientWidth,
	);
	const ownerWindow = getOwnerWindow(ctx.waveformMinimapDragState.minimapNode);
	const pointerRatio = clamp(
		((event.pageX as number) - (rect.left + ownerWindow.scrollX)) /
			minimapWidth,
		0,
		1,
	);
	const seekWrap = ctx.waveformMinimapDragState.seekWrap;
	const startRatio =
		pointerRatio - ctx.waveformMinimapDragState.pointerOffsetRatio;
	if (ctx.isPianoRollSeekSurface(seekWrap)) {
		ctx.renderer.setPianoRollMinimapViewportStart(seekWrap, startRatio);
	} else {
		ctx.renderer.setWaveformMinimapViewportStart(seekWrap, startRatio);
	}
	return true;
}

export function updateWaveformMinimapDrag(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): boolean {
	return updateTimelineMinimapDrag(ctx, event);
}

export function endWaveformMinimapDrag(ctx: TrackSwitchControllerImpl): void {
	ctx.waveformMinimapDragState = null;
}

export function requestWaveformRender(ctx: TrackSwitchControllerImpl): void {
	if (ctx.waveformRenderFrameId !== null) {
		return;
	}

	ctx.waveformRenderFrameId = requestAnimationFrame(() => {
		ctx.waveformRenderFrameId = null;
		ctx.renderer.renderWaveforms(
			ctx.waveformEngine,
			ctx.runtimes,
			ctx.longestDuration,
			ctx.getWaveformTimelineProjector(),
			ctx.getWaveformTimelineContext(),
		);
	});
}

export function isWaveformSeekSurface(seekWrap: HTMLElement | null): boolean {
	return (
		!!seekWrap && seekWrap.getAttribute("data-seek-surface") === "waveform"
	);
}

export function isPianoRollSeekSurface(seekWrap: HTMLElement | null): boolean {
	return (
		!!seekWrap && seekWrap.getAttribute("data-seek-surface") === "piano-roll"
	);
}

/**
 * A keyboard-enabled piano roll's note grid pans instead of jumping: the sheet
 * tracks the pointer directly, panning playback position along with it. Its
 * own gesture, not the generic click-to-seek below, so it starts a distinct
 * drag state rather than an interactive seek.
 */
function tryStartPianoRollPanDrag(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
	seekWrap: HTMLElement,
): boolean {
	if (!ctx.isPianoRollSeekSurface(seekWrap)) {
		return false;
	}

	const surface = ctx.renderer.findPianoRollSurface(seekWrap);
	if (surface?.playbackFollowMode !== "pinnedLeft") {
		return false;
	}

	const pageX = getPointerPageX(event);
	if (pageX === null) {
		return false;
	}

	ctx.pianoRollPanDragState = { seekWrap, lastPageX: pageX };
	ctx.pendingWaveformTouchSeek = null;
	ctx.seekingElement = null;
	ctx.rightClickDragging = false;
	ctx.loopDragStart = null;
	ctx.draggingMarker = null;
	if (ctx.state.currentlySeeking) {
		ctx.dispatch({ type: "set-seeking", seeking: false });
	}
	ctx.disableLoopWhenSeekOutsideRegion();

	return true;
}

/**
 * Applies one step of an in-progress piano-roll pan drag: moves playback
 * position by the pointer's pixel delta (inverted, since dragging right
 * reveals earlier content, as if pulling the sheet of paper towards you) and
 * writes `scrollLeft` directly so the pinned-left playhead visibly tracks the
 * gesture instead of waiting for the next follow-scroll tick, which is
 * suppressed for this surface while the drag is in progress — see
 * `shouldSuppressPianoRollPlaybackFollow`.
 */
function updatePianoRollPanDrag(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): boolean {
	const dragState = ctx.pianoRollPanDragState;
	if (!dragState) {
		return false;
	}

	event.preventDefault();

	const pageX = getPointerPageX(event);
	if (pageX === null) {
		return true;
	}

	const deltaX = pageX - dragState.lastPageX;
	dragState.lastPageX = pageX;
	if (deltaX === 0) {
		return true;
	}

	const surface = ctx.renderer.findPianoRollSurface(dragState.seekWrap);
	if (!surface) {
		return true;
	}

	const seekTimelineContext = ctx.getSeekTimelineContext(dragState.seekWrap);
	const duration = seekTimelineContext.duration;
	const timeWidth = getTimelineTimeWidth(surface);
	if (!(duration > 0) || !(timeWidth > 0)) {
		return true;
	}

	const currentLocalTime = seekTimelineContext.fromReferenceTime(
		ctx.state.position,
	);
	const nextLocalTime = clamp(
		currentLocalTime - (deltaX / timeWidth) * duration,
		0,
		duration,
	);
	const newPosition = seekTimelineContext.toReferenceTime(nextLocalTime);
	const anchor = seekTimelineContext.toAnchor?.(nextLocalTime) ?? null;

	ctx.dispatch({ type: "set-position", position: newPosition, anchor });
	if (ctx.state.playing) {
		ctx.stopAudio();
		ctx.startAudio(newPosition, 0.03);
	}

	const scrollLeft = resolveTimelinePlaybackFollowScrollLeft(
		surface,
		nextLocalTime / duration,
	);
	if (scrollLeft !== null) {
		surface.lastFollowScrollLeft = scrollLeft;
		surface.scrollContainer.scrollLeft = scrollLeft;
	}

	ctx.updateMainControls();
	return true;
}

export function startInteractiveSeek(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
	seekWrap: HTMLElement,
): void {
	if (tryStartPianoRollPanDrag(ctx, event, seekWrap)) {
		return;
	}

	ctx.seekingElement = seekWrap;
	// The initial click/tap of a seek gesture is a discrete jump, worth
	// animating; a drag's own per-pixel `onSeekMove` calls track the pointer
	// live and should not queue an animation behind it.
	ctx.seekFromEvent(event, true, true);
	ctx.dispatch({ type: "set-seeking", seeking: true });
	ctx.disableLoopWhenSeekOutsideRegion();
}

export function disableLoopWhenSeekOutsideRegion(
	ctx: TrackSwitchControllerImpl,
): void {
	if (
		ctx.state.loop.enabled &&
		ctx.state.loop.pointA !== null &&
		ctx.state.loop.pointB !== null &&
		(ctx.state.position < ctx.state.loop.pointA ||
			ctx.state.position > ctx.state.loop.pointB)
	) {
		ctx.state = {
			...ctx.state,
			loop: {
				...ctx.state.loop,
				enabled: false,
			},
		};
	}
}

export function tryStartPendingWaveformTouchSeek(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
	seekWrap: HTMLElement | null,
): boolean {
	if (
		event.type !== "touchstart" ||
		(!ctx.isWaveformSeekSurface(seekWrap) &&
			!ctx.isPianoRollSeekSurface(seekWrap)) ||
		ctx.getActiveTouchCount(event) !== 1 ||
		!seekWrap
	) {
		return false;
	}

	if (!Number.isFinite(event.pageX)) {
		return false;
	}

	if (!Number.isFinite(event.pageY)) {
		return false;
	}

	ctx.pendingWaveformTouchSeek = {
		seekWrap: seekWrap,
		startPageX: event.pageX as number,
		startPageY: event.pageY as number,
	};
	ctx.seekingElement = seekWrap;
	return true;
}

export function tryActivatePendingWaveformTouchSeek(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): boolean {
	if (!ctx.pendingWaveformTouchSeek) {
		return false;
	}

	if (ctx.getActiveTouchCount(event) >= 2) {
		return false;
	}

	if (!Number.isFinite(event.pageX)) {
		return false;
	}

	if (!Number.isFinite(event.pageY)) {
		return false;
	}

	const deltaX = Math.abs(
		(event.pageX as number) - ctx.pendingWaveformTouchSeek.startPageX,
	);
	const deltaY = Math.abs(
		(event.pageY as number) - ctx.pendingWaveformTouchSeek.startPageY,
	);

	if (deltaY >= ctx.touchSeekMoveThresholdPx && deltaY > deltaX) {
		ctx.pendingWaveformTouchSeek = null;
		ctx.seekingElement = null;
		return false;
	}

	if (deltaX < ctx.touchSeekMoveThresholdPx || deltaX < deltaY) {
		return false;
	}

	const seekWrap = ctx.pendingWaveformTouchSeek.seekWrap;
	ctx.pendingWaveformTouchSeek = null;
	ctx.startInteractiveSeek(event, seekWrap);
	return true;
}

export function applyPendingWaveformTouchSeekTap(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	if (!ctx.pendingWaveformTouchSeek) {
		return;
	}

	if (Number.isFinite(event.pageX) && Number.isFinite(event.pageY)) {
		const deltaX = Math.abs(
			(event.pageX as number) - ctx.pendingWaveformTouchSeek.startPageX,
		);
		const deltaY = Math.abs(
			(event.pageY as number) - ctx.pendingWaveformTouchSeek.startPageY,
		);
		if (
			deltaX >= ctx.touchSeekMoveThresholdPx ||
			deltaY >= ctx.touchSeekMoveThresholdPx
		) {
			ctx.pendingWaveformTouchSeek = null;
			ctx.seekingElement = null;
			return;
		}
	}

	ctx.seekingElement = ctx.pendingWaveformTouchSeek.seekWrap;
	ctx.pendingWaveformTouchSeek = null;
	if (placeMarkerFromEvent(ctx, event, ctx.seekingElement)) {
		return;
	}
	ctx.seekFromEvent(event, false, true);
}

export function getTouchPair(
	event: ControllerPointerEvent,
): [Touch, Touch] | null {
	const touchEvent = event.originalEvent as TouchEvent | undefined;
	const touches = touchEvent?.touches;
	if (!touches || touches.length < 2) {
		return null;
	}

	const first = touches[0];
	const second = touches[1];
	if (!first || !second) {
		return null;
	}

	return [first, second] as [Touch, Touch];
}

export function getTouchDistance(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): number | null {
	const touchPair = ctx.getTouchPair(event);
	if (!touchPair) {
		return null;
	}

	const [first, second] = touchPair;
	const distance = Math.hypot(
		first.pageX - second.pageX,
		first.pageY - second.pageY,
	);
	if (!Number.isFinite(distance) || distance <= 0) {
		return null;
	}

	return distance;
}

export function getTouchCenterPageX(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): number | null {
	const touchPair = ctx.getTouchPair(event);
	if (!touchPair) {
		return null;
	}

	const [first, second] = touchPair;
	return (first.pageX + second.pageX) / 2;
}

export function getActiveTouchCount(event: ControllerPointerEvent): number {
	const touchEvent = event.originalEvent as TouchEvent | undefined;
	if (!touchEvent?.touches) {
		return 0;
	}

	return touchEvent.touches.length;
}

export function tryStartPinchZoom(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
	seekWrap: HTMLElement | null,
): boolean {
	if (event.type !== "touchstart") {
		return false;
	}

	if (ctx.pinchZoomState) {
		return true;
	}

	if (
		!seekWrap ||
		(seekWrap.getAttribute("data-seek-surface") !== "waveform" &&
			seekWrap.getAttribute("data-seek-surface") !== "piano-roll")
	) {
		return false;
	}

	const zoomDuration = ctx.getSeekTimelineContext(seekWrap).duration;
	const zoomEnabled = ctx.isPianoRollSeekSurface(seekWrap)
		? ctx.renderer.isPianoRollZoomEnabled(seekWrap, zoomDuration)
		: ctx.renderer.isWaveformZoomEnabled(seekWrap, zoomDuration);
	if (!zoomEnabled) {
		return false;
	}

	const initialDistance = ctx.getTouchDistance(event);
	if (initialDistance === null) {
		return false;
	}

	const initialZoom = ctx.isPianoRollSeekSurface(seekWrap)
		? ctx.renderer.getPianoRollZoom(seekWrap)
		: ctx.renderer.getWaveformZoom(seekWrap);
	if (initialZoom === null) {
		return false;
	}

	ctx.pinchZoomState = {
		seekWrap: seekWrap,
		initialDistance: initialDistance,
		initialZoom: initialZoom,
	};
	ctx.pendingWaveformTouchSeek = null;
	ctx.waveformMinimapDragState = null;

	if (ctx.state.currentlySeeking) {
		ctx.dispatch({ type: "set-seeking", seeking: false });
	}
	ctx.seekingElement = seekWrap;
	ctx.rightClickDragging = false;
	ctx.loopDragStart = null;
	ctx.draggingMarker = null;
	return true;
}

export function updatePinchZoom(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): boolean {
	if (!ctx.pinchZoomState) {
		return false;
	}

	const distance = ctx.getTouchDistance(event);
	if (distance === null) {
		ctx.endPinchZoom();
		return false;
	}

	const anchorPageX = ctx.getTouchCenterPageX(event);
	const scale = distance / ctx.pinchZoomState.initialDistance;
	const zoomDuration = ctx.getSeekTimelineContext(
		ctx.pinchZoomState.seekWrap,
	).duration;
	const changed = ctx.isPianoRollSeekSurface(ctx.pinchZoomState.seekWrap)
		? ctx.renderer.setPianoRollZoom(
				ctx.pinchZoomState.seekWrap,
				ctx.pinchZoomState.initialZoom * scale,
				zoomDuration,
				anchorPageX === null ? undefined : anchorPageX,
			)
		: ctx.renderer.setWaveformZoom(
				ctx.pinchZoomState.seekWrap,
				ctx.pinchZoomState.initialZoom * scale,
				zoomDuration,
				anchorPageX === null ? undefined : anchorPageX,
			);

	if (changed) {
		if (ctx.isWaveformSeekSurface(ctx.pinchZoomState.seekWrap)) {
			ctx.requestWaveformRender();
		}
		ctx.updateMainControls();
	}

	return true;
}

export function endPinchZoom(ctx: TrackSwitchControllerImpl): void {
	ctx.pinchZoomState = null;
	if (ctx.state.currentlySeeking) {
		ctx.dispatch({ type: "set-seeking", seeking: false });
	}
	ctx.pendingWaveformTouchSeek = null;
	ctx.seekingElement = null;
}

export function trackIndexFromTarget(
	ctx: TrackSwitchControllerImpl,
	target: EventTarget | null,
): number {
	const track = closestInRoot(ctx.root, target, ".track[data-track-index]");
	if (!track) {
		return -1;
	}

	const rawIndex = track.getAttribute("data-track-index");
	const parsed = Number(rawIndex);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return -1;
	}

	return Math.floor(parsed);
}

/**
 * Which `trackList` the clicked row lives in — a track may be listed by several,
 * and only the one that was clicked decides how the toggle behaves.
 */
export function trackGroupIndexFromTarget(
	ctx: TrackSwitchControllerImpl,
	target: EventTarget | null,
): number {
	const list = closestInRoot(
		ctx.root,
		target,
		".track_list[data-track-group-index]",
	);
	if (!list) {
		return -1;
	}

	const parsed = Number(list.getAttribute("data-track-group-index"));
	if (!Number.isFinite(parsed) || parsed < 0) {
		return -1;
	}

	return Math.floor(parsed);
}

export function isFixedWaveformLocalAxisEnabled(
	ctx: TrackSwitchControllerImpl,
): boolean {
	return ctx.isAlignmentMode() && !!ctx.alignment && !ctx.globalSyncEnabled;
}

export function getSeekTimelineContext(
	ctx: TrackSwitchControllerImpl,
	seekingElement: HTMLElement | null,
): SeekTimelineContext {
	const referenceContext: SeekTimelineContext = {
		duration: ctx.longestDuration,
		formatValue: (value: number): string =>
			ctx.renderer.formatReferenceTimelineValue(value),
		toReferenceTime: (timelineTime: number): number =>
			clamp(timelineTime, 0, ctx.longestDuration),
		fromReferenceTime: (referenceTime: number): number =>
			clamp(referenceTime, 0, ctx.longestDuration),
	};

	if (!seekingElement) {
		return referenceContext;
	}

	if (ctx.isPianoRollSeekSurface(seekingElement) && ctx.isAlignmentMode()) {
		const pianoRollSurface = ctx.renderer.findPianoRollSurface(seekingElement);
		return (
			ctx.getPianoRollTimelineContext(pianoRollSurface) || referenceContext
		);
	}

	if (ctx.isAlignmentMode()) {
		const imageSurface = ctx.renderer.findImageSurface(seekingElement);
		if (imageSurface) {
			return ctx.getImageTimelineContext(imageSurface) || referenceContext;
		}
	}

	if (!ctx.isFixedWaveformLocalAxisEnabled()) {
		return referenceContext;
	}

	const waveformSurface = ctx.renderer.findWaveformSurface(seekingElement);
	if (!waveformSurface) {
		return referenceContext;
	}

	const trackIndex = resolveAudibleWaveformTrackIndex(
		ctx.runtimes,
		waveformSurface.waveformSource,
		ctx.isAlignmentMode(),
		(trackIndex: number) => ctx.isTrackExclusive(trackIndex),
	);
	if (trackIndex === null) {
		return referenceContext;
	}
	const runtime = ctx.runtimes[trackIndex];
	if (!runtime) {
		return referenceContext;
	}

	const trackDuration = (
		ctx.constructor as typeof TrackSwitchControllerImpl
	).getRuntimeDuration(runtime);
	if (!Number.isFinite(trackDuration) || trackDuration <= 0) {
		return referenceContext;
	}

	let longestTrackDuration = trackDuration;
	for (let i = 0; i < ctx.runtimes.length; i++) {
		const rt = ctx.runtimes[i];
		if (rt) {
			const d = (
				ctx.constructor as typeof TrackSwitchControllerImpl
			).getRuntimeDuration(rt);
			if (Number.isFinite(d) && d > longestTrackDuration)
				longestTrackDuration = d;
		}
	}
	const axisDuration =
		waveformSurface.timeAxis === "individual"
			? trackDuration
			: longestTrackDuration;

	return {
		duration: axisDuration,
		formatValue: (value: number): string =>
			ctx.renderer.formatLocalTimelineValue(runtime.definition.id, value),
		toAnchor: (sharedTime: number) =>
			ctx.trackPlaybackAnchor(trackIndex, clamp(sharedTime, 0, trackDuration)),
		playbackPosition: () => ctx.trackPlaybackPosition(trackIndex),
		toReferenceTime: (sharedTime: number): number => {
			const clampedTrackTime = clamp(sharedTime, 0, trackDuration);
			return clamp(
				ctx.trackToReferenceTime(
					trackIndex,
					clampedTrackTime,
					ctx.state.position,
				),
				0,
				ctx.longestDuration,
			);
		},
		fromReferenceTime: (referenceTime: number): number => {
			const clampedReferenceTime = clamp(referenceTime, 0, ctx.longestDuration);
			return clamp(
				ctx.referenceToTrackTime(trackIndex, clampedReferenceTime),
				0,
				trackDuration,
			);
		},
	};
}

export function getPianoRollTimelineContext(
	ctx: TrackSwitchControllerImpl,
	pianoRollSurface: PianoRollSeekSurfaceMetadata | null,
): SeekTimelineContext | null {
	if (!pianoRollSurface || !ctx.isAlignmentMode()) {
		return null;
	}

	const pianoRollDuration = Number(pianoRollSurface.pianoRollDurationSeconds);
	if (!Number.isFinite(pianoRollDuration) || pianoRollDuration <= 0) {
		return null;
	}

	const alignmentColumn =
		typeof pianoRollSurface.alignmentColumn === "string"
			? pianoRollSurface.alignmentColumn.trim()
			: "";
	const pianoRollTimeline = alignmentColumn
		? timelineId(alignmentColumn)
		: null;
	return (
		buildProjectedTimelineContext(
			ctx,
			pianoRollTimeline,
			pianoRollDuration,
		) ?? {
			// No timeline declared for ctx MIDI: it shares the reference
			// timeline, so local and reference coordinates coincide.
			duration: pianoRollDuration,
			formatValue: (value: number): string =>
				ctx.renderer.formatLocalTimelineValue(null, value),
			toReferenceTime: (pianoRollTime: number): number =>
				clamp(pianoRollTime, 0, ctx.longestDuration),
			fromReferenceTime: (referenceTime: number): number =>
				clamp(referenceTime, 0, pianoRollDuration),
		}
	);
}

export function getImageTimelineContext(
	ctx: TrackSwitchControllerImpl,
	imageSurface: ImageSeekSurfaceMetadata | null,
): SeekTimelineContext | null {
	if (!imageSurface || !ctx.isAlignmentMode()) {
		return null;
	}

	const alignmentColumn =
		typeof imageSurface.alignmentColumn === "string"
			? imageSurface.alignmentColumn.trim()
			: "";
	if (!alignmentColumn) {
		return null;
	}

	// An image's native coordinate is percent of its width, which is also what
	// the seek geometry works in.
	return buildProjectedTimelineContext(ctx, timelineId(alignmentColumn), 100);
}

/**
 * Maps a surface's own timeline to and from reference coordinates with the same
 * piecewise-linear projection the audio tracks use, so every surface reports a
 * shared musical position in its own units. Null when the timeline is not
 * reachable from the reference.
 */
function buildProjectedTimelineContext(
	ctx: TrackSwitchControllerImpl,
	timeline: ReturnType<typeof timelineId> | null,
	surfaceDuration: number,
): {
	duration: number;
	toReferenceTime(surfaceValue: number): number;
	fromReferenceTime(referenceTime: number): number;
	formatValue(surfaceValue: number): string;
	toAnchor(surfaceValue: number): PlaybackOrigin;
	playbackPosition(): number | null;
} | null {
	const referenceTimeline = ctx.alignment?.referenceTimeline;
	const projection = ctx.alignment?.projection;
	if (
		!timeline ||
		!projection ||
		!referenceTimeline ||
		!projection.canProject(referenceTimeline, timeline) ||
		!projection.canProject(timeline, referenceTimeline)
	) {
		return null;
	}

	return {
		duration: surfaceDuration,
		formatValue: (value: number): string =>
			ctx.renderer.formatLocalTimelineValue(timeline, value),
		toAnchor: (surfaceValue: number) => ({
			timeline,
			value: clamp(surfaceValue, 0, surfaceDuration),
		}),
		playbackPosition: (): number | null => {
			const position = ctx.playbackPositionOn(timeline);
			return position === null ? null : clamp(position, 0, surfaceDuration);
		},
		toReferenceTime: (surfaceValue: number): number =>
			clamp(
				projection.project(
					clamp(surfaceValue, 0, surfaceDuration),
					timeline,
					referenceTimeline,
				),
				0,
				ctx.longestDuration,
			),
		fromReferenceTime: (referenceTime: number): number =>
			clamp(
				projection.project(referenceTime, referenceTimeline, timeline),
				0,
				surfaceDuration,
			),
	};
}

export function getWaveformTimelineContext(
	ctx: TrackSwitchControllerImpl,
): WaveformTimelineContext {
	return {
		enabled: ctx.isFixedWaveformLocalAxisEnabled(),
		referenceToTrackTime: (
			trackIndex: number,
			referenceTime: number,
		): number => {
			const runtime = ctx.runtimes[trackIndex];
			if (!runtime) {
				return 0;
			}

			const trackDuration = (
				ctx.constructor as typeof TrackSwitchControllerImpl
			).getRuntimeDuration(runtime);
			if (!Number.isFinite(trackDuration) || trackDuration <= 0) {
				return 0;
			}

			// Not clamped to `ctx.longestDuration`: that bounds the reference
			// (score/measure) transport, not a track's own local time axis. Under
			// `outsideCoverage: "extrapolate"` a track keeps sounding past the
			// reference's playable extent, and its waveform's own seekhead should
			// keep advancing with it — bounded only by the track's real duration
			// below.
			return clamp(
				ctx.referenceToTrackTime(trackIndex, Math.max(0, referenceTime)),
				0,
				trackDuration,
			);
		},
		getPlaybackPosition: (trackIndex: number): number | null => {
			const position = ctx.trackPlaybackPosition(trackIndex);
			if (position === null) {
				return null;
			}

			const runtime = ctx.runtimes[trackIndex];
			if (!runtime) {
				return null;
			}

			const trackDuration = (
				ctx.constructor as typeof TrackSwitchControllerImpl
			).getRuntimeDuration(runtime);
			if (!Number.isFinite(trackDuration) || trackDuration <= 0) {
				return null;
			}

			return clamp(position, 0, trackDuration);
		},
		getTrackDuration: (trackIndex: number): number => {
			const runtime = ctx.runtimes[trackIndex];
			if (!runtime) {
				return 0;
			}

			const duration = (
				ctx.constructor as typeof TrackSwitchControllerImpl
			).getRuntimeDuration(runtime);
			if (!Number.isFinite(duration) || duration <= 0) {
				return 0;
			}

			return duration;
		},
		getTrackCount: (): number => ctx.runtimes.length,
		getTrackAlignmentPoints: (
			trackIndex: number,
		): Array<{ referenceTime: number; trackTime: number }> => {
			return ctx.getTrackAlignmentPoints(trackIndex);
		},
	};
}

export function getWaveformTimelineProjector(
	ctx: TrackSwitchControllerImpl,
): TrackTimelineProjector | undefined {
	if (!ctx.isAlignmentMode() || !ctx.alignment) {
		return undefined;
	}

	const trackIndexByRuntime = new Map<TrackRuntime, number>();
	const trackIndexByDefinition = new Map<object, number>();

	ctx.runtimes.forEach((runtime: TrackRuntime, index: number) => {
		trackIndexByRuntime.set(runtime, index);
		trackIndexByDefinition.set(runtime.definition, index);
	});

	return (runtime: TrackRuntime, trackTimelineTime: number): number => {
		const directIndex = trackIndexByRuntime.get(runtime);
		if (directIndex !== undefined) {
			return ctx.trackToReferenceTime(directIndex, trackTimelineTime);
		}

		const definitionIndex = trackIndexByDefinition.get(runtime.definition);
		if (definitionIndex !== undefined) {
			return ctx.trackToReferenceTime(definitionIndex, trackTimelineTime);
		}

		return trackTimelineTime;
	};
}

function emitPositionUpdate(controller: TrackSwitchControllerImpl): void {
	controller.emit("position", createPositionEventPayload(controller));
}

function shouldSuppressWaveformPlaybackFollow(
	controller: TrackSwitchControllerImpl,
): boolean {
	return (
		!!controller.waveformMinimapDragState ||
		!!controller.pinchZoomState ||
		!!controller.pendingWaveformTouchSeek ||
		(controller.state.currentlySeeking &&
			controller.isWaveformSeekSurface(controller.seekingElement))
	);
}

function shouldSuppressPianoRollPlaybackFollow(
	controller: TrackSwitchControllerImpl,
): boolean {
	return (
		!!controller.waveformMinimapDragState ||
		!!controller.pinchZoomState ||
		!!controller.pianoRollPanDragState ||
		(controller.state.currentlySeeking &&
			controller.isPianoRollSeekSurface(controller.seekingElement))
	);
}

export function applyTrackProperties(ctx: TrackSwitchControllerImpl): void {
	const stereoPanningSupported = ctx.audioEngine.supportsStereoPanning();
	// With nothing soloed at all, a track of an exclusive list still sounds — that
	// list always means one of its tracks. Global sync silences the fallback.
	const silentFallback = ctx.isAlignmentMode() && ctx.globalSyncEnabled;
	const noSoloFallbackGates = ctx.runtimes.map((_runtime, index) =>
		!silentFallback && ctx.isTrackExclusive(index) ? 1 : 0,
	);
	// Only "pan" tracks need StereoPannerNode — "balance" tracks mix with plain
	// gain nodes and keep working wherever an AudioContext exists at all.
	ctx.runtimes.forEach((runtime) => {
		if (runtime.panAlgorithm === "pan" && !stereoPanningSupported) {
			runtime.state.pan = 0;
		}
	});

	ctx.renderer.updateTrackControls(
		ctx.runtimes,
		ctx.syncLockedTrackIndexes,
		stereoPanningSupported,
		ctx.globalSyncEnabled,
	);
	ctx.audioEngine.applyTrackStateGains(ctx.runtimes, noSoloFallbackGates);
	ctx.renderer.switchPosterImage(ctx.runtimes);
	ctx.renderer.renderWaveforms(
		ctx.waveformEngine,
		ctx.runtimes,
		ctx.longestDuration,
		ctx.getWaveformTimelineProjector(),
		ctx.getWaveformTimelineContext(),
	);
	ctx.renderer.updatePianoRollChannelVisibility(ctx.runtimes);
	ctx.renderMarkerLayers();
	ctx.updateMarkerNavigation();

	ctx.runtimes.forEach((runtime, index) => {
		ctx.emit("trackState", createTrackStateEventPayload(index, runtime));
	});
}

export function updateMainControls(
	ctx: TrackSwitchControllerImpl,
	animate = false,
): void {
	ctx.synchronizeRuntimeMarkers();
	const uiState = createUiState(ctx);
	const suppressWaveformPlaybackFollow =
		shouldSuppressWaveformPlaybackFollow(ctx);

	ctx.renderer.updateMainControls(
		uiState,
		ctx.runtimes,
		ctx.getWaveformTimelineContext(),
		ctx.getWarpingMatrixContext(),
	);
	ctx.renderer.updateWaveformPlaybackFollow(
		uiState,
		ctx.runtimes,
		ctx.getWaveformTimelineContext(),
		suppressWaveformPlaybackFollow,
		animate,
	);
	ctx.renderer.updatePianoRollPlaybackState(
		uiState,
		shouldSuppressPianoRollPlaybackFollow(ctx),
		ctx.isAlignmentMode(),
		(surface) => ctx.getPianoRollTimelineContext(surface),
		animate,
	);
	ctx.updateMarkerNavigation();
	ctx.sheetMusicEngine.updatePosition(
		ctx.state.position,
		ctx.isSyncReferenceAxisActive(),
		ctx.renderer.isTimelineCovered ?? undefined,
	);

	emitPositionUpdate(ctx);
}

export function updatePlaybackPositionUi(ctx: TrackSwitchControllerImpl): void {
	ctx.synchronizeRuntimeMarkers();
	const uiState = createUiState(ctx);
	const suppressWaveformPlaybackFollow =
		shouldSuppressWaveformPlaybackFollow(ctx);

	ctx.renderer.updatePlaybackPosition(
		uiState,
		ctx.runtimes,
		ctx.getWaveformTimelineContext(),
		ctx.getWarpingMatrixContext(),
	);
	ctx.renderer.updateWaveformPlaybackFollow(
		uiState,
		ctx.runtimes,
		ctx.getWaveformTimelineContext(),
		suppressWaveformPlaybackFollow,
	);
	ctx.renderer.updatePianoRollPlaybackState(
		uiState,
		shouldSuppressPianoRollPlaybackFollow(ctx),
		ctx.isAlignmentMode(),
		(surface) => ctx.getPianoRollTimelineContext(surface),
	);
	ctx.updateMarkerNavigation();
	ctx.sheetMusicEngine.updatePosition(
		ctx.state.position,
		ctx.isSyncReferenceAxisActive(),
		ctx.renderer.isTimelineCovered ?? undefined,
	);

	emitPositionUpdate(ctx);
}
