import {
	axisBottom,
	axisLeft,
	axisRight,
	line,
	type Selection,
	scaleLinear,
	scaleLog,
	select,
} from "d3";
import { applyCssOverrides } from "../shared/dom";
import { clamp, sanitizeDuration } from "../shared/math";
import type { TrackSwitchWarpingMatrixViewConfig } from "../types";
import type {
	ViewRenderer,
	WarpingMatrixDataPoint,
	WarpingMatrixHostMetadata,
	WarpingMatrixMatrixData,
	WarpingMatrixPathPoint,
	WarpingMatrixPathSeriesData,
	WarpingMatrixPlotState,
	WarpingMatrixRenderContext,
	WarpingMatrixTempoData,
	WarpingMatrixTempoPoint,
	WarpingMatrixTempoSeriesData,
	WarpingMatrixTrackSeries,
	WarpingPlotMargins,
	WarpingTempoPlotState,
} from "./renderer";

type PathSelection = Selection<SVGPathElement, unknown, null, undefined>;

const WARPING_MATRIX_PRIMARY_COLOR = "#ED8C01";
const DEFAULT_WARPING_MATRIX_PATH_STROKE_WIDTH = 3;
const WARPING_MATRIX_STACKED_LAYOUT_MAX_WIDTH = 500;
const DEFAULT_WARPING_MATRIX_LOCAL_TEMPO_WINDOW_SECONDS = 60;
const DEFAULT_WARPING_MATRIX_LOCAL_TEMPO_SMOOTHING_SECONDS = 5;
const WARPING_MATRIX_TEMPO_SMOOTHING_MIN_SECONDS = 1;
const WARPING_MATRIX_TEMPO_SMOOTHING_MAX_SECONDS = 30;
const WARPING_MATRIX_TEMPO_SMOOTHING_STEP_SECONDS = 0.5;
const WARPING_MATRIX_TEMPO_WINDOW_MIN_SECONDS = 10;
const WARPING_MATRIX_TEMPO_WINDOW_MAX_SECONDS = 180;
const WARPING_MATRIX_TEMPO_WINDOW_STEP_SECONDS = 0.5;
const WARPING_MATRIX_TEMPO_LOG_MIN_PERCENT = 20;
const WARPING_MATRIX_TEMPO_LOG_MAX_PERCENT = 500;
const WARPING_MATRIX_MONOTONICITY_WARNING =
	"Warping path cannot be made strictly monotonous";
const WARPING_MATRIX_TEMPO_AXIS_TICKS = [20, 50, 100, 200, 500];

function createWarpingTempoInlineText(className: string): HTMLSpanElement {
	const span = document.createElement("span");
	span.className = `${className} warping-tempo-text-node`;
	span.setAttribute("aria-hidden", "true");
	return span;
}

function resolveWarpingMatrixTrackDuration(
	trackDuration: number,
	fallbackDuration: number,
): number {
	const normalizedTrackDuration = sanitizeDuration(trackDuration);
	if (normalizedTrackDuration > 0) {
		return normalizedTrackDuration;
	}

	const normalizedFallbackDuration = sanitizeDuration(fallbackDuration);
	if (normalizedFallbackDuration > 0) {
		return normalizedFallbackDuration;
	}

	return 0.001;
}

function resolveWarpingMatrixSeriesMaxTrackTime(
	points: WarpingMatrixDataPoint[],
	fallbackDuration: number,
): number {
	let maxTrackTime = Number.NEGATIVE_INFINITY;
	points.forEach((point) => {
		if (Number.isFinite(point.trackTime) && point.trackTime > maxTrackTime) {
			maxTrackTime = point.trackTime;
		}
	});

	if (Number.isFinite(maxTrackTime) && maxTrackTime > 0) {
		return maxTrackTime;
	}

	return resolveWarpingMatrixTrackDuration(0, fallbackDuration);
}

function parseRoundedPositiveIntegerAttribute(
	value: string | null,
): number | null {
	if (value === null) {
		return null;
	}

	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 1) {
		return null;
	}

	return Math.max(1, Math.round(parsed));
}

function parsePositiveNumberAttribute(value: string | null): number | null {
	if (value === null) {
		return null;
	}

	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return null;
	}

	return parsed;
}

function normalizeTempoWindowSeconds(value: number): number {
	if (!Number.isFinite(value)) {
		return DEFAULT_WARPING_MATRIX_LOCAL_TEMPO_WINDOW_SECONDS;
	}

	return clamp(
		Math.round(value / WARPING_MATRIX_TEMPO_WINDOW_STEP_SECONDS) *
			WARPING_MATRIX_TEMPO_WINDOW_STEP_SECONDS,
		WARPING_MATRIX_TEMPO_WINDOW_MIN_SECONDS,
		WARPING_MATRIX_TEMPO_WINDOW_MAX_SECONDS,
	);
}

function normalizeTempoSmoothingSeconds(value: number): number {
	if (!Number.isFinite(value)) {
		return DEFAULT_WARPING_MATRIX_LOCAL_TEMPO_SMOOTHING_SECONDS;
	}

	return clamp(
		Math.round(value / WARPING_MATRIX_TEMPO_SMOOTHING_STEP_SECONDS) *
			WARPING_MATRIX_TEMPO_SMOOTHING_STEP_SECONDS,
		WARPING_MATRIX_TEMPO_SMOOTHING_MIN_SECONDS,
		WARPING_MATRIX_TEMPO_SMOOTHING_MAX_SECONDS,
	);
}

function formatTempoAxisBpmLabel(
	percentValue: number,
	scoreBpm: number,
): string {
	if (
		!Number.isFinite(percentValue) ||
		percentValue <= 0 ||
		!Number.isFinite(scoreBpm) ||
		scoreBpm <= 0
	) {
		return "";
	}

	return String(Math.round((percentValue / 100) * scoreBpm));
}

function applyTempoSmoothingSeconds(
	host: WarpingMatrixHostMetadata,
	smoothingSeconds: number,
): void {
	const normalized = normalizeTempoSmoothingSeconds(smoothingSeconds);
	host.tempoSmoothingSeconds = normalized;
	host.tempoSmoothingSlider.value = String(normalized);
}

export function getWarpingMatrixPathStrokeWidth(): number {
	return DEFAULT_WARPING_MATRIX_PATH_STROKE_WIDTH;
}

export function getWarpingMatrixLocalTempoWindowSeconds(
	host: WarpingMatrixHostMetadata,
): number {
	return normalizeTempoWindowSeconds(host.tempoWindowSeconds);
}

export function getWarpingMatrixLocalTempoSmoothingSeconds(
	host: WarpingMatrixHostMetadata,
): number {
	return normalizeTempoSmoothingSeconds(host.tempoSmoothingSeconds);
}

export function updateWarpingMatrixTempoControlLabels(
	ctx: ViewRenderer,
	host: WarpingMatrixHostMetadata,
): void {
	host.tempoWindowValueNode.textContent = `${ctx.getWarpingMatrixLocalTempoWindowSeconds(host).toFixed(1)}s`;
	host.tempoSmoothingValueNode.textContent = `${ctx.getWarpingMatrixLocalTempoSmoothingSeconds(host).toFixed(1)}s`;
}

export function persistWarpingMatrixTempoControls(
	ctx: ViewRenderer,
	host: WarpingMatrixHostMetadata,
): void {
	ctx.warpingMatrixTempoControlState.set(host.host, {
		windowSeconds: ctx.getWarpingMatrixLocalTempoWindowSeconds(host),
		smoothingSeconds: ctx.getWarpingMatrixLocalTempoSmoothingSeconds(host),
	});
}

export function getWarpingMatrixSquarePlotSize(
	plot: WarpingMatrixPlotState,
): number {
	return Math.max(1, Math.min(plot.innerWidth, plot.innerHeight));
}

export function resolveWarpingMatrixColumnColor(
	_columnKey: string,
	_columnOrder: string[],
): string {
	return WARPING_MATRIX_PRIMARY_COLOR;
}

