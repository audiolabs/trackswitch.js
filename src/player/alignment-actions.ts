import type { TrackRuntime } from "../domain/types";
import {
	buildColumnTimeMapping,
	loadNumericCsv,
	mapTime,
	type ParsedNumericCsv,
	resolveAlignmentOutOfRangeMode,
} from "../shared/alignment";
import { clamp } from "../shared/math";
import type { WarpingMatrixTrackSeries } from "../ui/view-renderer";
import {
	type AlignmentReferenceAxisKey,
	buildAlignmentAxisContext,
	buildWarpingSeries,
	getActiveAlignmentAxisContext,
	getAlignmentAxisContext,
	type TrackAlignmentConverter,
} from "./alignment-context";

export function isAlignmentMode(ctx: any): any {
	return function (this: any) {
		return this.variant === "sync";
	}.call(ctx);
}

export function hasSyncedVariant(ctx: any, runtime: any): any {
	return function (this: any, runtime: any) {
		return !!runtime.syncedSource && !!runtime.syncedSource.buffer;
	}.call(ctx, runtime);
}

export function isTrackSyncLocked(ctx: any, trackIndex: any): any {
	return function (this: any, trackIndex: any) {
		return (
			this.globalSyncEnabled && this.syncLockedTrackIndexes.has(trackIndex)
		);
	}.call(ctx, trackIndex);
}

export function setEffectiveSoloMode(ctx: any, singleSoloMode: any): any {
	return function (this: any, singleSoloMode: any) {
		this.effectiveSingleSoloMode = singleSoloMode;

		if (!singleSoloMode || this.runtimes.length === 0) {
			return;
		}

		const previousSoloIndex = this.getActiveSoloTrackIndex();
		const targetSoloIndex = previousSoloIndex >= 0 ? previousSoloIndex : 0;

		this.runtimes.forEach((runtime: TrackRuntime, index: number) => {
			runtime.state.solo = index === targetSoloIndex;
		});
	}.call(ctx, singleSoloMode);
}

export function toggleGlobalSync(ctx: any): any {
	return function (this: any) {
		if (!this.isAlignmentMode()) {
			return;
		}

		if (!this.isGlobalSyncAvailable()) {
			return;
		}

		this.applyGlobalSyncState(!this.globalSyncEnabled);
	}.call(ctx);
}

