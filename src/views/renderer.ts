import type { Midi } from "@tonejs/midi";
import type { ScaleContinuousNumeric, ScaleLinear, Selection } from "d3";
import type { ViewNormalizeContext } from "../config/views";
import type {
	TrackTimelineProjector,
	WaveformEngine,
} from "../media/waveform-engine";
import {
	formatTimelineValue,
	formatTimelineValuePair,
	type TimelineUnit,
	type TimelineValuePair,
} from "../model/timeline";
import { formatSecondsToHHMMSSmmm } from "../shared/format";
import type {
	AudioDownloadSizeInfo,
	MarkerLayerConfig,
	TrackId,
	TrackListGroup,
	TrackRuntime,
	TrackSwitchCssOverrides,
	TrackSwitchFeatures,
	TrackSwitchNavigationBarViewConfig,
	TrackSwitchUiState,
	TrackSwitchViewConfig,
	WaveformPlaybackFollowMode,
	WaveformSourceIndex,
	WaveformTimeAxis,
} from "../types";
import * as viewRendererCore from "./layout";
import { renderConfiguredViews } from "./layout";
import * as viewRendererMarkerEditing from "./marker-editing";
import type { MarkerRenderData } from "./markers";
import * as viewRendererMarkers from "./markers";
import * as viewRendererWarping from "./matrix";
import type {
	PianoRollSeekSurfaceMetadata,
	PianoRollTimelineContextResolver,
} from "./piano-roll";
import * as viewRendererPianoRoll from "./piano-roll";
import * as viewRendererSeek from "./surface";
import * as viewRendererWaveform from "./waveform";

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
	/**
	 * The current position on this track's own timeline, taken from the playback
	 * anchor rather than projected back out of the reference — see
	 * `playbackPositionOn`. Null when no anchor describes the position.
	 */
	getPlaybackPosition(trackIndex: number): number | null;
	getTrackDuration(trackIndex: number): number;
	getTrackCount(): number;
	getTrackAlignmentPoints(
		trackIndex: number,
	): Array<{ referenceTime: number; trackTime: number }>;
}

/**
 * How one timeline renders its own positions: the unit its alignment column was
 * declared in, and the conversion out of the native playback coordinate.
 */
export interface TimelineReadout {
	unit: TimelineUnit;
	toReadout(nativeValue: number): number;
	fromReadout(readoutValue: number): number;
}

export interface ConfiguredViewHost {
	view: TrackSwitchViewConfig;
	waveformSource?: WaveformSourceIndex;
	alignmentTimeline?: string;
	source?: string;
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
	/** The configured `maxHeight`, or null when unset — the base a fullscreen grow starts from. */
	configuredMaxHeight: number | null;
}

/** A seekable image bound to a media entry, so it carries its own timeline. */
export interface ImageSeekSurfaceMetadata {
	seekWrap: HTMLElement;
	wrapper: HTMLElement;
	image: HTMLImageElement;
	/** Alignment timeline this image is placed on, or null when unaligned. */
	alignmentColumn: string | null;
}

/** What a `perTrackImage` view swaps in when a track becomes the only soloed one. */
export interface PerTrackImageSource {
	src: string;
	/** Alignment column of the image medium, or "" when it is unaligned. */
	alignmentTimeline: string;
}

