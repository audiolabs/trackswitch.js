import type { ScaleLinear, Selection } from "d3";
import type {
	AudioDownloadSizeInfo,
	NormalizedTrackGroupLayout,
	TrackRuntime,
	TrackSwitchFeatures,
	TrackSwitchUiState,
	WaveformPlaybackFollowMode,
	WaveformSource,
} from "../domain/types";
import type {
	TrackTimelineProjector,
	WaveformEngine,
} from "../engine/waveform-engine";
import * as viewRendererCore from "./render-layout";
import type {
	MidiSeekSurfaceMetadata,
	MidiTimelineContextResolver,
} from "./render-midi";
import * as viewRendererMidi from "./render-midi";
import * as viewRendererSeek from "./render-seek";
import * as viewRendererWaveform from "./render-waveforms";

type SvgSelection = Selection<SVGSVGElement, unknown, null, undefined>;
type GroupSelection = Selection<SVGGElement, unknown, null, undefined>;
type PathSelection = Selection<SVGPathElement, unknown, null, undefined>;
type RectSelection = Selection<SVGRectElement, unknown, null, undefined>;
type LineSelection = Selection<SVGLineElement, unknown, null, undefined>;
type CircleSelection = Selection<SVGCircleElement, unknown, null, undefined>;
type TextSelection = Selection<SVGTextElement, unknown, null, undefined>;

export interface WaveformTimelineContext {
	enabled: boolean;
	referenceToTrackTime(trackIndex: number, referenceTime: number): number;
	getTrackDuration(trackIndex: number): number;
	getTrackCount(): number;
	getTrackAlignmentPoints(
		trackIndex: number,
	): Array<{ referenceTime: number; trackTime: number }>;
}

export interface SheetMusicHostConfig {
	host: HTMLElement;
	scrollContainer: HTMLElement;
	source: string;
	measureColumn: string | null;
	renderScale: number | null;
	followPlayback: boolean;
	cursorColor: string;
	cursorAlpha: number;
}

export interface WarpingMatrixDataPoint {
	referenceTime: number;
	trackTime: number;
}

export interface WarpingMatrixTrackSeries {
	trackIndex: number;
	columnKey: string;
	points: WarpingMatrixDataPoint[];
	trackDuration: number;
}

export interface WarpingMatrixRenderContext {
	enabled: boolean;
	syncEnabled: boolean;
	referenceDuration: number;
	currentReferenceTime: number;
	currentScoreBpm: number | null;
	columnOrder: string[];
	trackSeries: WarpingMatrixTrackSeries[];
}

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
	tilePeakCache: Map<
		string,
		{
			mins: Float32Array;
			maxes: Float32Array;
		}
	>;
	tilePeakCacheOrder: string[];
	alignedPlayhead: boolean;
	refHooksCanvas: HTMLCanvasElement | null;
	showAlignmentPoints: boolean;
	alignmentPointsLastW: number;
	alignmentPointsLastH: number;
}

interface LatestWaveformRenderInput {
	waveformEngine: WaveformEngine;
	runtimes: TrackRuntime[];
	timelineDuration: number;
	trackTimelineProjector?: TrackTimelineProjector;
	waveformTimelineContext?: WaveformTimelineContext;
}

interface WarpingMatrixPathPoint {
	referenceTime: number;
	trackTime: number;
}

interface WarpingMatrixPathSeriesData {
	pointsByReferenceTime: WarpingMatrixPathPoint[];
	pointsByTrackTime: WarpingMatrixPathPoint[];
	trackDuration: number;
}

interface WarpingMatrixMatrixData {
	byColumn: Map<string, WarpingMatrixPathSeriesData>;
}

interface WarpingMatrixTempoPoint {
	trackTime: number;
	referenceTime: number;
	tempoPercent: number;
}

interface WarpingMatrixTempoSeriesData {
	points: WarpingMatrixTempoPoint[];
	isStrictlyMonotonic: boolean;
	warningMessage: string | null;
}

interface WarpingMatrixTempoData {
	byColumn: Map<string, WarpingMatrixTempoSeriesData>;
}

