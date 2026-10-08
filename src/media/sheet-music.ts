import osmdPackage from "opensheetmusicdisplay";
import { clamp, clamp01, clampNonNegative } from "../shared/math";
import { requestText } from "../shared/request-text";
import type { MeasureMapPoint } from "../types";

export interface SheetMusicMeasureMapsByAxis {
	base: MeasureMapPoint[] | null;
	sync: MeasureMapPoint[] | null;
}

interface SheetMusicProjectedTempoSegmentsByAxis {
	base: SheetMusicProjectedTempoSegment[] | null;
	sync: SheetMusicProjectedTempoSegment[] | null;
}

export interface SheetMusicHostConfig {
	host: HTMLElement;
	scrollContainer: HTMLElement | null;
	source: string;
	/** Alignment column naming this score's timeline; null when it is unaligned. */
	measureColumn: string | null;
	renderScale: number | null;
	followPlayback: boolean;
	cursorColor: string;
	cursorAlpha: number;
}

interface SheetMusicTempoSegment {
	measure: number;
	bpm: number;
}

interface SheetMusicProjectedTempoSegment {
	referenceStartTime: number;
	bpm: number;
}

export interface SheetMusicEntryModel {
	host: HTMLElement;
	scrollContainer: HTMLElement | null;
	source: string;
	measureColumn: string | null;
	renderScale: number | null;
	followPlayback: boolean;
	cursorColor: string;
	cursorAlpha: number;
	osmd: OpenSheetMusicDisplayType | null;
	measureCursor: {
		reset?: () => void;
		show?: () => void;
		nextMeasure?: () => void;
		previousMeasure?: () => void;
		Iterator?: {
			CurrentMeasure?: {
				MeasureNumber?: number;
			};
		};
		cursorElement?: Element | null;
	} | null;
	syncReferenceTimeEnabled: boolean;
	measureMaps: SheetMusicMeasureMapsByAxis;
	measureMap: MeasureMapPoint[] | null;
	projectedTempoSegmentsByAxis: SheetMusicProjectedTempoSegmentsByAxis;
	projectedTempoSegments: SheetMusicProjectedTempoSegment[] | null;
	fallbackTempoBpm: number | null;
	measureNumbering: ScoreMeasureNumbering;
	syncEnabled: boolean;
	/** Printed measure number the cursor currently sits on. */
	targetMeasure: number | null;
	clickListener: ((event: MouseEvent) => void) | null;
	touchStartListener: ((event: TouchEvent) => void) | null;
	touchMoveListener: ((event: TouchEvent) => void) | null;
	touchListener: ((event: TouchEvent) => void) | null;
	touchTapState: {
		identifier: number;
		startClientX: number;
		startClientY: number;
		moved: boolean;
	} | null;
	lastRenderedHostWidth: number;
}

type SheetMusicCursor = NonNullable<SheetMusicEntryModel["measureCursor"]>;

const DEFAULT_CURSOR_COLOR = "#999999";
const DEFAULT_CURSOR_ALPHA = 0.4;
const DEFAULT_GRAPHICAL_MEASURE_CLASS_NAME = "GraphicalMeasure";
const MIN_OSMD_ZOOM = 0.05;
const MAX_OSMD_ZOOM = 8;
const TOUCH_TAP_MOVE_THRESHOLD_PX = 10;
const MIN_HOST_WIDTH_DELTA_FOR_RERENDER_PX = 2;

function sanitizeRenderScale(value: number | null | undefined): number | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return null;
	}

	return value;
}

function sanitizeCursorAlpha(value: number): number {
	return Number.isFinite(value) ? clamp01(value) : DEFAULT_CURSOR_ALPHA;
}

type OpenSheetMusicDisplayModule = typeof import("opensheetmusicdisplay");

const osmdInterop = osmdPackage as unknown as OpenSheetMusicDisplayModule;

const CursorType = osmdInterop.CursorType;
const GraphicalMeasure = osmdInterop.GraphicalMeasure;
const OpenSheetMusicDisplay = osmdInterop.OpenSheetMusicDisplay;
const PointF2D = osmdInterop.PointF2D;

type OpenSheetMusicDisplayType =
	import("opensheetmusicdisplay").OpenSheetMusicDisplay;
type PointF2DType = import("opensheetmusicdisplay").PointF2D;

/**
 * A score carries two measure numberings, and they only coincide when the score
 * happens to start at bar 1:
 *
 * - the **internal** number, OSMD's own counter, which always runs 1..N;
 * - the **printed** number, which is the MusicXML `<measure number>` whenever it
 *   is an integer — the number a reader sees engraved on the page. This is what
 *   `SourceMeasure.getPrintedMeasureNumber()` returns under OSMD's default
 *   `UseXMLMeasureNumbers` rule, and it is what OSMD renders.
 *
 * Everything facing the outside world — the `measure` column of an alignment
 * CSV, marker positions, the score timeline's extent — speaks printed numbers,
 * so an excerpt starting at bar 231 is annotated as 231 rather than renumbered
 * down to 1. Cursor stepping speaks internal numbers, because only those are
 * guaranteed unique and gapless: printed numbers may repeat or jump.
 *
 * This table is the single crossing point between the two.
 */
interface ScoreMeasureNumbering {
	/** Printed numbers the score covers, ascending and unique. */
	printed: number[];
	printedSet: Set<number>;
	internalByPrinted: Map<number, number>;
	printedByInternal: Map<number, number>;
}

function createEmptyMeasureNumbering(): ScoreMeasureNumbering {
	return {
		printed: [],
		printedSet: new Set<number>(),
		internalByPrinted: new Map<number, number>(),
		printedByInternal: new Map<number, number>(),
	};
}

function buildMeasureNumbering(
	osmd: OpenSheetMusicDisplayType,
): ScoreMeasureNumbering {
	const sourceMeasures = osmd.Sheet?.SourceMeasures;
	if (!Array.isArray(sourceMeasures)) {
		return createEmptyMeasureNumbering();
	}

	const numbering = createEmptyMeasureNumbering();

	sourceMeasures.forEach((measure) => {
		const internal = Math.floor(Number(measure?.MeasureNumber));
		if (!Number.isFinite(internal)) {
			return;
		}

		const printed = Math.floor(Number(measure.getPrintedMeasureNumber()));
		if (!Number.isFinite(printed)) {
			return;
		}

		numbering.printedByInternal.set(internal, printed);
		// A printed number repeated across measures (a written-out repeat, say)
		// resolves to its first occurrence, so seeking to it always lands on the
		// same bar.
		if (!numbering.internalByPrinted.has(printed)) {
			numbering.internalByPrinted.set(printed, internal);
			numbering.printedSet.add(printed);
		}
	});

	numbering.printed = Array.from(numbering.printedSet).sort((a, b) => a - b);

	return numbering;
}

interface ParsedMusicXmlTempoMap {
	fallbackTempoBpm: number | null;
	measureSegments: SheetMusicTempoSegment[];
}

interface MeasureMapPointLike {
	start: number;
	measure: number;
}

