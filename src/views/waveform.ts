import type {
	TrackTimelineProjector,
	WaveformEngine,
	WaveformLane,
	WaveformMixReader,
	WaveformRange,
	WaveformSignal,
} from "../media/waveform-engine";
import {
	isWaveformTrackAudible,
	resolveAudibleWaveformTrackIndex,
	resolveWaveformTrackIndices,
} from "../media/waveform-engine";
import { applyCssOverrides } from "../shared/dom";
import { clamp, sanitizeDuration } from "../shared/math";
import type {
	TrackRuntime,
	TrackSwitchSpectrogramViewConfig,
	TrackSwitchUiState,
	TrackSwitchWaveformViewConfig,
	WaveformPlaybackFollowMode,
	WaveformSourceIndex,
	WaveformTimeAxis,
} from "../types";
import type { ViewRenderer, WaveformTimelineContext } from "./renderer";
import {
	createSpectrogramSurfaceState,
	drawSpectrogram,
	getSpectrogramDeadline,
	getSpectrogramSettingsKey,
	renderSpectrogramPlaceholder,
	resolveSpectrogramColors,
	type SpectrogramSurfaceState,
	updateSpectrogramAxis,
} from "./spectrogram";
import type { SeekSurfaceRangeRenderer } from "./surface";
import {
	applyTimelineFollowScrollLeft,
	buildSeekWrap,
	createTimelineTimingNode,
	createTimelineZoomNode,
	getTimelineMaximumZoom,
	getTimelineSurfaceWidth,
	getTimelineTimeWidth,
	getTimelineViewportState,
	MIN_TIMELINE_ZOOM,
	positionTileCanvas,
	reflowTimelineSurface,
	resizeCanvasForCssSize,
	resolveTimelineDefaultZoom,
	resolveTimelinePlaybackFollowScrollLeft,
	resolveVisibleTileWindow,
	setTimelineZoomForSurface,
	updateTimelineMinimapViewport,
	updateTimelineZoomIndicators,
} from "./surface";

export interface WaveformSeekSurfaceMetadata {
	wrapper: HTMLElement;
	scrollContainer: HTMLElement;
	overlay: HTMLElement;
	surface: HTMLElement;
	tileLayer: HTMLElement;
	endedRegion: HTMLElement;
	seekWrap: HTMLElement;
	waveformSource: WaveformSourceIndex;
	playbackFollowMode: WaveformPlaybackFollowMode;
	/** Empty surface past the end of the medium; see `TimelineSurfaceGeometry`. */
	trailingPadPx?: number;
	timeAxis: WaveformTimeAxis;
	/**
	 * Draws a stretch of this waveform, given as fractions of the surface's
	 * timeline, at whatever size the canvas asks for — set by each render.
	 */
	drawRange: SeekSurfaceRangeRenderer | null;
	originalHeight: number;
	/** The configured `height`, immutable — the base a fullscreen grow restores to. */
	configuredHeight: number;
	/** `maxZoom` and `defaultZoom` as configured, in the reference timeline's unit. */
	maxZoomValue: number;
	defaultZoomValue: number | null;
	/** The same two in seconds, resolved once the timeline readouts are known. */
	maxZoomSeconds: number;
	defaultZoomSeconds: number | null;
	zoomUnitsResolved: boolean;
	/** Whether `defaultZoom` has opened this surface; a user zoom is never stomped. */
	defaultZoomApplied: boolean;
	baseWidth: number;
	zoom: number;
	timingNode: HTMLElement | null;
	zoomNode: HTMLElement;
	zoomMinimapNode: HTMLElement;
	zoomCanvas: HTMLCanvasElement;
	zoomEndedRegion: HTMLElement;
	zoomViewportNode: HTMLElement;
	zoomCanvasLastDrawKey: string | null;
	/** Rate of the signal last drawn, which bounds the zoom; 0 before one is. */
	sampleRate: number;
	/** What each lane shows, top to bottom: one mono lane, or left and right. */
	lanes: WaveformLane[];
	/**
	 * Whom the engine builds each lane's signals for, by lane and, where
	 * alignment draws every track on its own, track — so one lane's build
	 * never abandons another's.
	 */
	signalRequesters: Map<string, object>;
	tiles: Map<
		number,
		{
			canvas: HTMLCanvasElement;
			lastDrawKey: string | null;
		}
	>;
	alignedPlayhead: boolean;
	refHooksCanvas: HTMLCanvasElement | null;
	showAlignmentPoints: boolean;
	/**
	 * The hooks `refHooksCanvas` shows, as fractions of the seek surface: the
	 * canvas covers only the window around the viewport, so they are redrawn
	 * whenever that window moves.
	 */
	hooks: WaveformHooks;
	hooksDrawKey: string | null;
	/**
	 * Set on a spectrogram, which shares everything about the surface with a
	 * waveform but what is drawn on it.
	 */
	spectrogram: SpectrogramSurfaceState | null;
}

/** Lines that run from a reference position at the edges to a local one inside. */
interface WaveformHooks {
	/** Bumped whenever the hooks change. */
	version: number;
	playhead: Array<{ reference: number; local: number }>;
	alignmentPoints: Array<{ reference: number; local: number }>;
}

const MIN_WAVEFORM_ZOOM = MIN_TIMELINE_ZOOM;
/** Below this many samples per device pixel, a column is read from the samples. */
const RAW_SAMPLES_PER_COLUMN = 64;
/** Below this many samples per device pixel, the samples are traced as a line. */
const TRACE_SAMPLES_PER_COLUMN = 1;
/**
 * CSS width of the traced line: the narrowest where samples lie a pixel
 * apart, widening as the view zooms further in, up to the widest once they
 * lie `TRACE_LINE_WIDEST_SPACING` CSS pixels apart.
 */
const TRACE_LINE_WIDTH = 1.5;
const TRACE_LINE_WIDEST = 2;
const TRACE_LINE_WIDEST_SPACING = 2.5;
/** CSS pixels one sample may span at most; zooming further only spreads them. */
const MAX_PIXELS_PER_SAMPLE = 32;
/**
 * The same for a spectrogram, whose frames span thousands of samples: past a
 * column per eight samples, neighbouring columns analyse nearly the same frame.
 */
const SPECTROGRAM_MAX_PIXELS_PER_SAMPLE = 1 / 8;
/** Share of the half height the loudest sample reaches. */
const WAVEFORM_PEAK_EXTENT = 0.95;

/** A signal as a surface shows it, one lane holding one or several. */
interface WaveformLayer {
	signal: WaveformSignal;
	/**
	 * Takes a time on the signal's own timeline to the surface's; null where
	 * the two are the same.
	 */
	project: ((seconds: number) => number) | null;
	/** Length of the signal's own timeline in seconds — `project`'s domain. */
	duration: number;
}

/** The player draws the waveform itself, so the seek surface spans it exactly. */
function isWaveformTrackAudibleForCtx(
	ctx: ViewRenderer,
	runtimes: TrackRuntime[],
	trackIndex: number,
	waveformSource: WaveformSourceIndex,
): boolean {
	return isWaveformTrackAudible(
		runtimes,
		trackIndex,
		waveformSource,
		ctx.isAlignmentMode(),
		ctx.isTrackExclusive,
	);
}

function resolveWaveformColors(element: HTMLElement): WaveformColors {
	const style = getComputedStyle(element);
	return {
		waveform: style.getPropertyValue("--waveform-color").trim(),
		divider: style.getPropertyValue("--waveform-lane-divider-color").trim(),
	};
}

function updateWaveformEndedRegions(
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	trackDuration: number,
	axisDuration: number,
	visible: boolean,
): void {
	const shouldShow =
		visible &&
		trackDuration > 0 &&
		axisDuration > 0 &&
		trackDuration < axisDuration - 0.000001;
	const display = shouldShow ? "block" : "none";
	surfaceMetadata.endedRegion.style.display = display;
	surfaceMetadata.zoomEndedRegion.style.display = display;

	if (!shouldShow) {
		return;
	}

	const startPercent = Math.max(
		0,
		Math.min(100, (trackDuration / axisDuration) * 100),
	);
	const left = `${String(startPercent)}%`;
	surfaceMetadata.endedRegion.style.left = left;
	surfaceMetadata.zoomEndedRegion.style.left = left;
}

/** The earliest time in [`low`, `high`] that `project` takes to `target` or later. */
function invertProjection(
	project: (seconds: number) => number,
	target: number,
	low: number,
	high: number,
): number {
	if (project(low) >= target) {
		return low;
	}

	for (let iteration = 0; iteration < 52; iteration += 1) {
		const middle = (low + high) / 2;
		if (project(middle) >= target) {
			high = middle;
		} else {
			low = middle;
		}
	}
	return high;
}

