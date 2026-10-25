import { waveformKernelBase64 } from "../generated/waveform-kernel";
import { clampPan } from "../shared/math";
import type {
	TrackId,
	TrackLoadedSource,
	TrackRuntime,
	TrackSwitchViewConfig,
	TrackTiming,
	WaveformSourceIndex,
	WaveformSummary,
} from "../types";
import { computeBalanceGains } from "./audio-engine";

export type TrackTimelineProjector = (
	runtime: TrackRuntime,
	trackTimelineTimeSeconds: number,
) => number;

/**
 * What a waveform lane shows: every track's channels averaged, or the left or
 * the right output of the mix, after each track's pan.
 */
export type WaveformLane = "mono" | "left" | "right";

/** Samples one entry of a summary's finest level spans. */
const SUMMARY_BASE_SAMPLES = 16;
/** Entries of a level that one entry of the next coarser level spans. */
const SUMMARY_LEVEL_FACTOR = 4;
/**
 * Samples the kernel mixes at once — a multiple of `SUMMARY_BASE_SAMPLES`, and
 * the most a single kernel call ever handles. A compact channel is scaled
 * chunk by chunk of this size.
 */
const SUMMARY_CHUNK_SAMPLES = 65536;
/**
 * Main-thread time a mix build takes right away, when it is asked for. A
 * build of a few tracks is done within it, so the view shows the exact mix
 * in the same frame.
 */
const MIX_BUILD_SYNC_MS = 16;
/** Main-thread time a mix build may take before it yields to the event loop. */
const MIX_BUILD_SLICE_MS = 8;
/** Built mixes kept around, so switching back to a recent selection is instant. */
const MIX_CACHE_LIMIT = 6;

export interface WaveformRange {
	min: number;
	max: number;
}

/** The compiled waveform-kernel.wat, over views of its memory regions. */
interface WaveformKernel {
	clear(count: number): void;
	accumulate(offset: number, count: number, gain: number): void;
	accumulate16(offset: number, count: number, gain: number): void;
	reduce(count: number): void;
	compact(count: number): number;
	coarsen(count: number, source: number, target: number): void;
	/** Where a chunk is mixed. */
	accumulator: Float32Array;
	/** Where a channel is copied before it is added to the accumulator. */
	input: Float32Array;
	/** The min/max pairs `reduce` writes. */
	pairs: Float32Array;
	pairsByte: number;
	/** The 16-bit samples `accumulate16` reads and `compact` writes. */
	input16: Int16Array;
	/**
	 * A chunk's coarser levels, each one where `coarsen` writes it from the
	 * one before: as many as it takes to reach a single entry.
	 */
	chunkLevels: Float32Array[];
	chunkLevelBytes: number[];
}

let kernel: WaveformKernel | null = null;

/**
 * The kernel, compiled on first use. It is a few hundred bytes, well within
 * what browsers compile synchronously on the main thread. Every caller mixes,
 * reduces and copies out a chunk without yielding in between, so all of them
 * share one instance.
 */
function getKernel(): WaveformKernel {
	if (kernel) {
		return kernel;
	}

	const bytes = Uint8Array.from(atob(waveformKernelBase64), (character) =>
		character.charCodeAt(0),
	);
	const exports = new WebAssembly.Instance(new WebAssembly.Module(bytes))
		.exports as unknown as {
		memory: WebAssembly.Memory;
		setup(chunk: number): void;
		clear(count: number): void;
		accumulate(offset: number, count: number, gain: number): void;
		accumulate16(offset: number, count: number, gain: number): void;
		reduce(count: number): void;
		compact(count: number): number;
		coarsen(count: number, source: number, target: number): void;
	};
	const chunk = SUMMARY_CHUNK_SAMPLES;
	const pairsByte = chunk * 8;
	const entryCount = chunk / SUMMARY_BASE_SAMPLES;
	const input16Byte = pairsByte + entryCount * 8;
	const chunkLevelBytes: number[] = [];
	const chunkLevelEntries: number[] = [];
	let levelByte = input16Byte + chunk * 2;
	for (
		let entries = entryCount / SUMMARY_LEVEL_FACTOR;
		entries >= 1;
		entries /= SUMMARY_LEVEL_FACTOR
	) {
		chunkLevelBytes.push(levelByte);
		chunkLevelEntries.push(entries);
		levelByte += entries * 8;
	}
	const pageBytes = 65536;
	exports.memory.grow(
		Math.ceil(levelByte / pageBytes) -
			exports.memory.buffer.byteLength / pageBytes,
	);
	exports.setup(chunk);
	const memory = exports.memory.buffer;
	kernel = {
		clear: exports.clear,
		accumulate: exports.accumulate,
		accumulate16: exports.accumulate16,
		reduce: exports.reduce,
		compact: exports.compact,
		coarsen: exports.coarsen,
		accumulator: new Float32Array(memory, 0, chunk),
		input: new Float32Array(memory, chunk * 4, chunk),
		pairs: new Float32Array(memory, pairsByte, entryCount * 2),
		pairsByte,
		input16: new Int16Array(memory, input16Byte, chunk),
		chunkLevels: chunkLevelBytes.map(
			(byte, index) =>
				new Float32Array(memory, byte, chunkLevelEntries[index] * 2),
		),
		chunkLevelBytes,
	};
	return kernel;
}

