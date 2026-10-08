import { setDisplay } from "../shared/dom";
import { clamp, clampPercent, sanitizeDuration } from "../shared/math";
import type { WaveformPlaybackFollowMode } from "../types";

export const MIN_TIMELINE_ZOOM = 1;

/**
 * `WaveformPlaybackFollowMode` plus `pinnedLeft`, which holds the playhead
 * against the left edge of the viewport and scrolls the surface underneath it
 * instead — what a piano roll with a keyboard column needs, so the notes fly
 * into the keys. Not a publicly configurable value: the piano roll forces it
 * on internally whenever `pianoKeyboard` is on, and no other view uses it.
 */
export type TimelineFollowMode = WaveformPlaybackFollowMode | "pinnedLeft";

export interface TimelineSurfaceGeometry {
	scrollContainer: HTMLElement;
	surface: HTMLElement;
	baseWidth: number;
	zoom: number;
	zoomNode: HTMLElement;
	zoomMinimapNode: HTMLElement;
	/**
	 * Last known `scrollContainer.clientWidth`. Reading it live during playback
	 * forces a synchronous layout on every tick, so the per-frame paths read this
	 * cache instead. Refreshed whenever the surface is reflowed or resized.
	 */
	cachedViewportWidth?: number;
	playbackFollowMode?: TimelineFollowMode;
	/**
	 * Empty surface past the end of the medium. A `pinnedLeft` surface needs one
	 * viewport of it so the playhead can hold against the left edge while the
	 * final seconds scroll past; every other mode leaves it at zero.
	 */
	trailingPadPx?: number;
	/** An in-flight animated follow-scroll started by `applyTimelineFollowScrollLeft`. */
	scrollAnimation?: TimelineScrollAnimation | null;
}

export interface TimelineScrollAnimation {
	rafId: number;
	startScrollLeft: number;
	target: number;
	startTime: number;
	duration: number;
}

const TIMELINE_SEEK_ANIMATION_MS = 180;

function easeOutCubic(t: number): number {
	return 1 - (1 - t) ** 3;
}

export interface TimelineViewportState {
	startRatio: number;
	widthRatio: number;
}

/**
 * Draws a stretch of a seek surface into a canvas of the given CSS size. The
 * stretch is given as fractions of the surface's timeline, so the same call
 * serves any magnification — it is what the marker loupe is drawn with.
 */
export type SeekSurfaceRangeRenderer = (
	canvas: HTMLCanvasElement,
	cssWidth: number,
	cssHeight: number,
	startRatio: number,
	widthRatio: number,
) => void;

/** Visible slice of a virtual surface that a sliding tile canvas has to cover. */
export interface TimelineTileWindow {
	tileStartPx: number;
	tileCssWidth: number;
	tileCssHeight: number;
	surfaceWidth: number;
	/** The part of `surfaceWidth` the medium occupies; see `getTimelineTimeWidth`. */
	timeWidth: number;
	viewportWidth: number;
}

/**
 * The stretch of surface the medium's duration maps onto. Everything that
 * converts between time and pixels — note positions, the playhead, the minimap
 * viewport — measures against this rather than the full surface, which may carry
 * a trailing pad past the end of the medium.
 */
export function getTimelineTimeWidth(
	surface: Pick<TimelineSurfaceGeometry, "baseWidth" | "zoom">,
): number {
	return Math.max(1, Math.round(surface.baseWidth * surface.zoom));
}

export function getTimelineSurfaceWidth(
	surface: Pick<
		TimelineSurfaceGeometry,
		"baseWidth" | "zoom" | "trailingPadPx"
	>,
): number {
	return (
		getTimelineTimeWidth(surface) + Math.max(0, surface.trailingPadPx ?? 0)
	);
}

/**
 * Reads the scroll viewport width from the cache when it has been primed, so
 * per-frame callers never trigger a layout flush. `refreshTimelineViewportWidth`
 * repopulates it whenever geometry actually changes.
 */
