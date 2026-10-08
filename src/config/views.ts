import {
	MAX_MIDI_NOTE,
	MIN_MIDI_NOTE,
	parseMidiNoteRef,
} from "../shared/midi-notes";
import type {
	MarkerLayerConfig,
	MediaConfig,
	MidiNoteRange,
	TrackId,
	TrackPanAlgorithm,
	TrackPanControl,
	TrackSwitchImageViewConfig,
	TrackSwitchNavigationBarControl,
	TrackSwitchNavigationBarViewConfig,
	TrackSwitchPerTrackImageViewConfig,
	TrackSwitchPianoRollViewConfig,
	TrackSwitchSeparatorViewConfig,
	TrackSwitchSheetMusicViewConfig,
	TrackSwitchTextViewConfig,
	TrackSwitchTrackListViewConfig,
	TrackSwitchViewConfig,
	TrackSwitchWarpingMatrixViewConfig,
	TrackSwitchWaveformViewConfig,
	WaveformPlaybackFollowMode,
	WaveformSourceIndex,
	WaveformTimeAxis,
} from "../types";
import {
	assertAllowedKeys,
	keysOf,
	normalizeCssOverrides,
	normalizeEnum,
	normalizeNumberInRange,
	normalizeOptionalBoolean,
	normalizePositiveFiniteNumber,
	normalizePositiveInteger,
	toConfigRecord,
} from "./config";

/** Thick enough to read as a deliberate divider next to the 1px hairline between panels. */
const DEFAULT_SEPARATOR_THICKNESS = 2;

const uiImageAllowedKeys = keysOf<TrackSwitchImageViewConfig>()([
	"type",
	"mediaID",
	"seekable",
	"css",
	"seekMarginLeft",
	"seekMarginRight",
	"markerLayers",
] as const);
const uiPerTrackImageAllowedKeys = keysOf<TrackSwitchPerTrackImageViewConfig>()(
	[
		"type",
		"seekable",
		"css",
		"seekMarginLeft",
		"seekMarginRight",
		"markerLayers",
	] as const,
);
const uiWaveformAllowedKeys = keysOf<TrackSwitchWaveformViewConfig>()([
	"type",
	"tracks",
	"height",
	"waveformBarWidth",
	"maxZoom",
	"defaultZoom",
	"playbackFollowMode",
	"timeAxis",
	"timer",
	"alignedPlayhead",
	"markerLayers",
	"css",
] as const);
const uiPianoRollAllowedKeys = keysOf<TrackSwitchPianoRollViewConfig>()([
	"type",
	"mediaID",
	"height",
	"maxZoom",
	"defaultZoom",
	"playbackFollowMode",
	"timer",
	"pianoKeyboard",
	"noteRange",
	"grid",
	"noteTooltip",
	"channelToLabelMap",
	"legend",
	"velocityBars",
	"velocityOpacity",
	"channelToTrackIDMap",
	"colorPerChannel",
	"palette",
	"markerLayers",
	"css",
] as const);
const uiTrackListAllowedKeys = keysOf<TrackSwitchTrackListViewConfig>()([
	"type",
	"tracks",
	"title",
	"comparisonGroup",
	"rowHeight",
	"trackVolumeControls",
	"trackPanControls",
	"channelColorIcons",
] as const);
const uiNavigationBarAllowedKeys = keysOf<TrackSwitchNavigationBarViewConfig>()(
	["type", "controls", "repeatEnabled", "globalPanControl"] as const,
);
const uiSheetMusicAllowedKeys = keysOf<TrackSwitchSheetMusicViewConfig>()([
	"type",
	"mediaID",
	"maxWidth",
	"maxHeight",
	"renderScale",
	"followPlayback",
	"css",
	"cursorColor",
	"cursorAlpha",
] as const);
const uiWarpingMatrixAllowedKeys = keysOf<TrackSwitchWarpingMatrixViewConfig>()(
	["type", "x", "y", "css", "height", "tempoSmoothingSeconds"] as const,
);
const uiTextAllowedKeys = keysOf<TrackSwitchTextViewConfig>()([
	"type",
	"text",
	"bold",
	"italic",
	"fontSize",
	"align",
	"css",
] as const);
const uiSeparatorAllowedKeys = keysOf<TrackSwitchSeparatorViewConfig>()([
	"type",
	"thickness",
] as const);
const markerLayerAllowedKeys = keysOf<MarkerLayerConfig>()([
	"sequence",
	"color",
	"line",
	"lineWidth",
	"opacity",
	"foldToReference",
] as const);