interface WarpingPlotMargins {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

interface WarpingMatrixPlotState {
	svg: SvgSelection;
	title: TextSelection;
	xAxis: GroupSelection;
	yAxis: GroupSelection;
	xLabel: TextSelection;
	yLabel: TextSelection;
	plotRoot: GroupSelection;
	pathLayer: GroupSelection;
	clipRect: RectSelection;
	pathByColumn: Map<string, PathSelection>;
	guideDiagonal: LineSelection;
	playhead: CircleSelection;
	xScale: ScaleLinear<number, number>;
	yScale: ScaleLinear<number, number>;
	margins: WarpingPlotMargins;
	innerWidth: number;
	innerHeight: number;
}

interface WarpingTempoPlotState {
	svg: SvgSelection;
	title: TextSelection;
	xAxis: GroupSelection;
	yAxis: GroupSelection;
	yAxisRight: GroupSelection;
	xLabel: TextSelection;
	yLabel: TextSelection;
	yLabelRight: TextSelection;
	plotRoot: GroupSelection;
	clipRect: RectSelection;
	path: PathSelection;
	baseline: LineSelection;
	centerLine: LineSelection;
	xScale: ScaleLinear<number, number>;
	yScale: ScaleLinear<number, number>;
	margins: WarpingPlotMargins;
	innerWidth: number;
	innerHeight: number;
}

interface WarpingMatrixHostMetadata {
	wrapper: HTMLElement;
	host: HTMLElement;
	visible: boolean;
	syncDisabledOverlay: HTMLElement;
	matrixPanel: HTMLElement;
	matrixPlotHost: HTMLElement;
	matrixPlot: WarpingMatrixPlotState | null;
	tempoPanel: HTMLElement;
	tempoPlotHost: HTMLElement;
	tempoPlot: WarpingTempoPlotState | null;
	tempoControls: HTMLElement;
	tempoMessage: HTMLElement;
	tempoWindowSlider: HTMLInputElement;
	tempoWindowValueNode: HTMLElement;
	tempoSmoothingSlider: HTMLInputElement;
	tempoSmoothingValueNode: HTMLElement;
	matrixSeriesSignature: string | null;
	matrixDataCache: WarpingMatrixMatrixData | null;
	matrixDataCacheKey: string | null;
	tempoDataCache: WarpingMatrixTempoData | null;
	tempoDataCacheKey: string | null;
	matrixDisabled: boolean;
	tempoCurveValid: boolean;
	trackSeries: WarpingMatrixTrackSeries[];
	matrixTrackDuration: number;
	configuredHeight: number | null;
	configuredBpm: number | "infer_score" | null;
	tempoWindowSeconds: number;
	tempoSmoothingSeconds: number;
	colorByColumn: Map<string, string>;
	activeColumnKey: string | null;
	referenceDuration: number;
	currentReferenceTime: number;
	currentTrackTime: number;
	currentScoreBpm: number | null;
	matrixActivePointerId: number | null;
	lastSizeKey: string | null;
	layoutDirty: boolean;
	staticPlotDirty: boolean;
}

interface PanelDragState {
	handle: HTMLElement;
	panel: HTMLElement;
	placeholder: HTMLElement;
	pointerId: number | null;
	pointerOffsetY: number;
	panelHeight: number;
}

export class ViewRenderer {
	public readonly root: HTMLElement;
	public readonly features: TrackSwitchFeatures;
	public presetNames: string[];
	public trackGroups: NormalizedTrackGroupLayout[];

	public readonly waveformSeekSurfaces: WaveformSeekSurfaceMetadata[] = [];
	public readonly midiSeekSurfaces: MidiSeekSurfaceMetadata[] = [];
	public readonly sheetMusicHosts: SheetMusicHostConfig[] = [];
	public readonly warpingMatrixHosts: WarpingMatrixHostMetadata[] = [];
	public waveformTileRefreshFrameId: number | null = null;
	public latestWaveformRenderInput: LatestWaveformRenderInput | null = null;
	public readonly onWarpingMatrixSeek?: (referenceTime: number) => void;
	public readonly resolveWarpingMatrixScoreBpm?: (
		referenceTime: number,
	) => number | null;
	public warpingClipPathCounter = 0;
	public panelDragState: PanelDragState | null = null;
	public readonly warpingMatrixTempoControlState = new WeakMap<
		HTMLElement,
		{ windowSeconds: number; smoothingSeconds: number }
	>();

