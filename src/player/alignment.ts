import {
	type Alignment,
	anchorPositions,
	buildAlignment,
} from "../model/alignment";
import {
	probeMediaProfiles,
	referenceNativeValue,
	referenceReadoutValue,
	resolveImplicitTimelineUnit,
	type TimelineId,
	type TimelineUnit,
	timelineId,
} from "../model/timeline";
import { clamp } from "../shared/math";
import type {
	PlaybackOrigin,
	TrackId,
	TrackRuntime,
	TrackSourceVariant,
} from "../types";
import type {
	ImageSeekSurfaceMetadata,
	TimelineReadout,
	WarpingMatrixDataPoint,
	WarpingMatrixRenderContext,
} from "../views/renderer";
import type { TrackSwitchControllerImpl } from "./player";

export function isAlignmentMode(ctx: TrackSwitchControllerImpl): boolean {
	return !!ctx.alignment;
}

export function hasSyncedVariant(
	ctx: TrackSwitchControllerImpl,
	runtime: TrackRuntime,
): boolean {
	void ctx;
	return !!runtime.syncedSource && !!runtime.syncedSource.buffer;
}

export function isTrackSyncLocked(
	ctx: TrackSwitchControllerImpl,
	trackIndex: number,
): boolean {
	return ctx.globalSyncEnabled && ctx.syncLockedTrackIndexes.has(trackIndex);
}

/**
 * Switches how selections are scoped and narrows what is soloed down to that
 * scope, since the previous mode may leave more selected than the new one plays.
 */
export function setSoloMode(
	ctx: TrackSwitchControllerImpl,
	soloMode: SoloMode,
): void {
	ctx.soloMode = soloMode;
	ctx.collapseToSingleSelection();
}

export function toggleGlobalSync(ctx: TrackSwitchControllerImpl): void {
	if (!ctx.isAlignmentMode() || !ctx.isGlobalSyncAvailable()) {
		return;
	}

	ctx.applyGlobalSyncState(!ctx.globalSyncEnabled);
}

/**
 * Selecting the synchronized source only changes which timeline a track's audio clock
 * belongs to (its clock already runs at reference speed) — there is no separate
 * reference axis to remap, so loop points and position are untouched.
 */
export function applyGlobalSyncState(
	ctx: TrackSwitchControllerImpl,
	syncOn: boolean,
): void {
	if (!ctx.isAlignmentMode()) {
		return;
	}

	if (syncOn && !ctx.isGlobalSyncAvailable()) {
		return;
	}

	if (syncOn) {
		ctx.preSyncSoloStates = ctx.runtimes.map(
			(runtime: TrackRuntime) => runtime.state.solo,
		);
		ctx.globalSyncEnabled = true;
		ctx.syncLockedTrackIndexes.clear();
		ctx.setSoloMode("free");

		ctx.runtimes.forEach((runtime: TrackRuntime, index: number) => {
			if (ctx.hasSyncedVariant(runtime)) {
				ctx.setRuntimeActiveVariant(runtime, "synced");
				runtime.state.solo = true;
				return;
			}

			ctx.setRuntimeActiveVariant(runtime, "base");
			runtime.state.solo = false;
			ctx.syncLockedTrackIndexes.add(index);
		});
	} else {
		ctx.globalSyncEnabled = false;
		ctx.syncLockedTrackIndexes.clear();

		const preSyncSoloStates = ctx.preSyncSoloStates;
		ctx.runtimes.forEach((runtime: TrackRuntime, index: number) => {
			ctx.setRuntimeActiveVariant(runtime, "base");
			runtime.state.solo = preSyncSoloStates?.[index] ?? false;
		});

		ctx.preSyncSoloStates = null;
		// Back to one audible track; this also narrows the restored selection, which
		// predates sync mode and may name several tracks.
		ctx.restoreSoloMode();
	}

	ctx.longestDuration = syncOn
		? syncedReferenceDuration(ctx)
		: (ctx.alignment as Alignment).referenceExtent.end;
	ctx.dispatch({
		type: "set-position",
		position: clamp(ctx.state.position, 0, ctx.longestDuration),
	});

	ctx.applyTrackProperties();

	if (ctx.state.playing) {
		ctx.stopAudio();
		ctx.startAudio(ctx.state.position);
	}

	ctx.updateMainControls();
}

/**
 * With sync on, synchronized files already use reference coordinates, so the
 * axis spans the longest synchronized file that actually plays.
 */
