import { Midi } from "@tonejs/midi";
import { formatSecondsToHHMMSSmmm } from "../shared/format";
import type {
	MediaConfig,
	MediaEntryConfig,
	TrackRuntime,
	TrackTiming,
} from "../types";

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/**
 * A timeline id doubles as a media id when the timeline is backed by a
 * media entry (audio, MIDI, score) — see Timeline.media.
 */
export type TimelineId = Brand<string, "TimelineId">;

export function timelineId(value: string): TimelineId {
	return value as TimelineId;
}

/** Stand-in reference timeline id used when no `alignment` block exists (exactly one timeline). */
export const IMPLICIT_REFERENCE_TIMELINE: TimelineId = timelineId("$reference");

/**
 * The timeline the player's position, loop points and runtime markers use.
 * Alignment mode always uses its canonical reference timeline; ordinary
 * playback uses the single implicit timeline.
 */
export function playerTimeline(
	alignment: { referenceTimeline: TimelineId } | null | undefined,
): TimelineId {
	return alignment?.referenceTimeline ?? IMPLICIT_REFERENCE_TIMELINE;
}

/**
 * The unit a timeline's alignment column is authored in. Each medium has one
 * native unit it plays back in (audio and MIDI: seconds, a score: measures, an
 * image: percent of its width); the others are declared alternatives that are
 * converted to the native unit when the alignment is parsed — see
 * `src/timeline/media-profile.ts`.
 */
export type TimelineUnit =
	| "seconds"
	| "samples"
	| "ticks"
	| "measures"
	| "percent"
	| "pixels";

export interface Timeline {
	readonly id: TimelineId;
	readonly unit: TimelineUnit;
	readonly media?: TimelineId;
}

/** A span on one timeline, in that timeline's native coordinate. */
export interface TimelineExtent {
	readonly start: number;
	readonly end: number;
}

export function formatTimelineValue(unit: TimelineUnit, value: number): string {
	if (unit === "seconds") {
		return formatSecondsToHHMMSSmmm(value);
	}
	if (unit === "measures") {
		return `measure ${formatWholeOrTwoDecimals(value)}`;
	}
	if (unit === "ticks") {
		return `${Math.round(value)} MIDI ticks`;
	}
	if (unit === "samples" || unit === "pixels") {
		return `${Math.round(value)} ${unit}`;
	}
	return `${formatWholeOrTwoDecimals(value)}%`;
}

/** A timer's two halves, rendered as "position / duration". */
export interface TimelineValuePair {
	position: string;
	duration: string;
}

/**
 * A timer names its unit once for the pair rather than on both halves, so it
 * reads "measure 5 / 55" and "300 / 400 samples" instead of repeating itself.
 */
export function formatTimelineValuePair(
	unit: TimelineUnit,
	position: number,
	duration: number,
): TimelineValuePair {
	if (unit === "seconds") {
		return {
			position: formatSecondsToHHMMSSmmm(position),
			duration: formatSecondsToHHMMSSmmm(duration),
		};
	}
	if (unit === "measures") {
		return {
			position: `measure ${formatWholeOrTwoDecimals(position)}`,
			// A duration names a count of whole measures. The underlying extent
			// stays fractional (seeking and coverage checks key off it), so a
			// piece whose last anchor falls at 19.917 still reads as spanning
			// measure 19 rather than stopping short of it.
			duration: String(Math.ceil(duration)),
		};
	}
	if (unit === "ticks") {
		return {
			position: String(Math.round(position)),
			duration: `${Math.round(duration)} MIDI ticks`,
		};
	}
	if (unit === "samples" || unit === "pixels") {
		return {
			position: String(Math.round(position)),
			duration: `${Math.round(duration)} ${unit}`,
		};
	}
	return {
		position: formatWholeOrTwoDecimals(position),
		duration: `${formatWholeOrTwoDecimals(duration)}%`,
	};
}

