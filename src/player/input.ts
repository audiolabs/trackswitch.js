import {
	closestInRoot,
	eventTargetAsElement,
	getDeepActiveElement,
	getOwnerWindow,
} from "../shared/dom";
import type { PresetsConfig, TrackSwitchFeatures } from "../types";
import {
	addMarkerAtPlayhead,
	downloadMarkers,
	editMarkerElementLabel,
	finishMarkerAdjust,
	placeMarkerFromEvent,
	removeMarkerElement,
	removeMarkerWithTool,
	selectMarkerEditingSequence,
	startMarkerAdjust,
	toggleMarkerAdding,
	toggleMarkerEditing,
	toggleMarkerRemoving,
	toggleMarkerSonifying,
	undoMarkerEdit,
} from "./marker-editing";
import {
	activateTimelineMarker,
	closeMarkerNavigationDialog,
	moveTimelineMarkerFocus,
	openMarkerNavigationDialog,
	snapLoopStartToMarker,
	submitMarkerNavigationDialog,
} from "./markers";
import { activateLoopRange } from "./playback";
import {
	isKeyboardControllerActive,
	setActiveKeyboardController,
	type TrackSwitchControllerImpl,
} from "./player";

export function setKeyboardActive(ctx: TrackSwitchControllerImpl): void {
	setActiveKeyboardController(ctx.instanceId);
}

export function openShortcutHelp(ctx: TrackSwitchControllerImpl): void {
	if (ctx.shortcutHelpOpen) {
		return;
	}
	if (ctx.markerNavigationDialogOpen) {
		closeMarkerNavigationDialog(ctx);
	}

	ctx.shortcutHelpOpen = true;
	ctx.renderer.setShortcutHelpVisible(true);
}

export function toggleShortcutHelp(ctx: TrackSwitchControllerImpl): void {
	if (ctx.shortcutHelpOpen) {
		ctx.closeShortcutHelp();
		return;
	}

	ctx.openShortcutHelp();
}

export function closeShortcutHelp(ctx: TrackSwitchControllerImpl): void {
	if (!ctx.shortcutHelpOpen) {
		return;
	}

	ctx.shortcutHelpOpen = false;
	ctx.renderer.setShortcutHelpVisible(false);
}

export function toggleFullscreen(ctx: TrackSwitchControllerImpl): void {
	ctx.fullscreen = !ctx.fullscreen;
	ctx.renderer.setFullscreen(ctx.fullscreen);
	ctx.updateMainControls();
}

export function onFullscreenToggle(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	if (!isPrimaryInput(event)) {
		return;
	}

	event.preventDefault();
	ctx.toggleFullscreen();
	event.stopPropagation();
}

export function onOverlayActivate(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	if (ctx.root.classList.contains("error")) {
		event.preventDefault();
		event.stopPropagation();
		return;
	}

	if (!isPrimaryInput(event) && event.type !== "click") {
		return;
	}

	event.preventDefault();
	ctx.setKeyboardActive();
	ctx.audioEngine.primeFromUserGesture();
	void ctx.load();
	event.stopPropagation();
}

export function onShortcutHelpOverlay(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	const target = eventTargetAsElement(event.target ?? null);
	if (target?.closest(".shortcut-help-panel")) {
		return;
	}

	event.preventDefault();
	ctx.setKeyboardActive();
	ctx.closeShortcutHelp();
	event.stopPropagation();
}

export function onPlayPause(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	if (!isPrimaryInput(event)) {
		return;
	}

	event.preventDefault();
	ctx.audioEngine.primeFromUserGesture();
	ctx.togglePlay();
	event.stopPropagation();
}

export function onStop(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	if (!isPrimaryInput(event)) {
		return;
	}

	event.preventDefault();
	ctx.stop();
	event.stopPropagation();
}

export function onRepeat(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	if (!isPrimaryInput(event)) {
		return;
	}

	event.preventDefault();
	ctx.dispatch({ type: "toggle-repeat" });
	ctx.updateMainControls();
	event.stopPropagation();
}

export function onSeekStart(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	if (!ctx.isLoaded) {
		return;
	}

	if (
		isPrimaryInput(event) &&
		closestInRoot(ctx.root, event.target, ".loop-marker, .timeline-marker")
	) {
		return;
	}

	const targetSeekWrap = closestInRoot(ctx.root, event.target, ".seekwrap");

	if (ctx.tryStartPinchZoom(event, targetSeekWrap)) {
		event.preventDefault();
		event.stopPropagation();
		return;
	}

	if (ctx.tryStartPendingWaveformTouchSeek(event, targetSeekWrap)) {
		return;
	}

	if (
		ctx.navigationBar?.controls.includes("looping") &&
		event.type === "mousedown" &&
		event.which === 3
	) {
		event.preventDefault();

		ctx.rightClickDragging = true;
		ctx.seekingElement = targetSeekWrap;
		const seekTimelineContext = ctx.getSeekTimelineContext(ctx.seekingElement);

		const seekMetrics = getSeekMetrics(
			ctx.seekingElement,
			event,
			seekTimelineContext.duration,
		);
		if (!seekMetrics) {
			ctx.rightClickDragging = false;
			return;
		}

		ctx.loopDragStart = snapLoopStartToMarker(
			ctx,
			ctx.seekingElement,
			event,
			seekMetrics.time,
		);
		const loopStartReference = seekTimelineContext.toReferenceTime(
			ctx.loopDragStart,
		);
		ctx.state = {
			...ctx.state,
			loop: {
				...ctx.state.loop,
				pointA: loopStartReference,
				pointB: loopStartReference,
				enabled: false,
			},
		};

		ctx.updateMainControls();
		event.stopPropagation();
		return;
	}

	if (!isPrimaryInput(event)) {
		return;
	}

	event.preventDefault();
	if (!targetSeekWrap) {
		return;
	}

	if (placeMarkerFromEvent(ctx, event, targetSeekWrap)) {
		event.stopPropagation();
		return;
	}

	ctx.startInteractiveSeek(event, targetSeekWrap);

	event.stopPropagation();
}

export function onTimelineMarkerActivate(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	if (event.which !== undefined && event.which !== 1) {
		return;
	}

	const target = eventTargetAsElement(event.target ?? null);
	const marker = target?.closest(".timeline-marker");
	if (!(marker instanceof HTMLElement) || !ctx.root.contains(marker)) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();
	if (Date.now() < ctx.markerClickSuppressedUntil) {
		return;
	}
	ctx.setKeyboardActive();
	if (removeMarkerWithTool(ctx, marker)) {
		return;
	}
	marker
		.closest(".timeline-marker-layer")
		?.querySelectorAll<HTMLElement>(".timeline-marker")
		.forEach((candidate: HTMLElement) => {
			candidate.tabIndex = candidate === marker ? 0 : -1;
		});
	activateTimelineMarker(ctx, marker);
}

export function onTimelineMarkerKeydown(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	const target = eventTargetAsElement(event.target ?? null);
	const marker = target?.closest(".timeline-marker");
	if (!(marker instanceof HTMLElement) || !ctx.root.contains(marker)) {
		return;
	}

	if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
		event.preventDefault();
		event.stopPropagation();
		moveTimelineMarkerFocus(
			marker,
			event.key === "ArrowLeft" ? "previous" : "next",
		);
		return;
	}

	if (
		(event.key === "Delete" || event.key === "Backspace") &&
		removeMarkerElement(ctx, marker)
	) {
		event.preventDefault();
		event.stopPropagation();
		return;
	}

	// Space remains the global play/pause shortcut while a marker has focus.
	if (event.key === "Enter") {
		event.preventDefault();
		event.stopPropagation();
		activateTimelineMarker(ctx, marker);
	}
}

