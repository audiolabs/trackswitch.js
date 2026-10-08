import type { TrackSwitchCssToken } from "./generated/css-tokens";
import type { TimelineId, TimelineUnit } from "./model/timeline";

export type LoopMarker = "A" | "B";
export type TrackPanAlgorithm = "balance" | "pan";
/** A pan control's algorithm, or `"none"` to hide the control entirely. */
export type TrackPanControl = TrackPanAlgorithm | "none";
/**
 * What a projection does for positions outside a timeline's coverage — the span
 * its alignment anchors actually annotate.
 */
export type OutsideCoverageMode = "hold" | "extrapolate" | "error";
/**
 * How a projection resolves several anchors that put one timeline at the same
 * position — the shape a repeat produces, where one performance revisits a
 * stretch the other plays only once.
 */
export type DuplicateAnchorPolicy = "first" | "average" | "error";
/** How a zoomable surface moves with playback. */
export type WaveformPlaybackFollowMode = "off" | "center" | "jump";
export type TrackSwitchTextAlign = "left" | "center" | "right";
type MarkerLineStyle = "solid" | "dashed";

/**
 * Overrides for the player's public `--ts-*` theming custom properties, set on
 * the element the block belongs to. Custom properties inherit, so a block on a
 * view reaches everything that view renders — an accent colour set on one
 * waveform recolours that waveform alone — while the top-level block on
 * `TrackSwitchInit` reaches the whole player.
 */
export type TrackSwitchCssOverrides = Partial<
	Record<TrackSwitchCssToken, string>
>;

/** A media id doubles as a timeline id; a track id is a media id restricted to `type: 'audio'`. */
export type MediaId = string;
export type TrackId = MediaId;
type MarkerSequenceId = string;
export type MarkerSequenceType = "points" | "segments";
type PresetId = string;

/**
 * Internal rendering representation: a waveform view's `tracks` option resolved
 * to positions in the runtimes array. Derived at config-normalization time,
 * never configured directly.
 */
export type WaveformSourceIndex = "audible" | number | number[];

/** Whether a fixed-track waveform uses the shared duration or its own duration. */
export type WaveformTimeAxis = "shared" | "individual";

// ═══════════ config: data ═══════════

export interface TrackSourceDefinition {
	src: string;
	type?: string;
	startOffsetMs?: number;
	endOffsetMs?: number;
}

export interface SynchronizedAudioSourceConfig {
	src: string;
	/**
	 * Trims and pads this file, independently of the media entry's own offsets:
	 * a time-warped rendition carries its silence differently from the original.
	 */
	startOffsetMs?: number;
	endOffsetMs?: number;
}

export interface AudioMediaEntryConfig {
	type: "audio";
	src: string;
	title?: string;
	/**
	 * The unit this medium's positions are expressed in: its alignment column is
	 * read in it, and every surface the medium owns reads out in it. Omitted, the
	 * medium uses the native unit of its type.
	 */
	timelineUnit?: TimelineUnit;
	/**
	 * Names an `image` media entry shown by a `perTrackImage` view while this
	 * track is the only soloed one. Being a medium, it carries its own alignment
	 * column, so a per-stem spectrogram seeks and folds markers like any other
	 * timed image.
	 */
	imageID?: MediaId;
	css?: TrackSwitchCssOverrides;
	solo?: boolean;
	volume?: number;
	pan?: number;
	/** Overrides the owning trackList's `trackVolumeControls` for this track only. */
	volumeControl?: boolean;
	/** Overrides the owning trackList's `trackPanControls` for this track only. */
	panControl?: TrackPanControl;
	startOffsetMs?: number;
	endOffsetMs?: number;
	srcTimeScaled?: SynchronizedAudioSourceConfig;
}

export interface MidiMediaEntryConfig {
	type: "midi";
	src: string;
	/** See `AudioMediaEntryConfig.timelineUnit`. */
	timelineUnit?: TimelineUnit;
}

export interface MusicXmlMediaEntryConfig {
	type: "musicxml";
	src: string;
	/** See `AudioMediaEntryConfig.timelineUnit`. */
	timelineUnit?: TimelineUnit;
}

/**
 * An image with a time axis — a spectrogram, a scanned page, a structure plot.
 * Its native coordinate is percent of its width; `timelineUnit: "pixels"` reads
 * its column as pixel columns instead.
 */
export interface ImageMediaEntryConfig {
	type: "image";
	src: string;
	/** See `AudioMediaEntryConfig.timelineUnit`. */
	timelineUnit?: TimelineUnit;
}

