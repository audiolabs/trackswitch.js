import type { ViewNormalizeContext } from "../config/views";
import {
	applyCssOverrides,
	escapeHtml,
	getDeepActiveElement,
	setDisplay,
} from "../shared/dom";
import { formatBytesToHumanReadable } from "../shared/format";
import { clamp, clampPercent } from "../shared/math";
import type {
	AudioDownloadSizeInfo,
	MediaId,
	TrackId,
	TrackListGroup,
	TrackRuntime,
	TrackSwitchImageViewConfig,
	TrackSwitchNavigationBarControl,
	TrackSwitchNavigationBarViewConfig,
	TrackSwitchPerTrackImageViewConfig,
	TrackSwitchPianoRollViewConfig,
	TrackSwitchSeparatorViewConfig,
	TrackSwitchSheetMusicViewConfig,
	TrackSwitchTextViewConfig,
	TrackSwitchUiState,
	TrackSwitchViewConfig,
	TrackSwitchWarpingMatrixViewConfig,
	TrackSwitchWaveformViewConfig,
} from "../types";
import {
	getHostIconSlot,
	getIconMaskDataUri,
	getIconSplitGlyphMaskDataUri,
	renderIconSlotHtml,
	setHostIcon,
	type TrackSwitchIconName,
} from "./icons";
import type {
	PerTrackImageSource,
	ViewRenderer,
	WarpingMatrixRenderContext,
	WaveformTimelineContext,
} from "./renderer";
import { buildSeekWrap, updateTimelineZoomIndicators } from "./surface";

const TRACKSWITCH_ROOT_CLASSES = [
	"trackswitch",
	"error",
	"sync-enabled",
	"ts-panel-reorder-active",
] as const;

function navigationBarHasControl(
	navigationBar: TrackSwitchNavigationBarViewConfig | null,
	control: TrackSwitchNavigationBarControl,
): boolean {
	return navigationBar?.controls.includes(control) ?? false;
}

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
	/** The configured `maxHeight`, or null when unset — the base a fullscreen grow starts from. */
	configuredMaxHeight: number | null;
}

interface ShortcutHelpEntry {
	keys: string;
	action: string;
}

interface PanelReorderStartEvent {
	target?: EventTarget | null;
	pageY?: number;
	originalEvent?: Event;
	preventDefault(): void;
	stopPropagation(): void;
}

interface PanelReorderMoveEvent {
	pageY?: number;
	originalEvent?: Event;
	preventDefault(): void;
}

interface PanelReorderEndEvent {
	originalEvent?: Event;
	preventDefault(): void;
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

	if (panel.classList.contains("piano-roll-wrap")) {
		return "Reorder piano roll panel";
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

function sanitizeVolume(value: number): number {
	if (!Number.isFinite(value)) {
		return 1;
	}

	return clamp(value, 0, 1);
}

function sanitizePan(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}

	return clamp(value, -1, 1);
}

/** A top-to-bottom gradient with hard edges, one even band per colour. */
function buildHardStopGradient(colors: string[]): string {
	const bandPercent = 100 / colors.length;
	const stops = colors.map((color, index) => {
		const start = (index * bandPercent).toFixed(4);
		const end = ((index + 1) * bandPercent).toFixed(4);
		return `${color} ${start}%, ${color} ${end}%`;
	});
	return `linear-gradient(180deg, ${stops.join(", ")})`;
}

/**
 * Colours a track row's `solo` icon: a plain `currentColor` swap for one
 * channel, a hard-edged split across the ring alone when more than one
 * channel shares the track. The split stays on the ring — reusing the plain
 * `circle` icon's outline regardless of which of circle/circle-check/
 * circle-dot is showing — rather than the whole icon: a checkmark or dot
 * only ever covers a slice of the ring's height, so masking the same
 * gradient to the whole icon cut those glyphs into arbitrary, misleading
 * bands instead of the even split the ring shows. The glyph itself is
 * layered on top in the plain foreground colour, same as it would be
 * unsplit.
 */
function applyTrackChannelColors(
	row: HTMLElement,
	solo: Element | null,
	colors: string[] | null,
): void {
	const iconSlot = solo instanceof HTMLElement ? getHostIconSlot(solo) : null;

	if (!colors || colors.length <= 1) {
		if (colors?.[0]) {
			row.style.setProperty("--ts-track-channel-color", colors[0]);
		} else {
			row.style.removeProperty("--ts-track-channel-color");
		}
		if (iconSlot) {
			iconSlot.classList.remove("split-channel-color");
			iconSlot.style.removeProperty("--ts-track-split-mask");
			iconSlot.style.removeProperty("--ts-track-split-gradient");
			iconSlot.style.removeProperty("--ts-track-split-glyph-mask");
		}
		return;
	}

	row.style.removeProperty("--ts-track-channel-color");
	if (!iconSlot) {
		return;
	}

	const iconName = iconSlot.getAttribute("data-icon") as TrackSwitchIconName;
	iconSlot.classList.add("split-channel-color");
	iconSlot.style.setProperty(
		"--ts-track-split-mask",
		getIconMaskDataUri("circle"),
	);
	iconSlot.style.setProperty(
		"--ts-track-split-gradient",
		buildHardStopGradient(colors),
	);
	const glyphMask = getIconSplitGlyphMaskDataUri(iconName);
	if (glyphMask) {
		iconSlot.style.setProperty("--ts-track-split-glyph-mask", glyphMask);
	} else {
		iconSlot.style.removeProperty("--ts-track-split-glyph-mask");
	}
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

/** The `trackList` a rendered row belongs to, as stamped on its enclosing list. */
function trackGroupIndexOfRow(row: HTMLElement): number {
	const list = row.closest(".track_list[data-track-group-index]");
	if (!list) {
		return -1;
	}

	const parsed = Number(list.getAttribute("data-track-group-index"));
	if (!Number.isFinite(parsed) || parsed < 0) {
		return -1;
	}

	return Math.floor(parsed);
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
	singleSoloMode: boolean,
	navigationBar: TrackSwitchNavigationBarViewConfig | null,
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
			action: buildTrackShortcutAction(trackCount, singleSoloMode),
		},
	];

	if (navigationBarHasControl(navigationBar, "globalVolume")) {
		entries.push({
			keys: "↑ / ↓",
			action: "Increase or decrease the global volume by 10%.",
		});
	}

	if (navigationBarHasControl(navigationBar, "looping")) {
		entries.push(
			{ keys: "A", action: "Set loop point A at the current position." },
			{ keys: "B", action: "Set loop point B at the current position." },
			{ keys: "L", action: "Toggle the active loop region on or off." },
			{ keys: "C", action: "Clear both loop points." },
		);
	}

	entries.push({
		keys: ", / .",
		action: "Jump to the previous or next marker, or to the start or end.",
	});

	if (navigationBarHasControl(navigationBar, "markerEditing")) {
		entries.push(
			{
				keys: "M",
				action: "While editing markers, add a marker at the current position.",
			},
			{
				keys: "Delete",
				action: "While editing markers, remove the focused marker.",
			},
			{
				keys: "Ctrl + Z",
				action: "While editing markers, undo the last marker edit.",
			},
		);
	}

	if (navigationBarHasControl(navigationBar, "fullscreen-control")) {
		entries.push({
			keys: "F",
			action: "Toggle fullscreen mode.",
		});
	}

	return entries;
}