export type MarkerEditAction =
	| "toggle"
	| "add"
	| "remove"
	| "sonify"
	| "download"
	| "sequence"
	| "label"
	| "adjust";

export function onMarkerEditAction(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
	action: MarkerEditAction,
): void {
	const target = eventTargetAsElement(event.target ?? null);
	ctx.setKeyboardActive();

	if (action === "adjust") {
		const marker = target?.closest(".timeline-marker");
		if (
			marker instanceof HTMLElement &&
			isPrimaryInput(event) &&
			!ctx.pinchZoomState
		) {
			startMarkerAdjust(ctx, event, marker);
		}
		return;
	}
	if (action === "sequence") {
		if (target instanceof HTMLSelectElement) {
			selectMarkerEditingSequence(ctx, target.value);
		}
		return;
	}
	if (action === "label") {
		const marker = target?.closest(".timeline-marker");
		if (marker instanceof HTMLElement && editMarkerElementLabel(ctx, marker)) {
			event.preventDefault();
			event.stopPropagation();
		}
		return;
	}

	event.preventDefault();
	event.stopPropagation();
	if (action === "toggle") {
		toggleMarkerEditing(ctx);
	} else if (action === "add") {
		toggleMarkerAdding(ctx);
	} else if (action === "remove") {
		toggleMarkerRemoving(ctx);
	} else if (action === "sonify") {
		toggleMarkerSonifying(ctx);
	} else {
		downloadMarkers(ctx);
	}
}

export function onAdjacentMarker(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
	direction: "previous" | "next",
): void {
	event.preventDefault();
	event.stopPropagation();
	ctx.setKeyboardActive();
	ctx.seekToAdjacentMarker(direction);
}

export function onMarkerNavigationOpen(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	event.preventDefault();
	event.stopPropagation();
	ctx.setKeyboardActive();
	openMarkerNavigationDialog(ctx);
}

export function onMarkerNavigationOverlay(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	const target = eventTargetAsElement(event.target ?? null);
	if (target?.closest(".marker-navigation-dialog")) {
		return;
	}
	event.preventDefault();
	event.stopPropagation();
	closeMarkerNavigationDialog(ctx);
}

export function onMarkerNavigationInput(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	const target = eventTargetAsElement(event.target ?? null);
	ctx.renderer.handleMarkerNavigationInteraction(event.type, target);
}

export function onMarkerNavigationSubmit(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	event.preventDefault();
	event.stopPropagation();
	if (!ctx.renderer.validateMarkerNavigationDialogSelections()) {
		return;
	}
	submitMarkerNavigationDialog(
		ctx,
		ctx.renderer.readMarkerNavigationDialogValues(),
	);
}

export function onMarkerNavigationKeydown(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	const target = eventTargetAsElement(event.target ?? null);
	if (
		ctx.renderer.handleMarkerNavigationComboboxKeydown(event.key ?? "", target)
	) {
		event.preventDefault();
		event.stopPropagation();
		return;
	}
	if (event.key === "Escape") {
		event.preventDefault();
		event.stopPropagation();
		closeMarkerNavigationDialog(ctx);
		return;
	}
	if (event.key === "Tab") {
		event.preventDefault();
		event.stopPropagation();
		ctx.renderer.trapMarkerNavigationDialogFocus(!!event.shiftKey);
	}
}

export function onWaveformMinimapStart(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	if (!ctx.isLoaded || !isPrimaryInput(event) || ctx.pinchZoomState) {
		return;
	}

	if (event.type === "touchstart" && ctx.getActiveTouchCount(event) !== 1) {
		return;
	}

	const minimapStart = resolveWaveformMinimapStart(ctx, event);
	if (!minimapStart) {
		return;
	}

	ctx.waveformMinimapDragState = {
		seekWrap: minimapStart.seekWrap,
		minimapNode: minimapStart.minimapNode,
		pointerOffsetRatio: minimapStart.pointerOffsetRatio,
	};
	ctx.pendingWaveformTouchSeek = null;
	ctx.seekingElement = null;
	ctx.rightClickDragging = false;
	ctx.loopDragStart = null;
	ctx.draggingMarker = null;
	if (ctx.state.currentlySeeking) {
		ctx.dispatch({ type: "set-seeking", seeking: false });
	}

	ctx.renderer.setWaveformMinimapViewportStart(
		minimapStart.seekWrap,
		minimapStart.pointerRatio - minimapStart.pointerOffsetRatio,
	);
	event.preventDefault();
	event.stopPropagation();
}

export function onPianoRollMinimapStart(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	if (!ctx.isLoaded || !isPrimaryInput(event) || ctx.pinchZoomState) {
		return;
	}

	if (event.type === "touchstart" && ctx.getActiveTouchCount(event) !== 1) {
		return;
	}

	const minimapStart = resolvePianoRollMinimapStart(ctx, event);
	if (!minimapStart) {
		return;
	}

	ctx.waveformMinimapDragState = {
		seekWrap: minimapStart.seekWrap,
		minimapNode: minimapStart.minimapNode,
		pointerOffsetRatio: minimapStart.pointerOffsetRatio,
	};
	ctx.pendingWaveformTouchSeek = null;
	ctx.seekingElement = null;
	ctx.rightClickDragging = false;
	ctx.loopDragStart = null;
	ctx.draggingMarker = null;
	if (ctx.state.currentlySeeking) {
		ctx.dispatch({ type: "set-seeking", seeking: false });
	}

	ctx.renderer.setPianoRollMinimapViewportStart(
		minimapStart.seekWrap,
		minimapStart.pointerRatio - minimapStart.pointerOffsetRatio,
	);
	event.preventDefault();
	event.stopPropagation();
}

export function onSeekEnd(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	if (!ctx.isLoaded) {
		return;
	}

	if (finishMarkerAdjust(ctx)) {
		event.preventDefault();
		event.stopPropagation();
		return;
	}

	if (finishSeekEndInteraction(ctx, event)) {
		return;
	}

	const hasActiveSeekInteraction =
		ctx.draggingMarker !== null ||
		ctx.rightClickDragging ||
		ctx.state.currentlySeeking ||
		ctx.seekingElement !== null;

	if (!hasActiveSeekInteraction) {
		return;
	}

	event.preventDefault();

	if (ctx.draggingMarker !== null) {
		ctx.draggingMarker = null;
		ctx.updateMainControls();
		event.stopPropagation();
		return;
	}

	if (ctx.rightClickDragging) {
		finalizeRightClickLoopSelection(ctx);
		ctx.updateMainControls();
		event.stopPropagation();
		return;
	}

	if (ctx.state.currentlySeeking && ctx.state.playing) {
		ctx.stopAudio();
		ctx.startAudio();
	}

	ctx.dispatch({ type: "set-seeking", seeking: false });
	event.stopPropagation();
}

export function onSolo(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	if (!isPrimaryInput(event)) {
		return;
	}

	event.preventDefault();
	toggleSoloFromPointerEvent(ctx, event);
}

export function onTrackRowToggle(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	if (!isPrimaryInput(event)) {
		return;
	}

	const target = eventTargetAsElement(event.target ?? null);
	if (
		target &&
		(target.closest(".track-mix-controls") || target.closest(".control .solo"))
	) {
		return;
	}

	event.preventDefault();
	toggleSoloFromPointerEvent(ctx, event);
}

export function onAlignmentSync(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	if (!isPrimaryInput(event)) {
		return;
	}

	event.preventDefault();
	ctx.toggleGlobalSync();
	event.stopPropagation();
}

export function onVolume(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	const target = eventTargetAsElement(event.target ?? null);
	if (!(target instanceof HTMLInputElement)) {
		return;
	}

	const volume = parseFloat(target.value || "0") / 100;
	ctx.setVolume(volume);
}

export function onVolumeReset(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	event.preventDefault();
	ctx.setVolume(1);
	event.stopPropagation();
}

