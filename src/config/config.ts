import { cssTokens } from "../generated/css-tokens";
import { allowedUnitsForMediaType, type TimelineUnit } from "../model/timeline";
import type {
	AlignmentConfig,
	AudioMediaEntryConfig,
	ImageMediaEntryConfig,
	MarkerSequenceSourceConfig,
	MarkersConfig,
	MediaConfig,
	MidiMediaEntryConfig,
	MusicXmlMediaEntryConfig,
	NormalizedTrackSwitchConfig,
	PresetConfig,
	PresetsConfig,
	SynchronizedAudioSourceConfig,
	TrackDefinition,
	TrackId,
	TrackPanControl,
	TrackSourceDefinition,
	TrackSwitchCssOverrides,
	TrackSwitchFeatures,
	TrackSwitchInit,
	TrackSwitchViewConfig,
} from "../types";
import { normalizeViewConfig, type ViewNormalizeContext } from "./views";

const knownCssTokens = new Set<string>(cssTokens);

export function toConfigRecord(
	value: unknown,
	label: string,
): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`Invalid ${label} configuration.`);
	}

	return value as Record<string, unknown>;
}

/**
 * Ties a runtime key list to the interface it guards: a key the interface does
 * not declare, or a declared key the list omits, is a compile error. Without
 * this the two drift silently, which is how `sheetMusic.markerLayers` ended up
 * type-checking and then throwing at load.
 */
export function keysOf<T>() {
	return <K extends readonly (keyof T & string)[]>(
		keys: K & ([keyof T] extends [K[number]] ? unknown : never),
	): K => keys;
}

export function assertAllowedKeys(
	target: Record<string, unknown>,
	allowedKeys: readonly string[],
	label: string,
): void {
	const allowed = new Set(allowedKeys);
	Object.keys(target).forEach((key) => {
		if (!allowed.has(key)) {
			throw new Error(
				"Invalid " +
					label +
					" key: " +
					key +
					". Allowed keys: " +
					allowedKeys.join(", "),
			);
		}
	});
}

/**
 * Validates a `css` block: names must be public `--ts-*` tokens, so a typo
 * fails at load rather than silently setting a property nothing reads.
 */
export function normalizeCssOverrides(
	value: unknown,
	label: string,
): TrackSwitchCssOverrides | undefined {
	if (value === undefined) {
		return undefined;
	}

	const record = toConfigRecord(value, `${label}.css`);
	Object.entries(record).forEach(([token, tokenValue]) => {
		if (!knownCssTokens.has(token)) {
			throw new Error(
				`Invalid ${label}.css configuration: "${token}" is not a known --ts-* token.`,
			);
		}

		if (typeof tokenValue !== "string" || tokenValue.trim().length === 0) {
			throw new Error(
				`Invalid ${label}.css configuration: "${token}" must be a non-empty string.`,
			);
		}
	});

	return record as TrackSwitchCssOverrides;
}

export function normalizePositiveInteger(
	value: number | undefined,
	label: string,
): number | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
		throw new Error(
			`Invalid ${label} configuration: must be a finite number of at least 1.`,
		);
	}

	return Math.round(value);
}

export function normalizePositiveFiniteNumber(
	value: number | undefined,
	label: string,
): number | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new Error(
			`Invalid ${label} configuration: must be a positive finite number.`,
		);
	}

	return value;
}

export function normalizeOptionalBoolean(
	value: boolean | undefined,
	label: string,
): boolean | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== "boolean") {
		throw new Error(`Invalid ${label} configuration: must be true or false.`);
	}

	return value;
}

/** Rejects anything outside the given set, naming the offending value. */
export function normalizeEnum<T extends string>(
	value: unknown,
	allowed: readonly T[],
	label: string,
	fallback: T,
): T {
	if (value === undefined) {
		return fallback;
	}

	if (typeof value !== "string" || !allowed.includes(value as T)) {
		throw new Error(
			`Invalid ${label} configuration: must be one of ${allowed
				.map((option) => `'${option}'`)
				.join(", ")}.`,
		);
	}

	return value as T;
}

