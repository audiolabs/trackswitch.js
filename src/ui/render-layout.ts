import type { ScaleContinuousNumeric, ScaleLinear, Selection } from "d3";
import type {
	AudioDownloadSizeInfo,
	NormalizedTrackGroupLayout,
	TrackRuntime,
} from "../domain/types";
import {
	escapeHtml,
	getDeepActiveElement,
	sanitizeInlineStyle,
} from "../shared/dom";
import {
	formatBytesToHumanReadable,
	formatSecondsToHHMMSSmmm,
} from "../shared/format";
import { clampPercent } from "../shared/math";
import { getHostIconSlot, renderIconSlotHtml, setHostIcon } from "./icons";

type SvgSelection = Selection<SVGSVGElement, unknown, null, undefined>;
type GroupSelection = Selection<SVGGElement, unknown, null, undefined>;
type PathSelection = Selection<SVGPathElement, unknown, null, undefined>;
type RectSelection = Selection<SVGRectElement, unknown, null, undefined>;
type LineSelection = Selection<SVGLineElement, unknown, null, undefined>;
type CircleSelection = Selection<SVGCircleElement, unknown, null, undefined>;
type TextSelection = Selection<SVGTextElement, unknown, null, undefined>;

const TRACKSWITCH_ROOT_CLASSES = [
	"trackswitch",
	"error",
	"sync-enabled",
	"ts-panel-reorder-active",
] as const;

function resetManagedRoot(root: HTMLElement): void {
	TRACKSWITCH_ROOT_CLASSES.forEach((className) => {
		root.classList.remove(className);
	});

	const activeElement = getDeepActiveElement(root);
	if (activeElement instanceof HTMLElement && root.contains(activeElement)) {
		activeElement.blur();
	}

	root.replaceChildren();
}

interface SheetMusicHostConfig {
	host: HTMLElement;
	scrollContainer: HTMLElement;
	source: string;
	measureColumn: string | null;
	renderScale: number | null;
	followPlayback: boolean;
	cursorColor: string;
	cursorAlpha: number;
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
	yScale: ScaleContinuousNumeric<number, number>;
	margins: WarpingPlotMargins;
	innerWidth: number;
	innerHeight: number;
}

interface WarpingMatrixHostMetadata {
	wrapper: HTMLElement;
	host: HTMLElement;
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

interface ShortcutHelpEntry {
	keys: string;
	action: string;
}

function buildSeekWrap(leftPercent: number, rightPercent: number): string {
	return (
		'<div class="seekwrap" style="left: ' +
		leftPercent +
		"%; right: " +
		rightPercent +
		'%;">' +
		'<div class="loop-region"></div>' +
		'<div class="loop-marker marker-a"></div>' +
		'<div class="loop-marker marker-b"></div>' +
		'<div class="seekhead"></div>' +
		"</div>"
	);
}

function setDisplay(element: Element, displayValue: string): void {
	(element as HTMLElement).style.display = displayValue;
}

function getEventPageY(event: {
	pageY?: number;
	originalEvent?: Event & {
		touches?: ArrayLike<{ pageY: number }>;
		changedTouches?: ArrayLike<{ pageY: number }>;
	};
}): number | null {
	if (typeof event.pageY === "number" && Number.isFinite(event.pageY)) {
		return event.pageY;
	}

	if (event.originalEvent?.touches && event.originalEvent.touches.length > 0) {
		return event.originalEvent.touches[0].pageY;
	}

	if (
		event.originalEvent?.changedTouches &&
		event.originalEvent.changedTouches.length > 0
	) {
		return event.originalEvent.changedTouches[0].pageY;
	}

	return null;
}

function resolvePanelHandleLabel(panel: HTMLElement): string {
	if (panel.classList.contains("track-group")) {
		return "Reorder track group panel";
	}

	if (panel.classList.contains("waveform-wrap")) {
		return "Reorder waveform panel";
	}

	if (panel.classList.contains("midi-wrap")) {
		return "Reorder MIDI panel";
	}

	if (panel.classList.contains("sheetmusic-wrap")) {
		return "Reorder sheet music panel";
	}

	if (panel.classList.contains("warping-matrix-wrap")) {
		return "Reorder warping matrix panel";
	}

	if (panel.classList.contains("ts-text")) {
		return "Reorder text panel";
	}

	const image = panel.querySelector("img");
	if (image instanceof HTMLImageElement) {
		if (image.getAttribute("data-per-track-image") === "true") {
			return "Reorder track image panel";
		}

		return "Reorder image panel";
	}

	return "Reorder panel";
}

function getReorderablePanels(
	root: HTMLElement,
	excluded: HTMLElement[] = [],
): HTMLElement[] {
	const excludedSet = new Set(excluded);

	return Array.from(root.children).filter(
		(child): child is HTMLElement =>
			child instanceof HTMLElement &&
			child.classList.contains("ts-stack-section") &&
			child.getAttribute("data-customizable-panel") === "true" &&
			!excludedSet.has(child),
	);
}

function clampTime(value: number, minimum: number, maximum: number): number {
	if (!Number.isFinite(value)) {
		return minimum;
	}

	if (value < minimum) {
		return minimum;
	}

	if (value > maximum) {
		return maximum;
	}

	return value;
}

function sanitizeVolume(value: number): number {
	if (!Number.isFinite(value)) {
		return 1;
	}

	return clampTime(value, 0, 1);
}

function sanitizePan(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}

	return clampTime(value, -1, 1);
}

function applySoloIconState(
	soloButton: HTMLElement,
	isChecked: boolean,
	isRadio: boolean,
	syncEnabled: boolean,
): void {
	if (!isChecked) {
		setHostIcon(soloButton, "circle");
		return;
	}

	if (isRadio && !syncEnabled) {
		setHostIcon(soloButton, "circle-dot");
		return;
	}

	setHostIcon(soloButton, "circle-check");
}

function parseSheetMusicString(value: string | null): string {
	return typeof value === "string" ? value.trim() : "";
}

function parseSheetMusicCursorColor(value: string | null): string {
	const raw = parseSheetMusicString(value);
	return raw || "#999999";
}