	constructor(
		root: HTMLElement,
		features: TrackSwitchFeatures,
		presetNames: string[],
		trackGroups: NormalizedTrackGroupLayout[] = [],
		onWarpingMatrixSeek?: (referenceTime: number) => void,
		resolveWarpingMatrixScoreBpm?: (referenceTime: number) => number | null,
	) {
		this.root = root;
		this.features = features;
		this.presetNames = presetNames;
		this.trackGroups = trackGroups;
		this.onWarpingMatrixSeek = onWarpingMatrixSeek;
		this.resolveWarpingMatrixScoreBpm = resolveWarpingMatrixScoreBpm;
	}

	public updateConfig(
		presetNames: string[],
		trackGroups: NormalizedTrackGroupLayout[],
	): void {
		this.presetNames = presetNames;
		this.trackGroups = trackGroups;
	}

	public query(selector: string): HTMLElement | null {
		return viewRendererCore.query(this, selector);
	}

	public queryAll(selector: string): HTMLElement[] {
		return viewRendererCore.queryAll(this, selector);
	}

	public isAlignmentMode(): boolean {
		return false;
	}

	public getWarpingMatrixPathStrokeWidth(): number {
		return 3;
	}

	public getWarpingMatrixLocalTempoWindowSeconds(
		host: WarpingMatrixHostMetadata,
	): number {
		return host.tempoWindowSeconds;
	}

	public getWarpingMatrixLocalTempoSmoothingSeconds(
		host: WarpingMatrixHostMetadata,
	): number {
		return host.tempoSmoothingSeconds;
	}

	public updateWarpingMatrixTempoControlLabels(
		host: WarpingMatrixHostMetadata,
	): void {
		void host;
	}

	public persistWarpingMatrixTempoControls(
		host: WarpingMatrixHostMetadata,
	): void {
		void host;
	}

	public getWarpingMatrixSquarePlotSize(plot: WarpingMatrixPlotState): number {
		return Math.max(1, Math.min(plot.innerWidth, plot.innerHeight));
	}

	public resolveWarpingMatrixColumnColor(
		_columnKey: string,
		_columnOrder: string[],
	): string {
		return "#ED8C01";
	}

	initialize(runtimes: TrackRuntime[]): void {
		viewRendererCore.initialize(this, runtimes);
	}

	public buildMainControlHtml(runtimes: TrackRuntime[]): string {
		return viewRendererCore.buildMainControlHtml(this, runtimes);
	}

	public shouldRenderGlobalSync(runtimes: TrackRuntime[]): boolean {
		return viewRendererCore.shouldRenderGlobalSync(this, runtimes);
	}

	public buildTrackRow(runtime: TrackRuntime, index: number): HTMLElement {
		return viewRendererCore.buildTrackRow(this, runtime, index);
	}

	public renderTrackList(runtimes: TrackRuntime[]): void {
		viewRendererCore.renderTrackList(this, runtimes);
	}

	public prepareCustomizablePanels(): void {
		viewRendererCore.prepareCustomizablePanels(this);
	}

	public prepareTextPanels(): void {
		viewRendererCore.prepareTextPanels(this);
	}

	public startPanelReorder(event: {
		target?: EventTarget | null;
		pageY?: number;
		originalEvent?: Event;
		preventDefault(): void;
		stopPropagation(): void;
	}): boolean {
		return viewRendererCore.startPanelReorder(this, event);
	}

	public movePanelReorder(event: {
		pageY?: number;
		originalEvent?: Event;
		preventDefault(): void;
	}): boolean {
		return viewRendererCore.movePanelReorder(this, event);
	}

	public endPanelReorder(event?: {
		originalEvent?: Event;
		preventDefault(): void;
	}): boolean {
		return viewRendererCore.endPanelReorder(this, event);
	}