export function normalizeNumberInRange(
	value: number | undefined,
	minimum: number,
	maximum: number,
	label: string,
	fallback: number,
): number {
	if (value === undefined) {
		return fallback;
	}

	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value < minimum ||
		value > maximum
	) {
		throw new Error(
			`Invalid ${label} configuration: must be a number between ${minimum} and ${maximum}.`,
		);
	}

	return value;
}

const MEDIA_REQUIRED_ERROR =
	'TrackSwitch requires at least one media entry of type "audio".';

const initAllowedKeys = keysOf<TrackSwitchInit>()([
	"$schema",
	"media",
	"alignment",
	"markers",
	"presets",
	"views",
	"features",
	"css",
] as const);
const alignmentAllowedKeys = keysOf<AlignmentConfig>()([
	"src",
	"referenceTimeline",
	"timelines",
	"outsideCoverage",
	"duplicateAnchors",
] as const);
const markerSequenceAllowedKeys = keysOf<MarkerSequenceSourceConfig>()([
	"type",
	"colors",
	"src",
	"timeline",
	"timeCol",
	"labelCol",
] as const);
const presetAllowedKeys = keysOf<PresetConfig>()(["label", "tracks"] as const);
const audioMediaAllowedKeys = keysOf<AudioMediaEntryConfig>()([
	"type",
	"src",
	"title",
	"imageID",
	"css",
	"solo",
	"volume",
	"pan",
	"volumeControl",
	"panControl",
	"startOffsetMs",
	"endOffsetMs",
	"srcTimeScaled",
	"timelineUnit",
] as const);
const midiMediaAllowedKeys = keysOf<MidiMediaEntryConfig>()([
	"type",
	"src",
	"timelineUnit",
] as const);
const musicxmlMediaAllowedKeys = keysOf<MusicXmlMediaEntryConfig>()([
	"type",
	"src",
	"timelineUnit",
] as const);
const imageMediaAllowedKeys = keysOf<ImageMediaEntryConfig>()([
	"type",
	"src",
	"timelineUnit",
] as const);
const synchronizedSourceAllowedKeys = keysOf<SynchronizedAudioSourceConfig>()([
	"src",
	"startOffsetMs",
	"endOffsetMs",
] as const);

function validateInitKeys(init: TrackSwitchInit): void {
	const initRecord = toConfigRecord(init, "init");
	assertAllowedKeys(initRecord, initAllowedKeys, "init");
}

/** `path` names the property being validated, as `media.hu33.timelineUnit`. */
function validateTimelineUnit(
	path: string,
	unit: unknown,
	mediaEntry: MediaConfig[string] | undefined,
): void {
	if (unit === undefined) {
		return;
	}

	const allowed = allowedUnitsForMediaType(mediaEntry?.type);
	if (!allowed) {
		// An unrecognized media type, which the type check below rejects on its own.
		return;
	}
	if (typeof unit !== "string" || !allowed.includes(unit as TimelineUnit)) {
		throw new Error(
			`Invalid ${path} configuration: ${JSON.stringify(unit)} is not a unit of ` +
				`media type "${mediaEntry?.type}". Allowed units: ${allowed.join(", ")}.`,
		);
	}
}

function normalizeAlignmentTimelines(
	timelines: AlignmentConfig["timelines"],
): AlignmentConfig["timelines"] {
	const record = toConfigRecord(timelines, "alignment.timelines");
	const normalized: AlignmentConfig["timelines"] = {};

	Object.entries(record).forEach(([timelineId, rawEntry]) => {
		if (typeof rawEntry !== "string" || rawEntry.trim().length === 0) {
			throw new Error(
				`Invalid alignment.timelines.${timelineId} configuration: must be a non-empty ` +
					"CSV column name. A column's unit belongs to its medium, as media.timelineUnit.",
			);
		}
		normalized[timelineId] = rawEntry;
	});

	return normalized;
}