export function wrapWarpingMatrixContainers(ctx: ViewRenderer): void {
	ctx.warpingMatrixHosts.length = 0;

	const hosts = ctx.root.querySelectorAll(".warping-matrix");
	hosts.forEach((hostElement: Element) => {
		if (!(hostElement instanceof HTMLElement)) {
			return;
		}

		let wrapper: HTMLElement | null = hostElement.closest(
			".warping-matrix-wrap",
		) as HTMLElement | null;
		if (!wrapper) {
			wrapper = document.createElement("div");
			wrapper.className = "warping-matrix-wrap ts-stack-section";
			const config = ctx.getConfiguredViewHost(hostElement)
				.view as TrackSwitchWarpingMatrixViewConfig;
			applyCssOverrides(wrapper, config.css);

			const parent = hostElement.parentElement;
			if (!parent) {
				return;
			}

			parent.insertBefore(wrapper, hostElement);
			wrapper.appendChild(hostElement);
		} else {
			wrapper.classList.add("ts-stack-section");
		}

		const configuredHeight = parseRoundedPositiveIntegerAttribute(
			hostElement.getAttribute("data-warping-matrix-height"),
		);
		const configuredTempoSmoothingSeconds = parsePositiveNumberAttribute(
			hostElement.getAttribute("data-warping-matrix-tempo-smoothing-seconds"),
		);
		hostElement.style.removeProperty("height");

		hostElement.classList.add("warping-matrix-host");
		hostElement.textContent = "";

		const syncDisabledOverlay = document.createElement("div");
		syncDisabledOverlay.className = "warping-matrix-sync-overlay";
		syncDisabledOverlay.textContent = "SYNC MODE";
		hostElement.appendChild(syncDisabledOverlay);

		const matrixPanel = document.createElement("div");
		matrixPanel.className = "warping-matrix-panel warping-matrix-panel-main";
		hostElement.appendChild(matrixPanel);

		const matrixPlotHost = document.createElement("div");
		matrixPlotHost.className = "warping-plot-host warping-plot-host-main";
		matrixPanel.appendChild(matrixPlotHost);

		const tempoPanel = document.createElement("div");
		tempoPanel.className = "warping-matrix-panel warping-matrix-panel-tempo";
		hostElement.appendChild(tempoPanel);

		const tempoPlotHost = document.createElement("div");
		tempoPlotHost.className = "warping-plot-host warping-plot-host-tempo";
		tempoPanel.appendChild(tempoPlotHost);

		const tempoControls = document.createElement("div");
		tempoControls.className = "warping-tempo-controls";

		const tempoMessage = document.createElement("div");
		tempoMessage.className = "warping-tempo-message";
		tempoMessage.hidden = true;
		tempoPanel.appendChild(tempoMessage);

		const windowControl = document.createElement("label");
		windowControl.className = "warping-tempo-control";
		const windowLabel = createWarpingTempoInlineText(
			"warping-tempo-control-label",
		);
		windowLabel.textContent = "Window (s)";
		const tempoWindowValueNode = createWarpingTempoInlineText(
			"warping-tempo-value",
		);
		const tempoWindowSlider = document.createElement("input");
		tempoWindowSlider.className = "warping-tempo-slider";
		tempoWindowSlider.type = "range";
		tempoWindowSlider.min = String(WARPING_MATRIX_TEMPO_WINDOW_MIN_SECONDS);
		tempoWindowSlider.max = String(WARPING_MATRIX_TEMPO_WINDOW_MAX_SECONDS);
		tempoWindowSlider.step = String(WARPING_MATRIX_TEMPO_WINDOW_STEP_SECONDS);
		windowControl.appendChild(windowLabel);
		windowControl.appendChild(tempoWindowSlider);
		windowControl.appendChild(tempoWindowValueNode);

		const smoothingControl = document.createElement("label");
		smoothingControl.className = "warping-tempo-control";
		const smoothingLabel = createWarpingTempoInlineText(
			"warping-tempo-control-label",
		);
		smoothingLabel.textContent = "Smoothing (s)";
		const tempoSmoothingValueNode = createWarpingTempoInlineText(
			"warping-tempo-value",
		);
		const tempoSmoothingSlider = document.createElement("input");
		tempoSmoothingSlider.className = "warping-tempo-slider";
		tempoSmoothingSlider.type = "range";
		tempoSmoothingSlider.min = String(
			WARPING_MATRIX_TEMPO_SMOOTHING_MIN_SECONDS,
		);
		tempoSmoothingSlider.max = String(
			WARPING_MATRIX_TEMPO_SMOOTHING_MAX_SECONDS,
		);
		tempoSmoothingSlider.step = String(
			WARPING_MATRIX_TEMPO_SMOOTHING_STEP_SECONDS,
		);
		smoothingControl.appendChild(smoothingLabel);
		smoothingControl.appendChild(tempoSmoothingSlider);
		smoothingControl.appendChild(tempoSmoothingValueNode);

		tempoControls.appendChild(windowControl);
		tempoControls.appendChild(smoothingControl);
		tempoPanel.appendChild(tempoControls);

		const persistedTempoControls =
			ctx.warpingMatrixTempoControlState.get(hostElement);
		const initialTempoWindowSeconds = normalizeTempoWindowSeconds(
			persistedTempoControls
				? persistedTempoControls.windowSeconds
				: DEFAULT_WARPING_MATRIX_LOCAL_TEMPO_WINDOW_SECONDS,
		);
		const initialTempoSmoothingSeconds = normalizeTempoSmoothingSeconds(
			persistedTempoControls
				? persistedTempoControls.smoothingSeconds
				: (configuredTempoSmoothingSeconds ??
						DEFAULT_WARPING_MATRIX_LOCAL_TEMPO_SMOOTHING_SECONDS),
		);
		tempoWindowSlider.value = String(initialTempoWindowSeconds);
		tempoSmoothingSlider.value = String(initialTempoSmoothingSeconds);

		const metadata: WarpingMatrixHostMetadata = {
			wrapper: wrapper,
			host: hostElement,
			visible: true,
			syncDisabledOverlay: syncDisabledOverlay,
			matrixPanel: matrixPanel,
			matrixPlotHost: matrixPlotHost,
			matrixPlot: null,
			tempoPanel: tempoPanel,
			tempoPlotHost: tempoPlotHost,
			tempoPlot: null,
			tempoControls: tempoControls,
			tempoMessage: tempoMessage,
			tempoWindowSlider: tempoWindowSlider,
			tempoWindowValueNode: tempoWindowValueNode,
			tempoSmoothingSlider: tempoSmoothingSlider,
			tempoSmoothingValueNode: tempoSmoothingValueNode,
			matrixSeriesSignature: null,
			matrixDataCache: null,
			matrixDataCacheKey: null,
			tempoDataCache: null,
			tempoDataCacheKey: null,
			matrixDisabled: false,
			tempoCurveValid: true,
			trackSeries: [],
			matrixTrackDuration: 1,
			configuredHeight: configuredHeight,
			authoredHeight: configuredHeight,
			preFullscreenHeight: null,
			tempoWindowSeconds: initialTempoWindowSeconds,
			tempoSmoothingSeconds: initialTempoSmoothingSeconds,
			colorByColumn: new Map<string, string>(),
			activeColumnKey: null,
			referenceDuration: 0,
			currentReferenceTime: 0,
			currentTrackTime: 0,
			currentScoreBpm: null,
			matrixActivePointerId: null,
			lastSizeKey: null,
			layoutDirty: true,
			staticPlotDirty: true,
		};
		ctx.updateWarpingMatrixTempoControlLabels(metadata);
		ctx.persistWarpingMatrixTempoControls(metadata);

		const stopTempoControlPropagation = (event: Event) => {
			event.stopPropagation();
		};
		const tempoControlEvents: Array<keyof HTMLElementEventMap> = [
			"pointerdown",
			"pointermove",
			"pointerup",
			"pointercancel",
			"mousedown",
			"mousemove",
			"mouseup",
			"touchstart",
			"touchmove",
			"touchend",
			"touchcancel",
			"wheel",
		];
		tempoControlEvents.forEach((eventName) => {
			tempoControls.addEventListener(
				eventName,
				stopTempoControlPropagation as EventListener,
				{ passive: false },
			);
		});

		tempoWindowSlider.addEventListener("input", () => {
			metadata.tempoWindowSeconds = normalizeTempoWindowSeconds(
				Number(tempoWindowSlider.value),
			);
			tempoWindowSlider.value = String(metadata.tempoWindowSeconds);
			ctx.updateWarpingMatrixTempoControlLabels(metadata);
			ctx.persistWarpingMatrixTempoControls(metadata);
			ctx.updateWarpingMatrixPlaybackState(metadata, {
				enabled: true,
				syncEnabled: metadata.matrixDisabled,
				referenceDuration: metadata.referenceDuration,
				currentReferenceTime: metadata.currentReferenceTime,
				currentScoreBpm: metadata.currentScoreBpm,
				columnOrder: [],
				trackSeries: metadata.trackSeries,
			});
		});
		tempoSmoothingSlider.addEventListener("input", () => {
			applyTempoSmoothingSeconds(metadata, Number(tempoSmoothingSlider.value));
			ctx.updateWarpingMatrixTempoControlLabels(metadata);
			ctx.persistWarpingMatrixTempoControls(metadata);
			metadata.tempoDataCache = ctx.buildWarpingTempoData(
				metadata.matrixDataCache,
				metadata.tempoSmoothingSeconds,
			);
			metadata.tempoDataCacheKey = null;
			metadata.staticPlotDirty = true;
			ctx.renderWarpingMatrixTempoPlot(metadata);
		});

		matrixPlotHost.addEventListener("pointerdown", (event) => {
			ctx.onWarpingMatrixPointerDown(metadata, event);
		});
		matrixPlotHost.addEventListener("pointermove", (event) => {
			ctx.onWarpingMatrixPointerMove(metadata, event);
		});
		matrixPlotHost.addEventListener("pointerup", (event) => {
			ctx.onWarpingMatrixPointerUp(metadata, event);
		});
		matrixPlotHost.addEventListener("pointercancel", (event) => {
			ctx.onWarpingMatrixPointerUp(metadata, event);
		});
		tempoPlotHost.addEventListener("pointerdown", (event) => {
			ctx.onWarpingTempoPointerDown(metadata, event);
		});
		tempoPlotHost.addEventListener(
			"wheel",
			(event) => {
				ctx.onWarpingTempoWheel(metadata, event);
			},
			{ passive: false },
		);

		ctx.warpingMatrixHosts.push(metadata);
	});
}