export type MediaEntryConfig =
	| AudioMediaEntryConfig
	| MidiMediaEntryConfig
	| MusicXmlMediaEntryConfig
	| ImageMediaEntryConfig;

export type MediaConfig = Record<MediaId, MediaEntryConfig>;

export interface AlignmentConfig {
	src: string;
	referenceTimeline: string;
	/**
	 * timeline id -> CSV column name. What the column's numbers mean is the
	 * medium's business: see `media.timelineUnit`.
	 */
	timelines: Record<string, string>;
	outsideCoverage?: OutsideCoverageMode;
	duplicateAnchors?: DuplicateAnchorPolicy;
}

export interface MarkerSequenceSourceConfig {
	/** Whether markers represent independent points or consecutive segment starts. */
	type: MarkerSequenceType;
	/** Segment label -> CSS color. Requires a segment sequence with labelCol. */
	colors?: Record<string, string>;
	src: string;
	/** Defaults to the reference timeline; meaningless (and omittable) with no alignment block. */
	timeline?: string;
	/** CSV column with marker positions, read in the timeline unit of the timeline they belong to. */
	timeCol: string;
	labelCol?: string;
}

export type MarkersConfig = Record<
	MarkerSequenceId,
	MarkerSequenceSourceConfig
>;

export interface PresetConfig {
	label?: string;
	tracks: TrackId[];
}

export type PresetsConfig = Record<PresetId, PresetConfig>;

export interface MarkerLayerConfig {
	/** The marker sequence this layer draws, or "alignment" for the anchors. */
	sequence: MarkerSequenceId;
	color?: string;
	line?: MarkerLineStyle;
	/** Marker line width in CSS pixels. */
	lineWidth?: number;
	/** Resting opacity (0–1) of markers in this layer. Defaults to the stylesheet's --ts-marker-opacity. */
	opacity?: number;
	/** Draw a connector from this timeline to the reference timeline. Ignored when the view's timeline IS the reference. */
	foldToReference?: boolean;
}

// ═══════════ config: views ═══════════

export interface TrackSwitchImageViewConfig {
	type: "image";
	/** Names the `image` media entry this view displays. */
	mediaID: MediaId;
	seekable?: boolean;
	css?: TrackSwitchCssOverrides;
	seekMarginLeft?: number;
	seekMarginRight?: number;
	markerLayers?: MarkerLayerConfig[];
}

export interface TrackSwitchPerTrackImageViewConfig {
	type: "perTrackImage";
	seekable?: boolean;
	css?: TrackSwitchCssOverrides;
	seekMarginLeft?: number;
	seekMarginRight?: number;
	markerLayers?: MarkerLayerConfig[];
}

export interface TrackSwitchWaveformViewConfig {
	type: "waveform";
	tracks?: TrackId[] | "audible";
	height?: number;
	waveformBarWidth?: number;
	maxZoom?: number;
	defaultZoom?: number;
	playbackFollowMode?: WaveformPlaybackFollowMode;
	timeAxis?: WaveformTimeAxis;
	timer?: boolean;
	alignedPlayhead?: boolean;
	markerLayers?: MarkerLayerConfig[];
	css?: TrackSwitchCssOverrides;
}

/**
 * A pitch as configuration writes it: a MIDI note number, or a name in
 * scientific pitch notation such as `"C4"`, `"F#3"` or `"Bb-1"`, where middle C
 * is C4 = 60.
 */
type MidiNoteRef = string | number;

/** The pitch axis of a piano roll: derived from the file, or fixed to a range. */
export type MidiNoteRange = "automatic" | [MidiNoteRef, MidiNoteRef];

/**
 * Where a piano roll's legend is drawn, or `"none"` to leave it off. Only
 * `"top-right"` is implemented today; the type is a union so more positions
 * can be added later without a breaking change.
 */
export type PianoRollLegendPosition = "none" | "top-right";