/**
 * Where the edges of `columns` equal columns spanning a stretch of the surface
 * fall in a layer's signal, in fractional samples.
 */
function resolveColumnEdges(
	layer: WaveformLayer,
	startSeconds: number,
	durationSeconds: number,
	columns: number,
): Float64Array {
	const edges = new Float64Array(columns + 1);
	const rate = layer.signal.sampleRate;
	const secondsPerColumn = durationSeconds / columns;
	const project = layer.project;
	if (!project) {
		for (let column = 0; column <= columns; column += 1) {
			edges[column] = (startSeconds + column * secondsPerColumn) * rate;
		}
		return edges;
	}

	// The projection runs from the signal's timeline to the surface's, so it is
	// inverted here: bracket the stretch, sample the projection twice per
	// column across it, and interpolate between those samples.
	const first = invertProjection(project, startSeconds, 0, layer.duration);
	const last = invertProjection(
		project,
		startSeconds + durationSeconds,
		first,
		layer.duration,
	);
	const steps = columns * 2;
	const times = new Float64Array(steps + 1);
	const projected = new Float64Array(steps + 1);
	for (let step = 0; step <= steps; step += 1) {
		times[step] = first + ((last - first) * step) / steps;
		projected[step] = project(times[step]);
	}
	let step = 0;
	for (let column = 0; column <= columns; column += 1) {
		const target = startSeconds + column * secondsPerColumn;
		while (step < steps - 1 && projected[step + 1] <= target) {
			step += 1;
		}
		const span = projected[step + 1] - projected[step];
		const fraction =
			span > 0 ? clamp((target - projected[step]) / span, 0, 1) : 0;
		edges[column] =
			(times[step] + (times[step + 1] - times[step]) * fraction) * rate;
	}
	return edges;
}

/**
 * Fills one device-pixel column per span between `edges` with the range the
 * signal covers there: from the summary where a column spans many samples,
 * from the samples themselves where it spans few.
 */
function drawWaveformEnvelope(
	context: CanvasRenderingContext2D,
	signal: WaveformSignal,
	edges: Float64Array,
	drawColumns: number,
	lane: WaveformLaneBand,
	scale: number,
	pixelRatio: number,
): void {
	const centerY = lane.top + lane.height / 2;
	const range: WaveformRange = { min: 0, max: 0 };
	let samples = new Float32Array(0);
	// Columns read sample by sample draw what is nearly a line already, so
	// they take on the traced line's thickness, which the view switches to as
	// it zooms further in.
	const rawPadding = (TRACE_LINE_WIDTH * pixelRatio) / 2;
	const addColumn = (
		column: number,
		min: number,
		max: number,
		padding: number,
	): void => {
		let top = clamp(
			centerY - max * scale - padding,
			lane.top,
			lane.top + lane.height,
		);
		let bottom = clamp(
			centerY - min * scale + padding,
			lane.top,
			lane.top + lane.height,
		);
		// Silence still shows as a line one device pixel thick.
		if (bottom - top < 1) {
			const middle = (top + bottom) / 2;
			top = middle - 0.5;
			bottom = middle + 0.5;
		}
		context.rect(column, top, 1, bottom - top);
	};

	context.beginPath();
	let column = 0;
	while (column < drawColumns) {
		if (edges[column + 1] - edges[column] >= RAW_SAMPLES_PER_COLUMN) {
			if (
				signal.envelope(
					Math.floor(edges[column]),
					Math.floor(edges[column + 1]) + 1,
					range,
				)
			) {
				addColumn(column, range.min, range.max, 0);
			} else {
				addColumn(column, 0, 0, 0);
			}
			column += 1;
			continue;
		}

		// A run of columns read sample by sample. Each also takes the first
		// sample of the next column, so neighbouring columns always touch.
		let runEnd = column + 1;
		while (
			runEnd < drawColumns &&
			edges[runEnd + 1] - edges[runEnd] < RAW_SAMPLES_PER_COLUMN
		) {
			runEnd += 1;
		}
		const first = Math.floor(edges[column]);
		const count = Math.floor(edges[runEnd]) - first + 1;
		if (samples.length < count) {
			samples = new Float32Array(count);
		}
		signal.read(first, samples, count);
		for (; column < runEnd; column += 1) {
			const from = Math.floor(edges[column]) - first;
			const to = Math.floor(edges[column + 1]) - first;
			let min = samples[from];
			let max = min;
			for (let index = from + 1; index <= to; index += 1) {
				const value = samples[index];
				if (value < min) {
					min = value;
				} else if (value > max) {
					max = value;
				}
			}
			addColumn(column, min, max, rawPadding);
		}
	}
	context.fill();
}

/**
 * Traces the samples themselves as a line, once columns are narrower than a
 * sample.
 */
function drawWaveformTrace(
	context: CanvasRenderingContext2D,
	signal: WaveformSignal,
	edges: Float64Array,
	columns: number,
	drawColumns: number,
	lane: WaveformLaneBand,
	scale: number,
	pixelRatio: number,
): void {
	const centerY = lane.top + lane.height / 2;
	const first = Math.floor(edges[0]) - 1;
	const count = Math.ceil(edges[columns]) + 2 - first;
	const samples = new Float32Array(count);
	signal.read(first, samples, count);
	const xs = new Float64Array(count);
	let column = 0;
	for (let index = 0; index < count; index += 1) {
		const position = first + index;
		while (column < columns - 1 && edges[column + 1] <= position) {
			column += 1;
		}
		const span = edges[column + 1] - edges[column];
		xs[index] = span > 0 ? column + (position - edges[column]) / span : column;
	}

	context.save();
	context.beginPath();
	context.rect(0, lane.top, drawColumns, lane.height);
	context.clip();
	const spacing = columns / (edges[columns] - edges[0]) / pixelRatio;
	const widening = clamp((spacing - 1) / (TRACE_LINE_WIDEST_SPACING - 1), 0, 1);
	context.lineWidth =
		(TRACE_LINE_WIDTH + (TRACE_LINE_WIDEST - TRACE_LINE_WIDTH) * widening) *
		pixelRatio;
	context.lineJoin = "round";
	context.beginPath();
	for (let index = 0; index < count; index += 1) {
		const y = centerY - samples[index] * scale;
		if (index === 0) {
			context.moveTo(xs[index], y);
		} else {
			context.lineTo(xs[index], y);
		}
	}
	context.stroke();
	context.restore();
}

/** The rows of a canvas one lane is drawn in, in device pixels. */
interface WaveformLaneBand {
	top: number;
	height: number;
}

interface WaveformColors {
	waveform: string;
	/** The line between lanes. */
	divider: string;
}

/**
 * Draws a stretch of the surface's timeline into a canvas at device-pixel
 * resolution, the lanes stacked top to bottom, each around its own zero line.
 * All of them are scaled so the loudest sample of any layer in any lane
 * reaches the same height, which keeps the lanes comparable. Nothing is drawn
 * right of `drawCssWidth`.
 */
function drawWaveform(
	canvas: HTMLCanvasElement,
	cssWidth: number,
	cssHeight: number,
	lanes: WaveformLayer[][],
	startSeconds: number,
	durationSeconds: number,
	colors: WaveformColors,
	drawCssWidth = cssWidth,
): void {
	const context = resizeCanvasForCssSize(canvas, cssWidth, cssHeight);
	if (!context || durationSeconds <= 0) {
		return;
	}

	const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
	const columns = canvas.width;
	const drawColumns = clamp(Math.round(drawCssWidth * pixelRatio), 0, columns);
	const laneHeight = canvas.height / lanes.length;
	let peak = 0;
	lanes.forEach((layers) => {
		layers.forEach((layer) => {
			peak = Math.max(peak, layer.signal.peak);
		});
	});
	const scale =
		((laneHeight / 2) * WAVEFORM_PEAK_EXTENT) / (peak > 0 ? peak : 1);

	context.setTransform(1, 0, 0, 1, 0, 0);
	context.fillStyle = colors.divider;
	for (let index = 1; index < lanes.length; index += 1) {
		context.fillRect(
			0,
			Math.round(laneHeight * index - pixelRatio / 2),
			columns,
			Math.max(1, Math.round(pixelRatio)),
		);
	}
	context.fillStyle = colors.waveform;
	context.strokeStyle = colors.waveform;
	lanes.forEach((layers, index) => {
		const lane = { top: laneHeight * index, height: laneHeight };
		layers.forEach((layer) => {
			const edges = resolveColumnEdges(
				layer,
				startSeconds,
				durationSeconds,
				columns,
			);
			if ((edges[columns] - edges[0]) / columns < TRACE_SAMPLES_PER_COLUMN) {
				drawWaveformTrace(
					context,
					layer.signal,
					edges,
					columns,
					drawColumns,
					lane,
					scale,
					pixelRatio,
				);
			} else {
				drawWaveformEnvelope(
					context,
					layer.signal,
					edges,
					drawColumns,
					lane,
					scale,
					pixelRatio,
				);
			}
		});
	});
}

