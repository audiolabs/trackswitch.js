import {
	levelPowers,
	resolveFrequencyRange,
	SpectrogramFrames,
	type SpectrogramSettings,
	toFrequencyScale,
} from "../media/spectrogram";
import type { WaveformMixReader } from "../media/waveform-engine";
import { formatMidiNoteName } from "../shared/midi-notes";
import type { TrackSwitchSpectrogramViewConfig } from "../types";
import { resizeCanvasForCssSize } from "./surface";

/**
 * Main-thread time one redraw spends analysing frames. Whatever is left is
 * analysed over the next frames, so scrolling and playback stay smooth while
 * a zoomed-out view fills in.
 */
const ANALYSIS_BUDGET_MS = 12;
/** Closest two axis labels may sit, in CSS pixels. */
const MIN_TICK_SPACING = 16;
/**
 * Height kept free of labels at the top of every lane, in CSS pixels: the
 * zoom badge and a stereo lane's channel label sit there.
 */
const TICK_TOP_CLEARANCE = 30;
/** Height kept free of labels at the bottom of every lane, in CSS pixels. */
const TICK_BOTTOM_CLEARANCE = 6;

/**
 * Columns of one lane already analysed, by their index on the surface.
 * `stale` holds the columns of the mix shown before, at the same geometry,
 * which stand in while the current one is analysed — so a dragged volume
 * slider does not blank the view on every step.
 */
interface SpectrogramColumnCache {
	key: string;
	geometryKey: string;
	columns: Map<number, Uint8Array>;
	stale: Map<number, Uint8Array>;
}

export interface SpectrogramSurfaceState {
	settings: SpectrogramSettings;
	/** The analysis frames of each lane, which the tile and minimap share. */
	frames: SpectrogramFrames[];
	/** The tile's columns, per lane. */
	tileCaches: SpectrogramColumnCache[];
	/** The minimap's columns, per lane. */
	minimapCaches: SpectrogramColumnCache[];
	axisNodes: HTMLElement[];
	axisKey: string | null;
}

export function createSpectrogramSurfaceState(
	config: TrackSwitchSpectrogramViewConfig,
	laneCount: number,
	overlay: HTMLElement,
): SpectrogramSurfaceState {
	const [minFrequency, maxFrequency] = config.frequencyRange as [
		number,
		number,
	];
	const axisNodes = Array.from({ length: laneCount }, (_value, lane) => {
		const node = document.createElement("div");
		node.className = "spectrogram-axis";
		node.style.top = `${(lane * 100) / laneCount}%`;
		node.style.height = `${100 / laneCount}%`;
		overlay.appendChild(node);
		return node;
	});
	return {
		settings: {
			frequencyScale: config.frequencyScale ?? "linear",
			axisLabels: config.axisLabels ?? "hz",
			minFrequency,
			maxFrequency,
			amplitude: config.amplitude ?? "log1p",
			dynamicRange: config.dynamicRange ?? 80,
			gamma: config.gamma ?? 10000,
			fftSize: config.fftSize ?? 4096,
			window: config.window ?? "hann",
			hopSize: config.hopSize ?? (config.fftSize ?? 4096) / 2,
		},
		frames: [],
		tileCaches: [],
		minimapCaches: [],
		axisNodes,
		axisKey: null,
	};
}

/** The settings a draw key needs to tell two renderings apart. */
export function getSpectrogramSettingsKey(
	state: SpectrogramSurfaceState,
): string {
	return Object.values(state.settings).join(":");
}

export interface SpectrogramColors {
	background: string;
	color: string;
	divider: string;
}

export function resolveSpectrogramColors(
	element: HTMLElement,
): SpectrogramColors {
	const style = getComputedStyle(element);
	return {
		background: style.getPropertyValue("--spectrogram-background").trim(),
		color: style.getPropertyValue("--spectrogram-color").trim(),
		divider: style.getPropertyValue("--waveform-lane-divider-color").trim(),
	};
}

let colorProbe: CanvasRenderingContext2D | null = null;