function syncedReferenceDuration(ctx: TrackSwitchControllerImpl): number {
	let longest = 0;

	ctx.runtimes.forEach((runtime: TrackRuntime, index: number) => {
		if (ctx.syncLockedTrackIndexes.has(index)) {
			return;
		}

		const duration = runtime.timing?.effectiveDuration;
		if (Number.isFinite(duration) && (duration as number) > longest) {
			longest = duration as number;
		}
	});

	return longest > 0
		? longest
		: (ctx.alignment as Alignment).referenceExtent.end;
}

export function setRuntimeActiveVariant(
	ctx: TrackSwitchControllerImpl,
	runtime: TrackRuntime,
	variant: TrackSourceVariant,
): boolean {
	void ctx;
	const source =
		variant === "synced" ? runtime.syncedSource : runtime.baseSource;
	if (!source?.buffer) {
		return false;
	}

	runtime.activeVariant = variant;
	runtime.buffer = source.buffer;
	runtime.timing = source.timing;
	runtime.sourceSampleRate = source.sourceSampleRate;
	runtime.loudnessGain = source.loudnessGain;
	runtime.sourceIndex = source.sourceIndex;
	runtime.waveformSummary = source.waveformSummary;
	return true;
}

export function shouldBypassAlignmentMapping(
	ctx: TrackSwitchControllerImpl,
	trackIndex: number,
): boolean {
	const runtime = ctx.runtimes[trackIndex];
	return (
		!!runtime && runtime.activeVariant === "synced" && !!runtime.syncedSource
	);
}

export async function initializeAlignmentMode(
	ctx: TrackSwitchControllerImpl,
): Promise<string | null> {
	if (!ctx.alignmentConfig) {
		return "Sync mode requires init.alignment configuration.";
	}

	try {
		const profiles = await probeMediaProfiles({
			media: ctx.media,
			runtimes: ctx.runtimes,
			midiBySource: ctx.renderer.getLoadedMidiBySource(),
			measuresByMediaId: ctx.sheetMusicEngine.getAvailableMeasuresByMediaId(),
		});
		ctx.alignment = await buildAlignment(
			ctx.alignmentConfig,
			ctx.media,
			profiles,
		);
	} catch (error) {
		return error instanceof Error
			? error.message
			: "Failed to build alignment mappings.";
	}

	ctx.globalSyncEnabled = false;
	ctx.syncLockedTrackIndexes.clear();
	ctx.preSyncSoloStates = null;
	ctx.restoreSoloMode();
	const alignment = ctx.alignment as Alignment;
	ctx.longestDuration = alignment.referenceExtent.end;
	applyReferenceReadoutUnit(ctx);
	ctx.renderer.setCoverageResolver(
		(timeline: string) => isTimelineCovered(ctx, timeline),
		String(alignment.referenceTimeline),
	);
	ctx.renderer.setImageTimelineContextResolver(
		(surface: ImageSeekSurfaceMetadata) => ctx.getImageTimelineContext(surface),
	);

	const activeTrackIndex = ctx.getActiveSoloTrackIndex();
	if (activeTrackIndex >= 0) {
		const mappedTrackTime = ctx.referenceToTrackTime(
			activeTrackIndex,
			ctx.state.position,
		);
		const mappedReferenceTime = ctx.trackToReferenceTime(
			activeTrackIndex,
			mappedTrackTime,
		);
		ctx.dispatch({
			type: "set-position",
			position: clamp(mappedReferenceTime, 0, ctx.longestDuration),
		});
	}

	return null;
}

/**
 * Whether the alignment actually says where the current reference position
 * falls on `timeline`. Outside that span a projection is an assumption, so the
 * surface holds at its boundary and is marked as such.
 */
function isTimelineCovered(
	ctx: TrackSwitchControllerImpl,
	timeline: string,
): boolean {
	const alignment = ctx.alignment;
	if (!alignment) {
		return true;
	}

	return alignment.projection.isCovered(
		alignment.referenceTimeline,
		timelineId(timeline),
		ctx.state.position,
	);
}

/**
 * Every timeline renders in the unit its own column was declared in, converting
 * back out of the native coordinate the player runs on: the main timer for the
 * reference timeline, a waveform or piano roll timer for its own medium.
 */