function normalizeAlignmentConfig(
	alignment: AlignmentConfig | undefined,
): AlignmentConfig | undefined {
	if (alignment === undefined) {
		return undefined;
	}

	const record = toConfigRecord(alignment, "alignment");
	assertAllowedKeys(record, alignmentAllowedKeys, "alignment");

	if (typeof alignment.src !== "string" || alignment.src.trim().length === 0) {
		throw new Error(
			"Invalid alignment configuration: src must be a non-empty string.",
		);
	}
	if (
		typeof alignment.referenceTimeline !== "string" ||
		alignment.referenceTimeline.trim().length === 0
	) {
		throw new Error(
			"Invalid alignment configuration: referenceTimeline must be a non-empty string.",
		);
	}
	if (
		!alignment.timelines ||
		typeof alignment.timelines !== "object" ||
		Array.isArray(alignment.timelines) ||
		Object.keys(alignment.timelines).length === 0
	) {
		throw new Error(
			"Invalid alignment configuration: timelines must be a non-empty object mapping timeline id to CSV column name.",
		);
	}
	if (!(alignment.referenceTimeline in alignment.timelines)) {
		throw new Error(
			"Invalid alignment configuration: referenceTimeline must be one of the keys in timelines.",
		);
	}
	const timelines = normalizeAlignmentTimelines(alignment.timelines);
	if (
		alignment.outsideCoverage !== undefined &&
		alignment.outsideCoverage !== "hold" &&
		alignment.outsideCoverage !== "extrapolate" &&
		alignment.outsideCoverage !== "error"
	) {
		throw new Error(
			"Invalid alignment configuration: outsideCoverage must be 'hold', 'extrapolate', or 'error'.",
		);
	}
	if (
		alignment.duplicateAnchors !== undefined &&
		alignment.duplicateAnchors !== "first" &&
		alignment.duplicateAnchors !== "average" &&
		alignment.duplicateAnchors !== "error"
	) {
		throw new Error(
			"Invalid alignment configuration: duplicateAnchors must be 'first', 'average', or 'error'.",
		);
	}

	return {
		...alignment,
		timelines,
		outsideCoverage: alignment.outsideCoverage ?? "error",
		duplicateAnchors: alignment.duplicateAnchors ?? "first",
	};
}

/**
 * Exclusivity lives on each `trackList`, so a track only has a defined solo mode
 * once some list claims it. A track no list mentions would be audible with no way
 * to reach it.
 */
function assertEveryTrackIsListed(
	views: TrackSwitchViewConfig[],
	trackIds: TrackId[],
): void {
	const listed = new Set<TrackId>();
	views.forEach((view) => {
		if (view.type === "trackList") {
			view.tracks.forEach((trackId) => {
				listed.add(trackId);
			});
		}
	});

	const orphans = trackIds.filter((trackId) => !listed.has(trackId));
	if (orphans.length > 0) {
		throw new Error(
			"Invalid views configuration: every track must appear in a trackList view. " +
				`Unlisted track ids: ${orphans.join(", ")}.`,
		);
	}
}

/**
 * Alignment places each timeline at its own audible position, so tracks of two
 * timelines sounding together would sit at different moments of the piece. The
 * player therefore selects one timeline at a time, and a list decides what it
 * contributes to that choice: a list with a `comparisonGroup` offers each of its tracks
 * as a timeline of its own, a list without one *is* one timeline whose tracks mix
 * freely — which only holds if they all share one alignment column and the same
 * offsets, so that they really are one recording taken apart.
 *
 * That single selection also spans the whole player, so several `comparisonGroup`
 * numbers would be one selection wearing different names. Sync mode is what makes
 * different timelines audible together, by running their time-stretched sources on
 * a shared clock.
 */
function assertAlignedTrackListSelections(
	views: TrackSwitchViewConfig[],
	alignment: AlignmentConfig,
	media: MediaConfig,
): void {
	const comparisonGroups = new Set<number>();

	views.forEach((view) => {
		if (view.type !== "trackList") {
			return;
		}

		if (view.comparisonGroup === undefined) {
			assertSharedAlignmentTimeline(view.tracks, alignment, media);
			return;
		}

		comparisonGroups.add(view.comparisonGroup);
	});

	if (comparisonGroups.size > 1) {
		throw new Error(
			"Invalid trackList configuration: alignment selects one timeline at a time across the " +
				"whole player, so its trackList views share a single selection. Give them one " +
				`comparisonGroup number instead of ${[...comparisonGroups].sort().join(", ")}.`,
		);
	}
}

/**
 * A `perTrackImage` surface shows the image of the one audible track, so the whole
 * player has to resolve to a single selection: every list belongs to a selection,
 * and they all belong to the same one.
 */