/** Where a contribution's samples come from. */
interface WaveformSource {
	/**
	 * Adds `gain` times `count` samples from sample `start` on to the kernel's
	 * accumulator from sample `offset` on.
	 */
	addTo(
		waveformKernel: WaveformKernel,
		start: number,
		offset: number,
		count: number,
		gain: number,
	): void;
}

/**
 * One channel of a decoded buffer, fetched on every read: starting playback
 * acquires a buffer's contents, which detaches the arrays `getChannelData`
 * handed out before.
 */
class BufferChannelSource implements WaveformSource {
	constructor(
		private readonly buffer: AudioBuffer,
		private readonly channel: number,
	) {}

	addTo(
		waveformKernel: WaveformKernel,
		start: number,
		offset: number,
		count: number,
		gain: number,
	): void {
		const channel = this.buffer.getChannelData(this.channel);
		waveformKernel.input.set(channel.subarray(start, start + count));
		waveformKernel.accumulate(offset, count, gain);
	}
}

/**
 * A channel kept at 16 bits — half the samples' size, which is what mixes
 * read, so rebuilding one reads half as much. Each chunk of
 * `SUMMARY_CHUNK_SAMPLES` is scaled to its own loudest sample, which keeps
 * quiet passages as precise as loud ones.
 */
interface CompactChannel {
	data: Int16Array;
	/** The factor that takes a chunk's 16-bit samples back to their values. */
	scales: Float32Array;
}

class CompactSource implements WaveformSource {
	constructor(private readonly channel: CompactChannel) {}

	addTo(
		waveformKernel: WaveformKernel,
		start: number,
		offset: number,
		count: number,
		gain: number,
	): void {
		for (let done = 0; done < count; ) {
			const sample = start + done;
			const chunk = Math.floor(sample / SUMMARY_CHUNK_SAMPLES);
			const length = Math.min(
				count - done,
				(chunk + 1) * SUMMARY_CHUNK_SAMPLES - sample,
			);
			waveformKernel.input16.set(
				this.channel.data.subarray(sample, sample + length),
			);
			waveformKernel.accumulate16(
				offset + done,
				length,
				gain * this.channel.scales[chunk],
			);
			done += length;
		}
	}
}

/**
 * One source's share of a signal: signal sample `i` receives
 * `gain * source[i + offset]` wherever `i + offset` lies within
 * [`start`, `end`), and nothing elsewhere.
 */
interface WaveformContribution {
	source: WaveformSource;
	gain: number;
	offset: number;
	start: number;
	end: number;
}

/**
 * Mixes `count` samples of the signal from sample `start` on — at most
 * `SUMMARY_CHUNK_SAMPLES` — into the kernel's accumulator.
 */
function mixChunk(
	waveformKernel: WaveformKernel,
	contributions: WaveformContribution[],
	start: number,
	count: number,
): void {
	waveformKernel.clear(count);
	for (const contribution of contributions) {
		const base = start + contribution.offset;
		const from = Math.max(0, contribution.start - base);
		const to = Math.min(count, contribution.end - base);
		if (to > from) {
			contribution.source.addTo(
				waveformKernel,
				base + from,
				from,
				to - from,
				contribution.gain,
			);
		}
	}
}

/** Fills `out[0, count)` with the signal from sample `start` on. */
function readContributions(
	contributions: WaveformContribution[],
	start: number,
	out: Float32Array,
	count: number,
): void {
	const waveformKernel = getKernel();
	for (let done = 0; done < count; done += SUMMARY_CHUNK_SAMPLES) {
		const chunk = Math.min(SUMMARY_CHUNK_SAMPLES, count - done);
		mixChunk(waveformKernel, contributions, start + done, chunk);
		out.set(waveformKernel.accumulator.subarray(0, chunk), done);
	}
}

function createCompactChannel(length: number): CompactChannel {
	return {
		data: new Int16Array(length),
		scales: new Float32Array(Math.ceil(length / SUMMARY_CHUNK_SAMPLES)),
	};
}

/** Stores the accumulator's first `count` samples as the chunk at `start`. */
function storeCompactChunk(
	waveformKernel: WaveformKernel,
	compact: CompactChannel,
	start: number,
	count: number,
): void {
	compact.scales[start / SUMMARY_CHUNK_SAMPLES] =
		waveformKernel.compact(count) / 32767;
	compact.data.set(waveformKernel.input16.subarray(0, count), start);
}