/** A CSS colour as its sRGB channels, read back from a canvas pixel. */
function parseCssColor(color: string): [number, number, number] {
	if (!colorProbe) {
		const canvas = document.createElement("canvas");
		canvas.width = 1;
		canvas.height = 1;
		colorProbe = canvas.getContext("2d", { willReadFrequently: true });
	}
	const context = colorProbe as CanvasRenderingContext2D;
	context.clearRect(0, 0, 1, 1);
	context.fillStyle = color;
	context.fillRect(0, 0, 1, 1);
	const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
	return [red, green, blue];
}

const colorMaps = new Map<string, Uint8Array>();

/** RGB per intensity from 0 to 255, from the background to the colour. */
function getColorMap(colors: SpectrogramColors): Uint8Array {
	const key = `${colors.background}|${colors.color}`;
	let map = colorMaps.get(key);
	if (!map) {
		const low = parseCssColor(colors.background);
		const high = parseCssColor(colors.color);
		map = new Uint8Array(256 * 3);
		for (let level = 0; level < 256; level += 1) {
			for (let channel = 0; channel < 3; channel += 1) {
				map[level * 3 + channel] = Math.round(
					low[channel] + ((high[channel] - low[channel]) * level) / 255,
				);
			}
		}
		colorMaps.set(key, map);
	}
	return map;
}

function getColumnCache(
	caches: SpectrogramColumnCache[],
	lane: number,
	key: string,
	geometryKey: string,
): SpectrogramColumnCache {
	let cache = caches[lane];
	if (!cache) {
		cache = { key, geometryKey, columns: new Map(), stale: new Map() };
		caches[lane] = cache;
		return cache;
	}
	if (cache.geometryKey !== geometryKey) {
		cache.key = key;
		cache.geometryKey = geometryKey;
		cache.columns.clear();
		cache.stale.clear();
	} else if (cache.key !== key) {
		cache.key = key;
		cache.columns.forEach((column, index) => {
			cache.stale.set(index, column);
		});
		cache.columns.clear();
	}
	return cache;
}

/** The frames of `reader` for one lane, kept for as long as it reads the same. */
function getLaneFrames(
	state: SpectrogramSurfaceState,
	lane: number,
	reader: WaveformMixReader,
): SpectrogramFrames {
	let frames = state.frames[lane];
	if (frames?.key !== SpectrogramFrames.keyFor(reader, state.settings)) {
		frames = new SpectrogramFrames(reader, state.settings);
		state.frames[lane] = frames;
	}
	return frames;
}

/** Display intensity from 0 to 255 of a power, as the settings compress it. */
function powerToIntensity(
	power: number,
	settings: SpectrogramSettings,
): number {
	let intensity: number;
	if (settings.amplitude === "db") {
		intensity =
			power > 0
				? (10 * Math.log10(power) + settings.dynamicRange) /
					settings.dynamicRange
				: 0;
	} else {
		intensity =
			Math.log1p(settings.gamma * Math.sqrt(power)) /
			Math.log1p(settings.gamma);
	}
	return Math.round(Math.min(1, Math.max(0, intensity)) * 255);
}

const intensityMaps = new Map<string, Uint8Array>();

/** Display intensity per level, as the settings compress it. */
function getIntensityMap(settings: SpectrogramSettings): Uint8Array {
	const key = [settings.amplitude, settings.dynamicRange, settings.gamma].join(
		":",
	);
	let map = intensityMaps.get(key);
	if (!map) {
		map = Uint8Array.from(levelPowers, (power) =>
			powerToIntensity(power, settings),
		);
		intensityMaps.set(key, map);
	}
	return map;
}

/**
 * Writes the column of the surface that spans samples [`from`, `to`) to `out`:
 * the mean power of the frames centred within it, or the frame nearest its
 * middle when it is narrower than a hop. With frames still unanalysed by
 * `deadline`, it takes the mean of those that are, and returns false; it
 * returns null when none is.
 */
