import type { TrackRuntime } from "../domain/types";
import { mapTime } from "../shared/alignment";
import { closestInRoot, getOwnerWindow } from "../shared/dom";
import { clamp } from "../shared/math";
import { getSeekMetrics } from "../shared/seek";
import {
	parseWaveformSource,
	resolveFixedWaveformTrackIndex,
} from "../shared/waveform-source";

interface SeekTimelineContext {
	duration: number;
	toReferenceTime(timelineTime: number): number;
	fromReferenceTime(referenceTime: number): number;
}

const WAVEFORM_WHEEL_ZOOM_SPEED = 0.002;
const WAVEFORM_TRACKPAD_DELTA_BOOST = 8;
const WAVEFORM_ZOOM_OUT_DELTA_BOOST = 1.35;
const WAVEFORM_MAX_WHEEL_DELTA = 240;

function normalizeWaveformWheelDelta(event: WheelEvent): number {
	let deltaY = event.deltaY;

	if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
		deltaY *= 16;
	} else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
		const ownerNode =
			event.currentTarget instanceof Node
				? event.currentTarget
				: event.target instanceof Node
					? event.target
					: null;
		deltaY *= Math.max(1, getOwnerWindow(ownerNode).innerHeight);
	} else if (Math.abs(deltaY) < 16) {
		deltaY *= WAVEFORM_TRACKPAD_DELTA_BOOST;
	}

	if (deltaY > 0) {
		deltaY *= WAVEFORM_ZOOM_OUT_DELTA_BOOST;
	}

	return clamp(deltaY, -WAVEFORM_MAX_WHEEL_DELTA, WAVEFORM_MAX_WHEEL_DELTA);
}

function handleWaveformAuxiliarySeekState(
	controller: any,
	event: any,
): boolean {
	if (controller.waveformMinimapDragState) {
		if (controller.updateTimelineMinimapDrag(event)) {
			event.preventDefault();
			event.stopPropagation();
		}
		return true;
	}

	if (controller.pendingWaveformTouchSeek) {
		if (controller.tryActivatePendingWaveformTouchSeek(event)) {
			event.preventDefault();
			event.stopPropagation();
		}
		return true;
	}

	if (controller.pinchZoomState) {
		if (controller.updatePinchZoom(event)) {
			event.preventDefault();
		}
		return true;
	}

	return false;
}

function updateDraggedLoopMarker(controller: any, event: any): boolean {
	if (controller.draggingMarker === null) {
		return false;
	}

	event.preventDefault();
	const seekTimelineContext = controller.getSeekTimelineContext(
		controller.seekingElement,
	);
	const metrics = getSeekMetrics(
		controller.seekingElement,
		event,
		seekTimelineContext.duration,
	);
	if (!metrics) {
		return true;
	}

	let newTime = metrics.time;
	if (controller.draggingMarker === "A") {
		const loopPointB =
			controller.state.loop.pointB === null
				? null
				: seekTimelineContext.fromReferenceTime(controller.state.loop.pointB);
		if (loopPointB !== null) {
			newTime = Math.min(newTime, loopPointB - controller.loopMinDistance);
		}
		newTime = Math.max(0, newTime);
		controller.state = {
			...controller.state,
			loop: {
				...controller.state.loop,
				pointA: seekTimelineContext.toReferenceTime(newTime),
			},
		};
	} else {
		const loopPointA =
			controller.state.loop.pointA === null
				? null
				: seekTimelineContext.fromReferenceTime(controller.state.loop.pointA);
		if (loopPointA !== null) {
			newTime = Math.max(newTime, loopPointA + controller.loopMinDistance);
		}
		newTime = Math.min(seekTimelineContext.duration, newTime);
		controller.state = {
			...controller.state,
			loop: {
				...controller.state.loop,
				pointB: seekTimelineContext.toReferenceTime(newTime),
			},
		};
	}

	controller.updateMainControls();
	return true;
}

