import type { PointF2DType } from "./osmd";
import { GraphicalMeasure, PointF2D } from "./osmd";
import type { SheetMusicEntryModel } from "./types";
import {
	DEFAULT_GRAPHICAL_MEASURE_CLASS_NAME,
	TOUCH_TAP_MOVE_THRESHOLD_PX,
} from "./types";

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

export function handleHostClick(
	ctx: SheetMusicInteractionContext,
	entry: SheetMusicEntryModel,
	event: MouseEvent,
): void {
	handleHostInteraction(ctx, entry, event);
}

export function handleHostTouchStart(
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

export function handleHostTouchMove(
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

export function handleHostTouch(
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

export function findTouchByIdentifier(
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

export function handleHostInteraction(
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

export function resolveClickedMeasure(
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
		const resolvedMeasure = attemptFromPoint(point.x, point.y);
		if (resolvedMeasure !== null) {
			return resolvedMeasure;
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
