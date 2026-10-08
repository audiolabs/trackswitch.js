import {
	addMarker,
	type MarkerSequence,
	removeMarker,
	updateMarker,
} from "../model/marker";
import { downloadTextFile } from "../shared/dom";
import { clamp } from "../shared/math";
import type { MarkerLoupe } from "../views/marker-editing";
import {
	type ControllerPointerEvent,
	getPointerPageX,
	getSeekMetrics,
} from "./input";
import {
	commitMarkerSequence,
	getMarkersCsv,
	requireMarkerSequence,
} from "./markers";
import type { TrackSwitchControllerImpl } from "./player";

export interface MarkerEditingState {
	active: boolean;
	/** The add tool is armed: a click on a view places a marker instead of seeking. */
	adding: boolean;
	/** The remove tool is armed: a click on a marker removes it instead of jumping to it. */
	removing: boolean;
	/** Playback clicks on every marker of the selected sequence. */
	sonifying: boolean;
	/** The sequence new markers are added to, and the one that is sonified. */
	sequenceId: string | null;
}

/** How long a press on a marker has to rest before it turns into an adjustment. */
const MARKER_HOLD_MS = 400;
/** A mouse drag past this distance starts adjusting without waiting for the hold. */
const MARKER_ADJUST_DRAG_THRESHOLD_PX = 4;
/** Pointer travel is scaled down by this factor, and the loupe magnified by it. */
const MARKER_LOUPE_MAGNIFICATION = 16;
/** Length of the snippet that sounds from the marker while it is adjusted. */
const MARKER_PAUSED_PREVIEW_SECONDS = 0.3;
const MARKER_CLICK_SUPPRESSION_MS = 400;
/** A keypress older than this was not waiting for the handler; its timestamp is not trusted. */
const MAX_KEYPRESS_AGE_SECONDS = 0.25;
/** Keeps a segment boundary from landing exactly on its neighbour. */
const SEGMENT_BOUNDARY_GAP = 0.000001;

export interface MarkerAdjustState {
	sequenceId: string;
	markerId: string;
	seekWrap: HTMLElement;
	startPageX: number;
	startPageY: number;
	touch: boolean;
	/** Where the marker sat on the surface when it was pressed. */
	originSurfaceTime: number;
	holdTimer: ReturnType<typeof setTimeout>;
	/** Null while the press could still turn out to be a plain click. */
	active: {
		/** The sequence before the adjustment, restored into the undo history. */
		before: MarkerSequence;
		loupe: MarkerLoupe;
		originPageX: number;
		/** Surface time per pixel of pointer travel. */
		fineStep: number;
		moved: boolean;
		/** Playback was running and is paused for the adjustment. */
		resumePlayback: boolean;
	} | null;
}

function editableSequenceIds(controller: TrackSwitchControllerImpl): string[] {
	return Array.from(controller.markerSequences.entries())
		.filter(([, sequence]) => sequence.csv)
		.map(([id]) => id);
}

/** Brings the toolbar in line with the editing state and the loaded sequences. */
export function refreshMarkerEditing(
	controller: TrackSwitchControllerImpl,
): void {
	const sequenceIds = editableSequenceIds(controller);
	const editing = controller.markerEditing;
	if (
		editing.sequenceId === null ||
		!sequenceIds.includes(editing.sequenceId)
	) {
		// Prefer a sequence the user can see being edited.
		editing.sequenceId =
			sequenceIds.find((id) => controller.visibleMarkerSequenceIds.has(id)) ??
			sequenceIds[0] ??
			null;
	}
	if (editing.sequenceId === null) {
		editing.active = false;
		editing.adding = false;
		editing.removing = false;
		editing.sonifying = false;
	}
	controller.renderer.updateMarkerEditingControls({ ...editing, sequenceIds });
}

export function toggleMarkerEditing(
	controller: TrackSwitchControllerImpl,
): void {
	const editing = controller.markerEditing;
	editing.active = !editing.active;
	editing.adding = false;
	editing.removing = false;
	// Editing starts with the clicks on; they end with it.
	editing.sonifying = editing.active;
	controller.renderer.closeMarkerLabelEditor();
	refreshMarkerEditing(controller);
}

export function toggleMarkerAdding(
	controller: TrackSwitchControllerImpl,
): void {
	const editing = controller.markerEditing;
	editing.adding = editing.active && !editing.adding;
	editing.removing = false;
	controller.renderer.closeMarkerLabelEditor();
	refreshMarkerEditing(controller);
}