async function loadProjectedTempoMaps(
	musicXmlUrl: string,
	measureMaps: SheetMusicMeasureMapsByAxis,
): Promise<{
	fallbackTempoBpm: number | null;
	projectedSegmentsByAxis: SheetMusicProjectedTempoSegmentsByAxis;
}> {
	const xmlText = await requestText(musicXmlUrl, "MusicXML source");
	const parsed = parseMusicXmlTempoMap(xmlText);

	return {
		fallbackTempoBpm: parsed.fallbackTempoBpm,
		projectedSegmentsByAxis: {
			base: measureMaps.base
				? projectTempoSegmentsToReferenceTime(
						parsed.measureSegments,
						measureMaps.base,
					)
				: null,
			sync: measureMaps.sync
				? projectTempoSegmentsToReferenceTime(
						parsed.measureSegments,
						measureMaps.sync,
					)
				: null,
		},
	};
}

function parseMusicXmlTempoMap(xmlText: string): ParsedMusicXmlTempoMap {
	const parser = new DOMParser();
	const documentNode = parser.parseFromString(xmlText, "application/xml");
	if (documentNode.querySelector("parsererror")) {
		throw new Error("Failed to parse MusicXML tempo map.");
	}

	const firstPart = documentNode.querySelector(
		"score-partwise > part, score-timewise > part",
	);
	if (!firstPart) {
		return {
			fallbackTempoBpm: null,
			measureSegments: [],
		};
	}

	const measureSegments: SheetMusicTempoSegment[] = [];
	let fallbackTempoBpm: number | null = null;

	firstPart.querySelectorAll("measure").forEach((measureElement) => {
		const measureNumber = parseMeasureNumber(
			measureElement.getAttribute("number"),
		);
		const bpm = extractMeasureTempoBpm(measureElement);
		if (bpm === null) {
			return;
		}

		if (fallbackTempoBpm === null) {
			fallbackTempoBpm = bpm;
		}

		if (measureNumber === null) {
			return;
		}

		const previous = measureSegments[measureSegments.length - 1];
		if (previous && previous.measure === measureNumber) {
			previous.bpm = bpm;
			return;
		}

		measureSegments.push({
			measure: measureNumber,
			bpm: bpm,
		});
	});

	return {
		fallbackTempoBpm: fallbackTempoBpm,
		measureSegments: measureSegments,
	};
}

function parseMeasureNumber(value: string | null): number | null {
	if (value === null) {
		return null;
	}

	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
}

function extractMeasureTempoBpm(measureElement: Element): number | null {
	const directionElements = Array.from(
		measureElement.querySelectorAll(":scope > direction"),
	);
	for (let index = 0; index < directionElements.length; index += 1) {
		const directionElement = directionElements[index];
		const metronomeBpm = parseBpmValue(
			directionElement.querySelector("direction-type > metronome > per-minute")
				?.textContent ?? null,
		);
		if (metronomeBpm !== null) {
			return metronomeBpm;
		}

		const soundBpm = parseBpmValue(
			directionElement.querySelector("sound")?.getAttribute("tempo") ?? null,
		);
		if (soundBpm !== null) {
			return soundBpm;
		}
	}

	return null;
}

function parseBpmValue(rawValue: string | null): number | null {
	if (typeof rawValue !== "string") {
		return null;
	}

	const match = rawValue.match(/-?\d+(?:\.\d+)?/);
	if (!match) {
		return null;
	}

	const numeric = Number(match[0]);
	if (!Number.isFinite(numeric) || numeric <= 0) {
		return null;
	}

	return numeric;
}

function projectTempoSegmentsToReferenceTime(
	measureSegments: SheetMusicTempoSegment[],
	measureMap: MeasureMapPointLike[] | null,
): SheetMusicProjectedTempoSegment[] {
	if (!measureMap || measureMap.length === 0) {
		return [];
	}

	const projectedSegments: SheetMusicProjectedTempoSegment[] = [];
	measureSegments.forEach((segment) => {
		const referenceStartTime = resolveReferenceStartForMeasure(
			measureMap,
			segment.measure,
		);
		if (!Number.isFinite(referenceStartTime)) {
			return;
		}

		const previous = projectedSegments[projectedSegments.length - 1];
		if (previous && previous.referenceStartTime === referenceStartTime) {
			previous.bpm = segment.bpm;
			return;
		}

		projectedSegments.push({
			referenceStartTime: referenceStartTime,
			bpm: segment.bpm,
		});
	});

	return projectedSegments;
}

function resolveReferenceStartForMeasure(
	measureMap: MeasureMapPointLike[],
	targetMeasure: number,
): number {
	let firstExactStart: number | null = null;
	let lastLowerStart: number | null = null;

	for (let index = 0; index < measureMap.length; index += 1) {
		const point = measureMap[index];
		const mappedMeasure = Math.floor(point.measure);

		if (mappedMeasure === Math.floor(targetMeasure)) {
			if (firstExactStart === null) {
				firstExactStart = point.start;
			}
			continue;
		}

		if (mappedMeasure < targetMeasure) {
			lastLowerStart = point.start;
		}
	}

	if (firstExactStart !== null) {
		return firstExactStart;
	}

	if (lastLowerStart !== null) {
		return lastLowerStart;
	}

	return measureMap[0].start;
}

interface SheetMusicScrollContext {
	rebindMeasureCursor(
		entry: SheetMusicEntryModel,
	): SheetMusicEntryModel["measureCursor"];
	refreshCursorElement(entry: SheetMusicEntryModel): void;
}

function ensureCurrentMeasureVisible(
	ctx: SheetMusicScrollContext,
	entry: SheetMusicEntryModel,
): void {
	scrollCurrentMeasure(ctx, entry, false);
}

function centerCurrentMeasureInViewport(
	ctx: SheetMusicScrollContext,
	entry: SheetMusicEntryModel,
): void {
	scrollCurrentMeasure(ctx, entry, true);
}