export interface TrackSwitchPianoRollViewConfig {
	type: "pianoRoll";
	mediaID: MediaId;
	height?: number;
	maxZoom?: number;
	defaultZoom?: number;
	/** Ignored while `pianoKeyboard` is on — see there for what takes over. */
	playbackFollowMode?: WaveformPlaybackFollowMode;
	timer?: boolean;
	/**
	 * Draws a piano keyboard beside the pitch axis and pins the playhead to its
	 * edge, so the notes fly into the keys and the key of every sounding note
	 * lights up in the colour of its channel. Defaults to `false`.
	 *
	 * Also switches the roll to a pinned-left follow mode that holds the
	 * playhead against the keys and scrolls the notes underneath it instead of
	 * whatever `playbackFollowMode` says, and changes the note grid's drag
	 * gesture: dragging pans the sheet directly under the pointer, panning
	 * playback position along with it, rather than jumping to the clicked spot.
	 */
	pianoKeyboard?: boolean;
	/**
	 * The pitch axis of the roll. `"automatic"` (the default) spans every note of
	 * the file with two semitones of padding on each side; a pair fixes it.
	 */
	noteRange?: MidiNoteRange;
	/**
	 * Draws reference lines behind the note events. `"time"` draws vertical lines
	 * at a round interval of the unit this view's medium declares its timeline in;
	 * `"pitch"` bands the rows of the black keys; `"both"` draws both. Defaults to
	 * `"none"`. A pitch grid needs a few pixels per semitone to read, and is left
	 * out on a roll too short for its note range.
	 */
	grid?: "none" | "time" | "pitch" | "both";
	/**
	 * Shows a readout of the note event under the cursor: its pitch, channel,
	 * start, end, duration and velocity. Defaults to `false`. When
	 * `channelToLabelMap` names the hovered note's channel, its label is shown
	 * in place of the plain channel number.
	 */
	noteTooltip?: boolean;
	/**
	 * Labels MIDI channels, keyed by channel number (e.g. `{ "1": "Piano" }`).
	 * Shown on note hover when `noteTooltip` is on, and in the legend when
	 * `legend` is not `"none"`. A channel with no entry falls back to its plain
	 * number.
	 */
	channelToLabelMap?: Record<string, string>;
	/**
	 * Draws a legend naming every channel `channelToLabelMap` labels, each entry
	 * paired with the channel's colour, at the given position. Defaults to
	 * `"none"`.
	 */
	legend?: PianoRollLegendPosition;
	/** Draws a bar inside each note event showing its velocity. Defaults to `false`. */
	velocityBars?: boolean;
	/** Fades note events by their velocity rather than drawing them solid. Defaults to `false`. */
	velocityOpacity?: boolean;
	/**
	 * Pairs MIDI channels with audio tracks, keyed by channel number. A paired
	 * channel is drawn while any of its tracks is audible — naming every track
	 * of a `comparisonGroup` keeps the channel visible as the selection moves between
	 * them. Two channels may name the same track; the track's row then splits
	 * its colour across both.
	 */
	channelToTrackIDMap?: Record<string, TrackId | TrackId[]>;
	/**
	 * Gives every channel in the file its own palette colour, independently of
	 * `channelToTrackIDMap`. Defaults to `true`. With this off, every channel
	 * draws in the plain, unpaired colour regardless of the map.
	 */
	colorPerChannel?: boolean;
	/**
	 * The channel colour set and background this view draws with. `"dark"`
	 * variants pair a dark surface with channel colours re-tuned for it;
	 * `"colorblind-*"` variants use a colorblind-friendly hue set instead of
	 * the default one. Defaults to `"light"`. Individual channels or the
	 * background can still be overridden with `css`.
	 */
	palette?: "light" | "dark" | "colorblind-light" | "colorblind-dark";
	markerLayers?: MarkerLayerConfig[];
	css?: TrackSwitchCssOverrides;
}

export interface TrackSwitchSheetMusicViewConfig {
	type: "sheetMusic";
	mediaID: MediaId;
	maxWidth?: number;
	maxHeight?: number;
	renderScale?: number;
	followPlayback?: boolean;
	css?: TrackSwitchCssOverrides;
	cursorColor?: string;
	cursorAlpha?: number;
}

export interface TrackSwitchWarpingMatrixViewConfig {
	type: "warpingMatrix";
	x: TrackId;
	y: TrackId;
	css?: TrackSwitchCssOverrides;
	height?: number;
	tempoSmoothingSeconds?: number;
}

export interface TrackSwitchTextViewConfig {
	type: "text";
	text: string;
	bold?: boolean;
	italic?: boolean;
	fontSize?: number;
	align?: TrackSwitchTextAlign;
	css?: TrackSwitchCssOverrides;
}

/** A horizontal rule between panels. Replaces the hairline the stack draws on its own. */
export interface TrackSwitchSeparatorViewConfig {
	type: "separator";
	thickness?: number;
}