export function applyGlobalSyncState(ctx: any, syncOn: any): any {
	return function (this: any, syncOn: any) {
		if (!this.isAlignmentMode() || !this.alignmentContext) {
			return;
		}

		if (syncOn && !this.isGlobalSyncAvailable()) {
			return;
		}

		const sourceAxisKey = this.getActiveAlignmentAxisKey();
		const targetAxisKey: AlignmentReferenceAxisKey = syncOn ? "sync" : "base";
		const targetAxis = getAlignmentAxisContext(this, targetAxisKey);
		if (!targetAxis) {
			return;
		}

		const currentPosition = this.state.playing
			? this.currentPlaybackReferencePosition()
			: this.state.position;
		const mappedPosition = this.mapAlignmentAxisTime(
			currentPosition,
			sourceAxisKey,
			targetAxisKey,
		);
		const mappedLoopPointA =
			this.state.loop.pointA === null
				? null
				: this.mapAlignmentAxisTime(
						this.state.loop.pointA,
						sourceAxisKey,
						targetAxisKey,
					);
		const mappedLoopPointB =
			this.state.loop.pointB === null
				? null
				: this.mapAlignmentAxisTime(
						this.state.loop.pointB,
						sourceAxisKey,
						targetAxisKey,
					);

		if (syncOn) {
			this.preSyncSoloTrackIndex = this.getActiveSoloTrackIndex();
			this.globalSyncEnabled = true;
			this.syncLockedTrackIndexes.clear();
			this.setEffectiveSoloMode(false);

			this.runtimes.forEach((runtime: TrackRuntime, index: number) => {
				if (this.hasSyncedVariant(runtime)) {
					this.setRuntimeActiveVariant(runtime, "synced");
					runtime.state.solo = true;
					return;
				}

				this.setRuntimeActiveVariant(runtime, "base");
				runtime.state.solo = false;
				this.syncLockedTrackIndexes.add(index);
			});
		} else {
			this.globalSyncEnabled = false;
			this.syncLockedTrackIndexes.clear();

			this.runtimes.forEach((runtime: TrackRuntime) => {
				this.setRuntimeActiveVariant(runtime, "base");
				runtime.state.solo = false;
			});

			this.setEffectiveSoloMode(true);

			const fallbackIndex = this.runtimes.length > 0 ? 0 : -1;
			const restoreIndex =
				this.preSyncSoloTrackIndex !== null &&
				this.preSyncSoloTrackIndex >= 0 &&
				this.preSyncSoloTrackIndex < this.runtimes.length
					? this.preSyncSoloTrackIndex
					: fallbackIndex;

			if (restoreIndex >= 0) {
				this.runtimes.forEach((runtime: TrackRuntime, index: number) => {
					runtime.state.solo = index === restoreIndex;
				});
			}

			this.preSyncSoloTrackIndex = null;
		}

		this.longestDuration = targetAxis.referenceDuration;
		this.state.loop.pointA =
			mappedLoopPointA === null
				? null
				: clamp(mappedLoopPointA, 0, this.longestDuration);
		this.state.loop.pointB =
			mappedLoopPointB === null
				? null
				: clamp(mappedLoopPointB, 0, this.longestDuration);
		if (
			this.state.loop.pointA !== null &&
			this.state.loop.pointB !== null &&
			this.state.loop.pointA > this.state.loop.pointB
		) {
			const swappedPoint = this.state.loop.pointA;
			this.state.loop.pointA = this.state.loop.pointB;
			this.state.loop.pointB = swappedPoint;
		}

		this.applyTrackProperties();
		this.dispatch({
			type: "set-position",
			position: clamp(mappedPosition, 0, this.longestDuration),
		});

		if (this.state.playing) {
			this.stopAudio();
			this.startAudio(this.state.position);
		}

		this.updateMainControls();
	}.call(ctx, syncOn);
}

export function setRuntimeActiveVariant(
	ctx: any,
	runtime: any,
	variant: any,
): any {
	return function (this: any, runtime: any, variant: any) {
		const source =
			variant === "synced" ? runtime.syncedSource : runtime.baseSource;
		if (!source?.buffer) {
			return false;
		}

		runtime.activeVariant = variant;
		runtime.buffer = source.buffer;
		runtime.timing = source.timing;
		runtime.sourceIndex = source.sourceIndex;
		runtime.waveformSummary = source.waveformSummary;
		return true;
	}.call(ctx, runtime, variant);
}

export function shouldBypassAlignmentMapping(ctx: any, trackIndex: any): any {
	return function (this: any, trackIndex: any) {
		const runtime = this.runtimes[trackIndex];
		return (
			!!runtime && runtime.activeVariant === "synced" && !!runtime.syncedSource
		);
	}.call(ctx, trackIndex);
}

export function initializeAlignmentMode(ctx: any): any {
	return async function (this: any) {
		const alignmentContextResult = await this.buildAlignmentContext();
		if (typeof alignmentContextResult === "string") {
			return alignmentContextResult;
		}

		this.globalSyncEnabled = false;
		this.syncLockedTrackIndexes.clear();
		this.preSyncSoloTrackIndex = null;
		this.setEffectiveSoloMode(true);

		this.alignmentContext = alignmentContextResult;
		this.longestDuration = this.alignmentContext.baseAxis.referenceDuration;

		const activeTrackIndex = this.getActiveSoloTrackIndex();
		if (activeTrackIndex >= 0) {
			const mappedTrackTime = this.referenceToTrackTime(
				activeTrackIndex,
				this.state.position,
			);
			const mappedReferenceTime = this.trackToReferenceTime(
				activeTrackIndex,
				mappedTrackTime,
			);
			this.dispatch({
				type: "set-position",
				position: clamp(mappedReferenceTime, 0, this.longestDuration),
			});
		}

		return null;
	}.call(ctx);
}