function scrollCurrentMeasure(
	ctx: SheetMusicScrollContext,
	entry: SheetMusicEntryModel,
	forceCenter: boolean,
): void {
	if (!entry.followPlayback || !entry.syncEnabled || !entry.scrollContainer) {
		return;
	}

	const cursor = ctx.rebindMeasureCursor(entry);
	if (!cursor) {
		return;
	}

	ctx.refreshCursorElement(entry);
	if (!(cursor.cursorElement instanceof Element)) {
		return;
	}

	const scrollContainer = entry.scrollContainer;
	const clientHeight = scrollContainer.clientHeight;
	const maxScrollTop = scrollContainer.scrollHeight - clientHeight;
	if (
		!Number.isFinite(maxScrollTop) ||
		maxScrollTop <= 1 ||
		clientHeight <= 0
	) {
		return;
	}

	const cursorRect = cursor.cursorElement.getBoundingClientRect();
	const viewportRect = scrollContainer.getBoundingClientRect();

	if (
		!Number.isFinite(cursorRect.top) ||
		!Number.isFinite(cursorRect.bottom) ||
		!Number.isFinite(viewportRect.top) ||
		!Number.isFinite(viewportRect.bottom)
	) {
		return;
	}

	const viewportTop = scrollContainer.scrollTop;
	const viewportBottom = viewportTop + clientHeight;
	const cursorTop = viewportTop + (cursorRect.top - viewportRect.top);
	const cursorBottom = viewportTop + (cursorRect.bottom - viewportRect.top);
	const padding = clamp(Math.round(clientHeight * 0.12), 8, 24);
	const visibleTop = viewportTop + padding;
	const visibleBottom = viewportBottom - padding;

	const cursorCenter = cursorTop + (cursorBottom - cursorTop) / 2;
	let nextScrollTop = viewportTop;
	if (forceCenter) {
		nextScrollTop = cursorCenter - clientHeight / 2;
	} else if (cursorTop < visibleTop) {
		nextScrollTop = cursorCenter - clientHeight / 2;
	} else if (cursorBottom > visibleBottom) {
		nextScrollTop = cursorCenter - clientHeight / 2;
	} else {
		return;
	}

	const clampedScrollTop = clamp(nextScrollTop, 0, maxScrollTop);
	if (Math.abs(clampedScrollTop - viewportTop) < 0.5) {
		return;
	}

	scrollContainer.scrollTo({
		top: clampedScrollTop,
		behavior: "smooth",
	});
}

interface CursorSyncContext {
	lastPosition: number;
	entries: SheetMusicEntryModel[];
	rebindMeasureCursor(
		entry: SheetMusicEntryModel,
	): SheetMusicEntryModel["measureCursor"];
	ensureCurrentMeasureVisible(entry: SheetMusicEntryModel): void;
}

function updatePosition(
	ctx: CursorSyncContext,
	referencePosition: number,
): void {
	ctx.lastPosition = clampNonNegative(referencePosition);

	ctx.entries.forEach((entry: SheetMusicEntryModel) => {
		if (
			!entry.syncEnabled ||
			!entry.measureMap ||
			entry.measureMap.length === 0
		) {
			return;
		}

		const cursor = ctx.rebindMeasureCursor(entry);
		if (!cursor) {
			return;
		}

		const mappedMeasure = resolveMappedMeasure(
			entry.measureMap,
			ctx.lastPosition,
		);
		if (mappedMeasure === null) {
			return;
		}

		const targetMeasure = resolveAvailableMeasure(entry, mappedMeasure);
		if (targetMeasure === null || targetMeasure === entry.targetMeasure) {
			return;
		}

		moveCursorToMeasure(ctx, entry, targetMeasure);
	});
}

function resolveMappedMeasure(
	measureMap: MeasureMapPoint[],
	position: number,
): number | null {
	if (measureMap.length === 0) {
		return null;
	}

	let low = 0;
	let high = measureMap.length;

	while (low < high) {
		const mid = Math.floor((low + high) / 2);
		if (measureMap[mid].start <= position) {
			low = mid + 1;
		} else {
			high = mid;
		}
	}

	const index = low - 1;
	const selected = index >= 0 ? measureMap[index] : measureMap[0];
	return Math.floor(selected.measure);
}

/** Snaps a printed measure number onto one the score actually covers. */
function resolveAvailableMeasure(
	entry: SheetMusicEntryModel,
	desiredMeasure: number,
): number | null {
	const printed = entry.measureNumbering.printed;
	if (printed.length === 0) {
		return null;
	}

	if (entry.measureNumbering.printedSet.has(desiredMeasure)) {
		return desiredMeasure;
	}

	for (let index = printed.length - 1; index >= 0; index -= 1) {
		const candidate = printed[index];
		if (candidate <= desiredMeasure) {
			return candidate;
		}
	}

	return printed[0];
}

/**
 * Drives the cursor to a printed measure number. The stepping itself runs in
 * internal numbers: they are gapless and unique, so distances are meaningful
 * and a repeated printed number cannot stall the walk.
 */
function moveCursorToMeasure(
	ctx: CursorSyncContext,
	entry: SheetMusicEntryModel,
	targetMeasure: number,
): void {
	const cursor = ctx.rebindMeasureCursor(entry);
	if (!cursor?.reset || !cursor?.nextMeasure || !cursor?.previousMeasure) {
		return;
	}

	const targetInternal =
		entry.measureNumbering.internalByPrinted.get(targetMeasure);
	if (targetInternal === undefined) {
		return;
	}

	const measureCount = entry.measureNumbering.printedByInternal.size;
	let currentInternal = initializeCursorMeasure(entry, cursor);

	const estimatedDistance =
		currentInternal === null
			? measureCount
			: Math.abs(targetInternal - currentInternal);
	const maxSteps = Math.max(
		1,
		Math.min(measureCount + 5, estimatedDistance + 8),
	);
	currentInternal = stepCursorTowardsTarget(
		cursor,
		currentInternal,
		targetInternal,
		maxSteps,
	);

	if (currentInternal !== targetInternal) {
		currentInternal = retryCursorFromReset(entry, cursor, targetInternal);
	}

	entry.targetMeasure =
		currentInternal === null
			? targetMeasure
			: (entry.measureNumbering.printedByInternal.get(currentInternal) ??
				targetMeasure);

	ctx.ensureCurrentMeasureVisible(entry);
}

/** The score's first internal measure number, where the cursor lands on reset. */
function firstInternalMeasure(entry: SheetMusicEntryModel): number | null {
	const firstPrinted = entry.measureNumbering.printed[0];
	if (firstPrinted === undefined) {
		return null;
	}

	return entry.measureNumbering.internalByPrinted.get(firstPrinted) ?? null;
}

function initializeCursorMeasure(
	entry: SheetMusicEntryModel,
	cursor: NonNullable<SheetMusicEntryModel["measureCursor"]>,
): number | null {
	showCursor(cursor);

	let currentMeasure = readCursorMeasure(cursor);
	if (currentMeasure !== null) {
		return currentMeasure;
	}

	cursor.reset?.();
	showCursor(cursor);

	currentMeasure = readCursorMeasure(cursor);
	return currentMeasure === null ? firstInternalMeasure(entry) : currentMeasure;
}

function retryCursorFromReset(
	entry: SheetMusicEntryModel,
	cursor: NonNullable<SheetMusicEntryModel["measureCursor"]>,
	targetMeasure: number,
): number | null {
	cursor.reset?.();
	showCursor(cursor);

	const fallbackMeasure = readCursorMeasure(cursor);
	const initialMeasure =
		fallbackMeasure === null ? firstInternalMeasure(entry) : fallbackMeasure;
	const fallbackMaxSteps = Math.max(
		1,
		entry.measureNumbering.printedByInternal.size + 5,
	);
	return stepCursorTowardsTarget(
		cursor,
		initialMeasure,
		targetMeasure,
		fallbackMaxSteps,
	);
}