function assertSinglePerTrackImageSelection(
	views: TrackSwitchViewConfig[],
): void {
	const comparisonGroups = new Set<number | undefined>();
	views.forEach((view) => {
		if (view.type === "trackList") {
			comparisonGroups.add(view.comparisonGroup);
		}
	});

	if (comparisonGroups.size === 1 && !comparisonGroups.has(undefined)) {
		return;
	}

	throw new Error(
		"Invalid configuration: perTrackImage shows the image of the one audible track, so every " +
			"trackList view must declare the same comparisonGroup.",
	);
}

/** The alignment column plus the trims that place a track's audio on it. */
function alignmentPlacement(
	trackId: TrackId,
	alignment: AlignmentConfig,
	media: MediaConfig,
): string {
	const entry = alignment.timelines[trackId];
	if (entry === undefined) {
		throw new Error(
			`Invalid trackList configuration: track "${trackId}" sits in a trackList without a ` +
				"comparisonGroup, which makes its tracks sound together, so every one of them needs an " +
				"alignment.timelines entry naming the timeline they share.",
		);
	}

	const mediaEntry = media[trackId] as AudioMediaEntryConfig;

	return [
		entry,
		String(mediaEntry.timelineUnit ?? ""),
		String(mediaEntry.startOffsetMs ?? 0),
		String(mediaEntry.endOffsetMs ?? 0),
	].join("|");
}

function assertSharedAlignmentTimeline(
	trackIds: TrackId[],
	alignment: AlignmentConfig,
	media: MediaConfig,
): void {
	const positions = trackIds.map((trackId) =>
		alignmentPlacement(trackId, alignment, media),
	);
	const [first] = positions;
	const divergentIndex = positions.findIndex(
		(placement) => placement !== first,
	);
	if (divergentIndex < 0) {
		return;
	}

	throw new Error(
		"Invalid trackList configuration: a trackList without a comparisonGroup plays " +
			"its tracks together, so under alignment they must live on one timeline. Tracks " +
			`"${trackIds[0]}" and "${trackIds[divergentIndex]}" differ in their alignment ` +
			"column, its unit, or their startOffsetMs/endOffsetMs.",
	);
}

function normalizeMarkersConfig(
	markers: MarkersConfig | undefined,
	referenceTimeline: string | undefined,
): MarkersConfig {
	if (markers === undefined) {
		return {};
	}

	const record = toConfigRecord(markers, "markers");
	const normalized: MarkersConfig = {};

	Object.entries(record).forEach(([setId, rawSet]) => {
		const setRecord = toConfigRecord(rawSet, `markers.${setId}`);
		assertAllowedKeys(setRecord, markerSequenceAllowedKeys, `markers.${setId}`);
		const set = rawSet as MarkersConfig[string];

		if (set.type !== "points" && set.type !== "segments") {
			throw new Error(
				`Invalid markers.${setId} configuration: type must be "points" or "segments".`,
			);
		}
		if (set.colors !== undefined) {
			if (set.type !== "segments") {
				throw new Error(
					`Invalid markers.${setId} configuration: colors are only valid for type "segments".`,
				);
			}
			if (set.labelCol === undefined) {
				throw new Error(
					`Invalid markers.${setId} configuration: colors require labelCol.`,
				);
			}
			const colors = toConfigRecord(set.colors, `markers.${setId}.colors`);
			Object.entries(colors).forEach(([label, color]) => {
				if (label.trim().length === 0) {
					throw new Error(
						`Invalid markers.${setId}.colors configuration: labels must be non-empty strings.`,
					);
				}
				if (
					typeof color !== "string" ||
					color.trim().length === 0 ||
					(typeof CSS !== "undefined" && !CSS.supports("color", color))
				) {
					throw new Error(
						`Invalid markers.${setId}.colors configuration: "${label}" must map to a valid CSS color.`,
					);
				}
			});
		}

		if (typeof set.src !== "string" || set.src.trim().length === 0) {
			throw new Error(
				`Invalid markers.${setId} configuration: src must be a non-empty string.`,
			);
		}
		if (typeof set.timeCol !== "string" || set.timeCol.trim().length === 0) {
			throw new Error(
				`Invalid markers.${setId} configuration: timeCol must be a non-empty string.`,
			);
		}
		if (
			set.labelCol !== undefined &&
			(typeof set.labelCol !== "string" || set.labelCol.trim().length === 0)
		) {
			throw new Error(
				`Invalid markers.${setId} configuration: labelCol must be a non-empty string.`,
			);
		}
		if (set.timeline !== undefined) {
			if (
				typeof set.timeline !== "string" ||
				set.timeline.trim().length === 0
			) {
				throw new Error(
					`Invalid markers.${setId} configuration: timeline must be a non-empty string.`,
				);
			}
		} else if (referenceTimeline === undefined) {
			// Omitting timeline with no alignment block is valid: there is one timeline.
		}

		normalized[setId] = { ...set };
	});

	return normalized;
}