/** A compact copy of one channel of `buffer`, or of the average of all. */
function compactBuffer(
	buffer: AudioBuffer,
	channel: number | "average",
): CompactChannel {
	const waveformKernel = getKernel();
	const compact = createCompactChannel(buffer.length);
	const contributions =
		channel === "average"
			? averageContributions(buffer)
			: [
					{
						source: new BufferChannelSource(buffer, channel),
						gain: 1,
						offset: 0,
						start: 0,
						end: buffer.length,
					},
				];
	for (let start = 0; start < buffer.length; start += SUMMARY_CHUNK_SAMPLES) {
		const count = Math.min(SUMMARY_CHUNK_SAMPLES, buffer.length - start);
		mixChunk(waveformKernel, contributions, start, count);
		storeCompactChunk(waveformKernel, compact, start, count);
	}
	return compact;
}

/** The average of a buffer's channels, read straight from the buffer. */
function averageContributions(
	buffer: AudioBuffer,
	span: { offset: number; start: number; end: number } = {
		offset: 0,
		start: 0,
		end: buffer.length,
	},
): WaveformContribution[] {
	const gain = 1 / buffer.numberOfChannels;
	return Array.from({ length: buffer.numberOfChannels }, (_value, channel) => ({
		source: new BufferChannelSource(buffer, channel),
		gain,
		offset: span.offset,
		start: span.start,
		end: span.end,
	}));
}

/** Writes one entry of `coarse` for every `SUMMARY_LEVEL_FACTOR` of `level`. */
function coarsenSummaryLevel(level: Float32Array, coarse: Float32Array): void {
	const entryCount = level.length / 2;
	for (let entry = 0; entry < entryCount; entry += SUMMARY_LEVEL_FACTOR) {
		const end = Math.min(entryCount, entry + SUMMARY_LEVEL_FACTOR);
		let min = level[entry * 2];
		let max = level[entry * 2 + 1];
		for (let child = entry + 1; child < end; child += 1) {
			if (level[child * 2] < min) {
				min = level[child * 2];
			}
			if (level[child * 2 + 1] > max) {
				max = level[child * 2 + 1];
			}
		}
		const target = (entry / SUMMARY_LEVEL_FACTOR) * 2;
		coarse[target] = min;
		coarse[target + 1] = max;
	}
}

/**
 * Summarizes `sampleCount` samples of a signal, yielding after every chunk so
 * a caller can spread the work over several turns of the event loop. Given
 * `compact`, it also keeps the signal there.
 */
function* summarize(
	sampleRate: number,
	sampleCount: number,
	contributions: WaveformContribution[],
	compact?: CompactChannel,
): Generator<void, WaveformSummary, void> {
	const levels: Float32Array[] = [];
	for (
		let entries = Math.ceil(sampleCount / SUMMARY_BASE_SAMPLES);
		;
		entries = Math.ceil(entries / SUMMARY_LEVEL_FACTOR)
	) {
		levels.push(new Float32Array(entries * 2));
		if (entries <= 1) {
			break;
		}
	}
	const waveformKernel = getKernel();
	// A chunk spans whole entries of every level the kernel coarsens it to;
	// only the levels above those are left for the end.
	const chunkLevelCount = Math.min(
		levels.length - 1,
		waveformKernel.chunkLevels.length,
	);
	for (let start = 0; start < sampleCount; start += SUMMARY_CHUNK_SAMPLES) {
		const count = Math.min(SUMMARY_CHUNK_SAMPLES, sampleCount - start);
		mixChunk(waveformKernel, contributions, start, count);
		waveformKernel.reduce(count);
		let entries = Math.ceil(count / SUMMARY_BASE_SAMPLES);
		let firstEntry = start / SUMMARY_BASE_SAMPLES;
		levels[0].set(
			waveformKernel.pairs.subarray(0, entries * 2),
			firstEntry * 2,
		);
		let source = waveformKernel.pairsByte;
		for (let level = 1; level <= chunkLevelCount; level += 1) {
			const target = waveformKernel.chunkLevelBytes[level - 1];
			waveformKernel.coarsen(entries, source, target);
			entries = Math.ceil(entries / SUMMARY_LEVEL_FACTOR);
			firstEntry /= SUMMARY_LEVEL_FACTOR;
			levels[level].set(
				waveformKernel.chunkLevels[level - 1].subarray(0, entries * 2),
				firstEntry * 2,
			);
			source = target;
		}
		if (compact) {
			storeCompactChunk(waveformKernel, compact, start, count);
		}
		yield;
	}

	for (let level = chunkLevelCount + 1; level < levels.length; level += 1) {
		coarsenSummaryLevel(levels[level - 1], levels[level]);
	}
	const top = levels[levels.length - 1];
	return {
		sampleRate,
		sampleCount,
		levels,
		peak: top.length > 0 ? Math.max(-top[0], top[1]) : 0,
	};
}

/**
 * Writes the envelope of samples [`start`, `end`) to `out`, exact up to the
 * finest level's entry at either edge. False when the range holds no sample.
 */