function stepCursorTowardsTarget(
	cursor: NonNullable<SheetMusicEntryModel["measureCursor"]>,
	startingMeasure: number | null,
	targetMeasure: number,
	maxSteps: number,
): number | null {
	let currentMeasure = startingMeasure;
	let steps = 0;

	while (
		currentMeasure !== null &&
		currentMeasure !== targetMeasure &&
		steps < maxSteps
	) {
		moveCursorOneStep(cursor, currentMeasure, targetMeasure);

		const nextMeasure = readCursorMeasure(cursor);
		if (nextMeasure === null || nextMeasure === currentMeasure) {
			break;
		}

		currentMeasure = nextMeasure;
		steps += 1;
	}

	return currentMeasure;
}

function moveCursorOneStep(
	cursor: NonNullable<SheetMusicEntryModel["measureCursor"]>,
	currentMeasure: number,
	targetMeasure: number,
): void {
	if (currentMeasure < targetMeasure) {
		cursor.nextMeasure?.();
	} else {
		cursor.previousMeasure?.();
	}
}

function showCursor(
	cursor: NonNullable<SheetMusicEntryModel["measureCursor"]>,
): void {
	cursor.show?.();
}

/** The cursor's position as an internal measure number. */
function readCursorMeasure(
	cursor: NonNullable<SheetMusicEntryModel["measureCursor"]>,
): number | null {
	const raw = cursor.Iterator?.CurrentMeasure?.MeasureNumber;
	if (!Number.isFinite(raw)) {
		return null;
	}

	return Math.floor(raw as number);
}

function resolveReferenceTimeForMeasure(
	measureMap: MeasureMapPoint[],
	clickedMeasure: number,
): number {
	let firstExactStart: number | null = null;
	let lastLowerStart: number | null = null;

	for (let index = 0; index < measureMap.length; index += 1) {
		const point = measureMap[index];
		const mappedMeasure = Math.floor(point.measure);

		if (mappedMeasure === clickedMeasure) {
			if (firstExactStart === null) {
				firstExactStart = point.start;
			}
			continue;
		}

		if (mappedMeasure < clickedMeasure) {
			lastLowerStart = point.start;
		}
	}

	if (firstExactStart !== null) {
		return firstExactStart;
	}

	if (lastLowerStart !== null) {
		return lastLowerStart;
	}

	return measureMap[0].start;
}

interface SheetMusicInteractionContext {
	onSeekReferenceTime: ((referenceTime: number) => void) | null;
	resolveAvailableMeasure(
		entry: SheetMusicEntryModel,
		desiredMeasure: number,
	): number | null;
	moveCursorToMeasure(entry: SheetMusicEntryModel, targetMeasure: number): void;
	centerCurrentMeasureInViewport(entry: SheetMusicEntryModel): void;
	resolveReferenceTimeForMeasure(
		measureMap: NonNullable<SheetMusicEntryModel["measureMap"]>,
		clickedMeasure: number,
	): number;
}

function handleHostClick(
	ctx: SheetMusicInteractionContext,
	entry: SheetMusicEntryModel,
	event: MouseEvent,
): void {
	handleHostInteraction(ctx, entry, event);
}

function handleHostTouchStart(
	_ctx: unknown,
	entry: SheetMusicEntryModel,
	event: TouchEvent,
): void {
	if (event.touches.length !== 1) {
		entry.touchTapState = null;
		return;
	}

	const touch = event.touches[0];
	if (!touch) {
		entry.touchTapState = null;
		return;
	}

	entry.touchTapState = {
		identifier: touch.identifier,
		startClientX: touch.clientX,
		startClientY: touch.clientY,
		moved: false,
	};
}

function handleHostTouchMove(
	_ctx: unknown,
	entry: SheetMusicEntryModel,
	event: TouchEvent,
): void {
	const tapState = entry.touchTapState;
	if (!tapState) {
		return;
	}

	const matchingTouch = findTouchByIdentifier(
		event.touches,
		tapState.identifier,
	);
	if (!matchingTouch) {
		tapState.moved = true;
		return;
	}

	const deltaX = matchingTouch.clientX - tapState.startClientX;
	const deltaY = matchingTouch.clientY - tapState.startClientY;
	const distance = Math.hypot(deltaX, deltaY);
	if (distance >= TOUCH_TAP_MOVE_THRESHOLD_PX) {
		tapState.moved = true;
	}
}

function handleHostTouch(
	ctx: SheetMusicInteractionContext,
	entry: SheetMusicEntryModel,
	event: TouchEvent,
): void {
	const tapState = entry.touchTapState;
	entry.touchTapState = null;
	if (!tapState || tapState.moved) {
		return;
	}

	const endingTouch = findTouchByIdentifier(
		event.changedTouches,
		tapState.identifier,
	);
	if (!endingTouch) {
		return;
	}

	const deltaX = endingTouch.clientX - tapState.startClientX;
	const deltaY = endingTouch.clientY - tapState.startClientY;
	const distance = Math.hypot(deltaX, deltaY);
	if (!Number.isFinite(distance) || distance >= TOUCH_TAP_MOVE_THRESHOLD_PX) {
		return;
	}

	handleHostInteraction(ctx, entry, event);
}

function findTouchByIdentifier(
	touchList: TouchList | ArrayLike<Touch>,
	identifier: number,
): Touch | null {
	for (let index = 0; index < touchList.length; index += 1) {
		const touch = touchList[index];
		if (touch && touch.identifier === identifier) {
			return touch;
		}
	}

	return null;
}

function handleHostInteraction(
	ctx: SheetMusicInteractionContext,
	entry: SheetMusicEntryModel,
	event: MouseEvent | TouchEvent,
): void {
	if (
		!ctx.onSeekReferenceTime ||
		!entry.measureMap ||
		entry.measureMap.length === 0
	) {
		return;
	}

	const clickedMeasure = resolveClickedMeasure(entry, event);
	if (clickedMeasure === null) {
		return;
	}

	const availableMeasure = ctx.resolveAvailableMeasure(entry, clickedMeasure);
	if (availableMeasure !== null) {
		ctx.moveCursorToMeasure(entry, availableMeasure);
		ctx.centerCurrentMeasureInViewport(entry);
	}

	const referenceTime = ctx.resolveReferenceTimeForMeasure(
		entry.measureMap,
		clickedMeasure,
	);
	if (!Number.isFinite(referenceTime)) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();
	ctx.onSeekReferenceTime(Math.max(0, referenceTime));
}