/** Draws a stand-in pattern into each of `laneCount` lanes stacked in the canvas. */
function renderPlaceholderCanvas(
	canvas: HTMLCanvasElement,
	width: number,
	height: number,
	color: string,
	alpha: number,
	laneCount: number,
): void {
	const context = resizeCanvasForCssSize(canvas, width, height);
	if (!context || width <= 0 || height <= 0) {
		return;
	}

	const bars = Math.max(1, Math.floor(width));
	context.save();
	context.globalAlpha = alpha;
	context.fillStyle = color;

	for (let x = 0; x < bars; x += 1) {
		const waveA = Math.sin(x * 0.21);
		const waveB = Math.sin(x * 0.051 + 0.8);
		const amplitude = 0.25 + 0.75 * (Math.abs(waveA + waveB) / 2);
		const laneHeight = height / laneCount;
		const barHeight = Math.max(1, Math.round(amplitude * laneHeight * 0.7));
		for (let lane = 0; lane < laneCount; lane += 1) {
			context.fillRect(
				x,
				Math.round(lane * laneHeight + (laneHeight - barHeight) / 2),
				1,
				barHeight,
			);
		}
	}

	context.restore();
}

/**
 * Writes the geometry of a waveform surface: the virtual width, the height, and
 * the seek surface, which spans the medium rather than a `pinnedLeft` pad past
 * the end of it.
 */
function applyWaveformSurfaceGeometry(
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	width: number,
): void {
	surfaceMetadata.surface.style.width = `${width}px`;
	surfaceMetadata.surface.style.height = `${surfaceMetadata.originalHeight}px`;
	surfaceMetadata.tileLayer.style.height = `${surfaceMetadata.originalHeight}px`;
	surfaceMetadata.seekWrap.style.width = `${getTimelineTimeWidth(surfaceMetadata)}px`;
}

function getWaveformViewportState(
	surfaceMetadata: WaveformSeekSurfaceMetadata,
): { startRatio: number; widthRatio: number } {
	return getTimelineViewportState(surfaceMetadata);
}

