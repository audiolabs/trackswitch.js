import * as viewRendererWarping from "./render-warping-matrix";
import type {
	WarpingMatrixRenderContext,
	WarpingMatrixTrackSeries,
} from "./view-renderer";
import { ViewRenderer } from "./view-renderer";

type WarpingMatrixHostMetadata = ViewRenderer["warpingMatrixHosts"][number];
type WarpingMatrixPlotState = NonNullable<
	WarpingMatrixHostMetadata["matrixPlot"]
>;
type WarpingTempoPlotState = NonNullable<
	WarpingMatrixHostMetadata["tempoPlot"]
>;
type WarpingMatrixPathSeriesData =
	NonNullable<
		WarpingMatrixHostMetadata["matrixDataCache"]
	>["byColumn"] extends Map<string, infer T>
		? T
		: never;
type WarpingMatrixMatrixData = NonNullable<
	WarpingMatrixHostMetadata["matrixDataCache"]
>;
type WarpingMatrixTempoSeriesData =
	NonNullable<
		WarpingMatrixHostMetadata["tempoDataCache"]
	>["byColumn"] extends Map<string, infer T>
		? T
		: never;
type WarpingMatrixTempoData = NonNullable<
	WarpingMatrixHostMetadata["tempoDataCache"]
>;
type WarpingPlotMargins = WarpingMatrixPlotState["margins"];

export class AlignmentViewRenderer extends ViewRenderer {
	public isAlignmentMode(): boolean {
		return true;
	}

	public getWarpingMatrixPathStrokeWidth(): number {
		return viewRendererWarping.getWarpingMatrixPathStrokeWidth(this);
	}

	public getWarpingMatrixLocalTempoWindowSeconds(
		host: WarpingMatrixHostMetadata,
	): number {
		return viewRendererWarping.getWarpingMatrixLocalTempoWindowSeconds(
			this,
			host,
		);
	}

	public getWarpingMatrixLocalTempoSmoothingSeconds(
		host: WarpingMatrixHostMetadata,
	): number {
		return viewRendererWarping.getWarpingMatrixLocalTempoSmoothingSeconds(
			this,
			host,
		);
	}

	public updateWarpingMatrixTempoControlLabels(
		host: WarpingMatrixHostMetadata,
	): void {
		viewRendererWarping.updateWarpingMatrixTempoControlLabels(this, host);
	}

	public persistWarpingMatrixTempoControls(
		host: WarpingMatrixHostMetadata,
	): void {
		viewRendererWarping.persistWarpingMatrixTempoControls(this, host);
	}

	public getWarpingMatrixSquarePlotSize(plot: WarpingMatrixPlotState): number {
		return viewRendererWarping.getWarpingMatrixSquarePlotSize(this, plot);
	}

	public resolveWarpingMatrixColumnColor(
		columnKey: string,
		columnOrder: string[],
	): string {
		return viewRendererWarping.resolveWarpingMatrixColumnColor(
			this,
			columnKey,
			columnOrder,
		);
	}

	public wrapWarpingMatrixContainers(): void {
		viewRendererWarping.wrapWarpingMatrixContainers(this);
	}

	public createWarpingMatrixPlotState(
		plotHost: HTMLElement,
		width: number,
		height: number,
	): WarpingMatrixPlotState {
		return viewRendererWarping.createWarpingMatrixPlotState(
			this,
			plotHost,
			width,
			height,
		);
	}

	public createWarpingTempoPlotState(
		plotHost: HTMLElement,
		width: number,
		height: number,
	): WarpingTempoPlotState {
		return viewRendererWarping.createWarpingTempoPlotState(
			this,
			plotHost,
			width,
			height,
		);
	}

	public applyWarpingMatrixPlotDimensions(
		plot: WarpingMatrixPlotState,
		width: number,
		height: number,
	): void {
		viewRendererWarping.applyWarpingMatrixPlotDimensions(
			this,
			plot,
			width,
			height,
		);
	}

	public applyWarpingTempoPlotDimensions(
		plot: WarpingTempoPlotState,
		width: number,
		height: number,
	): void {
		viewRendererWarping.applyWarpingTempoPlotDimensions(
			this,
			plot,
			width,
			height,
		);
	}

	public isPointerInsidePlotArea(
		plotHost: HTMLElement,
		margins: WarpingPlotMargins,
		innerWidth: number,
		innerHeight: number,
		clientX: number,
		clientY: number,
	): boolean {
		return viewRendererWarping.isPointerInsidePlotArea(
			this,
			plotHost,
			margins,
			innerWidth,
			innerHeight,
			clientX,
			clientY,
		);
	}

	public onWarpingMatrixPointerDown(
		host: WarpingMatrixHostMetadata,
		event: PointerEvent,
	): void {
		viewRendererWarping.onWarpingMatrixPointerDown(this, host, event);
	}

	public onWarpingMatrixPointerMove(
		host: WarpingMatrixHostMetadata,
		event: PointerEvent,
	): void {
		viewRendererWarping.onWarpingMatrixPointerMove(this, host, event);
	}