export interface ImageTimelineContext {
	duration: number;
	toReferenceTime(imageValue: number): number;
	fromReferenceTime(referenceTime: number): number;
	/** See `WaveformTimelineContext.getPlaybackPosition`. */
	playbackPosition?(): number | null;
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
	endedRegion: HTMLElement;
	seekWrap: HTMLElement;
	waveformSource: WaveformSourceIndex;
	playbackFollowMode: WaveformPlaybackFollowMode;
	/** Empty surface past the end of the medium; see `TimelineSurfaceGeometry`. */
	trailingPadPx?: number;
	timeAxis: WaveformTimeAxis;
	drawRange: viewRendererSeek.SeekSurfaceRangeRenderer | null;
	originalHeight: number;
	/** The configured `height`, immutable — the base a fullscreen grow restores to. */
	configuredHeight: number;
	barWidth: number;
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

interface LatestPianoRollRenderInput {
	timelineDuration: number;
	usePianoRollLocalTimeline: boolean;
}

export interface WarpingMatrixPathPoint {
	referenceTime: number;
	trackTime: number;
}

export interface WarpingMatrixPathSeriesData {
	pointsByReferenceTime: WarpingMatrixPathPoint[];
	pointsByTrackTime: WarpingMatrixPathPoint[];
	trackDuration: number;
}

export interface WarpingMatrixMatrixData {
	byColumn: Map<string, WarpingMatrixPathSeriesData>;
}

export interface WarpingMatrixTempoPoint {
	trackTime: number;
	referenceTime: number;
	tempoPercent: number;
}

export interface WarpingMatrixTempoSeriesData {
	points: WarpingMatrixTempoPoint[];
	isStrictlyMonotonic: boolean;
	warningMessage: string | null;
}

export interface WarpingMatrixTempoData {
	byColumn: Map<string, WarpingMatrixTempoSeriesData>;
}

export interface WarpingPlotMargins {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export interface WarpingMatrixPlotState {
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

export interface WarpingTempoPlotState {
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
	yScale: ScaleContinuousNumeric<number, number>;
	margins: WarpingPlotMargins;
	innerWidth: number;
	innerHeight: number;
}

export interface WarpingMatrixHostMetadata {
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
	tempoWindowValueNode: HTMLSpanElement;
	tempoSmoothingSlider: HTMLInputElement;
	tempoSmoothingValueNode: HTMLSpanElement;
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
	/** The author-declared height, immutable — null means it auto-sizes, which is what makes it eligible to grow in fullscreen. */
	authoredHeight: number | null;
	/** The effective height captured just before a fullscreen grow, so exiting can restore it exactly. */
	preFullscreenHeight: number | null;
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

/** A panel with a configured height, eligible to share in a fullscreen grow. */
interface FullscreenGrowTarget {
	baseHeight: number;
	setHeight(height: number): void;
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
	public presetEntries: Array<{ id: string; label: string }>;
	public trackGroups: TrackListGroup[];
	public navigationBar: TrackSwitchNavigationBarViewConfig | null = null;
	/**
	 * Whether a track's `trackList` currently permits only one audible track. The
	 * controller answers this, since global sync can override what the lists declare.
	 */
	public isTrackExclusive: (trackIndex: number) => boolean = () => false;
	/** The same question for one `trackList`, used where a row's own list is known. */
	public isGroupExclusive: (groupIndex: number) => boolean = () => false;
	/** Whether a track is currently sounding, as an `audible` waveform reads it. */
	public isTrackAudible: (trackIndex: number) => boolean = () => true;
	/** Whether a `trackList` is the selected timeline of an aligned player. */
	public isTrackListUnitActive: (groupIndex: number) => boolean = () => false;
	public hasAlignment = false;
	public referenceTimelineUnit: TimelineUnit = "seconds";
	public referenceTimelineId: string | null = null;
	public toReferenceReadout: ((referenceValue: number) => number) | null = null;
	public fromReferenceReadout: ((readoutValue: number) => number) | null = null;
	/**
	 * Declared unit and native-to-readout conversion per timeline, so a waveform
	 * or piano roll can render its own local time in the unit its alignment
	 * column was authored in rather than always in seconds.
	 */
	public timelineReadouts: ReadonlyMap<string, TimelineReadout> = new Map();

	public readonly waveformSeekSurfaces: WaveformSeekSurfaceMetadata[] = [];
	public readonly pianoRollSeekSurfaces: PianoRollSeekSurfaceMetadata[] = [];
	public readonly imageSeekSurfaces: ImageSeekSurfaceMetadata[] = [];
	public readonly sheetMusicHosts: SheetMusicHostConfig[] = [];
	public readonly warpingMatrixHosts: WarpingMatrixHostMetadata[] = [];
	public readonly configuredViewHosts = new WeakMap<
		Element,
		ConfiguredViewHost
	>();
	public readonly timelineBySeekWrap = new WeakMap<HTMLElement, string>();
	public perTrackImageSources = new Map<TrackId, PerTrackImageSource>();
	public isTimelineCovered: ((alignmentTimeline: string) => boolean) | null =
		null;
	public imageTimelineContextResolver:
		| ((surface: ImageSeekSurfaceMetadata) => ImageTimelineContext | null)
		| null = null;
	public readonly markerLayersBySeekWrap = new WeakMap<
		HTMLElement,
		MarkerLayerConfig[]
	>();
	public waveformTileRefreshFrameId: number | null = null;
	public latestWaveformRenderInput: LatestWaveformRenderInput | null = null;
	public pianoRollNoteRefreshFrameId: number | null = null;
	public latestPianoRollRenderInput: LatestPianoRollRenderInput | null = null;
	public readonly onWarpingMatrixSeek?: (referenceTime: number) => void;
	public readonly resolveWarpingMatrixScoreBpm?: (
		referenceTime: number,
	) => number | null;
	public css: TrackSwitchCssOverrides | undefined;
	/**
	 * The root element outlives a config update — `resetManagedRoot` replaces its
	 * children but leaves its inline properties — so the tokens written last time
	 * have to be cleared, or one dropped from the config lingers.
	 */
	public appliedRootCssTokens: string[] = [];
	public warpingClipPathCounter = 0;
	public panelDragState: PanelDragState | null = null;
	public readonly warpingMatrixTempoControlState = new WeakMap<
		HTMLElement,
		{ windowSeconds: number; smoothingSeconds: number }
	>();