export interface TrackSwitchTrackListViewConfig {
	type: "trackList";
	tracks: TrackId[];
	/** Labels the list. Alignment shows it on the row that selects the list as a whole. */
	title?: string;
	/**
	 * Names the selection this list belongs to, which permits only one audible
	 * track at a time — its rows behave as radio buttons. Lists that name the same
	 * number share that one selection, so picking a track in one of them
	 * deselects whatever the others had. Any non-negative integer works; distinct
	 * numbers are independent selections.
	 *
	 * Omit it to let the list's tracks sound together, each row an ordinary toggle.
	 *
	 * Under alignment it decides which level of the selection hierarchy the list
	 * contributes: with a `comparisonGroup` every row is a selectable timeline of its own,
	 * without one the list is a single selectable timeline whose rows mix freely
	 * inside it — which requires all of its tracks to share one alignment timeline.
	 * Alignment plays one timeline at a time across the whole player, so an aligned
	 * player has at most one `comparisonGroup` to share.
	 */
	comparisonGroup?: number;
	rowHeight?: number;
	trackVolumeControls?: boolean;
	trackPanControls?: TrackPanControl;
	/**
	 * Repeats a track's piano-roll channel colour(s) on its `solo` icon.
	 * Defaults to `true`. Set to `false` to keep every row's icon in the plain
	 * foreground colour regardless of channel pairing.
	 */
	channelColorIcons?: boolean;
}

export type TrackSwitchNavigationBarControl =
	| "playback"
	| "globalVolume"
	| "globalPan"
	| "markerNavigation"
	| "markerEditing"
	| "looping"
	| "sync"
	| "presets"
	| "timer"
	| "seekBar"
	| "fullscreen-control";

export interface TrackSwitchNavigationBarViewConfig {
	type: "navigationBar";
	controls: TrackSwitchNavigationBarControl[];
	repeatEnabled?: boolean;
	/** Pan algorithm for the global pan control shown when `controls` includes `"globalPan"`. */
	globalPanControl?: TrackPanAlgorithm;
}

export type TrackSwitchViewConfig =
	| TrackSwitchImageViewConfig
	| TrackSwitchPerTrackImageViewConfig
	| TrackSwitchWaveformViewConfig
	| TrackSwitchPianoRollViewConfig
	| TrackSwitchSheetMusicViewConfig
	| TrackSwitchWarpingMatrixViewConfig
	| TrackSwitchTextViewConfig
	| TrackSwitchSeparatorViewConfig
	| TrackSwitchTrackListViewConfig
	| TrackSwitchNavigationBarViewConfig;

export interface TrackSwitchFeatures {
	muteOtherPlayerInstances: boolean;
	customizablePanelOrder: boolean;
	tabView: boolean;
	keyboard: boolean;
	/** Normalizes each track to -14 LUFS integrated loudness at load time. */
	normalizeLoudness: boolean;
	/**
	 * Decodes and renders the waveforms as soon as the player is constructed,
	 * instead of waiting for the first click or keypress. This does not start
	 * playback, so it doesn't need a user gesture — browsers only gate actually
	 * producing sound, not decoding audio buffers.
	 */
	autoload: boolean;
}

export interface TrackSwitchInit {
	/**
	 * URL of the published JSON Schema. Ignored by the player; editors read it to
	 * offer completion and validation while a config file is being written.
	 */
	$schema?: string;
	media: MediaConfig;
	alignment?: AlignmentConfig;
	markers?: MarkersConfig;
	presets?: PresetsConfig;
	views: TrackSwitchViewConfig[];
	features?: Partial<TrackSwitchFeatures>;
	/** Theming overrides for the whole player. */
	css?: TrackSwitchCssOverrides;
}

// ═══════════ resolved / runtime ═══════════

/** One `trackList` view, resolved to the track ids it lists (row index = declaration order among trackList views). */
export interface TrackListGroup {
	groupIndex: number;
	trackIds: TrackId[];
	title?: string;
	/** The selection this list shares with every other list of the same number, or null when its tracks mix freely. */
	comparisonGroup: number | null;
	/** Derived from `comparisonGroup`: a list that belongs to a selection lets one of its tracks sound. */
	exclusiveSolo: boolean;
	rowHeight?: number;
	trackVolumeControls: boolean;
	trackPanControls: TrackPanControl;
	channelColorIcons: boolean;
}

export interface TrackDefinition {
	id: TrackId;
	title?: string;
	/** Id of the `image` media entry shown while this track is soloed. */
	imageID?: MediaId;
	css?: TrackSwitchCssOverrides;
	solo?: boolean;
	volume?: number;
	pan?: number;
	volumeControl?: boolean;
	panControl?: TrackPanControl;
	sources: TrackSourceDefinition[];
	syncedSources?: TrackSourceDefinition[];
}

/**
 * Structurally validated config, ids cross-checked. Alignment/marker CSVs are not
 * fetched here — that happens asynchronously during controller.load(), same as today.
 */