	public wrapSeekableImages(): void {
		viewRendererCore.wrapSeekableImages(this);
	}

	public wrapWaveformCanvases(): void {
		viewRendererWaveform.wrapWaveformCanvases(this);
	}

	public wrapMidiCanvases(): void {
		viewRendererMidi.wrapMidiCanvases(this);
	}

	public wrapSheetMusicContainers(): void {
		viewRendererCore.wrapSheetMusicContainers(this);
	}

	getPreparedSheetMusicHosts(): SheetMusicHostConfig[] {
		return viewRendererCore.getPreparedSheetMusicHosts(this);
	}

	public wrapWarpingMatrixContainers(): void {
		return;
	}

	public createWarpingMatrixPlotState(
		plotHost: HTMLElement,
		width: number,
		height: number,
	): WarpingMatrixPlotState {
		void plotHost;
		void width;
		void height;
		throw new Error("warpingMatrix requires the sync player variant.");
	}

	public createWarpingTempoPlotState(
		plotHost: HTMLElement,
		width: number,
		height: number,
	): WarpingTempoPlotState {
		void plotHost;
		void width;
		void height;
		throw new Error("warpingMatrix requires the sync player variant.");
	}

	public applyWarpingMatrixPlotDimensions(
		plot: WarpingMatrixPlotState,
		width: number,
		height: number,
	): void {
		void plot;
		void width;
		void height;
	}

	public applyWarpingTempoPlotDimensions(
		plot: WarpingTempoPlotState,
		width: number,
		height: number,
	): void {
		void plot;
		void width;
		void height;
	}

	public isPointerInsidePlotArea(
		plotHost: HTMLElement,
		margins: WarpingPlotMargins,
		innerWidth: number,
		innerHeight: number,
		clientX: number,
		clientY: number,
	): boolean {
		void plotHost;
		void margins;
		void innerWidth;
		void innerHeight;
		void clientX;
		void clientY;
		return false;
	}

	public onWarpingMatrixPointerDown(
		host: WarpingMatrixHostMetadata,
		event: PointerEvent,
	): void {
		void host;
		void event;
	}

	public onWarpingMatrixPointerMove(
		host: WarpingMatrixHostMetadata,
		event: PointerEvent,
	): void {
		void host;
		void event;
	}

	public onWarpingMatrixPointerUp(
		host: WarpingMatrixHostMetadata,
		event: PointerEvent,
	): void {
		void host;
		void event;
	}

	public seekWarpingMatrixFromPointerX(
		host: WarpingMatrixHostMetadata,
		clientX: number,
	): void {
		void host;
		void clientX;
	}

	public onWarpingTempoPointerDown(
		host: WarpingMatrixHostMetadata,
		event: PointerEvent,
	): void {
		void host;
		void event;
	}

	public onWarpingTempoWheel(
		host: WarpingMatrixHostMetadata,
		event: WheelEvent,
	): void {
		void host;
		void event;
	}

	public seekWarpingMatrixFromTempoPointerX(
		host: WarpingMatrixHostMetadata,
		clientX: number,
	): void {
		void host;
		void clientX;
	}

	public getPrimaryWarpingSeriesData(
		host: WarpingMatrixHostMetadata,
	): WarpingMatrixPathSeriesData | null {
		void host;
		return null;
	}

	public getPrimaryTempoSeries(
		host: WarpingMatrixHostMetadata,
	): WarpingMatrixTempoPoint[] {
		void host;
		return [];
	}

	public getPrimaryTempoSeriesData(
		host: WarpingMatrixHostMetadata,
	): WarpingMatrixTempoSeriesData | null {
		void host;
		return null;
	}

	public ensureWarpingLayout(host: WarpingMatrixHostMetadata): void {
		void host;
	}

	public applyWarpingMatrixContext(
		host: WarpingMatrixHostMetadata,
		context: WarpingMatrixRenderContext,
	): void {
		void host;
		void context;
	}

	public updateWarpingMatrix(
		host: WarpingMatrixHostMetadata,
		context: WarpingMatrixRenderContext | undefined,
	): void {
		void host;
		void context;
	}