function resolveClickedMeasure(
	entry: SheetMusicEntryModel,
	event: MouseEvent | TouchEvent,
): number | null {
	const graphicSheet = entry.osmd?.GraphicSheet as
		| {
				domToSvg?: (point: PointF2DType) => PointF2DType;
				svgToOsmd?: (point: PointF2DType) => PointF2DType;
				GetNearestObject?: (point: PointF2DType, className: string) => unknown;
				GetNearestStaffEntry?: (point: PointF2DType) => unknown;
				MeasureList?: unknown;
		  }
		| undefined;
	if (!graphicSheet) {
		return null;
	}

	const runtimeMeasureClassName = resolveGraphicalMeasureClassName();

	const attemptFromPoint = (
		x: number | undefined,
		y: number | undefined,
	): number | null => {
		if (!Number.isFinite(x) || !Number.isFinite(y)) {
			return null;
		}

		try {
			const domPoint = new PointF2D(x as number, y as number);
			const svgPoint =
				typeof graphicSheet.domToSvg === "function"
					? graphicSheet.domToSvg(domPoint)
					: domPoint;
			const osmdPoint =
				typeof graphicSheet.svgToOsmd === "function"
					? graphicSheet.svgToOsmd(svgPoint)
					: svgPoint;
			const nearestMeasure = findNearestMeasureObject(
				graphicSheet,
				osmdPoint,
				runtimeMeasureClassName,
			);
			const fromNearestMeasure = extractMeasureNumber(nearestMeasure);
			if (fromNearestMeasure !== null) {
				return fromNearestMeasure;
			}

			const nearestStaffEntry =
				typeof graphicSheet.GetNearestStaffEntry === "function"
					? graphicSheet.GetNearestStaffEntry(osmdPoint)
					: null;
			const fromNearestStaffEntry = extractMeasureNumber(
				extractParentMeasureFromStaffEntry(nearestStaffEntry),
			);
			if (fromNearestStaffEntry !== null) {
				return fromNearestStaffEntry;
			}

			return resolveMeasureFromMeasureList(graphicSheet.MeasureList, osmdPoint);
		} catch (_error) {
			return null;
		}
	};

	const pointCandidates = extractInteractionPointCandidates(event);
	for (let index = 0; index < pointCandidates.length; index += 1) {
		const point = pointCandidates[index];
		// The hit test reads OSMD objects, so it lands on an internal measure
		// number; the alignment speaks printed ones.
		const resolvedMeasure = attemptFromPoint(point.x, point.y);
		if (resolvedMeasure !== null) {
			return (
				entry.measureNumbering.printedByInternal.get(resolvedMeasure) ?? null
			);
		}
	}

	return null;
}

function extractInteractionPointCandidates(
	event: MouseEvent | TouchEvent,
): Array<{ x: number | undefined; y: number | undefined }> {
	if ("changedTouches" in event) {
		const touch =
			event.changedTouches && event.changedTouches.length > 0
				? event.changedTouches[0]
				: event.touches && event.touches.length > 0
					? event.touches[0]
					: null;
		if (!touch) {
			return [];
		}

		return [
			{ x: touch.clientX, y: touch.clientY },
			{ x: touch.pageX, y: touch.pageY },
		];
	}

	return [
		{ x: event.clientX, y: event.clientY },
		{ x: event.pageX, y: event.pageY },
	];
}

function resolveGraphicalMeasureClassName(): string {
	const className =
		typeof GraphicalMeasure === "function"
			? String(GraphicalMeasure.name || "")
			: "";
	return className || DEFAULT_GRAPHICAL_MEASURE_CLASS_NAME;
}

function findNearestMeasureObject(
	graphicSheet: {
		GetNearestObject?: (point: PointF2DType, className: string) => unknown;
	},
	point: PointF2DType,
	runtimeMeasureClassName: string,
): unknown {
	if (typeof graphicSheet.GetNearestObject !== "function") {
		return null;
	}

	const classNames = [
		runtimeMeasureClassName,
		DEFAULT_GRAPHICAL_MEASURE_CLASS_NAME,
	].filter(
		(className, index, all) =>
			Boolean(className) && all.indexOf(className) === index,
	);

	for (let index = 0; index < classNames.length; index += 1) {
		const candidate = graphicSheet.GetNearestObject(point, classNames[index]);
		if (candidate) {
			return candidate;
		}
	}

	return null;
}

function extractParentMeasureFromStaffEntry(staffEntry: unknown): unknown {
	if (!staffEntry || typeof staffEntry !== "object") {
		return null;
	}

	const candidate = staffEntry as {
		parentMeasure?: unknown;
		ParentMeasure?: unknown;
	};

	return candidate.parentMeasure ?? candidate.ParentMeasure ?? null;
}

function resolveMeasureFromMeasureList(
	measureListRaw: unknown,
	point: PointF2DType,
): number | null {
	if (!Array.isArray(measureListRaw)) {
		return null;
	}

	let bestMeasure: unknown = null;
	let bestDistance = Number.POSITIVE_INFINITY;

	for (
		let columnIndex = 0;
		columnIndex < measureListRaw.length;
		columnIndex += 1
	) {
		const column = measureListRaw[columnIndex];
		if (!Array.isArray(column)) {
			continue;
		}

		for (let rowIndex = 0; rowIndex < column.length; rowIndex += 1) {
			const measure = column[rowIndex];
			const boundingBox = extractMeasureBoundingBox(measure);
			if (!boundingBox) {
				continue;
			}

			if (typeof boundingBox.pointLiesInsideBorders === "function") {
				try {
					if (boundingBox.pointLiesInsideBorders(point)) {
						const exactMatch = extractMeasureNumber(measure);
						if (exactMatch !== null) {
							return exactMatch;
						}
					}
				} catch (_error) {
					// Ignore malformed bounding boxes and continue scanning.
				}
			}

			const center = extractBoundingBoxCenter(boundingBox);
			if (!center) {
				continue;
			}

			const dx = center.x - point.x;
			const dy = center.y - point.y;
			const distance = dx * dx + dy * dy;
			if (distance < bestDistance) {
				bestDistance = distance;
				bestMeasure = measure;
			}
		}
	}

	return extractMeasureNumber(bestMeasure);
}

function extractMeasureBoundingBox(measure: unknown): {
	pointLiesInsideBorders?: (position: PointF2DType) => boolean;
	Center?: unknown;
	center?: unknown;
} | null {
	if (!measure || typeof measure !== "object") {
		return null;
	}

	const candidate = measure as {
		PositionAndShape?: unknown;
		positionAndShape?: unknown;
	};

	const box = candidate.PositionAndShape ?? candidate.positionAndShape;
	if (!box || typeof box !== "object") {
		return null;
	}

	return box as {
		pointLiesInsideBorders?: (position: PointF2DType) => boolean;
		Center?: unknown;
		center?: unknown;
	};
}

function extractBoundingBoxCenter(box: {
	Center?: unknown;
	center?: unknown;
}): PointF2DType | null {
	const centerCandidate = box.Center ?? box.center;
	if (!centerCandidate || typeof centerCandidate !== "object") {
		return null;
	}

	const pointCandidate = centerCandidate as { x?: number; y?: number };
	if (
		!Number.isFinite(pointCandidate.x) ||
		!Number.isFinite(pointCandidate.y)
	) {
		return null;
	}

	return new PointF2D(pointCandidate.x as number, pointCandidate.y as number);
}

function extractMeasureNumber(measureObject: unknown): number | null {
	if (!measureObject || typeof measureObject !== "object") {
		return null;
	}

	const candidate = measureObject as {
		ParentSourceMeasure?: { MeasureNumber?: number };
		parentSourceMeasure?: { MeasureNumber?: number };
		MeasureNumber?: number;
		measureNumber?: number;
	};

	const rawValues: Array<number | undefined> = [
		candidate.ParentSourceMeasure?.MeasureNumber,
		candidate.parentSourceMeasure?.MeasureNumber,
		candidate.MeasureNumber,
		candidate.measureNumber,
	];

	for (let index = 0; index < rawValues.length; index += 1) {
		const raw = rawValues[index];
		if (Number.isFinite(raw)) {
			return Math.floor(raw as number);
		}
	}

	return null;
}