const uiAllowedKeysByType: Record<string, readonly string[]> = {
	image: uiImageAllowedKeys,
	perTrackImage: uiPerTrackImageAllowedKeys,
	waveform: uiWaveformAllowedKeys,
	pianoRoll: uiPianoRollAllowedKeys,
	trackList: uiTrackListAllowedKeys,
	navigationBar: uiNavigationBarAllowedKeys,
	sheetMusic: uiSheetMusicAllowedKeys,
	warpingMatrix: uiWarpingMatrixAllowedKeys,
	text: uiTextAllowedKeys,
	separator: uiSeparatorAllowedKeys,
};

/** Everything a view needs to resolve id references against the data half of the config. */
export interface ViewNormalizeContext {
	media: MediaConfig;
	trackIds: TrackId[];
	markerSequenceIds: ReadonlySet<string>;
	hasAlignment: boolean;
	alignmentTimelines: ReadonlySet<string>;
}

/** Canvas dimensions are whole pixels; `undefined` takes the view's default. */
function toCanvasSize(
	value: number | undefined,
	fallback: number,
	label: string,
): number {
	if (value === undefined) {
		return fallback;
	}

	if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
		throw new Error(
			`Invalid ${label} configuration: must be a finite number of at least 1 pixel.`,
		);
	}

	return Math.round(value);
}

function normalizeWaveformBarWidth(value: number | undefined): number {
	if (value === undefined) {
		return 1;
	}

	if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
		throw new Error(
			"Invalid waveform configuration: waveformBarWidth must be a finite number of at least 1.",
		);
	}

	return Math.floor(value);
}

/** `0` lifts the zoom limit entirely; anything negative is a mistake. */
function normalizeWaveformMaxZoom(value: unknown, label: string): number {
	if (value === undefined) {
		return 5;
	}

	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new Error(
			`Invalid ${label} configuration: maxZoom must be a finite number of seconds, ` +
				"0 or greater (0 lifts the zoom limit).",
		);
	}

	return value;
}

/**
 * The visible span a surface opens on, in the unit its medium declares. Unset
 * leaves the surface unzoomed, showing the whole medium.
 */
function normalizeDefaultZoom(
	value: unknown,
	label: string,
): number | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new Error(
			`Invalid ${label} configuration: defaultZoom must be a finite number ` +
				"greater than 0, in the unit of the medium the view draws.",
		);
	}

	return value;
}

function normalizePlaybackFollowMode(
	value: unknown,
	label: string,
	fallback: WaveformPlaybackFollowMode = "center",
): WaveformPlaybackFollowMode {
	return normalizeEnum(
		value,
		["off", "center", "jump"] as const,
		`${label}.playbackFollowMode`,
		fallback,
	);
}

function normalizeWaveformTimeAxis(
	value: unknown,
	defaultsToIndividual: boolean,
): WaveformTimeAxis {
	return normalizeEnum(
		value,
		["shared", "individual"] as const,
		"waveform.timeAxis",
		defaultsToIndividual ? "individual" : "shared",
	);
}

function normalizeSeekMargin(
	value: number | undefined,
	label: string,
): number | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value < 0 ||
		value >= 100
	) {
		throw new Error(
			`Invalid ${label} configuration: must be a percentage from 0 up to but not including 100.`,
		);
	}

	return value;
}

function normalizeSeekMargins<
	TView extends { seekMarginLeft?: number; seekMarginRight?: number },
>(config: TView, label: string): TView {
	const left = normalizeSeekMargin(
		config.seekMarginLeft,
		`${label}.seekMarginLeft`,
	);
	const right = normalizeSeekMargin(
		config.seekMarginRight,
		`${label}.seekMarginRight`,
	);

	if ((left ?? 0) + (right ?? 0) >= 100) {
		throw new Error(
			"Invalid " +
				label +
				" configuration: seekMarginLeft + seekMarginRight must be less than 100.",
		);
	}

	return { ...config, seekMarginLeft: left, seekMarginRight: right };
}