	public updateWarpingMatrixPlaybackState(
		host: WarpingMatrixHostMetadata,
		context: WarpingMatrixRenderContext | undefined,
	): void {
		void host;
		void context;
	}

	public setWarpingMatrixVisible(visible: boolean): void {
		void visible;
	}

	public renderWarpingMatrixPathPlot(
		host: WarpingMatrixHostMetadata,
		pathStrokeWidth: number,
	): void {
		void host;
		void pathStrokeWidth;
	}

	public renderWarpingMatrixPlayhead(host: WarpingMatrixHostMetadata): void {
		void host;
	}

	public renderWarpingMatrixTempoPlot(host: WarpingMatrixHostMetadata): void {
		void host;
	}

	public resolveCenteredWarpingWindow(
		center: number,
		windowSeconds: number,
		_maxTime: number,
	): [number, number] {
		const halfWindow = Math.max(0, windowSeconds) / 2;
		const maxTime = Math.max(0, _maxTime);
		const start = Math.max(0, Math.min(center - halfWindow, maxTime));
		const end = Math.max(start, Math.min(center + halfWindow, maxTime));
		return [start, end];
	}

	public buildWarpingMatrixData(
		trackSeries: WarpingMatrixTrackSeries[],
		referenceDuration: number,
	): WarpingMatrixMatrixData {
		void trackSeries;
		void referenceDuration;
		return { byColumn: new Map() };
	}

	public buildWarpingTempoData(
		matrixData: WarpingMatrixMatrixData | null,
		smoothingSeconds: number,
	): WarpingMatrixTempoData {
		void matrixData;
		void smoothingSeconds;
		return { byColumn: new Map() };
	}

	public interpolateWarpingTrackTime(
		points: WarpingMatrixPathPoint[],
		referenceTime: number,
	): number {
		void points;
		return referenceTime;
	}

	public interpolateWarpingReferenceTime(
		pointsByTrackTime: WarpingMatrixPathPoint[],
		trackTime: number,
	): number {
		void pointsByTrackTime;
		return trackTime;
	}

	public createWaveformTimingNode(overlay: HTMLElement): HTMLElement {
		return viewRendererWaveform.createWaveformTimingNode(this, overlay);
	}

	public createWaveformZoomNode(overlay: HTMLElement): HTMLElement {
		return viewRendererWaveform.createWaveformZoomNode(this, overlay);
	}

	public resolveWaveformBaseWidth(
		scrollContainer: HTMLElement,
		fallback: number,
	): number {
		return viewRendererWaveform.resolveWaveformBaseWidth(
			this,
			scrollContainer,
			fallback,
		);
	}

	public resolveMidiBaseWidth(
		scrollContainer: HTMLElement,
		fallback: number,
	): number {
		return viewRendererMidi.resolveMidiBaseWidth(
			this,
			scrollContainer,
			fallback,
		);
	}

	public setWaveformSurfaceWidth(
		surfaceMetadata: WaveformSeekSurfaceMetadata,
	): void {
		viewRendererWaveform.setWaveformSurfaceWidth(this, surfaceMetadata);
	}

	public forEachVisibleWaveformTile(
		surfaceMetadata: WaveformSeekSurfaceMetadata,
		callback: (tile: {
			tileIndex: number;
			tileStartPx: number;
			tileCssWidth: number;
			tileCssHeight: number;
			surfaceWidth: number;
			canvas: HTMLCanvasElement;
			renderBarWidth: number;
			isNew: boolean;
			record: {
				canvas: HTMLCanvasElement;
				lastDrawKey: string | null;
			};
		}) => void,
	): void {
		viewRendererWaveform.forEachVisibleWaveformTile(
			this,
			surfaceMetadata,
			callback,
		);
	}

	public scheduleVisibleWaveformTileRefresh(): void {
		viewRendererWaveform.scheduleVisibleWaveformTileRefresh(this);
	}

	public refreshVisibleWaveformTilesFromLatestInput(): void {
		viewRendererWaveform.refreshVisibleWaveformTilesFromLatestInput(this);
	}

