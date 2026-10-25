import { spectrogramKernelBase64 } from "../generated/spectrogram-kernel";
import type {
	SpectrogramAmplitude,
	SpectrogramAxisLabels,
	SpectrogramFrequencyScale,
	SpectrogramWindow,
} from "../types";
import type { WaveformMixReader } from "./waveform-engine";

/** A spectrogram view's configuration, resolved. */
export interface SpectrogramSettings {
	frequencyScale: SpectrogramFrequencyScale;
	axisLabels: SpectrogramAxisLabels;
	minFrequency: number;
	maxFrequency: number;
	amplitude: SpectrogramAmplitude;
	dynamicRange: number;
	gamma: number;
	fftSize: number;
	window: SpectrogramWindow;
	hopSize: number;
}

/**
 * Powers are kept as levels, a byte each: 255 at full scale and one step per
 * half decibel below, so 0 lies 127.5 dB down — below any range shown.
 */
const FULL_SCALE_LEVEL = 255;
const LEVELS_PER_DECIBEL = 2;
/** Most row sets a store keeps: the tile's and the minimap's, and one spare. */
const ROW_SET_LIMIT = 3;

/** The power each level stands for. */
export const levelPowers = Float64Array.from(
	{ length: FULL_SCALE_LEVEL + 1 },
	(_value, level) =>
		10 ** ((level - FULL_SCALE_LEVEL) / LEVELS_PER_DECIBEL / 10),
);

/** The level nearest a power. */
export function powerToLevel(power: number): number {
	if (power <= 0) {
		return 0;
	}
	const level = FULL_SCALE_LEVEL + LEVELS_PER_DECIBEL * 10 * Math.log10(power);
	return Math.max(0, Math.min(FULL_SCALE_LEVEL, Math.round(level)));
}

/** Where `hz` lies on `scale`, in that scale's own unit. */
export function toFrequencyScale(
	scale: SpectrogramFrequencyScale,
	hz: number,
): number {
	switch (scale) {
		case "linear":
			return hz;
		case "log":
			return Math.log2(hz);
		case "mel":
			return 2595 * Math.log10(1 + hz / 700);
		case "bark":
			return (26.81 * hz) / (1960 + hz) - 0.53;
	}
}

/** The frequency at `value` on `scale`; see `toFrequencyScale`. */
export function fromFrequencyScale(
	scale: SpectrogramFrequencyScale,
	value: number,
): number {
	switch (scale) {
		case "linear":
			return value;
		case "log":
			return 2 ** value;
		case "mel":
			return 700 * (10 ** (value / 2595) - 1);
		case "bark":
			return (1960 * (value + 0.53)) / (26.28 - value);
	}
}

/** The frequencies a spectrogram of `sampleRate` audio spans, bottom to top. */
export function resolveFrequencyRange(
	settings: SpectrogramSettings,
	sampleRate: number,
): { low: number; high: number } | null {
	const high = Math.min(settings.maxFrequency, sampleRate / 2);
	return high > settings.minFrequency
		? { low: settings.minFrequency, high }
		: null;
}

/** Sample `index` of the periodic form of `window` over `size` samples. */
function windowValue(
	window: SpectrogramWindow,
	index: number,
	size: number,
): number {
	const phase = (2 * Math.PI * index) / size;
	switch (window) {
		case "rectangular":
			return 1;
		case "hann":
			return 0.5 - 0.5 * Math.cos(phase);
		case "hamming":
			return 0.54 - 0.46 * Math.cos(phase);
		case "blackman":
			return 0.42 - 0.5 * Math.cos(phase) + 0.08 * Math.cos(2 * phase);
		case "bartlett":
			return 1 - Math.abs((2 * index) / size - 1);
	}
}

let kernelModule: WebAssembly.Module | null = null;

/**
 * The compiled spectrogram-kernel.wat for one frame size and window, over views of its
 * memory regions. Its tables are filled once; a frame is analysed by writing
 * its samples to `frame` and reading `levels` back.
 */
class SpectrogramKernel {
	readonly frame: Float32Array;
	readonly levels: Uint8Array;
	/** Squared magnitude of a bin per unit squared amplitude of a sine in it. */
	readonly powerScale: number;
	private readonly analyseFrame: (scale: number, bins: number) => void;

