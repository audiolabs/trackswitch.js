import type { WaveformPlaybackFollowMode } from "../domain/types";

export const MIN_TIMELINE_ZOOM = 1;

export interface TimelineSurfaceGeometry {
	scrollContainer: HTMLElement;
	surface: HTMLElement;
	baseWidth: number;
	zoom: number;
	zoomMinimapNode: HTMLElement;
}

export interface TimelineViewportState {
	startRatio: number;
	widthRatio: number;
}

export function clampTimelineValue(
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

export function sanitizeTimelineDuration(value: number): number {
	if (!Number.isFinite(value) || value <= 0) {
		return 0;
	}

	return value;
}

export function getTimelineSurfaceWidth(
	surface: Pick<TimelineSurfaceGeometry, "baseWidth" | "zoom">,
): number {
	return Math.max(1, Math.round(surface.baseWidth * surface.zoom));
}

export function getTimelineViewportState(
	surface: TimelineSurfaceGeometry,
): TimelineViewportState {
	const surfaceWidth = getTimelineSurfaceWidth(surface);
	const viewportWidth = Math.max(1, surface.scrollContainer.clientWidth);
	const widthRatio = clampTimelineValue(viewportWidth / surfaceWidth, 0, 1);
	const maxStartRatio = Math.max(0, 1 - widthRatio);
	const startRatio = clampTimelineValue(
		surface.scrollContainer.scrollLeft / surfaceWidth,
		0,
		maxStartRatio,
	);
	return { startRatio, widthRatio };
}

export function updateTimelineMinimapViewport(
	surface: TimelineSurfaceGeometry,
): void {
	const minimapWidth = Math.max(1, surface.zoomMinimapNode.clientWidth);
	const viewportState = getTimelineViewportState(surface);
	surface.zoomMinimapNode.style.setProperty(
		"--ts-zoom-viewport-left",
		`${viewportState.startRatio * minimapWidth}px`,
	);
	surface.zoomMinimapNode.style.setProperty(
		"--ts-zoom-viewport-width",
		`${Math.max(0, viewportState.widthRatio * minimapWidth)}px`,
	);
}

export function resolveTimelineBaseWidth(
	scrollContainer: HTMLElement,
	fallback: number,
): number {
	const scrollWidth = scrollContainer.clientWidth;
	if (Number.isFinite(scrollWidth) && scrollWidth > 0) {
		return Math.max(1, Math.round(scrollWidth));
	}

	if (Number.isFinite(fallback) && fallback > 0) {
		return Math.max(1, Math.round(fallback));
	}

	return 1;
}

export function getTimelineMaximumZoom(
	durationSeconds: number,
	maxZoomSeconds: number,
): number {
	const safeDuration = sanitizeTimelineDuration(durationSeconds);
	if (safeDuration <= 0 || maxZoomSeconds <= 0) {
		return MIN_TIMELINE_ZOOM;
	}

	return Math.max(MIN_TIMELINE_ZOOM, safeDuration / maxZoomSeconds);
}

export function setTimelineZoomForSurface<T extends TimelineSurfaceGeometry>(
	surface: T,
	zoom: number,
	maximum: number,
	anchorPageX: number | undefined,
	applySurfaceWidth: (surface: T, width: number) => void,
): boolean {
	const nextZoom = clampTimelineValue(
		Number.isFinite(zoom) ? zoom : MIN_TIMELINE_ZOOM,
		MIN_TIMELINE_ZOOM,
		maximum,
	);
	if (Math.abs(nextZoom - surface.zoom) < 0.000001) {
		updateTimelineMinimapViewport(surface);
		return false;
	}

	const previousSurfaceWidth = getTimelineSurfaceWidth(surface);
	const wrapperRect = surface.scrollContainer.getBoundingClientRect();
	const wrapperWidth = Math.max(1, surface.scrollContainer.clientWidth);
	const anchorWithinWrapper = Number.isFinite(anchorPageX)
		? clampTimelineValue(
				(anchorPageX as number) - (wrapperRect.left + window.scrollX),
				0,
				wrapperWidth,
			)
		: wrapperWidth / 2;
	const anchorRatio =
		previousSurfaceWidth > 0
			? (surface.scrollContainer.scrollLeft + anchorWithinWrapper) /
				previousSurfaceWidth
			: 0;

	surface.zoom = nextZoom;
	const nextSurfaceWidth = getTimelineSurfaceWidth(surface);
	applySurfaceWidth(surface, nextSurfaceWidth);

	const maxScrollLeft = Math.max(
		0,
		nextSurfaceWidth - surface.scrollContainer.clientWidth,
	);
	const nextScrollLeft = anchorRatio * nextSurfaceWidth - anchorWithinWrapper;
	surface.scrollContainer.scrollLeft = clampTimelineValue(
		nextScrollLeft,
		0,
		maxScrollLeft,
	);
	updateTimelineMinimapViewport(surface);
	return true;
}

export function reflowTimelineSurface<T extends TimelineSurfaceGeometry>(
	surface: T,
	applySurfaceWidth: (surface: T, width: number) => void,
): void {
	const previousSurfaceWidth = getTimelineSurfaceWidth(surface);
	const viewportCenter = surface.scrollContainer.clientWidth / 2;
	const centerRatio =
		previousSurfaceWidth > 0
			? (surface.scrollContainer.scrollLeft + viewportCenter) /
				previousSurfaceWidth
			: 0;

	surface.baseWidth = resolveTimelineBaseWidth(
		surface.scrollContainer,
		surface.baseWidth,
	);
	const nextSurfaceWidth = getTimelineSurfaceWidth(surface);
	applySurfaceWidth(surface, nextSurfaceWidth);

	const maxScrollLeft = Math.max(
		0,
		nextSurfaceWidth - surface.scrollContainer.clientWidth,
	);
	const nextScrollLeft = centerRatio * nextSurfaceWidth - viewportCenter;
	surface.scrollContainer.scrollLeft = clampTimelineValue(
		nextScrollLeft,
		0,
		maxScrollLeft,
	);
	updateTimelineMinimapViewport(surface);
}

export function resolveTimelinePlaybackFollowScrollLeft(
	surface: TimelineSurfaceGeometry & {
		playbackFollowMode: WaveformPlaybackFollowMode;
	},
	playheadRatio: number,
): number | null {
	if (surface.playbackFollowMode === "off") {
		return null;
	}

	const viewportWidth = Math.max(1, surface.scrollContainer.clientWidth);
	const surfaceWidth = getTimelineSurfaceWidth(surface);
	const maxScrollLeft = Math.max(0, surfaceWidth - viewportWidth);
	if (maxScrollLeft <= 0) {
		return null;
	}

	const playheadPx = clampTimelineValue(playheadRatio, 0, 1) * surfaceWidth;
	const currentScrollLeft = clampTimelineValue(
		surface.scrollContainer.scrollLeft,
		0,
		maxScrollLeft,
	);
	const visibleStart = currentScrollLeft;
	const visibleEnd = currentScrollLeft + viewportWidth;

	if (surface.playbackFollowMode === "center") {
		return clampTimelineValue(playheadPx - viewportWidth / 2, 0, maxScrollLeft);
	}

	if (playheadPx < visibleStart || playheadPx > visibleEnd) {
		return clampTimelineValue(playheadPx, 0, maxScrollLeft);
	}

	return null;
}