export function createWarpingMatrixPlotState(
	ctx: ViewRenderer,
	plotHost: HTMLElement,
	width: number,
	height: number,
): WarpingMatrixPlotState {
	plotHost.textContent = "";

	const margins: WarpingPlotMargins = {
		top: 32,
		right: 10,
		bottom: 40,
		left: 52,
	};
	const innerWidth = Math.max(1, width - margins.left - margins.right);
	const innerHeight = Math.max(1, height - margins.top - margins.bottom);
	const clipId = `warping-matrix-clip-${ctx.warpingClipPathCounter}`;
	ctx.warpingClipPathCounter += 1;

	const svg = select(plotHost)
		.append("svg")
		.attr("class", "warping-plot-svg")
		.attr("width", width)
		.attr("height", height);

	const defs = svg.append("defs");
	const clipRect = defs.append("clipPath").attr("id", clipId).append("rect");

	const title = svg
		.append("text")
		.attr("class", "warping-plot-title")
		.attr("text-anchor", "middle")
		.text("Warping Path");

	const xAxis = svg
		.append("g")
		.attr("class", "warping-plot-axis warping-plot-axis-x");
	const yAxis = svg
		.append("g")
		.attr("class", "warping-plot-axis warping-plot-axis-y");

	const xLabel = svg
		.append("text")
		.attr("class", "warping-plot-axis-label")
		.attr("text-anchor", "middle")
		.text("Reference time (s)");
	const yLabel = svg
		.append("text")
		.attr("class", "warping-plot-axis-label")
		.attr("text-anchor", "middle")
		.text("Track time (s)");

	const plotRoot = svg
		.append("g")
		.attr("transform", `translate(${margins.left},${margins.top})`)
		.attr("clip-path", `url(#${clipId})`);
	const pathLayer = plotRoot.append("g");

	const guideDiagonal = plotRoot
		.append("line")
		.attr("class", "warping-guide-line");
	const playhead = plotRoot
		.append("circle")
		.attr("class", "warping-playhead-dot")
		.attr("r", 4);

	const state: WarpingMatrixPlotState = {
		svg: svg,
		title: title,
		xAxis: xAxis,
		yAxis: yAxis,
		xLabel: xLabel,
		yLabel: yLabel,
		plotRoot: plotRoot,
		pathLayer: pathLayer,
		clipRect: clipRect,
		pathByColumn: new Map<string, PathSelection>(),
		guideDiagonal: guideDiagonal,
		playhead: playhead,
		xScale: scaleLinear(),
		yScale: scaleLinear(),
		margins: margins,
		innerWidth: innerWidth,
		innerHeight: innerHeight,
	};

	ctx.applyWarpingMatrixPlotDimensions(state, width, height);
	return state;
}

export function createWarpingTempoPlotState(
	ctx: ViewRenderer,
	plotHost: HTMLElement,
	width: number,
	height: number,
): WarpingTempoPlotState {
	plotHost.textContent = "";

	const margins: WarpingPlotMargins = {
		top: 32,
		right: 52,
		bottom: 40,
		left: 52,
	};
	const innerWidth = Math.max(1, width - margins.left - margins.right);
	const innerHeight = Math.max(1, height - margins.top - margins.bottom);
	const clipId = `warping-tempo-clip-${ctx.warpingClipPathCounter}`;
	ctx.warpingClipPathCounter += 1;

	const svg = select(plotHost)
		.append("svg")
		.attr("class", "warping-plot-svg")
		.attr("width", width)
		.attr("height", height);

	const defs = svg.append("defs");
	const clipRect = defs.append("clipPath").attr("id", clipId).append("rect");

	const title = svg
		.append("text")
		.attr("class", "warping-plot-title")
		.attr("text-anchor", "middle")
		.text("Tempo Deviation");

	const xAxis = svg
		.append("g")
		.attr("class", "warping-plot-axis warping-plot-axis-x");
	const yAxis = svg
		.append("g")
		.attr("class", "warping-plot-axis warping-plot-axis-y");
	const yAxisRight = svg
		.append("g")
		.attr("class", "warping-plot-axis warping-plot-axis-y-right");

	const xLabel = svg
		.append("text")
		.attr("class", "warping-plot-axis-label")
		.attr("text-anchor", "middle")
		.text("Track time (s)");
	const yLabel = svg
		.append("text")
		.attr("class", "warping-plot-axis-label")
		.attr("text-anchor", "middle")
		.text("Tempo (%)");
	const yLabelRight = svg
		.append("text")
		.attr("class", "warping-plot-axis-label")
		.attr("text-anchor", "middle")
		.text("Tempo (%)");

	const plotRoot = svg
		.append("g")
		.attr("transform", `translate(${margins.left},${margins.top})`)
		.attr("clip-path", `url(#${clipId})`);

	const baseline = plotRoot
		.append("line")
		.attr("class", "warping-tempo-reference-line");
	const path = plotRoot.append("path").attr("class", "warping-tempo-line");
	const centerLine = plotRoot
		.append("line")
		.attr("class", "warping-tempo-center-line");

	const state: WarpingTempoPlotState = {
		svg: svg,
		title: title,
		xAxis: xAxis,
		yAxis: yAxis,
		yAxisRight: yAxisRight,
		xLabel: xLabel,
		yLabel: yLabel,
		yLabelRight: yLabelRight,
		plotRoot: plotRoot,
		clipRect: clipRect,
		path: path,
		baseline: baseline,
		centerLine: centerLine,
		xScale: scaleLinear(),
		yScale: scaleLog(),
		margins: margins,
		innerWidth: innerWidth,
		innerHeight: innerHeight,
	};

	ctx.applyWarpingTempoPlotDimensions(state, width, height);
	return state;
}

export function applyWarpingMatrixPlotDimensions(
	plot: WarpingMatrixPlotState,
	width: number,
	height: number,
): void {
	plot.innerWidth = Math.max(1, width - plot.margins.left - plot.margins.right);
	plot.innerHeight = Math.max(
		1,
		height - plot.margins.top - plot.margins.bottom,
	);

	plot.svg
		.attr("width", width)
		.attr("height", height)
		.attr("viewBox", `0 0 ${width} ${height}`);
	plot.clipRect.attr("width", plot.innerWidth).attr("height", plot.innerHeight);
	plot.plotRoot.attr(
		"transform",
		`translate(${plot.margins.left},${plot.margins.top})`,
	);
	plot.title.attr("x", width / 2).attr("y", 20);
	plot.xAxis.attr(
		"transform",
		"translate(" +
			plot.margins.left +
			"," +
			(plot.margins.top + plot.innerHeight) +
			")",
	);
	plot.yAxis.attr(
		"transform",
		`translate(${plot.margins.left},${plot.margins.top})`,
	);
	plot.xLabel
		.attr("x", plot.margins.left + plot.innerWidth / 2)
		.attr("y", height - 8);
	plot.yLabel
		.attr("x", 0)
		.attr("y", 0)
		.attr(
			"transform",
			"translate(14," +
				(plot.margins.top + plot.innerHeight / 2) +
				") rotate(-90)",
		);
}

export function applyWarpingTempoPlotDimensions(
	plot: WarpingTempoPlotState,
	width: number,
	height: number,
): void {
	plot.innerWidth = Math.max(1, width - plot.margins.left - plot.margins.right);
	plot.innerHeight = Math.max(
		1,
		height - plot.margins.top - plot.margins.bottom,
	);

	plot.svg
		.attr("width", width)
		.attr("height", height)
		.attr("viewBox", `0 0 ${width} ${height}`);
	plot.clipRect.attr("width", plot.innerWidth).attr("height", plot.innerHeight);
	plot.plotRoot.attr(
		"transform",
		`translate(${plot.margins.left},${plot.margins.top})`,
	);
	plot.title.attr("x", width / 2).attr("y", 20);
	plot.xAxis.attr(
		"transform",
		"translate(" +
			plot.margins.left +
			"," +
			(plot.margins.top + plot.innerHeight) +
			")",
	);
	plot.yAxis.attr(
		"transform",
		`translate(${plot.margins.left},${plot.margins.top})`,
	);
	plot.yAxisRight.attr(
		"transform",
		"translate(" +
			(plot.margins.left + plot.innerWidth) +
			"," +
			plot.margins.top +
			")",
	);
	plot.xLabel
		.attr("x", plot.margins.left + plot.innerWidth / 2)
		.attr("y", height - 8);
	plot.yLabel
		.attr("x", 0)
		.attr("y", 0)
		.attr(
			"transform",
			"translate(14," +
				(plot.margins.top + plot.innerHeight / 2) +
				") rotate(-90)",
		);
	plot.yLabelRight
		.attr("x", 0)
		.attr("y", 0)
		.attr(
			"transform",
			"translate(" +
				(width - 14) +
				"," +
				(plot.margins.top + plot.innerHeight / 2) +
				") rotate(90)",
		);
}

export function isPointerInsidePlotArea(
	plotHost: HTMLElement,
	margins: WarpingPlotMargins,
	innerWidth: number,
	innerHeight: number,
	clientX: number,
	clientY: number,
): boolean {
	const rect = plotHost.getBoundingClientRect();
	const pointerX = clientX - rect.left - margins.left;
	const pointerY = clientY - rect.top - margins.top;
	return (
		pointerX >= 0 &&
		pointerX <= innerWidth &&
		pointerY >= 0 &&
		pointerY <= innerHeight
	);
}