function querySummary(
	summary: WaveformSummary,
	start: number,
	end: number,
	out: WaveformRange,
): boolean {
	let low = Math.max(0, Math.floor(start / SUMMARY_BASE_SAMPLES));
	let high = Math.min(
		summary.levels[0].length / 2,
		Math.ceil(end / SUMMARY_BASE_SAMPLES),
	);
	if (high <= low) {
		return false;
	}

	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	const take = (level: Float32Array, entry: number): void => {
		if (level[entry * 2] < min) {
			min = level[entry * 2];
		}
		if (level[entry * 2 + 1] > max) {
			max = level[entry * 2 + 1];
		}
	};
	// Entries that do not fill a whole entry of the next level are read here;
	// the aligned rest is handed up a level, where it costs a quarter as much.
	for (let levelIndex = 0; low < high; levelIndex += 1) {
		const level = summary.levels[levelIndex];
		if (levelIndex === summary.levels.length - 1) {
			for (let entry = low; entry < high; entry += 1) {
				take(level, entry);
			}
			break;
		}
		while (low < high && low % SUMMARY_LEVEL_FACTOR !== 0) {
			take(level, low);
			low += 1;
		}
		while (high > low && high % SUMMARY_LEVEL_FACTOR !== 0) {
			high -= 1;
			take(level, high);
		}
		low /= SUMMARY_LEVEL_FACTOR;
		high /= SUMMARY_LEVEL_FACTOR;
	}

	out.min = min;
	out.max = max;
	return true;
}

/** A mono signal on a timeline, sampled at `sampleRate`. */
export interface WaveformSignal {
	/** Tells signals apart in a view's redraw bookkeeping. */
	readonly id: number;
	readonly sampleRate: number;
	/** The largest absolute sample value. */
	readonly peak: number;
	/**
	 * Writes the range samples [`start`, `end`) cover to `out`. False when none
	 * of them holds audio.
	 */
	envelope(start: number, end: number, out: WaveformRange): boolean;
	/** Fills `out[0, count)` with the samples from `start` on. */
	read(start: number, out: Float32Array, count: number): void;
}

/**
 * A signal that is only ever read sample by sample, so it needs no summary:
 * what a spectrogram analyses.
 */
export interface WaveformMixReader {
	/** Equal for two readers exactly when they read the same samples. */
	readonly key: string;
	readonly sampleRate: number;
	/** Fills `out[0, count)` with the samples from `start` on. */
	read(start: number, out: Float32Array, count: number): void;
}

let nextSignalId = 0;

/**
 * A signal with its summary: one track's channels averaged, or a mix of
 * several tracks' channels at their gains. A view reads its envelope from the
 * summary when one screen pixel spans many samples, and the samples
 * themselves when it spans few.
 */
class SummarySignal implements WaveformSignal {
	readonly id = nextSignalId++;

	constructor(
		readonly key: string,
		readonly sampleRate: number,
		/** The signal samples that hold audio; everything outside is silent. */
		readonly start: number,
		readonly end: number,
		readonly peak: number,
		private readonly summary: WaveformSummary,
		/** The summary sample signal sample 0 corresponds to. */
		private readonly summaryOffset: number,
		private readonly contributions: WaveformContribution[],
	) {}

	/** See `querySummary`; samples outside the audio are left out. */
	envelope(start: number, end: number, out: WaveformRange): boolean {
		const from = Math.max(start, this.start);
		const to = Math.min(end, this.end);
		return (
			to > from &&
			querySummary(
				this.summary,
				from + this.summaryOffset,
				to + this.summaryOffset,
				out,
			)
		);
	}

	read(start: number, out: Float32Array, count: number): void {
		readContributions(this.contributions, start, out, count);
	}
}

interface MixJob {
	key: string;
	build: Generator<void, WaveformSummary, void>;
	finish(summary: WaveformSummary): WaveformSignal;
	/** Whether any of the mix has been summarized yet. */
	started: boolean;
	/** The requesters this mix is handed to once built. */
	subscribers: Set<object>;
}

/** What one requester waits for. */
interface MixRequest {
	/** The mix it asked for last. */
	wanted: MixJob | null;
	/**
	 * A mix it asked for before, kept building once begun. It stands in until
	 * `wanted` is built, so a stream of changes too quick for the builds — a
	 * dragged volume slider over many long tracks — still shows its steps
	 * instead of restarting the build on every one.
	 */
	standIn: MixJob | null;
	onReady: () => void;
}

/** Tells buffers apart in mix keys. */
const bufferIds = new WeakMap<AudioBuffer, number>();
let nextBufferId = 0;

function getBufferId(buffer: AudioBuffer): number {
	let id = bufferIds.get(buffer);
	if (id === undefined) {
		id = nextBufferId;
		nextBufferId += 1;
		bufferIds.set(buffer, id);
	}
	return id;
}