function isValidCssColor(color: string): boolean {
	return typeof CSS !== "undefined" ? CSS.supports("color", color) : true;
}

function normalizeMarkerLayers(
	layers: MarkerLayerConfig[] | undefined,
	label: string,
	ctx: ViewNormalizeContext,
): MarkerLayerConfig[] | undefined {
	if (layers === undefined) {
		return undefined;
	}

	if (!Array.isArray(layers)) {
		throw new Error(
			`Invalid ${label} configuration: markerLayers must be an array.`,
		);
	}

	return layers.map((layer) => {
		const record = toConfigRecord(layer, `${label}.markerLayers`);
		assertAllowedKeys(record, markerLayerAllowedKeys, `${label}.markerLayers`);

		if (
			typeof layer.sequence !== "string" ||
			layer.sequence.trim().length === 0
		) {
			throw new Error(
				`Invalid ${label}.markerLayers configuration: sequence must name a marker sequence id.`,
			);
		}

		const isAnchorSequence = layer.sequence === "alignment";
		if (isAnchorSequence && !ctx.hasAlignment) {
			throw new Error(
				`Invalid ${label}.markerLayers configuration: no alignment block is configured, ` +
					'so the implicit "alignment" marker sequence does not exist.',
			);
		}
		if (!isAnchorSequence && !ctx.markerSequenceIds.has(layer.sequence)) {
			throw new Error(
				`Invalid ${label}.markerLayers configuration: unknown marker sequence "${layer.sequence}".`,
			);
		}

		if (layer.color !== undefined) {
			if (typeof layer.color !== "string" || !isValidCssColor(layer.color)) {
				throw new Error(
					`Invalid ${label}.markerLayers configuration: color is not a valid CSS color.`,
				);
			}
		}

		return {
			sequence: layer.sequence,
			color: layer.color,
			line: normalizeEnum(
				layer.line,
				["solid", "dashed"] as const,
				`${label}.markerLayers.line`,
				"dashed",
			),
			lineWidth:
				normalizePositiveFiniteNumber(
					layer.lineWidth,
					`${label}.markerLayers.lineWidth`,
				) ?? 1,
			opacity:
				layer.opacity === undefined
					? undefined
					: normalizeNumberInRange(
							layer.opacity,
							0,
							1,
							`${label}.markerLayers.opacity`,
							1,
						),
			foldToReference:
				normalizeOptionalBoolean(
					layer.foldToReference,
					`${label}.markerLayers.foldToReference`,
				) ?? false,
		};
	});
}

function resolveTrackIndex(
	ctx: ViewNormalizeContext,
	trackId: TrackId,
): number {
	return ctx.trackIds.indexOf(trackId);
}

function resolveWaveformTracksIndex(
	tracks: TrackId[] | "audible" | undefined,
	ctx: ViewNormalizeContext,
	label: string,
): WaveformSourceIndex {
	if (tracks === undefined || tracks === "audible") {
		if (ctx.hasAlignment && tracks === undefined) {
			throw new Error(
				`Invalid ${label} configuration: tracks is required (naming exactly one track, ` +
					"or 'audible' to follow whichever track is soloed) when an alignment block is configured.",
			);
		}
		return "audible";
	}

	if (!Array.isArray(tracks) || tracks.length === 0) {
		throw new Error(
			`Invalid ${label} configuration: tracks must be 'audible' or a non-empty array of track ids.`,
		);
	}

	if (ctx.hasAlignment && tracks.length > 1) {
		throw new Error(
			`Invalid ${label} configuration: tracks may name only one track when an alignment ` +
				"block is configured — overlaying multiple waveforms is only coherent when they share a timeline.",
		);
	}

	const indices = tracks.map((trackId) => {
		const index = resolveTrackIndex(ctx, trackId);
		if (index < 0) {
			throw new Error(
				`Invalid ${label} configuration: tracks references unknown track id "${trackId}".`,
			);
		}
		return index;
	});

	return indices.length === 1 ? indices[0] : indices;
}