export function onWarpingMatrixPointerDown(
	ctx: ViewRenderer,
	host: WarpingMatrixHostMetadata,
	event: PointerEvent,
): void {
	if (
		!ctx.onWarpingMatrixSeek ||
		!host.matrixPlot ||
		host.matrixDisabled ||
		event.button !== 0
	) {
		return;
	}

	const squareSize = ctx.getWarpingMatrixSquarePlotSize(host.matrixPlot);
	if (
		!ctx.isPointerInsidePlotArea(
			host.matrixPlotHost,
			host.matrixPlot.margins,
			squareSize,
			squareSize,
			event.clientX,
			event.clientY,
		)
	) {
		return;
	}

	host.matrixActivePointerId = event.pointerId;
	host.matrixPlotHost.setPointerCapture(event.pointerId);
	ctx.seekWarpingMatrixFromPointerX(host, event.clientX);
	event.preventDefault();
}

export function onWarpingMatrixPointerMove(
	ctx: ViewRenderer,
	host: WarpingMatrixHostMetadata,
	event: PointerEvent,
): void {
	if (!ctx.onWarpingMatrixSeek || !host.matrixPlot) {
		return;
	}

	if (
		host.matrixActivePointerId === null ||
		host.matrixActivePointerId !== event.pointerId
	) {
		return;
	}

	ctx.seekWarpingMatrixFromPointerX(host, event.clientX);
	event.preventDefault();
}

export function onWarpingMatrixPointerUp(
	ctx: ViewRenderer,
	host: WarpingMatrixHostMetadata,
	event: PointerEvent,
): void {
	if (!host.matrixPlot) {
		return;
	}

	if (
		host.matrixActivePointerId === null ||
		host.matrixActivePointerId !== event.pointerId
	) {
		return;
	}

	ctx.seekWarpingMatrixFromPointerX(host, event.clientX);
	host.matrixActivePointerId = null;
	if (host.matrixPlotHost.hasPointerCapture(event.pointerId)) {
		host.matrixPlotHost.releasePointerCapture(event.pointerId);
	}
	event.preventDefault();
}

export function seekWarpingMatrixFromPointerX(
	ctx: ViewRenderer,
	host: WarpingMatrixHostMetadata,
	clientX: number,
): void {
	if (!ctx.onWarpingMatrixSeek || !host.matrixPlot) {
		return;
	}

	const squareSize = ctx.getWarpingMatrixSquarePlotSize(host.matrixPlot);
	const rect = host.matrixPlotHost.getBoundingClientRect();
	const pointerX = clamp(
		clientX - rect.left - host.matrixPlot.margins.left,
		0,
		squareSize,
	);
	const referenceTime = host.matrixPlot.xScale.invert(pointerX);
	ctx.onWarpingMatrixSeek(
		clamp(referenceTime, 0, Math.max(0.001, host.referenceDuration)),
	);
}

export function onWarpingTempoPointerDown(
	ctx: ViewRenderer,
	host: WarpingMatrixHostMetadata,
	event: PointerEvent,
): void {
	if (
		!ctx.onWarpingMatrixSeek ||
		!host.tempoPlot ||
		host.matrixDisabled ||
		event.button !== 0
	) {
		return;
	}

	if (
		!ctx.isPointerInsidePlotArea(
			host.tempoPlotHost,
			host.tempoPlot.margins,
			host.tempoPlot.innerWidth,
			host.tempoPlot.innerHeight,
			event.clientX,
			event.clientY,
		)
	) {
		return;
	}

	ctx.seekWarpingMatrixFromTempoPointerX(host, event.clientX);
	event.preventDefault();
}

export function onWarpingTempoWheel(
	ctx: ViewRenderer,
	host: WarpingMatrixHostMetadata,
	event: WheelEvent,
): void {
	if (host.matrixDisabled) {
		return;
	}

	if (!Number.isFinite(event.deltaY) || event.deltaY === 0) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();

	const currentWindow = ctx.getWarpingMatrixLocalTempoWindowSeconds(host);
	const zoomFactor = Math.exp(event.deltaY * 0.002);
	const nextWindow = normalizeTempoWindowSeconds(currentWindow * zoomFactor);
	if (Math.abs(nextWindow - currentWindow) < 0.0001) {
		return;
	}

	host.tempoWindowSeconds = nextWindow;
	host.tempoWindowSlider.value = String(nextWindow);
	ctx.updateWarpingMatrixTempoControlLabels(host);
	ctx.persistWarpingMatrixTempoControls(host);
	ctx.renderWarpingMatrixTempoPlot(host);
}

export function seekWarpingMatrixFromTempoPointerX(
	ctx: ViewRenderer,
	host: WarpingMatrixHostMetadata,
	clientX: number,
): void {
	if (!ctx.onWarpingMatrixSeek || !host.tempoPlot) {
		return;
	}

	const primarySeries = ctx.getPrimaryWarpingSeriesData(host);
	if (!primarySeries || primarySeries.pointsByTrackTime.length === 0) {
		return;
	}

	const rect = host.tempoPlotHost.getBoundingClientRect();
	const pointerX = clamp(
		clientX - rect.left - host.tempoPlot.margins.left,
		0,
		host.tempoPlot.innerWidth,
	);
	const trackTime = host.tempoPlot.xScale.invert(pointerX);
	const referenceTime = ctx.interpolateWarpingReferenceTime(
		primarySeries.pointsByTrackTime,
		trackTime,
	);
	ctx.onWarpingMatrixSeek(
		clamp(referenceTime, 0, Math.max(0.001, host.referenceDuration)),
	);
}

export function getPrimaryWarpingSeriesData(
	host: WarpingMatrixHostMetadata,
): WarpingMatrixPathSeriesData | null {
	if (!host.matrixDataCache || !host.activeColumnKey) {
		return null;
	}

	return host.matrixDataCache.byColumn.get(host.activeColumnKey) || null;
}

export function getPrimaryTempoSeries(
	host: WarpingMatrixHostMetadata,
): WarpingMatrixTempoPoint[] {
	if (!host.tempoDataCache || !host.activeColumnKey) {
		return [];
	}

	const seriesData = host.tempoDataCache.byColumn.get(host.activeColumnKey);
	return seriesData ? seriesData.points : [];
}

export function getPrimaryTempoSeriesData(
	host: WarpingMatrixHostMetadata,
): WarpingMatrixTempoSeriesData | null {
	if (!host.tempoDataCache || !host.activeColumnKey) {
		return null;
	}

	return host.tempoDataCache.byColumn.get(host.activeColumnKey) || null;
}

export function ensureWarpingLayout(
	ctx: ViewRenderer,
	host: WarpingMatrixHostMetadata,
): void {
	const renderedHeight =
		host.configuredHeight ??
		Math.max(180, host.matrixPanel.clientHeight || 220);
	const fallbackHostWidth = Math.max(
		460,
		Math.round(host.host.clientWidth || host.wrapper.clientWidth || 720),
	);
	const computedHostStyle = window.getComputedStyle(host.host);
	const resolvedGap = Number.parseFloat(
		computedHostStyle.columnGap || computedHostStyle.gap || "12",
	);
	const panelGap = Number.isFinite(resolvedGap) ? Math.max(0, resolvedGap) : 12;
	const isStackedLayout =
		fallbackHostWidth <= WARPING_MATRIX_STACKED_LAYOUT_MAX_WIDTH;
	host.host.classList.toggle("warping-matrix-host-stacked", isStackedLayout);

	let matrixRenderedWidth = 0;
	let tempoRenderedWidth = 0;
	if (isStackedLayout) {
		host.matrixPanel.style.flex = "1 1 auto";
		host.matrixPanel.style.width = "100%";
		host.tempoPanel.style.flex = "1 1 auto";
		host.tempoPanel.style.width = "100%";
		matrixRenderedWidth = Math.max(
			220,
			Math.round(host.matrixPanel.clientWidth || fallbackHostWidth),
		);
		tempoRenderedWidth = Math.max(
			220,
			Math.round(host.tempoPanel.clientWidth || fallbackHostWidth),
		);
	} else {
		const minMatrixWidth = 190;
		const desiredMatrixWidth = Math.max(
			minMatrixWidth,
			Math.round(renderedHeight - 4),
		);
		const maxMatrixWidth = Math.max(
			minMatrixWidth,
			Math.round((fallbackHostWidth - panelGap) * 0.6),
		);
		const minTempoWidth = 220;
		const matrixWidthByRemainingSpace = Math.max(
			minMatrixWidth,
			Math.round(fallbackHostWidth - panelGap - minTempoWidth),
		);
		matrixRenderedWidth = Math.min(
			desiredMatrixWidth,
			maxMatrixWidth,
			matrixWidthByRemainingSpace,
		);

		host.matrixPanel.style.flex = `0 0 ${matrixRenderedWidth}px`;
		host.matrixPanel.style.width = `${matrixRenderedWidth}px`;
		const fallbackTempoWidth = Math.max(
			220,
			Math.round(fallbackHostWidth - panelGap - matrixRenderedWidth),
		);
		host.tempoPanel.style.flex = `1 1 ${fallbackTempoWidth}px`;
		host.tempoPanel.style.width = `${fallbackTempoWidth}px`;
		tempoRenderedWidth = Math.max(
			220,
			Math.round(host.tempoPanel.clientWidth || fallbackTempoWidth),
		);
	}
	host.matrixPanel.style.height = `${renderedHeight}px`;
	host.tempoPanel.style.height = `${renderedHeight}px`;

	const measuredMatrixPlotWidth = Math.max(
		1,
		Math.round(host.matrixPlotHost.clientWidth || matrixRenderedWidth),
	);
	const measuredMatrixPlotHeight = Math.max(
		1,
		Math.round(host.matrixPlotHost.clientHeight || renderedHeight),
	);
	const measuredTempoPlotWidth = Math.max(
		1,
		Math.round(host.tempoPlotHost.clientWidth || tempoRenderedWidth),
	);
	const measuredTempoPlotHeight = Math.max(
		1,
		Math.round(host.tempoPlotHost.clientHeight || renderedHeight),
	);
	const sizeKey = [
		measuredMatrixPlotWidth,
		measuredMatrixPlotHeight,
		measuredTempoPlotWidth,
		measuredTempoPlotHeight,
	].join(":");
	const sizeChanged = host.lastSizeKey !== sizeKey;
	host.lastSizeKey = sizeKey;

	if (!host.matrixPlot) {
		host.matrixPlot = ctx.createWarpingMatrixPlotState(
			host.matrixPlotHost,
			measuredMatrixPlotWidth,
			measuredMatrixPlotHeight,
		);
		host.staticPlotDirty = true;
	} else if (sizeChanged) {
		ctx.applyWarpingMatrixPlotDimensions(
			host.matrixPlot,
			measuredMatrixPlotWidth,
			measuredMatrixPlotHeight,
		);
		host.staticPlotDirty = true;
	}

	if (!host.tempoPlot) {
		host.tempoPlot = ctx.createWarpingTempoPlotState(
			host.tempoPlotHost,
			measuredTempoPlotWidth,
			measuredTempoPlotHeight,
		);
		host.staticPlotDirty = true;
	} else if (sizeChanged) {
		ctx.applyWarpingTempoPlotDimensions(
			host.tempoPlot,
			measuredTempoPlotWidth,
			measuredTempoPlotHeight,
		);
		host.staticPlotDirty = true;
	}

	host.layoutDirty = false;
}