export function applyReferenceReadoutUnit(
	ctx: TrackSwitchControllerImpl,
): void {
	const alignment = ctx.alignment;
	if (!alignment) {
		applyImplicitTimelineReadouts(ctx);
		return;
	}

	const readouts = new Map<string, TimelineReadout>();
	alignment.timelines.forEach((timeline, id) => {
		const { unit } = timeline;
		const profile = alignment.profiles.get(id);
		readouts.set(String(id), {
			unit,
			toReadout: (nativeValue: number) =>
				profile
					? referenceReadoutValue(profile, nativeValue, unit)
					: nativeValue,
			fromReadout: (readoutValue: number) =>
				profile
					? referenceNativeValue(profile, readoutValue, unit)
					: readoutValue,
		});
	});
	ctx.renderer.setTimelineReadouts(readouts);

	const { referenceTimeline } = alignment;
	const unit =
		alignment.timelines.get(referenceTimeline)?.unit ?? ("seconds" as const);
	const profile = alignment.profiles.get(referenceTimeline);
	ctx.renderer.setReferenceTimelineUnit(
		unit,
		(referenceValue: number) =>
			profile
				? referenceReadoutValue(profile, referenceValue, unit)
				: referenceValue,
		(readoutValue: number) =>
			profile
				? referenceNativeValue(profile, readoutValue, unit)
				: readoutValue,
	);
}

/**
 * Without an alignment every medium sits on the one implicit timeline, so a
 * `media.timelineUnit` is purely a readout: each surface prints the shared
 * position in the unit of the medium it draws, and the main timer takes the
 * first medium that declares one.
 */
function applyImplicitTimelineReadouts(ctx: TrackSwitchControllerImpl): void {
	const readouts = new Map<string, TimelineReadout>();
	Object.entries(ctx.media).forEach(([mediaId, entry]) => {
		const unit = entry.timelineUnit;
		if (unit === undefined) {
			return;
		}
		readouts.set(mediaId, {
			unit,
			toReadout: buildImplicitReadout(ctx, mediaId, unit),
			fromReadout: buildImplicitNativeValue(ctx, mediaId, unit),
		});
	});
	ctx.renderer.setTimelineReadouts(readouts);

	const implicit = resolveImplicitTimelineUnit(ctx.media);
	if (!implicit) {
		ctx.renderer.setReferenceTimelineUnit("seconds");
		return;
	}
	ctx.renderer.setReferenceTimelineUnit(
		implicit.unit,
		buildImplicitReadout(ctx, implicit.mediaId, implicit.unit),
		buildImplicitNativeValue(ctx, implicit.mediaId, implicit.unit),
	);
}

function buildImplicitReadout(
	ctx: TrackSwitchControllerImpl,
	mediaId: string,
	unit: TimelineUnit,
): (value: number) => number {
	return (value: number) => {
		const profile = ctx.mediaProfiles.get(timelineId(mediaId));
		return profile ? referenceReadoutValue(profile, value, unit) : value;
	};
}

function buildImplicitNativeValue(
	ctx: TrackSwitchControllerImpl,
	mediaId: string,
	unit: TimelineUnit,
): (value: number) => number {
	return (value: number) => {
		const profile = ctx.mediaProfiles.get(timelineId(mediaId));
		return profile ? referenceNativeValue(profile, value, unit) : value;
	};
}

export function getTrackAlignmentPoints(
	ctx: TrackSwitchControllerImpl,
	trackIndex: number,
): Array<{ referenceTime: number; trackTime: number }> {
	const alignment = ctx.alignment;
	if (!alignment) {
		return [];
	}

	const runtime = ctx.runtimes[trackIndex];
	if (!runtime) {
		return [];
	}

	const trackTimeline = timelineId(runtime.definition.id);
	const reference = alignment.referenceTimeline;
	return anchorPositions(alignment, reference, trackTimeline).map((pair) => ({
		referenceTime: pair.from,
		trackTime: pair.to,
	}));
}

