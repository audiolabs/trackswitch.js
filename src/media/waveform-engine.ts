import type {
	TrackRuntime,
	TrackTiming,
	WaveformSourceIndex,
	WaveformSummary,
	WaveformSummaryLevel,
} from "../types";

export type TrackTimelineProjector = (
	runtime: TrackRuntime,
	trackTimelineTimeSeconds: number,
) => number;

const SUMMARY_WINDOW_SAMPLES = 256;

export interface WaveformPeakBuckets {
	mins: Float32Array;
	maxes: Float32Array;
}

export class WaveformEngine {
	createSummary(buffer: AudioBuffer): WaveformSummary {
		const sampleRate = WaveformEngine.resolveSampleRate(buffer);
		const sampleCount = buffer.length;
		const duration =
			Number.isFinite(buffer.duration) && buffer.duration > 0
				? buffer.duration
				: sampleCount / sampleRate;
		const levels: WaveformSummaryLevel[] = [];

		if (sampleCount <= 0) {
			return {
				duration: Math.max(0, duration),
				sampleRate,
				sampleCount: 0,
				levels: [
					{
						samplesPerEntry: SUMMARY_WINDOW_SAMPLES,
						mins: new Float32Array(0),
						maxes: new Float32Array(0),
					},
				],
			};
		}

		levels.push(this.createBaseSummaryLevel(buffer));
		while (levels[levels.length - 1].mins.length > 1) {
			levels.push(this.createCoarserSummaryLevel(levels[levels.length - 1]));
		}

		return {
			duration,
			sampleRate,
			sampleCount,
			levels,
		};
	}

	getTrackPeaks(
		runtime: TrackRuntime,
		peakCount: number,
		startSeconds = 0,
		durationSeconds?: number,
	): Float32Array | null {
		if (!runtime.waveformSummary) {
			return null;
		}

		const buckets = this.querySummary(
			runtime.waveformSummary,
			peakCount,
			startSeconds,
			durationSeconds,
		);
		const peaks = new Float32Array(buckets.maxes.length);
		for (let index = 0; index < peaks.length; index += 1) {
			peaks[index] = Math.max(
				Math.abs(buckets.mins[index]),
				Math.abs(buckets.maxes[index]),
			);
		}

		return peaks;
	}

	calculateMixedWaveform(
		runtimes: TrackRuntime[],
		peakCount: number,
		_barWidth: number,
		timelineDuration?: number,
		trackTimelineProjector?: TrackTimelineProjector,
		startSeconds = 0,
		durationSeconds?: number,
	): WaveformPeakBuckets | null {
		if (!runtimes.length || peakCount <= 0) {
			return null;
		}

		const count = Math.max(1, Math.floor(peakCount));
		const audible = runtimes.filter((runtime) => runtime.state.volume > 0);

		if (!audible.length) {
			return null;
		}

		const safeTimelineDuration =
			Number.isFinite(timelineDuration) && (timelineDuration as number) > 0
				? (timelineDuration as number)
				: runtimes.reduce(
						(longest, runtime) =>
							Math.max(longest, WaveformEngine.getRuntimeDuration(runtime)),
						0,
					);

		if (safeTimelineDuration <= 0) {
			return null;
		}

		const safeStartSeconds =
			Number.isFinite(startSeconds) && startSeconds > 0 ? startSeconds : 0;
		const safeDurationSeconds =
			durationSeconds !== undefined && Number.isFinite(durationSeconds)
				? Math.max(
						0,
						Math.min(
							durationSeconds,
							Math.max(0, safeTimelineDuration - safeStartSeconds),
						),
					)
				: Math.max(0, safeTimelineDuration - safeStartSeconds);

		if (safeDurationSeconds <= 0) {
			return {
				mins: new Float32Array(count),
				maxes: new Float32Array(count),
			};
		}

		const mappedBuckets = audible
			.map((runtime) => {
				const buckets = this.getTrackTimelineBuckets(
					runtime,
					count,
					safeTimelineDuration,
					trackTimelineProjector,
					safeStartSeconds,
					safeDurationSeconds,
				);
				if (!buckets) {
					return null;
				}

				const weight = Math.max(0, Math.min(1, runtime.state.volume));
				if (weight >= 0.999999) {
					return buckets;
				}

				const scaled: WaveformPeakBuckets = {
					mins: new Float32Array(buckets.mins.length),
					maxes: new Float32Array(buckets.maxes.length),
				};
				for (let index = 0; index < buckets.maxes.length; index += 1) {
					scaled.mins[index] = buckets.mins[index] * weight;
					scaled.maxes[index] = buckets.maxes[index] * weight;
				}
				return scaled;
			})
			.filter((buckets): buckets is WaveformPeakBuckets => !!buckets);

		if (!mappedBuckets.length) {
			return null;
		}

		if (mappedBuckets.length === 1) {
			return mappedBuckets[0];
		}

		const mixed: WaveformPeakBuckets = {
			mins: new Float32Array(count),
			maxes: new Float32Array(count),
		};
		const divisor = Math.sqrt(mappedBuckets.length);
		for (let x = 0; x < count; x += 1) {
			let minSum = 0;
			let maxSum = 0;
			for (let i = 0; i < mappedBuckets.length; i += 1) {
				minSum += mappedBuckets[i].mins[x];
				maxSum += mappedBuckets[i].maxes[x];
			}
			mixed.mins[x] = minSum / divisor;
			mixed.maxes[x] = maxSum / divisor;
		}

		return mixed;
	}