export function onGlobalPan(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	const target = eventTargetAsElement(event.target ?? null);
	if (!(target instanceof HTMLInputElement)) {
		return;
	}

	ctx.setPan(parsePanSliderValue(target));
}

export function onGlobalPanReset(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	event.preventDefault();
	ctx.setPan(0);
	event.stopPropagation();
}

export function onTrackVolume(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	const trackInput = getTrackInputTarget(ctx, event);
	if (!trackInput) {
		return;
	}

	ctx.setTrackVolume(
		trackInput.trackIndex,
		parseSliderValue(trackInput.target),
	);
}

export function onTrackVolumeReset(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	const trackInput = getTrackInputTarget(ctx, event);
	if (!trackInput) {
		return;
	}

	event.preventDefault();
	ctx.setTrackVolume(trackInput.trackIndex, 1);
	event.stopPropagation();
}

export function onTrackPan(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	const trackInput = getTrackInputTarget(ctx, event);
	if (!trackInput) {
		return;
	}

	ctx.setTrackPan(
		trackInput.trackIndex,
		parsePanSliderValue(trackInput.target),
	);
}

export function onTrackPanReset(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	const trackInput = getTrackInputTarget(ctx, event);
	if (!trackInput) {
		return;
	}

	event.preventDefault();
	ctx.setTrackPan(trackInput.trackIndex, 0);
	event.stopPropagation();
}

export function onPreset(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	const target = eventTargetAsElement(event.target ?? null);
	const selector = target?.closest(".preset-selector");
	if (!(selector instanceof HTMLSelectElement)) {
		return;
	}

	ctx.applyPreset(selector.value);
}

export function onPresetScroll(event: ControllerPointerEvent): void {
	event.preventDefault();

	const target = eventTargetAsElement(event.target ?? null);
	const selector = target?.closest(".preset-selector");
	if (!(selector instanceof HTMLSelectElement)) {
		return;
	}

	const maxIndex = selector.options.length - 1;
	let currentIndex = selector.selectedIndex;
	const deltaY =
		(event as unknown as { deltaY?: number }).deltaY ??
		event.originalEvent?.deltaY ??
		0;

	if (deltaY > 0) {
		currentIndex = Math.min(currentIndex + 1, maxIndex);
	} else if (deltaY < 0) {
		currentIndex = Math.max(currentIndex - 1, 0);
	}

	selector.selectedIndex = currentIndex;
	selector.dispatchEvent(new Event("change", { bubbles: true }));
}

export function onSetLoopA(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	if (!isPrimaryInput(event)) {
		return;
	}
	event.preventDefault();
	if (ctx.state.currentlySeeking) {
		ctx.dispatch({ type: "set-seeking", seeking: false });
	}
	ctx.setLoopPoint("A");
	event.stopPropagation();
}

export function onSetLoopB(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	if (!isPrimaryInput(event)) {
		return;
	}
	event.preventDefault();
	if (ctx.state.currentlySeeking) {
		ctx.dispatch({ type: "set-seeking", seeking: false });
	}
	ctx.setLoopPoint("B");
	event.stopPropagation();
}

export function onToggleLoop(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	if (!isPrimaryInput(event)) {
		return;
	}
	event.preventDefault();
	ctx.toggleLoop();
	event.stopPropagation();
}

export function onClearLoop(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	if (!isPrimaryInput(event)) {
		return;
	}
	event.preventDefault();
	ctx.clearLoop();
	event.stopPropagation();
}

export function onMarkerDragStart(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	if (
		!ctx.navigationBar?.controls.includes("looping") ||
		!isPrimaryInput(event) ||
		ctx.pinchZoomState
	) {
		return;
	}

	const target = eventTargetAsElement(event.target ?? null);
	if (!target) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();

	if (target.classList.contains("marker-a")) {
		ctx.draggingMarker = "A";
	} else if (target.classList.contains("marker-b")) {
		ctx.draggingMarker = "B";
	}

	ctx.seekingElement = closestInRoot(ctx.root, event.target, ".seekwrap");
}

export function onKeyboard(
	ctx: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	if (
		!ctx.features.keyboard ||
		!isKeyboardControllerActive(ctx.instanceId) ||
		ctx.markerNavigationDialogOpen
	) {
		return;
	}

	const target = eventTargetAsElement(event.target ?? null);
	if (
		target?.closest(
			'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]',
		)
	) {
		return;
	}

	const key = event.key || event.code || "";
	const code = event.code || "";
	const trackIndex = ctx.getKeyboardTrackIndex(event);

	if (event.ctrlKey || event.metaKey) {
		if (key.toLowerCase() === "z" && undoMarkerEdit(ctx)) {
			event.preventDefault();
			event.stopPropagation();
		}
		return;
	}

	if (isShortcutHelpToggleKey(event)) {
		event.preventDefault();
		ctx.toggleShortcutHelp();
		event.stopPropagation();
		return;
	}

	if (handleShortcutHelpKeyboard(ctx, event, key, code, trackIndex)) {
		return;
	}

	if (handleTrackKeyboardSelection(ctx, event, trackIndex)) {
		return;
	}

	if (handleGlobalKeyboardShortcut(ctx, event, key)) {
		event.stopPropagation();
	}
}

export function onResize(ctx: TrackSwitchControllerImpl): void {
	if (ctx.resizeDebounceTimer) {
		clearTimeout(ctx.resizeDebounceTimer);
	}

	ctx.resizeDebounceTimer = setTimeout(() => {
		ctx.renderer.reflowWaveforms();
		ctx.renderer.renderWaveforms(
			ctx.waveformEngine,
			ctx.runtimes,
			ctx.longestDuration,
			ctx.getWaveformTimelineProjector(),
			ctx.getWaveformTimelineContext(),
		);
		ctx.renderer.renderPianoRollDisplays(
			ctx.longestDuration,
			ctx.isAlignmentMode(),
		);
		ctx.sheetMusicEngine.resize();
		if (ctx.fullscreen) {
			ctx.renderer.refreshFullscreenPanelHeights();
		}
		ctx.updateMainControls();
	}, 300);
}

function resolveWaveformMinimapStart(
	controller: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): {
	minimapNode: HTMLElement;
	seekWrap: HTMLElement;
	pointerRatio: number;
	pointerOffsetRatio: number;
} | null {
	const minimapNode = closestInRoot(
		controller.root,
		event.target,
		".waveform-zoom-minimap",
	);
	if (!minimapNode || !Number.isFinite(event.pageX)) {
		return null;
	}

	const wrapper = closestInRoot(
		controller.root,
		event.target,
		".waveform-wrap",
	);
	if (!wrapper) {
		return null;
	}

	const seekWrap = wrapper.querySelector(
		'.seekwrap[data-seek-surface="waveform"]',
	);
	if (!(seekWrap instanceof HTMLElement)) {
		return null;
	}

	const viewport = controller.renderer.getWaveformMinimapViewport(seekWrap);
	if (!viewport || viewport.widthRatio >= 1) {
		return null;
	}

	const rect = minimapNode.getBoundingClientRect();
	const minimapWidth = Math.max(1, rect.width || minimapNode.clientWidth);
	const ownerWindow = getOwnerWindow(minimapNode);
	const pointerRatio = Math.max(
		0,
		Math.min(
			1,
			((event.pageX as number) - (rect.left + ownerWindow.scrollX)) /
				minimapWidth,
		),
	);
	const isInsideViewport =
		pointerRatio >= viewport.startRatio &&
		pointerRatio <= viewport.startRatio + viewport.widthRatio;

	return {
		minimapNode,
		seekWrap,
		pointerRatio,
		pointerOffsetRatio: isInsideViewport
			? pointerRatio - viewport.startRatio
			: viewport.widthRatio / 2,
	};
}