function updateRightClickLoopSelection(controller: any, event: any): boolean {
	if (!controller.features.looping || !controller.rightClickDragging) {
		return false;
	}

	event.preventDefault();

	const seekTimelineContext = controller.getSeekTimelineContext(
		controller.seekingElement,
	);
	const metrics = getSeekMetrics(
		controller.seekingElement,
		event,
		seekTimelineContext.duration,
	);
	if (!metrics || controller.loopDragStart === null) {
		return true;
	}

	const loopStart = controller.loopDragStart;
	const movingForward = metrics.time >= loopStart;
	const loopEnd = movingForward
		? Math.min(
				seekTimelineContext.duration,
				Math.max(metrics.time, loopStart + controller.loopMinDistance),
			)
		: Math.max(
				0,
				Math.min(metrics.time, loopStart - controller.loopMinDistance),
			);
	const mappedStart = seekTimelineContext.toReferenceTime(
		movingForward ? loopStart : loopEnd,
	);
	const mappedEnd = seekTimelineContext.toReferenceTime(
		movingForward ? loopEnd : loopStart,
	);

	controller.state = {
		...controller.state,
		loop: {
			...controller.state.loop,
			pointA: Math.min(mappedStart, mappedEnd),
			pointB: Math.max(mappedStart, mappedEnd),
			enabled: false,
		},
	};

	controller.updateMainControls();
	return true;
}
export function onSeekMove(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (!this.isLoaded) {
			return;
		}

		if (handleWaveformAuxiliarySeekState(this, event)) {
			return;
		}

		if (updateDraggedLoopMarker(this, event)) {
			return;
		}

		if (updateRightClickLoopSelection(this, event)) {
			return;
		}

		if (this.state.currentlySeeking) {
			event.preventDefault();
			this.seekFromEvent(event);
		}
	}.call(ctx, event);
}

export function onWaveformZoomWheel(ctx: any, event: any): any {
	return function (this: any, event: any) {
		const wheelEvent = event.originalEvent as WheelEvent | undefined;
		const deltaY = wheelEvent ? normalizeWaveformWheelDelta(wheelEvent) : 0;
		if (
			typeof deltaY !== "number" ||
			!Number.isFinite(deltaY) ||
			deltaY === 0
		) {
			return;
		}

		const wrapper = closestInRoot(this.root, event.target, ".waveform-wrap");
		if (!wrapper) {
			return;
		}

		const seekWrap = wrapper.querySelector(
			'.seekwrap[data-seek-surface="waveform"]',
		);
		if (!(seekWrap instanceof HTMLElement)) {
			return;
		}

		const zoomDuration = this.getSeekTimelineContext(seekWrap).duration;
		if (!this.renderer.isWaveformZoomEnabled(seekWrap, zoomDuration)) {
			return;
		}

		const currentZoom = this.renderer.getWaveformZoom(seekWrap);
		if (currentZoom === null) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		const zoomFactor = Math.exp(-1 * deltaY * WAVEFORM_WHEEL_ZOOM_SPEED);
		const nextZoom = currentZoom * zoomFactor;
		const changed = this.renderer.setWaveformZoom(
			seekWrap,
			nextZoom,
			zoomDuration,
			Number.isFinite(event.pageX) ? event.pageX : undefined,
		);

		if (changed) {
			this.requestWaveformRender();
			this.updateMainControls();
		}
	}.call(ctx, event);
}