function composeColumn(
	frames: SpectrogramFrames,
	from: number,
	to: number,
	deadline: number,
	settings: SpectrogramSettings,
	sums: Float64Array,
	out: Uint8Array,
): boolean | null {
	const hop = frames.hopSize;
	let first = Math.ceil(from / hop);
	let last = Math.ceil(to / hop) - 1;
	if (last < first) {
		first = Math.round((from + to) / 2 / hop);
		last = first;
	}

	const rows = out.length;
	if (first === last) {
		const levels = frames.frameRows(first, rows, deadline);
		if (!levels) {
			return null;
		}
		const intensities = getIntensityMap(settings);
		for (let row = 0; row < rows; row += 1) {
			out[row] = intensities[levels[row]];
		}
		return true;
	}

	sums.fill(0, 0, rows);
	let counted = 0;
	for (let frame = first; frame <= last; frame += 1) {
		const levels = frames.frameRows(frame, rows, deadline);
		if (!levels) {
			continue;
		}
		counted += 1;
		for (let row = 0; row < rows; row += 1) {
			sums[row] += levelPowers[levels[row]];
		}
	}
	if (counted === 0) {
		return null;
	}
	for (let row = 0; row < rows; row += 1) {
		out[row] = powerToIntensity(sums[row] / counted, settings);
	}
	return counted === last - first + 1;
}

/** Drops the columns outside [`start`, `end`), so a long scroll does not pile them up. */
function pruneColumnCache(
	cache: SpectrogramColumnCache,
	start: number,
	end: number,
): void {
	[cache.columns, cache.stale].forEach((columns) => {
		columns.forEach((_column, index) => {
			if (index < start || index >= end) {
				columns.delete(index);
			}
		});
	});
}

/** A stretch of the surface a spectrogram canvas shows. */
export interface SpectrogramDrawRange {
	/** Surface column the canvas's first column is; a column is a CSS pixel. */
	firstColumn: number;
	/** Seconds of the surface's timeline one column spans. */
	secondsPerColumn: number;
	/** Columns, from the canvas's left edge, that hold audio. */
	drawColumns: number;
	/** Columns, from the left edge, analysed before the others. */
	priorityStart: number;
	priorityEnd: number;
}

/**
 * Draws one lane per reader stacked top to bottom, one column per CSS pixel
 * and one row per device pixel. Columns are taken from `caches` where they
 * were analysed before; the rest are analysed until `deadline`, after which
 * the ones still missing show what the mix before showed there, or nothing.
 * Returns whether every column was drawn from the current mix.
 */
