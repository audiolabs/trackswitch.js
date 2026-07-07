import type {
	TrackRuntime,
	WaveformPlaybackFollowMode,
	WaveformSource,
} from "../domain/types";
import type {
	TrackTimelineProjector,
	WaveformPeakBuckets,
} from "../engine/waveform-engine";
import { sanitizeInlineStyle } from "../shared/dom";
import { formatSecondsToHHMMSSmmm } from "../shared/format";
import { clampPercent } from "../shared/math";
import {
	parseWaveformSource,
	resolveFixedWaveformTrackIndex,
	resolveWaveformTrackIndices,
	serializeWaveformSource,
} from "../shared/waveform-source";
import {
	clampTimelineValue,
	getTimelineMaximumZoom,
	getTimelineSurfaceWidth,
	getTimelineViewportState,
	MIN_TIMELINE_ZOOM,
	reflowTimelineSurface,
	resolveTimelineBaseWidth,
	resolveTimelinePlaybackFollowScrollLeft,
	sanitizeTimelineDuration,
	setTimelineZoomForSurface,
	updateTimelineMinimapViewport,
} from "./timeline-surface";

interface WaveformSeekSurfaceMetadata {
	wrapper: HTMLElement;
	scrollContainer: HTMLElement;
	overlay: HTMLElement;
	surface: HTMLElement;
	tileLayer: HTMLElement;
	seekWrap: HTMLElement;
	waveformSource: WaveformSource;
	playbackFollowMode: WaveformPlaybackFollowMode;
	originalHeight: number;
	barWidth: number;
	maxZoomSeconds: number;
	baseWidth: number;
	zoom: number;
	timingNode: HTMLElement | null;
	zoomNode: HTMLElement;
	zoomMinimapNode: HTMLElement;
	zoomCanvas: HTMLCanvasElement;
	zoomViewportNode: HTMLElement;
	zoomCanvasLastDrawKey: string | null;
	waveformColor: string | null;
	tiles: Map<
		number,
		{
			canvas: HTMLCanvasElement;
			lastDrawKey: string | null;
		}
	>;
	normalizationPeak: number;
	normalizationCacheKey: string | null;
	tilePeakCache: Map<string, WaveformPeakBuckets>;
	tilePeakCacheOrder: string[];
	alignedPlayhead: boolean;
	refHooksCanvas: HTMLCanvasElement | null;
	showAlignmentPoints: boolean;
	alignmentPointsLastW: number;
	alignmentPointsLastH: number;
}

const MIN_WAVEFORM_ZOOM = MIN_TIMELINE_ZOOM;
const DEFAULT_MAX_WAVEFORM_ZOOM_SECONDS = 5;
const WAVEFORM_TILE_WIDTH_PX = 1024;
const WAVEFORM_TILE_PEAK_CACHE_LIMIT = 64;
function buildSeekWrap(leftPercent: number, rightPercent: number): string {
	return (
		'<div class="seekwrap" style="left: ' +
		leftPercent +
		"%; right: " +
		rightPercent +
		'%;">' +
		'<div class="loop-region"></div>' +
		'<div class="loop-marker marker-a"></div>' +
		'<div class="loop-marker marker-b"></div>' +
		'<div class="seekhead"></div>' +
		'<canvas class="seekhead-ref-hooks"></canvas>' +
		"</div>"
	);
}

function clampTime(value: number, minimum: number, maximum: number): number {
	return clampTimelineValue(value, minimum, maximum);
}

function sanitizeDuration(value: number): number {
	return sanitizeTimelineDuration(value);
}

function parseWaveformBarWidth(value: string | null, fallback: number): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 1) {
		return fallback;
	}

	return Math.max(1, Math.floor(parsed));
}

function isWaveformTrackAudible(
	ctx: any,
	runtimes: TrackRuntime[],
	trackIndex: number,
): boolean {
	const runtime = runtimes[trackIndex];
	if (!runtime || runtime.state.volume <= 0) {
		return false;
	}

	if (ctx.isAlignmentMode()) {
		return true;
	}

	const anySolo = runtimes.some((entry: TrackRuntime) => entry.state.solo);

	if (anySolo) {
		return runtime.state.solo;
	}

	return !!ctx.features.exclusiveSolo;
}

function parseWaveformTimerEnabled(
	value: string | null,
	alignmentMode: boolean,
): boolean {
	if (value === null) {
		return alignmentMode;
	}

	return value.trim().toLowerCase() === "true";
}

function parseWaveformAlignedPlayheadEnabled(value: string | null): boolean {
	if (value === null) {
		return false;
	}

	return value.trim().toLowerCase() === "true";
}

function parseWaveformShowAlignmentPointsEnabled(
	value: string | null,
): boolean {
	if (value === null) {
		return false;
	}

	return value.trim().toLowerCase() === "true";
}

function parseWaveformMaxZoom(value: string | null): number {
	if (value === null) {
		return DEFAULT_MAX_WAVEFORM_ZOOM_SECONDS;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return DEFAULT_MAX_WAVEFORM_ZOOM_SECONDS;
	}

	const parsed = Number(trimmed);
	if (!Number.isFinite(parsed)) {
		return DEFAULT_MAX_WAVEFORM_ZOOM_SECONDS;
	}

	return parsed;
}

function parseWaveformPlaybackFollowMode(
	value: string | null,
): WaveformPlaybackFollowMode {
	const normalized =
		typeof value === "string" ? value.trim().toLowerCase() : "";

	if (normalized === "center" || normalized === "jump") {
		return normalized;
	}

	return "off";
}

function resolveWaveformColor(element: HTMLElement): string {
	return (
		getComputedStyle(element).getPropertyValue("--waveform-color").trim() ||
		"#ED8C01"
	);
}

function getWaveformBucketPeak(buckets: WaveformPeakBuckets | null): number {
	if (!buckets) {
		return 0;
	}

	let peak = 0;
	for (let index = 0; index < buckets.maxes.length; index += 1) {
		peak = Math.max(
			peak,
			Math.abs(buckets.mins[index]),
			Math.abs(buckets.maxes[index]),
		);
	}
	return peak;
}

function clearWaveformTilePeakCache(
	surfaceMetadata: WaveformSeekSurfaceMetadata,
): void {
	surfaceMetadata.tilePeakCache.clear();
	surfaceMetadata.tilePeakCacheOrder = [];
}

function getCachedWaveformTilePeaks(
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	key: string,
): WaveformPeakBuckets | null {
	const cached = surfaceMetadata.tilePeakCache.get(key);
	if (!cached) {
		return null;
	}

	const existingIndex = surfaceMetadata.tilePeakCacheOrder.indexOf(key);
	if (existingIndex !== -1) {
		surfaceMetadata.tilePeakCacheOrder.splice(existingIndex, 1);
	}
	surfaceMetadata.tilePeakCacheOrder.push(key);
	return cached;
}