function formatWholeOrTwoDecimals(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * The coordinate a medium is actually played back in. Everything downstream of
 * alignment parsing — the projection graph, extents, markers, loop points —
 * speaks native units only.
 */
export type NativeUnit = "seconds" | "measures" | "percent";

/**
 * What a medium contributes to its timeline: the unit it plays back in, how far
 * it reaches, and how to convert between a declared column unit and that native
 * coordinate.
 */
export interface MediaProfile {
	readonly nativeUnit: NativeUnit;
	readonly extent: TimelineExtent;
	toNative(value: number, declared: TimelineUnit): number;
	fromNative(value: number, declared: TimelineUnit): number;
}

/**
 * Converts a native reference position into its declared display unit while
 * keeping the playable origin at zero. Source trimming affects alignment
 * placement, but must not reappear as an offset in the player readout.
 */
export function referenceReadoutValue(
	profile: MediaProfile,
	value: number,
	declared: TimelineUnit,
): number {
	return profile.fromNative(value, declared) - profile.fromNative(0, declared);
}

/**
 * Inverse of `referenceReadoutValue`: a value authored in the unit the player
 * reads out, on that same zero-based origin, back into the native coordinate.
 */
export function referenceNativeValue(
	profile: MediaProfile,
	value: number,
	declared: TimelineUnit,
): number {
	return profile.toNative(value + profile.fromNative(0, declared), declared);
}

/** Units a column may be declared in, per media type. First entry is the default. */
const UNITS_BY_MEDIA_TYPE: Record<string, readonly TimelineUnit[]> = {
	audio: ["seconds", "samples"],
	midi: ["seconds", "ticks"],
	musicxml: ["measures"],
	image: ["percent", "pixels"],
};

/**
 * The unit a timeline speaks: the medium's declared `timelineUnit`, else the
 * native unit of its type. A timeline with no medium has neither, so its values
 * stand as they are.
 */
export function resolveTimelineUnit(
	mediaEntry: MediaEntryConfig | undefined,
): TimelineUnit {
	return mediaEntry?.timelineUnit ?? defaultUnitForMediaType(mediaEntry?.type);
}

/**
 * The unit of the single implicit timeline a player without an alignment runs
 * on. Every medium shares that timeline, so the first one that declares a
 * `timelineUnit` names it — and lends its profile for the conversion.
 */
export function resolveImplicitTimelineUnit(
	media: MediaConfig,
): { unit: TimelineUnit; mediaId: string } | null {
	for (const [mediaId, entry] of Object.entries(media)) {
		if (entry.timelineUnit !== undefined) {
			return { unit: entry.timelineUnit, mediaId };
		}
	}
	return null;
}

function defaultUnitForMediaType(type: string | undefined): TimelineUnit {
	if (!type) {
		return "seconds";
	}
	return UNITS_BY_MEDIA_TYPE[type]?.[0] ?? "seconds";
}

export function allowedUnitsForMediaType(
	type: string | undefined,
): readonly TimelineUnit[] | null {
	if (!type) {
		return null;
	}
	return UNITS_BY_MEDIA_TYPE[type] ?? null;
}

/**
 * A medium whose extent could not be probed, or a timeline with no medium at
 * all: the declared unit is taken to be the native one and the extent falls
 * back to whatever the alignment CSV covers.
 */
export function createIdentityProfile(
	nativeUnit: NativeUnit,
	extent: TimelineExtent,
): MediaProfile {
	return {
		nativeUnit,
		extent,
		toNative: (value) => value,
		fromNative: (value) => value,
	};
}

/**
 * Audio: seconds natively, with source coordinates shifted onto the trimmed or
 * padded playback timeline. Sample indices are scaled by the rate of the encoded
 * file — not by the decoded buffer's rate, which is the AudioContext's output
 * rate and unrelated to the coordinates a `samples` column is authored in.
 */
function createAudioProfile(
	durationSeconds: number,
	sourceSampleRate: number | null,
	timing: TrackTiming,
	trackId: string,
): MediaProfile {
	const requireRate = (): number => {
		if (sourceSampleRate === null) {
			throw new Error(
				`Track "${trackId}" declares an alignment column in samples, but the ` +
					"sample rate of its audio file could not be read from the file header. " +
					"Use seconds for this column, or provide the audio in a container " +
					"whose header trackswitch reads (WAV, FLAC, Ogg, MP3, MP4).",
			);
		}
		return sourceSampleRate;
	};
	const playbackOffset = timing.padStart - timing.trimStart;
	return {
		nativeUnit: "seconds",
		extent: { start: 0, end: durationSeconds },
		toNative: (value, declared) =>
			(declared === "samples" ? value / requireRate() : value) + playbackOffset,
		fromNative: (value, declared) =>
			declared === "samples"
				? (value - playbackOffset) * requireRate()
				: value - playbackOffset,
	};
}

/**
 * MIDI: seconds natively. Tick conversion goes through the file's header rather
 * than a plain division by PPQ, so files with tempo changes convert correctly.
 */
function createMidiProfile(
	durationSeconds: number,
	header: {
		ticksToSeconds(ticks: number): number;
		secondsToTicks(seconds: number): number;
	} | null,
): MediaProfile {
	return {
		nativeUnit: "seconds",
		extent: { start: 0, end: durationSeconds },
		toNative: (value, declared) =>
			declared === "ticks" && header ? header.ticksToSeconds(value) : value,
		fromNative: (value, declared) =>
			declared === "ticks" && header ? header.secondsToTicks(value) : value,
	};
}

/** A score: measure numbers natively, spanning the measures OSMD found. */
function createScoreProfile(availableMeasures: number[]): MediaProfile {
	const start = availableMeasures.length > 0 ? availableMeasures[0] : 0;
	const end =
		availableMeasures.length > 0
			? availableMeasures[availableMeasures.length - 1]
			: 0;
	return createIdentityProfile("measures", { start, end });
}

/**
 * An image: percent of its width natively, because that is the coordinate the
 * seek geometry already works in. Pixel columns scale by the decoded width.
 */
function createImageProfile(naturalWidth: number): MediaProfile {
	const usableWidth =
		Number.isFinite(naturalWidth) && naturalWidth > 0 ? naturalWidth : 0;
	return {
		nativeUnit: "percent",
		extent: { start: 0, end: 100 },
		toNative: (value, declared) =>
			declared === "pixels" && usableWidth > 0
				? (value * 100) / usableWidth
				: value,
		fromNative: (value, declared) =>
			declared === "pixels" && usableWidth > 0
				? (value * usableWidth) / 100
				: value,
	};
}

/** Decodes an image just far enough to read its natural width. */
async function probeImageProfile(src: string): Promise<MediaProfile> {
	const image = new Image();
	image.src = src;
	try {
		await image.decode();
	} catch (error) {
		console.warn(
			"[trackswitch] Failed to decode image media source:",
			src,
			error,
		);
	}
	return createImageProfile(image.naturalWidth);
}

export function nativeUnitForMediaEntry(
	entry: MediaEntryConfig | undefined,
): NativeUnit {
	if (entry?.type === "musicxml") {
		return "measures";
	}
	if (entry?.type === "image") {
		return "percent";
	}
	return "seconds";
}

export interface MediaProfileSources {
	media: MediaConfig;
	runtimes: TrackRuntime[];
	/** Already-parsed MIDI files keyed by source url, so nothing is fetched twice. */
	midiBySource?: ReadonlyMap<string, Midi>;
	/** Measure numbers OSMD found, keyed by the score's media id. */
	measuresByMediaId?: ReadonlyMap<string, number[]>;
}

/**
 * Reads each medium's natural extent and unit conversions once every medium has
 * loaded but before the alignment is resolved — the alignment needs the media's
 * own coordinates to interpret its columns and map them onto the reference.
 */
export async function probeMediaProfiles(
	sources: MediaProfileSources,
): Promise<Map<TimelineId, MediaProfile>> {
	const profiles = new Map<TimelineId, MediaProfile>();

	sources.runtimes.forEach((runtime) => {
		const timing = runtime.timing;
		if (!timing || !Number.isFinite(timing.effectiveDuration)) {
			return;
		}
		profiles.set(
			timelineId(runtime.definition.id),
			createAudioProfile(
				timing.effectiveDuration,
				runtime.sourceSampleRate,
				timing,
				runtime.definition.id,
			),
		);
	});

	sources.measuresByMediaId?.forEach((measures, mediaId) => {
		if (measures.length === 0) {
			return;
		}
		profiles.set(timelineId(mediaId), createScoreProfile(measures));
	});

	await Promise.all(
		Object.entries(sources.media).map(async ([mediaId, entry]) => {
			if (entry.type === "image") {
				profiles.set(timelineId(mediaId), await probeImageProfile(entry.src));
				return;
			}
			if (entry.type !== "midi") {
				return;
			}

			const midi =
				sources.midiBySource?.get(entry.src) ?? (await loadMidi(entry.src));
			if (!midi) {
				return;
			}
			profiles.set(
				timelineId(mediaId),
				createMidiProfile(midi.duration, midi.header),
			);
		}),
	);

	return profiles;
}

async function loadMidi(source: string): Promise<Midi | null> {
	try {
		return await Midi.fromUrl(source);
	} catch (error) {
		console.warn(
			"[trackswitch] Failed to load MIDI media source:",
			source,
			error,
		);
		return null;
	}
}