export function applyWarpingMatrixContext(
	ctx: ViewRenderer,
	host: WarpingMatrixHostMetadata,
	context: WarpingMatrixRenderContext,
): void {
	const referenceDuration = Math.max(
		0.001,
		sanitizeDuration(context.referenceDuration),
	);
	const previousDisabledState = host.matrixDisabled;
	const previousColumnKey = host.activeColumnKey;

	host.referenceDuration = referenceDuration;
	host.currentReferenceTime = clamp(
		context.currentReferenceTime,
		0,
		referenceDuration,
	);
	host.currentScoreBpm =
		context.currentScoreBpm !== null &&
		Number.isFinite(context.currentScoreBpm) &&
		context.currentScoreBpm > 0
			? context.currentScoreBpm
			: null;
	host.matrixDisabled = context.syncEnabled;
	host.host.classList.toggle(
		"warping-matrix-sync-disabled",
		host.matrixDisabled,
	);
	host.syncDisabledOverlay.style.display = host.matrixDisabled
		? "flex"
		: "none";
	host.tempoWindowSeconds = normalizeTempoWindowSeconds(
		Number(host.tempoWindowSlider.value),
	);
	host.tempoSmoothingSeconds = normalizeTempoSmoothingSeconds(
		Number(host.tempoSmoothingSlider.value),
	);
	if (host.tempoWindowSlider.value !== String(host.tempoWindowSeconds)) {
		host.tempoWindowSlider.value = String(host.tempoWindowSeconds);
	}
	if (host.tempoSmoothingSlider.value !== String(host.tempoSmoothingSeconds)) {
		host.tempoSmoothingSlider.value = String(host.tempoSmoothingSeconds);
	}
	host.tempoWindowSlider.disabled = host.matrixDisabled;
	host.tempoSmoothingSlider.disabled = host.matrixDisabled;
	ctx.updateWarpingMatrixTempoControlLabels(host);
	ctx.persistWarpingMatrixTempoControls(host);

	host.colorByColumn.clear();
	const effectiveTrackSeries = host.matrixDisabled ? [] : context.trackSeries;
	host.trackSeries = effectiveTrackSeries;
	const normalizedColumnOrder =
		effectiveTrackSeries.length > 0 && context.columnOrder.length > 0
			? context.columnOrder
			: effectiveTrackSeries.map(
					(series: WarpingMatrixTrackSeries) => series.columnKey,
				);
	normalizedColumnOrder.forEach((columnKey: string) => {
		host.colorByColumn.set(
			columnKey,
			ctx.resolveWarpingMatrixColumnColor(columnKey, normalizedColumnOrder),
		);
	});
	effectiveTrackSeries.forEach((series: WarpingMatrixTrackSeries) => {
		if (host.colorByColumn.has(series.columnKey)) {
			return;
		}

		host.colorByColumn.set(
			series.columnKey,
			ctx.resolveWarpingMatrixColumnColor(
				series.columnKey,
				normalizedColumnOrder,
			),
		);
	});

	const matrixPrimarySeries =
		effectiveTrackSeries.length > 0 ? effectiveTrackSeries[0] : null;
	host.activeColumnKey = matrixPrimarySeries
		? matrixPrimarySeries.columnKey
		: null;
	host.matrixTrackDuration = matrixPrimarySeries
		? Math.max(
				resolveWarpingMatrixTrackDuration(
					matrixPrimarySeries.trackDuration,
					referenceDuration,
				),
				resolveWarpingMatrixSeriesMaxTrackTime(
					matrixPrimarySeries.points,
					referenceDuration,
				),
			)
		: Math.max(1, referenceDuration);

	const matrixSeriesSignature = effectiveTrackSeries
		.map((series: WarpingMatrixTrackSeries) => {
			return [
				series.columnKey,
				host.colorByColumn.get(series.columnKey) ||
					WARPING_MATRIX_PRIMARY_COLOR,
				series.trackIndex,
			].join(":");
		})
		.join("|");

	const matrixDataCacheKey =
		effectiveTrackSeries
			.map((series: WarpingMatrixTrackSeries) => {
				const lastPoint =
					series.points.length > 0
						? series.points[series.points.length - 1]
						: null;
				const seriesTrackDuration = resolveWarpingMatrixTrackDuration(
					series.trackDuration,
					referenceDuration,
				);
				return [
					series.trackIndex,
					series.points.length,
					lastPoint ? Math.round(lastPoint.referenceTime * 1000) : 0,
					lastPoint ? Math.round(lastPoint.trackTime * 1000) : 0,
					Math.round(seriesTrackDuration * 1000),
				].join(":");
			})
			.join("|") +
		"#" +
		Math.round(referenceDuration * 1000);

	if (host.matrixDataCacheKey !== matrixDataCacheKey) {
		host.matrixDataCache = ctx.buildWarpingMatrixData(
			effectiveTrackSeries,
			referenceDuration,
		);
		host.matrixDataCacheKey = matrixDataCacheKey;
		host.staticPlotDirty = true;
	}

	const localTempoSmoothingSeconds =
		ctx.getWarpingMatrixLocalTempoSmoothingSeconds(host);
	const tempoDataCacheKey = `${matrixDataCacheKey}#s${Math.round(localTempoSmoothingSeconds * 1000)}`;
	if (host.tempoDataCacheKey !== tempoDataCacheKey) {
		host.tempoDataCache = ctx.buildWarpingTempoData(
			host.matrixDataCache,
			localTempoSmoothingSeconds,
		);
		host.tempoDataCacheKey = tempoDataCacheKey;
		host.staticPlotDirty = true;
	}

	if (
		previousDisabledState !== host.matrixDisabled ||
		previousColumnKey !== host.activeColumnKey ||
		host.matrixSeriesSignature !== matrixSeriesSignature
	) {
		host.staticPlotDirty = true;
	}

	host.matrixSeriesSignature = matrixSeriesSignature;
}

export function updateWarpingMatrix(
	ctx: ViewRenderer,
	host: WarpingMatrixHostMetadata,
	context: WarpingMatrixRenderContext | undefined,
): void {
	if (!host.visible || !context?.enabled) {
		host.wrapper.style.display = "none";
		return;
	}

	host.wrapper.classList.remove("warping-matrix-preview");
	host.wrapper.style.display = "block";
	ctx.ensureWarpingLayout(host);
	ctx.applyWarpingMatrixContext(host, context);

	if (host.staticPlotDirty) {
		ctx.renderWarpingMatrixPathPlot(
			host,
			ctx.getWarpingMatrixPathStrokeWidth(),
		);
		host.staticPlotDirty = false;
	}

	ctx.updateWarpingMatrixPlaybackState(host, context);
}