	public computeNormalizationPeak(
		waveformEngine: WaveformEngine,
		sourceRuntimes: TrackRuntime[],
		renderBarWidth: number,
		duration: number,
		baseProjector: TrackTimelineProjector | undefined,
		baseWidth: number,
		ignoreTrackPadding?: boolean,
	): number {
		return viewRendererWaveform.computeNormalizationPeak(
			this,
			waveformEngine,
			sourceRuntimes,
			renderBarWidth,
			duration,
			baseProjector,
			baseWidth,
			ignoreTrackPadding,
		);
	}

	public buildWaveformNormalizationCacheKey(
		surfaceMetadata: WaveformSeekSurfaceMetadata,
		runtimes: TrackRuntime[],
		sourceRuntimes: TrackRuntime[],
		fullDuration: number,
		renderBarWidth: number,
		useLocalAxis: boolean,
		hasTimelineProjector: boolean,
	): string {
		return viewRendererWaveform.buildWaveformNormalizationCacheKey(
			this,
			surfaceMetadata,
			runtimes,
			sourceRuntimes,
			fullDuration,
			renderBarWidth,
			useLocalAxis,
			hasTimelineProjector,
		);
	}

	public findWaveformSurface(
		seekWrap: HTMLElement | null,
	): WaveformSeekSurfaceMetadata | null {
		return viewRendererWaveform.findWaveformSurface(this, seekWrap);
	}

	public findMidiSurface(
		seekWrap: HTMLElement | null,
	): MidiSeekSurfaceMetadata | null {
		return viewRendererMidi.findMidiSurface(this, seekWrap);
	}

	reflowWaveforms(): void {
		viewRendererWaveform.reflowWaveforms(this);
	}

	reflowMidiDisplays(): void {
		viewRendererMidi.reflowMidiDisplays(this);
	}

	getWaveformZoom(seekWrap: HTMLElement): number | null {
		return viewRendererWaveform.getWaveformZoom(this, seekWrap);
	}

	isWaveformZoomEnabled(
		seekWrap: HTMLElement,
		durationSeconds: number,
	): boolean {
		return viewRendererWaveform.isWaveformZoomEnabled(
			this,
			seekWrap,
			durationSeconds,
		);
	}

	public getWaveformMinimapViewport(
		seekWrap: HTMLElement,
	): { startRatio: number; widthRatio: number } | null {
		return viewRendererWaveform.getWaveformMinimapViewport(this, seekWrap);
	}

	setWaveformMinimapViewportStart(
		seekWrap: HTMLElement,
		startRatio: number,
	): boolean {
		return viewRendererWaveform.setWaveformMinimapViewportStart(
			this,
			seekWrap,
			startRatio,
		);
	}

	setWaveformZoom(
		seekWrap: HTMLElement,
		zoom: number,
		durationSeconds: number,
		anchorPageX?: number,
	): boolean {
		return viewRendererWaveform.setWaveformZoom(
			this,
			seekWrap,
			zoom,
			durationSeconds,
			anchorPageX,
		);
	}

	getMidiZoom(seekWrap: HTMLElement): number | null {
		return viewRendererMidi.getMidiZoom(this, seekWrap);
	}

	isMidiZoomEnabled(seekWrap: HTMLElement, durationSeconds: number): boolean {
		return viewRendererMidi.isMidiZoomEnabled(this, seekWrap, durationSeconds);
	}

	public getMidiMinimapViewport(
		seekWrap: HTMLElement,
	): { startRatio: number; widthRatio: number } | null {
		return viewRendererMidi.getMidiMinimapViewport(this, seekWrap);
	}

	setMidiMinimapViewportStart(
		seekWrap: HTMLElement,
		startRatio: number,
	): boolean {
		return viewRendererMidi.setMidiMinimapViewportStart(
			this,
			seekWrap,
			startRatio,
		);
	}

	setMidiZoom(
		seekWrap: HTMLElement,
		zoom: number,
		durationSeconds: number,
		anchorPageX?: number,
	): boolean {
		return viewRendererMidi.setMidiZoom(
			this,
			seekWrap,
			zoom,
			durationSeconds,
			anchorPageX,
		);
	}