function parseSheetMusicCursorAlpha(value: string | null): number {
	if (value === null) {
		return 0.4;
	}

	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return 0.4;
	}

	if (parsed < 0) {
		return 0;
	}

	if (parsed > 1) {
		return 1;
	}

	return parsed;
}

function parseSheetMusicMaxHeight(value: string | null): number | null {
	return parseRoundedPositiveIntegerAttribute(value) ?? 380;
}

function parseSheetMusicMaxWidth(value: string | null): number | null {
	return parseRoundedPositiveIntegerAttribute(value) ?? 1000;
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

function parseSheetMusicRenderScale(value: string | null): number | null {
	if (value === null) {
		return 0.7;
	}

	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return 0.7;
	}

	return parsed;
}

function parseSheetMusicFollowPlayback(value: string | null): boolean {
	if (value === null) {
		return true;
	}

	return parseSheetMusicString(value).toLowerCase() !== "false";
}

function parseTextAlign(value: string | null): "left" | "center" | "right" {
	if (value === "left" || value === "right") {
		return value;
	}

	return "center";
}

function parseTextFontSize(value: string | null): number | null {
	return parseRoundedPositiveIntegerAttribute(value);
}

function buildTrackShortcutAction(
	trackCount: number,
	singleSoloMode: boolean,
): string {
	void trackCount;

	return singleSoloMode
		? "Switch between tracks 1-10 by number."
		: "Toggle tracks 1-10 by number.";
}

function getShortcutHelpEntries(
	features: {
		exclusiveSolo: boolean;
		globalVolume: boolean;
		looping: boolean;
	},
	trackCount: number,
): ShortcutHelpEntry[] {
	const entries: ShortcutHelpEntry[] = [
		{ keys: "Space", action: "Play or pause playback." },
		{ keys: "Escape", action: "Stop playback and reset to the start." },
		{ keys: "R", action: "Toggle repeat mode." },
		{ keys: "← / →", action: "Seek backward or forward by 2 seconds." },
		{
			keys: "Shift + ← / Shift + →",
			action: "Seek backward or forward by 5 seconds.",
		},
		{ keys: "Home", action: "Jump to the start." },
		{
			keys: "1 .. 0",
			action: buildTrackShortcutAction(trackCount, features.exclusiveSolo),
		},
	];

	if (features.globalVolume) {
		entries.push({
			keys: "↑ / ↓",
			action: "Increase or decrease the global volume by 10%.",
		});
	}

	if (features.looping) {
		entries.push(
			{ keys: "A", action: "Set loop point A at the current position." },
			{ keys: "B", action: "Set loop point B at the current position." },
			{ keys: "L", action: "Toggle the active loop region on or off." },
			{ keys: "C", action: "Clear both loop points." },
		);
	}

	return entries;
}

function buildShortcutHelpHtml(
	features: {
		exclusiveSolo: boolean;
		globalVolume: boolean;
		looping: boolean;
	},
	trackCount: number,
): string {
	const entries = getShortcutHelpEntries(features, trackCount);
	const itemsHtml = entries
		.map(
			(entry: ShortcutHelpEntry, index: number) =>
				'<li class="shortcut-help-item" style="--ts-shortcut-delay: ' +
				String(40 + index * 20) +
				'ms;">' +
				'<span class="shortcut-help-keys">' +
				escapeHtml(entry.keys) +
				"</span>" +
				'<span class="shortcut-help-action">' +
				escapeHtml(entry.action) +
				"</span>" +
				"</li>",
		)
		.join("");

	return (
		'<div class="overlay overlay-shortcuts is-hidden" aria-hidden="true">' +
		'<div class="shortcut-help-panel" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts help" tabindex="-1">' +
		'<div class="shortcut-help-header">' +
		'<div class="shortcut-help-heading">' +
		'<div class="shortcut-help-title">Keyboard Shortcuts</div>' +
		"<p>Keyboard input applies to the last interacted TrackSwitch player.</p>" +
		"</div>" +
		"</div>" +
		'<ul class="shortcut-help-list">' +
		itemsHtml +
		"</ul>" +
		'<p class="shortcut-help-footer">Press F1 or Escape to close.</p>' +
		"</div>" +
		"</div>"
	);
}

function renderOverlayDownloadInfoText(info: AudioDownloadSizeInfo): string {
	if (info.status === "calculating") {
		return "Expected download size for this player: calculating...";
	}

	if (
		(info.status === "known" || info.status === "partial") &&
		info.totalBytes !== null &&
		info.totalBytes > 0
	) {
		const formatted = formatBytesToHumanReadable(info.totalBytes);
		if (info.status === "partial") {
			return (
				"Expected download size for this player: " +
				formatted +
				" known (" +
				info.resolvedSourceCount +
				"/" +
				info.totalSourceCount +
				" sources)"
			);
		}

		return `Expected download size for this player: ${formatted}`;
	}

	return "Expected download size for this player: unavailable";
}

export function query(ctx: any, selector: any): any {
	return function (this: any, selector: any) {
		return this.root.querySelector(selector);
	}.call(ctx, selector);
}

export function queryAll(ctx: any, selector: any): any {
	return function (this: any, selector: any) {
		return Array.from(this.root.querySelectorAll(selector)) as HTMLElement[];
	}.call(ctx, selector);
}

export function initialize(ctx: any, runtimes: any): any {
	return function (this: any, runtimes: any) {
		this.root.classList.add("trackswitch");

		if (!this.query(".main-control")) {
			this.root.insertAdjacentHTML(
				"afterbegin",
				this.buildMainControlHtml(runtimes),
			);
		}

		this.wrapSeekableImages();
		this.wrapWaveformCanvases();
		this.wrapMidiCanvases();
		this.prepareTextPanels();
		this.wrapSheetMusicContainers();
		this.wrapWarpingMatrixContainers();
		this.reflowWaveforms();
		this.reflowMidiDisplays();
		this.renderTrackList(runtimes);
		this.prepareCustomizablePanels();

		if (this.query(".seekable:not(.seekable-img-wrap > .seekable)")) {
			this.queryAll(".main-control .seekwrap").forEach(
				(seekWrap: HTMLElement) => {
					setDisplay(seekWrap, "none");
				},
			);
		}

		this.updateTiming(0, 0);
		this.updateVolumeIcon(1);
	}.call(ctx, runtimes);
}