export function buildAlignmentContext(ctx: any): any {
	return async function (this: any) {
		if (!this.alignmentConfig) {
			return "Sync mode requires init.alignment configuration.";
		}

		if (
			!this.alignmentConfig.csv ||
			typeof this.alignmentConfig.csv !== "string"
		) {
			return "Alignment configuration requires a non-empty alignment.csv URL.";
		}

		const mappingByTrack = this.resolveAlignmentMappingsByTrack(
			this.alignmentConfig,
		);
		if (typeof mappingByTrack === "string") {
			return mappingByTrack;
		}

		const referenceTimeColumn = this.resolveReferenceTimeColumn(
			this.alignmentConfig,
		);
		if (!referenceTimeColumn) {
			return "Alignment configuration requires alignment.referenceTimeColumn.";
		}

		let parsedCsv: ParsedNumericCsv;
		try {
			parsedCsv = await this.loadAlignmentCsv();
		} catch (error) {
			return error instanceof Error
				? error.message
				: "Failed to load alignment CSV.";
		}

		const availableColumns = new Set(parsedCsv.headers);
		if (!availableColumns.has(referenceTimeColumn)) {
			return (
				"Alignment CSV is missing configured referenceTimeColumn: " +
				referenceTimeColumn
			);
		}

		for (const [, column] of mappingByTrack) {
			if (!availableColumns.has(column)) {
				return `Alignment CSV is missing configured column: ${column}`;
			}
		}

		const midiAlignmentColumns = this.collectMidiAlignmentColumns();
		for (const column of midiAlignmentColumns) {
			if (!availableColumns.has(column)) {
				return `Alignment CSV is missing configured MIDI alignmentColumn: ${column}`;
			}
		}

		const baseAxisResult = buildAlignmentAxisContext(
			this,
			parsedCsv,
			mappingByTrack,
			referenceTimeColumn,
		);
		if (!baseAxisResult.axis || baseAxisResult.error) {
			return baseAxisResult.error || "Failed to build alignment mappings.";
		}
		const baseAxis = baseAxisResult.axis;

		const warpingSeriesByTrack = new Map<number, WarpingMatrixTrackSeries>();
		const midiMappingsByColumn = new Map<string, TrackAlignmentConverter>();
		midiAlignmentColumns.forEach((column: string) => {
			midiMappingsByColumn.set(column, {
				referenceToTrack: buildColumnTimeMapping(
					parsedCsv.rows,
					referenceTimeColumn,
					column,
				),
				trackToReference: buildColumnTimeMapping(
					parsedCsv.rows,
					column,
					referenceTimeColumn,
				),
			});
		});
		baseAxis.converters.forEach(
			(converter: TrackAlignmentConverter, trackIndex: number) => {
				const column = mappingByTrack.get(trackIndex);
				const normalizedColumn =
					typeof column === "string" ? column.trim() : "";
				if (!normalizedColumn) {
					return;
				}

				const runtime = this.runtimes[trackIndex];
				if (!runtime) {
					return;
				}

				warpingSeriesByTrack.set(
					trackIndex,
					buildWarpingSeries(
						runtime,
						trackIndex,
						normalizedColumn,
						converter,
						baseAxis.referenceDuration,
					),
				);
			},
		);

		const syncReferenceTimeColumn = this.resolveReferenceTimeColumnSync(
			this.alignmentConfig,
		);
		let syncAxis = null;
		let baseToSync = null;
		let syncToBase = null;
		let syncMidiMappingsByColumn: Map<string, TrackAlignmentConverter> | null =
			null;

		if (syncReferenceTimeColumn) {
			if (!availableColumns.has(syncReferenceTimeColumn)) {
				console.warn(
					"[trackswitch] Alignment CSV is missing configured referenceTimeColumnSync:",
					syncReferenceTimeColumn,
				);
			} else {
				const syncAxisResult = buildAlignmentAxisContext(
					this,
					parsedCsv,
					mappingByTrack,
					syncReferenceTimeColumn,
				);

				if (!syncAxisResult.axis || syncAxisResult.error) {
					console.warn(
						"[trackswitch] Failed to initialize sync reference timeline:",
						syncAxisResult.error,
					);
				} else {
					try {
						baseToSync = buildColumnTimeMapping(
							parsedCsv.rows,
							referenceTimeColumn,
							syncReferenceTimeColumn,
						);
						syncToBase = buildColumnTimeMapping(
							parsedCsv.rows,
							syncReferenceTimeColumn,
							referenceTimeColumn,
						);
						syncMidiMappingsByColumn = new Map<
							string,
							TrackAlignmentConverter
						>();
						midiAlignmentColumns.forEach((column: string) => {
							syncMidiMappingsByColumn?.set(column, {
								referenceToTrack: buildColumnTimeMapping(
									parsedCsv.rows,
									syncReferenceTimeColumn,
									column,
								),
								trackToReference: buildColumnTimeMapping(
									parsedCsv.rows,
									column,
									syncReferenceTimeColumn,
								),
							});
						});
						syncAxis = syncAxisResult.axis;
					} catch (error) {
						syncAxis = null;
						baseToSync = null;
						syncToBase = null;
						syncMidiMappingsByColumn = null;
						console.warn(
							"[trackswitch] Failed to build sync reference bridge mappings:",
							error,
						);
					}
				}
			}
		}

		return {
			outOfRange: resolveAlignmentOutOfRangeMode(
				this.alignmentConfig.outOfRange,
			),
			baseAxis: baseAxis,
			syncAxis: syncAxis,
			baseToSync: baseToSync,
			syncToBase: syncToBase,
			midiMappingsByColumn: midiMappingsByColumn,
			syncMidiMappingsByColumn: syncMidiMappingsByColumn,
			columnByTrack: new Map<number, string>(mappingByTrack),
			uniqueColumnOrder: this.collectUniqueAlignmentColumns(mappingByTrack),
			warpingSeriesByTrack: warpingSeriesByTrack,
		};
	}.call(ctx);
}