export interface NormalizedTrackSwitchConfig {
	tracks: TrackDefinition[];
	media: MediaConfig;
	alignment?: AlignmentConfig;
	markers: MarkersConfig;
	presets: PresetsConfig;
	/** Fully resolved: defaults merged and the alignment implications applied. */
	features: TrackSwitchFeatures;
	views: TrackSwitchViewConfig[];
	css?: TrackSwitchCssOverrides;
}

export interface TrackTiming {
	trimStart: number;
	padStart: number;
	audioDuration: number;
	effectiveDuration: number;
}

type AudioDownloadSizeStatus =
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
	/**
	 * The rate stored in the encoded file, read from its container header. The
	 * decoded `buffer` always reports the AudioContext's rate instead, so this is
	 * what a `samples` alignment column has to be converted with.
	 */
	sourceSampleRate: number | null;
	waveformSummary: WaveformSummary | null;
	/** Linear gain applied to reach `features.normalizeLoudness`'s target; 1 when disabled. */
	loudnessGain: number;
}

export interface TrackRuntime {
	definition: TrackDefinition;
	state: TrackState;
	panAlgorithm: TrackPanAlgorithm;
	gainNode: GainNode | null;
	pannerNode: StereoPannerNode | null;
	panUpmixNode: GainNode | null;
	panSplitterNode: ChannelSplitterNode | null;
	panGainLeftNode: GainNode | null;
	panGainRightNode: GainNode | null;
	panMergerNode: ChannelMergerNode | null;
	buffer: AudioBuffer | null;
	timing: TrackTiming | null;
	/** Mirrors the active variant's `TrackLoadedSource.sourceSampleRate`. */
	sourceSampleRate: number | null;
	/** Mirrors the active variant's `TrackLoadedSource.loudnessGain`. */
	loudnessGain: number;
	activeSource: AudioBufferSourceNode | null;
	sourceIndex: number;
	activeVariant: TrackSourceVariant;
	baseSource: TrackLoadedSource;
	syncedSource: TrackLoadedSource | null;
	successful: boolean;
	errored: boolean;
	waveformSummary: WaveformSummary | null;
}

interface LoopState {
	pointA: number | null;
	pointB: number | null;
	enabled: boolean;
}

/**
 * Where playback stands at full resolution: a value on the timeline the
 * position was established on — the lead track's own clock, or the surface a
 * seek landed on. The reference position derived from it is a lossy summary
 * wherever the alignment holds one reference value across a stretch of that
 * timeline (a recording sounding on past the last measure of a score), so
 * surfaces project from the anchor and fall back to the reference without one.
 */
export interface PlaybackOrigin {
	timeline: TimelineId;
	value: number;
}

export interface PlayerState {
	playing: boolean;
	repeat: boolean;
	position: number;
	/** Null whenever the position was set in reference coordinates alone. */
	positionOrigin: PlaybackOrigin | null;
	startTime: number;
	currentlySeeking: boolean;
	loop: LoopState;
	volume: number;
	pan: number;
}

export type TrackSwitchEventName =
	| "loaded"
	| "error"
	| "position"
	| "trackState"
	| "markers";

export interface TrackSwitchEventMap {
	loaded: { longestDuration: number };
	error: { message: string };
	position: { position: number; duration: number };
	trackState: { index: number; state: TrackState };
	/** A marker sequence was edited; `getMarkersCsv` returns its current content. */
	markers: { sequenceId: string };
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
	setPan(panMinusOneToOne: number): void;
	setTrackVolume(trackIndex: number, volumeZeroToOne: number): void;
	setTrackPan(trackIndex: number, panMinusOneToOne: number): void;
	setLoopPoint(marker: LoopMarker): boolean;
	toggleLoop(): boolean;
	clearLoop(): void;
	/**
	 * Adds a marker to a sequence and returns its id. `position` is read in the
	 * unit of the sequence's timeline, exactly like the sequence's CSV. Ids number
	 * the markers of a sequence in timeline order, so an edit can renumber them.
	 */
	addMarker(sequenceId: string, position: number, label?: string): string;
	/** Moves and/or relabels a marker and returns the id it has afterwards. */
	updateMarker(
		sequenceId: string,
		markerId: string,
		changes: { position?: number; label?: string },
	): string;
	removeMarker(sequenceId: string, markerId: string): void;
	/** The sequence as CSV text, in the column layout of the file it was read from. */
	getMarkersCsv(sequenceId: string): string;
	/** `groupIndex` picks which trackList the toggle acts within; defaults to the track's first list. */
	toggleSolo(
		trackIndex: number,
		exclusive?: boolean,
		groupIndex?: number,
	): void;
	applyPreset(presetId: PresetId): void;
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

export interface MeasureMapPoint {
	start: number;
	measure: number;
}