export function toggleMarkerSonifying(
	controller: TrackSwitchControllerImpl,
): void {
	const editing = controller.markerEditing;
	editing.sonifying = editing.active && !editing.sonifying;
	refreshMarkerEditing(controller);
}

export function toggleMarkerRemoving(
	controller: TrackSwitchControllerImpl,
): void {
	const editing = controller.markerEditing;
	editing.removing = editing.active && !editing.removing;
	editing.adding = false;
	controller.renderer.closeMarkerLabelEditor();
	refreshMarkerEditing(controller);
}

/** The remove tool's click on a marker. Returns whether the tool took it. */
export function removeMarkerWithTool(
	controller: TrackSwitchControllerImpl,
	markerElement: HTMLElement,
): boolean {
	return (
		controller.markerEditing.removing &&
		removeMarkerElement(controller, markerElement)
	);
}

export function selectMarkerEditingSequence(
	controller: TrackSwitchControllerImpl,
	sequenceId: string,
): void {
	controller.markerEditing.sequenceId = sequenceId;
	refreshMarkerEditing(controller);
}

/**
 * A reference position read on the sequence's own timeline — the inverse of the
 * projection that draws the sequence. Null where the alignment does not reach.
 */
function referenceToSequencePosition(
	controller: TrackSwitchControllerImpl,
	sequence: MarkerSequence,
	referenceTime: number,
): number | null {
	const alignment = controller.alignment;
	if (!alignment || sequence.timeline === alignment.referenceTimeline) {
		return referenceTime;
	}
	const { projection, referenceTimeline, outsideCoverage } = alignment;
	if (
		outsideCoverage === "error" &&
		!projection.isCovered(referenceTimeline, sequence.timeline, referenceTime)
	) {
		return null;
	}
	return projection.project(
		referenceTime,
		referenceTimeline,
		sequence.timeline,
	);
}

function targetSequence(
	controller: TrackSwitchControllerImpl,
): { sequenceId: string; sequence: MarkerSequence } | null {
	const { active, sequenceId } = controller.markerEditing;
	if (!active || sequenceId === null) {
		return null;
	}
	return {
		sequenceId,
		sequence: requireMarkerSequence(controller, sequenceId),
	};
}

function addMarkerAtReferenceTime(
	controller: TrackSwitchControllerImpl,
	referenceTime: number,
	label?: string,
): void {
	const target = targetSequence(controller);
	if (!target) {
		return;
	}
	const position = referenceToSequencePosition(
		controller,
		target.sequence,
		referenceTime,
	);
	if (position === null) {
		return;
	}
	commitMarkerSequence(
		controller,
		target.sequenceId,
		addMarker(target.sequence, position, label).sequence,
	);
}

/**
 * The add tool's click: places a marker where the pointer is, asking for a
 * label first when the sequence carries labels. Returns whether the event was
 * taken, so an unarmed tool leaves it to seeking.
 */
export function placeMarkerFromEvent(
	controller: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
	seekWrap: HTMLElement,
): boolean {
	const target = targetSequence(controller);
	if (
		!target ||
		!controller.markerEditing.adding ||
		seekWrap.closest(".main-control")
	) {
		return false;
	}

	const timeline = controller.getSeekTimelineContext(seekWrap);
	const metrics = getSeekMetrics(seekWrap, event, timeline.duration);
	if (!metrics) {
		return false;
	}
	const referenceTime = timeline.toReferenceTime(metrics.time);

	if (target.sequence.hasLabels) {
		controller.renderer.openMarkerLabelEditor(seekWrap, {
			positionRatio: metrics.timePerc / 100,
			label: "",
			onCommit: (label) =>
				addMarkerAtReferenceTime(controller, referenceTime, label),
		});
	} else {
		addMarkerAtReferenceTime(controller, referenceTime);
	}
	return true;
}

/** Drops a marker at the playhead without interrupting playback — for tapping along. */
export function addMarkerAtPlayhead(
	controller: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): boolean {
	if (!targetSequence(controller)) {
		return false;
	}
	// A key pressed on a heard event marks what was heard. The audio clock is
	// read now and set back twice: by the time the keypress waited for this
	// handler — playback keeps the main thread busy drawing — and by the output
	// latency, which the clock runs ahead of the speakers by.
	const ownerWindow = controller.root.ownerDocument.defaultView as Window;
	const keypressAge = clamp(
		(ownerWindow.performance.now() - (event.originalEvent?.timeStamp ?? 0)) /
			1000,
		0,
		MAX_KEYPRESS_AGE_SECONDS,
	);
	addMarkerAtReferenceTime(
		controller,
		controller.state.playing
			? Math.max(
					0,
					controller.currentPlaybackReferencePosition() -
						keypressAge -
						controller.audioEngine.getOutputLatency(),
				)
			: controller.state.position,
	);
	return true;
}