export function drawDummyWarpingMatrices(ctx: ViewRenderer): void {
	const previewContext: WarpingMatrixRenderContext = {
		enabled: true,
		syncEnabled: false,
		referenceDuration: 100,
		currentReferenceTime: 0,
		currentScoreBpm: null,
		columnOrder: ["preview"],
		trackSeries: [
			{
				trackIndex: -1,
				columnKey: "preview",
				trackDuration: 100,
				points: [
					{ referenceTime: 0, trackTime: 0 },
					{ referenceTime: 18, trackTime: 15 },
					{ referenceTime: 40, trackTime: 44 },
					{ referenceTime: 64, trackTime: 58 },
					{ referenceTime: 82, trackTime: 87 },
					{ referenceTime: 100, trackTime: 100 },
				],
			},
		],
	};

	ctx.warpingMatrixHosts.forEach((host: WarpingMatrixHostMetadata) => {
		ctx.updateWarpingMatrix(host, previewContext);
		host.wrapper.classList.add("warping-matrix-preview");
	});
}

export function renderWarpingMatrixPathPlot(
	ctx: ViewRenderer,
	host: WarpingMatrixHostMetadata,
	pathStrokeWidth: number,
): void {
	if (!host.matrixPlot) {
		return;
	}

	const plot = host.matrixPlot;
	const referenceDuration = Math.max(0.001, host.referenceDuration);
	const trackDuration = Math.max(0.001, host.matrixTrackDuration);
	const squareSize = ctx.getWarpingMatrixSquarePlotSize(plot);

	plot.xScale.domain([0, referenceDuration]).range([0, squareSize]);
	plot.yScale.domain([0, trackDuration]).range([squareSize, 0]);

	plot.clipRect.attr("width", squareSize).attr("height", squareSize);
	plot.xAxis.attr(
		"transform",
		"translate(" +
			plot.margins.left +
			"," +
			(plot.margins.top + squareSize) +
			")",
	);
	plot.yAxis.attr(
		"transform",
		`translate(${plot.margins.left},${plot.margins.top})`,
	);
	plot.xLabel.attr("x", plot.margins.left + squareSize / 2);
	plot.yLabel.attr(
		"transform",
		`translate(14,${plot.margins.top + squareSize / 2}) rotate(-90)`,
	);

	const xTickCount = Math.max(2, Math.round(squareSize / 90));
	const yTickCount = Math.max(2, Math.round(squareSize / 60));
	plot.xAxis.call(axisBottom(plot.xScale).ticks(xTickCount));
	plot.yAxis.call(axisLeft(plot.yScale).ticks(yTickCount));

	const matrixLine = line<WarpingMatrixPathPoint>()
		.defined((point) => {
			return (
				Number.isFinite(point.referenceTime) && Number.isFinite(point.trackTime)
			);
		})
		.x((point) => plot.xScale(point.referenceTime))
		.y((point) => plot.yScale(point.trackTime));

	const availableColumns = new Set<string>();
	if (host.matrixDataCache) {
		host.matrixDataCache.byColumn.forEach(
			(seriesData: WarpingMatrixPathSeriesData, columnKey: string) => {
				availableColumns.add(columnKey);
				let path = plot.pathByColumn.get(columnKey);
				if (!path) {
					path = plot.pathLayer
						.append("path")
						.attr("class", "warping-path-line");
					plot.pathByColumn.set(columnKey, path);
				}

				path
					.attr(
						"stroke",
						host.colorByColumn.get(columnKey) || WARPING_MATRIX_PRIMARY_COLOR,
					)
					.attr("stroke-width", pathStrokeWidth)
					.attr("d", matrixLine(seriesData.pointsByReferenceTime) || null);
			},
		);
	}

	const existingColumns = Array.from(plot.pathByColumn.keys()) as string[];
	existingColumns.forEach((columnKey: string) => {
		if (availableColumns.has(columnKey)) {
			return;
		}

		const stalePath = plot.pathByColumn.get(columnKey);
		stalePath?.remove();
		plot.pathByColumn.delete(columnKey);
	});

	const xDomain = plot.xScale.domain();
	const yDomain = plot.yScale.domain();
	const xMin = Math.min(xDomain[0], xDomain[1]);
	const xMax = Math.max(xDomain[0], xDomain[1]);
	const yMin = Math.min(yDomain[0], yDomain[1]);
	const yMax = Math.max(yDomain[0], yDomain[1]);
	const diagonalStart = Math.max(xMin, yMin);
	const diagonalEnd = Math.min(xMax, yMax);
	if (diagonalEnd <= diagonalStart) {
		plot.guideDiagonal.style("display", "none");
	} else {
		plot.guideDiagonal
			.style("display", null)
			.attr("x1", plot.xScale(diagonalStart))
			.attr("y1", plot.yScale(diagonalStart))
			.attr("x2", plot.xScale(diagonalEnd))
			.attr("y2", plot.yScale(diagonalEnd));
	}

	ctx.renderWarpingMatrixPlayhead(host);
}

export function renderWarpingMatrixPlayhead(
	ctx: ViewRenderer,
	host: WarpingMatrixHostMetadata,
): void {
	if (!host.matrixPlot) {
		return;
	}

	const plot = host.matrixPlot;
	const primarySeriesData = ctx.getPrimaryWarpingSeriesData(host);
	if (
		!primarySeriesData ||
		primarySeriesData.pointsByReferenceTime.length === 0
	) {
		plot.playhead.style("display", "none");
		return;
	}

	const playheadReferenceTime = clamp(
		host.currentReferenceTime,
		0,
		Math.max(0.001, host.referenceDuration),
	);
	const playheadColor = host.activeColumnKey
		? host.colorByColumn.get(host.activeColumnKey) ||
			WARPING_MATRIX_PRIMARY_COLOR
		: WARPING_MATRIX_PRIMARY_COLOR;
	plot.playhead
		.style("display", null)
		.attr("fill", playheadColor)
		.attr("cx", plot.xScale(playheadReferenceTime))
		.attr("cy", plot.yScale(host.currentTrackTime))
		.raise();
}

function findLowerBoundByTrackTime(
	points: WarpingMatrixTempoPoint[],
	trackTime: number,
): number {
	let low = 0;
	let high = points.length;

	while (low < high) {
		const mid = Math.floor((low + high) / 2);
		if (points[mid].trackTime < trackTime) {
			low = mid + 1;
		} else {
			high = mid;
		}
	}

	return low;
}

function sliceTempoSeriesForDomain(
	points: WarpingMatrixTempoPoint[],
	xDomain: [number, number],
): WarpingMatrixTempoPoint[] {
	if (points.length === 0) {
		return points;
	}

	const startIndex = Math.max(
		0,
		findLowerBoundByTrackTime(points, xDomain[0]) - 1,
	);
	const endIndex = Math.min(
		points.length,
		findLowerBoundByTrackTime(points, xDomain[1]) + 1,
	);
	return points.slice(startIndex, endIndex);
}

function resolveDisplayedWarpingMatrixScoreBpm(
	renderer: ViewRenderer,
	host: WarpingMatrixHostMetadata,
	primarySeriesData: WarpingMatrixPathSeriesData | null,
	xDomain: [number, number],
): number | null {
	if (
		!primarySeriesData ||
		typeof renderer.resolveWarpingMatrixScoreBpm !== "function"
	) {
		return Number.isFinite(host.currentScoreBpm) &&
			(host.currentScoreBpm as number) > 0
			? host.currentScoreBpm
			: null;
	}

	const centerTrackTime = (xDomain[0] + xDomain[1]) / 2;
	const centerReferenceTime = renderer.interpolateWarpingReferenceTime(
		primarySeriesData.pointsByTrackTime,
		centerTrackTime,
	);
	const resolvedBpm =
		renderer.resolveWarpingMatrixScoreBpm(centerReferenceTime);
	if (Number.isFinite(resolvedBpm) && (resolvedBpm as number) > 0) {
		return resolvedBpm;
	}

	return Number.isFinite(host.currentScoreBpm) &&
		(host.currentScoreBpm as number) > 0
		? host.currentScoreBpm
		: null;
}

export function updateWarpingMatrixPlaybackState(
	ctx: ViewRenderer,
	host: WarpingMatrixHostMetadata,
	context: WarpingMatrixRenderContext | undefined,
): void {
	if (!host.visible || !context?.enabled) {
		host.wrapper.style.display = "none";
		return;
	}

	host.wrapper.style.display = "block";
	host.currentReferenceTime = clamp(
		context.currentReferenceTime,
		0,
		Math.max(0.001, host.referenceDuration),
	);

	const primarySeriesData = ctx.getPrimaryWarpingSeriesData(host);
	host.currentTrackTime = primarySeriesData
		? clamp(
				ctx.interpolateWarpingTrackTime(
					primarySeriesData.pointsByReferenceTime,
					host.currentReferenceTime,
				),
				0,
				Math.max(0.001, primarySeriesData.trackDuration),
			)
		: 0;

	ctx.renderWarpingMatrixPlayhead(host);
	ctx.renderWarpingMatrixTempoPlot(host);
}

export function setWarpingMatrixVisible(
	ctx: ViewRenderer,
	visible: boolean,
): void {
	ctx.warpingMatrixHosts.forEach((host: WarpingMatrixHostMetadata) => {
		host.visible = visible;
		host.wrapper.style.display = visible ? "" : "none";
		host.wrapper.classList.toggle("ts-stack-section-hidden", !visible);
	});
}

