export type LoopMarker = "A" | "B";
export type TrackSwitchVariant = "default" | "sync";
export type AlignmentOutOfRangeMode = "clamp" | "linear";
export type WaveformSource = "audible" | number | number[];
export type WaveformPlaybackFollowMode = "off" | "center" | "jump";
export type TrackSwitchTextAlign = "left" | "center" | "right";

export interface TrackAlignmentConfig {
	csv: string;
	referenceTimeColumn: string;
	referenceTimeColumnSync?: string;
	outOfRange?: AlignmentOutOfRangeMode;
}

export interface TrackSourceDefinition {
	src: string;
	type?: string;
	startOffsetMs?: number;
	endOffsetMs?: number;
}

export interface TrackDefinitionAlignment {
	column?: string;
	synchronizedSources?: TrackSourceDefinition[];
}

export interface TrackDefinition {
	title?: string;
	solo?: boolean;
	volume?: number;
	pan?: number;
	image?: string;
	style?: string;
	presets?: number[];
	sources: TrackSourceDefinition[];
	alignment?: TrackDefinitionAlignment;
}

export interface TrackSwitchFeatures {
	exclusiveSolo: boolean;
	muteOtherPlayerInstances: boolean;
	globalVolume: boolean;
	trackVolumeControls: boolean;
	trackPanControls: boolean;
	customizablePanelOrder: boolean;
	repeat: boolean;
	tabView: boolean;
	iosAudioUnlock: boolean;
	keyboard: boolean;
	looping: boolean;
	seekBar: boolean;
	timer: boolean;
	presets: boolean;
}

export interface TrackSwitchImageConfig {
	src: string;
	seekable?: boolean;
	style?: string;
	seekMarginLeft?: number;
	seekMarginRight?: number;
}

export interface TrackSwitchPerTrackImageConfig {
	seekable?: boolean;
	style?: string;
	seekMarginLeft?: number;
	seekMarginRight?: number;
}

export interface TrackSwitchWaveformConfig {
	height?: number;
	waveformBarWidth?: number;
	maxZoom?: number;
	waveformSource?: WaveformSource;
	playbackFollowMode?: WaveformPlaybackFollowMode;
	timer?: boolean;
	alignedPlayhead?: boolean;
	showAlignmentPoints?: boolean;
	style?: string;
	seekMarginLeft?: number;
	seekMarginRight?: number;
}

export interface TrackSwitchMidiConfig {
	src: string;
	alignmentColumn?: string;
	height?: number;
	maxZoom?: number;
	playbackFollowMode?: WaveformPlaybackFollowMode;
	timer?: boolean;
	style?: string;
	seekMarginLeft?: number;
	seekMarginRight?: number;
}

export interface TrackSwitchSheetMusicConfig {
	src: string;
	measureColumn?: string;
	maxWidth?: number;
	maxHeight?: number;
	renderScale?: number;
	followPlayback?: boolean;
	style?: string;
	cursorColor?: string;
	cursorAlpha?: number;
}

export interface TrackSwitchWarpingMatrixConfig {
	style?: string;
	height?: number;
	tempoSmoothingSeconds?: number;
	bpm?: number | "infer_score" | null;
}

export interface TrackSwitchTextConfig {
	text: string;
	bold?: boolean;
	italic?: boolean;
	fontSize?: number;
	align?: TrackSwitchTextAlign;
	style?: string;
}

export interface TrackSwitchImageUiElement extends TrackSwitchImageConfig {
	type: "image";
}

export interface TrackSwitchPerTrackImageUiElement
	extends TrackSwitchPerTrackImageConfig {
	type: "perTrackImage";
}

export interface TrackSwitchWaveformUiElement
	extends TrackSwitchWaveformConfig {
	type: "waveform";
}

export interface TrackSwitchMidiUiElement extends TrackSwitchMidiConfig {
	type: "midi";
}

export interface TrackSwitchSheetMusicUiElement
	extends TrackSwitchSheetMusicConfig {
	type: "sheetMusic";
}

export interface TrackSwitchWarpingMatrixUiElement
	extends TrackSwitchWarpingMatrixConfig {
	type: "warpingMatrix";
}

export interface TrackSwitchTextUiElement extends TrackSwitchTextConfig {
	type: "text";
}

export interface TrackSwitchTrackGroupUiElement {
	type: "trackGroup";
	rowHeight?: number;
	trackGroup: TrackDefinition[];
}

export interface NormalizedTrackGroupLayout {
	groupIndex: number;
	startTrackIndex: number;
	trackCount: number;
	rowHeight?: number;
}

export type TrackSwitchUiElement =
	| TrackSwitchImageUiElement
	| TrackSwitchPerTrackImageUiElement
	| TrackSwitchWaveformUiElement
	| TrackSwitchMidiUiElement
	| TrackSwitchSheetMusicUiElement
	| TrackSwitchWarpingMatrixUiElement
	| TrackSwitchTextUiElement
	| TrackSwitchTrackGroupUiElement;