function normalizeImageConfig(
	image: TrackSwitchImageViewConfig,
	ctx: ViewNormalizeContext,
): TrackSwitchImageViewConfig {
	if (typeof image.mediaID !== "string" || image.mediaID.trim().length === 0) {
		throw new Error(
			'Invalid image configuration: mediaID must name a media entry of type "image".',
		);
	}

	const entry = ctx.media[image.mediaID];
	if (entry?.type !== "image") {
		throw new Error(
			`Invalid image configuration: mediaID "${image.mediaID}" must name a media entry of type "image".`,
		);
	}

	return normalizeSeekMargins(
		{
			...image,
			seekable: normalizeOptionalBoolean(image.seekable, "image.seekable"),
			markerLayers: normalizeMarkerLayers(image.markerLayers, "image", ctx),
			css: normalizeCssOverrides(image.css, "image"),
		},
		"image",
	);
}

function normalizePerTrackImageConfig(
	image: TrackSwitchPerTrackImageViewConfig,
	ctx: ViewNormalizeContext,
): TrackSwitchPerTrackImageViewConfig {
	return normalizeSeekMargins(
		{
			...image,
			seekable: normalizeOptionalBoolean(
				image.seekable,
				"perTrackImage.seekable",
			),
			markerLayers: normalizeMarkerLayers(
				image.markerLayers,
				"perTrackImage",
				ctx,
			),
			css: normalizeCssOverrides(image.css, "perTrackImage"),
		},
		"perTrackImage",
	);
}

function normalizeWaveformConfig(
	waveform: TrackSwitchWaveformViewConfig,
	ctx: ViewNormalizeContext,
): TrackSwitchWaveformViewConfig {
	const waveformSource = resolveWaveformTracksIndex(
		waveform.tracks,
		ctx,
		"waveform",
	);
	// An "audible" source under alignment always resolves to exactly one
	// currently-soloed track (alignment forces exclusive solo) and renders it
	// like a fixed single-track waveform — so it defaults to the same
	// own-duration reading a fixed source would use.
	const defaultsToIndividualTimeAxis =
		ctx.hasAlignment && waveformSource === "audible";

	const normalized: TrackSwitchWaveformViewConfig = {
		...waveform,
		height: toCanvasSize(waveform.height, 150, "waveform.height"),
		waveformBarWidth: normalizeWaveformBarWidth(waveform.waveformBarWidth),
		maxZoom: normalizeWaveformMaxZoom(waveform.maxZoom, "waveform"),
		defaultZoom: normalizeDefaultZoom(waveform.defaultZoom, "waveform"),
		playbackFollowMode: normalizePlaybackFollowMode(
			waveform.playbackFollowMode,
			"waveform",
		),
		timeAxis: normalizeWaveformTimeAxis(
			waveform.timeAxis,
			defaultsToIndividualTimeAxis,
		),
		timer: normalizeOptionalBoolean(waveform.timer, "waveform.timer"),
		alignedPlayhead: normalizeOptionalBoolean(
			waveform.alignedPlayhead,
			"waveform.alignedPlayhead",
		),
		markerLayers: normalizeMarkerLayers(waveform.markerLayers, "waveform", ctx),
		css: normalizeCssOverrides(waveform.css, "waveform"),
	};

	if (normalized.timeAxis === "individual") {
		if (!ctx.hasAlignment) {
			throw new Error(
				"Invalid waveform configuration: timeAxis 'individual' requires an alignment block.",
			);
		}
		if (typeof waveformSource !== "number" && waveformSource !== "audible") {
			throw new Error(
				"Invalid waveform configuration: timeAxis 'individual' requires exactly one source track.",
			);
		}
	}
	return normalized;
}

/** The 16 channels of the MIDI specification, numbered as the files number them. */
const MAX_MIDI_CHANNEL = 15;

/**
 * The channel-to-track pairing of a piano roll. Two channels may name the same
 * track — one recording can carry two staves — so the values are not required
 * to be distinct. A channel may also name several tracks (e.g. every track of
 * a `comparisonGroup`), in which case it stays visible while any one of them is
 * audible.
 */