export function drawSpectrogram(
	canvas: HTMLCanvasElement,
	cssWidth: number,
	cssHeight: number,
	readers: WaveformMixReader[] | null,
	range: SpectrogramDrawRange,
	state: SpectrogramSurfaceState,
	caches: SpectrogramColumnCache[],
	colors: SpectrogramColors,
	deadline: number,
): boolean {
	const context = resizeCanvasForCssSize(canvas, cssWidth, cssHeight);
	if (!context) {
		return true;
	}

	context.setTransform(1, 0, 0, 1, 0, 0);
	context.fillStyle = colors.background;
	context.fillRect(0, 0, canvas.width, canvas.height);
	if (!readers || readers.length === 0 || range.secondsPerColumn <= 0) {
		return true;
	}

	const columns = Math.max(1, Math.round(cssWidth));
	const drawColumns = Math.min(
		columns,
		Math.max(0, Math.round(range.drawColumns)),
	);
	const rows = canvas.height;
	const image = new ImageData(columns, rows);
	const pixels = image.data;
	const colorMap = getColorMap(colors);
	const sums = new Float64Array(rows);
	const settingsKey = getSpectrogramSettingsKey(state);
	let complete = true;

	// Background first, so columns left unanalysed read as empty.
	for (let index = 0; index < pixels.length; index += 4) {
		pixels[index] = colorMap[0];
		pixels[index + 1] = colorMap[1];
		pixels[index + 2] = colorMap[2];
		pixels[index + 3] = 255;
	}

	const order: number[] = [];
	const priorityStart = Math.max(0, Math.floor(range.priorityStart));
	const priorityEnd = Math.min(drawColumns, Math.ceil(range.priorityEnd));
	for (let column = priorityStart; column < priorityEnd; column += 1) {
		order.push(column);
	}
	for (let column = 0; column < drawColumns; column += 1) {
		if (column < priorityStart || column >= priorityEnd) {
			order.push(column);
		}
	}

	readers.forEach((reader, lane) => {
		const laneTop = Math.round((rows * lane) / readers.length);
		const laneRows = Math.round((rows * (lane + 1)) / readers.length) - laneTop;
		const samplesPerColumn = range.secondsPerColumn * reader.sampleRate;
		const frames = getLaneFrames(state, lane, reader);
		const cache = getColumnCache(
			caches,
			lane,
			frames.key,
			[settingsKey, reader.sampleRate, range.secondsPerColumn, laneRows].join(
				"#",
			),
		);
		pruneColumnCache(
			cache,
			range.firstColumn - columns,
			range.firstColumn + 2 * columns,
		);

		for (const column of order) {
			const index = range.firstColumn + column;
			let values = cache.columns.get(index);
			if (!values) {
				const composed = new Uint8Array(laneRows);
				const result = composeColumn(
					frames,
					index * samplesPerColumn,
					(index + 1) * samplesPerColumn,
					deadline,
					state.settings,
					sums,
					composed,
				);
				if (result === true) {
					values = composed;
					cache.columns.set(index, values);
					cache.stale.delete(index);
				} else {
					// Part of the frames shows better than what the mix before
					// showed here, which shows better than nothing.
					complete = false;
					values = result === false ? composed : cache.stale.get(index);
					if (!values) {
						continue;
					}
				}
			}
			for (let row = 0; row < laneRows; row += 1) {
				const level = values[row] * 3;
				const pixel = ((laneTop + row) * columns + column) * 4;
				pixels[pixel] = colorMap[level];
				pixels[pixel + 1] = colorMap[level + 1];
				pixels[pixel + 2] = colorMap[level + 2];
			}
		}
	});

	const columnCanvas = getScratchCanvas(columns, rows);
	const scratchContext = columnCanvas.getContext("2d");
	if (!scratchContext) {
		return complete;
	}
	scratchContext.putImageData(image, 0, 0);
	context.imageSmoothingEnabled = false;
	context.drawImage(
		columnCanvas,
		0,
		0,
		columns,
		rows,
		0,
		0,
		canvas.width,
		rows,
	);

	context.fillStyle = colors.divider;
	const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
	for (let lane = 1; lane < readers.length; lane += 1) {
		context.fillRect(
			0,
			Math.round((rows * lane) / readers.length - pixelRatio / 2),
			canvas.width,
			Math.max(1, Math.round(pixelRatio)),
		);
	}
	return complete;
}

let scratchCanvas: HTMLCanvasElement | null = null;

/** One canvas every spectrogram assembles its columns in before scaling them. */
function getScratchCanvas(width: number, height: number): HTMLCanvasElement {
	if (!scratchCanvas) {
		scratchCanvas = document.createElement("canvas");
	}
	if (scratchCanvas.width < width) {
		scratchCanvas.width = width;
	}
	if (scratchCanvas.height < height) {
		scratchCanvas.height = height;
	}
	return scratchCanvas;
}

/** The deadline of one redraw's analysis, from now. */
export function getSpectrogramDeadline(): number {
	return performance.now() + ANALYSIS_BUDGET_MS;
}

/** A spectrogram with nothing to show yet: its background. */
export function renderSpectrogramPlaceholder(
	canvas: HTMLCanvasElement,
	cssWidth: number,
	cssHeight: number,
	colors: SpectrogramColors,
): void {
	const context = resizeCanvasForCssSize(canvas, cssWidth, cssHeight);
	if (!context) {
		return;
	}
	context.fillStyle = colors.background;
	context.fillRect(0, 0, cssWidth, cssHeight);
}

interface AxisTick {
	frequency: number;
	label: string;
	/** Lower comes first when ticks compete for space. */
	priority: number;
}

function formatHertz(frequency: number): string {
	return frequency >= 1000
		? `${String(Number((frequency / 1000).toFixed(2)))} kHz`
		: `${String(Number(frequency.toFixed(1)))} Hz`;
}