/** Tells summaries apart in signal keys. */
const summaryIds = new WeakMap<WaveformSummary, number>();
let nextSummaryId = 0;

function getSummaryId(summary: WaveformSummary): number {
	let id = summaryIds.get(summary);
	if (id === undefined) {
		id = nextSummaryId;
		nextSummaryId += 1;
		summaryIds.set(summary, id);
	}
	return id;
}

/**
 * Where a track's audio lies, in samples: `offset` takes a sample of the
 * track's timeline to its buffer, and [`start`, `end`) is the part of the
 * buffer the timing plays.
 */
function resolveTrackSampleSpan(
	buffer: AudioBuffer,
	timing: TrackTiming,
): { offset: number; start: number; end: number } {
	const rate = buffer.sampleRate;
	const start = Math.max(0, Math.round(timing.trimStart * rate));
	return {
		offset: Math.round((timing.trimStart - timing.padStart) * rate),
		start,
		end: Math.min(
			buffer.length,
			Math.round((timing.trimStart + timing.audioDuration) * rate),
		),
	};
}

/**
 * How much of each of a stereo track's two channels reaches the left and the
 * right output, the way its panning graph routes them; see
 * `AudioEngine.configurePanningGraph`. A stereo waveform only ever shows
 * two-channel audio.
 */
function resolvePanMatrix(runtime: TrackRuntime): {
	left: number[];
	right: number[];
} {
	const pan = clampPan(runtime.state.pan);
	if (runtime.panAlgorithm === "balance") {
		const { gainL, gainR } = computeBalanceGains(pan);
		return { left: [gainL, 0], right: [0, gainR] };
	}

	// StereoPannerNode's equal-power law.
	if (pan <= 0) {
		const angle = (pan + 1) * (Math.PI / 2);
		return { left: [1, Math.cos(angle)], right: [0, Math.sin(angle)] };
	}
	const angle = pan * (Math.PI / 2);
	return { left: [Math.cos(angle), 0], right: [Math.sin(angle), 1] };
}

/** A mix a lane shows, described before it is built. */
interface MixDescription {
	key: string;
	sampleRate: number;
	sampleCount: number;
	contributions: WaveformContribution[];
}

export class WaveformEngine {
	private readonly trackSignals = new WeakMap<WaveformSummary, SummarySignal>();
	/** The average of each buffer's channels, compacted. */
	private readonly compactAverages = new WeakMap<AudioBuffer, CompactChannel>();
	/** Each buffer's channels, compacted once a stereo lane needs them. */
	private readonly compactChannels = new WeakMap<
		AudioBuffer,
		CompactChannel[]
	>();
	/** Built mixes by key, least recently used first. */
	private readonly mixes = new Map<string, WaveformSignal>();
	/** Mixes being built, oldest first, which is the order they are built in. */
	private readonly mixJobs = new Map<string, MixJob>();
	private readonly mixRequests = new WeakMap<object, MixRequest>();
	/** The signal each requester was last handed. */
	private readonly deliveredSignals = new WeakMap<object, WaveformSignal>();
	/** Yields between build slices without the delay nested timeouts get. */
	private readonly mixJobChannel = new MessageChannel();
	private mixJobScheduled = false;

	constructor() {
		this.mixJobChannel.port1.onmessage = () => {
			this.mixJobScheduled = false;
			this.runMixJobs(MIX_BUILD_SLICE_MS);
		};
	}

	/**
	 * Summarizes the average of a buffer's channels, and keeps it compacted for
	 * the mixes it will be part of.
	 */
	createSummary(buffer: AudioBuffer): WaveformSummary {
		const compact = createCompactChannel(buffer.length);
		const build = summarize(
			buffer.sampleRate,
			buffer.length,
			averageContributions(buffer),
			compact,
		);
		for (;;) {
			const step = build.next();
			if (step.done) {
				this.compactAverages.set(buffer, compact);
				return step.value;
			}
		}
	}

	/**
	 * Summarizes the audio of every track some waveform among `views` can
	 * show, and drops what was kept for the rest: a summary and the compact
	 * copy beside it take a fair share of the decoded audio's memory again. A
	 * track only a spectrogram shows keeps its compact copies, which its mixes
	 * read, but needs no summary.
	 */
	prepareShownTracks(
		runtimes: TrackRuntime[],
		views: TrackSwitchViewConfig[],
	): void {
		const summarized = collectShownTracks(views, "waveform");
		const analysed = collectShownTracks(views, "spectrogram");

		runtimes.forEach((runtime) => {
			const id = runtime.definition.id;
			const summarize = summarized === "all" || summarized.has(id);
			const keep = summarize || analysed === "all" || analysed.has(id);
			const sources: Array<TrackLoadedSource | null> = [
				runtime.baseSource,
				runtime.syncedSource,
			];
			sources.forEach((source) => {
				if (!source?.buffer) {
					return;
				}
				if (summarize) {
					if (!source.waveformSummary) {
						source.waveformSummary = this.createSummary(source.buffer);
					}
				} else {
					source.waveformSummary = null;
				}
				if (!keep) {
					this.compactAverages.delete(source.buffer);
					this.compactChannels.delete(source.buffer);
				}
			});
			const activeSource =
				runtime.activeVariant === "synced"
					? runtime.syncedSource
					: runtime.baseSource;
			runtime.waveformSummary = activeSource?.waveformSummary ?? null;
		});
	}