function resolvePianoRollMinimapStart(
	controller: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): {
	minimapNode: HTMLElement;
	seekWrap: HTMLElement;
	pointerRatio: number;
	pointerOffsetRatio: number;
} | null {
	const minimapNode = closestInRoot(
		controller.root,
		event.target,
		".piano-roll-zoom-minimap",
	);
	if (!minimapNode || !Number.isFinite(event.pageX)) {
		return null;
	}

	const wrapper = closestInRoot(
		controller.root,
		event.target,
		".piano-roll-wrap",
	);
	if (!wrapper) {
		return null;
	}

	const seekWrap = wrapper.querySelector(
		'.seekwrap[data-seek-surface="piano-roll"]',
	);
	if (!(seekWrap instanceof HTMLElement)) {
		return null;
	}

	const viewport = controller.renderer.getPianoRollMinimapViewport(seekWrap);
	if (!viewport || viewport.widthRatio >= 1) {
		return null;
	}

	const rect = minimapNode.getBoundingClientRect();
	const minimapWidth = Math.max(1, rect.width || minimapNode.clientWidth);
	const ownerWindow = getOwnerWindow(minimapNode);
	const pointerRatio = Math.max(
		0,
		Math.min(
			1,
			((event.pageX as number) - (rect.left + ownerWindow.scrollX)) /
				minimapWidth,
		),
	);
	const isInsideViewport =
		pointerRatio >= viewport.startRatio &&
		pointerRatio <= viewport.startRatio + viewport.widthRatio;

	return {
		minimapNode,
		seekWrap,
		pointerRatio,
		pointerOffsetRatio: isInsideViewport
			? pointerRatio - viewport.startRatio
			: viewport.widthRatio / 2,
	};
}

function finishSeekEndInteraction(
	controller: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): boolean {
	if (controller.pianoRollPanDragState) {
		controller.pianoRollPanDragState = null;
		if (controller.state.playing) {
			controller.stopAudio();
			controller.startAudio();
		}
		event.preventDefault();
		event.stopPropagation();
		return true;
	}

	if (controller.waveformMinimapDragState) {
		controller.endWaveformMinimapDrag();
		event.preventDefault();
		event.stopPropagation();
		return true;
	}

	if (controller.pendingWaveformTouchSeek) {
		if (
			event.type === "touchend" &&
			controller.getActiveTouchCount(event) === 0
		) {
			controller.applyPendingWaveformTouchSeekTap(event);
		} else {
			controller.pendingWaveformTouchSeek = null;
		}

		controller.seekingElement = null;
		event.preventDefault();
		event.stopPropagation();
		return true;
	}

	if (controller.pinchZoomState) {
		if (controller.getActiveTouchCount(event) >= 2) {
			event.preventDefault();
			return true;
		}

		controller.endPinchZoom();
		event.preventDefault();
		event.stopPropagation();
		return true;
	}

	return false;
}

function finalizeRightClickLoopSelection(
	controller: TrackSwitchControllerImpl,
): void {
	controller.rightClickDragging = false;
	controller.loopDragStart = null;
	const seekTimelineContext = controller.getSeekTimelineContext(
		controller.seekingElement,
	);

	if (
		controller.state.loop.pointA !== null &&
		controller.state.loop.pointB !== null
	) {
		let loopA = controller.state.loop.pointA;
		let loopB = controller.state.loop.pointB;

		if (loopA > loopB) {
			const swappedA = loopB;
			const swappedB = loopA;
			controller.state = {
				...controller.state,
				loop: {
					...controller.state.loop,
					pointA: swappedA,
					pointB: swappedB,
				},
			};
			loopA = swappedA;
			loopB = swappedB;
		}

		const localLoopA = seekTimelineContext.fromReferenceTime(loopA);
		const localLoopB = seekTimelineContext.fromReferenceTime(loopB);
		if (Math.abs(localLoopB - localLoopA) >= controller.loopMinDistance) {
			activateLoopRange(controller, loopA, loopB);
		} else {
			controller.state = {
				...controller.state,
				loop: {
					...controller.state.loop,
					pointA: null,
					pointB: null,
					enabled: false,
				},
			};
		}
	}
}

const SHORTCUT_HELP_BLOCKED_KEYS = new Set([
	" ",
	"Spacebar",
	"Space",
	"Escape",
	"Esc",
	"ArrowLeft",
	"ArrowRight",
	"ArrowUp",
	"ArrowDown",
	"Home",
	",",
	".",
	"r",
	"R",
	"a",
	"A",
	"b",
	"B",
	"l",
	"L",
	"c",
	"C",
	"f",
	"F",
]);

const SHORTCUT_HELP_BLOCKED_CODES = new Set([
	"Comma",
	"Period",
	"KeyR",
	"KeyA",
	"KeyB",
	"KeyL",
	"KeyC",
	"KeyF",
]);

const KEYBOARD_SHORTCUT_HANDLERS: Record<
	string,
	(
		controller: TrackSwitchControllerImpl,
		event: ControllerPointerEvent,
	) => boolean
> = {
	" ": (controller) => {
		controller.togglePlay();
		return true;
	},
	Spacebar: (controller) => {
		controller.togglePlay();
		return true;
	},
	Space: (controller) => {
		controller.togglePlay();
		return true;
	},
	Escape: (controller) => {
		controller.stop();
		return true;
	},
	Esc: (controller) => {
		controller.stop();
		return true;
	},
	ArrowLeft: (controller, event) => {
		controller.seekRelative(event.shiftKey ? -5 : -2);
		return true;
	},
	ArrowRight: (controller, event) => {
		controller.seekRelative(event.shiftKey ? 5 : 2);
		return true;
	},
	ArrowUp: (controller) => {
		if (!controller.navigationBar?.controls.includes("globalVolume")) {
			return false;
		}
		controller.setVolume(controller.state.volume + 0.1);
		return true;
	},
	ArrowDown: (controller) => {
		if (!controller.navigationBar?.controls.includes("globalVolume")) {
			return false;
		}
		controller.setVolume(controller.state.volume - 0.1);
		return true;
	},
	Home: (controller) => {
		controller.seekTo(0);
		return true;
	},
	",": (controller) => {
		controller.seekToAdjacentMarker("previous");
		return true;
	},
	".": (controller) => {
		controller.seekToAdjacentMarker("next");
		return true;
	},
	m: (controller, event) => addMarkerAtPlayhead(controller, event),
	M: (controller, event) => addMarkerAtPlayhead(controller, event),
	KeyM: (controller, event) => addMarkerAtPlayhead(controller, event),
	r: (controller) => {
		controller.dispatch({ type: "toggle-repeat" });
		controller.updateMainControls();
		return true;
	},
	R: (controller) => {
		controller.dispatch({ type: "toggle-repeat" });
		controller.updateMainControls();
		return true;
	},
	KeyR: (controller) => {
		controller.dispatch({ type: "toggle-repeat" });
		controller.updateMainControls();
		return true;
	},
	a: (controller) => {
		if (!controller.navigationBar?.controls.includes("looping")) {
			return false;
		}
		controller.setLoopPoint("A");
		return true;
	},
	A: (controller) => {
		if (!controller.navigationBar?.controls.includes("looping")) {
			return false;
		}
		controller.setLoopPoint("A");
		return true;
	},
	KeyA: (controller) => {
		if (!controller.navigationBar?.controls.includes("looping")) {
			return false;
		}
		controller.setLoopPoint("A");
		return true;
	},
	b: (controller) => {
		if (!controller.navigationBar?.controls.includes("looping")) {
			return false;
		}
		controller.setLoopPoint("B");
		return true;
	},
	B: (controller) => {
		if (!controller.navigationBar?.controls.includes("looping")) {
			return false;
		}
		controller.setLoopPoint("B");
		return true;
	},
	KeyB: (controller) => {
		if (!controller.navigationBar?.controls.includes("looping")) {
			return false;
		}
		controller.setLoopPoint("B");
		return true;
	},
	l: (controller) => {
		if (!controller.navigationBar?.controls.includes("looping")) {
			return false;
		}
		controller.toggleLoop();
		return true;
	},
	L: (controller) => {
		if (!controller.navigationBar?.controls.includes("looping")) {
			return false;
		}
		controller.toggleLoop();
		return true;
	},
	KeyL: (controller) => {
		if (!controller.navigationBar?.controls.includes("looping")) {
			return false;
		}
		controller.toggleLoop();
		return true;
	},
	c: (controller) => {
		if (!controller.navigationBar?.controls.includes("looping")) {
			return false;
		}
		controller.clearLoop();
		return true;
	},
	C: (controller) => {
		if (!controller.navigationBar?.controls.includes("looping")) {
			return false;
		}
		controller.clearLoop();
		return true;
	},
	KeyC: (controller) => {
		if (!controller.navigationBar?.controls.includes("looping")) {
			return false;
		}
		controller.clearLoop();
		return true;
	},
	f: (controller) => {
		if (!controller.navigationBar?.controls.includes("fullscreen-control")) {
			return false;
		}
		controller.toggleFullscreen();
		return true;
	},
	F: (controller) => {
		if (!controller.navigationBar?.controls.includes("fullscreen-control")) {
			return false;
		}
		controller.toggleFullscreen();
		return true;
	},
	KeyF: (controller) => {
		if (!controller.navigationBar?.controls.includes("fullscreen-control")) {
			return false;
		}
		controller.toggleFullscreen();
		return true;
	},
};