export function onMidiZoomWheel(ctx: any, event: any): any {
	return function (this: any, event: any) {
		const wheelEvent = event.originalEvent as WheelEvent | undefined;
		const deltaY = wheelEvent ? normalizeWaveformWheelDelta(wheelEvent) : 0;
		if (
			typeof deltaY !== "number" ||
			!Number.isFinite(deltaY) ||
			deltaY === 0
		) {
			return;
		}

		const wrapper = closestInRoot(this.root, event.target, ".midi-wrap");
		if (!wrapper) {
			return;
		}

		const seekWrap = wrapper.querySelector(
			'.seekwrap[data-seek-surface="midi"]',
		);
		if (!(seekWrap instanceof HTMLElement)) {
			return;
		}

		const zoomDuration = this.getSeekTimelineContext(seekWrap).duration;
		if (!this.renderer.isMidiZoomEnabled(seekWrap, zoomDuration)) {
			return;
		}

		const currentZoom = this.renderer.getMidiZoom(seekWrap);
		if (currentZoom === null) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		const zoomFactor = Math.exp(-1 * deltaY * WAVEFORM_WHEEL_ZOOM_SPEED);
		const nextZoom = currentZoom * zoomFactor;
		const changed = this.renderer.setMidiZoom(
			seekWrap,
			nextZoom,
			zoomDuration,
			Number.isFinite(event.pageX) ? event.pageX : undefined,
		);

		if (changed) {
			this.updateMainControls();
		}
	}.call(ctx, event);
}

export function updateTimelineMinimapDrag(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (!this.waveformMinimapDragState) {
			return false;
		}

		if (event.type === "touchmove" && this.getActiveTouchCount(event) >= 2) {
			this.endWaveformMinimapDrag();
			return false;
		}

		if (!Number.isFinite(event.pageX)) {
			return true;
		}

		const rect =
			this.waveformMinimapDragState.minimapNode.getBoundingClientRect();
		const minimapWidth = Math.max(
			1,
			rect.width || this.waveformMinimapDragState.minimapNode.clientWidth,
		);
		const ownerWindow = getOwnerWindow(
			this.waveformMinimapDragState.minimapNode,
		);
		const pointerRatio = clamp(
			((event.pageX as number) - (rect.left + ownerWindow.scrollX)) /
				minimapWidth,
			0,
			1,
		);
		const seekWrap = this.waveformMinimapDragState.seekWrap;
		const startRatio =
			pointerRatio - this.waveformMinimapDragState.pointerOffsetRatio;
		if (this.isMidiSeekSurface(seekWrap)) {
			this.renderer.setMidiMinimapViewportStart(seekWrap, startRatio);
		} else {
			this.renderer.setWaveformMinimapViewportStart(seekWrap, startRatio);
		}
		return true;
	}.call(ctx, event);
}

export function updateWaveformMinimapDrag(ctx: any, event: any): any {
	return updateTimelineMinimapDrag(ctx, event);
}

export function endWaveformMinimapDrag(ctx: any): any {
	return function (this: any) {
		this.waveformMinimapDragState = null;
	}.call(ctx);
}

export function requestWaveformRender(ctx: any): any {
	return function (this: any) {
		if (this.waveformRenderFrameId !== null) {
			return;
		}

		this.waveformRenderFrameId = requestAnimationFrame(() => {
			this.waveformRenderFrameId = null;
			this.renderer.renderWaveforms(
				this.waveformEngine,
				this.runtimes,
				this.longestDuration,
				this.getWaveformTimelineProjector(),
				this.getWaveformTimelineContext(),
			);
		});
	}.call(ctx);
}

export function isWaveformSeekSurface(ctx: any, seekWrap: any): any {
	return function (this: any, seekWrap: any) {
		return (
			!!seekWrap && seekWrap.getAttribute("data-seek-surface") === "waveform"
		);
	}.call(ctx, seekWrap);
}

export function isMidiSeekSurface(ctx: any, seekWrap: any): any {
	return function (this: any, seekWrap: any) {
		return !!seekWrap && seekWrap.getAttribute("data-seek-surface") === "midi";
	}.call(ctx, seekWrap);
}

export function startInteractiveSeek(ctx: any, event: any, seekWrap: any): any {
	return function (this: any, event: any, seekWrap: any) {
		this.seekingElement = seekWrap;
		this.seekFromEvent(event, true);
		this.dispatch({ type: "set-seeking", seeking: true });
		this.disableLoopWhenSeekOutsideRegion();
	}.call(ctx, event, seekWrap);
}