export type TrackSwitchUiConfig = TrackSwitchUiElement[];

export interface TrackSwitchConfig {
	tracks: TrackDefinition[];
	presetNames?: string[];
	features?: Partial<TrackSwitchFeatures>;
	alignment?: TrackAlignmentConfig;
	ui?: TrackSwitchUiConfig;
}

export interface NormalizedTrackSwitchConfig extends TrackSwitchConfig {
	variant: TrackSwitchVariant;
	trackGroups: NormalizedTrackGroupLayout[];
}

export interface TrackSwitchInit {
	presetNames?: string[];
	features?: Partial<TrackSwitchFeatures>;
	alignment?: TrackAlignmentConfig;
	ui: TrackSwitchUiConfig;
}

export interface TrackTiming {
	trimStart: number;
	padStart: number;
	audioDuration: number;
	effectiveDuration: number;
}

export type AudioDownloadSizeStatus =
	| "calculating"
	| "known"
	| "partial"
	| "unavailable";

export interface AudioDownloadSizeInfo {
	status: AudioDownloadSizeStatus;
	totalBytes: number | null;
	resolvedSourceCount: number;
	totalSourceCount: number;
}

export interface TrackState {
	solo: boolean;
	volume: number;
	pan: number;
}

export type TrackSourceVariant = "base" | "synced";

export interface WaveformSummaryLevel {
	samplesPerEntry: number;
	mins: Float32Array;
	maxes: Float32Array;
}

export interface WaveformSummary {
	duration: number;
	sampleRate: number;
	sampleCount: number;
	levels: WaveformSummaryLevel[];
}

export interface TrackLoadedSource {
	buffer: AudioBuffer | null;
	timing: TrackTiming | null;
	sourceIndex: number;
	waveformSummary: WaveformSummary | null;
}

export interface TrackRuntime {
	definition: TrackDefinition;
	state: TrackState;
	gainNode: GainNode | null;
	pannerNode: StereoPannerNode | null;
	buffer: AudioBuffer | null;
	timing: TrackTiming | null;
	activeSource: AudioBufferSourceNode | null;
	sourceIndex: number;
	activeVariant: TrackSourceVariant;
	baseSource: TrackLoadedSource;
	syncedSource: TrackLoadedSource | null;
	successful: boolean;
	errored: boolean;
	waveformSummary: WaveformSummary | null;
}

export interface LoopState {
	pointA: number | null;
	pointB: number | null;
	enabled: boolean;
}

export interface PlayerState {
	playing: boolean;
	repeat: boolean;
	position: number;
	startTime: number;
	currentlySeeking: boolean;
	loop: LoopState;
	volume: number;
}

export type TrackSwitchEventName =
	| "loaded"
	| "error"
	| "position"
	| "trackState";

export interface TrackSwitchEventMap {
	loaded: { longestDuration: number };
	error: { message: string };
	position: { position: number; duration: number };
	trackState: { index: number; state: TrackState };
}

export type TrackSwitchEventHandler<K extends TrackSwitchEventName> = (
	payload: TrackSwitchEventMap[K],
) => void;

export interface TrackSwitchSnapshot {
	isLoaded: boolean;
	isLoading: boolean;
	isDestroyed: boolean;
	longestDuration: number;
	features: TrackSwitchFeatures;
	state: PlayerState;
	tracks: TrackState[];
}

export interface TrackSwitchController {
	load(): Promise<void>;
	updateConfig(nextConfig: TrackSwitchInit): Promise<void>;
	destroy(): void;
	togglePlay(): void;
	play(): void;
	pause(): void;
	stop(): void;
	seekTo(seconds: number): void;
	seekRelative(seconds: number): void;
	setRepeat(enabled: boolean): void;
	setVolume(volumeZeroToOne: number): void;
	setTrackVolume(trackIndex: number, volumeZeroToOne: number): void;
	setTrackPan(trackIndex: number, panMinusOneToOne: number): void;
	setLoopPoint(marker: LoopMarker): boolean;
	toggleLoop(): boolean;
	clearLoop(): void;
	toggleSolo(trackIndex: number, exclusive?: boolean): void;
	applyPreset(presetIndex: number): void;
	getState(): TrackSwitchSnapshot;
	on<K extends TrackSwitchEventName>(
		eventName: K,
		handler: TrackSwitchEventHandler<K>,
	): () => void;
	off<K extends TrackSwitchEventName>(
		eventName: K,
		handler: TrackSwitchEventHandler<K>,
	): void;
}

export interface TrackSwitchUiState {
	playing: boolean;
	repeat: boolean;
	position: number;
	longestDuration: number;
	syncEnabled: boolean;
	syncAvailable: boolean;
	loop: LoopState;
}