export function collectMidiAlignmentColumns(ctx: any): any {
	return function (this: any) {
		const columns: string[] = [];
		const seenColumns = new Set<string>();

		const addColumn = (rawColumn: unknown): void => {
			const column = typeof rawColumn === "string" ? rawColumn.trim() : "";
			if (!column || seenColumns.has(column)) {
				return;
			}

			seenColumns.add(column);
			columns.push(column);
		};

		const midiSurfaces = this.renderer?.midiSeekSurfaces || [];
		midiSurfaces.forEach((surface: { alignmentColumn?: string | null }) => {
			addColumn(surface.alignmentColumn);
		});

		const midiCanvases = this.root.querySelectorAll(
			"canvas.midi[data-midi-alignment-column]",
		);
		midiCanvases.forEach((canvas: Element) => {
			addColumn(canvas.getAttribute("data-midi-alignment-column"));
		});

		return columns;
	}.call(ctx);
}

export function loadAlignmentCsv(ctx: any): any {
	return function (this: any) {
		if (
			!this.alignmentConfig?.csv ||
			typeof this.alignmentConfig.csv !== "string"
		) {
			return Promise.reject(
				new Error(
					"Alignment configuration requires a non-empty alignment.csv URL.",
				),
			);
		}

		if (!this.alignmentCsvRequest) {
			this.alignmentCsvRequest = loadNumericCsv(this.alignmentConfig.csv).catch(
				(error: unknown) => {
					this.alignmentCsvRequest = null;
					throw error;
				},
			);
		}

		return this.alignmentCsvRequest as Promise<ParsedNumericCsv>;
	}.call(ctx);
}