function normalizePresetsConfig(
	presets: PresetsConfig | undefined,
	trackIds: ReadonlySet<TrackId>,
): PresetsConfig {
	if (presets === undefined) {
		return {};
	}

	const record = toConfigRecord(presets, "presets");
	const normalized: PresetsConfig = {};

	Object.entries(record).forEach(([presetId, rawPreset]) => {
		const presetRecord = toConfigRecord(rawPreset, `presets.${presetId}`);
		assertAllowedKeys(presetRecord, presetAllowedKeys, `presets.${presetId}`);
		const preset = rawPreset as PresetsConfig[string];

		if (!Array.isArray(preset.tracks) || preset.tracks.length === 0) {
			throw new Error(
				`Invalid presets.${presetId} configuration: tracks must be a non-empty array of track ids.`,
			);
		}
		preset.tracks.forEach((trackId) => {
			if (!trackIds.has(trackId)) {
				throw new Error(
					`Invalid presets.${presetId} configuration: references unknown track id "${trackId}".`,
				);
			}
		});

		normalized[presetId] = { ...preset };
	});

	return normalized;
}

function normalizeSynchronizedSource(
	mediaId: string,
	srcTimeScaled: unknown,
): TrackSourceDefinition[] | undefined {
	if (srcTimeScaled === undefined) {
		return undefined;
	}

	const record = toConfigRecord(
		srcTimeScaled,
		`media.${mediaId}.srcTimeScaled`,
	);
	assertAllowedKeys(
		record,
		synchronizedSourceAllowedKeys,
		`media.${mediaId}.srcTimeScaled`,
	);

	const synced = srcTimeScaled as SynchronizedAudioSourceConfig & {
		src: unknown;
	};
	if (typeof synced.src !== "string" || synced.src.trim().length === 0) {
		throw new Error(
			`Invalid media.${mediaId}.srcTimeScaled configuration: src must be a non-empty string.`,
		);
	}
	return [
		{
			src: synced.src,
			startOffsetMs: synced.startOffsetMs,
			endOffsetMs: synced.endOffsetMs,
		},
	];
}

function normalizeTrackPanControl(
	mediaId: string,
	value: TrackPanControl | undefined,
): TrackPanControl | undefined {
	if (value === undefined || value === "none") {
		return value;
	}

	if (value !== "balance" && value !== "pan") {
		throw new Error(
			`Invalid media.${mediaId}.panControl configuration: must be 'balance', 'pan', or 'none'.`,
		);
	}

	return value;
}