	constructor(
		root: HTMLElement,
		features: TrackSwitchFeatures,
		presetEntries: Array<{ id: string; label: string }>,
		trackGroups: TrackListGroup[] = [],
		onWarpingMatrixSeek?: (referenceTime: number) => void,
		resolveWarpingMatrixScoreBpm?: (referenceTime: number) => number | null,
		css?: TrackSwitchCssOverrides,
	) {
		this.root = root;
		this.features = features;
		this.presetEntries = presetEntries;
		this.trackGroups = trackGroups;
		this.onWarpingMatrixSeek = onWarpingMatrixSeek;
		this.resolveWarpingMatrixScoreBpm = resolveWarpingMatrixScoreBpm;
		this.css = css;
	}

	public updateConfig(
		presetEntries: Array<{ id: string; label: string }>,
		trackGroups: TrackListGroup[],
		css?: TrackSwitchCssOverrides,
	): void {
		this.presetEntries = presetEntries;
		this.trackGroups = trackGroups;
		this.css = css;
	}

	public renderViews(
		views: TrackSwitchViewConfig[],
		context: ViewNormalizeContext,
	): void {
		this.navigationBar =
			views.find((view) => view.type === "navigationBar") ?? null;
		renderConfiguredViews(this, views, context);
	}

	public registerConfiguredViewHost(
		element: Element,
		definition: ConfiguredViewHost,
	): void {
		this.configuredViewHosts.set(element, definition);
	}

	public getConfiguredViewHost(element: Element): ConfiguredViewHost {
		const definition = this.configuredViewHosts.get(element);
		if (!definition) {
			throw new Error("Missing typed view definition for rendered surface.");
		}
		return definition;
	}

	public registerSeekMarkerLayers(
		seekWrap: HTMLElement,
		layers: MarkerLayerConfig[] | undefined,
	): void {
		if (layers?.length) this.markerLayersBySeekWrap.set(seekWrap, layers);
	}

	public getSeekMarkerLayers(seekWrap: HTMLElement): MarkerLayerConfig[] {
		return this.markerLayersBySeekWrap.get(seekWrap) ?? [];
	}

	/** Records which alignment timeline a seek surface renders, for coverage state. */
	public registerSeekTimeline(
		seekWrap: HTMLElement,
		alignmentTimeline: string | null,
	): void {
		if (alignmentTimeline) {
			this.timelineBySeekWrap.set(seekWrap, alignmentTimeline);
			return;
		}
		// A per-track surface changes timeline as the solo moves, so clearing has
		// to actually clear.
		this.timelineBySeekWrap.delete(seekWrap);
	}

	/**
	 * Places an already-wrapped image on a different alignment column — what a
	 * `perTrackImage` surface does when the solo moves to another track.
	 */
	public retimeImageSurface(
		image: HTMLImageElement,
		alignmentTimeline: string,
	): void {
		const surface = this.imageSeekSurfaces.find(
			(candidate) => candidate.image === image,
		);
		if (!surface) {
			return;
		}
		const column = alignmentTimeline.trim();
		surface.alignmentColumn = column || null;
		this.registerSeekTimeline(surface.seekWrap, surface.alignmentColumn);
		if (surface.alignmentColumn) {
			surface.seekWrap.setAttribute("data-seek-surface", "image");
			return;
		}
		surface.seekWrap.removeAttribute("data-seek-surface");
	}

	public setPerTrackImageSources(
		sources: Map<TrackId, PerTrackImageSource>,
	): void {
		this.perTrackImageSources = sources;
	}

	public getSeekTimeline(seekWrap: HTMLElement): string | null {
		return this.timelineBySeekWrap.get(seekWrap) ?? null;
	}

	public findImageSurface(
		seekWrap: HTMLElement | null,
	): ImageSeekSurfaceMetadata | null {
		if (!seekWrap) {
			return null;
		}
		return (
			this.imageSeekSurfaces.find((surface) => surface.seekWrap === seekWrap) ??
			null
		);
	}

	/**
	 * Answers whether a timeline has alignment data at the current reference
	 * position; surfaces that do not are rendered as held out of coverage.
	 */
	public setCoverageResolver(
		resolver: ((alignmentTimeline: string) => boolean) | null,
		referenceTimeline: string | null = null,
	): void {
		this.isTimelineCovered = resolver;
		this.referenceTimelineId = referenceTimeline;
	}

	public setImageTimelineContextResolver(
		resolver:
			| ((surface: ImageSeekSurfaceMetadata) => ImageTimelineContext | null)
			| null,
	): void {
		this.imageTimelineContextResolver = resolver;
	}