function resolveMarkerElement(
	controller: TrackSwitchControllerImpl,
	markerElement: HTMLElement,
): { sequenceId: string; markerId: string; sequence: MarkerSequence } | null {
	const sequenceId = markerElement
		.closest(".timeline-marker-layer")
		?.getAttribute("data-marker-set");
	const markerId = markerElement.getAttribute("data-marker-id");
	if (!controller.markerEditing.active || !sequenceId || !markerId) {
		return null;
	}
	const sequence = requireMarkerSequence(controller, sequenceId);
	return sequence.csv ? { sequenceId, markerId, sequence } : null;
}

export function removeMarkerElement(
	controller: TrackSwitchControllerImpl,
	markerElement: HTMLElement,
): boolean {
	const resolved = resolveMarkerElement(controller, markerElement);
	if (!resolved) {
		return false;
	}
	commitMarkerSequence(
		controller,
		resolved.sequenceId,
		removeMarker(resolved.sequence, resolved.markerId),
	);
	return true;
}

/** Opens the label field on an existing marker, with a remove button beside it. */
export function editMarkerElementLabel(
	controller: TrackSwitchControllerImpl,
	markerElement: HTMLElement,
): boolean {
	const resolved = resolveMarkerElement(controller, markerElement);
	const seekWrap = markerElement.closest(".seekwrap");
	if (!resolved || !(seekWrap instanceof HTMLElement)) {
		return false;
	}
	const { sequenceId, markerId, sequence } = resolved;
	const marker = sequence.markers.find(
		(candidate) => !candidate.hidden && candidate.id === markerId,
	);
	if (!marker || !sequence.hasLabels) {
		return false;
	}

	controller.renderer.openMarkerLabelEditor(seekWrap, {
		positionRatio:
			Number.parseFloat(
				markerElement.style.getPropertyValue("--ts-marker-position"),
			) / 100,
		label: marker.label ?? "",
		// The sequence may have been edited while the field was open; read it anew.
		onCommit: (label) =>
			commitMarkerSequence(
				controller,
				sequenceId,
				updateMarker(requireMarkerSequence(controller, sequenceId), markerId, {
					label,
				}).sequence,
			),
		onRemove: () =>
			commitMarkerSequence(
				controller,
				sequenceId,
				removeMarker(requireMarkerSequence(controller, sequenceId), markerId),
			),
	});
	return true;
}

export function undoMarkerEdit(controller: TrackSwitchControllerImpl): boolean {
	if (!controller.markerEditing.active) {
		return false;
	}
	const entry = controller.markerUndoStack.pop();
	if (entry) {
		controller.renderer.closeMarkerLabelEditor();
		commitMarkerSequence(controller, entry.sequenceId, entry.sequence, false);
	}
	return true;
}

export function downloadMarkers(controller: TrackSwitchControllerImpl): void {
	const { sequenceId } = controller.markerEditing;
	if (sequenceId === null) {
		return;
	}
	downloadTextFile(
		controller.root.ownerDocument,
		`${sequenceId}.csv`,
		getMarkersCsv(controller, sequenceId),
		"text/csv",
	);
}

// ═══════════ fine adjustment ═══════════

/**
 * Puts the playhead on the marker and lets it be heard: playback is paused for
 * an adjustment, so a short snippet sounds from the marker instead.
 */
function previewMarkerPosition(
	controller: TrackSwitchControllerImpl,
	referenceTime: number,
): void {
	controller.dispatch({
		type: "set-position",
		position: referenceTime,
		anchor: null,
	});
	controller.stopAudio();
	controller.startAudio(referenceTime, MARKER_PAUSED_PREVIEW_SECONDS);
	controller.updateMainControls();
}

function markAdjustedMarker(
	controller: TrackSwitchControllerImpl,
	adjust: MarkerAdjustState,
): void {
	controller.root
		.querySelectorAll(
			`.timeline-marker-layer[data-marker-set="${CSS.escape(adjust.sequenceId)}"] ` +
				`.timeline-marker[data-marker-id="${CSS.escape(adjust.markerId)}"]`,
		)
		.forEach((element) => {
			element.classList.add("is-active");
		});
}