function normalizeMediaConfig(media: MediaConfig | undefined): {
	media: MediaConfig;
	tracks: TrackDefinition[];
} {
	if (!media || typeof media !== "object" || Array.isArray(media)) {
		throw new Error("Invalid init configuration: media must be an object.");
	}

	const normalizedMedia: MediaConfig = {};
	const tracks: TrackDefinition[] = [];

	Object.entries(media).forEach(([mediaId, rawEntry]) => {
		const entryRecord = toConfigRecord(rawEntry, `media.${mediaId}`);
		const type = entryRecord.type;
		validateTimelineUnit(
			`media.${mediaId}.timelineUnit`,
			entryRecord.timelineUnit,
			rawEntry as MediaConfig[string],
		);

		if (type === "audio") {
			assertAllowedKeys(entryRecord, audioMediaAllowedKeys, `media.${mediaId}`);
			const entry = rawEntry as Extract<MediaConfig[string], { type: "audio" }>;
			if (typeof entry.src !== "string" || entry.src.trim().length === 0) {
				throw new Error(
					`Invalid media.${mediaId} configuration: src must be a non-empty string.`,
				);
			}

			const css = normalizeCssOverrides(entry.css, `media.${mediaId}`);
			normalizedMedia[mediaId] = { ...entry, css };
			tracks.push({
				id: mediaId,
				title: entry.title,
				imageID: entry.imageID,
				css,
				solo: entry.solo,
				volume: entry.volume,
				pan: entry.pan,
				volumeControl: normalizeOptionalBoolean(
					entry.volumeControl,
					`media.${mediaId}.volumeControl`,
				),
				panControl: normalizeTrackPanControl(mediaId, entry.panControl),
				sources: [
					{
						src: entry.src,
						startOffsetMs: entry.startOffsetMs,
						endOffsetMs: entry.endOffsetMs,
					},
				],
				syncedSources: normalizeSynchronizedSource(
					mediaId,
					entry.srcTimeScaled,
				),
			});
			return;
		}

		if (type === "midi") {
			assertAllowedKeys(entryRecord, midiMediaAllowedKeys, `media.${mediaId}`);
			const entry = rawEntry as Extract<MediaConfig[string], { type: "midi" }>;
			if (typeof entry.src !== "string" || entry.src.trim().length === 0) {
				throw new Error(
					`Invalid media.${mediaId} configuration: src must be a non-empty string.`,
				);
			}
			normalizedMedia[mediaId] = { ...entry };
			return;
		}

		if (type === "musicxml") {
			assertAllowedKeys(
				entryRecord,
				musicxmlMediaAllowedKeys,
				`media.${mediaId}`,
			);
			const entry = rawEntry as Extract<
				MediaConfig[string],
				{ type: "musicxml" }
			>;
			if (typeof entry.src !== "string" || entry.src.trim().length === 0) {
				throw new Error(
					`Invalid media.${mediaId} configuration: src must be a non-empty string.`,
				);
			}
			normalizedMedia[mediaId] = { ...entry };
			return;
		}

		if (type === "image") {
			assertAllowedKeys(entryRecord, imageMediaAllowedKeys, `media.${mediaId}`);
			const entry = rawEntry as Extract<MediaConfig[string], { type: "image" }>;
			if (typeof entry.src !== "string" || entry.src.trim().length === 0) {
				throw new Error(
					`Invalid media.${mediaId} configuration: src must be a non-empty string.`,
				);
			}
			normalizedMedia[mediaId] = { ...entry };
			return;
		}

		throw new Error(
			`Invalid media.${mediaId} configuration: type must be "audio", "midi", "musicxml", or "image".`,
		);
	});

	// Resolved after the pass, so a track may name an image entry declared below it.
	tracks.forEach((track) => {
		if (track.imageID === undefined) {
			return;
		}
		const referenced = normalizedMedia[track.imageID];
		if (referenced?.type !== "image") {
			throw new Error(
				`Invalid media.${track.id} configuration: imageID "${track.imageID}" must name a media entry of type "image".`,
			);
		}
	});

	return { media: normalizedMedia, tracks };
}

export function normalizeTrackSwitchConfig(
	init: TrackSwitchInit,
): NormalizedTrackSwitchConfig {
	validateInitKeys(init);

	const { media, tracks } = normalizeMediaConfig(init.media);
	if (tracks.length === 0) {
		throw new Error(MEDIA_REQUIRED_ERROR);
	}

	const alignment = normalizeAlignmentConfig(init.alignment);
	const markers = normalizeMarkersConfig(
		init.markers,
		alignment?.referenceTimeline,
	);
	const trackIdSet = new Set(tracks.map((track) => track.id));
	const presets = normalizePresetsConfig(init.presets, trackIdSet);

	const viewCtx: ViewNormalizeContext = {
		media,
		trackIds: tracks.map((track) => track.id),
		markerSequenceIds: new Set(Object.keys(markers)),
		hasAlignment: !!alignment,
		alignmentTimelines: new Set(
			alignment ? Object.keys(alignment.timelines) : [],
		),
	};

	if (!Array.isArray(init.views) || init.views.length === 0) {
		throw new Error(
			"Invalid init configuration: views must be a non-empty array.",
		);
	}

	const views: TrackSwitchViewConfig[] = init.views.map((view) =>
		normalizeViewConfig(view, viewCtx),
	);
	if (views.filter((view) => view.type === "navigationBar").length > 1) {
		throw new Error(
			"Invalid views configuration: only one navigationBar view is allowed.",
		);
	}

	assertEveryTrackIsListed(views, viewCtx.trackIds);
	if (alignment) {
		assertAlignedTrackListSelections(views, alignment, media);
	}

	if (views.some((view) => view.type === "perTrackImage")) {
		assertSinglePerTrackImageSelection(views);
	}

	const features = normalizeFeatures(init.features);

	return {
		tracks,
		media,
		alignment,
		markers,
		presets,
		features,
		views,
		css: normalizeCssOverrides(init.css, "init"),
	};
}

