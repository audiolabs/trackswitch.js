import { getOwnerWindow } from "./dom";

export interface ControllerPointerEvent {
	type: string;
	which?: number;
	pageX?: number;
	pageY?: number;
	key?: string;
	code?: string;
	shiftKey?: boolean;
	target?: EventTarget | null;
	originalEvent?: Event & {
		deltaY?: number;
		touches?: ArrayLike<{ pageX: number; pageY: number }>;
		changedTouches?: ArrayLike<{ pageX: number; pageY: number }>;
	};
	preventDefault(): void;
	stopPropagation(): void;
}

function getPointerPageX(event: ControllerPointerEvent): number | null {
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

export function isPrimaryInput(event: ControllerPointerEvent): boolean {
	return (
		event.type === "touchstart" ||
		(event.type === "mousedown" && event.which === 1)
	);
}