export function buildMainControlHtml(ctx: any, runtimes: any): any {
	return function (this: any, runtimes: any) {
		let presetDropdownHtml = "";
		if (this.features.presets && this.presetNames.length >= 2) {
			presetDropdownHtml +=
				'<li class="preset-selector-wrap"><select class="preset-selector" title="Select Preset">';
			for (let i = 0; i < this.presetNames.length; i += 1) {
				presetDropdownHtml +=
					'<option value="' +
					i +
					'"' +
					(i === 0 ? " selected" : "") +
					">" +
					escapeHtml(this.presetNames[i]) +
					"</option>";
			}
			presetDropdownHtml += "</select></li>";
		}

		return (
			'<div class="overlay overlay-activation"><span class="activate">Activate' +
			renderIconSlotHtml("power-off") +
			"</span>" +
			'<p id="overlaytext"></p>' +
			'<p id="overlayinfo">' +
			'<span class="info">Info' +
			renderIconSlotHtml("circle-info") +
			"</span>" +
			'<span class="text">' +
			"<strong>trackswitch.js</strong> - Open Source Multitrack Audio Player<br />" +
			'<a href="https://github.com/audiolabs/trackswitch.js">https://github.com/audiolabs/trackswitch.js</a>' +
			'<br /><br /><span class="overlay-download-info">Expected download size for this player: calculating...</span>' +
			"</span>" +
			"</p>" +
			"</div>" +
			buildShortcutHelpHtml(this.features, runtimes.length) +
			'<div class="main-control ts-stack-section">' +
			'<ul class="control">' +
			'<li class="playback-group">' +
			'<ul class="playback-controls">' +
			'<li class="playpause button" title="Play/Pause (Spacebar)">Play' +
			renderIconSlotHtml("play") +
			"</li>" +
			'<li class="stop button" title="Stop (Esc)">Stop' +
			renderIconSlotHtml("stop") +
			"</li>" +
			'<li class="repeat button" title="Repeat (R)">Repeat' +
			renderIconSlotHtml("rotate-right") +
			"</li>" +
			"</ul>" +
			"</li>" +
			(this.features.globalVolume
				? '<li class="volume"><div class="volume-control"><i class="volume-icon">' +
					renderIconSlotHtml("volume-high") +
					"</i>" +
					'<input type="range" class="volume-slider" min="0" max="100" value="100"></div></li>'
				: "") +
			(this.features.looping
				? '<li class="loop-group"><ul class="loop-controls">' +
					'<li class="loop-a button" title="Set Loop Point A (A)" aria-label="Set Loop Point A">' +
					renderIconSlotHtml("loop-a") +
					"</li>" +
					'<li class="loop-b button" title="Set Loop Point B (B)" aria-label="Set Loop Point B">' +
					renderIconSlotHtml("loop-b") +
					"</li>" +
					'<li class="loop-toggle button" title="Toggle Loop On/Off (L)">Loop' +
					renderIconSlotHtml("repeat") +
					"</li>" +
					'<li class="loop-clear button" title="Clear Loop Points (C)">Clear' +
					renderIconSlotHtml("xmark") +
					"</li>" +
					"</ul></li>"
				: "") +
			(this.shouldRenderGlobalSync(runtimes)
				? '<li class="sync-global button sync-after-loop" title="Use synchronized version">SYNC</li>'
				: "") +
			presetDropdownHtml +
			(this.features.timer
				? '<li class="timing"><span class="time">--:--:--:---</span> / <span class="length">--:--:--:---</span></li>'
				: "") +
			(this.features.seekBar
				? '<li class="seekwrap">' +
					'<div class="seekbar">' +
					'<div class="loop-region"></div>' +
					'<div class="loop-marker marker-a"></div>' +
					'<div class="loop-marker marker-b"></div>' +
					'<div class="seekhead"></div>' +
					"</div>" +
					"</li>"
				: "") +
			"</ul>" +
			"</div>"
		);
	}.call(ctx, runtimes);
}

export function shouldRenderGlobalSync(ctx: any, runtimes: any): any {
	return function (this: any, runtimes: any) {
		if (!this.isAlignmentMode()) {
			return false;
		}

		return runtimes.some((runtime: TrackRuntime) => {
			const sources = runtime.definition.alignment?.synchronizedSources;
			return Array.isArray(sources) && sources.length > 0;
		});
	}.call(ctx, runtimes);
}

export function buildTrackRow(ctx: any, runtime: any, index: any): any {
	return function (this: any, runtime: any, index: any) {
		const tabviewClass = this.features.tabView ? " tabs" : "";
		const radioSoloClass = this.features.exclusiveSolo ? " radio" : "";
		const wholeSoloClass = this.features.exclusiveSolo ? " solo" : "";

		const track = document.createElement("li");
		track.className = `track${tabviewClass}${wholeSoloClass}`;
		track.setAttribute(
			"style",
			sanitizeInlineStyle(runtime.definition.style || ""),
		);
		track.setAttribute("data-track-index", String(index));

		const errorIndicator = document.createElement("span");
		errorIndicator.className = "track-error-indicator";
		errorIndicator.innerHTML =
			renderIconSlotHtml("triangle-exclamation") +
			'<span class="track-error-text">ERROR</span>';
		track.appendChild(errorIndicator);

		const title = document.createElement("span");
		title.className = "track-title";
		title.textContent = runtime.definition.title || `Track ${index + 1}`;
		track.appendChild(title);

		const controls = document.createElement("ul");
		controls.className = "control";

		const solo = document.createElement("li");
		solo.className = `solo button${radioSoloClass}`;
		solo.title = "Solo";
		solo.textContent = "Solo";
		solo.insertAdjacentHTML("beforeend", renderIconSlotHtml("circle"));
		controls.appendChild(solo);

		track.appendChild(controls);

		if (this.features.trackVolumeControls || this.features.trackPanControls) {
			const mixControls = document.createElement("div");
			mixControls.className = "track-mix-controls";

			if (this.features.trackVolumeControls) {
				const volumeControl = document.createElement("div");
				volumeControl.className = "track-volume-control";

				const volumeIcon = document.createElement("i");
				volumeIcon.className = "volume-icon track-volume-icon";
				volumeIcon.innerHTML = renderIconSlotHtml("volume-high");

				const volumeSlider = document.createElement("input");
				volumeSlider.className = "track-volume-slider mix-slider";
				volumeSlider.type = "range";
				volumeSlider.min = "0";
				volumeSlider.max = "100";
				volumeSlider.value = String(
					Math.round(sanitizeVolume(runtime.state.volume) * 100),
				);

				volumeControl.appendChild(volumeIcon);
				volumeControl.appendChild(volumeSlider);
				mixControls.appendChild(volumeControl);
			}

			if (this.features.trackPanControls) {
				const panControl = document.createElement("div");
				panControl.className = "track-pan-control";

				const panLabel = document.createElement("span");
				panLabel.className = "track-pan-label";
				panLabel.textContent = "L/R";

				const panSlider = document.createElement("input");
				panSlider.className = "track-pan-slider mix-slider";
				panSlider.type = "range";
				panSlider.min = "-100";
				panSlider.max = "100";
				panSlider.value = String(
					Math.round(sanitizePan(runtime.state.pan) * 100),
				);

				panControl.appendChild(panLabel);
				panControl.appendChild(panSlider);
				mixControls.appendChild(panControl);
			}

			track.appendChild(mixControls);
		}

		return track;
	}.call(ctx, runtime, index);
}