function buildShortcutHelpHtml(
	singleSoloMode: boolean,
	navigationBar: TrackSwitchNavigationBarViewConfig | null,
	trackCount: number,
): string {
	const entries = getShortcutHelpEntries(
		singleSoloMode,
		navigationBar,
		trackCount,
	);
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
		'<div class="overlay overlay-shortcuts is-hidden" popover="manual" aria-hidden="true">' +
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

let markerNavigationDialogId = 0;

function buildMarkerNavigationDialogHtml(): string {
	const dialogId = ++markerNavigationDialogId;
	const field = (className: string, label: string, fieldId: string): string => {
		const inputId = `marker-navigation-${dialogId}-${fieldId}`;
		const listboxId = `${inputId}-listbox`;
		return (
			'<div class="marker-navigation-field">' +
			'<div class="marker-navigation-combobox">' +
			'<input class="marker-navigation-input ' +
			className +
			'" id="' +
			inputId +
			'" type="text" role="combobox" aria-label="' +
			escapeHtml(label) +
			'" aria-autocomplete="list" aria-expanded="false" aria-controls="' +
			listboxId +
			'" autocomplete="off" placeholder="Search by marker sequence, ID, or label">' +
			'<div class="marker-navigation-options" id="' +
			listboxId +
			'" role="listbox" popover="manual" aria-label="' +
			escapeHtml(label) +
			' suggestions"></div>' +
			"</div></div>"
		);
	};

	return (
		'<div class="overlay marker-navigation-overlay is-hidden" aria-hidden="true">' +
		'<form class="marker-navigation-dialog" role="dialog" aria-modal="true" aria-label="Jump to annotation marker" tabindex="-1">' +
		'<div class="marker-navigation-section-heading">Jump to marker</div>' +
		'<div class="marker-navigation-jump-fields">' +
		field(
			"marker-jump-target",
			"Jump to marker by ID, label, or marker sequence",
			"jump",
		) +
		"</div>" +
		'<p class="marker-navigation-error" role="alert" aria-live="assertive"></p>' +
		'<div class="marker-navigation-dialog-actions"><button type="submit" class="marker-navigation-ok">Go!</button></div>' +
		"</form></div>"
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

export function query(ctx: ViewRenderer, selector: string): HTMLElement | null {
	return ctx.root.querySelector(selector) as HTMLElement | null;
}

export function queryAll(ctx: ViewRenderer, selector: string): HTMLElement[] {
	return Array.from(ctx.root.querySelectorAll(selector)) as HTMLElement[];
}

export function initialize(ctx: ViewRenderer, runtimes: TrackRuntime[]): void {
	ctx.root.classList.add("trackswitch");

	ctx.appliedRootCssTokens.forEach((token) => {
		if (!ctx.css || !(token in ctx.css)) {
			ctx.root.style.removeProperty(token);
		}
	});
	applyCssOverrides(ctx.root, ctx.css);
	ctx.appliedRootCssTokens = ctx.css ? Object.keys(ctx.css) : [];

	ctx.root.insertAdjacentHTML(
		"afterbegin",
		ctx.buildPlayerOverlayHtml(runtimes),
	);
	ctx.queryAll(".navigation-bar-host").forEach((host: HTMLElement) => {
		host.insertAdjacentHTML("beforebegin", ctx.buildMainControlHtml(runtimes));
		host.remove();
	});

	ctx.wrapSeekableImages();
	ctx.wrapWaveformCanvases();
	ctx.wrapPianoRollCanvases();
	ctx.prepareTextPanels();
	ctx.wrapSheetMusicContainers();
	ctx.wrapWarpingMatrixContainers();
	ctx.reflowWaveforms();
	ctx.reflowPianoRollDisplays();
	ctx.renderTrackList(runtimes);
	ctx.prepareCustomizablePanels();

	if (ctx.query(".seekable:not(.seekable-img-wrap > .seekable)")) {
		ctx.queryAll(".main-control .seekwrap").forEach((seekWrap: HTMLElement) => {
			setDisplay(seekWrap, "none");
		});
	}

	ctx.updateTiming(0, 0);
	ctx.updateVolumeIcon(1);
}

export function buildPlayerOverlayHtml(
	ctx: ViewRenderer,
	runtimes: TrackRuntime[],
): string {
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
		"<strong>trackswitch</strong> - Open Source Multitrack Audio Player<br />" +
		'<a href="https://github.com/audiolabs/trackswitch.js">https://github.com/audiolabs/trackswitch.js</a>' +
		'<br /><br /><span class="overlay-download-info">Expected download size for ctx player: calculating...</span>' +
		"</span>" +
		"</p>" +
		"</div>" +
		buildShortcutHelpHtml(
			// The number keys switch rather than toggle only where every list is
			// exclusive; a mixed player still gets the plain toggle wording.
			ctx.trackGroups.length > 0 &&
				ctx.trackGroups.every((group) =>
					ctx.isGroupExclusive(group.groupIndex),
				),
			ctx.navigationBar,
			runtimes.length,
		) +
		(navigationBarHasControl(ctx.navigationBar, "markerNavigation")
			? buildMarkerNavigationDialogHtml()
			: "")
	);
}

export function buildMainControlHtml(
	ctx: ViewRenderer,
	runtimes: TrackRuntime[],
): string {
	let presetDropdownHtml = "";
	if (ctx.presetEntries.length >= 2) {
		presetDropdownHtml +=
			'<li class="preset-selector-wrap"><select class="preset-selector" title="Select Preset">';
		ctx.presetEntries.forEach(
			(preset: { id: string; label: string }, i: number) => {
				presetDropdownHtml +=
					'<option value="' +
					escapeHtml(preset.id) +
					'"' +
					(i === 0 ? " selected" : "") +
					">" +
					escapeHtml(preset.label) +
					"</option>";
			},
		);
		presetDropdownHtml += "</select></li>";
	}

	const controlHtml = (control: TrackSwitchNavigationBarControl): string => {
		switch (control) {
			case "playback":
				return (
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
					"</li>"
				);
			case "globalVolume":
				return (
					'<li class="volume"><div class="volume-control"><i class="volume-icon">' +
					renderIconSlotHtml("volume-high") +
					"</i>" +
					'<input type="range" class="volume-slider" min="0" max="100" value="100"></div></li>'
				);
			case "globalPan":
				return (
					'<li class="pan"><div class="pan-control"><span class="pan-label">L/R</span>' +
					'<input type="range" class="pan-slider mix-slider" min="-100" max="100" value="0"></div></li>'
				);
			case "markerNavigation":
				return (
					'<li class="marker-navigation-group"><div class="marker-navigation-controls" role="group" aria-label="Marker navigation">' +
					'<button type="button" class="marker-previous button" title="Previous marker" aria-label="Previous marker" disabled>' +
					renderIconSlotHtml("marker-previous") +
					"</button>" +
					'<button type="button" class="marker-jump button" title="Jump to marker" aria-label="Jump to marker" disabled>' +
					renderIconSlotHtml("marker-jump") +
					"</button>" +
					'<button type="button" class="marker-next button" title="Next marker" aria-label="Next marker" disabled>' +
					renderIconSlotHtml("marker-next") +
					"</button>" +
					"</div></li>"
				);
			case "markerEditing":
				return (
					'<li class="marker-editing-group"><div class="marker-editing-controls" role="group" aria-label="Marker editing">' +
					'<button type="button" class="marker-edit-toggle button" title="Edit markers" aria-label="Edit markers" aria-pressed="false" disabled>' +
					renderIconSlotHtml("marker-edit") +
					"</button>" +
					'<div class="marker-editing-tools" role="group" aria-label="Marker editing tools" hidden>' +
					'<select class="marker-edit-sequence" title="Marker sequence to edit" aria-label="Marker sequence to edit"></select>' +
					'<button type="button" class="marker-edit-add button" title="Add markers by clicking a view (M adds one at the current position)" aria-label="Add markers" aria-pressed="false">' +
					renderIconSlotHtml("marker-add") +
					"</button>" +
					'<button type="button" class="marker-edit-remove button" title="Remove markers by clicking them" aria-label="Remove markers" aria-pressed="false">' +
					renderIconSlotHtml("marker-remove") +
					"</button>" +
					'<button type="button" class="marker-edit-sonify button" title="Play a click on every marker" aria-label="Play a click on every marker" aria-pressed="false">' +
					renderIconSlotHtml("marker-sonify") +
					"</button>" +
					'<button type="button" class="marker-edit-download button" title="Download markers as CSV" aria-label="Download markers as CSV">' +
					renderIconSlotHtml("download") +
					"</button>" +
					"</div>" +
					"</div></li>"
				);
			case "looping":
				return (
					'<li class="loop-group"><ul class="loop-controls">' +
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
				);
			case "sync":
				return ctx.shouldRenderGlobalSync(runtimes)
					? '<li class="sync-global button" title="Use synchronized version">SYNC</li>'
					: "";
			case "presets":
				return presetDropdownHtml;
			case "timer":
				return '<li class="timing"><span class="time">--:--:--:---</span> / <span class="length">--:--:--:---</span></li>';
			case "seekBar":
				return (
					'<li class="seekwrap">' +
					'<div class="seekbar">' +
					'<div class="loop-region"></div>' +
					'<div class="loop-marker marker-a"></div>' +
					'<div class="loop-marker marker-b"></div>' +
					'<div class="seekhead"></div>' +
					"</div>" +
					"</li>"
				);
			case "fullscreen-control":
				return (
					'<li class="fullscreen-toggle button" title="Enter Fullscreen (F)" aria-label="Enter Fullscreen">' +
					renderIconSlotHtml("expand") +
					"</li>"
				);
		}
	};

	const controls = ctx.navigationBar?.controls ?? [];
	const bodyControls: TrackSwitchNavigationBarControl[] = [];
	let fullscreenHtml = "";

	// Every control flows left in configured order, including "timer" (which
	// pins itself right via margin-left:auto but otherwise stays in flow),
	// except "fullscreen-control", which is pinned to the top-right corner,
	// out of flow entirely - see main-control.css.
	controls.forEach((control) => {
		if (control === "fullscreen-control") {
			fullscreenHtml = controlHtml(control);
		} else {
			bodyControls.push(control);
		}
	});

	const controlsHtml = bodyControls.map(controlHtml).join("") + fullscreenHtml;

	return (
		'<div class="main-control ts-stack-section">' +
		'<ul class="control">' +
		controlsHtml +
		"</ul>" +
		"</div>"
	);
}

export function shouldRenderGlobalSync(
	ctx: ViewRenderer,
	runtimes: TrackRuntime[],
): boolean {
	if (!ctx.isAlignmentMode()) {
		return false;
	}

	return runtimes.some((runtime: TrackRuntime) => {
		const sources = runtime.definition.syncedSources;
		return Array.isArray(sources) && sources.length > 0;
	});
}

export function buildTrackRow(
	ctx: ViewRenderer,
	runtime: TrackRuntime,
	index: number,
	trackListOptions: TrackListGroup,
): HTMLElement {
	const tabviewClass = ctx.features.tabView ? " tabs" : "";
	const radioSoloClass = trackListOptions.exclusiveSolo ? " radio" : "";
	const wholeSoloClass = trackListOptions.exclusiveSolo ? " solo" : "";

	const track = document.createElement("li");
	track.className = `track${tabviewClass}${wholeSoloClass}`;
	applyCssOverrides(track, runtime.definition.css);
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

	const showVolumeControl =
		runtime.definition.volumeControl ?? trackListOptions.trackVolumeControls;
	const panControl =
		runtime.definition.panControl ?? trackListOptions.trackPanControls;
	const showPanControl = panControl !== undefined && panControl !== "none";

	if (showVolumeControl || showPanControl) {
		const mixControls = document.createElement("div");
		mixControls.className = "track-mix-controls";

		if (showVolumeControl) {
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

		if (showPanControl) {
			const panControlEl = document.createElement("div");
			panControlEl.className = "track-pan-control";

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

			panControlEl.appendChild(panLabel);
			panControlEl.appendChild(panSlider);
			mixControls.appendChild(panControlEl);
		}

		track.appendChild(mixControls);
	}

	return track;
}

/**
 * The row that selects a whole `trackList` — its tracks share one alignment
 * timeline, which makes the list itself one of the timelines the player picks
 * from, and its rows the mix inside that pick.
 */
function buildTrackListSelectRow(group: TrackListGroup): HTMLElement {
	const row = document.createElement("li");
	row.className = "track track-list-select solo";

	const title = document.createElement("span");
	title.className = "track-title";
	title.textContent = group.title ?? "";
	row.appendChild(title);

	const controls = document.createElement("ul");
	controls.className = "control";

	const solo = document.createElement("li");
	solo.className = "solo button radio";
	solo.title = "Solo this track list";
	solo.textContent = "Solo";
	solo.insertAdjacentHTML("beforeend", renderIconSlotHtml("circle"));
	controls.appendChild(solo);

	row.appendChild(controls);
	return row;
}

/**
 * Only an aligned player has two levels to separate, and only against another
 * selectable timeline — a lone list is the whole player and selects itself.
 */
function needsTrackListSelectRow(
	ctx: ViewRenderer,
	group: TrackListGroup,
): boolean {
	return (
		ctx.isAlignmentMode() && !group.exclusiveSolo && ctx.trackGroups.length > 1
	);
}

export function renderTrackList(
	ctx: ViewRenderer,
	runtimes: TrackRuntime[],
): void {
	ctx.queryAll(".track_list").forEach((existing: HTMLElement) => {
		existing.remove();
	});

	ctx.trackGroups.forEach((group: TrackListGroup) => {
		const list = document.createElement("ul");
		list.className = "track_list";
		list.setAttribute("data-track-group-index", String(group.groupIndex));

		if (needsTrackListSelectRow(ctx, group)) {
			list.appendChild(buildTrackListSelectRow(group));
		}

		for (const trackId of group.trackIds) {
			const trackIndex = runtimes.findIndex(
				(runtime: TrackRuntime) => runtime.definition.id === trackId,
			);
			const runtime = runtimes[trackIndex];
			if (!runtime) {
				continue;
			}

			const row = ctx.buildTrackRow(runtime, trackIndex, group);
			if (
				typeof group.rowHeight === "number" &&
				Number.isFinite(group.rowHeight) &&
				group.rowHeight > 0
			) {
				const rowHeight = Math.round(group.rowHeight);
				row.dataset.rowHeight = String(rowHeight);
				row.style.setProperty("--ts-track-row-height", `${rowHeight}px`);
			}

			list.appendChild(row);
		}

		const container = ctx.query(
			`.track-group[data-track-group-index="${group.groupIndex}"]`,
		);
		if (container) {
			container.appendChild(list);
			return;
		}

		ctx.root.appendChild(list);
	});
}

export function prepareTextPanels(ctx: ViewRenderer): void {
	const hosts = ctx.root.querySelectorAll(".ts-text");
	hosts.forEach((hostElement: Element) => {
		if (!(hostElement instanceof HTMLElement)) {
			return;
		}
		const definition = ctx.getConfiguredViewHost(hostElement);
		if (definition.view.type !== "text") return;
		const config = definition.view as TrackSwitchTextViewConfig;

		hostElement.classList.add("ts-stack-section");
		applyCssOverrides(hostElement, config.css);
		hostElement.style.textAlign = config.align ?? "center";
		hostElement.style.cursor = "default";
		hostElement.style.fontWeight = config.bold ? "700" : "400";
		hostElement.style.fontStyle = config.italic ? "italic" : "normal";

		const fontSize = config.fontSize ?? null;
		if (fontSize !== null) {
			hostElement.style.fontSize = `${fontSize}px`;
		} else {
			hostElement.style.removeProperty("font-size");
		}
	});
}

export function prepareCustomizablePanels(ctx: ViewRenderer): void {
	const root = ctx.root as HTMLElement;
	// A separator is a rule, not a panel: wrapping it in a drag shell would
	// give a 2px divider a 24px handle.
	const panels = Array.from(ctx.root.children).filter(
		(child): child is HTMLElement =>
			child instanceof HTMLElement &&
			child.classList.contains("ts-stack-section") &&
			!child.classList.contains("main-control") &&
			!child.classList.contains("ts-separator"),
	);

	if (!ctx.features.customizablePanelOrder) {
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
}

export function startPanelReorder(
	ctx: ViewRenderer,
	event: PanelReorderStartEvent,
): boolean {
	if (!ctx.features.customizablePanelOrder || ctx.panelDragState) {
		return false;
	}

	const handle =
		event.target instanceof Element
			? event.target.closest(".ts-panel-handle")
			: null;
	if (!(handle instanceof HTMLElement) || !ctx.root.contains(handle)) {
		return false;
	}

	const panel = handle.closest(
		'.ts-stack-section[data-customizable-panel="true"]',
	);
	if (!(panel instanceof HTMLElement) || !ctx.root.contains(panel)) {
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
	if (originalEvent instanceof PointerEvent && "setPointerCapture" in handle) {
		handle.setPointerCapture(originalEvent.pointerId);
	}

	panel.classList.add("ts-panel-dragging");
	panel.style.width = `${rect.width}px`;
	panel.style.height = `${rect.height}px`;
	panel.style.left = `${rect.left}px`;
	panel.style.top = `${rect.top}px`;
	ctx.root.classList.add("ts-panel-reorder-active");

	ctx.panelDragState = {
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
}

export function movePanelReorder(
	ctx: ViewRenderer,
	event: PanelReorderMoveEvent,
): boolean {
	const dragState = ctx.panelDragState;
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
	const candidates = getReorderablePanels(ctx.root, [
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
			ctx.root.insertBefore(dragState.placeholder, candidate);
			inserted = true;
		}
	});

	if (!inserted) {
		ctx.root.appendChild(dragState.placeholder);
	}

	event.preventDefault();
	return true;
}

export function endPanelReorder(
	ctx: ViewRenderer,
	event: PanelReorderEndEvent | null = null,
): boolean {
	const dragState = ctx.panelDragState;
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
	ctx.root.classList.remove("ts-panel-reorder-active");
	ctx.panelDragState = null;

	if (event) {
		event.preventDefault();
	}

	return true;
}

export function wrapSeekableImages(ctx: ViewRenderer): void {
	ctx.imageSeekSurfaces.length = 0;
	const candidates = ctx.queryAll(":scope > img");

	candidates.forEach((candidate: HTMLElement) => {
		if (!(candidate instanceof HTMLImageElement)) {
			return;
		}

		if (candidate.parentElement?.classList.contains("seekable-img-wrap")) {
			return;
		}
		const definition = ctx.getConfiguredViewHost(candidate);
		if (
			definition.view.type !== "image" &&
			definition.view.type !== "perTrackImage"
		)
			return;
		const config = definition.view;

		const section = document.createElement("div");
		section.className = "seekable-section ts-stack-section";

		const wrapper = document.createElement("div");
		wrapper.className = "seekable-img-wrap";
		applyCssOverrides(wrapper, config.css);

		const parent = candidate.parentElement;
		if (!parent) {
			return;
		}

		parent.insertBefore(section, candidate);
		section.appendChild(wrapper);
		wrapper.appendChild(candidate);

		wrapper.insertAdjacentHTML(
			"beforeend",
			buildSeekWrap({
				insetPercent: {
					left: clampPercent(config.seekMarginLeft),
					right: clampPercent(config.seekMarginRight),
				},
			}),
		);
		const seekWrap = wrapper.querySelector(":scope > .seekwrap");
		if (seekWrap instanceof HTMLElement) {
			ctx.registerSeekMarkerLayers(seekWrap, config.markerLayers);
			const perTrack = config.type === "perTrackImage";
			seekWrap.setAttribute(
				"data-marker-image-scope",
				perTrack ? "per-track" : "global",
			);
			if (!candidate.classList.contains("seekable")) {
				seekWrap.classList.add("marker-only-seekwrap");
			}
			const alignmentColumn = perTrack
				? null
				: definition.alignmentTimeline || null;
			ctx.registerSeekTimeline(seekWrap, alignmentColumn);
			if (alignmentColumn) {
				seekWrap.setAttribute("data-seek-surface", "image");
			}
			ctx.imageSeekSurfaces.push({
				seekWrap,
				wrapper,
				image: candidate,
				alignmentColumn,
			});
		}
	});
}

export function wrapSheetMusicContainers(ctx: ViewRenderer): void {
	ctx.sheetMusicHosts.length = 0;

	const hosts = ctx.root.querySelectorAll(".sheetmusic");
	hosts.forEach((hostElement: Element) => {
		if (!(hostElement instanceof HTMLElement)) {
			return;
		}
		const definition = ctx.getConfiguredViewHost(hostElement);
		if (definition.view.type !== "sheetMusic") return;
		const config = definition.view as TrackSwitchSheetMusicViewConfig;

		let wrapper: HTMLElement | null = hostElement.closest(
			".sheetmusic-wrap",
		) as HTMLElement | null;
		let scrollContainer: HTMLElement | null = null;

		if (!wrapper) {
			wrapper = document.createElement("div");
			wrapper.className = "sheetmusic-wrap ts-stack-section";
			applyCssOverrides(wrapper, config.css);

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

		const maxWidth = config.maxWidth ?? null;
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

		const maxHeight = config.maxHeight ?? null;
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

		const source = definition.source ?? null;
		if (!source) {
			return;
		}

		ctx.sheetMusicHosts.push({
			host: hostElement,
			scrollContainer: scrollContainer,
			source: source,
			measureColumn: definition.alignmentTimeline?.trim() || null,
			renderScale: config.renderScale ?? null,
			followPlayback: config.followPlayback ?? true,
			cursorColor: config.cursorColor ?? "#999999",
			cursorAlpha: config.cursorAlpha ?? 0.4,
			configuredMaxHeight: maxHeight,
		});
	});
}

/** Loop markers live in reference coordinates; a local axis needs them mapped. */
function mapLoopToTimeline(
	loop: { pointA: number | null; pointB: number | null; enabled: boolean },
	context: { fromReferenceTime(value: number): number },
): { pointA: number | null; pointB: number | null; enabled: boolean } {
	return {
		pointA:
			loop.pointA === null ? null : context.fromReferenceTime(loop.pointA),
		pointB:
			loop.pointB === null ? null : context.fromReferenceTime(loop.pointB),
		enabled: loop.enabled,
	};
}

const OUT_OF_COVERAGE_CLASS = "ts-out-of-coverage";
const OUT_OF_COVERAGE_TITLE =
	"Outside this timeline's aligned region — position held at the last aligned point.";

/**
 * Marks a surface whose timeline has no alignment data at the current position.
 * It holds at its boundary while the media keep playing, so the freeze needs to
 * read as intentional rather than as a stuck playhead.
 */
export function applySeekWrapCoverageState(
	ctx: ViewRenderer,
	seekWrap: HTMLElement,
): void {
	const timeline = ctx.getSeekTimeline(seekWrap);
	const outOfCoverage = Boolean(
		timeline && ctx.isTimelineCovered && !ctx.isTimelineCovered(timeline),
	);

	if (seekWrap.classList.contains(OUT_OF_COVERAGE_CLASS) === outOfCoverage) {
		return;
	}

	seekWrap.classList.toggle(OUT_OF_COVERAGE_CLASS, outOfCoverage);
	const host = seekWrap.parentElement;
	host?.classList.toggle(OUT_OF_COVERAGE_CLASS, outOfCoverage);
	if (outOfCoverage) {
		seekWrap.title = OUT_OF_COVERAGE_TITLE;
	} else {
		seekWrap.removeAttribute("title");
	}
}

export function getPreparedSheetMusicHosts(
	ctx: ViewRenderer,
): SheetMusicHostConfig[] {
	return ctx.sheetMusicHosts.map((entry: SheetMusicHostConfig) => {
		return {
			host: entry.host,
			scrollContainer: entry.scrollContainer,
			source: entry.source,
			measureColumn: entry.measureColumn,
			renderScale: entry.renderScale,
			followPlayback: entry.followPlayback,
			cursorColor: entry.cursorColor,
			cursorAlpha: entry.cursorAlpha,
			configuredMaxHeight: entry.configuredMaxHeight,
		};
	});
}

export function updateMainControls(
	ctx: ViewRenderer,
	state: TrackSwitchUiState,
	runtimes: TrackRuntime[],
	waveformTimelineContext: WaveformTimelineContext | undefined,
	warpingMatrixContext: WarpingMatrixRenderContext | undefined,
): void {
	ctx.updatePlaybackPosition(
		state,
		runtimes,
		waveformTimelineContext,
		warpingMatrixContext,
	);

	ctx.root.classList.toggle("sync-enabled", state.syncEnabled);

	ctx.queryAll(".playpause").forEach((element: HTMLElement) => {
		element.classList.toggle("checked", state.playing);
		setHostIcon(element, state.playing ? "pause" : "play");
	});

	ctx.queryAll(".repeat").forEach((element: HTMLElement) => {
		element.classList.toggle("checked", state.repeat);
	});

	ctx.queryAll(".sync-global").forEach((element: HTMLElement) => {
		element.classList.toggle("checked", state.syncEnabled);
		element.classList.toggle("disabled", !state.syncAvailable);
	});

	ctx.warpingMatrixHosts.forEach((host) => {
		ctx.updateWarpingMatrix(host, warpingMatrixContext);
	});

	if (!navigationBarHasControl(ctx.navigationBar, "looping")) {
		return;
	}

	ctx.queryAll(".loop-a").forEach((element: HTMLElement) => {
		element.classList.toggle("checked", state.loop.pointA !== null);
		element.classList.toggle("active", state.loop.enabled);
	});

	ctx.queryAll(".loop-b").forEach((element: HTMLElement) => {
		element.classList.toggle("checked", state.loop.pointB !== null);
		element.classList.toggle("active", state.loop.enabled);
	});

	ctx.queryAll(".loop-toggle").forEach((element: HTMLElement) => {
		element.classList.toggle("checked", state.loop.enabled);
	});
}

export function updatePlaybackPosition(
	ctx: ViewRenderer,
	state: TrackSwitchUiState,
	runtimes: TrackRuntime[],
	waveformTimelineContext: WaveformTimelineContext | undefined,
	warpingMatrixContext: WarpingMatrixRenderContext | undefined,
): void {
	ctx.root.classList.toggle("sync-enabled", state.syncEnabled);

	const seekWraps = ctx.queryAll(".seekwrap");
	seekWraps.forEach((seekWrap: HTMLElement) => {
		// An aligned image has its own (possibly non-linear) axis, so its
		// playhead comes from the projection rather than a linear ratio.
		const imageContext = ctx.resolveImageTimelineContext(seekWrap);
		if (imageContext) {
			ctx.updateSeekWrapVisuals(
				seekWrap,
				imageContext.playbackPosition?.() ??
					imageContext.fromReferenceTime(state.position),
				imageContext.duration,
				mapLoopToTimeline(state.loop, imageContext),
			);
		} else {
			ctx.updateSeekWrapVisuals(
				seekWrap,
				state.position,
				state.longestDuration,
				state.loop,
			);
		}
		ctx.applySeekWrapCoverageState(seekWrap);
	});

	ctx.applyWaveformLocalSeekVisuals(state, runtimes, waveformTimelineContext);

	if (navigationBarHasControl(ctx.navigationBar, "timer")) {
		ctx.updateTiming(state.position, state.longestDuration);
	}

	ctx.updateWaveformTiming(state, runtimes, waveformTimelineContext);
	updateTimelineZoomIndicators(ctx.waveformSeekSurfaces);
	ctx.updatePianoRollPlaybackState(state, true, false);
	updateTimelineZoomIndicators(ctx.pianoRollSeekSurfaces);
	ctx.warpingMatrixHosts.forEach((host) => {
		ctx.updateWarpingMatrixPlaybackState(host, warpingMatrixContext);
	});
}

export function updateTrackControls(
	ctx: ViewRenderer,
	runtimes: TrackRuntime[],
	syncLockedTrackIndexes: ReadonlySet<number> | undefined,
	stereoPanningSupported: boolean,
	syncEnabled: boolean,
): void {
	runtimes.forEach((runtime: TrackRuntime, index: number) => {
		const rows = ctx.queryAll(`.track[data-track-index="${index}"]`);
		if (rows.length === 0) {
			return;
		}

		const isLocked =
			!!syncLockedTrackIndexes && syncLockedTrackIndexes.has(index);
		// A "balance" track mixes with plain gain nodes, so it stays usable even
		// where StereoPannerNode ("pan" tracks only) is unavailable.
		const panSupported =
			runtime.panAlgorithm === "balance" || stereoPanningSupported;
		// A row repeats the colour(s) its track carries in a piano roll, so the
		// list and the notes read as one code.
		const channelColors = ctx.resolvePianoRollTrackChannelColors(
			runtime.definition.id,
		);

		rows.forEach((row: HTMLElement) => {
			const solo = row.querySelector(".solo");
			// A track may be listed twice, so each row follows the list it sits in.
			const singleSoloMode = ctx.isGroupExclusive(trackGroupIndexOfRow(row));
			row.classList.toggle("solo", singleSoloMode);

			if (solo instanceof HTMLElement) {
				solo.classList.toggle("checked", runtime.state.solo);
				solo.classList.toggle("disabled", isLocked);
				solo.classList.toggle("radio", singleSoloMode);
				applySoloIconState(
					solo,
					runtime.state.solo,
					singleSoloMode,
					!!syncEnabled,
				);
			}

			const group = ctx.trackGroups[trackGroupIndexOfRow(row)];
			const iconColorsEnabled = group?.channelColorIcons ?? true;
			applyTrackChannelColors(
				row,
				solo,
				iconColorsEnabled ? channelColors : null,
			);

			const trackVolumeSlider = row.querySelector(".track-volume-slider");
			if (trackVolumeSlider instanceof HTMLInputElement) {
				trackVolumeSlider.value = String(
					Math.round(sanitizeVolume(runtime.state.volume) * 100),
				);
				trackVolumeSlider.disabled = isLocked;
			}

			const trackPanSlider = row.querySelector(".track-pan-slider");
			if (trackPanSlider instanceof HTMLInputElement) {
				trackPanSlider.value = String(
					Math.round(sanitizePan(panSupported ? runtime.state.pan : 0) * 100),
				);
				trackPanSlider.disabled = isLocked || !panSupported;
			}

			const trackVolumeIcon = row.querySelector(".track-volume-icon");
			if (trackVolumeIcon instanceof HTMLElement) {
				ctx.applyVolumeIconState(trackVolumeIcon, runtime.state.volume);
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
	});

	// Sync mode plays every timeline at once, so there is nothing to select.
	ctx.trackGroups.forEach((group: TrackListGroup) => {
		const solo = ctx.query(
			`.track_list[data-track-group-index="${group.groupIndex}"] .track-list-select .solo`,
		);
		if (!solo) {
			return;
		}

		const isActive = ctx.isTrackListUnitActive(group.groupIndex);
		solo.classList.toggle("checked", isActive);
		solo.classList.toggle("disabled", !!syncEnabled);
		applySoloIconState(solo, isActive, true, !!syncEnabled);
	});
}

export function switchPosterImage(
	ctx: ViewRenderer,
	runtimes: TrackRuntime[],
): void {
	let soloCount = 0;
	let source: PerTrackImageSource | null = null;
	const switchTargets = ctx.queryAll('img[data-per-track-image="true"]');

	for (const runtime of runtimes) {
		if (runtime.state.solo) {
			soloCount += 1;
			const configured: PerTrackImageSource | undefined =
				ctx.perTrackImageSources.get(runtime.definition.id);
			source = configured ?? source;
		}
	}

	if (switchTargets.length === 0) {
		return;
	}

	const next: PerTrackImageSource | null = soloCount === 1 ? source : null;

	switchTargets.forEach((element: HTMLElement) => {
		if (!(element instanceof HTMLImageElement)) {
			return;
		}

		const container = element.parentElement?.classList.contains(
			"seekable-img-wrap",
		)
			? element.parentElement
			: element;

		// The surface adopts the shown medium's timeline, so seeks and markers
		// follow the soloed track rather than the reference playhead.
		ctx.retimeImageSurface(element, next ? next.alignmentTimeline : "");

		if (!next) {
			setDisplay(container, "none");
			setDisplay(element, "none");
			return;
		}

		setDisplay(container, "");
		setDisplay(element, "");

		const currentSrc = element.getAttribute("data-per-track-current-src");
		if (currentSrc !== next.src) {
			element.src = next.src;
			element.setAttribute("data-per-track-current-src", next.src);
		}
	});
}

export function setVolumeSlider(
	ctx: ViewRenderer,
	volumeZeroToOne: number,
): void {
	const slider = ctx.query(".main-control .volume-slider");
	if (!slider || !(slider instanceof HTMLInputElement)) {
		return;
	}

	slider.value = String(Math.round(volumeZeroToOne * 100));
	ctx.updateVolumeIcon(volumeZeroToOne);
}

export function setTrackVolumeSlider(
	ctx: ViewRenderer,
	trackIndex: number,
	volumeZeroToOne: number,
): void {
	const row = ctx.query(`.track[data-track-index="${trackIndex}"]`);
	if (!row) {
		return;
	}

	const slider = row.querySelector(".track-volume-slider");
	if (!(slider instanceof HTMLInputElement)) {
		return;
	}

	slider.value = String(Math.round(sanitizeVolume(volumeZeroToOne) * 100));
}

export function setPanSlider(
	ctx: ViewRenderer,
	panMinusOneToOne: number,
): void {
	const slider = ctx.query(".main-control .pan-slider");
	if (!slider || !(slider instanceof HTMLInputElement)) {
		return;
	}

	slider.value = String(Math.round(sanitizePan(panMinusOneToOne) * 100));
}

export function setTrackPanSlider(
	ctx: ViewRenderer,
	trackIndex: number,
	panMinusOneToOne: number,
): void {
	const row = ctx.query(`.track[data-track-index="${trackIndex}"]`);
	if (!row) {
		return;
	}

	const slider = row.querySelector(".track-pan-slider");
	if (!(slider instanceof HTMLInputElement)) {
		return;
	}

	slider.value = String(Math.round(sanitizePan(panMinusOneToOne) * 100));
}

export function updateVolumeIcon(
	ctx: ViewRenderer,
	volumeZeroToOne: number,
): void {
	ctx
		.queryAll(".main-control .volume-control .volume-icon")
		.forEach((icon: HTMLElement) => {
			ctx.applyVolumeIconState(icon, volumeZeroToOne);
		});
}

export function applyVolumeIconState(
	icon: HTMLElement,
	volumeZeroToOne: number,
): void {
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
}

export function setOverlayLoading(ctx: ViewRenderer, isLoading: boolean): void {
	ctx
		.queryAll(".overlay-activation .activate")
		.forEach((activate: HTMLElement) => {
			activate.classList.toggle("loading", isLoading);
			activate.classList.remove("error");
			setHostIcon(activate, isLoading ? "spinner" : "power-off");

			const iconSlot = getHostIconSlot(activate);
			if (iconSlot) {
				iconSlot.classList.toggle("is-spinning", isLoading);
			}
		});

	ctx.queryAll(".overlay-activation").forEach((overlay: HTMLElement) => {
		overlay.classList.toggle("loading", isLoading);
	});
}

const shortcutOverlayPositionCleanupByOverlay = new WeakMap<
	HTMLElement,
	() => void
>();

function positionShortcutOverlay(
	root: HTMLElement,
	overlay: HTMLElement,
): void {
	const rect = root.getBoundingClientRect();
	overlay.style.left = `${rect.left}px`;
	overlay.style.top = `${rect.top}px`;
	overlay.style.width = `${rect.width}px`;
	overlay.style.height = `${rect.height}px`;
}

function trackShortcutOverlayPosition(
	root: HTMLElement,
	overlay: HTMLElement,
): void {
	if (shortcutOverlayPositionCleanupByOverlay.has(overlay)) {
		return;
	}
	const ownerWindow = root.ownerDocument.defaultView;
	if (!ownerWindow) {
		return;
	}
	let animationFrame: number | null = null;
	const updatePosition = (): void => {
		animationFrame = null;
		if (overlay.matches(":popover-open")) {
			positionShortcutOverlay(root, overlay);
		}
	};
	const schedulePositionUpdate = (): void => {
		if (animationFrame === null) {
			animationFrame = ownerWindow.requestAnimationFrame(updatePosition);
		}
	};
	const cleanup = (): void => {
		ownerWindow.removeEventListener("scroll", schedulePositionUpdate, true);
		ownerWindow.removeEventListener("resize", schedulePositionUpdate);
		if (animationFrame !== null) {
			ownerWindow.cancelAnimationFrame(animationFrame);
		}
		shortcutOverlayPositionCleanupByOverlay.delete(overlay);
	};
	shortcutOverlayPositionCleanupByOverlay.set(overlay, cleanup);
	ownerWindow.addEventListener("scroll", schedulePositionUpdate, {
		capture: true,
		passive: true,
	});
	ownerWindow.addEventListener("resize", schedulePositionUpdate);
}

export function setShortcutHelpVisible(
	ctx: ViewRenderer,
	isVisible: boolean,
): void {
	const root = ctx.root;
	ctx.queryAll(".overlay-shortcuts").forEach((overlay: HTMLElement) => {
		overlay.classList.toggle("is-hidden", !isVisible);
		overlay.setAttribute("aria-hidden", isVisible ? "false" : "true");

		if (isVisible) {
			positionShortcutOverlay(root, overlay);
			if (!overlay.matches(":popover-open")) {
				overlay.showPopover();
			}
			trackShortcutOverlayPosition(root, overlay);
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

		if (overlay.matches(":popover-open")) {
			overlay.hidePopover();
		}
		shortcutOverlayPositionCleanupByOverlay.get(overlay)?.();
	});
}

export function setFullscreen(ctx: ViewRenderer, active: boolean): void {
	ctx.root.classList.toggle("ts-fullscreen", active);
	ctx.queryAll(".fullscreen-toggle").forEach((element: HTMLElement) => {
		element.classList.toggle("checked", active);
		element.setAttribute(
			"title",
			active ? "Exit Fullscreen (F)" : "Enter Fullscreen (F)",
		);
		element.setAttribute(
			"aria-label",
			active ? "Exit Fullscreen" : "Enter Fullscreen",
		);
		setHostIcon(element, active ? "minimize" : "expand");
	});
}

export function updateOverlayDownloadInfo(
	ctx: ViewRenderer,
	info: AudioDownloadSizeInfo,
): void {
	const downloadInfo = ctx.query(".overlay-download-info");
	if (!downloadInfo) {
		return;
	}

	downloadInfo.textContent = renderOverlayDownloadInfoText(info);
}

export function hideOverlayOnLoaded(ctx: ViewRenderer): void {
	ctx.queryAll(".overlay-activation").forEach((overlay: HTMLElement) => {
		overlay.classList.add("is-hidden");
	});
}

export function showError(
	ctx: ViewRenderer,
	message: string,
	runtimes: TrackRuntime[],
): void {
	ctx.root.classList.add("error");

	ctx.queryAll(".overlay-activation").forEach((overlay: HTMLElement) => {
		overlay.classList.remove("is-hidden");
	});

	ctx
		.queryAll(".overlay-activation .activate")
		.forEach((activate: HTMLElement) => {
			activate.classList.remove("loading");
			activate.classList.add("error");
			setHostIcon(activate, "exclamation");

			const iconSlot = getHostIconSlot(activate);
			if (iconSlot) {
				iconSlot.classList.remove("is-spinning");
			}
		});

	const overlayText = ctx.query("#overlaytext");
	if (overlayText) {
		overlayText.textContent = message;
	}

	runtimes.forEach((runtime: TrackRuntime, index: number) => {
		if (!runtime.errored) {
			return;
		}

		const row = ctx.query(`.track[data-track-index="${index}"]`);
		if (row) {
			row.classList.add("error");
		}
	});
}

export function destroy(ctx: ViewRenderer): void {
	if (ctx.panelDragState) {
		ctx.endPanelReorder();
	}

	if (ctx.waveformTileRefreshFrameId !== null) {
		cancelAnimationFrame(ctx.waveformTileRefreshFrameId);
		ctx.waveformTileRefreshFrameId = null;
	}

	ctx.latestWaveformRenderInput = null;
	ctx.waveformSeekSurfaces.length = 0;
	ctx.pianoRollSeekSurfaces.length = 0;
	ctx.imageSeekSurfaces.length = 0;
	ctx.sheetMusicHosts.length = 0;
	ctx.warpingMatrixHosts.length = 0;
	ctx.panelDragState = null;
	resetManagedRoot(ctx.root);
}

export function getPresetCount(ctx: ViewRenderer): number {
	return ctx.presetEntries.length;
}

export function updateTiming(
	ctx: ViewRenderer,
	position: number,
	longestDuration: number,
): void {
	// One pair, so the unit is named once across both halves.
	const readout = ctx.formatReferenceTimelinePair(position, longestDuration);
	ctx.queryAll(".timing .time").forEach((node: HTMLElement) => {
		node.textContent = readout.position;
	});

	ctx.queryAll(".timing .length").forEach((node: HTMLElement) => {
		node.textContent = readout.duration;
	});

	// The readout is on the reference timeline, which may have no data out
	// where the reference playhead currently is.
	const referenceTimeline = ctx.referenceTimelineId;
	const outOfCoverage = Boolean(
		referenceTimeline &&
			ctx.isTimelineCovered &&
			!ctx.isTimelineCovered(referenceTimeline),
	);
	ctx.queryAll(".timing").forEach((node: HTMLElement) => {
		node.classList.toggle(OUT_OF_COVERAGE_CLASS, outOfCoverage);
	});
}

interface ConfiguredViewRenderer {
	root: HTMLElement;
	registerConfiguredViewHost(
		element: Element,
		definition: {
			view: TrackSwitchViewConfig;
			waveformSource?: "audible" | number | number[];
			alignmentTimeline?: string;
			source?: string;
		},
	): void;
	setPerTrackImageSources(sources: Map<TrackId, PerTrackImageSource>): void;
}

/**
 * Normalization resolves every dimension, so a missing one means an
 * unnormalized config reached the renderer rather than a value needing a default.
 */
function resolvedSize(value: number | undefined, label: string): number {
	if (value === undefined) {
		throw new Error(
			`Internal error: ${label} reached the renderer unresolved.`,
		);
	}

	return value;
}

function resolveWaveformTracksIndex(
	tracks: string[] | "audible" | undefined,
	ctx: ViewNormalizeContext,
): "audible" | number | number[] {
	if (!tracks || tracks === "audible") return "audible";
	const indexes = tracks.map((id) => ctx.trackIds.indexOf(id));
	return indexes.length === 1 ? indexes[0] : indexes;
}

// ═══════════ typed view rendering ═══════════

function renderWarpingMatrix(
	renderer: ConfiguredViewRenderer,
	warpingMatrix: TrackSwitchWarpingMatrixViewConfig,
): void {
	const container = document.createElement("div");
	container.className = "warping-matrix";
	if (warpingMatrix.height !== undefined) {
		container.setAttribute(
			"data-warping-matrix-height",
			String(warpingMatrix.height),
		);
	}
	if (warpingMatrix.tempoSmoothingSeconds !== undefined) {
		container.setAttribute(
			"data-warping-matrix-tempo-smoothing-seconds",
			String(warpingMatrix.tempoSmoothingSeconds),
		);
	}
	container.setAttribute("data-warping-matrix-x", warpingMatrix.x);
	container.setAttribute("data-warping-matrix-y", warpingMatrix.y);
	renderer.registerConfiguredViewHost(container, { view: warpingMatrix });
	renderer.root.appendChild(container);
}

function appendTrackListHost(root: HTMLElement, groupIndex: number): void {
	const container = document.createElement("div");
	container.className = "track-group ts-stack-section";
	container.setAttribute("data-track-group-index", String(groupIndex));
	root.appendChild(container);
}

function appendNavigationBarHost(root: HTMLElement): void {
	const container = document.createElement("div");
	container.className = "navigation-bar-host";
	root.appendChild(container);
}

function renderText(
	renderer: ConfiguredViewRenderer,
	text: TrackSwitchTextViewConfig,
): void {
	const container = document.createElement("div");
	container.className = "ts-text";
	container.textContent = text.text;
	renderer.registerConfiguredViewHost(container, { view: text });
	renderer.root.appendChild(container);
}

function renderSeparator(
	root: HTMLElement,
	separator: TrackSwitchSeparatorViewConfig,
): void {
	const container = document.createElement("div");
	container.className = "ts-separator ts-stack-section";
	container.style.setProperty(
		"--ts-separator-thickness",
		`${String(resolvedSize(separator.thickness, "separator.thickness"))}px`,
	);
	root.appendChild(container);
}

function renderImage(
	renderer: ConfiguredViewRenderer,
	image: TrackSwitchImageViewConfig,
	ctx: ViewNormalizeContext,
): void {
	const entry = ctx.media[image.mediaID];
	const source = entry && "src" in entry ? entry.src : undefined;
	const imageElement = createImageElement(image);
	imageElement.src = source ?? "";
	renderer.registerConfiguredViewHost(imageElement, {
		view: image,
		alignmentTimeline: resolveAlignmentTimelineAttribute(image.mediaID, ctx),
		source,
	});
	renderer.root.appendChild(imageElement);
}

function renderPerTrackImage(
	renderer: ConfiguredViewRenderer,
	image: TrackSwitchPerTrackImageViewConfig,
	ctx: ViewNormalizeContext,
): void {
	renderer.setPerTrackImageSources(collectPerTrackImageSources(ctx));
	const imageElement = createImageElement(image);
	imageElement.classList.add("per-track-image");
	imageElement.setAttribute("data-per-track-image", "true");
	imageElement.style.display = "none";
	renderer.registerConfiguredViewHost(imageElement, { view: image });
	renderer.root.appendChild(imageElement);
}

/**
 * The image medium each track shows when soloed, resolved to what the swap
 * needs: the file to display and the alignment column it is placed on.
 */
function collectPerTrackImageSources(
	ctx: ViewNormalizeContext,
): Map<TrackId, PerTrackImageSource> {
	const sources = new Map<TrackId, PerTrackImageSource>();
	Object.entries(ctx.media).forEach(([trackId, entry]) => {
		if (entry.type !== "audio" || !entry.imageID) {
			return;
		}
		const imageEntry = ctx.media[entry.imageID];
		if (imageEntry?.type !== "image") {
			return;
		}
		sources.set(trackId, {
			src: imageEntry.src,
			alignmentTimeline: resolveAlignmentTimelineAttribute(entry.imageID, ctx),
		});
	});
	return sources;
}

function createImageElement(
	image: Pick<
		TrackSwitchImageViewConfig,
		"seekable" | "css" | "seekMarginLeft" | "seekMarginRight" | "markerLayers"
	>,
): HTMLImageElement {
	const imageElement = document.createElement("img");

	if (image.seekable) {
		imageElement.classList.add("seekable");
	}
	return imageElement;
}

function renderWaveform(
	renderer: ConfiguredViewRenderer,
	waveform: TrackSwitchWaveformViewConfig,
	ctx: ViewNormalizeContext,
): void {
	const sourceIndex = resolveWaveformTracksIndex(waveform.tracks, ctx);
	const canvas = document.createElement("canvas");
	canvas.className = "waveform";
	canvas.width = 1200;
	canvas.height = resolvedSize(waveform.height, "waveform.height");
	renderer.registerConfiguredViewHost(canvas, {
		view: waveform,
		waveformSource: sourceIndex,
		alignmentTimeline: ctx.hasAlignment ? "individual" : "shared",
	});
	renderer.root.appendChild(canvas);
}

function resolveAlignmentTimelineAttribute(
	mediaID: MediaId,
	ctx: ViewNormalizeContext,
): string {
	return ctx.hasAlignment && ctx.alignmentTimelines.has(mediaID) ? mediaID : "";
}

function renderPianoRoll(
	renderer: ConfiguredViewRenderer,
	pianoRoll: TrackSwitchPianoRollViewConfig,
	ctx: ViewNormalizeContext,
): void {
	const canvas = document.createElement("canvas");
	canvas.className = "piano-roll";
	canvas.width = 1200;
	canvas.height = resolvedSize(pianoRoll.height, "pianoRoll.height");
	renderer.registerConfiguredViewHost(canvas, {
		view: pianoRoll,
		alignmentTimeline: resolveAlignmentTimelineAttribute(
			pianoRoll.mediaID,
			ctx,
		),
		source: ctx.media[pianoRoll.mediaID]?.src,
	});
	renderer.root.appendChild(canvas);
}

function renderSheetMusic(
	renderer: ConfiguredViewRenderer,
	sheetmusic: TrackSwitchSheetMusicViewConfig,
	ctx: ViewNormalizeContext,
): void {
	const entry = ctx.media[sheetmusic.mediaID];
	const container = document.createElement("div");
	container.className = "sheetmusic";
	renderer.registerConfiguredViewHost(container, {
		view: sheetmusic,
		alignmentTimeline: resolveAlignmentTimelineAttribute(
			sheetmusic.mediaID,
			ctx,
		),
		source: entry && "src" in entry ? entry.src : undefined,
	});
	renderer.root.appendChild(container);
}

export function renderConfiguredViews(
	renderer: ConfiguredViewRenderer,
	views: TrackSwitchViewConfig[],
	ctx: ViewNormalizeContext,
): void {
	let trackGroupIndex = 0;
	views.forEach((entry) => {
		if (entry.type === "trackList") {
			appendTrackListHost(renderer.root, trackGroupIndex);
			trackGroupIndex += 1;
			return;
		}
		if (entry.type === "navigationBar") {
			appendNavigationBarHost(renderer.root);
			return;
		}
		if (entry.type === "image") {
			renderImage(renderer, entry, ctx);
			return;
		}
		if (entry.type === "text") {
			renderText(renderer, entry);
			return;
		}
		if (entry.type === "separator") {
			renderSeparator(renderer.root, entry);
			return;
		}
		if (entry.type === "perTrackImage") {
			renderPerTrackImage(renderer, entry, ctx);
			return;
		}
		if (entry.type === "waveform") {
			renderWaveform(renderer, entry, ctx);
			return;
		}
		if (entry.type === "pianoRoll") {
			renderPianoRoll(renderer, entry, ctx);
			return;
		}
		if (entry.type === "sheetMusic") {
			renderSheetMusic(renderer, entry, ctx);
			return;
		}
		if (entry.type === "warpingMatrix") {
			renderWarpingMatrix(renderer, entry);
			return;
		}
		throw new Error(
			`Invalid view type: ${String((entry as { type?: unknown }).type)}`,
		);
	});
}

export interface TrackSwitchErrorPanelOptions {
	title?: string;
	message: string;
	details?: string;
}

const STATUS_PANEL_CLASS = "ts-status-panel";

function removeStatusPanel(mountRoot: HTMLElement): void {
	mountRoot
		.querySelectorAll(`:scope > .${STATUS_PANEL_CLASS}`)
		.forEach((panel) => {
			panel.remove();
		});
}

function createStatusPanel(variant: "loading" | "error"): HTMLDivElement {
	const panel = document.createElement("div");
	panel.className = `trackswitch ${STATUS_PANEL_CLASS} ${STATUS_PANEL_CLASS}-${variant}`;
	return panel;
}

/**
 * Placeholder shown while the declarative config is still being resolved so the
 * element always occupies space instead of staying invisible.
 */
export function renderTrackSwitchLoadingPanel(mountRoot: HTMLElement): void {
	removeStatusPanel(mountRoot);

	const panel = createStatusPanel("loading");
	panel.innerHTML =
		'<div class="ts-status-panel-body">' +
		renderIconSlotHtml("spinner", "ts-status-panel-icon") +
		'<p class="ts-status-panel-message">Loading player…</p>' +
		"</div>";
	mountRoot.append(panel);
}

export function renderTrackSwitchErrorPanel(
	mountRoot: HTMLElement,
	options: TrackSwitchErrorPanelOptions,
): void {
	mountRoot.replaceChildren();

	const panel = createStatusPanel("error");
	panel.setAttribute("role", "alert");

	const body = document.createElement("div");
	body.className = "ts-status-panel-body";
	body.innerHTML = renderIconSlotHtml(
		"triangle-exclamation",
		"ts-status-panel-icon",
	);

	const text = document.createElement("div");
	text.className = "ts-status-panel-text";

	const title = document.createElement("p");
	title.className = "ts-status-panel-title";
	title.textContent = options.title ?? "Trackswitch could not start";
	text.append(title);

	const message = document.createElement("p");
	message.className = "ts-status-panel-message";
	message.textContent = options.message;
	text.append(message);

	if (options.details) {
		const details = document.createElement("pre");
		details.className = "ts-status-panel-details";
		details.textContent = options.details;
		text.append(details);
	}

	body.append(text);
	panel.append(body);
	mountRoot.append(panel);
}

export function describeError(error: unknown, fallbackMessage: string): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	if (typeof error === "string" && error) {
		return error;
	}

	return fallbackMessage;
}