	/**
	 * One track's channels averaged, on its own timeline, which starts
	 * `padStart` before the audio does.
	 */
	getTrackSignal(runtime: TrackRuntime): WaveformSignal | null {
		const { buffer, timing, waveformSummary: summary } = runtime;
		if (!buffer || !timing || !summary) {
			return null;
		}

		const span = resolveTrackSampleSpan(buffer, timing);
		const key = [getSummaryId(summary), span.offset, span.start, span.end].join(
			":",
		);
		const cached = this.trackSignals.get(summary);
		if (cached?.key === key) {
			return cached;
		}

		const range: WaveformRange = { min: 0, max: 0 };
		const peak = querySummary(summary, span.start, span.end, range)
			? Math.max(-range.min, range.max)
			: 0;
		const signal = new SummarySignal(
			key,
			buffer.sampleRate,
			span.start - span.offset,
			span.end - span.offset,
			peak,
			summary,
			span.offset,
			averageContributions(buffer, span),
		);
		this.trackSignals.set(summary, signal);
		return signal;
	}

	/**
	 * What `runtimes` sound like together in `lane`, on a shared timeline of
	 * `duration` seconds: one track's own channels averaged, or the exact mix
	 * of several, or of a track's panned channels, at their volumes — null with
	 * nothing to show. A mix is built right away as far as `MIX_BUILD_SYNC_MS`
	 * allows and in the background after that; until it is built, the
	 * requester keeps the signal it was last handed, and `onReady` fires
	 * whenever it is handed a newer one — see `MixRequest`. A mix nobody waits
	 * for any more is abandoned.
	 */
	getSignal(
		requester: object,
		runtimes: TrackRuntime[],
		duration: number,
		lane: WaveformLane,
		onReady: () => void,
	): WaveformSignal | null {
		const signal = this.resolveSignal(
			requester,
			runtimes,
			duration,
			lane,
			onReady,
		);
		if (signal) {
			this.deliveredSignals.set(requester, signal);
			return signal;
		}
		return this.mixRequests.get(requester)?.wanted
			? (this.deliveredSignals.get(requester) ?? null)
			: null;
	}

	/**
	 * What `runtimes` sound like together in `lane`, on a shared timeline of
	 * `duration` seconds, as `getSignal` describes it — but read sample by
	 * sample, without a summary, so it is ready right away. Null with nothing
	 * to read.
	 */
	getMixReader(
		runtimes: TrackRuntime[],
		duration: number,
		lane: WaveformLane,
	): WaveformMixReader | null {
		const sources = runtimes.filter(
			(runtime) => runtime.buffer && runtime.timing,
		);
		if (sources.length === 0) {
			return null;
		}

		if (lane === "mono" && sources.length === 1) {
			const buffer = sources[0].buffer as AudioBuffer;
			const span = resolveTrackSampleSpan(
				buffer,
				sources[0].timing as TrackTiming,
			);
			const contributions = averageContributions(buffer, span);
			return {
				key: [
					"track",
					getBufferId(buffer),
					span.offset,
					span.start,
					span.end,
				].join(":"),
				sampleRate: buffer.sampleRate,
				read: (start, out, count) =>
					readContributions(contributions, start, out, count),
			};
		}

		const mix = this.describeMix(sources, duration, lane);
		return {
			key: mix.key,
			sampleRate: mix.sampleRate,
			read: (start, out, count) =>
				readContributions(mix.contributions, start, out, count),
		};
	}

	private resolveSignal(
		requester: object,
		runtimes: TrackRuntime[],
		duration: number,
		lane: WaveformLane,
		onReady: () => void,
	): WaveformSignal | null {
		const sources = runtimes.filter(
			(runtime) => runtime.buffer && runtime.timing && runtime.waveformSummary,
		);
		if (sources.length === 0 || (lane === "mono" && sources.length === 1)) {
			this.cancelMixRequest(requester);
			return sources.length === 1 ? this.getTrackSignal(sources[0]) : null;
		}

		const mix = this.describeMix(sources, duration, lane);
		const cached = this.mixes.get(mix.key);
		if (cached) {
			this.cancelMixRequest(requester);
			this.mixes.delete(mix.key);
			this.mixes.set(mix.key, cached);
			return cached;
		}

		let request = this.mixRequests.get(requester);
		if (!request) {
			request = { wanted: null, standIn: null, onReady };
			this.mixRequests.set(requester, request);
		}
		request.onReady = onReady;
		if (request.wanted?.key !== mix.key) {
			if (request.wanted?.started) {
				this.leaveMixJob(request.standIn, requester);
				request.standIn = request.wanted;
			} else {
				this.leaveMixJob(request.wanted, requester);
			}

			let job = this.mixJobs.get(mix.key);
			if (!job) {
				job = {
					key: mix.key,
					build: summarize(mix.sampleRate, mix.sampleCount, mix.contributions),
					finish: (summary) =>
						new SummarySignal(
							mix.key,
							mix.sampleRate,
							0,
							mix.sampleCount,
							summary.peak,
							summary,
							0,
							mix.contributions,
						),
					started: false,
					subscribers: new Set(),
				};
				this.mixJobs.set(mix.key, job);
			}
			if (request.standIn === job) {
				request.standIn = null;
			}
			job.subscribers.add(requester);
			request.wanted = job;
		}

		this.runMixJobs(MIX_BUILD_SYNC_MS);
		return this.mixes.get(mix.key) ?? null;
	}

