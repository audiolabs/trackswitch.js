import { closestInRoot, eventTargetAsElement } from "../shared/dom";
import { parseStrictNonNegativeInt } from "../shared/preset";
import { getSeekMetrics, isPrimaryInput } from "../shared/seek";
import {
	finalizeRightClickLoopSelection,
	finishSeekEndInteraction,
	resolveMidiMinimapStart,
	resolveWaveformMinimapStart,
} from "./input-seek-helpers";
import {
	getKeyboardTrackIndex as getKeyboardTrackIndexFromEvent,
	handleGlobalKeyboardShortcut,
	handleShortcutHelpKeyboard,
	handleTrackKeyboardSelection,
	isShortcutHelpToggleKey,
} from "./input-shortcuts";
import {
	getTrackInputTarget,
	parseSliderValue,
	toggleSoloFromPointerEvent,
} from "./input-track-controls";
import {
	isKeyboardControllerActive,
	setActiveKeyboardController,
} from "./player-registry";

export function setKeyboardActive(ctx: any): any {
	return function (this: any) {
		setActiveKeyboardController(this.instanceId);
	}.call(ctx);
}

export function openShortcutHelp(ctx: any): any {
	return function (this: any) {
		if (this.shortcutHelpOpen) {
			return;
		}

		this.shortcutHelpOpen = true;
		this.renderer.setShortcutHelpVisible(true);
	}.call(ctx);
}

export function toggleShortcutHelp(ctx: any): any {
	return function (this: any) {
		if (this.shortcutHelpOpen) {
			this.closeShortcutHelp();
			return;
		}

		this.openShortcutHelp();
	}.call(ctx);
}

export function closeShortcutHelp(ctx: any): any {
	return function (this: any) {
		if (!this.shortcutHelpOpen) {
			return;
		}

		this.shortcutHelpOpen = false;
		this.renderer.setShortcutHelpVisible(false);
	}.call(ctx);
}

export function onOverlayActivate(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (this.root.classList.contains("error")) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		if (!isPrimaryInput(event) && event.type !== "click") {
			return;
		}

		event.preventDefault();
		this.setKeyboardActive();
		this.audioEngine.primeFromUserGesture();
		void this.load();
		event.stopPropagation();
	}.call(ctx, event);
}

export function onShortcutHelpOverlay(ctx: any, event: any): any {
	return function (this: any, event: any) {
		const target = eventTargetAsElement(event.target ?? null);
		if (target?.closest(".shortcut-help-panel")) {
			return;
		}

		event.preventDefault();
		this.setKeyboardActive();
		this.closeShortcutHelp();
		event.stopPropagation();
	}.call(ctx, event);
}

export function onPlayPause(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (!isPrimaryInput(event)) {
			return;
		}

		event.preventDefault();
		this.audioEngine.primeFromUserGesture();
		this.togglePlay();
		event.stopPropagation();
	}.call(ctx, event);
}

export function onStop(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (!isPrimaryInput(event)) {
			return;
		}

		event.preventDefault();
		this.stop();
		event.stopPropagation();
	}.call(ctx, event);
}

export function onRepeat(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (!isPrimaryInput(event)) {
			return;
		}

		event.preventDefault();
		this.dispatch({ type: "toggle-repeat" });
		this.updateMainControls();
		event.stopPropagation();
	}.call(ctx, event);
}

export function onSeekStart(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (!this.isLoaded) {
			return;
		}

		if (
			isPrimaryInput(event) &&
			closestInRoot(this.root, event.target, ".loop-marker")
		) {
			return;
		}

		const targetSeekWrap = closestInRoot(this.root, event.target, ".seekwrap");

		if (this.tryStartPinchZoom(event, targetSeekWrap)) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		if (this.tryStartPendingWaveformTouchSeek(event, targetSeekWrap)) {
			return;
		}

		if (
			this.features.looping &&
			event.type === "mousedown" &&
			event.which === 3
		) {
			event.preventDefault();

			this.rightClickDragging = true;
			this.seekingElement = targetSeekWrap;
			const seekTimelineContext = this.getSeekTimelineContext(
				this.seekingElement,
			);

			const seekMetrics = getSeekMetrics(
				this.seekingElement,
				event,
				seekTimelineContext.duration,
			);
			if (!seekMetrics) {
				this.rightClickDragging = false;
				return;
			}

			this.loopDragStart = seekMetrics.time;
			const loopStartReference = seekTimelineContext.toReferenceTime(
				seekMetrics.time,
			);
			this.state = {
				...this.state,
				loop: {
					...this.state.loop,
					pointA: loopStartReference,
					pointB: loopStartReference,
					enabled: false,
				},
			};

			this.updateMainControls();
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

		this.startInteractiveSeek(event, targetSeekWrap);

		event.stopPropagation();
	}.call(ctx, event);
}