export function getWarpingMatrixContext(
	ctx: TrackSwitchControllerImpl,
): WarpingMatrixRenderContext | undefined {
	const view = ctx.warpingMatrixView;
	const alignment = ctx.alignment;
	if (!ctx.isAlignmentMode() || !view || !alignment) {
		return undefined;
	}

	const xIndex = ctx.runtimes.findIndex(
		(runtime: TrackRuntime) => runtime.definition.id === view.x,
	);
	const yIndex = ctx.runtimes.findIndex(
		(runtime: TrackRuntime) => runtime.definition.id === view.y,
	);
	if (xIndex < 0 || yIndex < 0) {
		return undefined;
	}

	const xTimeline = timelineId(view.x);
	const yTimeline = timelineId(view.y);

	const points: WarpingMatrixDataPoint[] = anchorPositions(
		alignment,
		xTimeline,
		yTimeline,
	).map((pair) => ({ referenceTime: pair.from, trackTime: pair.to }));
	points.sort(
		(a: WarpingMatrixDataPoint, b: WarpingMatrixDataPoint) =>
			a.referenceTime - b.referenceTime,
	);

	const runtimeDuration = (ctx.constructor as typeof TrackSwitchControllerImpl)
		.getRuntimeDuration;
	const xDuration = Number(runtimeDuration(ctx.runtimes[xIndex])) || 0;
	const yDuration = Number(runtimeDuration(ctx.runtimes[yIndex])) || 0;
	const referenceDuration = Math.max(
		xDuration,
		...points.map((point) => point.referenceTime),
		0,
	);
	const trackDuration = Math.max(
		yDuration,
		...points.map((point) => point.trackTime),
		0,
	);

	const currentReferenceTime = clamp(
		alignment.projection.canProject(alignment.referenceTimeline, xTimeline)
			? alignment.projection.project(
					ctx.state.position,
					alignment.referenceTimeline,
					xTimeline,
				)
			: ctx.state.position,
		0,
		referenceDuration,
	);

	const currentScoreBpm = ctx.sheetMusicEngine.resolveReferenceBpm(
		ctx.state.position,
		false,
	);

	return {
		enabled: true,
		syncEnabled: ctx.globalSyncEnabled,
		referenceDuration: referenceDuration,
		currentReferenceTime: currentReferenceTime,
		currentScoreBpm: currentScoreBpm,
		columnOrder: [view.y],
		trackSeries: [
			{ trackIndex: yIndex, columnKey: view.y, points, trackDuration },
		],
	};
}

export function getAudibleTrackIndexesForWarpingMatrix(
	ctx: TrackSwitchControllerImpl,
): number[] {
	const selected = ctx.runtimes
		.map((runtime: TrackRuntime, index: number) =>
			runtime.state.solo ? index : -1,
		)
		.filter((index: number) => index >= 0);

	if (selected.length > 0) {
		return selected;
	}

	return ctx.runtimes.map((_runtime: TrackRuntime, index: number) => index);
}

export function getActiveSoloTrackIndex(
	ctx: TrackSwitchControllerImpl,
): number {
	for (let index = 0; index < ctx.runtimes.length; index += 1) {
		if (ctx.runtimes[index].state.solo) {
			return index;
		}
	}

	const alwaysResolvesToOne =
		ctx.soloMode === "alignment" || ctx.hasAnyExclusiveGroup();
	if (alwaysResolvesToOne && ctx.runtimes.length > 0) {
		return 0;
	}

	return -1;
}

export function isSyncReferenceAxisActive(
	ctx: TrackSwitchControllerImpl,
): boolean {
	void ctx;
	return false;
}

export function isGlobalSyncAvailable(ctx: TrackSwitchControllerImpl): boolean {
	if (!ctx.isAlignmentMode()) {
		return false;
	}

	return ctx.runtimes.some((runtime: TrackRuntime) =>
		ctx.hasSyncedVariant(runtime),
	);
}

export function getAlignmentPlaybackTrackIndex(
	ctx: TrackSwitchControllerImpl,
): number {
	const activeSoloTrackIndex = ctx.getActiveSoloTrackIndex();
	if (activeSoloTrackIndex >= 0) {
		return activeSoloTrackIndex;
	}

	if (!ctx.globalSyncEnabled) {
		return -1;
	}

	for (let index = 0; index < ctx.runtimes.length; index += 1) {
		const runtime = ctx.runtimes[index];
		if (!runtime || ctx.syncLockedTrackIndexes.has(index)) {
			continue;
		}

		if (runtime.activeVariant === "synced" && runtime.buffer) {
			return index;
		}
	}

	return -1;
}

/** Local playback time of the lead track, in its own coordinate. */
export function currentPlaybackTrackPosition(
	ctx: TrackSwitchControllerImpl,
): number {
	return ctx.audioEngine.currentTime - ctx.state.startTime;
}