interface SheetMusicEntryLifecycleContext {
	destroyed: boolean;
	loadTempoMap(entry: SheetMusicEntryModel): Promise<void>;
	handleHostTouchStart(entry: SheetMusicEntryModel, event: TouchEvent): void;
	handleHostTouchMove(entry: SheetMusicEntryModel, event: TouchEvent): void;
	handleHostClick(entry: SheetMusicEntryModel, event: MouseEvent): void;
	handleHostTouch(entry: SheetMusicEntryModel, event: TouchEvent): void;
}

/**
 * Phase A: parse and render the score. Deliberately free of any alignment
 * dependency, so the measure extent it collects can feed alignment resolution —
 * the measure maps that need the alignment are attached afterwards by
 * `attachMeasureMaps`.
 */
async function renderEntry(
	ctx: SheetMusicEntryLifecycleContext,
	entry: SheetMusicEntryModel,
): Promise<void> {
	entry.host.classList.remove(
		"sheetmusic-error",
		"sheetmusic-ready",
		"sheetmusic-map-error",
	);
	entry.host.classList.add("sheetmusic-loading");

	try {
		const osmd = new OpenSheetMusicDisplay(entry.host, {
			backend: "svg",
			cursorsOptions: [
				{
					type: CursorType.CurrentArea,
					color: entry.cursorColor,
					alpha: entry.cursorAlpha,
					follow: false,
				},
			],
		});

		await osmd.load(entry.source);
		if (ctx.destroyed) {
			return;
		}

		entry.osmd = osmd;
		applyConfiguredRenderScale(entry);
		renderFullScore(entry);
		entry.lastRenderedHostWidth = readHostWidth(entry.host);
		osmd.enableOrDisableCursors(true);

		rebindMeasureCursor(entry);
		refreshCursorElement(entry);
		entry.measureNumbering = buildMeasureNumbering(osmd);

		if (entry.measureNumbering.printed.length === 0) {
			console.warn(
				"[trackswitch] Sheet music rendered but no score measures were detected for source:",
				entry.source,
			);
		}
	} catch (error) {
		entry.osmd = null;
		entry.measureCursor = null;
		entry.projectedTempoSegmentsByAxis = {
			base: null,
			sync: null,
		};
		entry.projectedTempoSegments = null;
		entry.fallbackTempoBpm = null;
		entry.measureNumbering = createEmptyMeasureNumbering();
		entry.host.classList.add("sheetmusic-error");
		console.warn(
			"[trackswitch] Failed to load or render sheet music source:",
			entry.source,
			error,
		);
	}
}

/**
 * Phase B: bind the alignment-derived measure map and tempo map, then wire up
 * interaction. Runs once the alignment is resolved.
 */
async function attachMeasureMaps(
	ctx: SheetMusicEntryLifecycleContext,
	entry: SheetMusicEntryModel,
	maps: Promise<SheetMusicMeasureMapsByAxis>,
): Promise<void> {
	detachInteractionListeners(entry);
	try {
		const points = await maps;
		entry.measureMaps = points;
		entry.measureMap = entry.syncReferenceTimeEnabled
			? points.sync
			: points.base;
		entry.host.classList.remove("sheetmusic-map-error");
	} catch (error) {
		entry.measureMaps = {
			base: null,
			sync: null,
		};
		entry.measureMap = null;
		entry.host.classList.add("sheetmusic-map-error");
		console.warn(
			"[trackswitch] Failed to load sheet-music measure map:",
			entry.source,
			error,
		);
	}

	await ctx.loadTempoMap(entry);

	entry.syncEnabled = Boolean(
		entry.osmd &&
			entry.measureMap &&
			entry.measureMap.length > 0 &&
			entry.measureNumbering.printed.length > 0 &&
			entry.measureCursor,
	);
	entry.targetMeasure = null;

	entry.host.classList.remove("sheetmusic-loading");
	entry.host.classList.toggle("sheetmusic-ready", Boolean(entry.osmd));
	entry.host.classList.toggle("sheetmusic-error", !entry.osmd);

	if (entry.osmd) {
		const touchStartListener = (event: TouchEvent) => {
			ctx.handleHostTouchStart(entry, event);
		};
		const touchMoveListener = (event: TouchEvent) => {
			ctx.handleHostTouchMove(entry, event);
		};
		const clickListener = (event: MouseEvent) => {
			ctx.handleHostClick(entry, event);
		};
		const touchListener = (event: TouchEvent) => {
			ctx.handleHostTouch(entry, event);
		};
		entry.touchStartListener = touchStartListener;
		entry.touchMoveListener = touchMoveListener;
		entry.clickListener = clickListener;
		entry.touchListener = touchListener;
		entry.host.addEventListener("touchstart", touchStartListener, {
			passive: true,
		});
		entry.host.addEventListener("touchmove", touchMoveListener, {
			passive: true,
		});
		entry.host.addEventListener("click", clickListener);
		entry.host.addEventListener("touchend", touchListener, { passive: false });
	}
}

function applyConfiguredRenderScale(entry: SheetMusicEntryModel): void {
	if (!entry.osmd) {
		return;
	}

	if (entry.renderScale === null) {
		entry.osmd.Zoom = 1;
		return;
	}

	entry.osmd.Zoom = Math.max(
		MIN_OSMD_ZOOM,
		Math.min(MAX_OSMD_ZOOM, entry.renderScale),
	);
}

function readHostWidth(host: HTMLElement): number {
	const width = host.clientWidth || host.getBoundingClientRect().width;
	if (!Number.isFinite(width) || width <= 0) {
		return 0;
	}

	return width;
}

function shouldRerenderOnResize(entry: SheetMusicEntryModel): boolean {
	const currentWidth = readHostWidth(entry.host);
	const previousWidth = entry.lastRenderedHostWidth;

	if (currentWidth <= 0) {
		return false;
	}

	if (previousWidth <= 0) {
		return true;
	}

	return (
		Math.abs(currentWidth - previousWidth) >=
		MIN_HOST_WIDTH_DELTA_FOR_RERENDER_PX
	);
}

function renderFullScore(entry: SheetMusicEntryModel): void {
	const osmd = entry.osmd;
	if (!osmd) {
		return;
	}

	osmd.disableIncrementalRenderingOnScroll();
	osmd.resetIncrementalRendering();
	osmd.render();
}

function refreshCursorElement(entry: SheetMusicEntryModel): void {
	const cursor = entry.measureCursor;
	if (!cursor) {
		return;
	}

	if (
		cursor.cursorElement instanceof Element &&
		cursor.cursorElement.isConnected &&
		entry.host.contains(cursor.cursorElement)
	) {
		return;
	}

	const hostCursor = entry.host.querySelector('[id^="osmdCursor"]');
	if (hostCursor instanceof Element) {
		cursor.cursorElement = hostCursor;
		return;
	}

	cursor.cursorElement = null;
}