export function renderWarpingMatrixTempoPlot(
	ctx: ViewRenderer,
	host: WarpingMatrixHostMetadata,
): void {
	if (!host.tempoPlot) {
		return;
	}

	const tempoPlot = host.tempoPlot;
	const primarySeriesData = ctx.getPrimaryWarpingSeriesData(host);
	const tempoSeriesData = ctx.getPrimaryTempoSeriesData(host);
	const tempoSeries = ctx.getPrimaryTempoSeries(host);
	const trackDuration = primarySeriesData
		? Math.max(0.001, primarySeriesData.trackDuration)
		: 0.001;
	const windowSeconds = ctx.getWarpingMatrixLocalTempoWindowSeconds(host);
	const xDomain = ctx.resolveCenteredWarpingWindow(
		host.currentTrackTime,
		windowSeconds,
		trackDuration,
	);
	const displayedScoreBpm = resolveDisplayedWarpingMatrixScoreBpm(
		ctx,
		host,
		primarySeriesData,
		xDomain,
	);
	const showMonotonicityMessage =
		!!tempoSeriesData && !tempoSeriesData.isStrictlyMonotonic;
	host.tempoCurveValid = !showMonotonicityMessage;
	host.tempoMessage.hidden = host.matrixDisabled || !showMonotonicityMessage;
	host.tempoMessage.textContent =
		host.matrixDisabled || !showMonotonicityMessage
			? ""
			: tempoSeriesData?.warningMessage || WARPING_MATRIX_MONOTONICITY_WARNING;

	tempoPlot.xScale.domain(xDomain).range([0, tempoPlot.innerWidth]);

	tempoPlot.yScale
		.domain([
			WARPING_MATRIX_TEMPO_LOG_MIN_PERCENT,
			WARPING_MATRIX_TEMPO_LOG_MAX_PERCENT,
		])
		.range([tempoPlot.innerHeight, 0]);

	const xTickCount = Math.max(2, Math.round(tempoPlot.innerWidth / 90));
	tempoPlot.xAxis.call(axisBottom(tempoPlot.xScale).ticks(xTickCount));
	const showBpmAxis =
		Number.isFinite(displayedScoreBpm) && (displayedScoreBpm as number) > 0;
	tempoPlot.yAxis.call(
		axisLeft(tempoPlot.yScale)
			.tickValues(WARPING_MATRIX_TEMPO_AXIS_TICKS)
			.tickFormat((tickValue) => {
				const numericTick = Number(tickValue);
				if (!Number.isFinite(numericTick) || numericTick <= 0) {
					return "";
				}

				if (!showBpmAxis) {
					return String(Math.round(numericTick));
				}

				return formatTempoAxisBpmLabel(
					numericTick,
					displayedScoreBpm as number,
				);
			}),
	);
	if (showBpmAxis) {
		tempoPlot.yAxisRight.style("display", null).call(
			axisRight(tempoPlot.yScale)
				.tickValues(WARPING_MATRIX_TEMPO_AXIS_TICKS)
				.tickFormat((tickValue) => {
					const numericTick = Number(tickValue);
					if (!Number.isFinite(numericTick) || numericTick <= 0) {
						return "";
					}

					return String(Math.round(numericTick));
				}),
		);
	} else {
		tempoPlot.yAxisRight.style("display", "none");
	}
	tempoPlot.yLabel.text(showBpmAxis ? "Tempo (BPM)" : "Tempo (%)");
	tempoPlot.yLabelRight.text("Tempo (%)");
	if (showBpmAxis) {
		tempoPlot.yLabelRight.style("display", null);
	} else {
		tempoPlot.yLabelRight.style("display", "none");
	}

	const visibleTempoSeries = showMonotonicityMessage
		? []
		: sliceTempoSeriesForDomain(tempoSeries, xDomain);
	const tempoLine = line<WarpingMatrixTempoPoint>()
		.defined((point) => {
			return (
				Number.isFinite(point.trackTime) &&
				Number.isFinite(point.tempoPercent) &&
				point.tempoPercent > 0
			);
		})
		.x((point) => tempoPlot.xScale(point.trackTime))
		.y((point) => tempoPlot.yScale(point.tempoPercent));

	const activeColor = host.activeColumnKey
		? host.colorByColumn.get(host.activeColumnKey) ||
			WARPING_MATRIX_PRIMARY_COLOR
		: WARPING_MATRIX_PRIMARY_COLOR;
	tempoPlot.path
		.attr("stroke", activeColor)
		.attr("d", tempoLine(visibleTempoSeries) || null);

	const baselineY = tempoPlot.yScale(100);
	tempoPlot.baseline
		.attr("x1", 0)
		.attr("x2", tempoPlot.innerWidth)
		.attr("y1", baselineY)
		.attr("y2", baselineY);

	const centerX = tempoPlot.xScale((xDomain[0] + xDomain[1]) / 2);
	tempoPlot.centerLine
		.attr("x1", centerX)
		.attr("x2", centerX)
		.attr("y1", 0)
		.attr("y2", tempoPlot.innerHeight)
		.raise();
}

export function buildWarpingMatrixData(
	ctx: ViewRenderer,
	trackSeries: WarpingMatrixTrackSeries[],
	referenceDuration: number,
): WarpingMatrixMatrixData {
	const byColumn = new Map<string, WarpingMatrixPathSeriesData>();

	trackSeries.forEach((series: WarpingMatrixTrackSeries) => {
		const trackDuration = Math.max(
			resolveWarpingMatrixTrackDuration(
				series.trackDuration,
				referenceDuration,
			),
			resolveWarpingMatrixSeriesMaxTrackTime(series.points, referenceDuration),
		);

		const pointsByReferenceTime = series.points
			.map((point: WarpingMatrixDataPoint): WarpingMatrixPathPoint => {
				return {
					referenceTime: clamp(point.referenceTime, 0, referenceDuration),
					trackTime: clamp(point.trackTime, 0, trackDuration),
				};
			})
			.filter((point: WarpingMatrixPathPoint) => {
				return (
					Number.isFinite(point.referenceTime) &&
					Number.isFinite(point.trackTime)
				);
			})
			.sort((left: WarpingMatrixPathPoint, right: WarpingMatrixPathPoint) => {
				if (left.referenceTime === right.referenceTime) {
					return left.trackTime - right.trackTime;
				}

				return left.referenceTime - right.referenceTime;
			});

		if (pointsByReferenceTime.length === 0) {
			pointsByReferenceTime.push(
				{ referenceTime: 0, trackTime: 0 },
				{ referenceTime: referenceDuration, trackTime: trackDuration },
			);
		} else {
			const firstPoint = pointsByReferenceTime[0];
			if (firstPoint.referenceTime > 0) {
				pointsByReferenceTime.unshift({
					referenceTime: 0,
					trackTime: ctx.interpolateWarpingTrackTime(pointsByReferenceTime, 0),
				});
			}

			const lastPoint = pointsByReferenceTime[pointsByReferenceTime.length - 1];
			if (lastPoint.referenceTime < referenceDuration) {
				pointsByReferenceTime.push({
					referenceTime: referenceDuration,
					trackTime: ctx.interpolateWarpingTrackTime(
						pointsByReferenceTime,
						referenceDuration,
					),
				});
			}
		}

		const pointsByTrackTime = pointsByReferenceTime
			.slice()
			.sort((left: WarpingMatrixPathPoint, right: WarpingMatrixPathPoint) => {
				if (left.trackTime === right.trackTime) {
					return left.referenceTime - right.referenceTime;
				}

				return left.trackTime - right.trackTime;
			});

		byColumn.set(series.columnKey, {
			pointsByReferenceTime: pointsByReferenceTime,
			pointsByTrackTime: pointsByTrackTime,
			trackDuration: trackDuration,
		});
	});

	return { byColumn };
}