/** Round frequencies from 1 Hz to 100 kHz, the rounder ones first. */
function buildHertzTicks(
	settings: SpectrogramSettings,
	low: number,
	high: number,
	laneHeight: number,
): AxisTick[] {
	const ticks: AxisTick[] = [];
	if (settings.frequencyScale === "linear") {
		// Evenly spaced, as far apart as the labels need.
		const rough = ((high - low) * MIN_TICK_SPACING * 2) / laneHeight;
		const magnitude = 10 ** Math.floor(Math.log10(rough));
		const step =
			[1, 2, 5, 10]
				.map((factor) => factor * magnitude)
				.find((value) => value >= rough) ?? 10 * magnitude;
		for (
			let frequency = Math.ceil(low / step) * step;
			frequency <= high;
			frequency += step
		) {
			ticks.push({ frequency, label: formatHertz(frequency), priority: 0 });
		}
		return ticks;
	}

	for (let exponent = 0; exponent <= 5; exponent += 1) {
		const decade = 10 ** exponent;
		[1, 5, 2].forEach((factor, priority) => {
			const frequency = factor * decade;
			if (frequency >= low && frequency <= high) {
				ticks.push({ frequency, label: formatHertz(frequency), priority });
			}
		});
	}
	return ticks;
}

/** The C of every octave, the ones of every other octave first. */
function buildMidiTicks(low: number, high: number): AxisTick[] {
	const ticks: AxisTick[] = [];
	for (let midi = 0; midi <= 132; midi += 12) {
		const frequency = 440 * 2 ** ((midi - 69) / 12);
		if (frequency >= low && frequency <= high) {
			ticks.push({
				frequency,
				label: formatMidiNoteName(midi),
				priority: (midi / 12) % 2,
			});
		}
	}
	return ticks;
}

/**
 * Labels the frequency axis of every lane, keeping only labels far enough
 * apart to read. Rebuilt whenever the lane height or the sample rate changes.
 */
export function updateSpectrogramAxis(
	state: SpectrogramSurfaceState,
	height: number,
	sampleRate: number,
): void {
	const laneHeight = height / Math.max(1, state.axisNodes.length);
	const key = [getSpectrogramSettingsKey(state), laneHeight, sampleRate].join(
		"#",
	);
	if (state.axisKey === key) {
		return;
	}
	state.axisKey = key;

	const { settings } = state;
	const range =
		sampleRate > 0 ? resolveFrequencyRange(settings, sampleRate) : null;
	const ticks: Array<AxisTick & { y: number }> = [];
	if (range) {
		const scale = settings.frequencyScale;
		const low = toFrequencyScale(scale, range.low);
		const high = toFrequencyScale(scale, range.high);
		const candidates =
			settings.axisLabels === "midi"
				? buildMidiTicks(range.low, range.high)
				: buildHertzTicks(settings, range.low, range.high, laneHeight);
		candidates
			.map((tick) => ({
				...tick,
				// From the bottom of the lane, in CSS pixels.
				y:
					((toFrequencyScale(scale, tick.frequency) - low) / (high - low)) *
					laneHeight,
			}))
			.filter(
				(tick) =>
					tick.y >= TICK_BOTTOM_CLEARANCE &&
					tick.y <= laneHeight - TICK_TOP_CLEARANCE,
			)
			.sort((a, b) => a.priority - b.priority || a.frequency - b.frequency)
			.forEach((tick) => {
				if (
					ticks.every((kept) => Math.abs(kept.y - tick.y) >= MIN_TICK_SPACING)
				) {
					ticks.push(tick);
				}
			});
		ticks.sort((a, b) => a.frequency - b.frequency);
	}

	state.axisNodes.forEach((axis) => {
		axis.replaceChildren(
			...ticks.map((tick) => {
				const node = document.createElement("div");
				node.className = "spectrogram-axis-tick";
				node.style.bottom = `${(tick.y / laneHeight) * 100}%`;
				node.textContent = tick.label;
				return node;
			}),
		);
	});
}