export function renderTrackList(ctx: any, runtimes: any): any {
	return function (this: any, runtimes: any) {
		this.queryAll(".track_list").forEach((existing: HTMLElement) => {
			existing.remove();
		});

		if (this.trackGroups.length === 0) {
			const list = document.createElement("ul");
			list.className = "track_list";

			runtimes.forEach((runtime: TrackRuntime, index: number) => {
				list.appendChild(this.buildTrackRow(runtime, index));
			});

			this.root.appendChild(list);
			return;
		}

		this.trackGroups.forEach((group: NormalizedTrackGroupLayout) => {
			const list = document.createElement("ul");
			list.className = "track_list";
			list.setAttribute("data-track-group-index", String(group.groupIndex));

			for (let offset = 0; offset < group.trackCount; offset += 1) {
				const trackIndex = group.startTrackIndex + offset;
				const runtime = runtimes[trackIndex];
				if (!runtime) {
					continue;
				}

				const row = this.buildTrackRow(runtime, trackIndex);
				if (
					typeof group.rowHeight === "number" &&
					Number.isFinite(group.rowHeight) &&
					group.rowHeight > 0
				) {
					row.style.minHeight = `${String(Math.round(group.rowHeight))}px`;
				}

				list.appendChild(row);
			}

			const container = this.query(
				`.track-group[data-track-group-index="${group.groupIndex}"]`,
			);
			if (container) {
				container.appendChild(list);
				return;
			}

			this.root.appendChild(list);
		});
	}.call(ctx, runtimes);
}

export function prepareTextPanels(ctx: any): any {
	return function (this: any) {
		const hosts = this.root.querySelectorAll(".ts-text");
		hosts.forEach((hostElement: Element) => {
			if (!(hostElement instanceof HTMLElement)) {
				return;
			}

			hostElement.classList.add("ts-stack-section");
			hostElement.setAttribute(
				"style",
				sanitizeInlineStyle(hostElement.getAttribute("data-ts-text-style")) +
					"; display: block;",
			);
			hostElement.style.textAlign = parseTextAlign(
				hostElement.getAttribute("data-ts-text-align"),
			);
			hostElement.style.cursor = "default";
			hostElement.style.fontWeight =
				hostElement.getAttribute("data-ts-text-bold") === "true"
					? "700"
					: "400";
			hostElement.style.fontStyle =
				hostElement.getAttribute("data-ts-text-italic") === "true"
					? "italic"
					: "normal";

			const fontSize = parseTextFontSize(
				hostElement.getAttribute("data-ts-text-font-size"),
			);
			if (fontSize !== null) {
				hostElement.style.fontSize = `${fontSize}px`;
			} else {
				hostElement.style.removeProperty("font-size");
			}
		});
	}.call(ctx);
}

export function prepareCustomizablePanels(ctx: any): any {
	return function (this: any) {
		const root = this.root as HTMLElement;
		const panels = Array.from(this.root.children).filter(
			(child): child is HTMLElement =>
				child instanceof HTMLElement &&
				child.classList.contains("ts-stack-section") &&
				!child.classList.contains("main-control"),
		);

		if (!this.features.customizablePanelOrder) {
			panels.forEach((panel: HTMLElement) => {
				if (!panel.classList.contains("ts-customizable-panel-shell")) {
					panel
						.querySelectorAll(".ts-panel-handle")
						.forEach((handle: Element) => {
							handle.remove();
						});
					return;
				}

				const content = panel.querySelector(
					':scope > [data-customizable-panel-content="true"]',
				);
				if (!(content instanceof HTMLElement)) {
					panel.remove();
					return;
				}

				content.classList.add("ts-stack-section");
				content.removeAttribute("data-customizable-panel-content");
				root.insertBefore(content, panel);
				panel.remove();
			});
			return;
		}

		panels.forEach((panel: HTMLElement, index: number) => {
			let shell = panel;
			let content = panel;

			if (!panel.classList.contains("ts-customizable-panel-shell")) {
				shell = document.createElement("div");
				shell.className =
					"ts-customizable-panel-shell ts-stack-section ts-customizable-panel";
				root.insertBefore(shell, panel);
				shell.appendChild(panel);
				panel.classList.remove("ts-stack-section");
				panel.setAttribute("data-customizable-panel-content", "true");
				content = panel;
			} else {
				const shellContent = panel.querySelector(
					':scope > [data-customizable-panel-content="true"]',
				);
				if (!(shellContent instanceof HTMLElement)) {
					return;
				}

				content = shellContent;
				shell.classList.add("ts-customizable-panel");
			}

			shell.setAttribute("data-customizable-panel", "true");
			shell.setAttribute("data-customizable-panel-id", String(index));

			let handle = shell.querySelector(
				":scope > .ts-panel-handle",
			) as HTMLButtonElement | null;
			if (!(handle instanceof HTMLButtonElement)) {
				handle = document.createElement("button");
				handle.className = "ts-panel-handle";
				handle.type = "button";
				handle.setAttribute("aria-label", resolvePanelHandleLabel(content));
				handle.setAttribute("title", "Reorder panel");
				handle.innerHTML =
					'<span class="ts-panel-handle-dots" aria-hidden="true">' +
					"<span></span><span></span><span></span>" +
					"</span>";
			}

			if (shell.firstChild !== handle) {
				shell.insertBefore(handle, shell.firstChild);
			}
		});
	}.call(ctx);
}