export function disableLoopWhenSeekOutsideRegion(ctx: any): any {
	return function (this: any) {
		if (
			this.state.loop.enabled &&
			this.state.loop.pointA !== null &&
			this.state.loop.pointB !== null &&
			(this.state.position < this.state.loop.pointA ||
				this.state.position > this.state.loop.pointB)
		) {
			this.state = {
				...this.state,
				loop: {
					...this.state.loop,
					enabled: false,
				},
			};
		}
	}.call(ctx);
}

export function tryStartPendingWaveformTouchSeek(
	ctx: any,
	event: any,
	seekWrap: any,
): any {
	return function (this: any, event: any, seekWrap: any) {
		if (
			event.type !== "touchstart" ||
			(!this.isWaveformSeekSurface(seekWrap) &&
				!this.isMidiSeekSurface(seekWrap)) ||
			this.getActiveTouchCount(event) !== 1 ||
			!seekWrap
		) {
			return false;
		}

		if (!Number.isFinite(event.pageX)) {
			return false;
		}

		if (!Number.isFinite(event.pageY)) {
			return false;
		}

		this.pendingWaveformTouchSeek = {
			seekWrap: seekWrap,
			startPageX: event.pageX as number,
			startPageY: event.pageY as number,
		};
		this.seekingElement = seekWrap;
		return true;
	}.call(ctx, event, seekWrap);
}

export function tryActivatePendingWaveformTouchSeek(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (!this.pendingWaveformTouchSeek) {
			return false;
		}

		if (this.getActiveTouchCount(event) >= 2) {
			return false;
		}

		if (!Number.isFinite(event.pageX)) {
			return false;
		}

		if (!Number.isFinite(event.pageY)) {
			return false;
		}

		const deltaX = Math.abs(
			(event.pageX as number) - this.pendingWaveformTouchSeek.startPageX,
		);
		const deltaY = Math.abs(
			(event.pageY as number) - this.pendingWaveformTouchSeek.startPageY,
		);

		if (deltaY >= this.touchSeekMoveThresholdPx && deltaY > deltaX) {
			this.pendingWaveformTouchSeek = null;
			this.seekingElement = null;
			return false;
		}

		if (deltaX < this.touchSeekMoveThresholdPx || deltaX < deltaY) {
			return false;
		}

		const seekWrap = this.pendingWaveformTouchSeek.seekWrap;
		this.pendingWaveformTouchSeek = null;
		this.startInteractiveSeek(event, seekWrap);
		return true;
	}.call(ctx, event);
}

export function applyPendingWaveformTouchSeekTap(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (!this.pendingWaveformTouchSeek) {
			return;
		}

		if (Number.isFinite(event.pageX) && Number.isFinite(event.pageY)) {
			const deltaX = Math.abs(
				(event.pageX as number) - this.pendingWaveformTouchSeek.startPageX,
			);
			const deltaY = Math.abs(
				(event.pageY as number) - this.pendingWaveformTouchSeek.startPageY,
			);
			if (
				deltaX >= this.touchSeekMoveThresholdPx ||
				deltaY >= this.touchSeekMoveThresholdPx
			) {
				this.pendingWaveformTouchSeek = null;
				this.seekingElement = null;
				return;
			}
		}

		this.seekingElement = this.pendingWaveformTouchSeek.seekWrap;
		this.pendingWaveformTouchSeek = null;
		this.seekFromEvent(event, false);
	}.call(ctx, event);
}

export function getTouchPair(ctx: any, event: any): any {
	return function (this: any, event: any) {
		const touchEvent = event.originalEvent as TouchEvent | undefined;
		const touches = touchEvent?.touches;
		if (!touches || touches.length < 2) {
			return null;
		}

		const first = touches[0];
		const second = touches[1];
		if (!first || !second) {
			return null;
		}

		return [first, second];
	}.call(ctx, event);
}

export function getTouchDistance(ctx: any, event: any): any {
	return function (this: any, event: any) {
		const touchPair = this.getTouchPair(event);
		if (!touchPair) {
			return null;
		}

		const [first, second] = touchPair;
		const distance = Math.hypot(
			first.pageX - second.pageX,
			first.pageY - second.pageY,
		);
		if (!Number.isFinite(distance) || distance <= 0) {
			return null;
		}

		return distance;
	}.call(ctx, event);
}

