import { defaultFeatures, normalizeFeatures } from "./config/config";
import {
	defineTrackswitchDefaultElement,
	TRACKSWITCH_DEFAULT_ELEMENT_NAME,
	TrackswitchPlayer,
} from "./element";
import { WaveformEngine } from "./media/waveform-engine";
import { createTrackSwitch } from "./player/player";
import { createInitialPlayerState, playerStateReducer } from "./player/state";
import { inferSourceMimeType } from "./shared/audio";
import { formatSecondsToHHMMSSmmm } from "./shared/format";

export type {
	TrackswitchDomEventName,
	TrackswitchPlayerElement,
} from "./element";
export type {
	AlignmentConfig,
	LoopMarker,
	MarkerLayerConfig,
	MarkerSequenceSourceConfig,
	MarkerSequenceType,
	MarkersConfig,
	MediaConfig,
	MediaEntryConfig,
	OutsideCoverageMode,
	PlayerState,
	PresetConfig,
	PresetsConfig,
	TrackDefinition,
	TrackLoadedSource,
	TrackRuntime,
	TrackSourceDefinition,
	TrackSourceVariant,
	TrackState,
	TrackSwitchController,
	TrackSwitchCssOverrides,
	TrackSwitchEventMap,
	TrackSwitchEventName,
	TrackSwitchFeatures,
	TrackSwitchImageViewConfig,
	TrackSwitchInit,
	TrackSwitchNavigationBarControl,
	TrackSwitchNavigationBarViewConfig,
	TrackSwitchPerTrackImageViewConfig,
	TrackSwitchPianoRollViewConfig,
	TrackSwitchSeparatorViewConfig,
	TrackSwitchSheetMusicViewConfig,
	TrackSwitchSnapshot,
	TrackSwitchTextAlign,
	TrackSwitchTextViewConfig,
	TrackSwitchTrackListViewConfig,
	TrackSwitchViewConfig,
	TrackSwitchWarpingMatrixViewConfig,
	TrackSwitchWaveformViewConfig,
	WaveformTimeAxis,
} from "./types";
export {
	createInitialPlayerState,
	createTrackSwitch,
	defaultFeatures,
	defineTrackswitchDefaultElement,
	formatSecondsToHHMMSSmmm,
	inferSourceMimeType,
	normalizeFeatures,
	playerStateReducer,
	TRACKSWITCH_DEFAULT_ELEMENT_NAME,
	TrackswitchPlayer,
	WaveformEngine,
};
