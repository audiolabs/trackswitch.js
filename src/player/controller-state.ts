import type {
	TrackRuntime,
	TrackState,
	TrackSwitchEventMap,
	TrackSwitchSnapshot,
	TrackSwitchUiState,
} from "../domain/types";
import type { TrackSwitchControllerImpl } from "./player-controller";

export function createTrackStateSnapshot(runtime: TrackRuntime): TrackState {
	return {
		solo: runtime.state.solo,
		volume: runtime.state.volume,
		pan: runtime.state.pan,
	};
}

export function createControllerSnapshot(
	controller: TrackSwitchControllerImpl,
): TrackSwitchSnapshot {
	return {
		isLoaded: controller.isLoaded,
		isLoading: controller.isLoading,
		isDestroyed: controller.isDestroyed,
		longestDuration: controller.longestDuration,
		features: { ...controller.features },
		state: {
			...controller.state,
			loop: { ...controller.state.loop },
		},
		tracks: controller.runtimes.map(createTrackStateSnapshot),
	};
}

export function createUiState(
	controller: TrackSwitchControllerImpl,
): TrackSwitchUiState {
	return {
		playing: controller.state.playing,
		repeat: controller.state.repeat,
		position: controller.state.position,
		longestDuration: controller.longestDuration,
		syncEnabled: controller.globalSyncEnabled,
		syncAvailable: controller.isGlobalSyncAvailable(),
		loop: {
			pointA: controller.state.loop.pointA,
			pointB: controller.state.loop.pointB,
			enabled: controller.state.loop.enabled,
		},
	};
}

export function createPositionEventPayload(
	controller: TrackSwitchControllerImpl,
): TrackSwitchEventMap["position"] {
	return {
		position: controller.state.position,
		duration: controller.longestDuration,
	};
}

export function createTrackStateEventPayload(
	index: number,
	runtime: TrackRuntime,
): TrackSwitchEventMap["trackState"] {
	return {
		index,
		state: createTrackStateSnapshot(runtime),
	};
}