export function getTouchCenterPageX(ctx: any, event: any): any {
	return function (this: any, event: any) {
		const touchPair = this.getTouchPair(event);
		if (!touchPair) {
			return null;
		}

		const [first, second] = touchPair;
		return (first.pageX + second.pageX) / 2;
	}.call(ctx, event);
}

export function getActiveTouchCount(ctx: any, event: any): any {
	return function (this: any, event: any) {
		const touchEvent = event.originalEvent as TouchEvent | undefined;
		if (!touchEvent?.touches) {
			return 0;
		}

		return touchEvent.touches.length;
	}.call(ctx, event);
}

export function tryStartPinchZoom(ctx: any, event: any, seekWrap: any): any {
	return function (this: any, event: any, seekWrap: any) {
		if (event.type !== "touchstart") {
			return false;
		}

		if (this.pinchZoomState) {
			return true;
		}

		if (
			!seekWrap ||
			(seekWrap.getAttribute("data-seek-surface") !== "waveform" &&
				seekWrap.getAttribute("data-seek-surface") !== "midi")
		) {
			return false;
		}

		const zoomDuration = this.getSeekTimelineContext(seekWrap).duration;
		const zoomEnabled = this.isMidiSeekSurface(seekWrap)
			? this.renderer.isMidiZoomEnabled(seekWrap, zoomDuration)
			: this.renderer.isWaveformZoomEnabled(seekWrap, zoomDuration);
		if (!zoomEnabled) {
			return false;
		}

		const initialDistance = this.getTouchDistance(event);
		if (initialDistance === null) {
			return false;
		}

		const initialZoom = this.isMidiSeekSurface(seekWrap)
			? this.renderer.getMidiZoom(seekWrap)
			: this.renderer.getWaveformZoom(seekWrap);
		if (initialZoom === null) {
			return false;
		}

		this.pinchZoomState = {
			seekWrap: seekWrap,
			initialDistance: initialDistance,
			initialZoom: initialZoom,
		};
		this.pendingWaveformTouchSeek = null;
		this.waveformMinimapDragState = null;

		if (this.state.currentlySeeking) {
			this.dispatch({ type: "set-seeking", seeking: false });
		}
		this.seekingElement = seekWrap;
		this.rightClickDragging = false;
		this.loopDragStart = null;
		this.draggingMarker = null;
		return true;
	}.call(ctx, event, seekWrap);
}

export function updatePinchZoom(ctx: any, event: any): any {
	return function (this: any, event: any) {
		if (!this.pinchZoomState) {
			return false;
		}

		const distance = this.getTouchDistance(event);
		if (distance === null) {
			this.endPinchZoom();
			return false;
		}

		const anchorPageX = this.getTouchCenterPageX(event);
		const scale = distance / this.pinchZoomState.initialDistance;
		const zoomDuration = this.getSeekTimelineContext(
			this.pinchZoomState.seekWrap,
		).duration;
		const changed = this.isMidiSeekSurface(this.pinchZoomState.seekWrap)
			? this.renderer.setMidiZoom(
					this.pinchZoomState.seekWrap,
					this.pinchZoomState.initialZoom * scale,
					zoomDuration,
					anchorPageX === null ? undefined : anchorPageX,
				)
			: this.renderer.setWaveformZoom(
					this.pinchZoomState.seekWrap,
					this.pinchZoomState.initialZoom * scale,
					zoomDuration,
					anchorPageX === null ? undefined : anchorPageX,
				);

		if (changed) {
			if (this.isWaveformSeekSurface(this.pinchZoomState.seekWrap)) {
				this.requestWaveformRender();
			}
			this.updateMainControls();
		}

		return true;
	}.call(ctx, event);
}

export function endPinchZoom(ctx: any): any {
	return function (this: any) {
		this.pinchZoomState = null;
		if (this.state.currentlySeeking) {
			this.dispatch({ type: "set-seeking", seeking: false });
		}
		this.pendingWaveformTouchSeek = null;
		this.seekingElement = null;
	}.call(ctx);
}