function isShortcutHelpToggleKey(event: {
	key?: string;
	code?: string;
}): boolean {
	return event.key === "F1" || event.code === "F1";
}

function isShortcutSuppressedWhileHelpOpen(
	key: string,
	code: string,
	trackIndex: number | null,
): boolean {
	if (trackIndex !== null) {
		return true;
	}

	return (
		SHORTCUT_HELP_BLOCKED_KEYS.has(key) || SHORTCUT_HELP_BLOCKED_CODES.has(code)
	);
}

function handleShortcutHelpKeyboard(
	controller: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
	key: string,
	code: string,
	trackIndex: number | null,
): boolean {
	if (!controller.shortcutHelpOpen) {
		return false;
	}

	if (key === "Escape" || key === "Esc") {
		event.preventDefault();
		controller.closeShortcutHelp();
		event.stopPropagation();
		return true;
	}

	if (isShortcutSuppressedWhileHelpOpen(key, code, trackIndex)) {
		event.preventDefault();
		event.stopPropagation();
	}

	return true;
}

function handleTrackKeyboardSelection(
	controller: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
	trackIndex: number | null,
): boolean {
	if (trackIndex === null || trackIndex >= controller.runtimes.length) {
		return false;
	}

	event.preventDefault();
	controller.toggleSolo(trackIndex, controller.isTrackExclusive(trackIndex));
	event.stopPropagation();
	return true;
}

function handleGlobalKeyboardShortcut(
	controller: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
	key: string,
): boolean {
	const handler = KEYBOARD_SHORTCUT_HANDLERS[key];
	if (!handler) {
		return false;
	}

	const handled = handler(controller, event);
	if (!handled) {
		return false;
	}

	event.preventDefault();
	return true;
}

export function getKeyboardTrackIndex(
	event: ControllerPointerEvent,
): number | null {
	const key = event.key;
	const code = event.code;

	if (key === "0" || code === "Digit0" || code === "Numpad0") {
		return 9;
	}

	if (key && key >= "1" && key <= "9") {
		return Number(key) - 1;
	}

	if (code && code >= "Digit1" && code <= "Digit9") {
		return Number(code.slice(-1)) - 1;
	}

	if (code && code >= "Numpad1" && code <= "Numpad9") {
		return Number(code.slice(-1)) - 1;
	}

	return null;
}

function toggleSoloFromPointerEvent(
	controller: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): void {
	const groupIndexFromTarget = controller.trackGroupIndexFromTarget(
		event.target ?? null,
	);

	// The row above an aligned list selects the list itself — the first level of
	// the hierarchy, where its tracks count as one timeline.
	const target = eventTargetAsElement(event.target ?? null);
	if (target?.closest(".track-list-select") && groupIndexFromTarget >= 0) {
		controller.selectTrackListUnit(groupIndexFromTarget);
		return;
	}

	const index = controller.trackIndexFromTarget(event.target ?? null);
	if (index < 0) {
		return;
	}

	const groupIndex =
		groupIndexFromTarget >= 0
			? groupIndexFromTarget
			: controller.groupIndexForTrack(index);

	// Shift-clicking the last remaining selection of an ordinary list brings the
	// whole list back, which is the quickest way out of a narrowed-down comparison.
	if (
		event.shiftKey &&
		!controller.isGroupExclusive(groupIndex) &&
		controller.runtimes[index]?.state.solo
	) {
		const trackIndexes = controller.trackIndexesInGroup(groupIndex);
		const selectedCount = trackIndexes.reduce(
			(count: number, trackIndex: number) =>
				count + (controller.runtimes[trackIndex].state.solo ? 1 : 0),
			0,
		);

		if (selectedCount === 1) {
			trackIndexes.forEach((trackIndex: number) => {
				controller.runtimes[trackIndex].state.solo = true;
			});
			controller.applyTrackProperties();
			controller.updateMainControls();
			return;
		}
	}

	controller.toggleSolo(index, !!event.shiftKey, groupIndex);
}

function parseSliderValue(target: HTMLInputElement): number {
	return parseFloat(target.value || "0") / 100;
}

/**
 * Pan controls hold at dead center until dragged past a 35/65 split, so a
 * near-center release always lands exactly on 50/50 instead of a stray offset.
 */
const PAN_DEAD_ZONE = 0.3;

function parsePanSliderValue(target: HTMLInputElement): number {
	const value = parseSliderValue(target);
	return Math.abs(value) <= PAN_DEAD_ZONE ? 0 : value;
}

function getTrackInputTarget(
	controller: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): { target: HTMLInputElement; trackIndex: number } | null {
	const target = eventTargetAsElement(event.target ?? null);
	if (!(target instanceof HTMLInputElement)) {
		return null;
	}

	const trackIndex = controller.trackIndexFromTarget(target);
	if (trackIndex < 0) {
		return null;
	}

	return {
		target,
		trackIndex,
	};
}