function resolveWaveformPlaybackMetrics(
	ctx: ViewRenderer,
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	state: { position: number },
	runtimes: TrackRuntime[],
	waveformTimelineContext?: WaveformTimelineContext,
	useAxisDuration = false,
): { position: number; duration: number; trackIndex: number | null } {
	let position = state.position;
	let duration = ctx.getLongestWaveformSourceDuration(
		runtimes,
		surfaceMetadata.waveformSource,
	);
	// A fixed source resolves to its own track index outright. A dynamic
	// "audible" source resolves to the first audible track — under alignment
	// everything audible at once shares one timeline, so that track's own local
	// timeline stands in for position/duration, same as a fixed source would.
	// Resolved without an alignment too, where it names nothing but the medium
	// whose unit the readout is printed in.
	const resolvedTrackIndex = resolveAudibleWaveformTrackIndex(
		runtimes,
		surfaceMetadata.waveformSource,
		ctx.isAlignmentMode(),
		ctx.isTrackExclusive,
	);

	if (waveformTimelineContext?.enabled && resolvedTrackIndex !== null) {
		const trackDuration = sanitizeDuration(
			waveformTimelineContext.getTrackDuration(resolvedTrackIndex),
		);
		if (trackDuration > 0) {
			duration = trackDuration;
			if (useAxisDuration && surfaceMetadata.timeAxis === "shared") {
				for (let index = 0; index < runtimes.length; index += 1) {
					duration = Math.max(
						duration,
						sanitizeDuration(waveformTimelineContext.getTrackDuration(index)),
					);
				}
			}
			position = clamp(
				waveformTimelineContext.getPlaybackPosition(resolvedTrackIndex) ??
					waveformTimelineContext.referenceToTrackTime(
						resolvedTrackIndex,
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
		position: safeDuration > 0 ? clamp(position, 0, safeDuration) : 0,
		duration: safeDuration,
		// Null on a waveform with nothing audible, whose metrics are then the
		// reference timeline's own.
		trackIndex: resolvedTrackIndex,
	};
}

function applyWaveformPlaybackFollowScroll(
	ctx: ViewRenderer,
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	nextScrollLeft: number | null,
	animate: boolean,
): boolean {
	if (!Number.isFinite(nextScrollLeft)) {
		return false;
	}

	const surfaceWidth = getTimelineSurfaceWidth(surfaceMetadata);
	const maxScrollLeft = Math.max(
		0,
		surfaceWidth - surfaceMetadata.scrollContainer.clientWidth,
	);
	const clampedScrollLeft = clamp(nextScrollLeft as number, 0, maxScrollLeft);

	return applyTimelineFollowScrollLeft(
		surfaceMetadata,
		clampedScrollLeft,
		animate,
		(surface) => {
			updateTimelineMinimapViewport(surface);
			// Drawn right away rather than on the next frame: zoomed in far, playback
			// carries the viewport past the tile's buffer within a single frame.
			ctx.refreshVisibleWaveformTilesFromLatestInput();
		},
	);
}

/**
 * Turns the configured zoom spans into seconds. A waveform seeks on the
 * reference timeline, so `maxZoom` and `defaultZoom` are written in the unit
 * that timeline declares — known only once the readouts are in place.
 */
function resolveWaveformZoomUnits(
	ctx: ViewRenderer,
	surfaceMetadata: WaveformSeekSurfaceMetadata,
): void {
	if (surfaceMetadata.zoomUnitsResolved) {
		return;
	}

	surfaceMetadata.zoomUnitsResolved = true;
	surfaceMetadata.maxZoomSeconds = ctx.resolveReferenceSpanSeconds(
		surfaceMetadata.maxZoomValue,
	);
	surfaceMetadata.defaultZoomSeconds =
		surfaceMetadata.defaultZoomValue === null
			? null
			: ctx.resolveReferenceSpanSeconds(surfaceMetadata.defaultZoomValue);
}

function getWaveformMaximumZoom(
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	durationSeconds: number,
): number {
	const maximum = getTimelineMaximumZoom(
		durationSeconds,
		surfaceMetadata.maxZoomSeconds,
		surfaceMetadata.baseWidth,
	);
	if (surfaceMetadata.sampleRate <= 0) {
		return maximum;
	}

	return Math.max(
		MIN_WAVEFORM_ZOOM,
		Math.min(
			maximum,
			(durationSeconds *
				surfaceMetadata.sampleRate *
				(surfaceMetadata.spectrogram
					? SPECTROGRAM_MAX_PIXELS_PER_SAMPLE
					: MAX_PIXELS_PER_SAMPLE)) /
				surfaceMetadata.baseWidth,
		),
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
		applyWaveformSurfaceGeometry,
	);
}

export function wrapWaveformCanvases(ctx: ViewRenderer): void {
	const canvases = ctx.root.querySelectorAll("canvas.waveform");
	canvases.forEach((canvasElement: Element) => {
		if (!(canvasElement instanceof HTMLCanvasElement)) {
			return;
		}

		if (canvasElement.closest(".waveform-wrap")) {
			return;
		}

		const definition = ctx.getConfiguredViewHost(canvasElement);
		if (
			definition.view.type !== "waveform" &&
			definition.view.type !== "spectrogram"
		) {
			return;
		}
		const config = definition.view as
			| TrackSwitchWaveformViewConfig
			| TrackSwitchSpectrogramViewConfig;
		const waveformSource = definition.waveformSource ?? "audible";
		const maxZoomSeconds = config.maxZoom ?? 0;
		const playbackFollowMode = config.playbackFollowMode ?? "center";
		const timeAxis = config.timeAxis ?? "shared";
		const timerEnabled = config.timer ?? ctx.isAlignmentMode();
		const alignedPlayhead = config.alignedPlayhead === true;
		const lanes: WaveformLane[] = config.stereo ? ["left", "right"] : ["mono"];
		const showAlignmentPoints = !!config.markerLayers?.some(
			(layer) => layer.sequence === "alignment" && layer.foldToReference,
		);
		const originalHeight = canvasElement.height;

		const wrapper = document.createElement("div");
		wrapper.className = [
			"waveform-wrap",
			config.type === "spectrogram" ? "spectrogram-wrap" : "",
			config.stereo ? "waveform-stereo" : "",
			"ts-stack-section",
		]
			.filter(Boolean)
			.join(" ");
		applyCssOverrides(wrapper, config.css);
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
			buildSeekWrap({ referenceHookCanvas: true }),
		);

		// One viewport-sized canvas slides over the virtual waveform surface.
		// This keeps zoom independent of browser canvas limits without creating a
		// DOM node per tile.
		const tileLayer = document.createElement("canvas");
		tileLayer.className = "waveform waveform-tile waveform-tile-layer";
		const endedRegion = document.createElement("div");
		endedRegion.className = "waveform-ended-region";
		const seekWrap = surface.querySelector(".seekwrap");
		if (seekWrap instanceof HTMLElement) {
			surface.insertBefore(tileLayer, seekWrap);
			surface.insertBefore(endedRegion, seekWrap);
		} else {
			surface.appendChild(tileLayer);
			surface.appendChild(endedRegion);
		}

		surface.style.height = `${originalHeight}px`;
		scrollContainer.style.height = `${originalHeight}px`;
		canvasElement.remove();

		if (seekWrap instanceof HTMLElement) {
			ctx.registerSeekMarkerLayers(seekWrap, config.markerLayers);
			seekWrap.setAttribute("data-seek-surface", "waveform");
			const timingNode = timerEnabled
				? createTimelineTimingNode(overlay, "waveform-timing")
				: null;
			if (config.stereo) {
				["left", "right"].forEach((side) => {
					const label = document.createElement("div");
					label.className = `waveform-channel-label waveform-channel-label-${side}`;
					label.textContent = side === "left" ? "L" : "R";
					overlay.appendChild(label);
				});
			}
			const spectrogram =
				config.type === "spectrogram"
					? createSpectrogramSurfaceState(config, lanes.length, overlay)
					: null;
			const refHooksCanvas = seekWrap.querySelector(".seekhead-ref-hooks");
			const zoomNode = createTimelineZoomNode(overlay, "waveform", {
				canvasClass: "waveform",
				endedRegion: true,
			});
			const zoomMinimapNode = zoomNode.querySelector(".waveform-zoom-minimap");
			const zoomCanvas = zoomNode.querySelector(".waveform-zoom-canvas");
			const zoomEndedRegion = zoomNode.querySelector(
				".waveform-zoom-ended-region",
			);
			const zoomViewportNode = zoomNode.querySelector(
				".waveform-zoom-viewport",
			);
			if (
				!(zoomMinimapNode instanceof HTMLElement) ||
				!(zoomCanvas instanceof HTMLCanvasElement) ||
				!(zoomEndedRegion instanceof HTMLElement) ||
				!(zoomViewportNode instanceof HTMLElement)
			) {
				return;
			}
			ctx.waveformSeekSurfaces.push({
				wrapper: wrapper,
				scrollContainer: scrollContainer,
				overlay: overlay,
				surface: surface,
				tileLayer: tileLayer,
				endedRegion: endedRegion,
				seekWrap: seekWrap,
				waveformSource: waveformSource,
				playbackFollowMode: playbackFollowMode,
				drawRange: null,
				timeAxis: timeAxis,
				originalHeight: originalHeight,
				configuredHeight: originalHeight,
				maxZoomValue: maxZoomSeconds,
				defaultZoomValue: config.defaultZoom ?? null,
				maxZoomSeconds: maxZoomSeconds,
				defaultZoomSeconds: null,
				zoomUnitsResolved: false,
				defaultZoomApplied: false,
				baseWidth: ctx.resolveTimelineBaseWidth(
					scrollContainer,
					canvasElement.width,
				),
				zoom: MIN_WAVEFORM_ZOOM,
				timingNode: timingNode,
				zoomNode: zoomNode,
				zoomMinimapNode: zoomMinimapNode,
				zoomCanvas: zoomCanvas,
				zoomEndedRegion: zoomEndedRegion,
				zoomViewportNode: zoomViewportNode,
				zoomCanvasLastDrawKey: null,
				sampleRate: 0,
				lanes: lanes,
				signalRequesters: new Map<string, object>(),
				tiles: new Map<
					number,
					{
						canvas: HTMLCanvasElement;
						lastDrawKey: string | null;
					}
				>([[0, { canvas: tileLayer, lastDrawKey: null }]]),
				alignedPlayhead: alignedPlayhead,
				refHooksCanvas:
					refHooksCanvas instanceof HTMLCanvasElement ? refHooksCanvas : null,
				showAlignmentPoints: showAlignmentPoints,
				hooks: { version: 0, playhead: [], alignmentPoints: [] },
				hooksDrawKey: null,
				spectrogram: spectrogram,
			});

			scrollContainer.addEventListener(
				"scroll",
				() => {
					const currentSurface = ctx.findWaveformSurface(seekWrap);
					if (currentSurface) {
						updateTimelineMinimapViewport(currentSurface);
					}
					ctx.scheduleVisibleWaveformTileRefresh();
					ctx.onTimelineViewportScroll(seekWrap);
				},
				{ passive: true },
			);
		}
	});
}

export function setWaveformSurfaceWidth(
	surfaceMetadata: WaveformSeekSurfaceMetadata,
): void {
	applyWaveformSurfaceGeometry(
		surfaceMetadata,
		getTimelineSurfaceWidth(surfaceMetadata),
	);
	updateTimelineMinimapViewport(surfaceMetadata);
}

/** Resizes a surface's rendered height (fullscreen growth/restore) and redraws it. */
export function setWaveformSurfaceHeight(
	ctx: ViewRenderer,
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	height: number,
): void {
	if (surfaceMetadata.originalHeight === height) {
		return;
	}

	surfaceMetadata.originalHeight = height;
	surfaceMetadata.surface.style.height = `${height}px`;
	surfaceMetadata.scrollContainer.style.height = `${height}px`;
	surfaceMetadata.tileLayer.style.height = `${height}px`;
	surfaceMetadata.zoomCanvasLastDrawKey = null;
	ctx.refreshVisibleWaveformTilesFromLatestInput();
}

export interface WaveformVisibleTile {
	tileIndex: number;
	tileStartPx: number;
	tileCssWidth: number;
	tileCssHeight: number;
	surfaceWidth: number;
	/** The part of the surface the medium occupies, without a trailing pad. */
	timeWidth: number;
	canvas: HTMLCanvasElement;
	isNew: boolean;
	record: {
		canvas: HTMLCanvasElement;
		lastDrawKey: string | null;
	};
}

export function forEachVisibleWaveformTile(
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	callback: (tile: WaveformVisibleTile) => void,
): void {
	const tileRecord = surfaceMetadata.tiles.get(0);
	if (!tileRecord) return;
	const tileCanvas = tileRecord.canvas;
	const tileWindow = resolveVisibleTileWindow(
		surfaceMetadata,
		surfaceMetadata.originalHeight,
	);
	const { tileStartPx, tileCssWidth, tileCssHeight, surfaceWidth, timeWidth } =
		tileWindow;
	positionTileCanvas(tileCanvas, tileWindow);
	callback({
		tileIndex: 0,
		tileStartPx,
		tileCssWidth,
		tileCssHeight,
		surfaceWidth,
		timeWidth,
		canvas: tileCanvas,
		isNew: false,
		record: tileRecord,
	});
}

export function scheduleVisibleWaveformTileRefresh(ctx: ViewRenderer): void {
	if (ctx.waveformTileRefreshFrameId !== null) {
		return;
	}

	ctx.waveformTileRefreshFrameId = requestAnimationFrame(() => {
		ctx.waveformTileRefreshFrameId = null;
		ctx.refreshVisibleWaveformTilesFromLatestInput();
	});
}

export function refreshVisibleWaveformTilesFromLatestInput(
	ctx: ViewRenderer,
): void {
	const latestInput = ctx.latestWaveformRenderInput;
	if (!latestInput) {
		return;
	}

	ctx.renderWaveformsInternal(
		latestInput.waveformEngine,
		latestInput.runtimes,
		latestInput.timelineDuration,
		latestInput.trackTimelineProjector,
		latestInput.waveformTimelineContext,
		false,
		false,
	);
}

function renderWaveformMinimap(
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	lanes: WaveformLayer[][] | null,
	layersKey: string,
	fullDuration: number,
	waveformEndRatio: number,
): void {
	if (surfaceMetadata.zoom <= MIN_WAVEFORM_ZOOM + 0.000001) {
		return;
	}

	const colors = resolveWaveformColors(surfaceMetadata.zoomCanvas);
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
		layersKey,
		fullDuration,
		waveformEndRatio,
		cssWidth,
		cssHeight,
		colors.waveform,
		colors.divider,
		Math.max(1, window.devicePixelRatio || 1),
	].join("#");
	if (surfaceMetadata.zoomCanvasLastDrawKey === drawKey) {
		return;
	}
	surfaceMetadata.zoomCanvasLastDrawKey = drawKey;

	if (!lanes || fullDuration <= 0) {
		renderPlaceholderCanvas(
			canvas,
			cssWidth,
			cssHeight,
			colors.waveform,
			0.2,
			surfaceMetadata.lanes.length,
		);
		return;
	}

	drawWaveform(
		canvas,
		cssWidth,
		cssHeight,
		lanes,
		0,
		fullDuration,
		colors,
		cssWidth * waveformEndRatio,
	);
}

export function findWaveformSurface(
	ctx: ViewRenderer,
	seekWrap: HTMLElement | null,
): WaveformSeekSurfaceMetadata | null {
	if (!seekWrap) {
		return null;
	}

	for (let index = 0; index < ctx.waveformSeekSurfaces.length; index += 1) {
		const entry = ctx.waveformSeekSurfaces[index];
		if (entry.seekWrap === seekWrap) {
			return entry;
		}
	}

	return null;
}

export function reflowWaveforms(ctx: ViewRenderer): void {
	ctx.waveformSeekSurfaces.forEach(
		(surfaceMetadata: WaveformSeekSurfaceMetadata) => {
			reflowTimelineSurface(surfaceMetadata, applyWaveformSurfaceGeometry);
		},
	);
}

export function getWaveformZoom(
	ctx: ViewRenderer,
	seekWrap: HTMLElement,
): number | null {
	const surfaceMetadata = ctx.findWaveformSurface(seekWrap);
	if (!surfaceMetadata) {
		return null;
	}

	return surfaceMetadata.zoom;
}

export function isWaveformZoomEnabled(
	ctx: ViewRenderer,
	seekWrap: HTMLElement,
	durationSeconds: number,
): boolean {
	const surfaceMetadata = ctx.findWaveformSurface(seekWrap);
	if (!surfaceMetadata) {
		return false;
	}

	return (
		getWaveformMaximumZoom(surfaceMetadata, durationSeconds) > MIN_WAVEFORM_ZOOM
	);
}

export function getWaveformMinimapViewport(
	ctx: ViewRenderer,
	seekWrap: HTMLElement,
): { startRatio: number; widthRatio: number } | null {
	const surfaceMetadata = ctx.findWaveformSurface(seekWrap);
	if (!surfaceMetadata) {
		return null;
	}

	return getWaveformViewportState(surfaceMetadata);
}

export function setWaveformMinimapViewportStart(
	ctx: ViewRenderer,
	seekWrap: HTMLElement,
	startRatio: number,
): boolean {
	const surfaceMetadata = ctx.findWaveformSurface(seekWrap);
	if (!surfaceMetadata) {
		return false;
	}

	const viewportState = getWaveformViewportState(surfaceMetadata);
	const surfaceWidth = getTimelineSurfaceWidth(surfaceMetadata);
	const maxStartRatio = Math.max(0, 1 - viewportState.widthRatio);
	const nextStartRatio = clamp(startRatio, 0, maxStartRatio);
	const nextScrollLeft = nextStartRatio * surfaceWidth;
	const maxScrollLeft = Math.max(
		0,
		surfaceWidth - surfaceMetadata.scrollContainer.clientWidth,
	);
	const clampedScrollLeft = clamp(nextScrollLeft, 0, maxScrollLeft);
	if (
		Math.abs(clampedScrollLeft - surfaceMetadata.scrollContainer.scrollLeft) <
		0.000001
	) {
		updateTimelineMinimapViewport(surfaceMetadata);
		return false;
	}

	surfaceMetadata.scrollContainer.scrollLeft = clampedScrollLeft;
	updateTimelineMinimapViewport(surfaceMetadata);
	ctx.scheduleVisibleWaveformTileRefresh();
	return true;
}

export function setWaveformZoom(
	ctx: ViewRenderer,
	seekWrap: HTMLElement,
	zoom: number,
	durationSeconds: number,
	anchorPageX: number | undefined,
): boolean {
	const surfaceMetadata = ctx.findWaveformSurface(seekWrap);
	if (!surfaceMetadata) {
		return false;
	}

	return setWaveformZoomForSurface(
		surfaceMetadata,
		zoom,
		getWaveformMaximumZoom(surfaceMetadata, durationSeconds),
		anchorPageX,
	);
}

export function drawDummyWaveforms(ctx: ViewRenderer): void {
	if (ctx.waveformSeekSurfaces.length === 0) {
		return;
	}

	ctx.reflowWaveforms();

	for (let i = 0; i < ctx.waveformSeekSurfaces.length; i += 1) {
		const surfaceMetadata = ctx.waveformSeekSurfaces[i];
		ctx.forEachVisibleWaveformTile(surfaceMetadata, (tile) => {
			if (surfaceMetadata.spectrogram) {
				renderSpectrogramPlaceholder(
					tile.canvas,
					tile.tileCssWidth,
					tile.tileCssHeight,
					resolveSpectrogramColors(tile.canvas),
				);
				return;
			}
			renderPlaceholderCanvas(
				tile.canvas,
				tile.tileCssWidth,
				tile.tileCssHeight,
				resolveWaveformColors(tile.canvas).waveform,
				0.3,
				surfaceMetadata.lanes.length,
			);
		});
		if (!surfaceMetadata.spectrogram) {
			renderWaveformMinimap(surfaceMetadata, null, "placeholder", 0, 1);
		}
	}
	updateTimelineZoomIndicators(ctx.waveformSeekSurfaces);
}

export function renderWaveforms(
	ctx: ViewRenderer,
	waveformEngine: WaveformEngine,
	runtimes: TrackRuntime[],
	timelineDuration: number,
	trackTimelineProjector: TrackTimelineProjector | undefined,
	waveformTimelineContext: WaveformTimelineContext | undefined,
): void {
	ctx.latestWaveformRenderInput = {
		waveformEngine,
		runtimes,
		timelineDuration,
		trackTimelineProjector,
		waveformTimelineContext,
	};

	ctx.renderWaveformsInternal(
		waveformEngine,
		runtimes,
		timelineDuration,
		trackTimelineProjector,
		waveformTimelineContext,
		true,
	);
}

function getSignalRequester(
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	key: string,
): object {
	let requester = surfaceMetadata.signalRequesters.get(key);
	if (!requester) {
		requester = {};
		surfaceMetadata.signalRequesters.set(key, requester);
	}
	return requester;
}

/**
 * What each of a surface's lanes shows: the mix of its sources on the
 * surface's timeline, or, where alignment warps that timeline, each source on
 * its own projected onto it. Null while some lane has nothing to show yet.
 */
function resolveWaveformLanes(
	ctx: ViewRenderer,
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	waveformEngine: WaveformEngine,
	sourceRuntimes: TrackRuntime[],
	fullDuration: number,
	waveformProjector: TrackTimelineProjector | undefined,
): WaveformLayer[][] | null {
	const onReady = (): void => ctx.scheduleVisibleWaveformTileRefresh();
	const lanes = surfaceMetadata.lanes.map((lane): WaveformLayer[] => {
		if (!waveformProjector) {
			const signal = waveformEngine.getSignal(
				getSignalRequester(surfaceMetadata, lane),
				sourceRuntimes,
				fullDuration,
				lane,
				onReady,
			);
			return signal ? [{ signal, project: null, duration: fullDuration }] : [];
		}

		const layers: WaveformLayer[] = [];
		sourceRuntimes.forEach((runtime, index) => {
			if (!runtime.timing) {
				return;
			}
			const duration = runtime.timing.effectiveDuration;
			const signal =
				lane === "mono"
					? waveformEngine.getTrackSignal(runtime)
					: waveformEngine.getSignal(
							getSignalRequester(surfaceMetadata, `${lane}:${index}`),
							[runtime],
							duration,
							lane,
							onReady,
						);
			if (signal) {
				layers.push({
					signal,
					project: (seconds) => waveformProjector(runtime, seconds),
					duration,
				});
			}
		});
		return layers;
	});
	return lanes.every((layers) => layers.length > 0) ? lanes : null;
}

/** Opens the surface at `defaultZoom`, and keeps its zoom within bounds. */
function applyWaveformZoom(
	ctx: ViewRenderer,
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	fullDuration: number,
): void {
	resolveWaveformZoomUnits(ctx, surfaceMetadata);
	const maximumZoom = getWaveformMaximumZoom(surfaceMetadata, fullDuration);
	// `defaultZoom` only ever opens the surface: once it has, a reflow or a
	// hot reload leaves whatever zoom the listener is on.
	let targetZoom = surfaceMetadata.zoom;
	if (!surfaceMetadata.defaultZoomApplied && fullDuration > 0) {
		surfaceMetadata.defaultZoomApplied = true;
		targetZoom = resolveTimelineDefaultZoom(
			fullDuration,
			surfaceMetadata.defaultZoomSeconds,
			maximumZoom,
		);
	}
	setWaveformZoomForSurface(surfaceMetadata, targetZoom, maximumZoom);
}

/**
 * What each of a spectrogram's lanes analyses: the mix of its sources on the
 * surface's timeline. Null where alignment warps that timeline — each source
 * would then lie on its own warped stretch, and spectrograms overlaid on one
 * another show nothing readable.
 */
function resolveSpectrogramReaders(
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	waveformEngine: WaveformEngine,
	sourceRuntimes: TrackRuntime[],
	fullDuration: number,
	waveformProjector: TrackTimelineProjector | undefined,
): WaveformMixReader[] | null {
	if (waveformProjector) {
		return null;
	}

	const readers: WaveformMixReader[] = [];
	for (const lane of surfaceMetadata.lanes) {
		const reader = waveformEngine.getMixReader(
			sourceRuntimes,
			fullDuration,
			lane,
		);
		if (!reader) {
			return null;
		}
		readers.push(reader);
	}
	return readers;
}

/**
 * Draws a spectrogram's tile and minimap. Columns still unanalysed when a
 * redraw's budget runs out leave their canvas marked undrawn, and another
 * redraw is scheduled to carry on.
 */
function renderSpectrogramSurface(
	ctx: ViewRenderer,
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	state: SpectrogramSurfaceState,
	waveformEngine: WaveformEngine,
	sourceRuntimes: TrackRuntime[],
	fullDuration: number,
	waveformProjector: TrackTimelineProjector | undefined,
	waveformEndRatio: number,
	forceRedrawVisibleTiles: boolean,
): void {
	const readers = resolveSpectrogramReaders(
		surfaceMetadata,
		waveformEngine,
		sourceRuntimes,
		fullDuration,
		waveformProjector,
	);
	if (readers) {
		surfaceMetadata.sampleRate = readers[0].sampleRate;
	}
	applyWaveformZoom(ctx, surfaceMetadata, fullDuration);
	updateSpectrogramAxis(
		state,
		surfaceMetadata.originalHeight,
		surfaceMetadata.sampleRate,
	);
	const readersKey = readers
		? readers.map((reader) => reader.key).join("/")
		: "placeholder";
	const settingsKey = getSpectrogramSettingsKey(state);
	const deadline = getSpectrogramDeadline();
	let pending = false;

	surfaceMetadata.drawRange = (
		canvas,
		cssWidth,
		cssHeight,
		startRatio,
		widthRatio,
	) => {
		const colors = resolveSpectrogramColors(surfaceMetadata.tileLayer);
		if (!readers || fullDuration <= 0) {
			renderSpectrogramPlaceholder(canvas, cssWidth, cssHeight, colors);
			return;
		}
		const secondsPerColumn = (fullDuration * widthRatio) / cssWidth;
		drawSpectrogram(
			canvas,
			cssWidth,
			cssHeight,
			readers,
			{
				firstColumn: Math.round((fullDuration * startRatio) / secondsPerColumn),
				secondsPerColumn,
				drawColumns:
					cssWidth * clamp((waveformEndRatio - startRatio) / widthRatio, 0, 1),
				priorityStart: 0,
				priorityEnd: cssWidth,
			},
			state,
			[],
			colors,
			Number.POSITIVE_INFINITY,
		);
	};

	ctx.forEachVisibleWaveformTile(surfaceMetadata, (tile) => {
		const colors = resolveSpectrogramColors(tile.canvas);
		const tileDrawKey = [
			readersKey,
			settingsKey,
			fullDuration,
			waveformEndRatio,
			tile.timeWidth,
			Math.round(tile.tileStartPx),
			Math.round(tile.tileCssWidth),
			Math.round(tile.tileCssHeight),
			colors.background,
			colors.color,
			colors.divider,
			Math.max(1, window.devicePixelRatio || 1),
		].join("#");
		if (
			!forceRedrawVisibleTiles &&
			!tile.isNew &&
			tile.record.lastDrawKey === tileDrawKey
		) {
			return;
		}
		tile.record.lastDrawKey = tileDrawKey;

		if (!readers || fullDuration <= 0) {
			renderSpectrogramPlaceholder(
				tile.canvas,
				tile.tileCssWidth,
				tile.tileCssHeight,
				colors,
			);
			return;
		}

		const viewportStart =
			surfaceMetadata.scrollContainer.scrollLeft - tile.tileStartPx;
		const complete = drawSpectrogram(
			tile.canvas,
			tile.tileCssWidth,
			tile.tileCssHeight,
			readers,
			{
				firstColumn: Math.round(tile.tileStartPx),
				secondsPerColumn: fullDuration / tile.timeWidth,
				drawColumns: clamp(
					waveformEndRatio * tile.timeWidth - tile.tileStartPx,
					0,
					tile.tileCssWidth,
				),
				priorityStart: viewportStart,
				priorityEnd:
					viewportStart + surfaceMetadata.scrollContainer.clientWidth,
			},
			state,
			state.tileCaches,
			colors,
			deadline,
		);
		if (!complete) {
			tile.record.lastDrawKey = null;
			pending = true;
		}
	});

	if (
		surfaceMetadata.zoom > MIN_WAVEFORM_ZOOM + 0.000001 &&
		!renderSpectrogramMinimap(
			surfaceMetadata,
			state,
			readers,
			`${readersKey}#${settingsKey}`,
			fullDuration,
			waveformEndRatio,
			deadline,
		)
	) {
		pending = true;
	}
	drawWaveformAlignmentOverlay(surfaceMetadata);
	if (pending) {
		ctx.scheduleVisibleWaveformTileRefresh();
	}
}

/** The minimap of a spectrogram; false while some of it is still unanalysed. */
function renderSpectrogramMinimap(
	surfaceMetadata: WaveformSeekSurfaceMetadata,
	state: SpectrogramSurfaceState,
	readers: WaveformMixReader[] | null,
	readersKey: string,
	fullDuration: number,
	waveformEndRatio: number,
	deadline: number,
): boolean {
	const colors = resolveSpectrogramColors(surfaceMetadata.zoomCanvas);
	const cssWidth = Math.max(
		1,
		Math.round(surfaceMetadata.zoomMinimapNode.clientWidth),
	);
	const cssHeight = Math.max(
		1,
		Math.round(surfaceMetadata.zoomMinimapNode.clientHeight),
	);
	const drawKey = [
		readersKey,
		fullDuration,
		waveformEndRatio,
		cssWidth,
		cssHeight,
		colors.background,
		colors.color,
		colors.divider,
		Math.max(1, window.devicePixelRatio || 1),
	].join("#");
	if (surfaceMetadata.zoomCanvasLastDrawKey === drawKey) {
		return true;
	}
	surfaceMetadata.zoomCanvasLastDrawKey = drawKey;

	if (!readers || fullDuration <= 0) {
		renderSpectrogramPlaceholder(
			surfaceMetadata.zoomCanvas,
			cssWidth,
			cssHeight,
			colors,
		);
		return true;
	}

	const complete = drawSpectrogram(
		surfaceMetadata.zoomCanvas,
		cssWidth,
		cssHeight,
		readers,
		{
			firstColumn: 0,
			secondsPerColumn: fullDuration / cssWidth,
			drawColumns: cssWidth * waveformEndRatio,
			priorityStart: 0,
			priorityEnd: cssWidth,
		},
		state,
		state.minimapCaches,
		colors,
		deadline,
	);
	if (!complete) {
		surfaceMetadata.zoomCanvasLastDrawKey = null;
	}
	return complete;
}

export function renderWaveformsInternal(
	ctx: ViewRenderer,
	waveformEngine: WaveformEngine,
	runtimes: TrackRuntime[],
	timelineDuration: number,
	trackTimelineProjector: TrackTimelineProjector | undefined,
	waveformTimelineContext: WaveformTimelineContext | undefined,
	performReflow: boolean,
	forceRedrawVisibleTiles: boolean,
): void {
	if (ctx.waveformSeekSurfaces.length === 0) {
		return;
	}

	if (performReflow) {
		ctx.reflowWaveforms();
	}

	const safeTimelineDuration =
		Number.isFinite(timelineDuration) && timelineDuration > 0
			? timelineDuration
			: 0;

	let longestTrackDuration = 0;
	if (waveformTimelineContext?.enabled) {
		for (let ti = 0; ti < waveformTimelineContext.getTrackCount(); ti++) {
			const d = sanitizeDuration(waveformTimelineContext.getTrackDuration(ti));
			if (d > longestTrackDuration) longestTrackDuration = d;
		}
	}

	for (let i = 0; i < ctx.waveformSeekSurfaces.length; i += 1) {
		const surfaceMetadata = ctx.waveformSeekSurfaces[i];
		const waveformSource = surfaceMetadata.waveformSource;
		const sourceRuntimes = ctx.getWaveformSourceRuntimes(
			runtimes,
			waveformSource,
		);
		// A fixed source resolves to its own track index outright. A dynamic
		// "audible" source resolves to the first audible track and renders its
		// own unwarped waveform exactly like a fixed source would — everything
		// audible beside it shares that timeline. With nothing audible there is
		// no track to bind to, and it falls back below to the flat,
		// projector-warped reference timeline.
		const fixedWaveformTrackIndex = resolveAudibleWaveformTrackIndex(
			runtimes,
			waveformSource,
			ctx.isAlignmentMode(),
			ctx.isTrackExclusive,
		);
		const localTrackDuration =
			fixedWaveformTrackIndex === null || !waveformTimelineContext
				? 0
				: sanitizeDuration(
						waveformTimelineContext.getTrackDuration(fixedWaveformTrackIndex),
					);
		const useFixedTrackAxis =
			!!waveformTimelineContext &&
			waveformTimelineContext.enabled &&
			fixedWaveformTrackIndex !== null &&
			localTrackDuration > 0;
		const useIndividualAxis =
			useFixedTrackAxis && surfaceMetadata.timeAxis === "individual";
		const fullDuration = useFixedTrackAxis
			? useIndividualAxis
				? localTrackDuration
				: longestTrackDuration > 0
					? longestTrackDuration
					: localTrackDuration
			: safeTimelineDuration;
		// On its own track's axis a waveform is never warped.
		const waveformProjector = useFixedTrackAxis
			? undefined
			: trackTimelineProjector;
		updateWaveformEndedRegions(
			surfaceMetadata,
			localTrackDuration,
			fullDuration,
			useFixedTrackAxis && !useIndividualAxis,
		);
		const waveformEndRatio =
			useFixedTrackAxis && !useIndividualAxis && fullDuration > 0
				? clamp(localTrackDuration / fullDuration, 0, 1)
				: 1;

		if (surfaceMetadata.spectrogram) {
			renderSpectrogramSurface(
				ctx,
				surfaceMetadata,
				surfaceMetadata.spectrogram,
				waveformEngine,
				sourceRuntimes,
				fullDuration,
				waveformProjector,
				waveformEndRatio,
				forceRedrawVisibleTiles,
			);
			continue;
		}

		const lanes = resolveWaveformLanes(
			ctx,
			surfaceMetadata,
			waveformEngine,
			sourceRuntimes,
			fullDuration,
			waveformProjector,
		);
		if (lanes) {
			surfaceMetadata.sampleRate = lanes[0][0].signal.sampleRate;
		}
		const layersKey = lanes
			? `${lanes
					.map((layers) => layers.map((layer) => layer.signal.id).join(","))
					.join("/")}${waveformProjector ? "@warped" : ""}`
			: "placeholder";

		applyWaveformZoom(ctx, surfaceMetadata, fullDuration);

		surfaceMetadata.drawRange = (
			canvas,
			cssWidth,
			cssHeight,
			startRatio,
			widthRatio,
		) => {
			const colors = resolveWaveformColors(surfaceMetadata.tileLayer);
			if (!lanes || fullDuration <= 0) {
				renderPlaceholderCanvas(
					canvas,
					cssWidth,
					cssHeight,
					colors.waveform,
					0.3,
					surfaceMetadata.lanes.length,
				);
				return;
			}
			drawWaveform(
				canvas,
				cssWidth,
				cssHeight,
				lanes,
				fullDuration * startRatio,
				fullDuration * widthRatio,
				colors,
				cssWidth * clamp((waveformEndRatio - startRatio) / widthRatio, 0, 1),
			);
		};

		ctx.forEachVisibleWaveformTile(surfaceMetadata, (tile) => {
			const colors = resolveWaveformColors(tile.canvas);
			const tileDrawKey = [
				layersKey,
				fullDuration,
				waveformEndRatio,
				tile.timeWidth,
				Math.round(tile.tileStartPx),
				Math.round(tile.tileCssWidth),
				Math.round(tile.tileCssHeight),
				colors.waveform,
				colors.divider,
				Math.max(1, window.devicePixelRatio || 1),
			].join("#");

			if (
				!forceRedrawVisibleTiles &&
				!tile.isNew &&
				tile.record.lastDrawKey === tileDrawKey
			) {
				return;
			}
			tile.record.lastDrawKey = tileDrawKey;

			if (!lanes || fullDuration <= 0) {
				renderPlaceholderCanvas(
					tile.canvas,
					tile.tileCssWidth,
					tile.tileCssHeight,
					colors.waveform,
					0.3,
					surfaceMetadata.lanes.length,
				);
				return;
			}

			drawWaveform(
				tile.canvas,
				tile.tileCssWidth,
				tile.tileCssHeight,
				lanes,
				fullDuration * (tile.tileStartPx / tile.timeWidth),
				fullDuration * (tile.tileCssWidth / tile.timeWidth),
				colors,
				clamp(
					waveformEndRatio * tile.timeWidth - tile.tileStartPx,
					0,
					tile.tileCssWidth,
				),
			);
		});
		renderWaveformMinimap(
			surfaceMetadata,
			lanes,
			layersKey,
			fullDuration,
			waveformEndRatio,
		);
		drawWaveformAlignmentOverlay(surfaceMetadata);
	}
	updateTimelineZoomIndicators(ctx.waveformSeekSurfaces);
}

/**
 * The first track a stereo waveform shows whose audio — either variant of it
 * — does not hold exactly two channels, so has no left and right to show.
 */
export function findStereoWaveformChannelMismatch(
	ctx: ViewRenderer,
	runtimes: TrackRuntime[],
): {
	runtime: TrackRuntime;
	channels: number;
	view: "waveform" | "spectrogram";
} | null {
	for (const surface of ctx.waveformSeekSurfaces) {
		if (surface.lanes.length < 2) {
			continue;
		}
		for (const trackIndex of resolveWaveformTrackIndices(
			runtimes.length,
			surface.waveformSource,
		)) {
			const runtime = runtimes[trackIndex];
			for (const source of [runtime.baseSource, runtime.syncedSource]) {
				const channels = source?.buffer?.numberOfChannels;
				if (channels !== undefined && channels !== 2) {
					return {
						runtime,
						channels,
						view: surface.spectrogram ? "spectrogram" : "waveform",
					};
				}
			}
		}
	}
	return null;
}

export function getWaveformSourceRuntimes(
	ctx: ViewRenderer,
	runtimes: TrackRuntime[],
	waveformSource: WaveformSourceIndex,
): TrackRuntime[] {
	return resolveWaveformTrackIndices(runtimes.length, waveformSource)
		.filter((trackIndex: number) =>
			isWaveformTrackAudibleForCtx(ctx, runtimes, trackIndex, waveformSource),
		)
		.map((trackIndex: number) => runtimes[trackIndex]);
}

function setWaveformHooks(
	surface: WaveformSeekSurfaceMetadata,
	playhead: WaveformHooks["playhead"],
	alignmentPoints: WaveformHooks["alignmentPoints"],
): void {
	const hooks = surface.hooks;
	if (
		playhead.length === 0 &&
		alignmentPoints.length === 0 &&
		hooks.playhead.length === 0 &&
		hooks.alignmentPoints.length === 0
	) {
		return;
	}

	surface.hooks = {
		version: hooks.version + 1,
		playhead,
		alignmentPoints,
	};
	drawWaveformAlignmentOverlay(surface);
}

/**
 * Draws the hooks into the same window around the viewport the waveform tile
 * covers. A canvas spanning the whole surface would outgrow the largest one a
 * browser composites long before the waveform runs out of zoom.
 */
function drawWaveformAlignmentOverlay(
	surface: WaveformSeekSurfaceMetadata,
): void {
	const canvas = surface.refHooksCanvas;
	if (!canvas) {
		return;
	}

	const tileWindow = resolveVisibleTileWindow(surface, surface.originalHeight);
	const { playhead, alignmentPoints, version } = surface.hooks;
	const drawKey = [
		version,
		tileWindow.tileStartPx,
		tileWindow.tileCssWidth,
		tileWindow.tileCssHeight,
		tileWindow.timeWidth,
	].join("#");
	if (surface.hooksDrawKey === drawKey) {
		return;
	}
	surface.hooksDrawKey = drawKey;

	positionTileCanvas(canvas, tileWindow);
	const context = resizeCanvasForCssSize(
		canvas,
		tileWindow.tileCssWidth,
		tileWindow.tileCssHeight,
	);
	if (!context || (playhead.length === 0 && alignmentPoints.length === 0)) {
		return;
	}

	const height = tileWindow.tileCssHeight;
	const computedStyle = getComputedStyle(surface.seekWrap);
	const vertExtentRaw = parseFloat(
		computedStyle.getPropertyValue("--seekhead-vertical-extent").trim(),
	);
	const vertExtent = Number.isFinite(vertExtentRaw)
		? Math.max(0, Math.min(0.5, vertExtentRaw))
		: 0.35;
	const segTop = height * (0.5 - vertExtent);
	const segBot = height * (0.5 + vertExtent);
	const windowEnd = tileWindow.tileCssWidth;
	const traceHooks = (hooks: WaveformHooks["playhead"]): void => {
		context.beginPath();
		for (let index = 0; index < hooks.length; index += 1) {
			const referenceX =
				hooks[index].reference * tileWindow.timeWidth - tileWindow.tileStartPx;
			const localX =
				hooks[index].local * tileWindow.timeWidth - tileWindow.tileStartPx;
			if (
				Math.max(referenceX, localX) < 0 ||
				Math.min(referenceX, localX) > windowEnd
			) {
				continue;
			}
			context.moveTo(referenceX, 0);
			context.lineTo(localX, segTop);
			context.lineTo(localX, segBot);
			context.lineTo(referenceX, height);
		}
		context.stroke();
	};

	if (alignmentPoints.length > 0) {
		context.save();
		context.strokeStyle =
			computedStyle.getPropertyValue("--alignment-points-color").trim() ||
			"rgba(128, 128, 128, 0.5)";
		context.lineWidth = 1;
		context.setLineDash([1, 1]);
		traceHooks(alignmentPoints);
		context.restore();
	}

	if (playhead.length > 0) {
		context.save();
		context.strokeStyle =
			computedStyle.getPropertyValue("--seekhead-ref-color").trim() ||
			"#383838";
		context.lineWidth = 2;
		context.setLineDash([]);
		traceHooks(playhead);
		context.restore();
	}
}

export function applyWaveformLocalSeekVisuals(
	ctx: ViewRenderer,
	state: TrackSwitchUiState,
	runtimes: TrackRuntime[],
	waveformTimelineContext: WaveformTimelineContext | undefined,
): void {
	if (!waveformTimelineContext?.enabled) {
		ctx.waveformSeekSurfaces.forEach((surface: WaveformSeekSurfaceMetadata) => {
			surface.seekWrap.classList.remove("aligned-playhead");
			setWaveformHooks(surface, [], []);
		});
		return;
	}

	let longestTrackDuration = 0;
	for (let ti = 0; ti < waveformTimelineContext.getTrackCount(); ti++) {
		const d = sanitizeDuration(waveformTimelineContext.getTrackDuration(ti));
		if (d > longestTrackDuration) longestTrackDuration = d;
	}

	ctx.waveformSeekSurfaces.forEach((surface: WaveformSeekSurfaceMetadata) => {
		const trackIndex = resolveAudibleWaveformTrackIndex(
			runtimes,
			surface.waveformSource,
			ctx.isAlignmentMode(),
			ctx.isTrackExclusive,
		);
		if (trackIndex === null) {
			surface.seekWrap.classList.remove("aligned-playhead");
			setWaveformHooks(surface, [], []);
			return;
		}

		const trackDuration = sanitizeDuration(
			waveformTimelineContext.getTrackDuration(trackIndex),
		);
		if (trackDuration <= 0) {
			surface.seekWrap.classList.remove("aligned-playhead");
			setWaveformHooks(surface, [], []);
			return;
		}

		const sharedDuration =
			longestTrackDuration > 0 ? longestTrackDuration : trackDuration;
		const seekDuration =
			surface.timeAxis === "individual" ? trackDuration : sharedDuration;
		const referenceDisplayDuration =
			surface.timeAxis === "individual" ? sharedDuration : seekDuration;

		// The playhead comes from the anchor where there is one: projecting
		// the reference position back out collapses any stretch the
		// alignment holds at one reference value onto a single point, which
		// is what makes the head jump while the audio runs through it. Loop
		// points below are reference coordinates and have no anchor.
		const localPosition = clamp(
			waveformTimelineContext.getPlaybackPosition(trackIndex) ??
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
				: clamp(
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
				: clamp(
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

		ctx.updateSeekWrapVisuals(surface.seekWrap, localPosition, seekDuration, {
			pointA: orderedPointA,
			pointB: orderedPointB,
			enabled: state.loop.enabled,
		});

		const playhead: WaveformHooks["playhead"] = [];
		const alignmentPoints: WaveformHooks["alignmentPoints"] = [];

		if (surface.alignedPlayhead && seekDuration > 0) {
			surface.seekWrap.classList.add("aligned-playhead");
			playhead.push({
				local: localPosition / seekDuration,
				reference: state.position / referenceDisplayDuration,
			});
		} else {
			surface.seekWrap.classList.remove("aligned-playhead");
		}

		if (surface.showAlignmentPoints && seekDuration > 0) {
			const points =
				waveformTimelineContext.getTrackAlignmentPoints(trackIndex);
			for (let pi = 0; pi < points.length; pi++) {
				const pt = points[pi];
				alignmentPoints.push({
					local: pt.trackTime / seekDuration,
					reference: pt.referenceTime / referenceDisplayDuration,
				});
			}
		}

		setWaveformHooks(surface, playhead, alignmentPoints);
	});
}

export function getLongestWaveformSourceDuration(
	ctx: ViewRenderer,
	runtimes: TrackRuntime[],
	waveformSource: WaveformSourceIndex,
): number {
	const getRuntimeDuration = (runtime: TrackRuntime): number => {
		return runtime.timing
			? runtime.timing.effectiveDuration
			: runtime.buffer
				? runtime.buffer.duration
				: 0;
	};

	const sourceRuntimes = ctx.getWaveformSourceRuntimes(
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
}

export function updateWaveformTiming(
	ctx: ViewRenderer,
	state: TrackSwitchUiState,
	runtimes: TrackRuntime[],
	waveformTimelineContext: WaveformTimelineContext | undefined,
): void {
	ctx.waveformSeekSurfaces.forEach((surface: WaveformSeekSurfaceMetadata) => {
		if (!surface.timingNode) {
			return;
		}

		const playbackMetrics = resolveWaveformPlaybackMetrics(
			ctx,
			surface,
			state,
			runtimes,
			waveformTimelineContext,
		);
		// The readout belongs to the timeline the metrics were resolved on:
		// the track's own when one is audible, the reference otherwise.
		const timeline =
			playbackMetrics.trackIndex === null
				? ctx.referenceTimelineId
				: (runtimes[playbackMetrics.trackIndex]?.definition.id ?? null);
		surface.timingNode.textContent = ctx.formatLocalTimelinePair(
			timeline,
			playbackMetrics.position,
			playbackMetrics.duration,
		);
	});
}

export function updateWaveformPlaybackFollow(
	ctx: ViewRenderer,
	state: TrackSwitchUiState,
	runtimes: TrackRuntime[],
	waveformTimelineContext: WaveformTimelineContext | undefined,
	suppressFollow: boolean,
	animate = false,
): void {
	if (suppressFollow) {
		return;
	}

	ctx.waveformSeekSurfaces.forEach((surface: WaveformSeekSurfaceMetadata) => {
		if (surface.playbackFollowMode === "off") {
			return;
		}

		const playbackMetrics = resolveWaveformPlaybackMetrics(
			ctx,
			surface,
			state,
			runtimes,
			waveformTimelineContext,
			true,
		);
		if (playbackMetrics.duration <= 0) {
			return;
		}

		applyWaveformPlaybackFollowScroll(
			ctx,
			surface,
			resolveTimelinePlaybackFollowScrollLeft(
				surface,
				playbackMetrics.position / playbackMetrics.duration,
			),
			animate,
		);
	});
}