export function currentPlaybackReferencePosition(
	ctx: TrackSwitchControllerImpl,
): number {
	const rawPlaybackPosition = currentPlaybackTrackPosition(ctx);
	if (!ctx.isAlignmentMode() || ctx.alignmentPlaybackTrackIndex === null) {
		return rawPlaybackPosition;
	}

	return ctx.trackToReferenceTime(
		ctx.alignmentPlaybackTrackIndex,
		rawPlaybackPosition,
		ctx.state.position,
	);
}

/**
 * The anchor the sounding audio establishes: the lead track's own clock, on the
 * lead track's own timeline. Null outside alignment mode, and for a synchronized
 * source, which already runs in reference coordinates.
 */
export function currentPlaybackAnchor(
	ctx: TrackSwitchControllerImpl,
): PlaybackOrigin | null {
	const trackIndex = ctx.alignmentPlaybackTrackIndex;
	if (!ctx.isAlignmentMode() || trackIndex === null) {
		return null;
	}
	if (ctx.shouldBypassAlignmentMapping(trackIndex)) {
		return null;
	}

	const runtime = ctx.runtimes[trackIndex];
	if (!runtime) {
		return null;
	}

	return {
		timeline: timelineId(runtime.definition.id),
		value: currentPlaybackTrackPosition(ctx),
	};
}

/** The anchor a track's own timeline would carry for a local position on it. */
export function trackPlaybackAnchor(
	ctx: TrackSwitchControllerImpl,
	trackIndex: number,
	trackTime: number,
): PlaybackOrigin | null {
	const runtime = ctx.runtimes[trackIndex];
	if (!ctx.isAlignmentMode() || !runtime) {
		return null;
	}
	if (ctx.shouldBypassAlignmentMapping(trackIndex)) {
		return null;
	}

	return { timeline: timelineId(runtime.definition.id), value: trackTime };
}

/** Tolerance for "this anchor still describes that reference position". */
const REFERENCE_POSITION_EPSILON = 1e-6;

/**
 * An anchor read on `timeline`. Where the alignment holds one reference value
 * across a stretch of a timeline, going through the reference collapses that
 * stretch to a single point; the anchor carries the full-resolution position,
 * and the projection graph has a direct edge between any two aligned timelines,
 * so a surface can be placed inside the held stretch instead of at its edge.
 *
 * A click past the last thing a track's alignment actually annotates still
 * reports *some* raw local time — the audio keeps playing under `hold`, and
 * `getSeekMetrics` doesn't know coverage from geometry. `anchor.value` on
 * `anchor.timeline` itself carries that raw time straight through with no
 * projection to clamp it, so it's clamped here instead: under `hold`/`error`
 * a position outside coverage is exactly what a seek should never produce.
 */
export function projectAnchor(
	ctx: TrackSwitchControllerImpl,
	anchor: PlaybackOrigin | null,
	timeline: TimelineId,
): number | null {
	const alignment = ctx.alignment;
	if (!alignment || !anchor) {
		return null;
	}
	if (anchor.timeline === timeline) {
		return clampToTimelineCoverage(alignment, timeline, anchor.value);
	}
	if (!alignment.projection.canProject(anchor.timeline, timeline)) {
		return null;
	}

	return alignment.projection.project(anchor.value, anchor.timeline, timeline);
}

function clampToTimelineCoverage(
	alignment: Alignment,
	timeline: TimelineId,
	value: number,
): number {
	const coverage = alignment.projection.coverage(
		timeline,
		alignment.referenceTimeline,
	);
	if (!coverage) {
		return value;
	}

	return clamp(value, coverage.start, coverage.end);
}

/**
 * The current position on `timeline`, taken from the anchor the position was set
 * with rather than from the reference position — see `projectAnchor`.
 *
 * Null when there is no anchor, when it no longer produces `referencePosition`
 * — which is how any reference-coordinate seek invalidates it — or when its
 * timeline does not reach `timeline`.
 */