export type ElementConfigParser<TConfig> = (rawConfig: unknown) => TConfig;

export interface ElementConfigErrorOptions {
	details?: string;
	title?: string;
}

export class ElementConfigError extends Error {
	readonly details: string | undefined;
	readonly title: string | undefined;

	constructor(message: string, options: ElementConfigErrorOptions = {}) {
		super(message);
		this.name = "ElementConfigError";
		this.details = options.details;
		this.title = options.title;
	}
}

function detailsOf(error: unknown): string | undefined {
	if (error instanceof Error && error.message) {
		return `${error.name}: ${error.message}`;
	}

	return undefined;
}

const MALFORMED_JSON_TITLE = "Trackswitch config is not valid JSON";
const MALFORMED_JSON_HINT =
	"Common causes: a trailing comma, a missing comma or quote, single quotes instead of double quotes, comments, or an unclosed bracket.";
const JSON_SNIPPET_CONTEXT = 60;

/**
 * Turns a JSON.parse SyntaxError into a snippet of the offending source with a
 * caret under the reported position, so the panel points at the actual typo.
 */
function describeJsonSyntaxError(source: string, error: unknown): string {
	const parseMessage =
		error instanceof Error ? error.message : "Unknown JSON syntax error.";
	const positionMatch = /position (\d+)/.exec(parseMessage);
	if (!positionMatch) {
		return parseMessage;
	}

	const position = Math.min(Number(positionMatch[1]), source.length);
	const lineStart = source.lastIndexOf("\n", position - 1) + 1;
	const lineEndIndex = source.indexOf("\n", position);
	const lineEnd = lineEndIndex === -1 ? source.length : lineEndIndex;
	const line = source.slice(lineStart, lineEnd);
	const columnIndex = position - lineStart;

	const sliceStart = Math.max(0, columnIndex - JSON_SNIPPET_CONTEXT);
	const sliceEnd = Math.min(line.length, columnIndex + JSON_SNIPPET_CONTEXT);
	const snippet =
		(sliceStart > 0 ? "…" : "") +
		line.slice(sliceStart, sliceEnd) +
		(sliceEnd < line.length ? "…" : "");
	const caretOffset = columnIndex - sliceStart + (sliceStart > 0 ? 1 : 0);

	return `${parseMessage}\n\n${snippet}\n${" ".repeat(caretOffset)}^`;
}

function parseJsonConfig(source: string, sourceLabel: string): unknown {
	if (!source.trim()) {
		throw new ElementConfigError(`Empty JSON in ${sourceLabel}.`, {
			title: MALFORMED_JSON_TITLE,
		});
	}

	try {
		return JSON.parse(source);
	} catch (error) {
		throw new ElementConfigError(`Malformed JSON in ${sourceLabel}.`, {
			title: MALFORMED_JSON_TITLE,
			details: `${describeJsonSyntaxError(source, error)}\n\n${MALFORMED_JSON_HINT}`,
		});
	}
}

const INLINE_CONFIG_SCRIPT_TYPE = "application/json";
const DECLARATIVE_CONFIG_WAIT_TIMEOUT_MS = 500;

function getInlineConfigScripts(element: HTMLElement): HTMLScriptElement[] {
	return Array.from(element.children).filter(
		(child): child is HTMLScriptElement =>
			child instanceof HTMLScriptElement &&
			child.type.trim().toLowerCase() === INLINE_CONFIG_SCRIPT_TYPE,
	);
}

function hasDeclarativeConfigSource(element: HTMLElement): boolean {
	return (
		element.hasAttribute("config-src") ||
		getInlineConfigScripts(element).length > 0
	);
}

