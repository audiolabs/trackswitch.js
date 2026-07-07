import type { TrackSwitchControllerImpl } from "./player-controller";

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
]);

const SHORTCUT_HELP_BLOCKED_CODES = new Set([
	"KeyR",
	"KeyA",
	"KeyB",
	"KeyL",
	"KeyC",
]);

const KEYBOARD_SHORTCUT_HANDLERS: Record<
	string,
	(controller: TrackSwitchControllerImpl, event: KeyboardEvent) => boolean
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
		if (!controller.features.globalVolume) {
			return false;
		}
		controller.setVolume(controller.state.volume + 0.1);
		return true;
	},
	ArrowDown: (controller) => {
		if (!controller.features.globalVolume) {
			return false;
		}
		controller.setVolume(controller.state.volume - 0.1);
		return true;
	},
	Home: (controller) => {
		controller.seekTo(0);
		return true;
	},
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
		if (!controller.features.looping) {
			return false;
		}
		controller.setLoopPoint("A");
		return true;
	},
	A: (controller) => {
		if (!controller.features.looping) {
			return false;
		}
		controller.setLoopPoint("A");
		return true;
	},
	KeyA: (controller) => {
		if (!controller.features.looping) {
			return false;
		}
		controller.setLoopPoint("A");
		return true;
	},
	b: (controller) => {
		if (!controller.features.looping) {
			return false;
		}
		controller.setLoopPoint("B");
		return true;
	},
	B: (controller) => {
		if (!controller.features.looping) {
			return false;
		}
		controller.setLoopPoint("B");
		return true;
	},
	KeyB: (controller) => {
		if (!controller.features.looping) {
			return false;
		}
		controller.setLoopPoint("B");
		return true;
	},
	l: (controller) => {
		if (!controller.features.looping) {
			return false;
		}
		controller.toggleLoop();
		return true;
	},
	L: (controller) => {
		if (!controller.features.looping) {
			return false;
		}
		controller.toggleLoop();
		return true;
	},
	KeyL: (controller) => {
		if (!controller.features.looping) {
			return false;
		}
		controller.toggleLoop();
		return true;
	},
	c: (controller) => {
		if (!controller.features.looping) {
			return false;
		}
		controller.clearLoop();
		return true;
	},
	C: (controller) => {
		if (!controller.features.looping) {
			return false;
		}
		controller.clearLoop();
		return true;
	},
	KeyC: (controller) => {
		if (!controller.features.looping) {
			return false;
		}
		controller.clearLoop();
		return true;
	},
};

export function isShortcutHelpToggleKey(event: {
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

export function handleShortcutHelpKeyboard(
	controller: TrackSwitchControllerImpl,
	event: KeyboardEvent,
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

export function handleTrackKeyboardSelection(
	controller: TrackSwitchControllerImpl,
	event: KeyboardEvent,
	trackIndex: number | null,
): boolean {
	if (trackIndex === null || trackIndex >= controller.runtimes.length) {
		return false;
	}

	event.preventDefault();
	controller.toggleSolo(trackIndex, controller.effectiveSingleSoloMode);
	event.stopPropagation();
	return true;
}

export function handleGlobalKeyboardShortcut(
	controller: TrackSwitchControllerImpl,
	event: KeyboardEvent,
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

export function getKeyboardTrackIndex(event: KeyboardEvent): number | null {
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