function drawMarkerLoupe(
	controller: TrackSwitchControllerImpl,
	adjust: MarkerAdjustState,
	surfaceTime: number,
): void {
	const active = adjust.active;
	if (!active) {
		return;
	}
	const { loupe } = active;
	const timeline = controller.getSeekTimelineContext(adjust.seekWrap);
	// The marker — and with it the playhead — stays in the middle; the content
	// travels underneath. Near either end only part of the window has content.
	const span = active.fineStep * loupe.width;
	const windowStart = surfaceTime - span / 2;
	const contentStart = Math.max(0, windowStart);
	const contentEnd = Math.min(timeline.duration, windowStart + span);
	loupe.canvas.style.marginLeft = `${((contentStart - windowStart) / span) * loupe.width}px`;
	controller.renderer.drawSeekSurfaceRange(
		adjust.seekWrap,
		loupe.canvas,
		Math.max(1, ((contentEnd - contentStart) / span) * loupe.width),
		loupe.height,
		contentStart / timeline.duration,
		(contentEnd - contentStart) / timeline.duration,
	);
	loupe.setReadout(timeline.formatValue(surfaceTime));
}

/** A press on a marker while editing: a click still jumps, a hold or drag adjusts. */
export function startMarkerAdjust(
	controller: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
	markerElement: HTMLElement,
): void {
	const resolved = resolveMarkerElement(controller, markerElement);
	const seekWrap = markerElement.closest(".seekwrap");
	const pageX = getPointerPageX(event);
	const originSurfaceTime = Number(
		markerElement.getAttribute("data-marker-surface-time"),
	);
	if (
		!resolved ||
		// With the remove tool armed a press on a marker removes it.
		controller.markerEditing.removing ||
		!(seekWrap instanceof HTMLElement) ||
		pageX === null ||
		!Number.isFinite(originSurfaceTime)
	) {
		return;
	}

	cancelMarkerAdjust(controller);
	controller.markerAdjust = {
		sequenceId: resolved.sequenceId,
		markerId: resolved.markerId,
		seekWrap,
		startPageX: pageX,
		startPageY: event.pageY ?? 0,
		touch: event.type === "touchstart",
		originSurfaceTime,
		holdTimer: setTimeout(
			() => beginMarkerAdjust(controller, pageX),
			MARKER_HOLD_MS,
		),
		active: null,
	};
}

function beginMarkerAdjust(
	controller: TrackSwitchControllerImpl,
	pageX: number,
): void {
	const adjust = controller.markerAdjust;
	if (!adjust || adjust.active) {
		return;
	}
	clearTimeout(adjust.holdTimer);
	controller.renderer.closeMarkerLabelEditor(true);

	const timeline = controller.getSeekTimelineContext(adjust.seekWrap);
	const surfaceWidth = adjust.seekWrap.getBoundingClientRect().width;
	const ownerWindow = controller.root.ownerDocument.defaultView as Window;
	const loupe = controller.renderer.openMarkerLoupe(
		adjust.seekWrap,
		pageX - ownerWindow.scrollX,
	);
	const fineStep =
		timeline.duration / surfaceWidth / MARKER_LOUPE_MAGNIFICATION;
	adjust.active = {
		before: requireMarkerSequence(controller, adjust.sequenceId),
		loupe,
		originPageX: pageX,
		fineStep,
		moved: false,
		resumePlayback: controller.state.playing,
	};
	// Adjusting is done against a still playhead; playback picks up afterwards.
	if (adjust.active.resumePlayback) {
		controller.pause();
	}

	markAdjustedMarker(controller, adjust);
	drawMarkerLoupe(controller, adjust, adjust.originSurfaceTime);
	previewMarkerPosition(
		controller,
		timeline.toReferenceTime(adjust.originSurfaceTime),
	);
}

