import type {
	TrackAlignmentConfig,
	TrackRuntime,
	TrackSourceVariant,
} from "../domain/types";
import type { SheetMusicMeasureMapsByAxis } from "../engine/sheet-music/types";
import type { ParsedNumericCsv } from "../shared/alignment";
import { buildMeasureMapFromColumns } from "../shared/measure-map";
import { AlignmentViewRenderer } from "../ui/alignment-view-renderer";
import type { WarpingMatrixRenderContext } from "../ui/view-renderer";
import * as controllerAlignment from "./alignment-actions";
import { TrackSwitchControllerImpl } from "./player-controller";

type AlignmentReferenceAxisKey = "base" | "sync";

export class AlignmentTrackSwitchControllerImpl extends TrackSwitchControllerImpl {
	public declare readonly renderer: AlignmentViewRenderer;
	public declare alignmentCsvRequest: Promise<ParsedNumericCsv> | null;

	protected createRenderer(
		root: HTMLElement,
		features: this["features"],
		presetNames: string[],
		trackGroups: ConstructorParameters<typeof AlignmentViewRenderer>[3],
	): AlignmentViewRenderer {
		return new AlignmentViewRenderer(
			root,
			features,
			presetNames,
			trackGroups,
			(referenceTime) => {
				this.seekTo(referenceTime);
			},
			(referenceTime) => {
				return this.sheetMusicEngine.resolveReferenceBpm(referenceTime);
			},
		);
	}

	public isAlignmentMode(): boolean {
		return controllerAlignment.isAlignmentMode(this);
	}

	public hasSyncedVariant(runtime: TrackRuntime): boolean {
		return controllerAlignment.hasSyncedVariant(this, runtime);
	}

	public isTrackSyncLocked(trackIndex: number): boolean {
		return controllerAlignment.isTrackSyncLocked(this, trackIndex);
	}

	public setEffectiveSoloMode(singleSoloMode: boolean): void {
		controllerAlignment.setEffectiveSoloMode(this, singleSoloMode);
	}

	public toggleGlobalSync(): void {
		controllerAlignment.toggleGlobalSync(this);
	}

	public applyGlobalSyncState(syncOn: boolean): void {
		controllerAlignment.applyGlobalSyncState(this, syncOn);
	}

	public setRuntimeActiveVariant(
		runtime: TrackRuntime,
		variant: TrackSourceVariant,
	): boolean {
		return controllerAlignment.setRuntimeActiveVariant(this, runtime, variant);
	}

	public shouldBypassAlignmentMapping(trackIndex: number): boolean {
		return controllerAlignment.shouldBypassAlignmentMapping(this, trackIndex);
	}

	public async initializeAlignmentMode(): Promise<string | null> {
		return controllerAlignment.initializeAlignmentMode(this);
	}

	public async buildAlignmentContext(): Promise<unknown | string> {
		return controllerAlignment.buildAlignmentContext(this);
	}

	public loadAlignmentCsv(): Promise<ParsedNumericCsv> {
		return controllerAlignment.loadAlignmentCsv(this);
	}

	public buildSheetMusicMeasureMaps(
		measureColumn: string,
		source: string,
	): Promise<SheetMusicMeasureMapsByAxis> {
		if (!measureColumn) {
			return super.buildSheetMusicMeasureMaps(measureColumn, source);
		}

		return super
			.buildSheetMusicMeasureMaps(measureColumn, source)
			.then((maps) =>
				this.loadAlignmentCsv().then((parsedCsv) => {
					const referenceTimeColumnSync = this.resolveReferenceTimeColumnSync(
						this.alignmentConfig as TrackAlignmentConfig,
					);
					let syncMeasureMap = null;
					if (
						referenceTimeColumnSync &&
						parsedCsv.headers.indexOf(referenceTimeColumnSync) >= 0
					) {
						try {
							syncMeasureMap = buildMeasureMapFromColumns(
								parsedCsv.rows,
								parsedCsv.headers,
								referenceTimeColumnSync,
								measureColumn,
							);
						} catch (error) {
							console.warn(
								"[trackswitch] Failed to load sync-axis sheet-music measure map:",
								source,
								error,
							);
						}
					}

					return {
						base: maps.base,
						sync: syncMeasureMap,
					};
				}),
			);
	}

	public collectUniqueAlignmentColumns(
		mappingByTrack: Map<number, string>,
	): string[] {
		return controllerAlignment.collectUniqueAlignmentColumns(
			this,
			mappingByTrack,
		);
	}

	public collectMidiAlignmentColumns(): string[] {
		return controllerAlignment.collectMidiAlignmentColumns(this);
	}

	public getWarpingMatrixContext(): WarpingMatrixRenderContext | undefined {
		return controllerAlignment.getWarpingMatrixContext(this);
	}

	public getAudibleTrackIndexesForWarpingMatrix(): number[] {
		return controllerAlignment.getAudibleTrackIndexesForWarpingMatrix(this);
	}

	public resolveReferenceTimeColumn(
		config: TrackAlignmentConfig,
	): string | null {
		return controllerAlignment.resolveReferenceTimeColumn(this, config);
	}

	public resolveReferenceTimeColumnSync(
		config: TrackAlignmentConfig,
	): string | null {
		return controllerAlignment.resolveReferenceTimeColumnSync(this, config);
	}

	public resolveReferenceDuration(
		rows: Array<Record<string, number>>,
		referenceTimeColumn: string,
	): number | string {
		return controllerAlignment.resolveReferenceDuration(
			this,
			rows,
			referenceTimeColumn,
		);
	}

	public resolveAlignmentMappingsByTrack(
		config: TrackAlignmentConfig,
	): Map<number, string> | string {
		return controllerAlignment.resolveAlignmentMappingsByTrack(this, config);
	}

	public getActiveSoloTrackIndex(): number {
		return controllerAlignment.getActiveSoloTrackIndex(this);
	}

	public getActiveAlignmentAxisKey(): AlignmentReferenceAxisKey {
		return controllerAlignment.getActiveAlignmentAxisKey(this);
	}

	public isSyncReferenceAxisActive(): boolean {
		return controllerAlignment.isSyncReferenceAxisActive(this);
	}

	public isGlobalSyncAvailable(): boolean {
		return controllerAlignment.isGlobalSyncAvailable(this);
	}

	public mapAlignmentAxisTime(
		time: number,
		fromAxisKey: AlignmentReferenceAxisKey,
		toAxisKey: AlignmentReferenceAxisKey,
	): number {
		return controllerAlignment.mapAlignmentAxisTime(
			this,
			time,
			fromAxisKey,
			toAxisKey,
		);
	}

	public getAlignmentPlaybackTrackIndex(): number {
		return controllerAlignment.getAlignmentPlaybackTrackIndex(this);
	}

	public currentPlaybackReferencePosition(): number {
		return controllerAlignment.currentPlaybackReferencePosition(this);
	}

	public referenceToTrackTime(
		trackIndex: number,
		referenceTime: number,
	): number {
		return controllerAlignment.referenceToTrackTime(
			this,
			trackIndex,
			referenceTime,
		);
	}

	public trackToReferenceTime(trackIndex: number, trackTime: number): number {
		return controllerAlignment.trackToReferenceTime(
			this,
			trackIndex,
			trackTime,
		);
	}

	public handleAlignmentTrackSwitch(nextActiveTrackIndex: number): void {
		controllerAlignment.handleAlignmentTrackSwitch(this, nextActiveTrackIndex);
	}
}