export interface InputController {
	eventNamespace: string;
	presets: PresetsConfig;
	setKeyboardActive(): void;
	openShortcutHelp(): void;
	toggleShortcutHelp(): void;
	closeShortcutHelp(): void;
	onOverlayActivate(event: ControllerPointerEvent): void;
	onShortcutHelpOverlay(event: ControllerPointerEvent): void;
	onPlayPause(event: ControllerPointerEvent): void;
	onStop(event: ControllerPointerEvent): void;
	onRepeat(event: ControllerPointerEvent): void;
	onFullscreenToggle(event: ControllerPointerEvent): void;
	onSeekStart(event: ControllerPointerEvent): void;
	onSeekMove(event: ControllerPointerEvent): void;
	onSeekEnd(event: ControllerPointerEvent): void;
	onSolo(event: ControllerPointerEvent): void;
	onTrackRowToggle(event: ControllerPointerEvent): void;
	onAlignmentSync(event: ControllerPointerEvent): void;
	onVolume(event: ControllerPointerEvent): void;
	onVolumeReset(event: ControllerPointerEvent): void;
	onGlobalPan(event: ControllerPointerEvent): void;
	onGlobalPanReset(event: ControllerPointerEvent): void;
	onTrackVolume(event: ControllerPointerEvent): void;
	onTrackVolumeReset(event: ControllerPointerEvent): void;
	onTrackPan(event: ControllerPointerEvent): void;
	onTrackPanReset(event: ControllerPointerEvent): void;
	onPreset(event: ControllerPointerEvent): void;
	onPresetScroll(event: ControllerPointerEvent): void;
	onWaveformZoomWheel(event: ControllerPointerEvent): void;
	onWaveformMinimapStart(event: ControllerPointerEvent): void;
	onPianoRollZoomWheel(event: ControllerPointerEvent): void;
	onPianoRollMinimapStart(event: ControllerPointerEvent): void;
	onPanelReorderStart(event: ControllerPointerEvent): void;
	onPanelReorderMove(event: ControllerPointerEvent): void;
	onPanelReorderEnd(event: ControllerPointerEvent): void;
	onSetLoopA(event: ControllerPointerEvent): void;
	onSetLoopB(event: ControllerPointerEvent): void;
	onToggleLoop(event: ControllerPointerEvent): void;
	onClearLoop(event: ControllerPointerEvent): void;
	onMarkerDragStart(event: ControllerPointerEvent): void;
	onTimelineMarkerActivate(event: ControllerPointerEvent): void;
	onTimelineMarkerKeydown(event: ControllerPointerEvent): void;
	onAdjacentMarker(
		event: ControllerPointerEvent,
		direction: "previous" | "next",
	): void;
	onMarkerEditAction(
		event: ControllerPointerEvent,
		action: MarkerEditAction,
	): void;
	onMarkerNavigationOpen(event: ControllerPointerEvent): void;
	onMarkerNavigationOverlay(event: ControllerPointerEvent): void;
	onMarkerNavigationInput(event: ControllerPointerEvent): void;
	onMarkerNavigationSubmit(event: ControllerPointerEvent): void;
	onMarkerNavigationKeydown(event: ControllerPointerEvent): void;
	onKeyboard(event: ControllerPointerEvent): void;
	onResize(): void;
}

function eventToPointerEvent(event: Event): ControllerPointerEvent {
	const mouseEvent = event as MouseEvent;
	const keyboardEvent = event as KeyboardEvent;
	const touchEvent = event as TouchEvent;

	let pageX: number | undefined;
	let pageY: number | undefined;
	if (typeof mouseEvent.pageX === "number") {
		pageX = mouseEvent.pageX;
		pageY = typeof mouseEvent.pageY === "number" ? mouseEvent.pageY : undefined;
	} else if (touchEvent.touches && touchEvent.touches.length > 0) {
		pageX = touchEvent.touches[0].pageX;
		pageY = touchEvent.touches[0].pageY;
	} else if (
		touchEvent.changedTouches &&
		touchEvent.changedTouches.length > 0
	) {
		pageX = touchEvent.changedTouches[0].pageX;
		pageY = touchEvent.changedTouches[0].pageY;
	}

	let which = (mouseEvent as unknown as { which?: number }).which;
	if (which === undefined && typeof mouseEvent.button === "number") {
		if (mouseEvent.button === 0) {
			which = 1;
		} else if (mouseEvent.button === 1) {
			which = 2;
		} else if (mouseEvent.button === 2) {
			which = 3;
		}
	}

	return {
		type: event.type,
		which: which,
		pageX: pageX,
		pageY: pageY,
		key: keyboardEvent.key,
		code: keyboardEvent.code,
		shiftKey: keyboardEvent.shiftKey,
		ctrlKey: keyboardEvent.ctrlKey,
		metaKey: keyboardEvent.metaKey,
		target: event.target,
		originalEvent: event as Event & {
			deltaY?: number;
			touches?: ArrayLike<{ pageX: number; pageY: number }>;
			changedTouches?: ArrayLike<{ pageX: number; pageY: number }>;
		},
		preventDefault: () => {
			event.preventDefault();
		},
		stopPropagation: () => {
			event.stopPropagation();
		},
	};
}

export class InputBinder {
	private static readonly COMPAT_MOUSE_SUPPRESSION_MS = 700;

	private readonly root: HTMLElement;
	private readonly features: TrackSwitchFeatures;
	private readonly controller: InputController;
	private readonly unbinders: Array<() => void> = [];
	private lastTouchPointerEventTime = 0;

	constructor(
		root: HTMLElement,
		features: TrackSwitchFeatures,
		controller: InputController,
	) {
		this.root = root;
		this.features = features;
		this.controller = controller;
	}

	private isManagedFormControl(
		target: EventTarget | null | undefined,
	): target is HTMLElement {
		const element = eventTargetAsElement(target ?? null);
		return (
			!!element &&
			!!element.closest(
				'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]',
			)
		);
	}

	private blurFocusedManagedControl(requireWithinRoot = true): void {
		const activeElement = getDeepActiveElement(this.root);
		if (!(activeElement instanceof HTMLElement)) {
			return;
		}

		if (
			(requireWithinRoot && !this.root.contains(activeElement)) ||
			!this.isManagedFormControl(activeElement)
		) {
			return;
		}

		activeElement.blur();
	}

	private addListener(
		target: EventTarget,
		type: string,
		listener: EventListener,
		options?: AddEventListenerOptions,
	): void {
		target.addEventListener(type, listener, options);
		this.unbinders.push(() => {
			target.removeEventListener(type, listener, options);
		});
	}

	private addDelegatedListener(
		type: string,
		selector: string,
		callback: (event: ControllerPointerEvent, matchedElement: Element) => void,
		target?: EventTarget,
		options?: AddEventListenerOptions,
	): void {
		const eventTarget = target || this.root;

		const listener = (event: Event) => {
			const eventElement = eventTargetAsElement(event.target);
			if (!eventElement) {
				return;
			}

			const matched = eventElement.closest(selector);
			if (!matched) {
				return;
			}

			if (eventTarget === this.root && !this.root.contains(matched)) {
				return;
			}

			callback(eventToPointerEvent(event), matched);
		};

		this.addListener(eventTarget, type, listener as EventListener, options);
	}

	private addPointerDelegatedListener(
		selector: string,
		handler: (event: ControllerPointerEvent) => void,
	): void {
		this.addDelegatedListener("touchstart", selector, (event) => {
			this.lastTouchPointerEventTime = Date.now();
			handler(event);
		});
		this.addDelegatedListener("mousedown", selector, (event) => {
			if (
				Date.now() - this.lastTouchPointerEventTime <
				InputBinder.COMPAT_MOUSE_SUPPRESSION_MS
			) {
				return;
			}
			handler(event);
		});
	}

	private addRootStopPropagationListener(
		selector: string,
		eventTypes: string[],
		options?: AddEventListenerOptions,
	): void {
		const stopPropagation = (event: Event) => {
			const eventElement = eventTargetAsElement(event.target);
			if (!eventElement) {
				return;
			}

			const matched = eventElement.closest(selector);
			if (matched && this.root.contains(matched)) {
				event.stopPropagation();
			}
		};

		eventTypes.forEach((eventType) => {
			this.addListener(
				this.root,
				eventType,
				stopPropagation as EventListener,
				options,
			);
		});
	}