export function playbackPositionOn(
	ctx: TrackSwitchControllerImpl,
	timeline: TimelineId,
	referencePosition: number = ctx.state.position,
): number | null {
	const alignment = ctx.alignment;
	const anchor = ctx.state.positionOrigin;
	if (!alignment || !anchor) {
		return null;
	}

	const { projection, referenceTimeline } = alignment;
	if (!projection.canProject(anchor.timeline, referenceTimeline)) {
		return null;
	}

	// Resolved towards `referencePosition`, so on a timeline walked twice by a
	// repeat the question stays "could the anchor be this position" rather than
	// "does the default pass happen to land there". Not clamped to
	// `longestDuration`: under `outsideCoverage: "extrapolate"` playback keeps
	// advancing past the reference's playable extent, and `referencePosition`
	// (typically the live, equally unclamped `currentPlaybackReferencePosition`)
	// tracks right along with it — clamping only this side would make that
	// ordinary extrapolation look like a stale anchor.
	const anchorReference = Math.max(
		0,
		projection.project(
			anchor.value,
			anchor.timeline,
			referenceTimeline,
			referencePosition,
		),
	);
	if (
		Math.abs(anchorReference - referencePosition) > REFERENCE_POSITION_EPSILON
	) {
		return null;
	}

	return projectAnchor(ctx, anchor, timeline);
}

/** `playbackPositionOn` for a track, addressed by index. */
export function trackPlaybackPosition(
	ctx: TrackSwitchControllerImpl,
	trackIndex: number,
	referencePosition: number = ctx.state.position,
): number | null {
	const runtime = ctx.runtimes[trackIndex];
	if (!runtime || ctx.shouldBypassAlignmentMapping(trackIndex)) {
		return null;
	}

	return playbackPositionOn(
		ctx,
		timelineId(runtime.definition.id),
		referencePosition,
	);
}

export function referenceToTrackTime(
	ctx: TrackSwitchControllerImpl,
	trackIndex: number,
	referenceTime: number,
): number {
	const alignment = ctx.alignment;
	if (!alignment) {
		return referenceTime;
	}
	if (ctx.shouldBypassAlignmentMapping(trackIndex)) {
		return referenceTime;
	}

	const runtime = ctx.runtimes[trackIndex];
	if (!runtime) {
		return referenceTime;
	}

	const trackTimeline = timelineId(runtime.definition.id);
	if (
		!alignment.projection.canProject(alignment.referenceTimeline, trackTimeline)
	) {
		return referenceTime;
	}

	return alignment.projection.project(
		referenceTime,
		alignment.referenceTimeline,
		trackTimeline,
	);
}

export function trackToReferenceTime(
	ctx: TrackSwitchControllerImpl,
	trackIndex: number,
	trackTime: number,
	preferredReferenceTime?: number,
): number {
	const alignment = ctx.alignment;
	if (!alignment) {
		return trackTime;
	}
	if (ctx.shouldBypassAlignmentMapping(trackIndex)) {
		return trackTime;
	}

	const runtime = ctx.runtimes[trackIndex];
	if (!runtime) {
		return trackTime;
	}

	const trackTimeline = timelineId(runtime.definition.id);
	if (
		!alignment.projection.canProject(trackTimeline, alignment.referenceTimeline)
	) {
		return trackTime;
	}

	return alignment.projection.project(
		trackTime,
		trackTimeline,
		alignment.referenceTimeline,
		preferredReferenceTime,
	);
}

export function handleAlignmentTrackSwitch(
	ctx: TrackSwitchControllerImpl,
	nextActiveTrackIndex: number,
): void {
	if (!ctx.alignment || nextActiveTrackIndex < 0) {
		return;
	}

	const referenceAtSwitch = ctx.state.playing
		? ctx.currentPlaybackReferencePosition()
		: ctx.state.position;
	// Where the outgoing track stands projects straight onto the incoming one,
	// so a switch made inside a stretch the reference holds at one value lands at
	// the matching spot rather than at the start of that stretch.
	const anchorAtSwitch = ctx.state.playing
		? currentPlaybackAnchor(ctx)
		: ctx.state.positionOrigin;
	const nextRuntime = ctx.runtimes[nextActiveTrackIndex];
	const mappedTrackTime =
		(nextRuntime
			? projectAnchor(
					ctx,
					anchorAtSwitch,
					timelineId(nextRuntime.definition.id),
				)
			: null) ??
		ctx.referenceToTrackTime(nextActiveTrackIndex, referenceAtSwitch);
	const mappedReferenceTime = clamp(
		ctx.trackToReferenceTime(
			nextActiveTrackIndex,
			mappedTrackTime,
			referenceAtSwitch,
		),
		0,
		ctx.longestDuration,
	);
	const anchor = ctx.trackPlaybackAnchor(nextActiveTrackIndex, mappedTrackTime);

	if (ctx.state.playing) {
		ctx.stopAudio();
		ctx.dispatch({
			type: "set-position",
			position: mappedReferenceTime,
			anchor: anchor,
		});
		ctx.startAudio(mappedReferenceTime);
	} else {
		ctx.dispatch({
			type: "set-position",
			position: mappedReferenceTime,
			anchor: anchor,
		});
	}

	ctx.updateMainControls();
}