function normalizeChannelToTrackIDMap(
	value: Record<string, TrackId | TrackId[]> | undefined,
	ctx: ViewNormalizeContext,
): Record<string, TrackId[]> | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(
			"Invalid pianoRoll configuration: channelToTrackIDMap must be an object keyed by channel number.",
		);
	}

	const normalized: Record<string, TrackId[]> = {};
	for (const [key, rawTrackIds] of Object.entries(value)) {
		const channel = Number(key);
		if (
			!Number.isInteger(channel) ||
			channel < 0 ||
			channel > MAX_MIDI_CHANNEL
		) {
			throw new Error(
				`Invalid pianoRoll configuration: channel "${key}" must be an integer between 0 and ${MAX_MIDI_CHANNEL}.`,
			);
		}

		const trackIds = Array.isArray(rawTrackIds) ? rawTrackIds : [rawTrackIds];
		if (trackIds.length === 0) {
			throw new Error(
				`Invalid pianoRoll configuration: channel "${key}" must name at least one track.`,
			);
		}

		for (const trackId of trackIds) {
			if (typeof trackId !== "string" || ctx.media[trackId]?.type !== "audio") {
				throw new Error(
					`Invalid pianoRoll configuration: channel "${key}" names "${trackId}", which is not declared as type "audio" in media.`,
				);
			}
		}

		normalized[String(channel)] = trackIds;
	}

	return normalized;
}

/** Labels MIDI channels for the note tooltip and the legend. */
function normalizeChannelToLabelMap(
	value: Record<string, string> | undefined,
): Record<string, string> | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(
			"Invalid pianoRoll configuration: channelToLabelMap must be an object keyed by channel number.",
		);
	}

	const normalized: Record<string, string> = {};
	for (const [key, label] of Object.entries(value)) {
		const channel = Number(key);
		if (
			!Number.isInteger(channel) ||
			channel < 0 ||
			channel > MAX_MIDI_CHANNEL
		) {
			throw new Error(
				`Invalid pianoRoll configuration: channel "${key}" must be an integer between 0 and ${MAX_MIDI_CHANNEL}.`,
			);
		}

		if (typeof label !== "string" || label.trim().length === 0) {
			throw new Error(
				`Invalid pianoRoll configuration: channelToLabelMap["${key}"] must be a non-empty string.`,
			);
		}

		normalized[String(channel)] = label;
	}

	return normalized;
}

/**
 * The pitch axis of a roll. Kept as the pair the author wrote when it is one,
 * but resolved to note numbers here so the renderer never parses a name — and
 * so a typo is reported next to the property it came from.
 */
function normalizeNoteRange(value: unknown): MidiNoteRange {
	if (value === undefined || value === "automatic") {
		return "automatic";
	}

	if (!Array.isArray(value) || value.length !== 2) {
		throw new Error(
			'Invalid pianoRoll configuration: noteRange must be "automatic" or a pair ' +
				'of notes, e.g. ["C1", "C4"] or [24, 60].',
		);
	}

	const [low, high] = value.map((entry) => {
		const midi = parseMidiNoteRef(entry);
		if (midi === null) {
			throw new Error(
				`Invalid pianoRoll configuration: noteRange entry ${JSON.stringify(entry)} ` +
					`is neither a note number between ${MIN_MIDI_NOTE} and ${MAX_MIDI_NOTE} ` +
					'nor a note name such as "C4".',
			);
		}
		return midi;
	});

	if (low === high) {
		throw new Error(
			"Invalid pianoRoll configuration: noteRange must span more than one note.",
		);
	}

	return low < high ? [low, high] : [high, low];
}