function disposeEntry(entry: SheetMusicEntryModel): void {
	detachInteractionListeners(entry);
	entry.touchTapState = null;

	const osmd = entry.osmd;
	if (!osmd) {
		return;
	}

	try {
		osmd.enableOrDisableCursors(false);
	} catch (error) {
		console.warn("[trackswitch] Failed to disable sheet-music cursor.", error);
	}

	try {
		osmd.disableIncrementalRenderingOnScroll();
	} catch (error) {
		console.warn(
			"[trackswitch] Failed to disable sheet-music incremental rendering.",
			error,
		);
	}

	try {
		osmd.AutoResizeEnabled = false;
	} catch (error) {
		console.warn(
			"[trackswitch] Failed to disable sheet-music auto-resize.",
			error,
		);
	}

	try {
		osmd.clear();
	} catch (error) {
		console.warn("[trackswitch] Failed to clear sheet-music renderer.", error);
	}

	entry.osmd = null;
	entry.measureCursor = null;
	entry.measureMaps = {
		base: null,
		sync: null,
	};
	entry.measureMap = null;
	entry.projectedTempoSegmentsByAxis = {
		base: null,
		sync: null,
	};
	entry.projectedTempoSegments = null;
	entry.fallbackTempoBpm = null;
	entry.syncEnabled = false;
	entry.lastRenderedHostWidth = -1;
}

function detachInteractionListeners(entry: SheetMusicEntryModel): void {
	if (entry.touchStartListener) {
		entry.host.removeEventListener("touchstart", entry.touchStartListener);
		entry.touchStartListener = null;
	}

	if (entry.touchMoveListener) {
		entry.host.removeEventListener("touchmove", entry.touchMoveListener);
		entry.touchMoveListener = null;
	}

	if (entry.clickListener) {
		entry.host.removeEventListener("click", entry.clickListener);
		entry.clickListener = null;
	}

	if (entry.touchListener) {
		entry.host.removeEventListener("touchend", entry.touchListener);
		entry.touchListener = null;
	}
}

function resolveRuntimeCursor(
	entry: SheetMusicEntryModel,
): SheetMusicEntryModel["measureCursor"] {
	const osmd = entry.osmd;
	if (!osmd) {
		return null;
	}

	const runtimeCursor =
		osmd.cursors && osmd.cursors.length > 0 ? osmd.cursors[0] : osmd.cursor;
	return (runtimeCursor as SheetMusicEntryModel["measureCursor"]) || null;
}

function rebindMeasureCursor(
	entry: SheetMusicEntryModel,
): SheetMusicCursor | null {
	const runtimeCursor = resolveRuntimeCursor(entry);
	if (!runtimeCursor) {
		entry.measureCursor = null;
		entry.syncEnabled = false;
		return null;
	}

	if (entry.measureCursor !== runtimeCursor) {
		entry.measureCursor = runtimeCursor;
		entry.targetMeasure = null;
	}

	if (entry.measureCursor?.show) {
		entry.measureCursor.show();
	}

	if (
		!entry.syncEnabled &&
		entry.measureMap &&
		entry.measureMap.length > 0 &&
		entry.measureNumbering.printed.length > 0
	) {
		entry.syncEnabled = true;
	}

	return entry.measureCursor as SheetMusicCursor;
}

export class SheetMusicEngine {
	public readonly onSeekReferenceTime: ((referenceTime: number) => void) | null;
	public entries: SheetMusicEntryModel[] = [];
	public destroyed = false;
	public lastPosition = 0;
	public syncReferenceTimeEnabled = false;

	constructor(onSeekReferenceTime?: (referenceTime: number) => void) {
		this.onSeekReferenceTime =
			typeof onSeekReferenceTime === "function" ? onSeekReferenceTime : null;
	}

	/**
	 * Phase A — parse and render every score. Runs before the alignment is
	 * resolved so each score's printed measure numbers can supply its extent;
	 * call `attachMeasureMaps` afterwards to finish the entries.
	 */
	async initialize(hosts: SheetMusicHostConfig[]): Promise<void> {
		this.destroy();
		this.destroyed = false;

		this.entries = hosts.map((host) => {
			return {
				host: host.host,
				scrollContainer: host.scrollContainer || null,
				source: host.source,
				measureColumn: host.measureColumn,
				renderScale: sanitizeRenderScale(host.renderScale),
				followPlayback: host.followPlayback !== false,
				cursorColor: host.cursorColor || DEFAULT_CURSOR_COLOR,
				cursorAlpha: sanitizeCursorAlpha(host.cursorAlpha),
				osmd: null,
				measureCursor: null,
				syncReferenceTimeEnabled: false,
				measureMaps: {
					base: null,
					sync: null,
				},
				measureMap: null,
				projectedTempoSegmentsByAxis: {
					base: null,
					sync: null,
				},
				projectedTempoSegments: null,
				fallbackTempoBpm: null,
				measureNumbering: createEmptyMeasureNumbering(),
				syncEnabled: false,
				targetMeasure: null,
				clickListener: null,
				touchStartListener: null,
				touchMoveListener: null,
				touchListener: null,
				touchTapState: null,
				lastRenderedHostWidth: -1,
			};
		});

		await Promise.all(this.entries.map((entry) => renderEntry(this, entry)));
		this.updatePosition(this.lastPosition, this.syncReferenceTimeEnabled);
	}

	/** Printed measure numbers each rendered score covers, keyed by its media id. */
	getAvailableMeasuresByMediaId(): Map<string, number[]> {
		const byMediaId = new Map<string, number[]>();
		this.entries.forEach((entry) => {
			const mediaId = entry.measureColumn?.trim();
			if (mediaId) {
				byMediaId.set(mediaId, entry.measureNumbering.printed);
			}
		});
		return byMediaId;
	}

	/**
	 * Phase B — bind the alignment-derived measure maps rendered scores were
	 * waiting for. `buildMaps` receives each entry's measure column.
	 */
	async attachMeasureMaps(
		buildMaps: (
			measureColumn: string,
			source: string,
		) => Promise<SheetMusicMeasureMapsByAxis>,
	): Promise<void> {
		await Promise.all(
			this.entries.map((entry) => {
				const measureColumn = entry.measureColumn?.trim() ?? "";
				const maps = measureColumn
					? buildMaps(measureColumn, entry.source)
					: Promise.resolve({ base: null, sync: null });
				return attachMeasureMaps(this, entry, maps);
			}),
		);
		this.updatePosition(this.lastPosition, this.syncReferenceTimeEnabled);
	}