export function collectUniqueAlignmentColumns(
	ctx: any,
	mappingByTrack: any,
): any {
	return function (this: any, mappingByTrack: any) {
		const seenColumns = new Set<string>();
		const uniqueColumns: string[] = [];

		for (const [, rawColumn] of mappingByTrack) {
			const column = String(rawColumn || "").trim();
			if (!column || seenColumns.has(column)) {
				continue;
			}

			seenColumns.add(column);
			uniqueColumns.push(column);
		}

		return uniqueColumns;
	}.call(ctx, mappingByTrack);
}

export function getWarpingMatrixContext(ctx: any): any {
	return function (this: any) {
		if (!this.isAlignmentMode()) {
			return undefined;
		}

		if (!this.alignmentContext) {
			return {
				enabled: true,
				syncEnabled: this.globalSyncEnabled,
				referenceDuration: this.longestDuration,
				currentReferenceTime: this.state.position,
				currentScoreBpm: this.sheetMusicEngine.resolveReferenceBpm(
					this.state.position,
				),
				columnOrder: [],
				trackSeries: [],
			};
		}

		const baseAxis = this.alignmentContext.baseAxis;
		const baseReferenceTime = this.globalSyncEnabled
			? this.mapAlignmentAxisTime(
					this.state.position,
					this.getActiveAlignmentAxisKey(),
					"base",
				)
			: clamp(this.state.position, 0, baseAxis.referenceDuration);
		const currentScoreBpm = this.sheetMusicEngine.resolveReferenceBpm(
			baseReferenceTime,
			false,
		);

		const activeTrackIndex = this.getActiveSoloTrackIndex();
		if (activeTrackIndex < 0) {
			return {
				enabled: true,
				syncEnabled: this.globalSyncEnabled,
				referenceDuration: baseAxis.referenceDuration,
				currentReferenceTime: baseReferenceTime,
				currentScoreBpm: currentScoreBpm,
				columnOrder: this.alignmentContext.uniqueColumnOrder,
				trackSeries: [],
			};
		}

		const trackSeries = this.alignmentContext.warpingSeriesByTrack.has(
			activeTrackIndex,
		)
			? [
					this.alignmentContext.warpingSeriesByTrack.get(
						activeTrackIndex,
					) as WarpingMatrixTrackSeries,
				]
			: [];

		return {
			enabled: true,
			syncEnabled: this.globalSyncEnabled,
			referenceDuration: baseAxis.referenceDuration,
			currentReferenceTime: baseReferenceTime,
			currentScoreBpm: currentScoreBpm,
			columnOrder: this.alignmentContext.uniqueColumnOrder,
			trackSeries: trackSeries,
		};
	}.call(ctx);
}

export function getAudibleTrackIndexesForWarpingMatrix(ctx: any): any {
	return function (this: any) {
		const selected = this.runtimes
			.map((runtime: TrackRuntime, index: number) => {
				return runtime.state.solo ? index : -1;
			})
			.filter((index: number) => {
				return index >= 0;
			});

		if (selected.length > 0) {
			return selected;
		}

		return this.runtimes.map((_: TrackRuntime, index: number) => index);
	}.call(ctx);
}

export function resolveReferenceTimeColumn(ctx: any, config: any): any {
	return function (this: any, config: any) {
		const configuredReferenceTimeColumn =
			typeof config.referenceTimeColumn === "string"
				? config.referenceTimeColumn.trim()
				: "";

		if (!configuredReferenceTimeColumn) {
			return null;
		}

		return configuredReferenceTimeColumn;
	}.call(ctx, config);
}