function normalizePianoRollConfig(
	pianoRoll: TrackSwitchPianoRollViewConfig,
	ctx: ViewNormalizeContext,
): TrackSwitchPianoRollViewConfig {
	if (
		typeof pianoRoll.mediaID !== "string" ||
		pianoRoll.mediaID.trim().length === 0
	) {
		throw new Error(
			"Invalid pianoRoll configuration: mediaID must be a non-empty string.",
		);
	}
	const entry = ctx.media[pianoRoll.mediaID];
	if (entry?.type !== "midi") {
		throw new Error(
			`Invalid pianoRoll configuration: mediaID "${pianoRoll.mediaID}" is not declared as type "midi" in media.`,
		);
	}

	// A keyboard turns the roll into a falling-notes display: the playhead sits
	// on the keys and the notes scroll into them. Its `defaultZoom` fallback is
	// left to the renderer, which states it in seconds rather than in whatever
	// unit this view's medium declares.
	const pianoKeyboard =
		normalizeOptionalBoolean(
			pianoRoll.pianoKeyboard,
			"pianoRoll.pianoKeyboard",
		) ?? false;

	return {
		...pianoRoll,
		height: toCanvasSize(pianoRoll.height, 180, "pianoRoll.height"),
		maxZoom: normalizeWaveformMaxZoom(pianoRoll.maxZoom, "pianoRoll"),
		defaultZoom: normalizeDefaultZoom(pianoRoll.defaultZoom, "pianoRoll"),
		// A keyboard forces its own pinned-left follow instead — see
		// PianoRollSeekSurfaceMetadata.playbackFollowMode.
		playbackFollowMode: normalizePlaybackFollowMode(
			pianoRoll.playbackFollowMode,
			"pianoRoll",
		),
		timer: normalizeOptionalBoolean(pianoRoll.timer, "pianoRoll.timer"),
		pianoKeyboard,
		noteRange: normalizeNoteRange(pianoRoll.noteRange),
		grid: normalizeEnum(
			pianoRoll.grid,
			["none", "time", "pitch", "both"] as const,
			"pianoRoll.grid",
			"none",
		),
		noteTooltip:
			normalizeOptionalBoolean(
				pianoRoll.noteTooltip,
				"pianoRoll.noteTooltip",
			) ?? false,
		channelToLabelMap: normalizeChannelToLabelMap(pianoRoll.channelToLabelMap),
		legend: normalizeEnum(
			pianoRoll.legend,
			["none", "top-right"] as const,
			"pianoRoll.legend",
			"none",
		),
		velocityBars:
			normalizeOptionalBoolean(
				pianoRoll.velocityBars,
				"pianoRoll.velocityBars",
			) ?? false,
		velocityOpacity:
			normalizeOptionalBoolean(
				pianoRoll.velocityOpacity,
				"pianoRoll.velocityOpacity",
			) ?? false,
		channelToTrackIDMap: normalizeChannelToTrackIDMap(
			pianoRoll.channelToTrackIDMap,
			ctx,
		),
		colorPerChannel: normalizeOptionalBoolean(
			pianoRoll.colorPerChannel,
			"pianoRoll.colorPerChannel",
		),
		palette: normalizeEnum(
			pianoRoll.palette,
			["light", "dark", "colorblind-light", "colorblind-dark"] as const,
			"pianoRoll.palette",
			"light",
		),
		markerLayers: normalizeMarkerLayers(
			pianoRoll.markerLayers,
			"pianoRoll",
			ctx,
		),
		css: normalizeCssOverrides(pianoRoll.css, "pianoRoll"),
	};
}

function normalizeSheetMusicConfig(
	sheetmusic: TrackSwitchSheetMusicViewConfig,
	ctx: ViewNormalizeContext,
): TrackSwitchSheetMusicViewConfig {
	if (
		typeof sheetmusic.mediaID !== "string" ||
		sheetmusic.mediaID.trim().length === 0
	) {
		throw new Error(
			"Invalid sheetMusic configuration: mediaID must be a non-empty string.",
		);
	}
	const entry = ctx.media[sheetmusic.mediaID];
	if (entry?.type !== "musicxml") {
		throw new Error(
			`Invalid sheetMusic configuration: mediaID "${sheetmusic.mediaID}" is not declared as ` +
				'type "musicxml" in media.',
		);
	}

	return {
		...sheetmusic,
		maxWidth:
			normalizePositiveInteger(sheetmusic.maxWidth, "sheetMusic.maxWidth") ??
			1000,
		maxHeight:
			normalizePositiveInteger(sheetmusic.maxHeight, "sheetMusic.maxHeight") ??
			380,
		renderScale:
			normalizePositiveFiniteNumber(
				sheetmusic.renderScale,
				"sheetMusic.renderScale",
			) ?? 0.7,
		followPlayback:
			normalizeOptionalBoolean(
				sheetmusic.followPlayback,
				"sheetMusic.followPlayback",
			) ?? true,
		cursorAlpha: normalizeNumberInRange(
			sheetmusic.cursorAlpha,
			0,
			1,
			"sheetMusic.cursorAlpha",
			0.4,
		),
		css: normalizeCssOverrides(sheetmusic.css, "sheetMusic"),
	};
}