/**
 * How a selection is scoped right now.
 *
 * - `lists` — every `trackList` decides for itself, the plain multitrack player.
 * - `alignment` — each timeline sits at its own audible position, so the whole
 *   player resolves to one *solo unit* (see `soloUnits`) at a time.
 * - `free` — nothing is exclusive; global sync runs every track on a shared
 *   clock, so they may all sound at once.
 */
export type SoloMode = "lists" | "alignment" | "free";

/**
 * One selectable timeline of the alignment hierarchy's first level: a single
 * track of a list with a `comparisonGroup`, or a whole list that declares none — those
 * tracks share one timeline and mix freely on the second level.
 */
export interface SoloUnit {
	groupIndex: number;
	trackIndexes: number[];
	/** Whether the unit is the list as a whole rather than one of its rows. */
	wholeList: boolean;
}

export function soloUnits(ctx: TrackSwitchControllerImpl): SoloUnit[] {
	if (ctx.soloMode !== "alignment") {
		return [];
	}

	const units: SoloUnit[] = [];
	ctx.trackGroups.forEach((group) => {
		const trackIndexes = ctx.trackIndexesInGroup(group.groupIndex);
		if (trackIndexes.length === 0) {
			return;
		}

		if (group.exclusiveSolo) {
			trackIndexes.forEach((trackIndex) => {
				units.push({
					groupIndex: group.groupIndex,
					trackIndexes: [trackIndex],
					wholeList: false,
				});
			});
			return;
		}

		units.push({
			groupIndex: group.groupIndex,
			trackIndexes: trackIndexes,
			wholeList: true,
		});
	});

	return units;
}

function isUnitActive(ctx: TrackSwitchControllerImpl, unit: SoloUnit): boolean {
	return unit.trackIndexes.some(
		(trackIndex) => ctx.runtimes[trackIndex].state.solo,
	);
}

/** The unit that currently sounds, or -1 while nothing is selected. */
export function activeSoloUnitIndex(ctx: TrackSwitchControllerImpl): number {
	return soloUnits(ctx).findIndex((unit) => isUnitActive(ctx, unit));
}

export function isTrackListUnitActive(
	ctx: TrackSwitchControllerImpl,
	groupIndex: number,
): boolean {
	return ctx
		.trackIndexesInGroup(groupIndex)
		.some((trackIndex) => ctx.runtimes[trackIndex].state.solo);
}

/**
 * A whole-list unit keeps the mix it was left with, so switching timelines and
 * coming back does not throw the listener's stem selection away.
 */
function rememberTrackListSelection(
	ctx: TrackSwitchControllerImpl,
	groupIndex: number,
): void {
	const selected: TrackId[] = ctx
		.trackIndexesInGroup(groupIndex)
		.filter((trackIndex) => ctx.runtimes[trackIndex].state.solo)
		.map((trackIndex) => ctx.runtimes[trackIndex].definition.id);

	if (selected.length > 0) {
		ctx.trackListSoloMemory.set(groupIndex, selected);
	}
}

/**
 * Brings a whole-list unit back: its remembered mix, or all of its tracks the
 * first time around. `focusTrackIndex` is the row that asked for the switch and
 * always ends up audible.
 */
function restoreTrackListSelection(
	ctx: TrackSwitchControllerImpl,
	groupIndex: number,
	focusTrackIndex: number | null,
): void {
	const trackIndexes = ctx.trackIndexesInGroup(groupIndex);
	const remembered = ctx.trackListSoloMemory.get(groupIndex) ?? [];
	const rememberedIndexes = trackIndexes.filter((trackIndex) =>
		remembered.includes(ctx.runtimes[trackIndex].definition.id),
	);
	const selection =
		rememberedIndexes.length > 0 ? rememberedIndexes : trackIndexes;

	trackIndexes.forEach((trackIndex) => {
		ctx.runtimes[trackIndex].state.solo =
			selection.includes(trackIndex) || trackIndex === focusTrackIndex;
	});
}