	/** The local axis of an aligned image, or null for a linearly-mapped one. */
	public resolveImageTimelineContext(
		seekWrap: HTMLElement,
	): ImageTimelineContext | null {
		if (!this.imageTimelineContextResolver) {
			return null;
		}
		const surface = this.findImageSurface(seekWrap);
		if (!surface?.alignmentColumn) {
			return null;
		}
		return this.imageTimelineContextResolver(surface);
	}

	/**
	 * Converts a native reference-timeline position back into the unit declared
	 * for that column.
	 */
	public setReferenceTimelineUnit(
		unit: TimelineUnit,
		toReferenceReadout?: (referenceValue: number) => number,
		fromReferenceReadout?: (readoutValue: number) => number,
	): void {
		this.referenceTimelineUnit = unit;
		this.toReferenceReadout = toReferenceReadout ?? null;
		this.fromReferenceReadout = fromReferenceReadout ?? null;
	}

	/**
	 * A span authored in the unit of the reference timeline — the axis every
	 * waveform seeks on — in seconds. Taken at the origin, as
	 * `resolveLocalSpanSeconds` is.
	 */
	public resolveReferenceSpanSeconds(value: number): number {
		const fromReadout = this.fromReferenceReadout;
		return fromReadout ? fromReadout(value) - fromReadout(0) : value;
	}

	public formatReferenceTimelineValue(value: number): string {
		const readout = this.toReferenceReadout
			? this.toReferenceReadout(value)
			: value;
		return formatTimelineValue(this.referenceTimelineUnit, readout);
	}

	/** The main timer's two halves, which name their unit once between them. */
	public formatReferenceTimelinePair(
		position: number,
		duration: number,
	): TimelineValuePair {
		const toReadout = this.toReferenceReadout;
		return formatTimelineValuePair(
			this.referenceTimelineUnit,
			toReadout ? toReadout(position) : position,
			toReadout ? toReadout(duration) : duration,
		);
	}

	public setTimelineReadouts(
		readouts: ReadonlyMap<string, TimelineReadout>,
	): void {
		this.timelineReadouts = readouts;
	}

	/**
	 * A span authored in the unit of a timeline — a zoom window, say — in
	 * seconds. Taken at the origin, so a unit that runs at a varying rate against
	 * seconds (ticks under a tempo change, measures) yields the span it has at the
	 * start of the medium. A timeline with no declared unit has nothing but
	 * seconds to offer, and the value stands as it is.
	 */
	public resolveLocalSpanSeconds(
		timeline: string | null,
		value: number,
	): number {
		const readout =
			timeline === null ? undefined : this.timelineReadouts.get(timeline);
		if (!readout) {
			return value;
		}

		return readout.fromReadout(value) - readout.fromReadout(0);
	}

	/**
	 * A surface timer, rendered in the unit of the timeline it draws. A timeline
	 * with no declared unit has nothing but seconds to render.
	 */
	public formatLocalTimelinePair(
		timeline: string | null,
		position: number,
		duration: number,
	): string {
		const readout =
			timeline === null ? undefined : this.timelineReadouts.get(timeline);
		if (!readout) {
			return `${formatSecondsToHHMMSSmmm(position)} / ${formatSecondsToHHMMSSmmm(duration)}`;
		}
		const pair = formatTimelineValuePair(
			readout.unit,
			readout.toReadout(position),
			readout.toReadout(duration),
		);
		return `${pair.position} / ${pair.duration}`;
	}

	/** Formats one native position in the unit declared for its local timeline. */
	public formatLocalTimelineValue(
		timeline: string | null,
		value: number,
	): string {
		const readout =
			timeline === null ? undefined : this.timelineReadouts.get(timeline);
		return readout
			? formatTimelineValue(readout.unit, readout.toReadout(value))
			: formatSecondsToHHMMSSmmm(value);
	}

	public query(selector: string): HTMLElement | null {
		return viewRendererCore.query(this, selector);
	}

	public queryAll(selector: string): HTMLElement[] {
		return viewRendererCore.queryAll(this, selector);
	}

	public isAlignmentMode(): boolean {
		return this.hasAlignment;
	}

	public getWarpingMatrixPathStrokeWidth(): number {
		return viewRendererWarping.getWarpingMatrixPathStrokeWidth();
	}

	public getWarpingMatrixLocalTempoWindowSeconds(
		host: WarpingMatrixHostMetadata,
	): number {
		return viewRendererWarping.getWarpingMatrixLocalTempoWindowSeconds(host);
	}

	public getWarpingMatrixLocalTempoSmoothingSeconds(
		host: WarpingMatrixHostMetadata,
	): number {
		return viewRendererWarping.getWarpingMatrixLocalTempoSmoothingSeconds(host);
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
		return viewRendererWarping.getWarpingMatrixSquarePlotSize(plot);
	}