function setCachedWaveformTilePeaks(
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	key: string,
	buckets: WaveformPeakBuckets,
): void {
	if (!surfaceMetadata.tilePeakCache.has(key)) {
		surfaceMetadata.tilePeakCacheOrder.push(key);
	}
	surfaceMetadata.tilePeakCache.set(key, buckets);

	while (
		surfaceMetadata.tilePeakCacheOrder.length > WAVEFORM_TILE_PEAK_CACHE_LIMIT
	) {
		const oldestKey = surfaceMetadata.tilePeakCacheOrder.shift();
		if (oldestKey) {
			surfaceMetadata.tilePeakCache.delete(oldestKey);
		}
	}
}

function resizeCanvasForCssSize(
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

function renderWaveformCanvas(
	canvas: HTMLCanvasElement,
	width: number,
	height: number,
	buckets: WaveformPeakBuckets | null,
	barWidth: number,
	color: string,
	normalizationPeak?: number,
	alpha = 1,
): void {
	const context = resizeCanvasForCssSize(canvas, width, height);
	if (
		!context ||
		!buckets ||
		buckets.maxes.length === 0 ||
		width <= 0 ||
		height <= 0
	) {
		return;
	}

	let maxPeak =
		Number.isFinite(normalizationPeak) && (normalizationPeak as number) > 0
			? (normalizationPeak as number)
			: getWaveformBucketPeak(buckets);
	if (maxPeak <= 0) {
		maxPeak = 1;
	}

	const centerY = Math.round(height / 2);
	const scale = (height * 0.475) / maxPeak;
	const snappedBarWidth = Math.max(1, Math.round(barWidth));
	context.save();
	context.globalAlpha = alpha;
	context.fillStyle = color;

	for (let index = 0; index < buckets.maxes.length; index += 1) {
		const x = Math.round(index * snappedBarWidth);
		if (x >= width) {
			break;
		}

		const top = Math.round(centerY - buckets.maxes[index] * scale);
		const bottom = Math.round(centerY - buckets.mins[index] * scale);
		let y1 = Math.round(clampTime(Math.min(top, bottom), 0, height));
		let y2 = Math.round(clampTime(Math.max(top, bottom), 0, height));
		if (y2 <= y1) {
			y1 = clampTime(centerY, 0, Math.max(0, height - 1));
			y2 = y1 + 1;
		}

		context.fillRect(
			x,
			y1,
			Math.min(snappedBarWidth, Math.max(1, width - x)),
			Math.max(1, y2 - y1),
		);
	}

	context.restore();
}

function renderPlaceholderCanvas(
	canvas: HTMLCanvasElement,
	width: number,
	height: number,
	barWidth: number,
	color: string,
	alpha: number,
): void {
	const context = resizeCanvasForCssSize(canvas, width, height);
	if (width <= 0 || height <= 0) {
		return;
	}

	const snappedBarWidth = Math.max(1, Math.round(barWidth));
	const bars = Math.max(1, Math.floor(width / snappedBarWidth));
	if (!context) {
		return;
	}

	context.save();
	context.globalAlpha = alpha;
	context.fillStyle = color;

	for (let x = 0; x < bars; x += 1) {
		const waveA = Math.sin(x * 0.21);
		const waveB = Math.sin(x * 0.051 + 0.8);
		const amplitude = 0.25 + 0.75 * (Math.abs(waveA + waveB) / 2);
		const barHeight = Math.max(1, Math.round(amplitude * height * 0.7));
		const y = Math.round((height - barHeight) / 2);
		const barX = Math.round(x * snappedBarWidth);
		context.fillRect(
			barX,
			y,
			Math.min(snappedBarWidth, Math.max(1, width - barX)),
			barHeight,
		);
	}

	context.restore();
}

function clearCanvas(
	canvas: HTMLCanvasElement,
	width: number,
	height: number,
): void {
	resizeCanvasForCssSize(canvas, width, height);
}

function getWaveformSurfaceWidth(
	surfaceMetadata: WaveformSeekSurfaceMetadata,
): number {
	return getTimelineSurfaceWidth(surfaceMetadata);
}

function getWaveformViewportState(
	surfaceMetadata: WaveformSeekSurfaceMetadata,
): { startRatio: number; widthRatio: number } {
	return getTimelineViewportState(surfaceMetadata);
}

function updateWaveformMinimapViewport(
	surfaceMetadata: WaveformSeekSurfaceMetadata,
): void {
	updateTimelineMinimapViewport(surfaceMetadata);
}

function resolveWaveformPlaybackMetrics(
	ctx: any,
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	state: { position: number },
	runtimes: TrackRuntime[],
	waveformTimelineContext?: {
		enabled: boolean;
		referenceToTrackTime(trackIndex: number, referenceTime: number): number;
		getTrackDuration(trackIndex: number): number;
	},
): { position: number; duration: number } {
	let position = state.position;
	let duration = ctx.getLongestWaveformSourceDuration(
		runtimes,
		surfaceMetadata.waveformSource,
	);
	const fixedTrackIndex = resolveFixedWaveformTrackIndex(
		runtimes.length,
		surfaceMetadata.waveformSource,
	);

	if (waveformTimelineContext?.enabled && fixedTrackIndex !== null) {
		const trackDuration = sanitizeDuration(
			waveformTimelineContext.getTrackDuration(fixedTrackIndex),
		);
		if (trackDuration > 0) {
			duration = trackDuration;
			position = clampTime(
				waveformTimelineContext.referenceToTrackTime(
					fixedTrackIndex,
					state.position,
				),
				0,
				trackDuration,
			);
		} else {
			duration = 0;
			position = 0;
		}
	}

	const safeDuration = sanitizeDuration(duration);
	return {
		position: safeDuration > 0 ? clampTime(position, 0, safeDuration) : 0,
		duration: safeDuration,
	};
}

function resolvePlaybackFollowScrollLeft(
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	playheadRatio: number,
): number | null {
	return resolveTimelinePlaybackFollowScrollLeft(
		surfaceMetadata,
		playheadRatio,
	);
}

function applyWaveformPlaybackFollowScroll(
	ctx: any,
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	nextScrollLeft: number | null,
): boolean {
	if (!Number.isFinite(nextScrollLeft)) {
		return false;
	}

	const surfaceWidth = getWaveformSurfaceWidth(surfaceMetadata);
	const maxScrollLeft = Math.max(
		0,
		surfaceWidth - surfaceMetadata.scrollContainer.clientWidth,
	);
	const clampedScrollLeft = clampTime(
		nextScrollLeft as number,
		0,
		maxScrollLeft,
	);

	if (
		Math.abs(clampedScrollLeft - surfaceMetadata.scrollContainer.scrollLeft) <
		0.000001
	) {
		return false;
	}

	surfaceMetadata.scrollContainer.scrollLeft = clampedScrollLeft;
	updateWaveformMinimapViewport(surfaceMetadata);
	ctx.scheduleVisibleWaveformTileRefresh();
	return true;
}

function getWaveformMaximumZoom(
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	durationSeconds: number,
): number {
	return getTimelineMaximumZoom(
		durationSeconds,
		surfaceMetadata.maxZoomSeconds,
	);
}

function setWaveformZoomForSurface(
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	zoom: number,
	maximum: number,
	anchorPageX?: number,
): boolean {
	return setTimelineZoomForSurface(
		surfaceMetadata,
		zoom,
		maximum,
		anchorPageX,
		(surface, width) => {
			surface.surface.style.width = `${width}px`;
			surface.surface.style.height = `${surface.originalHeight}px`;
			surface.tileLayer.style.height = `${surface.originalHeight}px`;
		},
	);
}

export function wrapWaveformCanvases(ctx: any): any {
	return function (this: any) {
		const canvases = this.root.querySelectorAll("canvas.waveform");
		canvases.forEach((canvasElement: Element) => {
			if (!(canvasElement instanceof HTMLCanvasElement)) {
				return;
			}

			if (canvasElement.closest(".waveform-wrap")) {
				return;
			}

			const waveformSource = parseWaveformSource(
				canvasElement.getAttribute("data-waveform-source"),
			);
			const barWidth = parseWaveformBarWidth(
				canvasElement.getAttribute("data-waveform-bar-width"),
				1,
			);
			const maxZoomSeconds = parseWaveformMaxZoom(
				canvasElement.getAttribute("data-waveform-max-zoom"),
			);
			const playbackFollowMode = parseWaveformPlaybackFollowMode(
				canvasElement.getAttribute("data-waveform-playback-follow-mode"),
			);
			const timerEnabled = parseWaveformTimerEnabled(
				canvasElement.getAttribute("data-waveform-timer"),
				this.isAlignmentMode(),
			);
			const alignedPlayhead = parseWaveformAlignedPlayheadEnabled(
				canvasElement.getAttribute("data-waveform-aligned-playhead"),
			);
			const showAlignmentPoints = parseWaveformShowAlignmentPointsEnabled(
				canvasElement.getAttribute("data-waveform-show-alignment-points"),
			);
			const originalHeight = canvasElement.height;

			const wrapper = document.createElement("div");
			wrapper.className = "waveform-wrap ts-stack-section";
			wrapper.setAttribute(
				"style",
				sanitizeInlineStyle(canvasElement.getAttribute("data-waveform-style")) +
					"; display: block;",
			);
			const scrollContainer = document.createElement("div");
			scrollContainer.className = "waveform-scroll";
			const overlay = document.createElement("div");
			overlay.className = "waveform-overlay";
			const surface = document.createElement("div");
			surface.className = "waveform-surface";

			const parent = canvasElement.parentElement;
			if (!parent) {
				return;
			}

			parent.insertBefore(wrapper, canvasElement);
			wrapper.appendChild(scrollContainer);
			wrapper.appendChild(overlay);
			scrollContainer.appendChild(surface);
			surface.insertAdjacentHTML(
				"beforeend",
				buildSeekWrap(
					clampPercent(canvasElement.getAttribute("data-seek-margin-left")),
					clampPercent(canvasElement.getAttribute("data-seek-margin-right")),
				),
			);

			const tileLayer = document.createElement("div");
			tileLayer.className = "waveform-tile-layer";
			const seekWrap = surface.querySelector(".seekwrap");
			if (seekWrap instanceof HTMLElement) {
				surface.insertBefore(tileLayer, seekWrap);
			} else {
				surface.appendChild(tileLayer);
			}

			surface.style.height = `${originalHeight}px`;
			scrollContainer.style.height = `${originalHeight}px`;
			canvasElement.remove();

			if (seekWrap instanceof HTMLElement) {
				seekWrap.setAttribute("data-seek-surface", "waveform");
				seekWrap.setAttribute(
					"data-waveform-source",
					serializeWaveformSource(waveformSource),
				);
				const timingNode = timerEnabled
					? this.createWaveformTimingNode(overlay)
					: null;
				const refHooksCanvas = seekWrap.querySelector(".seekhead-ref-hooks");
				const zoomNode = this.createWaveformZoomNode(overlay);
				const zoomMinimapNode = zoomNode.querySelector(
					".waveform-zoom-minimap",
				);
				const zoomCanvas = zoomNode.querySelector(".waveform-zoom-canvas");
				const zoomViewportNode = zoomNode.querySelector(
					".waveform-zoom-viewport",
				);
				if (
					!(zoomMinimapNode instanceof HTMLElement) ||
					!(zoomCanvas instanceof HTMLCanvasElement) ||
					!(zoomViewportNode instanceof HTMLElement)
				) {
					return;
				}
				this.waveformSeekSurfaces.push({
					wrapper: wrapper,
					scrollContainer: scrollContainer,
					overlay: overlay,
					surface: surface,
					tileLayer: tileLayer,
					seekWrap: seekWrap,
					waveformSource: waveformSource,
					playbackFollowMode: playbackFollowMode,
					originalHeight: originalHeight,
					barWidth: barWidth,
					maxZoomSeconds: maxZoomSeconds,
					baseWidth: this.resolveWaveformBaseWidth(
						scrollContainer,
						canvasElement.width,
					),
					zoom: MIN_WAVEFORM_ZOOM,
					timingNode: timingNode,
					zoomNode: zoomNode,
					zoomMinimapNode: zoomMinimapNode,
					zoomCanvas: zoomCanvas,
					zoomViewportNode: zoomViewportNode,
					zoomCanvasLastDrawKey: null,
					waveformColor: null,
					tiles: new Map<
						number,
						{
							canvas: HTMLCanvasElement;
							lastDrawKey: string | null;
						}
					>(),
					normalizationPeak: 1,
					normalizationCacheKey: null,
					tilePeakCache: new Map<string, WaveformPeakBuckets>(),
					tilePeakCacheOrder: [],
					alignedPlayhead: alignedPlayhead,
					refHooksCanvas:
						refHooksCanvas instanceof HTMLCanvasElement ? refHooksCanvas : null,
					showAlignmentPoints: showAlignmentPoints,
					alignmentPointsLastW: -1,
					alignmentPointsLastH: -1,
				});

				scrollContainer.addEventListener(
					"scroll",
					() => {
						const currentSurface = this.findWaveformSurface(seekWrap);
						if (currentSurface) {
							updateWaveformMinimapViewport(currentSurface);
						}
						this.scheduleVisibleWaveformTileRefresh();
					},
					{ passive: true },
				);
			}
		});
	}.call(ctx);
}

export function createWaveformTimingNode(ctx: any, overlay: any): any {
	return function (this: any, overlay: any) {
		const timing = document.createElement("div");
		timing.className = "waveform-timing";
		timing.textContent = "--:--:--:--- / --:--:--:---";
		overlay.appendChild(timing);
		return timing;
	}.call(ctx, overlay);
}

export function createWaveformZoomNode(ctx: any, overlay: any): any {
	return function (this: any, overlay: any) {
		const zoom = document.createElement("div");
		zoom.className = "waveform-zoom";
		zoom.innerHTML =
			'<span class="waveform-zoom-label">Zoom</span>' +
			'<div class="waveform-zoom-minimap">' +
			'<canvas class="waveform waveform-zoom-canvas"></canvas>' +
			'<div class="waveform-zoom-viewport"></div>' +
			"</div>";
		zoom.style.display = "none";
		overlay.appendChild(zoom);
		return zoom;
	}.call(ctx, overlay);
}

export function resolveWaveformBaseWidth(
	ctx: any,
	scrollContainer: any,
	fallback: any,
): any {
	return function (this: any, scrollContainer: any, fallback: any) {
		return resolveTimelineBaseWidth(scrollContainer, fallback);
	}.call(ctx, scrollContainer, fallback);
}

export function setWaveformSurfaceWidth(ctx: any, surfaceMetadata: any): any {
	return function (this: any, surfaceMetadata: any) {
		const width = getWaveformSurfaceWidth(surfaceMetadata);
		surfaceMetadata.surface.style.width = `${width}px`;
		surfaceMetadata.surface.style.height = `${surfaceMetadata.originalHeight}px`;
		surfaceMetadata.tileLayer.style.height = `${surfaceMetadata.originalHeight}px`;
		updateWaveformMinimapViewport(surfaceMetadata);
	}.call(ctx, surfaceMetadata);
}

export function forEachVisibleWaveformTile(
	ctx: any,
	surfaceMetadata: any,
	callback: any,
): any {
	return function (this: any, surfaceMetadata: any, callback: any) {
		const surfaceWidth = Math.max(
			1,
			Math.round(surfaceMetadata.baseWidth * surfaceMetadata.zoom),
		);
		const viewportWidth = Math.max(
			1,
			surfaceMetadata.scrollContainer.clientWidth,
		);
		const scrollLeft = clampTime(
			surfaceMetadata.scrollContainer.scrollLeft,
			0,
			Math.max(0, surfaceWidth - viewportWidth),
		);
		const bufferPx = viewportWidth;
		const visibleStart = Math.max(0, scrollLeft - bufferPx);
		const visibleEnd = Math.min(
			surfaceWidth,
			scrollLeft + viewportWidth + bufferPx,
		);
		const tileWidth = WAVEFORM_TILE_WIDTH_PX;
		const firstTile = Math.max(0, Math.floor(visibleStart / tileWidth));
		const lastTile = Math.max(
			firstTile,
			Math.floor(Math.max(0, visibleEnd - 1) / tileWidth),
		);

		const needed = new Set<number>();
		for (let tileIndex = firstTile; tileIndex <= lastTile; tileIndex += 1) {
			const tileStartPx = tileIndex * tileWidth;
			if (tileStartPx >= surfaceWidth) {
				break;
			}

			const tileCssWidth = Math.max(
				1,
				Math.min(tileWidth, surfaceWidth - tileStartPx),
			);
			let tileRecord = surfaceMetadata.tiles.get(tileIndex);
			let isNew = false;
			if (!tileRecord) {
				const tileCanvas = document.createElement("canvas");
				tileCanvas.classList.add("waveform", "waveform-tile");
				surfaceMetadata.tileLayer.appendChild(tileCanvas);
				tileRecord = { canvas: tileCanvas, lastDrawKey: null };
				surfaceMetadata.tiles.set(tileIndex, tileRecord);
				isNew = true;
			}

			const tileCanvas = tileRecord.canvas;
			const tileCssHeight = Math.max(
				1,
				Math.round(surfaceMetadata.originalHeight),
			);

			tileCanvas.style.left = `${tileStartPx}px`;
			tileCanvas.style.width = `${tileCssWidth}px`;
			tileCanvas.style.height = `${tileCssHeight}px`;

			const renderBarWidth = Math.max(1, Math.round(surfaceMetadata.barWidth));
			callback({
				tileIndex,
				tileStartPx,
				tileCssWidth,
				tileCssHeight,
				surfaceWidth,
				canvas: tileCanvas,
				renderBarWidth,
				isNew,
				record: tileRecord,
			});
			needed.add(tileIndex);
		}

		const existingTileIndexes = Array.from(
			surfaceMetadata.tiles.keys(),
		) as number[];
		existingTileIndexes.forEach((tileIndex: number) => {
			if (needed.has(tileIndex)) {
				return;
			}

			const tileRecord = surfaceMetadata.tiles.get(tileIndex);
			if (tileRecord) {
				tileRecord.canvas.remove();
			}
			surfaceMetadata.tiles.delete(tileIndex);
		});
	}.call(ctx, surfaceMetadata, callback);
}

export function scheduleVisibleWaveformTileRefresh(ctx: any): any {
	return function (this: any) {
		if (this.waveformTileRefreshFrameId !== null) {
			return;
		}

		this.waveformTileRefreshFrameId = requestAnimationFrame(() => {
			this.waveformTileRefreshFrameId = null;
			this.refreshVisibleWaveformTilesFromLatestInput();
		});
	}.call(ctx);
}

export function refreshVisibleWaveformTilesFromLatestInput(ctx: any): any {
	return function (this: any) {
		const latestInput = this.latestWaveformRenderInput;
		if (!latestInput) {
			return;
		}

		this.renderWaveformsInternal(
			latestInput.waveformEngine,
			latestInput.runtimes,
			latestInput.timelineDuration,
			latestInput.trackTimelineProjector,
			latestInput.waveformTimelineContext,
			false,
			false,
		);
	}.call(ctx);
}

export function computeNormalizationPeak(
	ctx: any,
	waveformEngine: any,
	sourceRuntimes: any,
	renderBarWidth: any,
	duration: any,
	baseProjector: any,
	baseWidth: any,
	ignoreTrackPadding: any,
): any {
	return function (
		this: any,
		waveformEngine: any,
		sourceRuntimes: any,
		renderBarWidth: any,
		duration: any,
		baseProjector: any,
		baseWidth: any,
		ignoreTrackPadding: any,
	) {
		if (
			!Number.isFinite(duration) ||
			duration <= 0 ||
			sourceRuntimes.length === 0
		) {
			return 1;
		}

		const normalizationPeakCount = Math.max(
			256,
			Math.min(4096, Math.round(baseWidth)),
		);
		const mixed = waveformEngine.calculateMixedWaveform(
			sourceRuntimes,
			normalizationPeakCount,
			renderBarWidth,
			duration,
			baseProjector,
			0,
			undefined,
			!!ignoreTrackPadding,
		);
		if (!mixed || mixed.maxes.length === 0) {
			return 1;
		}

		const maxPeak = getWaveformBucketPeak(mixed);
		return maxPeak > 0 ? maxPeak : 1;
	}.call(
		ctx,
		waveformEngine,
		sourceRuntimes,
		renderBarWidth,
		duration,
		baseProjector,
		baseWidth,
		ignoreTrackPadding,
	);
}

export function buildWaveformNormalizationCacheKey(
	ctx: any,
	surfaceMetadata: any,
	runtimes: any,
	sourceRuntimes: any,
	fullDuration: any,
	renderBarWidth: any,
	useLocalAxis: any,
	hasTimelineProjector: any,
): any {
	return function (
		this: any,
		surfaceMetadata: any,
		runtimes: any,
		sourceRuntimes: any,
		fullDuration: any,
		renderBarWidth: any,
		useLocalAxis: any,
		hasTimelineProjector: any,
	) {
		const sourceKey = runtimes
			.map((runtime: TrackRuntime, index: number) => {
				const duration = runtime.buffer ? runtime.buffer.duration : 0;
				const timingDuration = runtime.timing
					? runtime.timing.effectiveDuration
					: 0;
				const summarySampleCount = runtime.waveformSummary
					? runtime.waveformSummary.sampleCount
					: 0;
				const selected = sourceRuntimes.indexOf(runtime) !== -1 ? 1 : 0;
				return [
					index,
					selected,
					runtime.activeVariant,
					runtime.sourceIndex,
					runtime.state.solo ? 1 : 0,
					Math.round(runtime.state.volume * 1000),
					Math.round(duration * 1000),
					Math.round(timingDuration * 1000),
					summarySampleCount,
				].join(":");
			})
			.join("|");

		return [
			serializeWaveformSource(surfaceMetadata.waveformSource),
			useLocalAxis ? "local" : "reference",
			hasTimelineProjector ? "projector" : "identity",
			Math.round(fullDuration * 1000),
			renderBarWidth,
			Math.round(surfaceMetadata.baseWidth),
			sourceKey,
		].join("#");
	}.call(
		ctx,
		surfaceMetadata,
		runtimes,
		sourceRuntimes,
		fullDuration,
		renderBarWidth,
		useLocalAxis,
		hasTimelineProjector,
	);
}

function renderWaveformMinimap(
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	waveformEngine: any,
	sourceRuntimes: TrackRuntime[],
	fullDuration: number,
	baseProjector: TrackTimelineProjector | undefined,
	normalizationPeak: number,
	normalizationCacheKey: string,
	ignoreTrackPadding: boolean,
): void {
	if (surfaceMetadata.zoom <= MIN_WAVEFORM_ZOOM + 0.000001) {
		return;
	}

	const waveformColor = resolveWaveformColor(surfaceMetadata.zoomCanvas);
	surfaceMetadata.waveformColor = waveformColor;

	const cssWidth = Math.max(
		1,
		Math.round(surfaceMetadata.zoomMinimapNode.clientWidth),
	);
	const cssHeight = Math.max(
		1,
		Math.round(surfaceMetadata.zoomMinimapNode.clientHeight),
	);
	const canvas = surfaceMetadata.zoomCanvas;

	const drawKey = [
		normalizationCacheKey,
		"minimap",
		cssWidth,
		cssHeight,
		waveformColor,
		Math.max(1, window.devicePixelRatio || 1),
	].join("#");
	if (surfaceMetadata.zoomCanvasLastDrawKey === drawKey) {
		return;
	}

	if (fullDuration <= 0) {
		renderPlaceholderCanvas(canvas, cssWidth, cssHeight, 1, waveformColor, 0.2);
		surfaceMetadata.zoomCanvasLastDrawKey = drawKey;
		return;
	}

	const mixed = waveformEngine.calculateMixedWaveform(
		sourceRuntimes,
		cssWidth,
		1,
		fullDuration,
		baseProjector,
		0,
		undefined,
		ignoreTrackPadding,
	);
	if (!mixed) {
		renderPlaceholderCanvas(canvas, cssWidth, cssHeight, 1, waveformColor, 0.2);
		surfaceMetadata.zoomCanvasLastDrawKey = drawKey;
		return;
	}

	renderWaveformCanvas(
		canvas,
		cssWidth,
		cssHeight,
		mixed,
		1,
		waveformColor,
		normalizationPeak,
	);
	surfaceMetadata.zoomCanvasLastDrawKey = drawKey;
}

export function findWaveformSurface(ctx: any, seekWrap: any): any {
	return function (this: any, seekWrap: any) {
		if (!seekWrap) {
			return null;
		}

		for (let index = 0; index < this.waveformSeekSurfaces.length; index += 1) {
			const entry = this.waveformSeekSurfaces[index];
			if (entry.seekWrap === seekWrap) {
				return entry;
			}
		}

		return null;
	}.call(ctx, seekWrap);
}

export function reflowWaveforms(ctx: any): any {
	return function (this: any) {
		this.waveformSeekSurfaces.forEach(
			(surfaceMetadata: WaveformSeekSurfaceMetadata) => {
				reflowTimelineSurface(surfaceMetadata, (surface, width) => {
					surface.surface.style.width = `${width}px`;
					surface.surface.style.height = `${surface.originalHeight}px`;
					surface.tileLayer.style.height = `${surface.originalHeight}px`;
				});
			},
		);
	}.call(ctx);
}

export function getWaveformZoom(ctx: any, seekWrap: any): any {
	return function (this: any, seekWrap: any) {
		const surfaceMetadata = this.findWaveformSurface(seekWrap);
		if (!surfaceMetadata) {
			return null;
		}

		return surfaceMetadata.zoom;
	}.call(ctx, seekWrap);
}

export function isWaveformZoomEnabled(
	ctx: any,
	seekWrap: any,
	durationSeconds: any,
): any {
	return function (this: any, seekWrap: any, durationSeconds: any) {
		const surfaceMetadata = this.findWaveformSurface(seekWrap);
		if (!surfaceMetadata) {
			return false;
		}

		return (
			getWaveformMaximumZoom(surfaceMetadata, durationSeconds) >
			MIN_WAVEFORM_ZOOM
		);
	}.call(ctx, seekWrap, durationSeconds);
}

export function getWaveformMinimapViewport(ctx: any, seekWrap: any): any {
	return function (this: any, seekWrap: any) {
		const surfaceMetadata = this.findWaveformSurface(seekWrap);
		if (!surfaceMetadata) {
			return null;
		}

		return getWaveformViewportState(surfaceMetadata);
	}.call(ctx, seekWrap);
}

export function setWaveformMinimapViewportStart(
	ctx: any,
	seekWrap: any,
	startRatio: any,
): any {
	return function (this: any, seekWrap: any, startRatio: any) {
		const surfaceMetadata = this.findWaveformSurface(seekWrap);
		if (!surfaceMetadata) {
			return false;
		}

		const viewportState = getWaveformViewportState(surfaceMetadata);
		const surfaceWidth = getWaveformSurfaceWidth(surfaceMetadata);
		const maxStartRatio = Math.max(0, 1 - viewportState.widthRatio);
		const nextStartRatio = clampTime(startRatio, 0, maxStartRatio);
		const nextScrollLeft = nextStartRatio * surfaceWidth;
		const maxScrollLeft = Math.max(
			0,
			surfaceWidth - surfaceMetadata.scrollContainer.clientWidth,
		);
		const clampedScrollLeft = clampTime(nextScrollLeft, 0, maxScrollLeft);
		if (
			Math.abs(clampedScrollLeft - surfaceMetadata.scrollContainer.scrollLeft) <
			0.000001
		) {
			updateWaveformMinimapViewport(surfaceMetadata);
			return false;
		}

		surfaceMetadata.scrollContainer.scrollLeft = clampedScrollLeft;
		updateWaveformMinimapViewport(surfaceMetadata);
		this.scheduleVisibleWaveformTileRefresh();
		return true;
	}.call(ctx, seekWrap, startRatio);
}

export function setWaveformZoom(
	ctx: any,
	seekWrap: any,
	zoom: any,
	durationSeconds: any,
	anchorPageX: any,
): any {
	return function (
		this: any,
		seekWrap: any,
		zoom: any,
		durationSeconds: any,
		anchorPageX: any,
	) {
		const surfaceMetadata = this.findWaveformSurface(seekWrap);
		if (!surfaceMetadata) {
			return false;
		}

		return setWaveformZoomForSurface(
			surfaceMetadata,
			zoom,
			getWaveformMaximumZoom(surfaceMetadata, durationSeconds),
			anchorPageX,
		);
	}.call(ctx, seekWrap, zoom, durationSeconds, anchorPageX);
}

export function drawDummyWaveforms(ctx: any, waveformEngine: any): any {
	return function (this: any, waveformEngine: any) {
		if (this.waveformSeekSurfaces.length === 0) {
			return;
		}

		this.reflowWaveforms();

		for (let i = 0; i < this.waveformSeekSurfaces.length; i += 1) {
			const surfaceMetadata = this.waveformSeekSurfaces[i];
			this.forEachVisibleWaveformTile(
				surfaceMetadata,
				(tile: {
					canvas: HTMLCanvasElement;
					tileCssWidth: number;
					tileCssHeight: number;
					renderBarWidth: number;
				}) => {
					renderPlaceholderCanvas(
						tile.canvas,
						tile.tileCssWidth,
						tile.tileCssHeight,
						tile.renderBarWidth,
						resolveWaveformColor(tile.canvas),
						0.3,
					);
				},
			);
			if (surfaceMetadata.zoom > MIN_WAVEFORM_ZOOM) {
				renderWaveformMinimap(
					surfaceMetadata,
					waveformEngine,
					[],
					0,
					undefined,
					1,
					"placeholder",
					false,
				);
			}
		}
		this.updateWaveformZoomIndicators();
	}.call(ctx, waveformEngine);
}

export function renderWaveforms(
	ctx: any,
	waveformEngine: any,
	runtimes: any,
	timelineDuration: any,
	trackTimelineProjector: any,
	waveformTimelineContext: any,
): any {
	return function (
		this: any,
		waveformEngine: any,
		runtimes: any,
		timelineDuration: any,
		trackTimelineProjector: any,
		waveformTimelineContext: any,
	) {
		this.latestWaveformRenderInput = {
			waveformEngine,
			runtimes,
			timelineDuration,
			trackTimelineProjector,
			waveformTimelineContext,
		};

		this.renderWaveformsInternal(
			waveformEngine,
			runtimes,
			timelineDuration,
			trackTimelineProjector,
			waveformTimelineContext,
			true,
		);
	}.call(
		ctx,
		waveformEngine,
		runtimes,
		timelineDuration,
		trackTimelineProjector,
		waveformTimelineContext,
	);
}

export function renderWaveformsInternal(
	ctx: any,
	waveformEngine: any,
	runtimes: any,
	timelineDuration: any,
	trackTimelineProjector: any,
	waveformTimelineContext: any,
	performReflow: any,
	forceRedrawVisibleTiles: any,
): any {
	return function (
		this: any,
		waveformEngine: any,
		runtimes: any,
		timelineDuration: any,
		trackTimelineProjector: any,
		waveformTimelineContext: any,
		performReflow: any,
		forceRedrawVisibleTiles: any,
	) {
		if (this.waveformSeekSurfaces.length === 0) {
			return;
		}

		if (performReflow) {
			this.reflowWaveforms();
		}

		const safeTimelineDuration =
			Number.isFinite(timelineDuration) && timelineDuration > 0
				? timelineDuration
				: 0;

		let longestTrackDuration = 0;
		if (waveformTimelineContext?.enabled) {
			for (let ti = 0; ti < waveformTimelineContext.getTrackCount(); ti++) {
				const d = sanitizeDuration(
					waveformTimelineContext.getTrackDuration(ti),
				);
				if (d > longestTrackDuration) longestTrackDuration = d;
			}
		}

		for (let i = 0; i < this.waveformSeekSurfaces.length; i += 1) {
			const surfaceMetadata = this.waveformSeekSurfaces[i];
			const waveformSource = surfaceMetadata.waveformSource;
			const sourceRuntimes = this.getWaveformSourceRuntimes(
				runtimes,
				waveformSource,
			);
			const fixedWaveformTrackIndex = this.resolveWaveformTrackIndex(
				runtimes,
				waveformSource,
			);
			const localTrackDuration =
				fixedWaveformTrackIndex === null || !waveformTimelineContext
					? 0
					: sanitizeDuration(
							waveformTimelineContext.getTrackDuration(fixedWaveformTrackIndex),
						);
			const useLocalAxis =
				!!waveformTimelineContext &&
				waveformTimelineContext.enabled &&
				fixedWaveformTrackIndex !== null &&
				localTrackDuration > 0;
			const fullDuration = useLocalAxis
				? longestTrackDuration > 0
					? longestTrackDuration
					: localTrackDuration
				: safeTimelineDuration;
			const baseProjector: TrackTimelineProjector = useLocalAxis
				? (_runtime, trackTimelineTimeSeconds) => trackTimelineTimeSeconds
				: trackTimelineProjector ||
					((_runtime, trackTimelineTimeSeconds) => trackTimelineTimeSeconds);
			const waveformProjector =
				!useLocalAxis && trackTimelineProjector ? baseProjector : undefined;
			const ignoreTrackPadding = useLocalAxis;
			setWaveformZoomForSurface(
				surfaceMetadata,
				surfaceMetadata.zoom,
				getWaveformMaximumZoom(surfaceMetadata, fullDuration),
			);

			const surfaceRenderBarWidth = Math.max(
				1,
				Math.round(surfaceMetadata.barWidth),
			);
			const normalizationCacheKey = this.buildWaveformNormalizationCacheKey(
				surfaceMetadata,
				runtimes,
				sourceRuntimes,
				fullDuration,
				surfaceRenderBarWidth,
				useLocalAxis,
				!useLocalAxis && !!trackTimelineProjector,
			);

			if (surfaceMetadata.normalizationCacheKey !== normalizationCacheKey) {
				surfaceMetadata.normalizationPeak = this.computeNormalizationPeak(
					waveformEngine,
					sourceRuntimes,
					surfaceRenderBarWidth,
					fullDuration,
					waveformProjector,
					surfaceMetadata.baseWidth,
					ignoreTrackPadding,
				);
				surfaceMetadata.normalizationCacheKey = normalizationCacheKey;
				clearWaveformTilePeakCache(surfaceMetadata);
			}

			const normalizationPeak = surfaceMetadata.normalizationPeak;

			this.forEachVisibleWaveformTile(
				surfaceMetadata,
				(tile: {
					tileStartPx: number;
					tileCssWidth: number;
					tileCssHeight: number;
					surfaceWidth: number;
					canvas: HTMLCanvasElement;
					renderBarWidth: number;
					isNew: boolean;
					record: { lastDrawKey: string | null };
				}) => {
					const waveformColor = resolveWaveformColor(tile.canvas);
					const tileDrawKey = [
						normalizationCacheKey,
						Math.round(tile.tileStartPx),
						Math.round(tile.tileCssWidth),
						Math.round(tile.tileCssHeight),
						tile.renderBarWidth,
						waveformColor,
						Math.max(1, window.devicePixelRatio || 1),
					].join("#");

					if (
						!forceRedrawVisibleTiles &&
						!tile.isNew &&
						tile.record.lastDrawKey === tileDrawKey
					) {
						return;
					}

					const peakCount = Math.max(
						1,
						Math.floor(tile.tileCssWidth / tile.renderBarWidth),
					);
					if (fullDuration <= 0) {
						renderPlaceholderCanvas(
							tile.canvas,
							tile.tileCssWidth,
							tile.tileCssHeight,
							tile.renderBarWidth,
							waveformColor,
							0.3,
						);
						tile.record.lastDrawKey = tileDrawKey;
						return;
					}

					const tileStartTime =
						fullDuration * (tile.tileStartPx / tile.surfaceWidth);
					const tileDuration =
						fullDuration * (tile.tileCssWidth / tile.surfaceWidth);
					if (!Number.isFinite(tileDuration) || tileDuration <= 0) {
						renderPlaceholderCanvas(
							tile.canvas,
							tile.tileCssWidth,
							tile.tileCssHeight,
							tile.renderBarWidth,
							waveformColor,
							0.3,
						);
						tile.record.lastDrawKey = tileDrawKey;
						return;
					}

					const peakCacheKey = [
						tileDrawKey,
						Math.round(tileStartTime * 1000000),
						Math.round(tileDuration * 1000000),
						peakCount,
					].join("#");
					let mixed = getCachedWaveformTilePeaks(surfaceMetadata, peakCacheKey);
					if (!mixed) {
						mixed = waveformEngine.calculateMixedWaveform(
							sourceRuntimes,
							peakCount,
							tile.renderBarWidth,
							fullDuration,
							waveformProjector,
							tileStartTime,
							tileDuration,
							ignoreTrackPadding,
						);
						if (mixed) {
							setCachedWaveformTilePeaks(surfaceMetadata, peakCacheKey, mixed);
						}
					}

					if (!mixed) {
						renderPlaceholderCanvas(
							tile.canvas,
							tile.tileCssWidth,
							tile.tileCssHeight,
							tile.renderBarWidth,
							waveformColor,
							0.3,
						);
						tile.record.lastDrawKey = tileDrawKey;
						return;
					}

					renderWaveformCanvas(
						tile.canvas,
						tile.tileCssWidth,
						tile.tileCssHeight,
						mixed,
						tile.renderBarWidth,
						waveformColor,
						normalizationPeak,
					);
					tile.record.lastDrawKey = tileDrawKey;
				},
			);
			renderWaveformMinimap(
				surfaceMetadata,
				waveformEngine,
				sourceRuntimes,
				fullDuration,
				waveformProjector,
				normalizationPeak,
				normalizationCacheKey,
				ignoreTrackPadding,
			);
		}
		this.updateWaveformZoomIndicators();
	}.call(
		ctx,
		waveformEngine,
		runtimes,
		timelineDuration,
		trackTimelineProjector,
		waveformTimelineContext,
		performReflow,
		forceRedrawVisibleTiles,
	);
}

export function getWaveformSourceRuntimes(
	ctx: any,
	runtimes: any,
	waveformSource: any,
): any {
	return function (this: any, runtimes: any, waveformSource: any) {
		return resolveWaveformTrackIndices(runtimes.length, waveformSource)
			.filter((trackIndex: number) =>
				isWaveformTrackAudible(this, runtimes, trackIndex),
			)
			.map((trackIndex: number) => runtimes[trackIndex]);
	}.call(ctx, runtimes, waveformSource);
}

export function resolveWaveformTrackIndex(
	ctx: any,
	runtimes: any,
	waveformSource: any,
): any {
	return function (this: any, runtimes: any, waveformSource: any) {
		return resolveFixedWaveformTrackIndex(runtimes.length, waveformSource);
	}.call(ctx, runtimes, waveformSource);
}

function drawWaveformAlignmentOverlay(
	surface: WaveformSeekSurfaceMetadata,
	width: number,
	height: number,
	refSegments: Array<{ refPx: number; localPx: number }> = [],
	alignmentSegments: Array<{ refPx: number; trackPx: number }> = [],
): void {
	if (!surface.refHooksCanvas) {
		return;
	}

	const context = resizeCanvasForCssSize(surface.refHooksCanvas, width, height);
	if (!context || width <= 0 || height <= 0) {
		return;
	}

	const computedStyle = getComputedStyle(surface.seekWrap);
	const vertExtentRaw = parseFloat(
		computedStyle.getPropertyValue("--seekhead-vertical-extent").trim(),
	);
	const vertExtent = Number.isFinite(vertExtentRaw)
		? Math.max(0, Math.min(0.5, vertExtentRaw))
		: 0.35;
	const segTop = height * (0.5 - vertExtent);
	const segBot = height * (0.5 + vertExtent);

	if (alignmentSegments.length > 0) {
		context.save();
		context.strokeStyle =
			computedStyle.getPropertyValue("--alignment-points-color").trim() ||
			"rgba(128, 128, 128, 0.5)";
		context.lineWidth = 1;
		context.setLineDash([1, 1]);
		context.beginPath();
		for (let index = 0; index < alignmentSegments.length; index += 1) {
			const segment = alignmentSegments[index];
			context.moveTo(segment.refPx, 0);
			context.lineTo(segment.trackPx, segTop);
			context.lineTo(segment.trackPx, segBot);
			context.lineTo(segment.refPx, height);
		}
		context.stroke();
		context.restore();
	}

	if (refSegments.length > 0) {
		context.save();
		context.strokeStyle =
			computedStyle.getPropertyValue("--seekhead-ref-color").trim() ||
			"#383838";
		context.lineWidth = 2;
		context.setLineDash([]);
		context.beginPath();
		for (let index = 0; index < refSegments.length; index += 1) {
			const segment = refSegments[index];
			context.moveTo(segment.refPx, 0);
			context.lineTo(segment.localPx, segTop);
			context.lineTo(segment.localPx, segBot);
			context.lineTo(segment.refPx, height);
		}
		context.stroke();
		context.restore();
	}
}

export function updateWaveformZoomIndicators(ctx: any): any {
	return function (this: any) {
		this.waveformSeekSurfaces.forEach(
			(surface: WaveformSeekSurfaceMetadata) => {
				if (surface.zoom <= MIN_WAVEFORM_ZOOM + 0.000001) {
					surface.zoomNode.style.display = "none";
					return;
				}

				updateWaveformMinimapViewport(surface);
				surface.zoomNode.style.display = "flex";
			},
		);
	}.call(ctx);
}

export function applyFixedWaveformLocalSeekVisuals(
	ctx: any,
	state: any,
	waveformTimelineContext: any,
): any {
	return function (this: any, state: any, waveformTimelineContext: any) {
		if (!waveformTimelineContext?.enabled) {
			this.waveformSeekSurfaces.forEach(
				(surface: WaveformSeekSurfaceMetadata) => {
					surface.seekWrap.classList.remove("aligned-playhead");
					if (surface.refHooksCanvas) {
						clearCanvas(
							surface.refHooksCanvas,
							surface.seekWrap.offsetWidth,
							surface.seekWrap.offsetHeight,
						);
					}
					surface.alignmentPointsLastW = -1;
					surface.alignmentPointsLastH = -1;
				},
			);
			return;
		}

		let longestTrackDuration = 0;
		for (let ti = 0; ti < waveformTimelineContext.getTrackCount(); ti++) {
			const d = sanitizeDuration(waveformTimelineContext.getTrackDuration(ti));
			if (d > longestTrackDuration) longestTrackDuration = d;
		}

		this.waveformSeekSurfaces.forEach(
			(surface: WaveformSeekSurfaceMetadata) => {
				const trackIndex =
					typeof surface.waveformSource === "number"
						? surface.waveformSource
						: null;
				if (trackIndex === null) {
					surface.seekWrap.classList.remove("aligned-playhead");
					if (surface.refHooksCanvas) {
						clearCanvas(
							surface.refHooksCanvas,
							surface.seekWrap.offsetWidth,
							surface.seekWrap.offsetHeight,
						);
					}
					return;
				}

				const trackDuration = sanitizeDuration(
					waveformTimelineContext.getTrackDuration(trackIndex),
				);
				if (trackDuration <= 0) {
					surface.seekWrap.classList.remove("aligned-playhead");
					if (surface.refHooksCanvas) {
						clearCanvas(
							surface.refHooksCanvas,
							surface.seekWrap.offsetWidth,
							surface.seekWrap.offsetHeight,
						);
					}
					return;
				}

				const seekDuration =
					longestTrackDuration > 0 ? longestTrackDuration : trackDuration;

				const localPosition = clampTime(
					waveformTimelineContext.referenceToTrackTime(
						trackIndex,
						state.position,
					),
					0,
					trackDuration,
				);
				const localPointA =
					state.loop.pointA === null
						? null
						: clampTime(
								waveformTimelineContext.referenceToTrackTime(
									trackIndex,
									state.loop.pointA,
								),
								0,
								trackDuration,
							);
				const localPointB =
					state.loop.pointB === null
						? null
						: clampTime(
								waveformTimelineContext.referenceToTrackTime(
									trackIndex,
									state.loop.pointB,
								),
								0,
								trackDuration,
							);

				let orderedPointA = localPointA;
				let orderedPointB = localPointB;
				if (
					orderedPointA !== null &&
					orderedPointB !== null &&
					orderedPointA > orderedPointB
				) {
					const previousA = orderedPointA;
					orderedPointA = orderedPointB;
					orderedPointB = previousA;
				}

				this.updateSeekWrapVisuals(
					surface.seekWrap,
					localPosition,
					seekDuration,
					{
						pointA: orderedPointA,
						pointB: orderedPointB,
						enabled: state.loop.enabled,
					},
				);

				const needsDimensions =
					(surface.refHooksCanvas &&
						surface.alignedPlayhead &&
						seekDuration > 0) ||
					(surface.refHooksCanvas &&
						surface.showAlignmentPoints &&
						seekDuration > 0);
				const w = needsDimensions ? surface.seekWrap.offsetWidth : 0;
				const h = needsDimensions ? surface.seekWrap.offsetHeight : 0;

				const refSegments: Array<{ refPx: number; localPx: number }> = [];
				const alignmentSegments: Array<{ refPx: number; trackPx: number }> = [];

				if (surface.alignedPlayhead && seekDuration > 0) {
					surface.seekWrap.classList.add("aligned-playhead");
					refSegments.push({
						localPx: (localPosition / seekDuration) * w,
						refPx: (state.position / seekDuration) * w,
					});
				} else {
					surface.seekWrap.classList.remove("aligned-playhead");
				}

				if (surface.showAlignmentPoints && seekDuration > 0) {
					const points =
						waveformTimelineContext.getTrackAlignmentPoints(trackIndex);
					for (let pi = 0; pi < points.length; pi++) {
						const pt = points[pi];
						alignmentSegments.push({
							trackPx: (pt.trackTime / seekDuration) * w,
							refPx: (pt.referenceTime / seekDuration) * w,
						});
					}
					surface.alignmentPointsLastW = w;
					surface.alignmentPointsLastH = h;
				} else {
					surface.alignmentPointsLastW = -1;
					surface.alignmentPointsLastH = -1;
				}

				if (surface.refHooksCanvas) {
					drawWaveformAlignmentOverlay(
						surface,
						Math.max(1, w),
						Math.max(1, h),
						refSegments,
						alignmentSegments,
					);
				}
			},
		);
	}.call(ctx, state, waveformTimelineContext);
}

export function getLongestWaveformSourceDuration(
	ctx: any,
	runtimes: any,
	waveformSource: any,
): any {
	return function (this: any, runtimes: any, waveformSource: any) {
		const getRuntimeDuration = (runtime: TrackRuntime): number => {
			return runtime.timing
				? runtime.timing.effectiveDuration
				: runtime.buffer
					? runtime.buffer.duration
					: 0;
		};

		const sourceRuntimes = this.getWaveformSourceRuntimes(
			runtimes,
			waveformSource,
		);
		let longest = 0;
		sourceRuntimes.forEach((runtime: TrackRuntime) => {
			const duration = getRuntimeDuration(runtime);
			if (duration > longest) {
				longest = duration;
			}
		});

		return longest;
	}.call(ctx, runtimes, waveformSource);
}

export function updateWaveformTiming(
	ctx: any,
	state: any,
	runtimes: any,
	waveformTimelineContext: any,
): any {
	return function (
		this: any,
		state: any,
		runtimes: any,
		waveformTimelineContext: any,
	) {
		this.waveformSeekSurfaces.forEach(
			(surface: WaveformSeekSurfaceMetadata) => {
				if (!surface.timingNode) {
					return;
				}

				const playbackMetrics = resolveWaveformPlaybackMetrics(
					this,
					surface,
					state,
					runtimes,
					waveformTimelineContext,
				);
				surface.timingNode.textContent =
					formatSecondsToHHMMSSmmm(playbackMetrics.position) +
					" / " +
					formatSecondsToHHMMSSmmm(playbackMetrics.duration);
			},
		);
	}.call(ctx, state, runtimes, waveformTimelineContext);
}

export function updateWaveformPlaybackFollow(
	ctx: any,
	state: any,
	runtimes: any,
	waveformTimelineContext: any,
	suppressFollow: any,
): any {
	return function (
		this: any,
		state: any,
		runtimes: any,
		waveformTimelineContext: any,
		suppressFollow: any,
	) {
		if (suppressFollow) {
			return;
		}

		this.waveformSeekSurfaces.forEach(
			(surface: WaveformSeekSurfaceMetadata) => {
				if (surface.playbackFollowMode === "off") {
					return;
				}

				const playbackMetrics = resolveWaveformPlaybackMetrics(
					this,
					surface,
					state,
					runtimes,
					waveformTimelineContext,
				);
				if (playbackMetrics.duration <= 0) {
					return;
				}

				applyWaveformPlaybackFollowScroll(
					this,
					surface,
					resolvePlaybackFollowScrollLeft(
						surface,
						playbackMetrics.position / playbackMetrics.duration,
					),
				);
			},
		);
	}.call(ctx, state, runtimes, waveformTimelineContext, suppressFollow);
}
