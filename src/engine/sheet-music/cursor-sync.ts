import type { MeasureMapPoint } from "../../shared/measure-map";
import type { SheetMusicEntryModel } from "./types";
import { sanitizePlaybackPosition } from "./types";

interface CursorSyncContext {
	lastPosition: number;
	entries: SheetMusicEntryModel[];
	rebindMeasureCursor(
		entry: SheetMusicEntryModel,
	): SheetMusicEntryModel["measureCursor"];
	ensureCurrentMeasureVisible(entry: SheetMusicEntryModel): void;
}

export function updatePosition(
	ctx: CursorSyncContext,
	referencePosition: number,
): void {
	ctx.lastPosition = sanitizePlaybackPosition(referencePosition);

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

export function resolveMappedMeasure(
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

export function resolveAvailableMeasure(
	entry: SheetMusicEntryModel,
	desiredMeasure: number,
): number | null {
	if (entry.availableMeasures.length === 0) {
		return null;
	}

	if (entry.availableMeasureSet.has(desiredMeasure)) {
		return desiredMeasure;
	}

	for (let index = entry.availableMeasures.length - 1; index >= 0; index -= 1) {
		const candidate = entry.availableMeasures[index];
		if (candidate <= desiredMeasure) {
			return candidate;
		}
	}

	return entry.availableMeasures[0];
}

export function moveCursorToMeasure(
	ctx: CursorSyncContext,
	entry: SheetMusicEntryModel,
	targetMeasure: number,
): void {
	const cursor = ctx.rebindMeasureCursor(entry);
	if (!cursor?.reset || !cursor?.nextMeasure || !cursor?.previousMeasure) {
		return;
	}

	let currentMeasure = initializeCursorMeasure(entry, cursor);

	const estimatedDistance =
		currentMeasure === null
			? entry.availableMeasures.length
			: Math.abs(targetMeasure - currentMeasure);
	const maxSteps = Math.max(
		1,
		Math.min(entry.availableMeasures.length + 5, estimatedDistance + 8),
	);
	currentMeasure = stepCursorTowardsTarget(
		cursor,
		currentMeasure,
		targetMeasure,
		maxSteps,
	);

	if (currentMeasure !== targetMeasure) {
		currentMeasure = retryCursorFromReset(entry, cursor, targetMeasure);
	}

	entry.targetMeasure = resolveAvailableMeasure(
		entry,
		currentMeasure === null ? targetMeasure : currentMeasure,
	);

	ctx.ensureCurrentMeasureVisible(entry);
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
	return currentMeasure === null
		? (entry.availableMeasures[0] ?? null)
		: currentMeasure;
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
		fallbackMeasure === null
			? (entry.availableMeasures[0] ?? null)
			: fallbackMeasure;
	const fallbackMaxSteps = Math.max(1, entry.availableMeasures.length + 5);
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

export function readCursorMeasure(
	cursor: NonNullable<SheetMusicEntryModel["measureCursor"]>,
): number | null {
	const raw = cursor.Iterator?.CurrentMeasure?.MeasureNumber;
	if (!Number.isFinite(raw)) {
		return null;
	}

	return Math.floor(raw as number);
}

export function resolveReferenceTimeForMeasure(
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