	constructor(
		readonly fftSize: number,
		windowType: SpectrogramWindow,
	) {
		if (!kernelModule) {
			kernelModule = new WebAssembly.Module(
				Uint8Array.from(atob(spectrogramKernelBase64), (character) =>
					character.charCodeAt(0),
				),
			);
		}
		const exports = new WebAssembly.Instance(kernelModule)
			.exports as unknown as {
			memory: WebAssembly.Memory;
			setup(size: number): void;
			analyse(scale: number, bins: number): void;
		};

		// The layout `setup` writes, in bytes.
		const size = fftSize;
		const half = size / 2;
		const bins = half + 4;
		const splitCosByte = size * 18;
		const splitSinByte = splitCosByte + bins * 4;
		const levelsByte = splitSinByte + bins * 4;
		const pageBytes = 65536;
		exports.memory.grow(
			Math.ceil((levelsByte + bins) / pageBytes) -
				exports.memory.buffer.byteLength / pageBytes,
		);
		exports.setup(size);
		const memory = exports.memory.buffer;

		const window = new Float32Array(memory, size * 4, size);
		let windowSum = 0;
		for (let index = 0; index < size; index += 1) {
			window[index] = windowValue(windowType, index, size);
			windowSum += window[index];
		}
		this.powerScale = (2 / windowSum) ** 2;

		const reversed = new Uint32Array(memory, size * 12, half);
		const bits = Math.log2(half);
		for (let index = 0; index < half; index += 1) {
			let value = index;
			let result = 0;
			for (let bit = 0; bit < bits; bit += 1) {
				result = (result << 1) | (value & 1);
				value >>= 1;
			}
			reversed[index] = result;
		}

		// The stage pairing entries `span` apart turns its odd entries by
		// e^(-iπ·offset/span), stored from entry `span - 1` on.
		const cos = new Float32Array(memory, size * 14, half);
		const sin = new Float32Array(memory, size * 16, half);
		for (let span = 1; span < half; span *= 2) {
			for (let offset = 0; offset < span; offset += 1) {
				cos[span - 1 + offset] = Math.cos((-Math.PI * offset) / span);
				sin[span - 1 + offset] = Math.sin((-Math.PI * offset) / span);
			}
		}

		const splitCos = new Float32Array(memory, splitCosByte, half + 1);
		const splitSin = new Float32Array(memory, splitSinByte, half + 1);
		for (let bin = 0; bin <= half; bin += 1) {
			splitCos[bin] = Math.cos((-2 * Math.PI * bin) / size);
			splitSin[bin] = Math.sin((-2 * Math.PI * bin) / size);
		}

		this.frame = new Float32Array(memory, 0, size);
		this.levels = new Uint8Array(memory, levelsByte, half + 1);
		this.analyseFrame = exports.analyse;
	}

	/**
	 * The levels of the first `bins` bins of the frame from sample `start` on —
	 * a view the next call overwrites.
	 */
	analyse(reader: WaveformMixReader, start: number, bins: number): Uint8Array {
		reader.read(start, this.frame, this.fftSize);
		this.analyseFrame(this.powerScale, bins);
		return this.levels.subarray(0, bins);
	}
}

const kernels = new Map<string, SpectrogramKernel>();

function getSpectrogramKernel(
	fftSize: number,
	window: SpectrogramWindow,
): SpectrogramKernel {
	const key = `${fftSize}:${window}`;
	let kernel = kernels.get(key);
	if (!kernel) {
		kernel = new SpectrogramKernel(fftSize, window);
		kernels.set(key, kernel);
	}
	return kernel;
}

/**
 * How the rows of a lane read a frame's bins: a row spanning whole bins takes
 * their mean power, a row narrower than a bin interpolates between the two
 * around its middle. Row 0 is the top of the lane.
 */
interface RowMap {
	/** First bin, or the lower of the two interpolated; -1 for an empty row. */
	start: Int32Array;
	/** One past the last bin; -1 where the row interpolates. */
	end: Int32Array;
	/** How far the row's middle lies from `start` towards the next bin. */
	fraction: Float32Array;
}

function createRowMap(
	settings: SpectrogramSettings,
	sampleRate: number,
	rows: number,
	storedBins: number,
): RowMap {
	const start = new Int32Array(rows).fill(-1);
	const end = new Int32Array(rows).fill(-1);
	const fraction = new Float32Array(rows);
	const range = resolveFrequencyRange(settings, sampleRate);
	if (!range) {
		return { start, end, fraction };
	}

	const scale = settings.frequencyScale;
	const low = toFrequencyScale(scale, range.low);
	const high = toFrequencyScale(scale, range.high);
	const binHz = sampleRate / settings.fftSize;
	for (let row = 0; row < rows; row += 1) {
		const fromBottom = rows - 1 - row;
		const lowBin =
			fromFrequencyScale(scale, low + ((high - low) * fromBottom) / rows) /
			binHz;
		const highBin =
			fromFrequencyScale(
				scale,
				low + ((high - low) * (fromBottom + 1)) / rows,
			) / binHz;
		if (highBin - lowBin >= 1) {
			start[row] = Math.min(storedBins - 1, Math.round(lowBin));
			end[row] = Math.min(
				storedBins,
				Math.max(start[row] + 1, Math.round(highBin)),
			);
		} else {
			const middle = Math.min(storedBins - 1, (lowBin + highBin) / 2);
			start[row] = Math.min(storedBins - 2, Math.floor(middle));
			fraction[row] = middle - start[row];
		}
	}
	return { start, end, fraction };
}