	updatePosition(
		referencePosition: number,
		syncReferenceTimeEnabled = this.syncReferenceTimeEnabled,
		isTimelineCovered?: (mediaId: string) => boolean,
	): void {
		this.applyReferenceTimeline(syncReferenceTimeEnabled);
		updatePosition(this, clampNonNegative(referencePosition));

		if (!isTimelineCovered) {
			return;
		}
		// The cursor holds at its boundary measure where the alignment stops
		// covering the score; mark it so the freeze reads as intentional.
		this.entries.forEach((entry) => {
			const mediaId = entry.measureColumn?.trim();
			entry.host.classList.toggle(
				"ts-out-of-coverage",
				Boolean(mediaId) && !isTimelineCovered(mediaId as string),
			);
		});
	}

	resize(): void {
		let hasRerenderedEntry = false;

		this.entries.forEach((entry) => {
			if (!entry.osmd) {
				return;
			}

			if (!shouldRerenderOnResize(entry)) {
				return;
			}

			try {
				applyConfiguredRenderScale(entry);
				renderFullScore(entry);
				entry.lastRenderedHostWidth = readHostWidth(entry.host);
				rebindMeasureCursor(entry);
				refreshCursorElement(entry);
				ensureCurrentMeasureVisible(this, entry);
				hasRerenderedEntry = true;
			} catch (error) {
				console.warn(
					"[trackswitch] Failed to re-render sheet music on resize for source:",
					entry.source,
					error,
				);
			}
		});

		if (hasRerenderedEntry) {
			this.updatePosition(this.lastPosition, this.syncReferenceTimeEnabled);
		}
	}

	destroy(): void {
		this.destroyed = true;
		this.entries.forEach((entry) => {
			disposeEntry(entry);
		});
		this.entries = [];
	}

	public handleHostClick(entry: SheetMusicEntryModel, event: MouseEvent): void {
		handleHostClick(this, entry, event);
	}

	public handleHostTouchStart(
		entry: SheetMusicEntryModel,
		event: TouchEvent,
	): void {
		handleHostTouchStart(this, entry, event);
	}

	public handleHostTouchMove(
		entry: SheetMusicEntryModel,
		event: TouchEvent,
	): void {
		handleHostTouchMove(this, entry, event);
	}

	public handleHostTouch(entry: SheetMusicEntryModel, event: TouchEvent): void {
		handleHostTouch(this, entry, event);
	}

	public refreshCursorElement(entry: SheetMusicEntryModel): void {
		refreshCursorElement(entry);
	}

	public ensureCurrentMeasureVisible(entry: SheetMusicEntryModel): void {
		ensureCurrentMeasureVisible(this, entry);
	}

	public centerCurrentMeasureInViewport(entry: SheetMusicEntryModel): void {
		centerCurrentMeasureInViewport(this, entry);
	}

	public resolveAvailableMeasure(
		entry: SheetMusicEntryModel,
		desiredMeasure: number,
	): number | null {
		return resolveAvailableMeasure(entry, desiredMeasure);
	}

	public moveCursorToMeasure(
		entry: SheetMusicEntryModel,
		targetMeasure: number,
	): void {
		moveCursorToMeasure(this, entry, targetMeasure);
	}

	public rebindMeasureCursor(entry: SheetMusicEntryModel) {
		return rebindMeasureCursor(entry);
	}

	public resolveReferenceTimeForMeasure(
		measureMap: Array<{ measure: number; start: number }>,
		clickedMeasure: number,
	): number {
		return resolveReferenceTimeForMeasure(measureMap, clickedMeasure);
	}

	public applyReferenceTimeline(syncReferenceTimeEnabled: boolean): void {
		if (
			this.syncReferenceTimeEnabled === syncReferenceTimeEnabled &&
			this.entries.every(
				(entry) => entry.syncReferenceTimeEnabled === syncReferenceTimeEnabled,
			)
		) {
			return;
		}

		this.syncReferenceTimeEnabled = syncReferenceTimeEnabled;
		this.entries.forEach((entry) => {
			entry.syncReferenceTimeEnabled = syncReferenceTimeEnabled;
			entry.measureMap = syncReferenceTimeEnabled
				? entry.measureMaps.sync
				: entry.measureMaps.base;
			entry.projectedTempoSegments = syncReferenceTimeEnabled
				? entry.projectedTempoSegmentsByAxis.sync
				: entry.projectedTempoSegmentsByAxis.base;
			entry.syncEnabled = Boolean(
				entry.osmd &&
					entry.measureMap &&
					entry.measureMap.length > 0 &&
					entry.measureNumbering.printed.length > 0 &&
					entry.measureCursor,
			);
			entry.targetMeasure = null;
		});
	}

	public resolveReferenceBpm(
		referenceTime: number,
		syncReferenceTimeEnabled = this.syncReferenceTimeEnabled,
	): number | null {
		const sanitizedReferenceTime = clampNonNegative(referenceTime);

		for (let index = 0; index < this.entries.length; index += 1) {
			const entry = this.entries[index];
			const resolved = resolveEntryReferenceBpm(
				entry,
				sanitizedReferenceTime,
				syncReferenceTimeEnabled,
			);
			if (resolved !== null) {
				return resolved;
			}
		}

		return null;
	}

	public async loadTempoMap(entry: SheetMusicEntryModel): Promise<void> {
		if (!entry.osmd) {
			entry.fallbackTempoBpm = null;
			entry.projectedTempoSegmentsByAxis = {
				base: null,
				sync: null,
			};
			entry.projectedTempoSegments = null;
			return;
		}

		try {
			const { fallbackTempoBpm, projectedSegmentsByAxis } =
				await loadProjectedTempoMaps(entry.source, entry.measureMaps);
			if (this.destroyed) {
				return;
			}

			entry.fallbackTempoBpm = fallbackTempoBpm;
			entry.projectedTempoSegmentsByAxis = projectedSegmentsByAxis;
			entry.projectedTempoSegments = entry.syncReferenceTimeEnabled
				? projectedSegmentsByAxis.sync
				: projectedSegmentsByAxis.base;
		} catch (error) {
			entry.fallbackTempoBpm = null;
			entry.projectedTempoSegmentsByAxis = {
				base: null,
				sync: null,
			};
			entry.projectedTempoSegments = null;
			console.warn(
				"[trackswitch] Failed to load score tempo map:",
				entry.source,
				error,
			);
		}
	}
}

function resolveEntryReferenceBpm(
	entry: SheetMusicEntryModel,
	referenceTime: number,
	syncReferenceTimeEnabled: boolean,
): number | null {
	const projectedSegments = syncReferenceTimeEnabled
		? entry.projectedTempoSegmentsByAxis.sync || []
		: entry.projectedTempoSegmentsByAxis.base || [];
	if (projectedSegments.length > 0) {
		let resolvedBpm = projectedSegments[0].bpm;
		for (let index = 0; index < projectedSegments.length; index += 1) {
			const segment = projectedSegments[index];
			if (segment.referenceStartTime > referenceTime) {
				break;
			}

			resolvedBpm = segment.bpm;
		}

		return Number.isFinite(resolvedBpm) && resolvedBpm > 0 ? resolvedBpm : null;
	}

	if (
		Number.isFinite(entry.fallbackTempoBpm) &&
		(entry.fallbackTempoBpm as number) > 0
	) {
		return entry.fallbackTempoBpm;
	}

	return null;
}