export function onWaveformMinimapStart(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (!this.isLoaded || !isPrimaryInput(event) || this.pinchZoomState) {
			return;
		}

		if (event.type === "touchstart" && this.getActiveTouchCount(event) !== 1) {
			return;
		}

		const minimapStart = resolveWaveformMinimapStart(this, event);
		if (!minimapStart) {
			return;
		}

		this.waveformMinimapDragState = {
			seekWrap: minimapStart.seekWrap,
			minimapNode: minimapStart.minimapNode,
			pointerOffsetRatio: minimapStart.pointerOffsetRatio,
		};
		this.pendingWaveformTouchSeek = null;
		this.seekingElement = null;
		this.rightClickDragging = false;
		this.loopDragStart = null;
		this.draggingMarker = null;
		if (this.state.currentlySeeking) {
			this.dispatch({ type: "set-seeking", seeking: false });
		}

		this.renderer.setWaveformMinimapViewportStart(
			minimapStart.seekWrap,
			minimapStart.pointerRatio - minimapStart.pointerOffsetRatio,
		);
		event.preventDefault();
		event.stopPropagation();
	}.call(ctx, event);
}

export function onMidiMinimapStart(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (!this.isLoaded || !isPrimaryInput(event) || this.pinchZoomState) {
			return;
		}

		if (event.type === "touchstart" && this.getActiveTouchCount(event) !== 1) {
			return;
		}

		const minimapStart = resolveMidiMinimapStart(this, event);
		if (!minimapStart) {
			return;
		}

		this.waveformMinimapDragState = {
			seekWrap: minimapStart.seekWrap,
			minimapNode: minimapStart.minimapNode,
			pointerOffsetRatio: minimapStart.pointerOffsetRatio,
		};
		this.pendingWaveformTouchSeek = null;
		this.seekingElement = null;
		this.rightClickDragging = false;
		this.loopDragStart = null;
		this.draggingMarker = null;
		if (this.state.currentlySeeking) {
			this.dispatch({ type: "set-seeking", seeking: false });
		}

		this.renderer.setMidiMinimapViewportStart(
			minimapStart.seekWrap,
			minimapStart.pointerRatio - minimapStart.pointerOffsetRatio,
		);
		event.preventDefault();
		event.stopPropagation();
	}.call(ctx, event);
}

export function onSeekEnd(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (!this.isLoaded) {
			return;
		}

		if (finishSeekEndInteraction(this, event)) {
			return;
		}

		const hasActiveSeekInteraction =
			this.draggingMarker !== null ||
			this.rightClickDragging ||
			this.state.currentlySeeking ||
			this.seekingElement !== null;

		if (!hasActiveSeekInteraction) {
			return;
		}

		event.preventDefault();

		if (this.draggingMarker !== null) {
			this.draggingMarker = null;
			this.updateMainControls();
			event.stopPropagation();
			return;
		}

		if (this.rightClickDragging) {
			finalizeRightClickLoopSelection(this);
			this.updateMainControls();
			event.stopPropagation();
			return;
		}

		if (this.state.currentlySeeking && this.state.playing) {
			this.stopAudio();
			this.startAudio();
		}

		this.dispatch({ type: "set-seeking", seeking: false });
		event.stopPropagation();
	}.call(ctx, event);
}

export function onSolo(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (!isPrimaryInput(event)) {
			return;
		}

		event.preventDefault();
		toggleSoloFromPointerEvent(this, event);
	}.call(ctx, event);
}

export function onTrackRowToggle(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (!isPrimaryInput(event)) {
			return;
		}

		const target = eventTargetAsElement(event.target ?? null);
		if (
			target &&
			(target.closest(".track-mix-controls") ||
				target.closest(".control .solo"))
		) {
			return;
		}

		event.preventDefault();
		toggleSoloFromPointerEvent(this, event);
	}.call(ctx, event);
}

export function onAlignmentSync(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (!isPrimaryInput(event)) {
			return;
		}

		event.preventDefault();
		this.toggleGlobalSync();
		event.stopPropagation();
	}.call(ctx, event);
}

export function onVolume(ctx: any, event: any): any {
	return function (this: any, event: any) {
		const target = eventTargetAsElement(event.target ?? null);
		if (!(target instanceof HTMLInputElement)) {
			return;
		}

		const volume = parseFloat(target.value || "0") / 100;
		this.setVolume(volume);
	}.call(ctx, event);
}

export function onVolumeReset(ctx: any, event: any): any {
	return function (this: any, event: any) {
		event.preventDefault();
		this.setVolume(1);
		event.stopPropagation();
	}.call(ctx, event);
}

export function onTrackVolume(ctx: any, event: any): any {
	return function (this: any, event: any) {
		const trackInput = getTrackInputTarget(this, event);
		if (!trackInput) {
			return;
		}

		this.setTrackVolume(
			trackInput.trackIndex,
			parseSliderValue(trackInput.target),
		);
	}.call(ctx, event);
}

export function onTrackVolumeReset(ctx: any, event: any): any {
	return function (this: any, event: any) {
		const trackInput = getTrackInputTarget(this, event);
		if (!trackInput) {
			return;
		}

		event.preventDefault();
		this.setTrackVolume(trackInput.trackIndex, 1);
		event.stopPropagation();
	}.call(ctx, event);
}