function waitForAnimationFrame(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => resolve());
	});
}

async function waitForDeclarativeConfigSource(
	element: HTMLElement,
): Promise<void> {
	if (hasDeclarativeConfigSource(element)) {
		return;
	}

	await waitForAnimationFrame();
	if (hasDeclarativeConfigSource(element)) {
		return;
	}

	await new Promise<void>((resolve) => {
		let timeoutId = 0;
		let observer: MutationObserver | null = null;

		const cleanup = (): void => {
			window.clearTimeout(timeoutId);
			observer?.disconnect();
			resolve();
		};

		observer = new MutationObserver(() => {
			if (!hasDeclarativeConfigSource(element)) {
				return;
			}

			cleanup();
		});
		timeoutId = window.setTimeout(
			() => cleanup(),
			DECLARATIVE_CONFIG_WAIT_TIMEOUT_MS,
		);

		observer.observe(element, {
			childList: true,
			attributes: true,
			attributeFilter: ["config-src"],
		});
	});
}

export async function loadElementConfig<TConfig>(
	element: HTMLElement,
	parseConfig: ElementConfigParser<TConfig>,
): Promise<TConfig | undefined> {
	await waitForDeclarativeConfigSource(element);

	const configSrc = element.getAttribute("config-src");
	const inlineConfigScripts = getInlineConfigScripts(element);

	if (configSrc && inlineConfigScripts.length > 0) {
		throw new ElementConfigError(
			"Use either config-src or inline JSON, not both.",
		);
	}

	if (inlineConfigScripts.length > 1) {
		throw new ElementConfigError(
			"Expected exactly one inline JSON config script, found " +
				inlineConfigScripts.length +
				".",
		);
	}

	if (configSrc) {
		let response: Response;
		try {
			response = await fetch(configSrc);
		} catch (error) {
			throw new ElementConfigError(
				`Failed to load config-src "${configSrc}".`,
				{ details: detailsOf(error) },
			);
		}

		if (!response.ok) {
			throw new ElementConfigError(
				`Failed to load config-src "${configSrc}".`,
				{ details: `HTTP ${response.status} ${response.statusText}` },
			);
		}

		const responseText = await response.text();
		const rawConfig = parseJsonConfig(
			responseText,
			`config-src "${configSrc}"`,
		);

		try {
			return parseConfig(rawConfig);
		} catch (error) {
			throw new ElementConfigError(
				`Invalid config from config-src "${configSrc}".`,
				{ details: detailsOf(error) },
			);
		}
	}

	if (inlineConfigScripts.length === 1) {
		const rawConfig = parseJsonConfig(
			inlineConfigScripts[0].textContent || "",
			"the inline JSON config script",
		);

		try {
			return parseConfig(rawConfig);
		} catch (error) {
			throw new ElementConfigError("Invalid inline config.", {
				details: detailsOf(error),
			});
		}
	}

	throw new ElementConfigError(
		'No config found. Provide a config-src attribute or one inline <script type="application/json"> config.',
	);
}

export const defaultFeatures: Readonly<TrackSwitchFeatures> = {
	muteOtherPlayerInstances: true,
	customizablePanelOrder: false,
	tabView: false,
	keyboard: true,
	normalizeLoudness: false,
	autoload: false,
};

const featureKeys = new Set<keyof TrackSwitchFeatures>(
	Object.keys(defaultFeatures) as Array<keyof TrackSwitchFeatures>,
);
const allowedFeatureKeys = Array.from(featureKeys);

export function normalizeFeatures(
	features: Partial<TrackSwitchFeatures> | undefined,
): TrackSwitchFeatures {
	if (
		features !== undefined &&
		(typeof features !== "object" ||
			features === null ||
			Array.isArray(features))
	) {
		throw new Error("Invalid features configuration.");
	}

	if (features) {
		Object.keys(features).forEach((featureKey) => {
			if (!featureKeys.has(featureKey as keyof TrackSwitchFeatures)) {
				throw new Error(
					"Invalid feature key: " +
						featureKey +
						". Allowed keys: " +
						allowedFeatureKeys.join(", "),
				);
			}
		});
	}

	const normalized: TrackSwitchFeatures = {
		...defaultFeatures,
		...(features ?? {}),
	};

	return normalized;
}