	/**
	 * The contributions of every track's channels to `lane`. Every buffer is
	 * decoded at the AudioContext's rate, so a sample of the shared timeline
	 * is a sample of each track. A lane is scaled to its own peak, so only the
	 * gains relative to the loudest matter, and they are rounded so a mix is
	 * rebuilt only for a change that shows.
	 */
	private describeMix(
		sources: TrackRuntime[],
		duration: number,
		lane: WaveformLane,
	): MixDescription {
		const sampleRate = (sources[0].buffer as AudioBuffer).sampleRate;
		const sampleCount = Math.ceil(duration * sampleRate);
		const parts = sources.map((runtime) => {
			const buffer = runtime.buffer as AudioBuffer;
			const volume = runtime.state.volume * runtime.loudnessGain;
			let channels: Array<{ compact: CompactChannel; gain: number }>;
			if (lane === "mono") {
				channels = [{ compact: this.getCompactAverage(buffer), gain: volume }];
			} else {
				const compacts = this.getCompactChannels(buffer);
				const matrix = resolvePanMatrix(runtime);
				const row = lane === "left" ? matrix.left : matrix.right;
				channels = row.map((coefficient, channel) => ({
					compact: compacts[channel],
					gain: volume * coefficient,
				}));
			}
			return {
				bufferId: getBufferId(buffer),
				span: resolveTrackSampleSpan(buffer, runtime.timing as TrackTiming),
				channels,
			};
		});

		let loudest = 0;
		parts.forEach((part) => {
			part.channels.forEach((channel) => {
				loudest = Math.max(loudest, Math.abs(channel.gain));
			});
		});
		const contributions: WaveformContribution[] = [];
		const keys: string[] = [lane, String(sampleCount)];
		parts.forEach((part) => {
			const gains = part.channels.map(
				(channel) =>
					Math.round((channel.gain / (loudest > 0 ? loudest : 1)) * 1000) /
					1000,
			);
			keys.push(
				[
					part.bufferId,
					part.span.offset,
					part.span.start,
					part.span.end,
					...gains,
				].join(":"),
			);
			part.channels.forEach((channel, index) => {
				if (gains[index] !== 0) {
					contributions.push({
						source: new CompactSource(channel.compact),
						gain: gains[index],
						offset: part.span.offset,
						start: part.span.start,
						end: part.span.end,
					});
				}
			});
		});
		return {
			key: keys.join("|"),
			sampleRate,
			sampleCount,
			contributions,
		};
	}

	private getCompactAverage(buffer: AudioBuffer): CompactChannel {
		let compact = this.compactAverages.get(buffer);
		if (!compact) {
			compact = compactBuffer(buffer, "average");
			this.compactAverages.set(buffer, compact);
		}
		return compact;
	}

	/** A two-channel buffer's channels, compacted. */
	private getCompactChannels(buffer: AudioBuffer): CompactChannel[] {
		let compacts = this.compactChannels.get(buffer);
		if (!compacts) {
			compacts = [0, 1].map((channel) => compactBuffer(buffer, channel));
			this.compactChannels.set(buffer, compacts);
		}
		return compacts;
	}

	private leaveMixJob(job: MixJob | null, requester: object): void {
		if (!job) {
			return;
		}

		job.subscribers.delete(requester);
		if (job.subscribers.size === 0) {
			this.mixJobs.delete(job.key);
		}
	}

	private cancelMixRequest(requester: object): void {
		const request = this.mixRequests.get(requester);
		if (!request) {
			return;
		}

		this.mixRequests.delete(requester);
		this.leaveMixJob(request.wanted, requester);
		this.leaveMixJob(request.standIn, requester);
	}

	private scheduleMixJobs(): void {
		if (this.mixJobScheduled || this.mixJobs.size === 0) {
			return;
		}

		this.mixJobScheduled = true;
		this.mixJobChannel.port2.postMessage(null);
	}