export function trackIndexFromTarget(ctx: any, target: any): any {
	return function (this: any, target: any) {
		const track = closestInRoot(this.root, target, ".track[data-track-index]");
		if (!track) {
			return -1;
		}

		const rawIndex = track.getAttribute("data-track-index");
		const parsed = Number(rawIndex);
		if (!Number.isFinite(parsed) || parsed < 0) {
			return -1;
		}

		return Math.floor(parsed);
	}.call(ctx, target);
}

export function isFixedWaveformLocalAxisEnabled(ctx: any): any {
	return function (this: any) {
		return (
			this.isAlignmentMode() &&
			!!this.alignmentContext &&
			!this.globalSyncEnabled
		);
	}.call(ctx);
}

export function getSeekTimelineContext(ctx: any, seekingElement: any): any {
	return function (this: any, seekingElement: any) {
		const referenceContext: SeekTimelineContext = {
			duration: this.longestDuration,
			toReferenceTime: (timelineTime: number): number =>
				clamp(timelineTime, 0, this.longestDuration),
			fromReferenceTime: (referenceTime: number): number =>
				clamp(referenceTime, 0, this.longestDuration),
		};

		if (!seekingElement) {
			return referenceContext;
		}

		if (this.isMidiSeekSurface(seekingElement) && this.isAlignmentMode()) {
			const midiSurface = this.renderer.findMidiSurface(seekingElement);
			return this.getMidiTimelineContext(midiSurface) || referenceContext;
		}

		if (!this.isFixedWaveformLocalAxisEnabled()) {
			return referenceContext;
		}

		const waveformSource = parseWaveformSource(
			seekingElement.getAttribute("data-waveform-source"),
		);
		const trackIndex = resolveFixedWaveformTrackIndex(
			this.runtimes.length,
			waveformSource,
		);
		if (trackIndex === null) {
			return referenceContext;
		}
		const runtime = this.runtimes[trackIndex];
		if (!runtime) {
			return referenceContext;
		}

		const trackDuration = (ctx.constructor as any).getRuntimeDuration(runtime);
		if (!Number.isFinite(trackDuration) || trackDuration <= 0) {
			return referenceContext;
		}

		let longestTrackDuration = trackDuration;
		for (let i = 0; i < this.runtimes.length; i++) {
			const rt = this.runtimes[i];
			if (rt) {
				const d = (ctx.constructor as any).getRuntimeDuration(rt);
				if (Number.isFinite(d) && d > longestTrackDuration)
					longestTrackDuration = d;
			}
		}

		return {
			duration: longestTrackDuration,
			toReferenceTime: (sharedTime: number): number => {
				const clampedTrackTime = clamp(sharedTime, 0, trackDuration);
				return clamp(
					this.trackToReferenceTime(trackIndex, clampedTrackTime),
					0,
					this.longestDuration,
				);
			},
			fromReferenceTime: (referenceTime: number): number => {
				const clampedReferenceTime = clamp(
					referenceTime,
					0,
					this.longestDuration,
				);
				return clamp(
					this.referenceToTrackTime(trackIndex, clampedReferenceTime),
					0,
					trackDuration,
				);
			},
		};
	}.call(ctx, seekingElement);
}

