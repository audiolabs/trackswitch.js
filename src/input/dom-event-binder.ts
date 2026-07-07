import type { TrackSwitchFeatures } from "../domain/types";
import {
	eventTargetAsElement,
	getDeepActiveElement,
	getOwnerWindow,
} from "../shared/dom";
import type { ControllerPointerEvent } from "../shared/seek";

export interface InputController {
	eventNamespace: string;
	presetCount: number;
	setKeyboardActive(): void;
	openShortcutHelp(): void;
	toggleShortcutHelp(): void;
	closeShortcutHelp(): void;
	onOverlayActivate(event: ControllerPointerEvent): void;
	onShortcutHelpOverlay(event: ControllerPointerEvent): void;
	onPlayPause(event: ControllerPointerEvent): void;
	onStop(event: ControllerPointerEvent): void;
	onRepeat(event: ControllerPointerEvent): void;
	onSeekStart(event: ControllerPointerEvent): void;
	onSeekMove(event: ControllerPointerEvent): void;
	onSeekEnd(event: ControllerPointerEvent): void;
	onSolo(event: ControllerPointerEvent): void;
	onTrackRowToggle(event: ControllerPointerEvent): void;
	onAlignmentSync(event: ControllerPointerEvent): void;
	onVolume(event: ControllerPointerEvent): void;
	onVolumeReset(event: ControllerPointerEvent): void;
	onTrackVolume(event: ControllerPointerEvent): void;
	onTrackVolumeReset(event: ControllerPointerEvent): void;
	onTrackPan(event: ControllerPointerEvent): void;
	onTrackPanReset(event: ControllerPointerEvent): void;
	onPreset(event: ControllerPointerEvent): void;
	onPresetScroll(event: ControllerPointerEvent): void;
	onWaveformZoomWheel(event: ControllerPointerEvent): void;
	onWaveformMinimapStart(event: ControllerPointerEvent): void;
	onMidiZoomWheel(event: ControllerPointerEvent): void;
	onMidiMinimapStart(event: ControllerPointerEvent): void;
	onPanelReorderStart(event: ControllerPointerEvent): void;
	onPanelReorderMove(event: ControllerPointerEvent): void;
	onPanelReorderEnd(event: ControllerPointerEvent): void;
	onSetLoopA(event: ControllerPointerEvent): void;
	onSetLoopB(event: ControllerPointerEvent): void;
	onToggleLoop(event: ControllerPointerEvent): void;
	onClearLoop(event: ControllerPointerEvent): void;
	onMarkerDragStart(event: ControllerPointerEvent): void;
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
		this.addPointerDelegatedListener(".seekwrap", (event) => {
			this.controller.onSeekStart(event);
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
		this.addPointerDelegatedListener(".midi-zoom-minimap", (event) => {
			this.controller.onMidiMinimapStart(event);
		});
		this.addDelegatedListener(
			"wheel",
			".midi-wrap",
			(event) => {
				this.controller.onMidiZoomWheel(event);
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

		if (this.features.globalVolume) {
			this.bindGlobalVolumeControls();
		}

		if (this.features.trackVolumeControls) {
			this.bindTrackVolumeControls();
		}

		if (this.features.trackPanControls) {
			this.bindTrackPanControls();
		}

		if (this.features.trackVolumeControls || this.features.trackPanControls) {
			this.bindTrackMixControlPropagation();
		}

		if (this.features.presets && this.controller.presetCount >= 2) {
			this.bindPresetControls();
		}

		if (this.features.looping) {
			this.bindLoopControls();
		}

		if (this.features.keyboard) {
			this.bindKeyboardShortcuts();
		}

		const hasWaveformUi = !!this.root.querySelector(
			".waveform, .waveform-wrap",
		);
		const hasSheetMusicUi = !!this.root.querySelector(
			".sheetmusic, .sheetmusic-wrap",
		);
		const hasMidiUi = !!this.root.querySelector(".midi, .midi-wrap");

		if (hasWaveformUi) {
			this.bindWaveformControls();
		}

		if (hasMidiUi) {
			this.bindMidiControls();
		}

		if (hasWaveformUi || hasSheetMusicUi || hasMidiUi) {
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