export function startPanelReorder(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (!this.features.customizablePanelOrder || this.panelDragState) {
			return false;
		}

		const handle =
			event.target instanceof Element
				? event.target.closest(".ts-panel-handle")
				: null;
		if (!(handle instanceof HTMLElement) || !this.root.contains(handle)) {
			return false;
		}

		const panel = handle.closest(
			'.ts-stack-section[data-customizable-panel="true"]',
		);
		if (!(panel instanceof HTMLElement) || !this.root.contains(panel)) {
			return false;
		}

		const pageY = getEventPageY(event);
		if (pageY === null || !panel.parentElement) {
			return false;
		}

		const rect = panel.getBoundingClientRect();
		const placeholder = document.createElement("div");
		placeholder.className = "ts-panel-drop-placeholder";
		placeholder.style.height = `${Math.max(1, rect.height)}px`;

		panel.parentElement.insertBefore(placeholder, panel.nextSibling);

		const originalEvent = event.originalEvent;
		if (
			originalEvent instanceof PointerEvent &&
			"setPointerCapture" in handle
		) {
			handle.setPointerCapture(originalEvent.pointerId);
		}

		panel.classList.add("ts-panel-dragging");
		panel.style.width = `${rect.width}px`;
		panel.style.height = `${rect.height}px`;
		panel.style.left = `${rect.left}px`;
		panel.style.top = `${rect.top}px`;
		this.root.classList.add("ts-panel-reorder-active");

		this.panelDragState = {
			handle: handle,
			panel: panel,
			placeholder: placeholder,
			pointerId:
				originalEvent instanceof PointerEvent ? originalEvent.pointerId : null,
			pointerOffsetY: pageY - (rect.top + window.scrollY),
			panelHeight: rect.height,
		};

		event.preventDefault();
		event.stopPropagation();
		return true;
	}.call(ctx, event);
}

export function movePanelReorder(ctx: any, event: any): any {
	return function (this: any, event: any) {
		const dragState = this.panelDragState;
		if (!dragState) {
			return false;
		}

		const originalEvent = event.originalEvent;
		if (
			dragState.pointerId !== null &&
			originalEvent instanceof PointerEvent &&
			originalEvent.pointerId !== dragState.pointerId
		) {
			return false;
		}

		const pageY = getEventPageY(event);
		if (pageY === null) {
			return false;
		}

		dragState.panel.style.top = `${pageY - window.scrollY - dragState.pointerOffsetY}px`;

		const panelCenterY =
			pageY - dragState.pointerOffsetY + dragState.panelHeight / 2;
		const candidates = getReorderablePanels(this.root, [
			dragState.panel,
			dragState.placeholder,
		]);
		let inserted = false;

		candidates.forEach((candidate: HTMLElement) => {
			if (inserted) {
				return;
			}

			const rect = candidate.getBoundingClientRect();
			const midpoint = rect.top + window.scrollY + rect.height / 2;
			if (panelCenterY < midpoint) {
				this.root.insertBefore(dragState.placeholder, candidate);
				inserted = true;
			}
		});

		if (!inserted) {
			this.root.appendChild(dragState.placeholder);
		}

		event.preventDefault();
		return true;
	}.call(ctx, event);
}

export function endPanelReorder(ctx: any, event: any = null): any {
	return function (this: any, event: any) {
		const dragState = this.panelDragState;
		if (!dragState) {
			return false;
		}

		const originalEvent = event?.originalEvent;
		if (
			dragState.pointerId !== null &&
			originalEvent instanceof PointerEvent &&
			originalEvent.pointerId !== dragState.pointerId
		) {
			return false;
		}

		if (
			dragState.pointerId !== null &&
			"hasPointerCapture" in dragState.handle &&
			dragState.handle.hasPointerCapture(dragState.pointerId)
		) {
			dragState.handle.releasePointerCapture(dragState.pointerId);
		}

		if (dragState.placeholder.parentElement) {
			dragState.placeholder.parentElement.insertBefore(
				dragState.panel,
				dragState.placeholder,
			);
		}

		dragState.panel.classList.remove("ts-panel-dragging");
		dragState.panel.style.removeProperty("width");
		dragState.panel.style.removeProperty("height");
		dragState.panel.style.removeProperty("left");
		dragState.panel.style.removeProperty("top");
		dragState.placeholder.remove();
		this.root.classList.remove("ts-panel-reorder-active");
		this.panelDragState = null;

		if (event) {
			event.preventDefault();
		}

		return true;
	}.call(ctx, event);
}

export function wrapSeekableImages(ctx: any): any {
	return function (this: any) {
		const candidates = this.queryAll("img");

		candidates.forEach((candidate: HTMLElement) => {
			if (!(candidate instanceof HTMLImageElement)) {
				return;
			}

			if (candidate.parentElement?.classList.contains("seekable-img-wrap")) {
				return;
			}

			const section = document.createElement("div");
			section.className = "seekable-section ts-stack-section";

			const wrapper = document.createElement("div");
			wrapper.className = "seekable-img-wrap";
			wrapper.setAttribute(
				"style",
				sanitizeInlineStyle(candidate.getAttribute("data-style")) +
					"; display: block;",
			);

			const parent = candidate.parentElement;
			if (!parent) {
				return;
			}

			parent.insertBefore(section, candidate);
			section.appendChild(wrapper);
			wrapper.appendChild(candidate);

			if (candidate.classList.contains("seekable")) {
				wrapper.insertAdjacentHTML(
					"beforeend",
					buildSeekWrap(
						clampPercent(candidate.getAttribute("data-seek-margin-left")),
						clampPercent(candidate.getAttribute("data-seek-margin-right")),
					),
				);
			}
		});
	}.call(ctx);
}

