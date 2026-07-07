import {
	createPositionEventPayload,
	createTrackStateEventPayload,
	createUiState,
} from "./controller-state";
import type { TrackSwitchControllerImpl } from "./player-controller";

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

function shouldSuppressMidiPlaybackFollow(
	controller: TrackSwitchControllerImpl,
): boolean {
	return (
		!!controller.waveformMinimapDragState ||
		!!controller.pinchZoomState ||
		(controller.state.currentlySeeking &&
			controller.isMidiSeekSurface(controller.seekingElement))
	);
}

export function applyTrackProperties(ctx: TrackSwitchControllerImpl): void {
	const panSupported = ctx.audioEngine.supportsStereoPanning();
	const noSoloFallbackGate =
		ctx.isAlignmentMode() && ctx.globalSyncEnabled ? 0 : undefined;
	if (!panSupported) {
		ctx.runtimes.forEach((runtime) => {
			runtime.state.pan = 0;
		});
	}

	ctx.renderer.updateTrackControls(
		ctx.runtimes,
		ctx.syncLockedTrackIndexes,
		ctx.effectiveSingleSoloMode,
		panSupported,
		ctx.globalSyncEnabled,
	);
	ctx.audioEngine.applyTrackStateGains(ctx.runtimes, noSoloFallbackGate);
	ctx.renderer.switchPosterImage(ctx.runtimes);
	ctx.renderer.renderWaveforms(
		ctx.waveformEngine,
		ctx.runtimes,
		ctx.longestDuration,
		ctx.getWaveformTimelineProjector(),
		ctx.getWaveformTimelineContext(),
	);

	ctx.runtimes.forEach((runtime, index) => {
		ctx.emit("trackState", createTrackStateEventPayload(index, runtime));
	});
}

export function updateMainControls(ctx: TrackSwitchControllerImpl): void {
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
	);
	ctx.renderer.updateMidiPlaybackState(
		uiState,
		shouldSuppressMidiPlaybackFollow(ctx),
		ctx.isAlignmentMode(),
		(surface) => ctx.getMidiTimelineContext(surface),
	);
	ctx.sheetMusicEngine.updatePosition(
		ctx.state.position,
		ctx.isSyncReferenceAxisActive(),
	);

	emitPositionUpdate(ctx);
}

export function updatePlaybackPositionUi(ctx: TrackSwitchControllerImpl): void {
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
	ctx.renderer.updateMidiPlaybackState(
		uiState,
		shouldSuppressMidiPlaybackFollow(ctx),
		ctx.isAlignmentMode(),
		(surface) => ctx.getMidiTimelineContext(surface),
	);
	ctx.sheetMusicEngine.updatePosition(
		ctx.state.position,
		ctx.isSyncReferenceAxisActive(),
	);

	emitPositionUpdate(ctx);
}
