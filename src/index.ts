import { defaultFeatures, normalizeFeatures } from "./domain/options";
import { createInitialPlayerState, playerStateReducer } from "./domain/state";
import {
	defineTrackSwitchSyncPlayerElement,
	defineTrackswitchDefaultElement,
	defineTrackswitchElement,
	defineTrackswitchElements,
	TRACKSWITCH_DEFAULT_ELEMENT_NAME,
	TRACKSWITCH_ELEMENT_NAME,
	TRACKSWITCH_SYNC_PLAYER_ELEMENT_NAME,
	TrackswitchPlayer,
	TrackswitchSyncPlayer,
} from "./element";
import { WaveformEngine } from "./engine/waveform-engine";
import {
	defineTrackSwitchSyncInteractiveElement,
	TRACKSWITCH_SYNC_INTERACTIVE_ELEMENT_NAME,
	TrackswitchSyncInteractive,
} from "./interactive/interactive-element";
import {
	createInteractiveTrackSwitch,
	createTrackSwitchSyncInteractive,
} from "./interactive/interactive-factory";
import {
	createDefaultTrackSwitch,
	createTrackSwitch,
	createTrackSwitchSyncPlayer,
} from "./player/factory";
import { inferSourceMimeType } from "./shared/audio";
import { formatSecondsToHHMMSSmmm } from "./shared/format";
import { parsePresetIndices } from "./shared/preset";

export type {
	AlignmentOutOfRangeMode,
	LoopMarker,
	PlayerState,
	TrackAlignmentConfig,
	TrackDefinition,
	TrackDefinitionAlignment,
	TrackLoadedSource,
	TrackRuntime,
	TrackSourceDefinition,
	TrackSourceVariant,
	TrackState,
	TrackSwitchConfig,
	TrackSwitchController,
	TrackSwitchEventMap,
	TrackSwitchEventName,
	TrackSwitchFeatures,
	TrackSwitchImageConfig,
	TrackSwitchImageUiElement,
	TrackSwitchInit,
	TrackSwitchPerTrackImageConfig,
	TrackSwitchPerTrackImageUiElement,
	TrackSwitchSheetMusicConfig,
	TrackSwitchSheetMusicUiElement,
	TrackSwitchSnapshot,
	TrackSwitchTextAlign,
	TrackSwitchTextConfig,
	TrackSwitchTextUiElement,
	TrackSwitchUiConfig,
	TrackSwitchUiElement,
	TrackSwitchWarpingMatrixConfig,
	TrackSwitchWarpingMatrixUiElement,
	TrackSwitchWaveformConfig,
	TrackSwitchWaveformUiElement,
	WaveformSource,
} from "./domain/types";
export type {
	TrackswitchDomEventName,
	TrackswitchPlayerElement,
} from "./element";
export {
	createDefaultTrackSwitch,
	createInitialPlayerState,
	createInteractiveTrackSwitch,
	createTrackSwitch,
	createTrackSwitchSyncInteractive,
	createTrackSwitchSyncPlayer,
	defaultFeatures,
	defineTrackSwitchSyncInteractiveElement,
	defineTrackSwitchSyncPlayerElement,
	defineTrackswitchDefaultElement,
	defineTrackswitchElement,
	defineTrackswitchElements,
	formatSecondsToHHMMSSmmm,
	inferSourceMimeType,
	normalizeFeatures,
	parsePresetIndices,
	playerStateReducer,
	TRACKSWITCH_DEFAULT_ELEMENT_NAME,
	TRACKSWITCH_ELEMENT_NAME,
	TRACKSWITCH_SYNC_INTERACTIVE_ELEMENT_NAME,
	TRACKSWITCH_SYNC_PLAYER_ELEMENT_NAME,
	TrackswitchPlayer,
	TrackswitchSyncInteractive,
	TrackswitchSyncPlayer,
	WaveformEngine,
};