export function buildWarpingTempoData(
	ctx: ViewRenderer,
	matrixData: WarpingMatrixMatrixData | null,
	smoothingSeconds: number,
): WarpingMatrixTempoData {
	const byColumn = new Map<string, WarpingMatrixTempoSeriesData>();
	const normalizedSmoothingSeconds = normalizeTempoSmoothingSeconds(
		Number(smoothingSeconds),
	);

	if (!matrixData) {
		return { byColumn };
	}

	matrixData.byColumn.forEach(
		(seriesData: WarpingMatrixPathSeriesData, columnKey: string) => {
			const strictPath = buildStrictMonotonicWarpingPath(
				seriesData.pointsByReferenceTime,
			);
			if (!strictPath) {
				byColumn.set(columnKey, {
					points: [],
					isStrictlyMonotonic: false,
					warningMessage: WARPING_MATRIX_MONOTONICITY_WARNING,
				});
				return;
			}

			const frameGrid = collectReferenceFrameGrid(
				seriesData.pointsByReferenceTime,
			);
			if (frameGrid.length < 2) {
				byColumn.set(columnKey, {
					points: [],
					isStrictlyMonotonic: false,
					warningMessage: WARPING_MATRIX_MONOTONICITY_WARNING,
				});
				return;
			}

			const interpolatedFrames = frameGrid.map(
				(referenceTime: number): WarpingMatrixPathPoint => {
					return {
						referenceTime: referenceTime,
						trackTime: ctx.interpolateWarpingTrackTime(
							strictPath,
							referenceTime,
						),
					};
				},
			);
			const tempoEstimationHalfWindowPoints =
				resolveTempoEstimationHalfWindowPoints(
					interpolatedFrames,
					normalizedSmoothingSeconds,
				);
			const beatDurationRatios = buildPointWindowBeatDurationRatios(
				interpolatedFrames,
				tempoEstimationHalfWindowPoints,
			);
			if (beatDurationRatios.length === 0) {
				byColumn.set(columnKey, {
					points: [],
					isStrictlyMonotonic: false,
					warningMessage: WARPING_MATRIX_MONOTONICITY_WARNING,
				});
				return;
			}

			const tempoPoints: WarpingMatrixTempoPoint[] = [];
			beatDurationRatios.forEach((ratioPoint) => {
				if (
					!Number.isFinite(ratioPoint.beatDurationRatio) ||
					ratioPoint.beatDurationRatio <= 0
				) {
					return;
				}

				const tempoPercent = 100 / ratioPoint.beatDurationRatio;
				if (!Number.isFinite(tempoPercent) || tempoPercent <= 0) {
					return;
				}

				tempoPoints.push({
					trackTime: ratioPoint.trackTime,
					referenceTime: ratioPoint.referenceTime,
					tempoPercent: tempoPercent,
				});
			});

			tempoPoints.sort(
				(left: WarpingMatrixTempoPoint, right: WarpingMatrixTempoPoint) => {
					if (left.trackTime === right.trackTime) {
						return left.referenceTime - right.referenceTime;
					}

					return left.trackTime - right.trackTime;
				},
			);
			byColumn.set(columnKey, {
				points: tempoPoints,
				isStrictlyMonotonic: true,
				warningMessage: null,
			});
		},
	);

	return { byColumn };
}

interface BeatDurationRatioPoint {
	trackTime: number;
	referenceTime: number;
	beatDurationRatio: number;
}

function buildStrictMonotonicWarpingPath(
	points: WarpingMatrixPathPoint[],
): WarpingMatrixPathPoint[] | null {
	if (!Array.isArray(points) || points.length < 2) {
		return null;
	}

	const firstPoint = points[0];
	const lastPoint = points[points.length - 1];
	if (
		!Number.isFinite(firstPoint.referenceTime) ||
		!Number.isFinite(firstPoint.trackTime) ||
		!Number.isFinite(lastPoint.referenceTime) ||
		!Number.isFinite(lastPoint.trackTime)
	) {
		return null;
	}

	const strictPath: WarpingMatrixPathPoint[] = [firstPoint];
	for (let index = 1; index < points.length - 1; index += 1) {
		const point = points[index];
		const previous = strictPath[strictPath.length - 1];
		if (
			Number.isFinite(point.referenceTime) &&
			Number.isFinite(point.trackTime) &&
			point.referenceTime > previous.referenceTime &&
			point.trackTime > previous.trackTime
		) {
			strictPath.push(point);
		}
	}

	const previous = strictPath[strictPath.length - 1];
	if (
		lastPoint.referenceTime <= previous.referenceTime ||
		lastPoint.trackTime <= previous.trackTime
	) {
		return null;
	}

	strictPath.push(lastPoint);
	return strictPath.length >= 2 ? strictPath : null;
}

function collectReferenceFrameGrid(points: WarpingMatrixPathPoint[]): number[] {
	const frameGrid: number[] = [];
	points.forEach((point) => {
		if (!Number.isFinite(point.referenceTime)) {
			return;
		}

		if (
			frameGrid.length === 0 ||
			point.referenceTime > frameGrid[frameGrid.length - 1]
		) {
			frameGrid.push(point.referenceTime);
		}
	});

	return frameGrid;
}

function resolveTempoEstimationHalfWindowPoints(
	points: WarpingMatrixPathPoint[],
	smoothingSeconds: number,
): number {
	if (!Array.isArray(points) || points.length < 2) {
		return 1;
	}

	let totalReferenceDelta = 0;
	let deltaCount = 0;
	for (let index = 1; index < points.length; index += 1) {
		const previous = points[index - 1];
		const current = points[index];
		const referenceDelta = current.referenceTime - previous.referenceTime;
		if (!Number.isFinite(referenceDelta) || referenceDelta <= 0) {
			continue;
		}

		totalReferenceDelta += referenceDelta;
		deltaCount += 1;
	}

	if (deltaCount === 0) {
		return 1;
	}

	const averageReferenceDelta = totalReferenceDelta / deltaCount;
	if (!Number.isFinite(averageReferenceDelta) || averageReferenceDelta <= 0) {
		return 1;
	}

	const fullWindowPoints = Math.max(
		2,
		Math.round(
			normalizeTempoSmoothingSeconds(smoothingSeconds) / averageReferenceDelta,
		),
	);
	return Math.max(1, Math.round(fullWindowPoints / 2));
}

function buildPointWindowBeatDurationRatios(
	points: WarpingMatrixPathPoint[],
	halfWindowPoints: number,
): BeatDurationRatioPoint[] {
	const ratios: BeatDurationRatioPoint[] = [];
	if (points.length < 2) {
		return ratios;
	}

	const normalizedHalfWindowPoints = Math.max(1, Math.round(halfWindowPoints));

	points.forEach((point, index) => {
		const leftIndex = Math.max(0, index - normalizedHalfWindowPoints);
		const rightIndex = Math.min(
			points.length - 1,
			index + normalizedHalfWindowPoints,
		);
		const leftPoint = points[leftIndex];
		const rightPoint = points[rightIndex];
		const referenceDelta = rightPoint.referenceTime - leftPoint.referenceTime;
		const trackDelta = rightPoint.trackTime - leftPoint.trackTime;
		if (
			!Number.isFinite(referenceDelta) ||
			!Number.isFinite(trackDelta) ||
			referenceDelta <= 0 ||
			trackDelta <= 0
		) {
			return;
		}

		ratios.push({
			referenceTime: point.referenceTime,
			trackTime: point.trackTime,
			beatDurationRatio: trackDelta / referenceDelta,
		});
	});

	return ratios;
}

export function interpolateWarpingTrackTime(
	points: WarpingMatrixPathPoint[],
	referenceTime: number,
): number {
	if (!Array.isArray(points) || points.length === 0) {
		return 0;
	}

	if (points.length === 1) {
		return points[0].trackTime;
	}

	const first = points[0];
	const last = points[points.length - 1];

	if (referenceTime <= first.referenceTime) {
		return first.trackTime;
	}

	if (referenceTime >= last.referenceTime) {
		return last.trackTime;
	}

	let leftIndex = 0;
	let rightIndex = points.length - 1;

	while (leftIndex <= rightIndex) {
		const middleIndex = Math.floor((leftIndex + rightIndex) / 2);
		const middle = points[middleIndex];

		if (middle.referenceTime === referenceTime) {
			return middle.trackTime;
		}

		if (middle.referenceTime < referenceTime) {
			leftIndex = middleIndex + 1;
		} else {
			rightIndex = middleIndex - 1;
		}
	}

	const rightPoint = points[Math.min(points.length - 1, leftIndex)];
	const leftPoint = points[Math.max(0, leftIndex - 1)];
	const range = rightPoint.referenceTime - leftPoint.referenceTime;
	if (!Number.isFinite(range) || range <= 0) {
		return leftPoint.trackTime;
	}

	const ratio = (referenceTime - leftPoint.referenceTime) / range;
	return (
		leftPoint.trackTime + (rightPoint.trackTime - leftPoint.trackTime) * ratio
	);
}

export function interpolateWarpingReferenceTime(
	pointsByTrackTime: WarpingMatrixPathPoint[],
	trackTime: number,
): number {
	if (!Array.isArray(pointsByTrackTime) || pointsByTrackTime.length === 0) {
		return 0;
	}

	if (pointsByTrackTime.length === 1) {
		return pointsByTrackTime[0].referenceTime;
	}

	const first = pointsByTrackTime[0];
	const last = pointsByTrackTime[pointsByTrackTime.length - 1];

	if (trackTime <= first.trackTime) {
		return first.referenceTime;
	}

	if (trackTime >= last.trackTime) {
		return last.referenceTime;
	}

	let leftIndex = 0;
	let rightIndex = pointsByTrackTime.length - 1;

	while (leftIndex <= rightIndex) {
		const middleIndex = Math.floor((leftIndex + rightIndex) / 2);
		const middle = pointsByTrackTime[middleIndex];

		if (middle.trackTime === trackTime) {
			return middle.referenceTime;
		}

		if (middle.trackTime < trackTime) {
			leftIndex = middleIndex + 1;
		} else {
			rightIndex = middleIndex - 1;
		}
	}

	const rightPoint =
		pointsByTrackTime[Math.min(pointsByTrackTime.length - 1, leftIndex)];
	const leftPoint = pointsByTrackTime[Math.max(0, leftIndex - 1)];
	const range = rightPoint.trackTime - leftPoint.trackTime;
	if (!Number.isFinite(range) || range <= 0) {
		return leftPoint.referenceTime;
	}

	const ratio = (trackTime - leftPoint.trackTime) / range;
	return (
		leftPoint.referenceTime +
		(rightPoint.referenceTime - leftPoint.referenceTime) * ratio
	);
}
