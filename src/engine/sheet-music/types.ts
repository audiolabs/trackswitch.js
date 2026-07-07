import type { MeasureMapPoint } from "../../shared/measure-map";
import type { OpenSheetMusicDisplayType } from "./osmd";

export interface SheetMusicMeasureMapsByAxis {
	base: MeasureMapPoint[] | null;
	sync: MeasureMapPoint[] | null;
}

export interface SheetMusicProjectedTempoSegmentsByAxis {
	base: SheetMusicProjectedTempoSegment[] | null;
	sync: SheetMusicProjectedTempoSegment[] | null;
}

export interface SheetMusicHostConfig {
	host: HTMLElement;
	scrollContainer: HTMLElement | null;
	source: string;
	measureMapsPromise: Promise<SheetMusicMeasureMapsByAxis>;
	renderScale: number | null;
	followPlayback: boolean;
	cursorColor: string;
	cursorAlpha: number;
}

export interface SheetMusicTempoSegment {
	measure: number;
	bpm: number;
}

export interface SheetMusicProjectedTempoSegment {
	referenceStartTime: number;
	bpm: number;
}

export interface SheetMusicEntryModel {
	host: HTMLElement;
	scrollContainer: HTMLElement | null;
	source: string;
	measureMapsPromise: Promise<SheetMusicMeasureMapsByAxis>;
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
	availableMeasures: number[];
	availableMeasureSet: Set<number>;
	syncEnabled: boolean;
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

export type SheetMusicCursor = NonNullable<
	SheetMusicEntryModel["measureCursor"]
>;

export const DEFAULT_CURSOR_COLOR = "#999999";
export const DEFAULT_CURSOR_ALPHA = 0.4;
export const DEFAULT_GRAPHICAL_MEASURE_CLASS_NAME = "GraphicalMeasure";
export const MIN_OSMD_ZOOM = 0.05;
export const MAX_OSMD_ZOOM = 8;
export const TOUCH_TAP_MOVE_THRESHOLD_PX = 10;
export const MIN_HOST_WIDTH_DELTA_FOR_RERENDER_PX = 2;

export function sanitizeCursorAlpha(value: number): number {
	if (!Number.isFinite(value)) {
		return DEFAULT_CURSOR_ALPHA;
	}

	if (value < 0) {
		return 0;
	}

	if (value > 1) {
		return 1;
	}

	return value;
}

export function sanitizePlaybackPosition(value: number): number {
	if (!Number.isFinite(value) || value < 0) {
		return 0;
	}

	return value;
}

export function sanitizeRenderScale(
	value: number | null | undefined,
): number | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return null;
	}

	return value;
}

export function clampNumber(
	value: number,
	minimum: number,
	maximum: number,
): number {
	if (!Number.isFinite(value)) {
		return minimum;
	}

	if (value < minimum) {
		return minimum;
	}

	if (value > maximum) {
		return maximum;
	}

	return value;
}