	/** Builds mixes, oldest first, for up to `budgetMs`. */
	private runMixJobs(budgetMs: number): void {
		const sliceEnd = performance.now() + budgetMs;
		for (const job of this.mixJobs.values()) {
			job.started = true;
			let step = job.build.next();
			while (!step.done && performance.now() < sliceEnd) {
				step = job.build.next();
			}
			if (!step.done) {
				break;
			}

			this.mixJobs.delete(job.key);
			const signal = job.finish(step.value);
			this.mixes.set(job.key, signal);
			while (this.mixes.size > MIX_CACHE_LIMIT) {
				this.mixes.delete(this.mixes.keys().next().value as string);
			}
			job.subscribers.forEach((requester) => {
				const request = this.mixRequests.get(requester);
				if (!request) {
					return;
				}
				if (request.wanted === job) {
					// What a stand-in would show is older still.
					this.leaveMixJob(request.standIn, requester);
					this.mixRequests.delete(requester);
				} else {
					request.standIn = null;
				}
				this.deliveredSignals.set(requester, signal);
				request.onReady();
			});
			if (performance.now() >= sliceEnd) {
				break;
			}
		}

		this.scheduleMixJobs();
	}
}

/**
 * The tracks the views of `type` among `views` can show: every one when some
 * view follows whichever is audible.
 */
function collectShownTracks(
	views: TrackSwitchViewConfig[],
	type: "waveform" | "spectrogram",
): Set<TrackId> | "all" {
	const shownIds = new Set<TrackId>();
	for (const view of views) {
		if (view.type !== type) {
			continue;
		}
		if (view.tracks === undefined || view.tracks === "audible") {
			return "all";
		}
		view.tracks.forEach((id) => {
			shownIds.add(id);
		});
	}
	return shownIds;
}

function resolveFixedWaveformTrackIndex(
	runtimesLength: number,
	waveformSource: WaveformSourceIndex,
): number | null {
	if (waveformSource === "audible" || Array.isArray(waveformSource)) {
		return null;
	}

	return waveformSource >= 0 && waveformSource < runtimesLength
		? waveformSource
		: null;
}

export function resolveWaveformTrackIndices(
	runtimesLength: number,
	waveformSource: WaveformSourceIndex,
): number[] {
	if (waveformSource === "audible") {
		return Array.from({ length: runtimesLength }, (_value, index) => index);
	}

	if (Array.isArray(waveformSource)) {
		return waveformSource.filter(
			(trackIndex) => trackIndex >= 0 && trackIndex < runtimesLength,
		);
	}

	return waveformSource >= 0 && waveformSource < runtimesLength
		? [waveformSource]
		: [];
}

/**
 * `isExclusiveSoloTrack` answers, per track, whether its `trackList` permits only
 * one audible track — such a track still counts as audible while nothing at all is
 * soloed, because that list always resolves to one of its rows.
 */
export function isWaveformTrackAudible(
	runtimes: TrackRuntime[],
	trackIndex: number,
	waveformSource: WaveformSourceIndex,
	isAlignmentMode: boolean,
	isExclusiveSoloTrack: (trackIndex: number) => boolean,
): boolean {
	const runtime = runtimes[trackIndex];
	if (!runtime || runtime.state.volume <= 0) {
		return false;
	}

	if (isAlignmentMode) {
		// Fixed/array sources always show their bound track(s) regardless of solo
		// (e.g. two side-by-side comparison waveforms). Only the dynamic "audible"
		// source follows solo.
		return waveformSource === "audible" ? runtime.state.solo : true;
	}

	const anySolo = runtimes.some((entry) => entry.state.solo);
	if (anySolo) {
		return runtime.state.solo;
	}

	return isExclusiveSoloTrack(trackIndex);
}

/**
 * The single track index a surface's "audible" source currently resolves to —
 * used to bind peak rendering, seeking, marker projection, and playhead
 * position to that track's own local timeline instead of the flat,
 * projector-warped reference timeline. A fixed source always resolves to its
 * own index. An "audible" source resolves to the first soloed track — under
 * alignment everything audible at once lives on that track's timeline.
 */
export function resolveAudibleWaveformTrackIndex(
	runtimes: TrackRuntime[],
	waveformSource: WaveformSourceIndex,
	isAlignmentMode: boolean,
	isExclusiveSoloTrack: (trackIndex: number) => boolean,
): number | null {
	const fixedTrackIndex = resolveFixedWaveformTrackIndex(
		runtimes.length,
		waveformSource,
	);
	if (fixedTrackIndex !== null) {
		return fixedTrackIndex;
	}
	if (waveformSource !== "audible") {
		return null;
	}

	const audibleIndex = resolveWaveformTrackIndices(
		runtimes.length,
		waveformSource,
	).find((trackIndex) =>
		isWaveformTrackAudible(
			runtimes,
			trackIndex,
			waveformSource,
			isAlignmentMode,
			isExclusiveSoloTrack,
		),
	);
	return audibleIndex ?? null;
}