function normalizeWarpingMatrixConfig(
	warpingMatrix: TrackSwitchWarpingMatrixViewConfig,
	ctx: ViewNormalizeContext,
): TrackSwitchWarpingMatrixViewConfig {
	if (!ctx.hasAlignment) {
		throw new Error(
			"Invalid warpingMatrix configuration: requires an alignment block.",
		);
	}
	if (resolveTrackIndex(ctx, warpingMatrix.x) < 0) {
		throw new Error(
			`Invalid warpingMatrix configuration: x references unknown track id "${warpingMatrix.x}".`,
		);
	}
	if (resolveTrackIndex(ctx, warpingMatrix.y) < 0) {
		throw new Error(
			`Invalid warpingMatrix configuration: y references unknown track id "${warpingMatrix.y}".`,
		);
	}
	if (warpingMatrix.x === warpingMatrix.y) {
		throw new Error(
			"Invalid warpingMatrix configuration: x and y must differ.",
		);
	}
	if (!ctx.alignmentTimelines.has(warpingMatrix.x)) {
		throw new Error(
			`Invalid warpingMatrix configuration: x "${warpingMatrix.x}" has no alignment timeline mapping.`,
		);
	}
	if (!ctx.alignmentTimelines.has(warpingMatrix.y)) {
		throw new Error(
			`Invalid warpingMatrix configuration: y "${warpingMatrix.y}" has no alignment timeline mapping.`,
		);
	}

	return {
		...warpingMatrix,
		height: normalizePositiveInteger(
			warpingMatrix.height,
			"warpingMatrix.height",
		),
		tempoSmoothingSeconds: normalizePositiveFiniteNumber(
			warpingMatrix.tempoSmoothingSeconds,
			"warpingMatrix.tempoSmoothingSeconds",
		),
		css: normalizeCssOverrides(warpingMatrix.css, "warpingMatrix"),
	};
}

function normalizeTextConfig(
	text: TrackSwitchTextViewConfig,
): TrackSwitchTextViewConfig {
	if (typeof text.text !== "string") {
		throw new Error("Invalid text configuration: text must be a string.");
	}

	return {
		...text,
		bold: normalizeOptionalBoolean(text.bold, "text.bold"),
		italic: normalizeOptionalBoolean(text.italic, "text.italic"),
		fontSize: normalizePositiveInteger(text.fontSize, "text.fontSize"),
		align: normalizeEnum(
			text.align,
			["left", "center", "right"] as const,
			"text.align",
			"center",
		),
		css: normalizeCssOverrides(text.css, "text"),
	};
}

function normalizeSeparatorConfig(
	separator: TrackSwitchSeparatorViewConfig,
): TrackSwitchSeparatorViewConfig {
	return {
		...separator,
		thickness:
			normalizePositiveInteger(separator.thickness, "separator.thickness") ??
			DEFAULT_SEPARATOR_THICKNESS,
	};
}

function normalizeTrackPanControls(
	value: TrackPanControl | undefined,
): TrackPanControl {
	if (value === undefined || value === "none") {
		return "none";
	}

	if (value !== "balance" && value !== "pan") {
		throw new Error(
			"Invalid trackList configuration: trackPanControls must be 'balance', 'pan', or 'none'.",
		);
	}

	return value;
}

function normalizeGlobalPanControl(
	value: TrackPanAlgorithm | undefined,
): TrackPanAlgorithm {
	if (value === undefined) {
		return "balance";
	}

	if (value !== "balance" && value !== "pan") {
		throw new Error(
			"Invalid navigationBar configuration: globalPanControl must be 'balance' or 'pan'.",
		);
	}

	return value;
}

/** A selection is named by a number, so `0` has to survive normalization. */
function normalizeSoloGroup(value: number | undefined): number | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		throw new Error(
			"Invalid trackList configuration: comparisonGroup must be a non-negative integer.",
		);
	}

	return value;
}