function mapFrameToRows(
	levels: Uint8Array,
	map: RowMap,
	out: Uint8Array,
): void {
	for (let row = 0; row < out.length; row += 1) {
		const start = map.start[row];
		const end = map.end[row];
		if (start < 0) {
			out[row] = 0;
		} else if (end < 0) {
			const fraction = map.fraction[row];
			out[row] = powerToLevel(
				levelPowers[levels[start]] * (1 - fraction) +
					levelPowers[levels[start + 1]] * fraction,
			);
		} else if (end === start + 1) {
			out[row] = levels[start];
		} else {
			let power = 0;
			for (let bin = start; bin < end; bin += 1) {
				power += levelPowers[levels[bin]];
			}
			out[row] = powerToLevel(power / (end - start));
		}
	}
}

/**
 * The analysis frames of one signal, on a grid that depends on nothing a zoom
 * changes: frame `k` is centred on sample `k · hopSize`. Each is analysed
 * once, kept as levels of its bins up to the highest frequency shown, and
 * mapped onto the rows of every lane height asked for — so zooming and
 * resizing only regroup frames already analysed.
 */
export class SpectrogramFrames {
	readonly key: string;
	private readonly kernel: SpectrogramKernel;
	/** Bins kept per frame: up to the highest frequency shown, and one past. */
	private readonly storedBins: number;
	private readonly spectra = new Map<number, Uint8Array>();
	/** Frames mapped onto rows, per row count, most recently used last. */
	private readonly rowSets = new Map<
		number,
		{ map: RowMap; frames: Map<number, Uint8Array> }
	>();

	constructor(
		private readonly reader: WaveformMixReader,
		private readonly settings: SpectrogramSettings,
	) {
		this.key = SpectrogramFrames.keyFor(reader, settings);
		this.kernel = getSpectrogramKernel(settings.fftSize, settings.window);
		const range = resolveFrequencyRange(settings, reader.sampleRate);
		const half = settings.fftSize / 2;
		this.storedBins = range
			? Math.min(
					half + 1,
					Math.ceil((range.high * settings.fftSize) / reader.sampleRate) + 2,
				)
			: 2;
	}

	static keyFor(
		reader: WaveformMixReader,
		settings: SpectrogramSettings,
	): string {
		return [
			reader.key,
			reader.sampleRate,
			settings.fftSize,
			settings.window,
			settings.hopSize,
			settings.frequencyScale,
			settings.minFrequency,
			settings.maxFrequency,
		].join("#");
	}

	get hopSize(): number {
		return this.settings.hopSize;
	}

	get sampleRate(): number {
		return this.reader.sampleRate;
	}

	/**
	 * The levels of frame `frame` on `rows` rows, top row first. Null when the
	 * frame is not analysed yet and `deadline` has passed.
	 */
	frameRows(frame: number, rows: number, deadline: number): Uint8Array | null {
		let rowSet = this.rowSets.get(rows);
		if (rowSet) {
			this.rowSets.delete(rows);
		} else {
			rowSet = {
				map: createRowMap(
					this.settings,
					this.reader.sampleRate,
					rows,
					this.storedBins,
				),
				frames: new Map(),
			};
			if (this.rowSets.size >= ROW_SET_LIMIT) {
				this.rowSets.delete(this.rowSets.keys().next().value as number);
			}
		}
		this.rowSets.set(rows, rowSet);

		let mapped = rowSet.frames.get(frame);
		if (mapped) {
			return mapped;
		}
		let spectrum = this.spectra.get(frame);
		if (!spectrum) {
			if (performance.now() >= deadline) {
				return null;
			}
			spectrum = this.kernel
				.analyse(
					this.reader,
					frame * this.settings.hopSize - this.settings.fftSize / 2,
					this.storedBins,
				)
				.slice();
			this.spectra.set(frame, spectrum);
		}
		mapped = new Uint8Array(rows);
		mapFrameToRows(spectrum, rowSet.map, mapped);
		rowSet.frames.set(frame, mapped);
		return mapped;
	}
}