	public onWarpingMatrixPointerUp(
		host: WarpingMatrixHostMetadata,
		event: PointerEvent,
	): void {
		viewRendererWarping.onWarpingMatrixPointerUp(this, host, event);
	}

	public seekWarpingMatrixFromPointerX(
		host: WarpingMatrixHostMetadata,
		clientX: number,
	): void {
		viewRendererWarping.seekWarpingMatrixFromPointerX(this, host, clientX);
	}

	public onWarpingTempoPointerDown(
		host: WarpingMatrixHostMetadata,
		event: PointerEvent,
	): void {
		viewRendererWarping.onWarpingTempoPointerDown(this, host, event);
	}

	public onWarpingTempoWheel(
		host: WarpingMatrixHostMetadata,
		event: WheelEvent,
	): void {
		viewRendererWarping.onWarpingTempoWheel(this, host, event);
	}

	public seekWarpingMatrixFromTempoPointerX(
		host: WarpingMatrixHostMetadata,
		clientX: number,
	): void {
		viewRendererWarping.seekWarpingMatrixFromTempoPointerX(this, host, clientX);
	}

	public getPrimaryWarpingSeriesData(
		host: WarpingMatrixHostMetadata,
	): WarpingMatrixPathSeriesData | null {
		return viewRendererWarping.getPrimaryWarpingSeriesData(this, host);
	}

	public getPrimaryTempoSeries(host: WarpingMatrixHostMetadata): Array<{
		trackTime: number;
		referenceTime: number;
		tempoPercent: number;
	}> {
		return viewRendererWarping.getPrimaryTempoSeries(this, host);
	}

	public getPrimaryTempoSeriesData(
		host: WarpingMatrixHostMetadata,
	): WarpingMatrixTempoSeriesData | null {
		return viewRendererWarping.getPrimaryTempoSeriesData(this, host);
	}

	public ensureWarpingLayout(host: WarpingMatrixHostMetadata): void {
		viewRendererWarping.ensureWarpingLayout(this, host);
	}

	public applyWarpingMatrixContext(
		host: WarpingMatrixHostMetadata,
		context: WarpingMatrixRenderContext,
	): void {
		viewRendererWarping.applyWarpingMatrixContext(this, host, context);
	}

	public updateWarpingMatrix(
		host: WarpingMatrixHostMetadata,
		context: WarpingMatrixRenderContext | undefined,
	): void {
		viewRendererWarping.updateWarpingMatrix(this, host, context);
	}

	public updateWarpingMatrixPlaybackState(
		host: WarpingMatrixHostMetadata,
		context: WarpingMatrixRenderContext | undefined,
	): void {
		viewRendererWarping.updateWarpingMatrixPlaybackState(this, host, context);
	}

	public setWarpingMatrixVisible(visible: boolean): void {
		viewRendererWarping.setWarpingMatrixVisible(this, visible);
	}

	public renderWarpingMatrixPathPlot(
		host: WarpingMatrixHostMetadata,
		pathStrokeWidth: number,
	): void {
		viewRendererWarping.renderWarpingMatrixPathPlot(
			this,
			host,
			pathStrokeWidth,
		);
	}

	public renderWarpingMatrixPlayhead(host: WarpingMatrixHostMetadata): void {
		viewRendererWarping.renderWarpingMatrixPlayhead(this, host);
	}

	public renderWarpingMatrixTempoPlot(host: WarpingMatrixHostMetadata): void {
		viewRendererWarping.renderWarpingMatrixTempoPlot(this, host);
	}

	public resolveCenteredWarpingWindow(
		center: number,
		windowSeconds: number,
		maxTime: number,
	): [number, number] {
		return viewRendererWarping.resolveCenteredWarpingWindow(
			this,
			center,
			windowSeconds,
			maxTime,
		);
	}

	public buildWarpingMatrixData(
		trackSeries: WarpingMatrixTrackSeries[],
		referenceDuration: number,
	): WarpingMatrixMatrixData {
		return viewRendererWarping.buildWarpingMatrixData(
			this,
			trackSeries,
			referenceDuration,
		);
	}

	public buildWarpingTempoData(
		matrixData: WarpingMatrixMatrixData | null,
		smoothingSeconds: number,
	): WarpingMatrixTempoData {
		return viewRendererWarping.buildWarpingTempoData(
			this,
			matrixData,
			smoothingSeconds,
		);
	}

	public interpolateWarpingTrackTime(
		points: Array<{ referenceTime: number; trackTime: number }>,
		referenceTime: number,
	): number {
		return viewRendererWarping.interpolateWarpingTrackTime(
			this,
			points,
			referenceTime,
		);
	}

	public interpolateWarpingReferenceTime(
		pointsByTrackTime: Array<{ referenceTime: number; trackTime: number }>,
		trackTime: number,
	): number {
		return viewRendererWarping.interpolateWarpingReferenceTime(
			this,
			pointsByTrackTime,
			trackTime,
		);
	}
}