	/**
	 * The mixed waveform of a window read straight from the decoded samples,
	 * rather than from the summary the overview is drawn with: a summary entry
	 * spans hundreds of samples and turns into blocks once a view magnifies past
	 * it. Each peak holds the true range its samples cover, so a window narrow
	 * enough to resolve single samples traces the signal itself.
	 *
	 * `startSeconds` is a position on the tracks' own, unwarped timeline.
	 */
	calculateSampleWaveform(
		runtimes: TrackRuntime[],
		peakCount: number,
		startSeconds: number,
		durationSeconds: number,
	): WaveformPeakBuckets | null {
		const count = Math.floor(peakCount);
		const audible = runtimes.filter(
			(runtime) => runtime.state.volume > 0 && runtime.buffer,
		);
		if (!audible.length || count <= 0 || durationSeconds <= 0) {
			return null;
		}

		const mixed: WaveformPeakBuckets = {
			mins: new Float32Array(count),
			maxes: new Float32Array(count),
		};
		const divisor = Math.sqrt(audible.length);

		audible.forEach((runtime) => {
			const buffer = runtime.buffer as AudioBuffer;
			const timing = WaveformEngine.normalizeTiming(runtime);
			const trimStart = timing ? timing.trimStart : 0;
			const padStart = timing ? timing.padStart : 0;
			const audioDuration = timing ? timing.audioDuration : buffer.duration;
			const rate = buffer.sampleRate;
			const firstSample = Math.max(0, Math.floor(trimStart * rate));
			const endSample = Math.min(
				buffer.length,
				Math.ceil((trimStart + audioDuration) * rate),
			);
			const channels: Float32Array[] = [];
			for (let index = 0; index < buffer.numberOfChannels; index += 1) {
				channels.push(buffer.getChannelData(index));
			}

			const weight = Math.min(1, runtime.state.volume) / divisor;
			const originSample = (startSeconds - padStart + trimStart) * rate;
			const samplesPerPeak = (durationSeconds * rate) / count;
			for (let peakIndex = 0; peakIndex < count; peakIndex += 1) {
				// Reaching one sample back into the previous peak keeps neighbouring
				// peaks touching, so the trace has no gaps where the signal is steep.
				const from = Math.floor(originSample + peakIndex * samplesPerPeak) - 1;
				const to = Math.max(
					from + 2,
					Math.floor(originSample + (peakIndex + 1) * samplesPerPeak),
				);
				let min = Number.POSITIVE_INFINITY;
				let max = Number.NEGATIVE_INFINITY;
				for (
					let sample = Math.max(from, firstSample);
					sample < Math.min(to, endSample);
					sample += 1
				) {
					for (const channel of channels) {
						const value = channel[sample];
						if (value < min) {
							min = value;
						}
						if (value > max) {
							max = value;
						}
					}
				}
				// Outside the track's audio the peak stays on the zero line.
				if (min <= max) {
					mixed.mins[peakIndex] += min * weight;
					mixed.maxes[peakIndex] += max * weight;
				}
			}
		});

		return mixed;
	}