function getTimelineViewportWidth(surface: TimelineSurfaceGeometry): number {
	const cached = surface.cachedViewportWidth;
	if (Number.isFinite(cached) && (cached as number) > 0) {
		return cached as number;
	}

	return refreshTimelineViewportWidth(surface);
}

export function refreshTimelineViewportWidth(
	surface: TimelineSurfaceGeometry,
): number {
	const viewportWidth = Math.max(1, surface.scrollContainer.clientWidth);
	surface.cachedViewportWidth = viewportWidth;
	// The pad is exactly one viewport, so the last scroll position puts the end
	// of the medium under a left-pinned playhead.
	surface.trailingPadPx =
		surface.playbackFollowMode === "pinnedLeft" ? viewportWidth : 0;
	return viewportWidth;
}

/** The minimap shows the medium, so its viewport is measured against time. */
export function getTimelineViewportState(
	surface: TimelineSurfaceGeometry,
): TimelineViewportState {
	const timeWidth = getTimelineTimeWidth(surface);
	const viewportWidth = getTimelineViewportWidth(surface);
	const widthRatio = clamp(viewportWidth / timeWidth, 0, 1);
	const maxStartRatio = Math.max(0, 1 - widthRatio);
	const startRatio = clamp(
		surface.scrollContainer.scrollLeft / timeWidth,
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
	const safeDuration = sanitizeDuration(durationSeconds);
	if (safeDuration <= 0 || maxZoomSeconds <= 0) {
		return MIN_TIMELINE_ZOOM;
	}

	return Math.max(MIN_TIMELINE_ZOOM, safeDuration / maxZoomSeconds);
}

/**
 * The zoom a surface opens on: enough to show `defaultZoomSeconds` of the
 * medium across the viewport, never further out than unzoomed and never past
 * the surface's own zoom limit.
 */
export function resolveTimelineDefaultZoom(
	durationSeconds: number,
	defaultZoomSeconds: number | null,
	maximumZoom: number,
): number {
	const safeDuration = sanitizeDuration(durationSeconds);
	if (
		defaultZoomSeconds === null ||
		!Number.isFinite(defaultZoomSeconds) ||
		defaultZoomSeconds <= 0 ||
		safeDuration <= 0
	) {
		return MIN_TIMELINE_ZOOM;
	}

	return clamp(
		safeDuration / defaultZoomSeconds,
		MIN_TIMELINE_ZOOM,
		maximumZoom,
	);
}

export function setTimelineZoomForSurface<T extends TimelineSurfaceGeometry>(
	surface: T,
	zoom: number,
	maximum: number,
	anchorPageX: number | undefined,
	applySurfaceWidth: (surface: T, width: number) => void,
): boolean {
	const nextZoom = clamp(
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
	const wrapperWidth = refreshTimelineViewportWidth(surface);
	const anchorWithinWrapper = Number.isFinite(anchorPageX)
		? clamp(
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

	const maxScrollLeft = Math.max(0, nextSurfaceWidth - wrapperWidth);
	const nextScrollLeft = anchorRatio * nextSurfaceWidth - anchorWithinWrapper;
	surface.scrollContainer.scrollLeft = clamp(nextScrollLeft, 0, maxScrollLeft);
	updateTimelineMinimapViewport(surface);
	return true;
}

export function reflowTimelineSurface<T extends TimelineSurfaceGeometry>(
	surface: T,
	applySurfaceWidth: (surface: T, width: number) => void,
): void {
	const previousSurfaceWidth = getTimelineSurfaceWidth(surface);
	const viewportWidth = refreshTimelineViewportWidth(surface);
	const viewportCenter = viewportWidth / 2;
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

	const maxScrollLeft = Math.max(0, nextSurfaceWidth - viewportWidth);
	const nextScrollLeft = centerRatio * nextSurfaceWidth - viewportCenter;
	surface.scrollContainer.scrollLeft = clamp(nextScrollLeft, 0, maxScrollLeft);
	updateTimelineMinimapViewport(surface);
}

export function resolveTimelinePlaybackFollowScrollLeft(
	surface: TimelineSurfaceGeometry & {
		playbackFollowMode: TimelineFollowMode;
	},
	playheadRatio: number,
): number | null {
	if (surface.playbackFollowMode === "off") {
		return null;
	}

	const viewportWidth = getTimelineViewportWidth(surface);
	const surfaceWidth = getTimelineSurfaceWidth(surface);
	const maxScrollLeft = Math.max(0, surfaceWidth - viewportWidth);
	if (maxScrollLeft <= 0) {
		return null;
	}

	const playheadPx = clamp(playheadRatio, 0, 1) * getTimelineTimeWidth(surface);
	if (surface.playbackFollowMode === "pinnedLeft") {
		return clamp(playheadPx, 0, maxScrollLeft);
	}

	const currentScrollLeft = clamp(
		surface.scrollContainer.scrollLeft,
		0,
		maxScrollLeft,
	);
	const visibleStart = currentScrollLeft;
	const visibleEnd = currentScrollLeft + viewportWidth;

	if (surface.playbackFollowMode === "center") {
		return clamp(playheadPx - viewportWidth / 2, 0, maxScrollLeft);
	}

	if (playheadPx < visibleStart || playheadPx > visibleEnd) {
		return clamp(playheadPx, 0, maxScrollLeft);
	}

	return null;
}

/**
 * Writes a follow-scroll position, either directly (the every-tick case,
 * already smooth since the target barely moves between frames) or as a short
 * eased tween when `animate` is set — used only for a manual click-to-seek, so
 * that jump doesn't read as an abrupt cut.
 *
 * A tween in flight is not cancelled by a later non-animated call (the ticks a
 * still-playing surface keeps producing while the tween runs); that call just
 * retargets it, since the tiny per-tick drift of a moving playhead is not
 * worth interrupting the animation for. Only another `animate: true` call
 * (a fresh click) restarts it.
 */
export function applyTimelineFollowScrollLeft<
	T extends TimelineSurfaceGeometry,
>(
	surface: T,
	targetScrollLeft: number,
	animate: boolean,
	onFrame: (surface: T) => void,
): boolean {
	const current = surface.scrollContainer.scrollLeft;
	const inFlight = surface.scrollAnimation;

	if (!animate) {
		if (inFlight) {
			inFlight.target = targetScrollLeft;
			return false;
		}
		if (Math.abs(targetScrollLeft - current) < 0.000001) {
			return false;
		}
		surface.scrollContainer.scrollLeft = targetScrollLeft;
		onFrame(surface);
		return true;
	}

	if (inFlight) {
		cancelAnimationFrame(inFlight.rafId);
		surface.scrollAnimation = null;
	}
	if (Math.abs(targetScrollLeft - current) < 0.000001) {
		return false;
	}

	const animation: TimelineScrollAnimation = {
		rafId: 0,
		startScrollLeft: current,
		target: targetScrollLeft,
		startTime: performance.now(),
		duration: TIMELINE_SEEK_ANIMATION_MS,
	};
	surface.scrollAnimation = animation;

	const step = (now: number) => {
		if (surface.scrollAnimation !== animation) {
			return;
		}
		const t = Math.min(1, (now - animation.startTime) / animation.duration);
		surface.scrollContainer.scrollLeft =
			animation.startScrollLeft +
			(animation.target - animation.startScrollLeft) * easeOutCubic(t);
		onFrame(surface);
		if (t < 1) {
			animation.rafId = requestAnimationFrame(step);
		} else {
			surface.scrollAnimation = null;
		}
	};
	animation.rafId = requestAnimationFrame(step);
	return true;
}

/**
 * Sizes a canvas backing store for the given CSS box at device-pixel resolution,
 * clears it and returns a context already scaled so drawing can use CSS pixel
 * coordinates. The CSS box itself is left to the caller or the stylesheet.
 */
export function resizeCanvasForCssSize(
	canvas: HTMLCanvasElement,
	width: number,
	height: number,
): CanvasRenderingContext2D | null {
	const cssWidth = Math.max(1, Math.round(width));
	const cssHeight = Math.max(1, Math.round(height));
	const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
	const pixelWidth = Math.max(1, Math.round(cssWidth * pixelRatio));
	const pixelHeight = Math.max(1, Math.round(cssHeight * pixelRatio));

	if (canvas.width !== pixelWidth) {
		canvas.width = pixelWidth;
	}
	if (canvas.height !== pixelHeight) {
		canvas.height = pixelHeight;
	}

	const context = canvas.getContext("2d");
	if (!context) {
		return null;
	}

	context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
	context.clearRect(0, 0, cssWidth, cssHeight);
	return context;
}

/**
 * Computes the slice of the virtual surface a sliding tile canvas must cover:
 * the viewport plus one viewport of buffer on each side.
 *
 * The window edges are snapped to a half-viewport grid. Without that, a
 * playback-follow scroll of a pixel per frame would shift the window by a pixel
 * per frame and force a full redraw every frame, which is exactly what the
 * buffer exists to avoid. Snapped, the window only re-anchors once the viewport
 * has travelled half a screen, while still always covering the viewport.
 */
export function resolveVisibleTileWindow(
	surface: TimelineSurfaceGeometry,
	tileHeight: number,
): TimelineTileWindow {
	const surfaceWidth = getTimelineSurfaceWidth(surface);
	const viewportWidth = getTimelineViewportWidth(surface);
	const scrollLeft = clamp(
		surface.scrollContainer.scrollLeft,
		0,
		Math.max(0, surfaceWidth - viewportWidth),
	);
	const bufferPx = viewportWidth;
	const stepPx = Math.max(1, Math.round(viewportWidth / 2));
	const visibleStart = Math.max(
		0,
		Math.floor((scrollLeft - bufferPx) / stepPx) * stepPx,
	);
	const visibleEnd = Math.min(
		surfaceWidth,
		Math.ceil((scrollLeft + viewportWidth + bufferPx) / stepPx) * stepPx,
	);
	return {
		tileStartPx: visibleStart,
		tileCssWidth: Math.max(1, Math.ceil(visibleEnd - visibleStart)),
		tileCssHeight: Math.max(1, Math.round(tileHeight)),
		surfaceWidth,
		timeWidth: getTimelineTimeWidth(surface),
		viewportWidth,
	};
}

export function positionTileCanvas(
	canvas: HTMLCanvasElement,
	tileWindow: TimelineTileWindow,
): void {
	canvas.style.left = `${tileWindow.tileStartPx}px`;
	canvas.style.width = `${tileWindow.tileCssWidth}px`;
	canvas.style.height = `${tileWindow.tileCssHeight}px`;
}

interface LoopState {
	pointA: number | null;
	pointB: number | null;
	enabled: boolean;
}

export interface SeekWrapOptions {
	/**
	 * Inline inset from each edge of the parent, in percent. Image views seek
	 * across a margin-cropped strip; timeline surfaces span their parent exactly.
	 */
	insetPercent?: { left: number; right: number };
	/** Waveform views draw reference hooks onto an extra canvas layer. */
	referenceHookCanvas?: boolean;
}

export function buildSeekWrap(options: SeekWrapOptions = {}): string {
	const inset = options.insetPercent;
	const style = inset
		? ` style="left: ${inset.left}%; right: ${inset.right}%;"`
		: "";

	return (
		`<div class="seekwrap"${style}>` +
		'<div class="loop-region"></div>' +
		'<div class="loop-marker marker-a"></div>' +
		'<div class="loop-marker marker-b"></div>' +
		'<div class="seekhead"></div>' +
		(options.referenceHookCanvas
			? '<canvas class="seekhead-ref-hooks"></canvas>'
			: "") +
		"</div>"
	);
}

function resolveSeekGeometryRoot(seekWrap: HTMLElement): HTMLElement {
	const seekbar = seekWrap.querySelector(":scope > .seekbar");
	return seekbar instanceof HTMLElement ? seekbar : seekWrap;
}

function setPercentProperty(
	element: HTMLElement,
	propertyName: string,
	value: number,
): void {
	element.style.setProperty(propertyName, `${clampPercent(value)}%`);
}

/**
 * Attribute writes are the expensive part of the playback tick, so skip them
 * whenever the value is already what the DOM holds.
 */
function setAttributeIfChanged(
	element: Element,
	name: string,
	value: string,
): void {
	if (element.getAttribute(name) !== value) {
		element.setAttribute(name, value);
	}
}

function setMainSeekbarPlayheadPosition(
	seekbar: HTMLElement,
	seekhead: HTMLElement,
	seekRatio: number,
): void {
	const seekheadWidth = seekhead.offsetWidth;
	const seekbarWidth = seekbar.clientWidth;
	const scaledSeekheadLeft = seekRatio * (seekbarWidth - seekheadWidth);

	seekbar.style.setProperty(
		"--ts-playhead-position",
		`${scaledSeekheadLeft}px`,
	);
}

export function updateSeekWrapVisuals(
	seekWrap: HTMLElement,
	position: number,
	duration: number,
	loop: LoopState,
	loopingEnabled: boolean,
	formatValue: (value: number) => string = String,
): void {
	const safeDuration = sanitizeDuration(duration);
	const safePosition = safeDuration > 0 ? clamp(position, 0, safeDuration) : 0;
	const geometryRoot = resolveSeekGeometryRoot(seekWrap);
	const seekhead = geometryRoot.querySelector(".seekhead");

	if (seekhead instanceof HTMLElement) {
		const seekRatio = safeDuration > 0 ? safePosition / safeDuration : 0;
		if (geometryRoot.classList.contains("seekbar")) {
			setMainSeekbarPlayheadPosition(geometryRoot, seekhead, seekRatio);
		} else {
			setPercentProperty(
				geometryRoot,
				"--ts-playhead-position",
				clampPercent(seekRatio * 100),
			);
		}
		const formattedPosition = formatValue(safePosition);
		setAttributeIfChanged(
			seekhead,
			"aria-label",
			`Playhead ${formattedPosition}`,
		);
		if (seekhead.title !== formattedPosition) {
			seekhead.title = formattedPosition;
		}
	}
	setAttributeIfChanged(geometryRoot, "role", "slider");
	setAttributeIfChanged(geometryRoot, "aria-valuemin", "0");
	setAttributeIfChanged(geometryRoot, "aria-valuemax", String(safeDuration));
	setAttributeIfChanged(geometryRoot, "aria-valuenow", String(safePosition));
	setAttributeIfChanged(
		geometryRoot,
		"aria-valuetext",
		formatValue(safePosition),
	);

	if (!loopingEnabled) {
		return;
	}

	const markerA = seekWrap.querySelector(".loop-marker.marker-a");
	if (markerA && loop.pointA !== null && safeDuration > 0) {
		const pointAPerc = clampPercent(
			(clamp(loop.pointA, 0, safeDuration) / safeDuration) * 100,
		);
		setPercentProperty(geometryRoot, "--ts-loop-marker-a", pointAPerc);
		setDisplay(markerA, "block");
		markerA.setAttribute("aria-label", `Loop A ${formatValue(loop.pointA)}`);
		(markerA as HTMLElement).title = formatValue(loop.pointA);
	} else if (markerA) {
		setDisplay(markerA, "none");
	}

	const markerB = seekWrap.querySelector(".loop-marker.marker-b");
	if (markerB && loop.pointB !== null && safeDuration > 0) {
		const pointBPerc = clampPercent(
			(clamp(loop.pointB, 0, safeDuration) / safeDuration) * 100,
		);
		setPercentProperty(geometryRoot, "--ts-loop-marker-b", pointBPerc);
		setDisplay(markerB, "block");
		markerB.setAttribute("aria-label", `Loop B ${formatValue(loop.pointB)}`);
		(markerB as HTMLElement).title = formatValue(loop.pointB);
	} else if (markerB) {
		setDisplay(markerB, "none");
	}

	const loopRegion = seekWrap.querySelector(".loop-region");
	if (
		loopRegion &&
		loop.pointA !== null &&
		loop.pointB !== null &&
		safeDuration > 0
	) {
		const orderedPointA = Math.min(loop.pointA, loop.pointB);
		const orderedPointB = Math.max(loop.pointA, loop.pointB);
		const pointAPerc = clampPercent(
			(clamp(orderedPointA, 0, safeDuration) / safeDuration) * 100,
		);
		const pointBPerc = clampPercent(
			(clamp(orderedPointB, 0, safeDuration) / safeDuration) * 100,
		);

		setPercentProperty(geometryRoot, "--ts-loop-region-start", pointAPerc);
		setPercentProperty(
			geometryRoot,
			"--ts-loop-region-width",
			Math.max(0, pointBPerc - pointAPerc),
		);
		setDisplay(loopRegion, "block");
		loopRegion.classList.toggle("active", loop.enabled);
	} else if (loopRegion) {
		setDisplay(loopRegion, "none");
		loopRegion.classList.remove("active");
	}
}

// ═══════════ surface chrome ═══════════

/**
 * The timing readout every zoomable surface carries. Waveform and piano roll
 * differ only in the class their stylesheet targets.
 */
export function createTimelineTimingNode(
	overlay: HTMLElement,
	className: string,
): HTMLElement {
	const timing = document.createElement("div");
	timing.className = className;
	timing.textContent = "--:--:--:--- / --:--:--:---";
	overlay.appendChild(timing);
	return timing;
}

/**
 * The zoom minimap: a scaled-down canvas of the whole medium with a viewport
 * rectangle. `prefix` names the stylesheet's class family; a waveform adds a
 * region marking playback past the end of a shorter track.
 */
export function createTimelineZoomNode(
	overlay: HTMLElement,
	prefix: string,
	options: { canvasClass?: string; endedRegion?: boolean } = {},
): HTMLElement {
	const zoom = document.createElement("div");
	zoom.className = `${prefix}-zoom`;
	const canvasClass = options.canvasClass
		? `${options.canvasClass} ${prefix}-zoom-canvas`
		: `${prefix}-zoom-canvas`;
	zoom.innerHTML =
		`<span class="${prefix}-zoom-label">Zoom</span>` +
		`<div class="${prefix}-zoom-minimap">` +
		`<canvas class="${canvasClass}"></canvas>` +
		(options.endedRegion
			? `<div class="${prefix}-zoom-ended-region"></div>`
			: "") +
		`<div class="${prefix}-zoom-viewport"></div>` +
		"</div>";
	zoom.style.display = "none";
	overlay.appendChild(zoom);
	return zoom;
}

/** Shows the minimap of every surface that is actually zoomed in. */
export function updateTimelineZoomIndicators(
	surfaces: readonly TimelineSurfaceGeometry[],
): void {
	surfaces.forEach((surface) => {
		if (surface.zoom <= MIN_TIMELINE_ZOOM + 0.000001) {
			surface.zoomNode.style.display = "none";
			return;
		}
		updateTimelineMinimapViewport(surface);
		surface.zoomNode.style.display = "flex";
	});
}
