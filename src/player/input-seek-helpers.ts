import { closestInRoot, getOwnerWindow } from "../shared/dom";
import type { ControllerPointerEvent } from "../shared/seek";
import { activateLoopRange } from "./playback-actions";
import type { TrackSwitchControllerImpl } from "./player-controller";

export function resolveWaveformMinimapStart(
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

export function resolveMidiMinimapStart(
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
		".midi-zoom-minimap",
	);
	if (!minimapNode || !Number.isFinite(event.pageX)) {
		return null;
	}

	const wrapper = closestInRoot(controller.root, event.target, ".midi-wrap");
	if (!wrapper) {
		return null;
	}

	const seekWrap = wrapper.querySelector('.seekwrap[data-seek-surface="midi"]');
	if (!(seekWrap instanceof HTMLElement)) {
		return null;
	}

	const viewport = controller.renderer.getMidiMinimapViewport(seekWrap);
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

export function finishSeekEndInteraction(
	controller: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): boolean {
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

export function finalizeRightClickLoopSelection(
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