export function resolveReferenceTimeColumnSync(ctx: any, config: any): any {
	return function (this: any, config: any) {
		const configuredReferenceTimeColumnSync =
			typeof config.referenceTimeColumnSync === "string"
				? config.referenceTimeColumnSync.trim()
				: "";

		if (!configuredReferenceTimeColumnSync) {
			return null;
		}

		return configuredReferenceTimeColumnSync;
	}.call(ctx, config);
}

export function resolveReferenceDuration(
	ctx: any,
	rows: any,
	referenceTimeColumn: any,
): any {
	return function (this: any, rows: any, referenceTimeColumn: any) {
		let maxReference = Number.NEGATIVE_INFINITY;

		rows.forEach((row: Record<string, unknown>) => {
			const value = Number(row[referenceTimeColumn]);
			if (Number.isFinite(value) && value > maxReference) {
				maxReference = value;
			}
		});

		if (!Number.isFinite(maxReference)) {
			return (
				"Alignment CSV does not contain valid numeric values for referenceTimeColumn: " +
				referenceTimeColumn
			);
		}

		return Math.max(0, maxReference);
	}.call(ctx, rows, referenceTimeColumn);
}

export function resolveAlignmentMappingsByTrack(ctx: any, config: any): any {
	return function (this: any, _config: any) {
		const mappingByTrack = new Map<number, string>();

		for (let index = 0; index < this.runtimes.length; index += 1) {
			const rawColumn = this.runtimes[index].definition.alignment?.column;
			const column = typeof rawColumn === "string" ? rawColumn.trim() : "";
			if (!column) {
				return (
					"Sync mode requires alignment.column for every track. Missing trackIndex " +
					index +
					"."
				);
			}

			mappingByTrack.set(index, column);
		}

		return mappingByTrack;
	}.call(ctx, config);
}

export function getActiveSoloTrackIndex(ctx: any): any {
	return function (this: any) {
		for (let index = 0; index < this.runtimes.length; index += 1) {
			if (this.runtimes[index].state.solo) {
				return index;
			}
		}

		if (this.effectiveSingleSoloMode && this.runtimes.length > 0) {
			return 0;
		}

		return -1;
	}.call(ctx);
}

export function getActiveAlignmentAxisKey(ctx: any): any {
	return function (this: any) {
		if (
			!this.alignmentContext ||
			!this.globalSyncEnabled ||
			!this.alignmentContext.syncAxis
		) {
			return "base";
		}

		return "sync";
	}.call(ctx);
}

export function isSyncReferenceAxisActive(ctx: any): any {
	return function (this: any) {
		return this.getActiveAlignmentAxisKey() === "sync";
	}.call(ctx);
}

export function isGlobalSyncAvailable(ctx: any): any {
	return function (this: any) {
		if (!this.isAlignmentMode() || !this.alignmentContext?.syncAxis) {
			return false;
		}

		return this.runtimes.some((runtime: TrackRuntime) =>
			this.hasSyncedVariant(runtime),
		);
	}.call(ctx);
}

export function mapAlignmentAxisTime(
	ctx: any,
	time: any,
	fromAxisKey: any,
	toAxisKey: any,
): any {
	return function (
		this: any,
		time: any,
		fromAxisKey: AlignmentReferenceAxisKey,
		toAxisKey: AlignmentReferenceAxisKey,
	) {
		if (!Number.isFinite(time) || !this.alignmentContext) {
			return Number.isFinite(time) ? time : 0;
		}

		if (fromAxisKey === toAxisKey) {
			const targetAxis = getAlignmentAxisContext(this, toAxisKey);
			return targetAxis ? clamp(time, 0, targetAxis.referenceDuration) : time;
		}

		const bridge =
			fromAxisKey === "base"
				? this.alignmentContext.baseToSync
				: this.alignmentContext.syncToBase;
		const targetAxis = getAlignmentAxisContext(this, toAxisKey);
		if (!bridge || !targetAxis) {
			return time;
		}

		return clamp(
			mapTime(bridge, time, this.alignmentContext.outOfRange),
			0,
			targetAxis.referenceDuration,
		);
	}.call(ctx, time, fromAxisKey, toAxisKey);
}