	drawDummyWaveforms(waveformEngine: WaveformEngine): void {
		viewRendererWaveform.drawDummyWaveforms(this, waveformEngine);
	}

	renderWaveforms(
		waveformEngine: WaveformEngine,
		runtimes: TrackRuntime[],
		timelineDuration: number,
		trackTimelineProjector?: TrackTimelineProjector,
		waveformTimelineContext?: WaveformTimelineContext,
	): void {
		viewRendererWaveform.renderWaveforms(
			this,
			waveformEngine,
			runtimes,
			timelineDuration,
			trackTimelineProjector,
			waveformTimelineContext,
		);
	}

	public async initializeMidiDisplays(
		timelineDuration: number,
		useMidiLocalTimeline = false,
	): Promise<void> {
		return viewRendererMidi.initializeMidiDisplays(
			this,
			timelineDuration,
			useMidiLocalTimeline,
		);
	}

	public renderMidiDisplays(
		timelineDuration: number,
		useMidiLocalTimeline = false,
	): void {
		viewRendererMidi.renderMidiDisplays(
			this,
			timelineDuration,
			useMidiLocalTimeline,
		);
	}

	public updateMidiPlaybackState(
		state: TrackSwitchUiState,
		suppressPlaybackFollow: boolean,
		useMidiLocalTimeline = false,
		timelineContextResolver?: MidiTimelineContextResolver,
	): void {
		viewRendererMidi.updateMidiPlaybackState(
			this,
			state,
			suppressPlaybackFollow,
			useMidiLocalTimeline,
			timelineContextResolver,
		);
	}

	public updateMidiZoomIndicators(): void {
		viewRendererMidi.updateMidiZoomIndicators(this);
	}

	public destroyMidiDisplays(): void {
		viewRendererMidi.destroyMidiDisplays(this);
	}

	public renderWaveformsInternal(
		waveformEngine: WaveformEngine,
		runtimes: TrackRuntime[],
		timelineDuration: number,
		trackTimelineProjector?: TrackTimelineProjector,
		waveformTimelineContext?: WaveformTimelineContext,
		performReflow = true,
		forceRedrawVisibleTiles = true,
	): void {
		viewRendererWaveform.renderWaveformsInternal(
			this,
			waveformEngine,
			runtimes,
			timelineDuration,
			trackTimelineProjector,
			waveformTimelineContext,
			performReflow,
			forceRedrawVisibleTiles,
		);
	}

	public getWaveformSourceRuntimes(
		runtimes: TrackRuntime[],
		waveformSource: WaveformSource,
	): TrackRuntime[] {
		return viewRendererWaveform.getWaveformSourceRuntimes(
			this,
			runtimes,
			waveformSource,
		);
	}

	public resolveWaveformTrackIndex(
		runtimes: TrackRuntime[],
		waveformSource: WaveformSource,
	): number | null {
		return viewRendererWaveform.resolveWaveformTrackIndex(
			this,
			runtimes,
			waveformSource,
		);
	}

	updateMainControls(
		state: TrackSwitchUiState,
		runtimes: TrackRuntime[],
		waveformTimelineContext?: WaveformTimelineContext,
		warpingMatrixContext?: WarpingMatrixRenderContext,
	): void {
		viewRendererCore.updateMainControls(
			this,
			state,
			runtimes,
			waveformTimelineContext,
			warpingMatrixContext,
		);
	}

	updatePlaybackPosition(
		state: TrackSwitchUiState,
		runtimes: TrackRuntime[],
		waveformTimelineContext?: WaveformTimelineContext,
		warpingMatrixContext?: WarpingMatrixRenderContext,
	): void {
		viewRendererCore.updatePlaybackPosition(
			this,
			state,
			runtimes,
			waveformTimelineContext,
			warpingMatrixContext,
		);
	}

	public updateWaveformZoomIndicators(): void {
		viewRendererWaveform.updateWaveformZoomIndicators(this);
	}