	private bindBaseControls(): void {
		this.addDelegatedListener(
			"click",
			".overlay .activate:not(.error)",
			(event) => {
				this.controller.onOverlayActivate(event);
			},
		);
		this.addDelegatedListener("click", ".overlay-shortcuts", (event) => {
			this.controller.onShortcutHelpOverlay(event);
		});

		this.addPointerDelegatedListener(".playpause", (event) => {
			this.controller.onPlayPause(event);
		});
		this.addPointerDelegatedListener(".stop", (event) => {
			this.controller.onStop(event);
		});
		this.addPointerDelegatedListener(".repeat", (event) => {
			this.controller.onRepeat(event);
		});
		this.addPointerDelegatedListener(".fullscreen-toggle", (event) => {
			this.controller.onFullscreenToggle(event);
		});
		this.addDelegatedListener("click", ".timeline-marker", (event) => {
			this.controller.onTimelineMarkerActivate(event);
		});
		this.addDelegatedListener("keydown", ".timeline-marker", (event) => {
			this.controller.onTimelineMarkerKeydown(event);
		});
		this.addDelegatedListener("click", ".marker-previous", (event) => {
			this.controller.onAdjacentMarker(event, "previous");
		});
		this.addDelegatedListener("click", ".marker-next", (event) => {
			this.controller.onAdjacentMarker(event, "next");
		});
		this.addPointerDelegatedListener(".seekwrap", (event) => {
			this.controller.onSeekStart(event);
		});
	}

	private bindMarkerNavigationControls(): void {
		this.addDelegatedListener("click", ".marker-jump", (event) => {
			this.controller.onMarkerNavigationOpen(event);
		});
		this.addDelegatedListener(
			"click",
			".marker-navigation-overlay",
			(event) => {
				this.controller.onMarkerNavigationOverlay(event);
			},
		);
		this.addDelegatedListener("input", ".marker-navigation-input", (event) => {
			this.controller.onMarkerNavigationInput(event);
		});
		this.addDelegatedListener(
			"focusin",
			".marker-navigation-input",
			(event) => {
				this.controller.onMarkerNavigationInput(event);
			},
		);
		this.addDelegatedListener("click", ".marker-navigation-input", (event) => {
			this.controller.onMarkerNavigationInput(event);
		});
		this.addDelegatedListener(
			"click",
			".marker-navigation-option, .marker-navigation-options-more",
			(event) => {
				this.controller.onMarkerNavigationInput(event);
			},
		);
		this.addDelegatedListener(
			"submit",
			".marker-navigation-dialog",
			(event) => {
				this.controller.onMarkerNavigationSubmit(event);
			},
		);
		this.addDelegatedListener(
			"keydown",
			".marker-navigation-dialog",
			(event) => {
				this.controller.onMarkerNavigationKeydown(event);
			},
		);
	}

	private bindMarkerEditingControls(): void {
		this.addDelegatedListener("click", ".marker-edit-toggle", (event) => {
			this.controller.onMarkerEditAction(event, "toggle");
		});
		this.addDelegatedListener("click", ".marker-edit-add", (event) => {
			this.controller.onMarkerEditAction(event, "add");
		});
		this.addDelegatedListener("click", ".marker-edit-remove", (event) => {
			this.controller.onMarkerEditAction(event, "remove");
		});
		this.addDelegatedListener("click", ".marker-edit-sonify", (event) => {
			this.controller.onMarkerEditAction(event, "sonify");
		});
		this.addDelegatedListener("click", ".marker-edit-download", (event) => {
			this.controller.onMarkerEditAction(event, "download");
		});
		this.addDelegatedListener("change", ".marker-edit-sequence", (event) => {
			this.controller.onMarkerEditAction(event, "sequence");
			this.blurFocusedManagedControl();
		});
		this.addPointerDelegatedListener(".timeline-marker", (event) => {
			this.controller.onMarkerEditAction(event, "adjust");
		});
		this.addDelegatedListener("dblclick", ".timeline-marker", (event) => {
			this.controller.onMarkerEditAction(event, "label");
		});
	}

	private bindPanelReorder(): void {
		if (!this.features.customizablePanelOrder) {
			return;
		}

		const ownerWindow = getOwnerWindow(this.root);

		this.addDelegatedListener("pointerdown", ".ts-panel-handle", (event) => {
			this.controller.onPanelReorderStart(event);
		});

		this.addListener(ownerWindow, "pointermove", (event) => {
			this.controller.onPanelReorderMove(eventToPointerEvent(event));
		});

		this.addListener(ownerWindow, "pointerup", (event) => {
			this.controller.onPanelReorderEnd(eventToPointerEvent(event));
		});

		this.addListener(ownerWindow, "pointercancel", (event) => {
			this.controller.onPanelReorderEnd(eventToPointerEvent(event));
		});
	}

	private bindKeyboardActivation(): void {
		const activateKeyboard = (event: Event) => {
			this.controller.setKeyboardActive();
			if (!this.isManagedFormControl(event.target)) {
				this.blurFocusedManagedControl(false);
			}
		};
		const keyboardActivationOptions = {
			capture: true,
		} satisfies AddEventListenerOptions;
		this.addListener(
			this.root,
			"pointerdown",
			activateKeyboard as EventListener,
			keyboardActivationOptions,
		);
		this.addListener(
			this.root,
			"touchstart",
			activateKeyboard as EventListener,
			keyboardActivationOptions,
		);
		this.addListener(
			this.root,
			"mousedown",
			activateKeyboard as EventListener,
			keyboardActivationOptions,
		);
	}

	private bindSeekLifecycle(): void {
		const ownerWindow = getOwnerWindow(this.root);

		this.addListener(
			ownerWindow,
			"touchmove",
			(event) => {
				this.controller.onSeekMove(eventToPointerEvent(event));
			},
			{ passive: false },
		);
		this.addListener(ownerWindow, "mousemove", (event) => {
			this.controller.onSeekMove(eventToPointerEvent(event));
		});

		this.addListener(
			ownerWindow,
			"touchend",
			(event) => {
				this.controller.onSeekEnd(eventToPointerEvent(event));
			},
			{ passive: false },
		);
		this.addListener(
			ownerWindow,
			"touchcancel",
			(event) => {
				this.controller.onSeekEnd(eventToPointerEvent(event));
			},
			{ passive: false },
		);
		this.addListener(ownerWindow, "mouseup", (event) => {
			this.controller.onSeekEnd(eventToPointerEvent(event));
		});
	}

	private bindTrackControls(): void {
		this.addPointerDelegatedListener(".track .control .solo", (event) => {
			this.controller.onSolo(event);
		});
		this.addPointerDelegatedListener(".track", (event) => {
			this.controller.onTrackRowToggle(event);
		});
		this.addPointerDelegatedListener(".sync-global", (event) => {
			this.controller.onAlignmentSync(event);
		});
	}

	private bindGlobalVolumeControls(): void {
		this.addDelegatedListener("input", ".volume-slider", (event) => {
			this.controller.onVolume(event);
		});
		this.addDelegatedListener("change", ".volume-slider", () => {
			this.blurFocusedManagedControl();
		});
		this.addDelegatedListener("dblclick", ".volume-slider", (event) => {
			this.controller.onVolumeReset(event);
			this.blurFocusedManagedControl();
		});

		this.addRootStopPropagationListener(
			".volume-control",
			["touchstart", "touchmove", "touchend"],
			{ passive: false },
		);
		this.addRootStopPropagationListener(".volume-control", [
			"mousedown",
			"mousemove",
			"mouseup",
		]);
	}

	private bindGlobalPanControls(): void {
		this.addDelegatedListener("input", ".pan-slider", (event) => {
			this.controller.onGlobalPan(event);
		});
		this.addDelegatedListener("change", ".pan-slider", () => {
			this.blurFocusedManagedControl();
		});
		this.addDelegatedListener("dblclick", ".pan-slider", (event) => {
			this.controller.onGlobalPanReset(event);
			this.blurFocusedManagedControl();
		});

		this.addRootStopPropagationListener(
			".pan-control",
			["touchstart", "touchmove", "touchend"],
			{ passive: false },
		);
		this.addRootStopPropagationListener(".pan-control", [
			"mousedown",
			"mousemove",
			"mouseup",
		]);
	}