/** Silences every unit the predicate rejects, remembering what it had selected. */
function muteUnitsExcept(
	ctx: TrackSwitchControllerImpl,
	keep: (unit: SoloUnit) => boolean,
): void {
	soloUnits(ctx).forEach((unit) => {
		if (keep(unit)) {
			return;
		}

		if (unit.wholeList) {
			rememberTrackListSelection(ctx, unit.groupIndex);
		}

		unit.trackIndexes.forEach((trackIndex) => {
			ctx.runtimes[trackIndex].state.solo = false;
		});
	});
}

/**
 * The alignment reading of a solo click. Level one picks the unit the clicked
 * row belongs to; level two toggles the row inside an already selected list,
 * where the last remaining selection stays put — the selected audio supplies
 * the physical playback clock.
 */
export function toggleSoloWithinAlignment(
	ctx: TrackSwitchControllerImpl,
	trackIndex: number,
	groupIndex: number,
	exclusive: boolean,
): void {
	const group = ctx.trackGroups[groupIndex];
	if (!group || exclusive || group.exclusiveSolo) {
		muteUnitsExcept(ctx, () => false);
		ctx.runtimes[trackIndex].state.solo = true;
		return;
	}

	const wasActive = isTrackListUnitActive(ctx, groupIndex);
	muteUnitsExcept(ctx, (unit) => unit.groupIndex === groupIndex);

	if (!wasActive) {
		restoreTrackListSelection(ctx, groupIndex, trackIndex);
		return;
	}

	const runtime = ctx.runtimes[trackIndex];
	const soloedCount = ctx
		.trackIndexesInGroup(groupIndex)
		.filter((index) => ctx.runtimes[index].state.solo).length;
	if (runtime.state.solo && soloedCount <= 1) {
		return;
	}

	runtime.state.solo = !runtime.state.solo;
}

/** Level one for a whole-list unit — the row that selects the list itself. */
export function selectTrackListUnit(
	ctx: TrackSwitchControllerImpl,
	groupIndex: number,
): void {
	const group = ctx.trackGroups[groupIndex];
	if (
		ctx.soloMode !== "alignment" ||
		!group ||
		group.exclusiveSolo ||
		isTrackListUnitActive(ctx, groupIndex)
	) {
		return;
	}

	const previousUnitIndex = activeSoloUnitIndex(ctx);
	muteUnitsExcept(ctx, (unit) => unit.groupIndex === groupIndex);
	restoreTrackListSelection(ctx, groupIndex, null);

	ctx.applyTrackProperties();
	ctx.finishSoloUnitSwitch(previousUnitIndex);
}

/**
 * Narrows the current solo states down to a single selection of the active mode.
 * A mode change or a preset can leave several timelines selected at once, which
 * alignment cannot play.
 */
export function collapseToSingleSelection(
	ctx: TrackSwitchControllerImpl,
): void {
	if (ctx.soloMode === "free") {
		return;
	}

	if (ctx.soloMode === "lists") {
		const collapsed = new Set<number>();
		ctx.trackGroups.forEach((group) => {
			const comparisonGroup = group.comparisonGroup;
			if (comparisonGroup === null || collapsed.has(comparisonGroup)) {
				return;
			}
			collapsed.add(comparisonGroup);

			// Lists sharing a comparisonGroup are one selection, so they collapse together.
			const trackIndexes = ctx.trackIndexesInSoloScope(group.groupIndex);
			if (trackIndexes.length === 0) {
				return;
			}

			const selectedIndex = trackIndexes.find(
				(trackIndex) => ctx.runtimes[trackIndex].state.solo,
			);
			const targetIndex = selectedIndex ?? trackIndexes[0];
			trackIndexes.forEach((trackIndex) => {
				ctx.runtimes[trackIndex].state.solo = trackIndex === targetIndex;
			});
		});
		return;
	}

	const units = soloUnits(ctx);
	if (units.length === 0) {
		return;
	}

	const activeIndex = units.findIndex((unit) => isUnitActive(ctx, unit));
	const unit = units[activeIndex >= 0 ? activeIndex : 0];
	muteUnitsExcept(ctx, (candidate) => candidate === unit);

	if (!unit.wholeList) {
		ctx.runtimes[unit.trackIndexes[0]].state.solo = true;
		return;
	}

	if (!isTrackListUnitActive(ctx, unit.groupIndex)) {
		restoreTrackListSelection(ctx, unit.groupIndex, null);
	}
}