export function wrapSheetMusicContainers(ctx: any): any {
	return function (this: any) {
		this.sheetMusicHosts.length = 0;

		const hosts = this.root.querySelectorAll(".sheetmusic");
		hosts.forEach((hostElement: Element) => {
			if (!(hostElement instanceof HTMLElement)) {
				return;
			}

			let wrapper: HTMLElement | null = hostElement.closest(
				".sheetmusic-wrap",
			) as HTMLElement | null;
			let scrollContainer: HTMLElement | null = null;

			if (!wrapper) {
				wrapper = document.createElement("div");
				wrapper.className = "sheetmusic-wrap ts-stack-section";
				wrapper.setAttribute(
					"style",
					`${sanitizeInlineStyle(
						hostElement.getAttribute("data-sheetmusic-style"),
					)}; display: block;`,
				);

				scrollContainer = document.createElement("div");
				scrollContainer.className = "sheetmusic-scroll";

				const parent = hostElement.parentElement;
				if (!parent) {
					return;
				}

				parent.insertBefore(wrapper, hostElement);
				wrapper.appendChild(scrollContainer);
				scrollContainer.appendChild(hostElement);
			} else {
				scrollContainer = wrapper.querySelector(".sheetmusic-scroll");
			}

			if (
				!(wrapper instanceof HTMLElement) ||
				!(scrollContainer instanceof HTMLElement)
			) {
				return;
			}

			const maxWidth = parseSheetMusicMaxWidth(
				hostElement.getAttribute("data-sheetmusic-max-width"),
			);
			if (maxWidth !== null) {
				wrapper.style.width = "100%";
				wrapper.style.maxWidth = `${maxWidth}px`;
				wrapper.style.marginLeft = "auto";
				wrapper.style.marginRight = "auto";
				wrapper.setAttribute("data-sheetmusic-max-width-applied", "true");
			} else if (
				wrapper.getAttribute("data-sheetmusic-max-width-applied") === "true"
			) {
				wrapper.style.removeProperty("width");
				wrapper.style.removeProperty("max-width");
				wrapper.style.removeProperty("margin-left");
				wrapper.style.removeProperty("margin-right");
				wrapper.removeAttribute("data-sheetmusic-max-width-applied");
			}

			const maxHeight = parseSheetMusicMaxHeight(
				hostElement.getAttribute("data-sheetmusic-max-height"),
			);
			if (maxHeight !== null) {
				scrollContainer.style.maxHeight = `${maxHeight}px`;
				scrollContainer.style.height = `${maxHeight}px`;
				scrollContainer.style.minHeight = `${maxHeight}px`;
				wrapper.classList.add("sheetmusic-scrollable");
			} else {
				scrollContainer.style.removeProperty("max-height");
				scrollContainer.style.removeProperty("height");
				scrollContainer.style.removeProperty("min-height");
				wrapper.classList.remove("sheetmusic-scrollable");
			}

			const source = parseSheetMusicString(
				hostElement.getAttribute("data-sheetmusic-src"),
			);
			if (!source) {
				return;
			}

			this.sheetMusicHosts.push({
				host: hostElement,
				scrollContainer: scrollContainer,
				source: source,
				measureColumn: parseSheetMusicString(
					hostElement.getAttribute("data-sheetmusic-measure-column"),
				),
				renderScale: parseSheetMusicRenderScale(
					hostElement.getAttribute("data-sheetmusic-render-scale"),
				),
				followPlayback: parseSheetMusicFollowPlayback(
					hostElement.getAttribute("data-sheetmusic-follow-playback"),
				),
				cursorColor: parseSheetMusicCursorColor(
					hostElement.getAttribute("data-sheetmusic-cursor-color"),
				),
				cursorAlpha: parseSheetMusicCursorAlpha(
					hostElement.getAttribute("data-sheetmusic-cursor-alpha"),
				),
			});
		});
	}.call(ctx);
}

export function getPreparedSheetMusicHosts(ctx: any): any {
	return function (this: any) {
		return this.sheetMusicHosts.map((entry: SheetMusicHostConfig) => {
			return {
				host: entry.host,
				scrollContainer: entry.scrollContainer,
				source: entry.source,
				measureColumn: entry.measureColumn,
				renderScale: entry.renderScale,
				followPlayback: entry.followPlayback,
				cursorColor: entry.cursorColor,
				cursorAlpha: entry.cursorAlpha,
			};
		});
	}.call(ctx);
}

export function updateMainControls(
	ctx: any,
	state: any,
	runtimes: any,
	waveformTimelineContext: any,
	warpingMatrixContext: any,
): any {
	return function (
		this: any,
		state: any,
		runtimes: any,
		waveformTimelineContext: any,
		warpingMatrixContext: any,
	) {
		this.updatePlaybackPosition(
			state,
			runtimes,
			waveformTimelineContext,
			warpingMatrixContext,
		);

		this.root.classList.toggle("sync-enabled", state.syncEnabled);

		this.queryAll(".playpause").forEach((element: HTMLElement) => {
			element.classList.toggle("checked", state.playing);
			setHostIcon(element, state.playing ? "pause" : "play");
		});

		this.queryAll(".repeat").forEach((element: HTMLElement) => {
			element.classList.toggle("checked", state.repeat);
		});

		this.queryAll(".sync-global").forEach((element: HTMLElement) => {
			element.classList.toggle("checked", state.syncEnabled);
			element.classList.toggle("disabled", !state.syncAvailable);
		});

		this.warpingMatrixHosts.forEach((host: WarpingMatrixHostMetadata) => {
			this.updateWarpingMatrix(host, warpingMatrixContext);
		});

		if (!this.features.looping) {
			return;
		}

		this.queryAll(".loop-a").forEach((element: HTMLElement) => {
			element.classList.toggle("checked", state.loop.pointA !== null);
			element.classList.toggle("active", state.loop.enabled);
		});

		this.queryAll(".loop-b").forEach((element: HTMLElement) => {
			element.classList.toggle("checked", state.loop.pointB !== null);
			element.classList.toggle("active", state.loop.enabled);
		});

		this.queryAll(".loop-toggle").forEach((element: HTMLElement) => {
			element.classList.toggle("checked", state.loop.enabled);
		});
	}.call(ctx, state, runtimes, waveformTimelineContext, warpingMatrixContext);
}