function moveAdjustedMarker(
	controller: TrackSwitchControllerImpl,
	adjust: MarkerAdjustState,
	surfaceTime: number,
): void {
	const active = adjust.active;
	if (!active) {
		return;
	}
	const sequence = requireMarkerSequence(controller, adjust.sequenceId);
	const referenceTime = controller
		.getSeekTimelineContext(adjust.seekWrap)
		.toReferenceTime(surfaceTime);
	let position = referenceToSequencePosition(
		controller,
		sequence,
		referenceTime,
	);
	if (position === null) {
		return;
	}
	if (sequence.type === "segments") {
		// A boundary that crossed its neighbour would swap two segments' labels.
		const index = sequence.markers.findIndex(
			(marker) => !marker.hidden && marker.id === adjust.markerId,
		);
		const previous = sequence.markers[index - 1];
		const next = sequence.markers[index + 1];
		position = clamp(
			position,
			previous
				? previous.position + SEGMENT_BOUNDARY_GAP
				: Number.NEGATIVE_INFINITY,
			next ? next.position - SEGMENT_BOUNDARY_GAP : Number.POSITIVE_INFINITY,
		);
	}

	// Shown live, but committed — undo entry, change event — only on release.
	const result = updateMarker(sequence, adjust.markerId, { position });
	controller.markerSequences.set(adjust.sequenceId, result.sequence);
	adjust.markerId = result.markerId;
	active.moved = true;

	controller.renderMarkerLayers();
	markAdjustedMarker(controller, adjust);
	drawMarkerLoupe(controller, adjust, surfaceTime);
	previewMarkerPosition(controller, referenceTime);
}

/** Pointer travel during a press on a marker. Returns whether the move was taken. */
export function updateMarkerAdjust(
	controller: TrackSwitchControllerImpl,
	event: ControllerPointerEvent,
): boolean {
	const adjust = controller.markerAdjust;
	const pageX = getPointerPageX(event);
	if (!adjust || pageX === null) {
		return false;
	}

	if (!adjust.active) {
		const deltaX = Math.abs(pageX - adjust.startPageX);
		const deltaY = Math.abs(
			(event.pageY ?? adjust.startPageY) - adjust.startPageY,
		);
		if (adjust.touch) {
			// A finger that travels before the hold completes is scrolling.
			if (Math.max(deltaX, deltaY) >= controller.touchSeekMoveThresholdPx) {
				cancelMarkerAdjust(controller);
			}
			return false;
		}
		if (deltaX < MARKER_ADJUST_DRAG_THRESHOLD_PX) {
			return true;
		}
		beginMarkerAdjust(controller, pageX);
	}

	const active = adjust.active;
	if (!active) {
		return false;
	}
	event.preventDefault();
	moveAdjustedMarker(
		controller,
		adjust,
		clamp(
			adjust.originSurfaceTime + (pageX - active.originPageX) * active.fineStep,
			0,
			controller.getSeekTimelineContext(adjust.seekWrap).duration,
		),
	);
	return true;
}

function cancelMarkerAdjust(controller: TrackSwitchControllerImpl): void {
	const adjust = controller.markerAdjust;
	if (!adjust) {
		return;
	}
	clearTimeout(adjust.holdTimer);
	controller.markerAdjust = null;
	if (adjust.active) {
		adjust.active.loupe.close();
		controller.markerSequences.set(adjust.sequenceId, adjust.active.before);
		controller.renderMarkerLayers();
		if (adjust.active.resumePlayback) {
			controller.play();
		}
	}
}

/**
 * The press ended. Returns whether it was an adjustment; a press that never
 * became one is left to the click that follows it.
 */
export function finishMarkerAdjust(
	controller: TrackSwitchControllerImpl,
): boolean {
	const adjust = controller.markerAdjust;
	if (!adjust) {
		return false;
	}
	clearTimeout(adjust.holdTimer);
	controller.markerAdjust = null;
	const active = adjust.active;
	if (!active) {
		return false;
	}

	active.loupe.close();
	controller.markerClickSuppressedUntil =
		Date.now() + MARKER_CLICK_SUPPRESSION_MS;
	if (active.resumePlayback) {
		controller.play();
	} else {
		// Let the preview snippet ring out, then release what it started.
		setTimeout(
			() => {
				if (!controller.state.playing && !controller.markerAdjust) {
					controller.stopAudio();
				}
			},
			MARKER_PAUSED_PREVIEW_SECONDS * 1000 + 100,
		);
	}

	if (active.moved) {
		const adjusted = requireMarkerSequence(controller, adjust.sequenceId);
		controller.markerSequences.set(adjust.sequenceId, active.before);
		commitMarkerSequence(controller, adjust.sequenceId, adjusted);
		return true;
	}

	// A hold without travel opens the label field — the way to relabel or
	// remove a marker where there is no double-click or Delete key.
	const markerElement = controller.root.querySelector(
		`.timeline-marker-layer[data-marker-set="${CSS.escape(adjust.sequenceId)}"] ` +
			`.timeline-marker[data-marker-id="${CSS.escape(adjust.markerId)}"]`,
	);
	if (
		markerElement instanceof HTMLElement &&
		adjust.seekWrap.contains(markerElement)
	) {
		editMarkerElementLabel(controller, markerElement);
	}
	return true;
}