export function onTrackPan(ctx: any, event: any): any {
	return function (this: any, event: any) {
		const trackInput = getTrackInputTarget(this, event);
		if (!trackInput) {
			return;
		}

		this.setTrackPan(
			trackInput.trackIndex,
			parseSliderValue(trackInput.target),
		);
	}.call(ctx, event);
}

export function onTrackPanReset(ctx: any, event: any): any {
	return function (this: any, event: any) {
		const trackInput = getTrackInputTarget(this, event);
		if (!trackInput) {
			return;
		}

		event.preventDefault();
		this.setTrackPan(trackInput.trackIndex, 0);
		event.stopPropagation();
	}.call(ctx, event);
}

export function onPreset(ctx: any, event: any): any {
	return function (this: any, event: any) {
		const target = eventTargetAsElement(event.target ?? null);
		const selector = target?.closest(".preset-selector");
		if (!(selector instanceof HTMLSelectElement)) {
			return;
		}

		let presetIndex = parseStrictNonNegativeInt(selector.value || "0");
		if (!Number.isFinite(presetIndex)) {
			presetIndex = 0;
		}

		this.applyPreset(presetIndex);
	}.call(ctx, event);
}

export function onPresetScroll(ctx: any, event: any): any {
	return function (this: any, event: any) {
		event.preventDefault();

		const target = eventTargetAsElement(event.target ?? null);
		const selector = target?.closest(".preset-selector");
		if (!(selector instanceof HTMLSelectElement)) {
			return;
		}

		let currentIndex = parseStrictNonNegativeInt(selector.value || "0");
		if (!Number.isFinite(currentIndex)) {
			currentIndex = 0;
		}

		const maxIndex = selector.options.length - 1;
		const deltaY =
			(event as unknown as { deltaY?: number }).deltaY ??
			event.originalEvent?.deltaY ??
			0;

		if (deltaY > 0) {
			currentIndex = Math.min(currentIndex + 1, maxIndex);
		} else if (deltaY < 0) {
			currentIndex = Math.max(currentIndex - 1, 0);
		}

		selector.value = String(currentIndex);
		selector.dispatchEvent(new Event("change", { bubbles: true }));
	}.call(ctx, event);
}

export function onSetLoopA(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (!isPrimaryInput(event)) {
			return;
		}
		event.preventDefault();
		if (this.state.currentlySeeking) {
			this.dispatch({ type: "set-seeking", seeking: false });
		}
		this.setLoopPoint("A");
		event.stopPropagation();
	}.call(ctx, event);
}

export function onSetLoopB(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (!isPrimaryInput(event)) {
			return;
		}
		event.preventDefault();
		if (this.state.currentlySeeking) {
			this.dispatch({ type: "set-seeking", seeking: false });
		}
		this.setLoopPoint("B");
		event.stopPropagation();
	}.call(ctx, event);
}

export function onToggleLoop(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (!isPrimaryInput(event)) {
			return;
		}
		event.preventDefault();
		this.toggleLoop();
		event.stopPropagation();
	}.call(ctx, event);
}

export function onClearLoop(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (!isPrimaryInput(event)) {
			return;
		}
		event.preventDefault();
		this.clearLoop();
		event.stopPropagation();
	}.call(ctx, event);
}

export function onMarkerDragStart(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (
			!this.features.looping ||
			!isPrimaryInput(event) ||
			this.pinchZoomState
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
			this.draggingMarker = "A";
		} else if (target.classList.contains("marker-b")) {
			this.draggingMarker = "B";
		}

		this.seekingElement = closestInRoot(this.root, event.target, ".seekwrap");
	}.call(ctx, event);
}

export function onKeyboard(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (
			!this.features.keyboard ||
			!isKeyboardControllerActive(this.instanceId)
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

		const key = event.key || event.code;
		const code = event.code || "";
		const trackIndex = this.getKeyboardTrackIndex(event);

		if (isShortcutHelpToggleKey(event)) {
			event.preventDefault();
			this.toggleShortcutHelp();
			event.stopPropagation();
			return;
		}

		if (handleShortcutHelpKeyboard(this, event, key, code, trackIndex)) {
			return;
		}

		if (handleTrackKeyboardSelection(this, event, trackIndex)) {
			return;
		}

		if (handleGlobalKeyboardShortcut(this, event, key)) {
			event.stopPropagation();
		}
	}.call(ctx, event);
}

export function getKeyboardTrackIndex(ctx: any, event: any): any {
	return function (this: any, event: any) {
		return getKeyboardTrackIndexFromEvent(event);
	}.call(ctx, event);
}

export function onResize(ctx: any): any {
	return function (this: any) {
		if (this.resizeDebounceTimer) {
			clearTimeout(this.resizeDebounceTimer);
		}

		this.resizeDebounceTimer = setTimeout(() => {
			this.renderer.reflowWaveforms();
			this.renderer.renderWaveforms(
				this.waveformEngine,
				this.runtimes,
				this.longestDuration,
				this.getWaveformTimelineProjector(),
				this.getWaveformTimelineContext(),
			);
			this.renderer.renderMidiDisplays(
				this.longestDuration,
				this.isAlignmentMode(),
			);
			this.sheetMusicEngine.resize();
			this.updateMainControls();
		}, 300);
	}.call(ctx);
}