export function updatePlaybackPosition(
	ctx: any,
	state: any,
	runtimes: any,
	waveformTimelineContext: any,
	warpingMatrixContext: any,
): any {
	return function (
		this: any,
		state: any,
		runtimes: any,
		waveformTimelineContext: any,
		warpingMatrixContext: any,
	) {
		this.root.classList.toggle("sync-enabled", state.syncEnabled);

		const seekWraps = this.queryAll(".seekwrap");
		seekWraps.forEach((seekWrap: HTMLElement) => {
			this.updateSeekWrapVisuals(
				seekWrap,
				state.position,
				state.longestDuration,
				state.loop,
			);
		});

		this.applyFixedWaveformLocalSeekVisuals(state, waveformTimelineContext);

		if (this.features.timer) {
			this.updateTiming(state.position, state.longestDuration);
		}

		this.updateWaveformTiming(state, runtimes, waveformTimelineContext);
		this.updateWaveformZoomIndicators();
		this.updateMidiPlaybackState(state, true, false);
		this.updateMidiZoomIndicators();
		this.warpingMatrixHosts.forEach((host: WarpingMatrixHostMetadata) => {
			this.updateWarpingMatrixPlaybackState(host, warpingMatrixContext);
		});
	}.call(ctx, state, runtimes, waveformTimelineContext, warpingMatrixContext);
}

export function updateTrackControls(
	ctx: any,
	runtimes: any,
	syncLockedTrackIndexes: any,
	effectiveSingleSoloMode: any,
	panSupported: any,
	syncEnabled: any,
): any {
	return function (
		this: any,
		runtimes: any,
		syncLockedTrackIndexes: any,
		effectiveSingleSoloMode: any,
		panSupported: any,
		syncEnabled: any,
	) {
		runtimes.forEach((runtime: TrackRuntime, index: number) => {
			const row = this.query(`.track[data-track-index="${index}"]`);
			if (!row) {
				return;
			}

			const solo = row.querySelector(".solo");
			const isLocked =
				!!syncLockedTrackIndexes && syncLockedTrackIndexes.has(index);

			row.classList.toggle("solo", effectiveSingleSoloMode);

			if (solo instanceof HTMLElement) {
				solo.classList.toggle("checked", runtime.state.solo);
				solo.classList.toggle("disabled", isLocked);
				solo.classList.toggle("radio", effectiveSingleSoloMode);
				applySoloIconState(
					solo,
					runtime.state.solo,
					effectiveSingleSoloMode,
					!!syncEnabled,
				);
			}

			if (
				!this.features.trackVolumeControls &&
				!this.features.trackPanControls
			) {
				return;
			}

			if (this.features.trackVolumeControls) {
				this.setTrackVolumeSlider(index, runtime.state.volume);
			}
			if (this.features.trackPanControls) {
				this.setTrackPanSlider(index, panSupported ? runtime.state.pan : 0);
			}

			const trackVolumeSlider = row.querySelector(".track-volume-slider");
			if (trackVolumeSlider instanceof HTMLInputElement) {
				trackVolumeSlider.disabled = isLocked;
			}

			const trackPanSlider = row.querySelector(".track-pan-slider");
			if (trackPanSlider instanceof HTMLInputElement) {
				trackPanSlider.disabled = isLocked || !panSupported;
			}

			const trackVolumeIcon = row.querySelector(".track-volume-icon");
			if (trackVolumeIcon instanceof HTMLElement) {
				this.applyVolumeIconState(trackVolumeIcon, runtime.state.volume);
			}

			const trackControlGroup = row.querySelector(".track-mix-controls");
			if (trackControlGroup) {
				trackControlGroup.classList.toggle("disabled", isLocked);
			}

			const trackPanControl = row.querySelector(".track-pan-control");
			if (trackPanControl) {
				trackPanControl.classList.toggle("disabled", isLocked || !panSupported);
			}
		});
	}.call(
		ctx,
		runtimes,
		syncLockedTrackIndexes,
		effectiveSingleSoloMode,
		panSupported,
		syncEnabled,
	);
}

export function switchPosterImage(ctx: any, runtimes: any): any {
	return function (this: any, runtimes: any) {
		let soloCount = 0;
		let imageSrc: string | null = null;
		const switchTargets = this.queryAll('img[data-per-track-image="true"]');

		runtimes.forEach((runtime: TrackRuntime) => {
			if (runtime.state.solo) {
				soloCount += 1;
				const configuredImage =
					typeof runtime.definition.image === "string"
						? runtime.definition.image.trim()
						: "";
				if (configuredImage) {
					imageSrc = configuredImage;
				}
			}
		});

		if (switchTargets.length === 0) {
			return;
		}

		switchTargets.forEach((element: HTMLElement) => {
			if (!(element instanceof HTMLImageElement)) {
				return;
			}

			const nextSrc = soloCount === 1 && imageSrc ? imageSrc : null;
			const container = element.parentElement?.classList.contains(
				"seekable-img-wrap",
			)
				? element.parentElement
				: element;

			if (!nextSrc) {
				setDisplay(container, "none");
				setDisplay(element, "none");
				return;
			}

			setDisplay(container, "");
			setDisplay(element, "");

			const currentSrc = element.getAttribute("data-per-track-current-src");
			if (currentSrc !== nextSrc) {
				element.src = nextSrc;
				element.setAttribute("data-per-track-current-src", nextSrc);
			}
		});
	}.call(ctx, runtimes);
}

export function setVolumeSlider(ctx: any, volumeZeroToOne: any): any {
	return function (this: any, volumeZeroToOne: any) {
		const slider = this.query(".main-control .volume-slider");
		if (!slider || !(slider instanceof HTMLInputElement)) {
			return;
		}

		slider.value = String(Math.round(volumeZeroToOne * 100));
		this.updateVolumeIcon(volumeZeroToOne);
	}.call(ctx, volumeZeroToOne);
}

export function setTrackVolumeSlider(
	ctx: any,
	trackIndex: any,
	volumeZeroToOne: any,
): any {
	return function (this: any, trackIndex: any, volumeZeroToOne: any) {
		const row = this.query(`.track[data-track-index="${trackIndex}"]`);
		if (!row) {
			return;
		}

		const slider = row.querySelector(".track-volume-slider");
		if (!(slider instanceof HTMLInputElement)) {
			return;
		}

		slider.value = String(Math.round(sanitizeVolume(volumeZeroToOne) * 100));
	}.call(ctx, trackIndex, volumeZeroToOne);
}