function normalizeTrackListConfig(
	trackList: TrackSwitchTrackListViewConfig,
	ctx: ViewNormalizeContext,
): TrackSwitchTrackListViewConfig {
	if (!Array.isArray(trackList.tracks) || trackList.tracks.length === 0) {
		throw new Error(
			"Invalid trackList configuration: tracks must be a non-empty array of track ids.",
		);
	}

	trackList.tracks.forEach((trackId) => {
		if (resolveTrackIndex(ctx, trackId) < 0) {
			throw new Error(
				`Invalid trackList configuration: references unknown track id "${trackId}".`,
			);
		}
	});

	if (trackList.title !== undefined && typeof trackList.title !== "string") {
		throw new Error("Invalid trackList configuration: title must be a string.");
	}

	return {
		...trackList,
		comparisonGroup: normalizeSoloGroup(trackList.comparisonGroup),
		rowHeight: normalizePositiveInteger(
			trackList.rowHeight,
			"trackList.rowHeight",
		),
		trackVolumeControls:
			normalizeOptionalBoolean(
				trackList.trackVolumeControls,
				"trackList.trackVolumeControls",
			) ?? false,
		trackPanControls: normalizeTrackPanControls(trackList.trackPanControls),
		channelColorIcons:
			normalizeOptionalBoolean(
				trackList.channelColorIcons,
				"trackList.channelColorIcons",
			) ?? true,
	};
}

function normalizeNavigationBarConfig(
	navigationBar: TrackSwitchNavigationBarViewConfig,
): TrackSwitchNavigationBarViewConfig {
	if (!Array.isArray(navigationBar.controls)) {
		throw new Error(
			"Invalid navigationBar configuration: controls must be an array.",
		);
	}

	const allowedControls = new Set<TrackSwitchNavigationBarControl>([
		"playback",
		"globalVolume",
		"globalPan",
		"markerNavigation",
		"markerEditing",
		"looping",
		"sync",
		"presets",
		"timer",
		"seekBar",
		"fullscreen-control",
	]);
	const seenControls = new Set<TrackSwitchNavigationBarControl>();
	const controls = navigationBar.controls.map((control) => {
		if (
			typeof control !== "string" ||
			!allowedControls.has(control as TrackSwitchNavigationBarControl)
		) {
			throw new Error(
				`Invalid navigationBar configuration: unknown control "${String(control)}".`,
			);
		}

		const normalizedControl = control as TrackSwitchNavigationBarControl;
		if (seenControls.has(normalizedControl)) {
			throw new Error(
				`Invalid navigationBar configuration: duplicate control "${normalizedControl}".`,
			);
		}
		seenControls.add(normalizedControl);
		return normalizedControl;
	});

	return {
		type: "navigationBar",
		controls,
		repeatEnabled:
			normalizeOptionalBoolean(
				navigationBar.repeatEnabled,
				"navigationBar.repeatEnabled",
			) ?? false,
		globalPanControl: normalizeGlobalPanControl(navigationBar.globalPanControl),
	};
}

export function normalizeViewConfig(
	view: TrackSwitchViewConfig,
	ctx: ViewNormalizeContext,
): TrackSwitchViewConfig {
	const viewRecord = toConfigRecord(view, "view");
	const viewType = viewRecord.type;
	if (typeof viewType !== "string") {
		throw new Error("Invalid view: missing type.");
	}

	const allowedViewKeys = uiAllowedKeysByType[viewType];
	if (!allowedViewKeys) {
		throw new Error(`Invalid view type: ${viewType}`);
	}
	assertAllowedKeys(viewRecord, allowedViewKeys, `view.${viewType}`);

	switch (view.type) {
		case "waveform":
			return normalizeWaveformConfig(view, ctx);
		case "pianoRoll":
			return normalizePianoRollConfig(view, ctx);
		case "sheetMusic":
			return normalizeSheetMusicConfig(view, ctx);
		case "warpingMatrix":
			return normalizeWarpingMatrixConfig(view, ctx);
		case "text":
			return normalizeTextConfig(view);
		case "separator":
			return normalizeSeparatorConfig(view);
		case "trackList":
			return normalizeTrackListConfig(view, ctx);
		case "navigationBar":
			return normalizeNavigationBarConfig(view);
		case "image":
			return normalizeImageConfig(view, ctx);
		case "perTrackImage":
			return normalizePerTrackImageConfig(view, ctx);
		default:
			throw new Error(`Invalid view type: ${viewType}`);
	}
}