	public applyFixedWaveformLocalSeekVisuals(
		state: TrackSwitchUiState,
		waveformTimelineContext?: WaveformTimelineContext,
	): void {
		viewRendererWaveform.applyFixedWaveformLocalSeekVisuals(
			this,
			state,
			waveformTimelineContext,
		);
	}

	public getLongestWaveformSourceDuration(
		runtimes: TrackRuntime[],
		waveformSource: WaveformSource,
	): number {
		return viewRendererWaveform.getLongestWaveformSourceDuration(
			this,
			runtimes,
			waveformSource,
		);
	}

	public updateWaveformTiming(
		state: TrackSwitchUiState,
		runtimes: TrackRuntime[],
		waveformTimelineContext?: WaveformTimelineContext,
	): void {
		viewRendererWaveform.updateWaveformTiming(
			this,
			state,
			runtimes,
			waveformTimelineContext,
		);
	}

	public updateWaveformPlaybackFollow(
		state: TrackSwitchUiState,
		runtimes: TrackRuntime[],
		waveformTimelineContext?: WaveformTimelineContext,
		suppressFollow = false,
	): void {
		viewRendererWaveform.updateWaveformPlaybackFollow(
			this,
			state,
			runtimes,
			waveformTimelineContext,
			suppressFollow,
		);
	}

	public updateSeekWrapVisuals(
		seekWrap: Element,
		position: number,
		duration: number,
		loop: { pointA: number | null; pointB: number | null; enabled: boolean },
	): void {
		if (!(seekWrap instanceof HTMLElement)) {
			return;
		}

		viewRendererSeek.updateSeekWrapVisuals(
			seekWrap,
			position,
			duration,
			loop,
			this.features.looping,
		);
	}

	updateTrackControls(
		runtimes: TrackRuntime[],
		syncLockedTrackIndexes?: ReadonlySet<number>,
		effectiveSingleSoloMode = this.features.exclusiveSolo,
		panSupported = true,
		syncEnabled = false,
	): void {
		viewRendererCore.updateTrackControls(
			this,
			runtimes,
			syncLockedTrackIndexes,
			effectiveSingleSoloMode,
			panSupported,
			syncEnabled,
		);
	}

	switchPosterImage(runtimes: TrackRuntime[]): void {
		viewRendererCore.switchPosterImage(this, runtimes);
	}

	setVolumeSlider(volumeZeroToOne: number): void {
		viewRendererCore.setVolumeSlider(this, volumeZeroToOne);
	}

	setTrackVolumeSlider(trackIndex: number, volumeZeroToOne: number): void {
		viewRendererCore.setTrackVolumeSlider(this, trackIndex, volumeZeroToOne);
	}

	setTrackPanSlider(trackIndex: number, panMinusOneToOne: number): void {
		viewRendererCore.setTrackPanSlider(this, trackIndex, panMinusOneToOne);
	}

	updateVolumeIcon(volumeZeroToOne: number): void {
		viewRendererCore.updateVolumeIcon(this, volumeZeroToOne);
	}

	public applyVolumeIconState(
		icon: HTMLElement,
		volumeZeroToOne: number,
	): void {
		viewRendererCore.applyVolumeIconState(this, icon, volumeZeroToOne);
	}

	setOverlayLoading(isLoading: boolean): void {
		viewRendererCore.setOverlayLoading(this, isLoading);
	}

	setShortcutHelpVisible(isVisible: boolean): void {
		viewRendererCore.setShortcutHelpVisible(this, isVisible);
	}

	updateOverlayDownloadInfo(info: AudioDownloadSizeInfo): void {
		viewRendererCore.updateOverlayDownloadInfo(this, info);
	}

	hideOverlayOnLoaded(): void {
		viewRendererCore.hideOverlayOnLoaded(this);
	}

	showError(message: string, runtimes: TrackRuntime[]): void {
		viewRendererCore.showError(this, message, runtimes);
	}

	destroy(): void {
		viewRendererCore.destroy(this);
	}

	getPresetCount(): number {
		return viewRendererCore.getPresetCount(this);
	}

	updateTiming(position: number, longestDuration: number): void {
		viewRendererCore.updateTiming(this, position, longestDuration);
	}
}