export function setTrackPanSlider(
	ctx: any,
	trackIndex: any,
	panMinusOneToOne: any,
): any {
	return function (this: any, trackIndex: any, panMinusOneToOne: any) {
		const row = this.query(`.track[data-track-index="${trackIndex}"]`);
		if (!row) {
			return;
		}

		const slider = row.querySelector(".track-pan-slider");
		if (!(slider instanceof HTMLInputElement)) {
			return;
		}

		slider.value = String(Math.round(sanitizePan(panMinusOneToOne) * 100));
	}.call(ctx, trackIndex, panMinusOneToOne);
}

export function updateVolumeIcon(ctx: any, volumeZeroToOne: any): any {
	return function (this: any, volumeZeroToOne: any) {
		this.queryAll(".main-control .volume-control .volume-icon").forEach(
			(icon: HTMLElement) => {
				this.applyVolumeIconState(icon, volumeZeroToOne);
			},
		);
	}.call(ctx, volumeZeroToOne);
}

export function applyVolumeIconState(
	ctx: any,
	icon: any,
	volumeZeroToOne: any,
): any {
	return function (this: any, icon: any, volumeZeroToOne: any) {
		const volume = sanitizeVolume(volumeZeroToOne);
		if (volume === 0) {
			setHostIcon(icon, "volume-xmark");
		} else if (volume <= 1 / 3) {
			setHostIcon(icon, "volume-low");
		} else if (volume <= 2 / 3) {
			setHostIcon(icon, "volume");
		} else {
			setHostIcon(icon, "volume-high");
		}
	}.call(ctx, icon, volumeZeroToOne);
}

export function setOverlayLoading(ctx: any, isLoading: any): any {
	return function (this: any, isLoading: any) {
		this.queryAll(".overlay-activation .activate").forEach(
			(activate: HTMLElement) => {
				activate.classList.toggle("loading", isLoading);
				activate.classList.remove("error");
				setHostIcon(activate, isLoading ? "spinner" : "power-off");

				const iconSlot = getHostIconSlot(activate);
				if (iconSlot) {
					iconSlot.classList.toggle("is-spinning", isLoading);
				}
			},
		);

		this.queryAll(".overlay-activation").forEach((overlay: HTMLElement) => {
			overlay.classList.toggle("loading", isLoading);
		});
	}.call(ctx, isLoading);
}

export function setShortcutHelpVisible(ctx: any, isVisible: any): any {
	return function (this: any, isVisible: any) {
		this.queryAll(".overlay-shortcuts").forEach((overlay: HTMLElement) => {
			overlay.classList.toggle("is-hidden", !isVisible);
			overlay.setAttribute("aria-hidden", isVisible ? "false" : "true");

			if (isVisible) {
				const panel = overlay.querySelector(".shortcut-help-panel");
				if (panel instanceof HTMLElement) {
					panel.focus();
				}
				return;
			}

			const activeElement = getDeepActiveElement(overlay);
			if (
				activeElement instanceof HTMLElement &&
				overlay.contains(activeElement)
			) {
				activeElement.blur();
			}
		});
	}.call(ctx, isVisible);
}

export function updateOverlayDownloadInfo(ctx: any, info: any): any {
	return function (this: any, info: AudioDownloadSizeInfo) {
		const downloadInfo = this.query(".overlay-download-info");
		if (!downloadInfo) {
			return;
		}

		downloadInfo.textContent = renderOverlayDownloadInfoText(info);
	}.call(ctx, info);
}

export function hideOverlayOnLoaded(ctx: any): any {
	return function (this: any) {
		this.queryAll(".overlay-activation").forEach((overlay: HTMLElement) => {
			overlay.classList.add("is-hidden");
		});
	}.call(ctx);
}

export function showError(ctx: any, message: any, runtimes: any): any {
	return function (this: any, message: any, runtimes: any) {
		this.root.classList.add("error");

		this.queryAll(".overlay-activation").forEach((overlay: HTMLElement) => {
			overlay.classList.remove("is-hidden");
		});

		this.queryAll(".overlay-activation .activate").forEach(
			(activate: HTMLElement) => {
				activate.classList.remove("loading");
				activate.classList.add("error");
				setHostIcon(activate, "exclamation");

				const iconSlot = getHostIconSlot(activate);
				if (iconSlot) {
					iconSlot.classList.remove("is-spinning");
				}
			},
		);

		const overlayText = this.query("#overlaytext");
		if (overlayText) {
			overlayText.textContent = message;
		}

		runtimes.forEach((runtime: TrackRuntime, index: number) => {
			if (!runtime.errored) {
				return;
			}

			const row = this.query(`.track[data-track-index="${index}"]`);
			if (row) {
				row.classList.add("error");
			}
		});
	}.call(ctx, message, runtimes);
}

export function destroy(ctx: any): any {
	return function (this: any) {
		if (this.panelDragState) {
			this.endPanelReorder();
		}

		if (this.waveformTileRefreshFrameId !== null) {
			cancelAnimationFrame(this.waveformTileRefreshFrameId);
			this.waveformTileRefreshFrameId = null;
		}

		this.latestWaveformRenderInput = null;
		this.waveformSeekSurfaces.length = 0;
		this.midiSeekSurfaces.length = 0;
		this.sheetMusicHosts.length = 0;
		this.warpingMatrixHosts.length = 0;
		this.panelDragState = null;
		resetManagedRoot(this.root);
	}.call(ctx);
}

export function getPresetCount(ctx: any): any {
	return function (this: any) {
		return this.presetNames.length;
	}.call(ctx);
}

export function updateTiming(
	ctx: any,
	position: any,
	longestDuration: any,
): any {
	return function (this: any, position: any, longestDuration: any) {
		this.queryAll(".timing .time").forEach((node: HTMLElement) => {
			node.textContent = formatSecondsToHHMMSSmmm(position);
		});

		this.queryAll(".timing .length").forEach((node: HTMLElement) => {
			node.textContent = formatSecondsToHHMMSSmmm(longestDuration);
		});
	}.call(ctx, position, longestDuration);
}