export function getMidiTimelineContext(ctx: any, midiSurface: any): any {
	return function (this: any, midiSurface: any) {
		if (!midiSurface || !this.isAlignmentMode()) {
			return null;
		}

		const midiDuration = Number(midiSurface.midiDurationSeconds);
		if (!Number.isFinite(midiDuration) || midiDuration <= 0) {
			return null;
		}

		const alignmentColumn =
			typeof midiSurface.alignmentColumn === "string"
				? midiSurface.alignmentColumn.trim()
				: "";
		if (!alignmentColumn || !this.alignmentContext) {
			return {
				duration: midiDuration,
				toReferenceTime: (midiTime: number): number =>
					clamp(midiTime, 0, this.longestDuration),
				fromReferenceTime: (referenceTime: number): number =>
					clamp(referenceTime, 0, midiDuration),
			};
		}

		const useSyncAxis = this.getActiveAlignmentAxisKey() === "sync";
		const mappings = useSyncAxis
			? this.alignmentContext.syncMidiMappingsByColumn
			: this.alignmentContext.midiMappingsByColumn;
		const converter = mappings?.get(alignmentColumn);
		const activeAxis = useSyncAxis
			? this.alignmentContext.syncAxis
			: this.alignmentContext.baseAxis;
		const referenceDuration = Number(
			activeAxis?.referenceDuration ?? this.longestDuration,
		);
		if (!converter || !activeAxis || !Number.isFinite(referenceDuration)) {
			throw new Error(
				"Alignment MIDI timeline is missing configured alignmentColumn mapping: " +
					alignmentColumn,
			);
		}

		return {
			duration: midiDuration,
			toReferenceTime: (midiTime: number): number =>
				clamp(
					mapTime(
						converter.trackToReference,
						clamp(midiTime, 0, midiDuration),
						this.alignmentContext.outOfRange,
					),
					0,
					referenceDuration,
				),
			fromReferenceTime: (referenceTime: number): number =>
				clamp(
					mapTime(
						converter.referenceToTrack,
						clamp(referenceTime, 0, referenceDuration),
						this.alignmentContext.outOfRange,
					),
					0,
					midiDuration,
				),
		};
	}.call(ctx, midiSurface);
}

export function getWaveformTimelineContext(ctx: any): any {
	return function (this: any) {
		return {
			enabled: this.isFixedWaveformLocalAxisEnabled(),
			referenceToTrackTime: (
				trackIndex: number,
				referenceTime: number,
			): number => {
				const runtime = this.runtimes[trackIndex];
				if (!runtime) {
					return 0;
				}

				const trackDuration = (ctx.constructor as any).getRuntimeDuration(
					runtime,
				);
				if (!Number.isFinite(trackDuration) || trackDuration <= 0) {
					return 0;
				}

				const clampedReferenceTime = clamp(
					referenceTime,
					0,
					this.longestDuration,
				);
				return clamp(
					this.referenceToTrackTime(trackIndex, clampedReferenceTime),
					0,
					trackDuration,
				);
			},
			getTrackDuration: (trackIndex: number): number => {
				const runtime = this.runtimes[trackIndex];
				if (!runtime) {
					return 0;
				}

				const duration = (ctx.constructor as any).getRuntimeDuration(runtime);
				if (!Number.isFinite(duration) || duration <= 0) {
					return 0;
				}

				return duration;
			},
			getTrackCount: (): number => this.runtimes.length,
			getTrackAlignmentPoints: (
				trackIndex: number,
			): Array<{ referenceTime: number; trackTime: number }> => {
				if (!this.alignmentContext) return [];
				return (
					this.alignmentContext.warpingSeriesByTrack.get(trackIndex)?.points ??
					[]
				);
			},
		};
	}.call(ctx);
}

export function getWaveformTimelineProjector(ctx: any): any {
	return function (this: any) {
		if (!this.isAlignmentMode() || !this.alignmentContext) {
			return undefined;
		}

		const trackIndexByRuntime = new Map<TrackRuntime, number>();
		const trackIndexByDefinition = new Map<object, number>();

		this.runtimes.forEach((runtime: TrackRuntime, index: number) => {
			trackIndexByRuntime.set(runtime, index);
			trackIndexByDefinition.set(runtime.definition, index);
		});

		return (runtime: TrackRuntime, trackTimelineTime: number): number => {
			const directIndex = trackIndexByRuntime.get(runtime);
			if (directIndex !== undefined) {
				return this.trackToReferenceTime(directIndex, trackTimelineTime);
			}

			const definitionIndex = trackIndexByDefinition.get(runtime.definition);
			if (definitionIndex !== undefined) {
				return this.trackToReferenceTime(definitionIndex, trackTimelineTime);
			}

			return trackTimelineTime;
		};
	}.call(ctx);
}