	private createBaseSummaryLevel(buffer: AudioBuffer): WaveformSummaryLevel {
		const sampleCount = buffer.length;
		const entryCount = Math.max(
			1,
			Math.ceil(sampleCount / SUMMARY_WINDOW_SAMPLES),
		);
		const mins = new Float32Array(entryCount);
		const maxes = new Float32Array(entryCount);
		const channelCount = Math.max(1, buffer.numberOfChannels);
		const channels: Float32Array[] = [];

		for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
			channels.push(buffer.getChannelData(channelIndex));
		}

		for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
			const start = entryIndex * SUMMARY_WINDOW_SAMPLES;
			const end = Math.min(sampleCount, start + SUMMARY_WINDOW_SAMPLES);
			let min = 0;
			let max = 0;

			for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
				for (
					let channelIndex = 0;
					channelIndex < channels.length;
					channelIndex += 1
				) {
					const sample = channels[channelIndex][sampleIndex];
					if (sample < min) {
						min = sample;
					}
					if (sample > max) {
						max = sample;
					}
				}
			}

			mins[entryIndex] = min;
			maxes[entryIndex] = max;
		}

		return {
			samplesPerEntry: SUMMARY_WINDOW_SAMPLES,
			mins,
			maxes,
		};
	}

	private createCoarserSummaryLevel(
		previous: WaveformSummaryLevel,
	): WaveformSummaryLevel {
		const entryCount = Math.max(1, Math.ceil(previous.mins.length / 2));
		const mins = new Float32Array(entryCount);
		const maxes = new Float32Array(entryCount);

		for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
			const sourceIndex = entryIndex * 2;
			const minA = previous.mins[sourceIndex] || 0;
			const maxA = previous.maxes[sourceIndex] || 0;
			const hasB = sourceIndex + 1 < previous.mins.length;
			const minB = hasB ? previous.mins[sourceIndex + 1] : minA;
			const maxB = hasB ? previous.maxes[sourceIndex + 1] : maxA;

			mins[entryIndex] = Math.min(minA, minB);
			maxes[entryIndex] = Math.max(maxA, maxB);
		}

		return {
			samplesPerEntry: previous.samplesPerEntry * 2,
			mins,
			maxes,
		};
	}

	private querySummary(
		summary: WaveformSummary,
		peakCount: number,
		startSeconds = 0,
		durationSeconds?: number,
	): WaveformPeakBuckets {
		const count = Math.max(1, Math.floor(peakCount));
		const buckets: WaveformPeakBuckets = {
			mins: new Float32Array(count),
			maxes: new Float32Array(count),
		};
		if (!summary.levels.length || summary.sampleCount <= 0) {
			return buckets;
		}

		const safeStartSeconds =
			Number.isFinite(startSeconds) && startSeconds > 0 ? startSeconds : 0;
		const maxDurationSeconds = Math.max(0, summary.duration - safeStartSeconds);
		const safeDurationSeconds =
			durationSeconds !== undefined && Number.isFinite(durationSeconds)
				? Math.max(0, Math.min(durationSeconds, maxDurationSeconds))
				: maxDurationSeconds;

		if (safeDurationSeconds <= 0) {
			return buckets;
		}

		const startSample = Math.min(
			summary.sampleCount,
			Math.floor(safeStartSeconds * summary.sampleRate),
		);
		const endSample = Math.min(
			summary.sampleCount,
			Math.max(
				startSample,
				Math.ceil(
					(safeStartSeconds + safeDurationSeconds) * summary.sampleRate,
				),
			),
		);
		const samplesPerPeak = Math.max(1, (endSample - startSample) / count);

		for (let peakIndex = 0; peakIndex < count; peakIndex += 1) {
			const rangeStartSample =
				startSample + Math.floor(peakIndex * samplesPerPeak);
			const rangeEndSample =
				peakIndex === count - 1
					? endSample
					: startSample + Math.ceil((peakIndex + 1) * samplesPerPeak);
			const range = this.querySummarySampleRange(
				summary,
				rangeStartSample,
				rangeEndSample,
			);
			buckets.mins[peakIndex] = range.min;
			buckets.maxes[peakIndex] = range.max;
		}

		return buckets;
	}

	private querySummarySampleRange(
		summary: WaveformSummary,
		startSample: number,
		endSample: number,
	): { min: number; max: number } {
		const safeStart = Math.max(
			0,
			Math.min(summary.sampleCount, Math.floor(startSample)),
		);
		const safeEnd = Math.max(
			safeStart,
			Math.min(summary.sampleCount, Math.ceil(endSample)),
		);
		if (safeEnd <= safeStart || !summary.levels.length) {
			return { min: 0, max: 0 };
		}

		let cursor = safeStart;
		let min = 0;
		let max = 0;
		while (cursor < safeEnd) {
			let selected = summary.levels[0];
			for (
				let levelIndex = summary.levels.length - 1;
				levelIndex >= 0;
				levelIndex -= 1
			) {
				const candidate = summary.levels[levelIndex];
				const aligned = cursor % candidate.samplesPerEntry === 0;
				if (aligned && cursor + candidate.samplesPerEntry <= safeEnd) {
					selected = candidate;
					break;
				}
			}

			const entryIndex = Math.min(
				selected.mins.length - 1,
				Math.max(0, Math.floor(cursor / selected.samplesPerEntry)),
			);
			const entryMin = selected.mins[entryIndex] || 0;
			const entryMax = selected.maxes[entryIndex] || 0;
			if (entryMin < min) {
				min = entryMin;
			}
			if (entryMax > max) {
				max = entryMax;
			}

			const entryEndSample = Math.min(
				safeEnd,
				(entryIndex + 1) * selected.samplesPerEntry,
			);
			cursor = entryEndSample > cursor ? entryEndSample : cursor + 1;
		}

		return { min, max };
	}

	private getTrackTimelineBuckets(
		runtime: TrackRuntime,
		peakCount: number,
		timelineDuration: number,
		trackTimelineProjector?: TrackTimelineProjector,
		startSeconds = 0,
		durationSeconds?: number,
	): WaveformPeakBuckets | null {
		if (!runtime.waveformSummary) {
			return null;
		}

		const safePeakCount = Math.max(1, Math.floor(peakCount));
		const timelineBuckets: WaveformPeakBuckets = {
			mins: new Float32Array(safePeakCount),
			maxes: new Float32Array(safePeakCount),
		};

		const timing = WaveformEngine.normalizeTiming(runtime);
		const trimStart = timing ? timing.trimStart : 0;
		const padStart = timing ? timing.padStart : 0;
		const audioDuration = timing
			? timing.audioDuration
			: WaveformEngine.getRuntimeDuration(runtime);

		const safeStartSeconds =
			Number.isFinite(startSeconds) && startSeconds > 0 ? startSeconds : 0;
		const safeDurationSeconds =
			durationSeconds !== undefined && Number.isFinite(durationSeconds)
				? Math.max(0, durationSeconds)
				: Math.max(0, timelineDuration - safeStartSeconds);

		if (
			audioDuration <= 0 ||
			timelineDuration <= 0 ||
			safeDurationSeconds <= 0
		) {
			return timelineBuckets;
		}

		if (!trackTimelineProjector) {
			const windowEnd = safeStartSeconds + safeDurationSeconds;
			const trackStart = padStart;
			const trackEnd = padStart + audioDuration;
			const overlapStart = Math.max(safeStartSeconds, trackStart);
			const overlapEnd = Math.min(windowEnd, trackEnd);

			if (overlapEnd <= overlapStart) {
				return timelineBuckets;
			}

			const secondsPerPeak = safeDurationSeconds / safePeakCount;
			for (let peakIndex = 0; peakIndex < safePeakCount; peakIndex += 1) {
				const bucketStart = safeStartSeconds + peakIndex * secondsPerPeak;
				const bucketEnd =
					peakIndex === safePeakCount - 1
						? windowEnd
						: safeStartSeconds + (peakIndex + 1) * secondsPerPeak;
				const bucketOverlapStart = Math.max(bucketStart, overlapStart);
				const bucketOverlapEnd = Math.min(bucketEnd, overlapEnd);
				if (bucketOverlapEnd <= bucketOverlapStart) {
					continue;
				}

				const audioStart = trimStart + (bucketOverlapStart - padStart);
				const audioDurationSeconds = bucketOverlapEnd - bucketOverlapStart;
				const buckets = this.querySummary(
					runtime.waveformSummary,
					1,
					audioStart,
					audioDurationSeconds,
				);
				timelineBuckets.mins[peakIndex] = buckets.mins[0];
				timelineBuckets.maxes[peakIndex] = buckets.maxes[0];
			}

			return timelineBuckets;
		}

		let previousTargetIndex: number | null = null;
		let previousMin = 0;
		let previousMax = 0;
		const summary = runtime.waveformSummary;
		const level = summary.levels[0];

		for (
			let sourceIndex = 0;
			sourceIndex < level.mins.length;
			sourceIndex += 1
		) {
			const min = level.mins[sourceIndex];
			const max = level.maxes[sourceIndex];
			if (min === 0 && max === 0) {
				previousTargetIndex = null;
				previousMin = 0;
				previousMax = 0;
				continue;
			}

			const audioStart =
				(sourceIndex * level.samplesPerEntry) / summary.sampleRate;
			if (audioStart < trimStart || audioStart > trimStart + audioDuration) {
				previousTargetIndex = null;
				continue;
			}

			const trackTimelineTime = padStart + (audioStart - trimStart);
			const mappedTimelineTime = trackTimelineProjector(
				runtime,
				trackTimelineTime,
			);

			if (
				!Number.isFinite(mappedTimelineTime) ||
				mappedTimelineTime < safeStartSeconds ||
				mappedTimelineTime > safeStartSeconds + safeDurationSeconds
			) {
				previousTargetIndex = null;
				continue;
			}

			const targetIndex = Math.min(
				safePeakCount - 1,
				Math.max(
					0,
					Math.floor(
						((mappedTimelineTime - safeStartSeconds) / safeDurationSeconds) *
							safePeakCount,
					),
				),
			);
			this.mergeTimelineBucket(timelineBuckets, targetIndex, min, max);

			if (previousTargetIndex !== null && previousTargetIndex !== targetIndex) {
				const distance = targetIndex - previousTargetIndex;
				const step = distance > 0 ? 1 : -1;
				for (
					let cursor: number = previousTargetIndex + step;
					cursor !== targetIndex;
					cursor += step
				) {
					const t = Math.abs((cursor - previousTargetIndex) / distance);
					const interpolatedMin = previousMin + (min - previousMin) * t;
					const interpolatedMax = previousMax + (max - previousMax) * t;
					this.mergeTimelineBucket(
						timelineBuckets,
						cursor,
						interpolatedMin,
						interpolatedMax,
					);
				}
			}

			previousTargetIndex = targetIndex;
			previousMin = min;
			previousMax = max;
		}

		return timelineBuckets;
	}

	private mergeTimelineBucket(
		target: WaveformPeakBuckets,
		index: number,
		min: number,
		max: number,
	): void {
		if (
			index < 0 ||
			index >= target.mins.length ||
			!Number.isFinite(min) ||
			!Number.isFinite(max)
		) {
			return;
		}
		if (min < target.mins[index]) {
			target.mins[index] = min;
		}
		if (max > target.maxes[index]) {
			target.maxes[index] = max;
		}
	}

	private static normalizeTiming(runtime: TrackRuntime): TrackTiming | null {
		if (!runtime.waveformSummary && !runtime.buffer) {
			return null;
		}

		const rawTiming = runtime.timing;
		if (!rawTiming) {
			const summaryDuration = runtime.waveformSummary
				? runtime.waveformSummary.duration
				: 0;
			const bufferDuration = runtime.buffer
				? Number(runtime.buffer.duration)
				: 0;
			const safeDuration =
				Number.isFinite(summaryDuration) && summaryDuration > 0
					? summaryDuration
					: Number.isFinite(bufferDuration) && bufferDuration > 0
						? bufferDuration
						: 1;
			return {
				trimStart: 0,
				padStart: 0,
				audioDuration: safeDuration,
				effectiveDuration: safeDuration,
			};
		}

		const trimStart =
			Number.isFinite(rawTiming.trimStart) && rawTiming.trimStart > 0
				? rawTiming.trimStart
				: 0;
		const padStart =
			Number.isFinite(rawTiming.padStart) && rawTiming.padStart > 0
				? rawTiming.padStart
				: 0;
		const audioDuration =
			Number.isFinite(rawTiming.audioDuration) && rawTiming.audioDuration > 0
				? rawTiming.audioDuration
				: 0;
		const effectiveDuration =
			Number.isFinite(rawTiming.effectiveDuration) &&
			rawTiming.effectiveDuration > 0
				? rawTiming.effectiveDuration
				: padStart + audioDuration;

		return {
			trimStart: trimStart,
			padStart: padStart,
			audioDuration: audioDuration,
			effectiveDuration: effectiveDuration,
		};
	}

	private static getRuntimeDuration(runtime: TrackRuntime): number {
		const timing = WaveformEngine.normalizeTiming(runtime);
		if (timing && timing.effectiveDuration > 0) {
			return timing.effectiveDuration;
		}
		return 1;
	}

	private static resolveSampleRate(buffer: AudioBuffer): number {
		const rawSampleRate = Number(buffer.sampleRate);
		if (Number.isFinite(rawSampleRate) && rawSampleRate > 0) {
			return rawSampleRate;
		}

		const rawDuration = Number(buffer.duration);
		return rawDuration > 0
			? Math.max(1, buffer.length / rawDuration)
			: Math.max(1, buffer.length);
	}
}

function normalizeTrackIndex(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		return null;
	}

	return Math.floor(value);
}

function normalizeWaveformSource(
	value: WaveformSourceIndex | undefined,
): WaveformSourceIndex {
	if (value === "audible" || value === undefined) {
		return "audible";
	}

	if (Array.isArray(value)) {
		const normalized: number[] = [];
		const seen = new Set<number>();

		value.forEach((entry) => {
			const normalizedEntry = normalizeTrackIndex(entry);
			if (normalizedEntry === null || seen.has(normalizedEntry)) {
				return;
			}

			seen.add(normalizedEntry);
			normalized.push(normalizedEntry);
		});

		return normalized;
	}

	const normalized = normalizeTrackIndex(value);
	return normalized === null ? "audible" : normalized;
}

export function serializeWaveformSource(
	value: WaveformSourceIndex | undefined,
): string {
	const normalized = normalizeWaveformSource(value);
	return Array.isArray(normalized)
		? JSON.stringify(normalized)
		: String(normalized);
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