export function getAlignmentPlaybackTrackIndex(ctx: any): any {
	return function (this: any) {
		const activeSoloTrackIndex = this.getActiveSoloTrackIndex();
		if (activeSoloTrackIndex >= 0) {
			return activeSoloTrackIndex;
		}

		if (!this.globalSyncEnabled) {
			return -1;
		}

		for (let index = 0; index < this.runtimes.length; index += 1) {
			const runtime = this.runtimes[index];
			if (!runtime || this.syncLockedTrackIndexes.has(index)) {
				continue;
			}

			if (runtime.activeVariant === "synced" && runtime.buffer) {
				return index;
			}
		}

		return -1;
	}.call(ctx);
}

export function currentPlaybackReferencePosition(ctx: any): any {
	return function (this: any) {
		const rawPlaybackPosition =
			this.audioEngine.currentTime - this.state.startTime;
		if (
			!this.isAlignmentMode() ||
			!this.alignmentContext ||
			this.alignmentPlaybackTrackIndex === null
		) {
			return rawPlaybackPosition;
		}

		return this.trackToReferenceTime(
			this.alignmentPlaybackTrackIndex,
			rawPlaybackPosition,
		);
	}.call(ctx);
}

export function referenceToTrackTime(
	ctx: any,
	trackIndex: any,
	referenceTime: any,
): any {
	return function (this: any, trackIndex: any, referenceTime: any) {
		if (!this.alignmentContext) {
			return referenceTime;
		}

		if (this.shouldBypassAlignmentMapping(trackIndex)) {
			return referenceTime;
		}

		const activeAxis = getActiveAlignmentAxisContext(this);
		const converter = activeAxis?.converters.get(trackIndex);
		if (!converter) {
			return referenceTime;
		}

		return mapTime(
			converter.referenceToTrack,
			referenceTime,
			this.alignmentContext.outOfRange,
		);
	}.call(ctx, trackIndex, referenceTime);
}

export function trackToReferenceTime(
	ctx: any,
	trackIndex: any,
	trackTime: any,
): any {
	return function (this: any, trackIndex: any, trackTime: any) {
		if (!this.alignmentContext) {
			return trackTime;
		}

		if (this.shouldBypassAlignmentMapping(trackIndex)) {
			return trackTime;
		}

		const activeAxis = getActiveAlignmentAxisContext(this);
		const converter = activeAxis?.converters.get(trackIndex);
		if (!converter) {
			return trackTime;
		}

		return mapTime(
			converter.trackToReference,
			trackTime,
			this.alignmentContext.outOfRange,
		);
	}.call(ctx, trackIndex, trackTime);
}

export function handleAlignmentTrackSwitch(
	ctx: any,
	nextActiveTrackIndex: any,
): any {
	return function (this: any, nextActiveTrackIndex: any) {
		if (!this.alignmentContext || nextActiveTrackIndex < 0) {
			return;
		}

		const referenceAtSwitch = this.state.playing
			? this.currentPlaybackReferencePosition()
			: this.state.position;
		const mappedTrackTime = this.referenceToTrackTime(
			nextActiveTrackIndex,
			referenceAtSwitch,
		);
		const mappedReferenceTime = clamp(
			this.trackToReferenceTime(nextActiveTrackIndex, mappedTrackTime),
			0,
			this.longestDuration,
		);

		if (this.state.playing) {
			this.stopAudio();
			this.dispatch({ type: "set-position", position: mappedReferenceTime });
			this.startAudio(mappedReferenceTime);
		} else {
			this.dispatch({ type: "set-position", position: mappedReferenceTime });
		}

		this.updateMainControls();
	}.call(ctx, nextActiveTrackIndex);
}