	private bindTrackVolumeControls(): void {
		this.addDelegatedListener("input", ".track-volume-slider", (event) => {
			this.controller.onTrackVolume(event);
		});
		this.addDelegatedListener("change", ".track-volume-slider", () => {
			this.blurFocusedManagedControl();
		});
		this.addDelegatedListener("dblclick", ".track-volume-slider", (event) => {
			this.controller.onTrackVolumeReset(event);
			this.blurFocusedManagedControl();
		});
	}

	private bindTrackPanControls(): void {
		this.addDelegatedListener("input", ".track-pan-slider", (event) => {
			this.controller.onTrackPan(event);
		});
		this.addDelegatedListener("change", ".track-pan-slider", () => {
			this.blurFocusedManagedControl();
		});
		this.addDelegatedListener("dblclick", ".track-pan-slider", (event) => {
			this.controller.onTrackPanReset(event);
			this.blurFocusedManagedControl();
		});
	}

	private bindTrackMixControlPropagation(): void {
		this.addRootStopPropagationListener(
			".track-mix-controls",
			["touchstart", "touchmove", "touchend"],
			{ passive: false },
		);
		this.addRootStopPropagationListener(".track-mix-controls", [
			"mousedown",
			"mousemove",
			"mouseup",
		]);
	}

	private bindPresetControls(): void {
		this.addDelegatedListener("change", ".preset-selector", (event) => {
			this.controller.onPreset(event);
			this.blurFocusedManagedControl();
		});

		this.addDelegatedListener(
			"wheel",
			".preset-selector",
			(event) => {
				this.controller.onPresetScroll(event);
			},
			undefined,
			{ passive: false },
		);

		this.addRootStopPropagationListener(
			".preset-selector, .preset-selector-wrap",
			["touchstart", "touchend"],
			{ passive: false },
		);
		this.addRootStopPropagationListener(
			".preset-selector, .preset-selector-wrap",
			["mousedown", "mouseup", "click"],
		);
	}

	private bindLoopControls(): void {
		this.addPointerDelegatedListener(".loop-a", (event) => {
			this.controller.onSetLoopA(event);
		});
		this.addPointerDelegatedListener(".loop-b", (event) => {
			this.controller.onSetLoopB(event);
		});
		this.addPointerDelegatedListener(".loop-toggle", (event) => {
			this.controller.onToggleLoop(event);
		});
		this.addPointerDelegatedListener(".loop-clear", (event) => {
			this.controller.onClearLoop(event);
		});
		this.addPointerDelegatedListener(".loop-marker", (event) => {
			this.controller.onMarkerDragStart(event);
		});

		this.addDelegatedListener("contextmenu", ".seekwrap", (event) => {
			event.preventDefault();
		});
	}

	private bindKeyboardShortcuts(): void {
		this.addListener(getOwnerWindow(this.root), "keydown", (event) => {
			this.controller.onKeyboard(eventToPointerEvent(event));
		});
	}

	private bindWaveformControls(): void {
		this.addPointerDelegatedListener(".waveform-zoom-minimap", (event) => {
			this.controller.onWaveformMinimapStart(event);
		});
		this.addDelegatedListener(
			"wheel",
			".waveform-wrap",
			(event) => {
				this.controller.onWaveformZoomWheel(event);
			},
			undefined,
			{ passive: false },
		);
	}

	private bindMidiControls(): void {
		this.addPointerDelegatedListener(".piano-roll-zoom-minimap", (event) => {
			this.controller.onPianoRollMinimapStart(event);
		});
		this.addDelegatedListener(
			"wheel",
			".piano-roll-wrap",
			(event) => {
				this.controller.onPianoRollZoomWheel(event);
			},
			undefined,
			{ passive: false },
		);
	}

	bind(): void {
		this.bindBaseControls();
		this.bindPanelReorder();
		this.bindKeyboardActivation();
		this.bindSeekLifecycle();
		this.bindTrackControls();
		this.bindMarkerNavigationControls();
		this.bindMarkerEditingControls();
		this.bindGlobalVolumeControls();
		this.bindGlobalPanControls();
		this.bindTrackVolumeControls();
		this.bindTrackPanControls();
		this.bindTrackMixControlPropagation();

		if (Object.keys(this.controller.presets).length >= 2) {
			this.bindPresetControls();
		}

		this.bindLoopControls();

		if (this.features.keyboard) {
			this.bindKeyboardShortcuts();
		}

		const hasWaveformUi = !!this.root.querySelector(
			".waveform, .waveform-wrap",
		);
		const hasSheetMusicUi = !!this.root.querySelector(
			".sheetmusic, .sheetmusic-wrap",
		);
		const hasPianoRollUi = !!this.root.querySelector(
			".piano-roll, .piano-roll-wrap",
		);

		if (hasWaveformUi) {
			this.bindWaveformControls();
		}

		if (hasPianoRollUi) {
			this.bindMidiControls();
		}

		if (hasWaveformUi || hasSheetMusicUi || hasPianoRollUi) {
			this.addListener(getOwnerWindow(this.root), "resize", () => {
				this.controller.onResize();
			});
		}
	}

	unbind(): void {
		while (this.unbinders.length > 0) {
			const unbind = this.unbinders.pop();
			if (unbind) {
				unbind();
			}
		}
	}
}

export interface ControllerPointerEvent {
	type: string;
	which?: number;
	pageX?: number;
	pageY?: number;
	key?: string;
	code?: string;
	shiftKey?: boolean;
	ctrlKey?: boolean;
	metaKey?: boolean;
	target?: EventTarget | null;
	originalEvent?: Event & {
		deltaY?: number;
		touches?: ArrayLike<{ pageX: number; pageY: number }>;
		changedTouches?: ArrayLike<{ pageX: number; pageY: number }>;
	};
	preventDefault(): void;
	stopPropagation(): void;
}

export function getPointerPageX(event: ControllerPointerEvent): number | null {
	if (typeof event.pageX === "number") {
		return event.pageX;
	}

	const touchEvent = event.originalEvent;
	const touches = touchEvent?.touches;
	if (touches && touches.length > 0) {
		const firstTouch = touches[0];
		return typeof firstTouch?.pageX === "number" ? firstTouch.pageX : null;
	}

	const changedTouches = touchEvent?.changedTouches;
	if (changedTouches && changedTouches.length > 0) {
		const firstChangedTouch = changedTouches[0];
		return typeof firstChangedTouch?.pageX === "number"
			? firstChangedTouch.pageX
			: null;
	}

	return null;
}

function ensurePositiveWidth(width: number): number {
	if (!Number.isFinite(width) || width < 1) {
		return 1;
	}

	return width;
}

export function getSeekMetrics(
	seekingElement: HTMLElement | null,
	event: ControllerPointerEvent,
	longestDuration: number,
): {
	posXRel: number;
	seekWidth: number;
	posXRelLimited: number;
	timePerc: number;
	time: number;
} | null {
	if (!seekingElement) {
		return null;
	}

	const pageX = getPointerPageX(event);
	if (pageX === null) {
		return null;
	}

	const rect = seekingElement.getBoundingClientRect();
	const offsetLeft = rect.left + getOwnerWindow(seekingElement).scrollX;

	const posXRel = pageX - offsetLeft;
	const seekWidth = ensurePositiveWidth(
		rect.width || seekingElement.clientWidth || 0,
	);
	const posXRelLimited =
		posXRel < 0 ? 0 : posXRel > seekWidth ? seekWidth : posXRel;
	const timePerc = (posXRelLimited / seekWidth) * 100;
	const time = longestDuration * (timePerc / 100);

	return {
		posXRel: posXRel,
		seekWidth: seekWidth,
		posXRelLimited: posXRelLimited,
		timePerc: timePerc,
		time: time,
	};
}

function isPrimaryInput(event: ControllerPointerEvent): boolean {
	return (
		event.type === "touchstart" ||
		(event.type === "mousedown" && event.which === 1)
	);
}