	public resolveWarpingMatrixColumnColor(
		columnKey: string,
		columnOrder: string[],
	): string {
		return viewRendererWarping.resolveWarpingMatrixColumnColor(
			columnKey,
			columnOrder,
		);
	}

	initialize(runtimes: TrackRuntime[]): void {
		viewRendererCore.initialize(this, runtimes);
	}

	public buildPlayerOverlayHtml(runtimes: TrackRuntime[]): string {
		return viewRendererCore.buildPlayerOverlayHtml(this, runtimes);
	}

	public buildMainControlHtml(runtimes: TrackRuntime[]): string {
		return viewRendererCore.buildMainControlHtml(this, runtimes);
	}

	public shouldRenderGlobalSync(runtimes: TrackRuntime[]): boolean {
		return viewRendererCore.shouldRenderGlobalSync(this, runtimes);
	}

	public buildTrackRow(
		runtime: TrackRuntime,
		index: number,
		trackListOptions: TrackListGroup,
	): HTMLElement {
		return viewRendererCore.buildTrackRow(
			this,
			runtime,
			index,
			trackListOptions,
		);
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

	public renderTimelineMarkers(data: MarkerRenderData): ReadonlySet<string> {
		return viewRendererMarkers.renderTimelineMarkers(this, data);
	}

	public updateMarkerNavigationControls(
		canGoPrevious: boolean,
		canGoNext: boolean,
		canOpenDialog: boolean,
	): void {
		viewRendererMarkers.updateMarkerNavigationControls(
			this.root,
			canGoPrevious,
			canGoNext,
			canOpenDialog,
		);
	}

	public openMarkerNavigationDialog(
		sets: viewRendererMarkers.MarkerNavigationSetOption[],
	): void {
		viewRendererMarkers.openMarkerNavigationDialog(this.root, sets);
	}

	public closeMarkerNavigationDialog(): void {
		viewRendererMarkers.closeMarkerNavigationDialog(this.root);
	}

	public updateMarkerNavigationDialogSets(
		sets: viewRendererMarkers.MarkerNavigationSetOption[],
	): void {
		viewRendererMarkers.updateMarkerNavigationDialogSets(this.root, sets);
	}

	public updateMarkerEditingControls(
		state: viewRendererMarkerEditing.MarkerEditingControlsState,
	): void {
		viewRendererMarkerEditing.updateMarkerEditingControls(this.root, state);
	}

	public openMarkerLabelEditor(
		seekWrap: HTMLElement,
		options: viewRendererMarkerEditing.MarkerLabelEditorOptions,
	): void {
		viewRendererMarkerEditing.openMarkerLabelEditor(
			this.root,
			seekWrap,
			options,
		);
	}

	/**
	 * Draws a stretch of the surface behind `seekWrap` — waveform, notes or image
	 * — magnified into `canvas`. Ratios are fractions of the seek surface's width.
	 */
	public drawSeekSurfaceRange(
		seekWrap: HTMLElement,
		canvas: HTMLCanvasElement,
		cssWidth: number,
		cssHeight: number,
		startRatio: number,
		widthRatio: number,
	): void {
		const pianoRoll = this.findPianoRollSurface(seekWrap);
		if (pianoRoll) {
			viewRendererPianoRoll.drawPianoRollRange(
				pianoRoll,
				canvas,
				cssWidth,
				cssHeight,
				startRatio,
				widthRatio,
			);
			return;
		}
		const waveform = this.findWaveformSurface(seekWrap);
		if (waveform) {
			waveform.drawRange?.(canvas, cssWidth, cssHeight, startRatio, widthRatio);
			return;
		}
		viewRendererMarkerEditing.drawImageSurfaceRange(
			seekWrap,
			canvas,
			cssWidth,
			cssHeight,
			startRatio,
			widthRatio,
		);
	}

	public openMarkerLoupe(
		seekWrap: HTMLElement,
		clientX: number,
	): viewRendererMarkerEditing.MarkerLoupe {
		return viewRendererMarkerEditing.openMarkerLoupe(
			this.root,
			seekWrap,
			clientX,
		);
	}

	public closeMarkerLabelEditor(commit = false): void {
		viewRendererMarkerEditing.closeMarkerLabelEditor(this.root, commit);
	}

	public handleMarkerNavigationInteraction(
		eventType: string,
		target: Element | null,
	): void {
		viewRendererMarkers.handleMarkerNavigationInteraction(
			this.root,
			eventType,
			target,
		);
	}

	public handleMarkerNavigationComboboxKeydown(
		key: string,
		target: Element | null,
	): boolean {
		return viewRendererMarkers.handleMarkerNavigationComboboxKeydown(
			this.root,
			key,
			target,
		);
	}

	public validateMarkerNavigationDialogSelections(): boolean {
		return viewRendererMarkers.validateMarkerNavigationDialogSelections(
			this.root,
		);
	}

	public setMarkerNavigationDialogError(message: string): void {
		viewRendererMarkers.setMarkerNavigationDialogError(this.root, message);
	}

	public readMarkerNavigationDialogValues(): viewRendererMarkers.MarkerNavigationDialogValues {
		return viewRendererMarkers.readMarkerNavigationDialogValues(this.root);
	}

	public trapMarkerNavigationDialogFocus(shiftKey: boolean): void {
		viewRendererMarkers.trapMarkerNavigationDialogFocus(this.root, shiftKey);
	}

	public wrapWaveformCanvases(): void {
		viewRendererWaveform.wrapWaveformCanvases(this);
	}

	public wrapPianoRollCanvases(): void {
		viewRendererPianoRoll.wrapPianoRollCanvases(this);
	}

	public wrapSheetMusicContainers(): void {
		viewRendererCore.wrapSheetMusicContainers(this);
	}

	getPreparedSheetMusicHosts(): SheetMusicHostConfig[] {
		return viewRendererCore.getPreparedSheetMusicHosts(this);
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
		viewRendererWarping.applyWarpingMatrixPlotDimensions(plot, width, height);
	}

	public applyWarpingTempoPlotDimensions(
		plot: WarpingTempoPlotState,
		width: number,
		height: number,
	): void {
		viewRendererWarping.applyWarpingTempoPlotDimensions(plot, width, height);
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
		return viewRendererWarping.getPrimaryWarpingSeriesData(host);
	}

	public getPrimaryTempoSeries(
		host: WarpingMatrixHostMetadata,
	): WarpingMatrixTempoPoint[] {
		return viewRendererWarping.getPrimaryTempoSeries(host);
	}

	public getPrimaryTempoSeriesData(
		host: WarpingMatrixHostMetadata,
	): WarpingMatrixTempoSeriesData | null {
		return viewRendererWarping.getPrimaryTempoSeriesData(host);
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

	public drawDummyWarpingMatrices(): void {
		viewRendererWarping.drawDummyWarpingMatrices(this);
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
		points: WarpingMatrixPathPoint[],
		referenceTime: number,
	): number {
		return viewRendererWarping.interpolateWarpingTrackTime(
			points,
			referenceTime,
		);
	}

	public interpolateWarpingReferenceTime(
		pointsByTrackTime: WarpingMatrixPathPoint[],
		trackTime: number,
	): number {
		return viewRendererWarping.interpolateWarpingReferenceTime(
			pointsByTrackTime,
			trackTime,
		);
	}

	public resolveTimelineBaseWidth(
		scrollContainer: HTMLElement,
		fallback: number,
	): number {
		return viewRendererSeek.resolveTimelineBaseWidth(scrollContainer, fallback);
	}

	public setWaveformSurfaceWidth(
		surfaceMetadata: WaveformSeekSurfaceMetadata,
	): void {
		viewRendererWaveform.setWaveformSurfaceWidth(surfaceMetadata);
	}

	public forEachVisibleWaveformTile(
		surfaceMetadata: WaveformSeekSurfaceMetadata,
		callback: (tile: {
			tileIndex: number;
			tileStartPx: number;
			tileCssWidth: number;
			tileCssHeight: number;
			surfaceWidth: number;
			timeWidth: number;
			canvas: HTMLCanvasElement;
			renderBarWidth: number;
			isNew: boolean;
			record: {
				canvas: HTMLCanvasElement;
				lastDrawKey: string | null;
			};
		}) => void,
	): void {
		viewRendererWaveform.forEachVisibleWaveformTile(surfaceMetadata, callback);
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
	): number {
		return viewRendererWaveform.computeNormalizationPeak(
			waveformEngine,
			sourceRuntimes,
			renderBarWidth,
			duration,
			baseProjector,
			baseWidth,
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

	public findPianoRollSurface(
		seekWrap: HTMLElement | null,
	): PianoRollSeekSurfaceMetadata | null {
		return viewRendererPianoRoll.findPianoRollSurface(this, seekWrap);
	}

	reflowWaveforms(): void {
		viewRendererWaveform.reflowWaveforms(this);
	}

	reflowPianoRollDisplays(): void {
		viewRendererPianoRoll.reflowPianoRollDisplays(this);
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

	getPianoRollZoom(seekWrap: HTMLElement): number | null {
		return viewRendererPianoRoll.getPianoRollZoom(this, seekWrap);
	}

	isPianoRollZoomEnabled(
		seekWrap: HTMLElement,
		durationSeconds: number,
	): boolean {
		return viewRendererPianoRoll.isPianoRollZoomEnabled(
			this,
			seekWrap,
			durationSeconds,
		);
	}

	public getPianoRollMinimapViewport(
		seekWrap: HTMLElement,
	): { startRatio: number; widthRatio: number } | null {
		return viewRendererPianoRoll.getPianoRollMinimapViewport(this, seekWrap);
	}

	setPianoRollMinimapViewportStart(
		seekWrap: HTMLElement,
		startRatio: number,
	): boolean {
		return viewRendererPianoRoll.setPianoRollMinimapViewportStart(
			this,
			seekWrap,
			startRatio,
		);
	}

	setPianoRollZoom(
		seekWrap: HTMLElement,
		zoom: number,
		durationSeconds: number,
		anchorPageX?: number,
	): boolean {
		return viewRendererPianoRoll.setPianoRollZoom(
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

	public async loadMidiSources(): Promise<void> {
		return viewRendererPianoRoll.loadMidiSources(this);
	}

	public getLoadedMidiBySource(): Map<string, Midi> {
		return viewRendererPianoRoll.getLoadedMidiBySource(this);
	}

	public async initializePianoRollDisplays(
		timelineDuration: number,
		usePianoRollLocalTimeline = false,
	): Promise<void> {
		return viewRendererPianoRoll.initializePianoRollDisplays(
			this,
			timelineDuration,
			usePianoRollLocalTimeline,
		);
	}

	public renderPianoRollDisplays(
		timelineDuration: number,
		usePianoRollLocalTimeline = false,
	): void {
		viewRendererPianoRoll.renderPianoRollDisplays(
			this,
			timelineDuration,
			usePianoRollLocalTimeline,
		);
	}

	public updatePianoRollChannelVisibility(runtimes: TrackRuntime[]): void {
		viewRendererPianoRoll.updatePianoRollChannelVisibility(this, runtimes);
	}

	public resolvePianoRollTrackChannelColors(trackId: TrackId): string[] | null {
		return viewRendererPianoRoll.resolvePianoRollTrackChannelColors(
			this,
			trackId,
		);
	}

	public updatePianoRollPlaybackState(
		state: TrackSwitchUiState,
		suppressPlaybackFollow: boolean,
		usePianoRollLocalTimeline = false,
		timelineContextResolver?: PianoRollTimelineContextResolver,
		animate = false,
	): void {
		viewRendererPianoRoll.updatePianoRollPlaybackState(
			this,
			state,
			suppressPlaybackFollow,
			usePianoRollLocalTimeline,
			timelineContextResolver,
			animate,
		);
	}

	public refreshPianoRollNoteTiles(): void {
		viewRendererPianoRoll.refreshPianoRollNoteTiles(this);
	}

	public schedulePianoRollNoteRefresh(): void {
		viewRendererPianoRoll.schedulePianoRollNoteRefresh(this);
	}

	public destroyPianoRollDisplays(): void {
		viewRendererPianoRoll.destroyPianoRollDisplays(this);
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
		waveformSource: WaveformSourceIndex,
	): TrackRuntime[] {
		return viewRendererWaveform.getWaveformSourceRuntimes(
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

	public applyWaveformLocalSeekVisuals(
		state: TrackSwitchUiState,
		runtimes: TrackRuntime[],
		waveformTimelineContext?: WaveformTimelineContext,
	): void {
		viewRendererWaveform.applyWaveformLocalSeekVisuals(
			this,
			state,
			runtimes,
			waveformTimelineContext,
		);
	}

	public getLongestWaveformSourceDuration(
		runtimes: TrackRuntime[],
		waveformSource: WaveformSourceIndex,
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
		animate = false,
	): void {
		viewRendererWaveform.updateWaveformPlaybackFollow(
			this,
			state,
			runtimes,
			waveformTimelineContext,
			suppressFollow,
			animate,
		);
	}

	public applySeekWrapCoverageState(seekWrap: HTMLElement): void {
		viewRendererCore.applySeekWrapCoverageState(this, seekWrap);
	}

	public formatImageTimelineValue(value: number): string {
		return formatTimelineValue("percent", value);
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

		const surfaceKind = seekWrap.getAttribute("data-seek-surface");
		let formatValue: (value: number) => string;
		if (surfaceKind === "waveform" || surfaceKind === "piano-roll") {
			formatValue = formatSecondsToHHMMSSmmm;
		} else if (surfaceKind === "image") {
			// An aligned image reports its own axis, in percent of its width.
			formatValue = (value: number) => this.formatImageTimelineValue(value);
		} else {
			formatValue = (value: number) => this.formatReferenceTimelineValue(value);
		}
		viewRendererSeek.updateSeekWrapVisuals(
			seekWrap,
			position,
			duration,
			loop,
			!!this.navigationBar?.controls.includes("looping"),
			formatValue,
		);
	}

	updateTrackControls(
		runtimes: TrackRuntime[],
		syncLockedTrackIndexes?: ReadonlySet<number>,
		stereoPanningSupported = true,
		syncEnabled = false,
	): void {
		viewRendererCore.updateTrackControls(
			this,
			runtimes,
			syncLockedTrackIndexes,
			stereoPanningSupported,
			syncEnabled,
		);
	}

	switchPosterImage(runtimes: TrackRuntime[]): void {
		viewRendererCore.switchPosterImage(this, runtimes);
	}

	setVolumeSlider(volumeZeroToOne: number): void {
		viewRendererCore.setVolumeSlider(this, volumeZeroToOne);
	}

	setPanSlider(panMinusOneToOne: number): void {
		viewRendererCore.setPanSlider(this, panMinusOneToOne);
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
		viewRendererCore.applyVolumeIconState(icon, volumeZeroToOne);
	}

	setOverlayLoading(isLoading: boolean): void {
		viewRendererCore.setOverlayLoading(this, isLoading);
	}

	setShortcutHelpVisible(isVisible: boolean): void {
		viewRendererCore.setShortcutHelpVisible(this, isVisible);
	}

	setFullscreen(active: boolean): void {
		if (this.root.classList.contains("ts-fullscreen") === active) {
			return;
		}

		viewRendererCore.setFullscreen(this, active);
		this.reflowWaveforms();
		this.reflowPianoRollDisplays();
		this.applyFullscreenPanelHeights(active);
	}

	/** Re-measures and redistributes panel heights against the current viewport, for a resize while fullscreen is already active. */
	refreshFullscreenPanelHeights(): void {
		if (!this.root.classList.contains("ts-fullscreen")) {
			return;
		}

		this.applyFullscreenPanelHeights(false);
		this.applyFullscreenPanelHeights(true);
	}

	/**
	 * Redistributes the extra vertical space fullscreen mode opens up among the
	 * panels that have a configured height — waveform/piano-roll surfaces, a bounded
	 * sheet music panel, and an unconfigured (auto-sized) warping matrix. Panels
	 * with no notion of a configured height (text, images, separators) are left
	 * alone; an explicit `warpingMatrix.height` is also left alone, since that is
	 * the author's own choice.
	 */
	private applyFullscreenPanelHeights(active: boolean): void {
		const targets: FullscreenGrowTarget[] = [];

		this.waveformSeekSurfaces.forEach((surface) => {
			targets.push({
				baseHeight: surface.configuredHeight,
				setHeight: (height) =>
					viewRendererWaveform.setWaveformSurfaceHeight(this, surface, height),
			});
		});

		this.pianoRollSeekSurfaces.forEach((surface) => {
			targets.push({
				baseHeight: surface.configuredHeight,
				setHeight: (height) =>
					viewRendererPianoRoll.setPianoRollSurfaceHeight(
						this,
						surface,
						height,
					),
			});
		});

		this.sheetMusicHosts.forEach((host) => {
			if (host.configuredMaxHeight === null) {
				return;
			}
			const scrollContainer = host.scrollContainer;
			targets.push({
				baseHeight: host.configuredMaxHeight,
				setHeight: (height) => {
					scrollContainer.style.maxHeight = `${height}px`;
					scrollContainer.style.height = `${height}px`;
					scrollContainer.style.minHeight = `${height}px`;
				},
			});
		});

		this.warpingMatrixHosts.forEach((host) => {
			if (host.authoredHeight !== null) {
				return;
			}
			const base =
				host.preFullscreenHeight ??
				host.configuredHeight ??
				Math.max(180, host.matrixPanel.clientHeight || 220);
			targets.push({
				baseHeight: base,
				setHeight: (height) => {
					host.preFullscreenHeight = base;
					host.configuredHeight = height;
					this.ensureWarpingLayout(host);
				},
			});
		});

		if (!active) {
			targets.forEach((target) => {
				target.setHeight(target.baseHeight);
			});
			this.warpingMatrixHosts.forEach((host) => {
				host.preFullscreenHeight = null;
			});
			return;
		}

		if (targets.length === 0) {
			return;
		}

		const totalBase = targets.reduce(
			(sum, target) => sum + target.baseHeight,
			0,
		);
		const available = this.root.clientHeight;
		// The root's own scrollHeight is useless here: fullscreen positioning
		// (`inset`) forces the root to a definite viewport-derived height, so
		// `scrollHeight` reports that forced height back rather than the shorter
		// natural stack. Summing the direct children's own (still base-sized, since
		// no target has been grown yet) rendered heights gives the real figure.
		const used = Array.from(this.root.children).reduce(
			(sum, child) =>
				sum + (child as HTMLElement).getBoundingClientRect().height,
			0,
		);
		const extra = available - used;

		if (extra <= 0 || totalBase <= 0) {
			return;
		}

		targets.forEach((target) => {
			const share = (extra * target.baseHeight) / totalBase;
			target.setHeight(Math.round(target.baseHeight + share));
		});
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
