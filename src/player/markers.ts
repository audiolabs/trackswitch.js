import {
	addMarker as addSequenceMarker,
	createMarkerUnitConverter,
	formatMarkerSequenceCsv,
	type Marker,
	type MarkerSequence,
	type MarkerUnitConverter,
	moveRuntimeMarker,
	removeMarker as removeSequenceMarker,
	updateMarker as updateSequenceMarker,
} from "../model/marker";
import { playerTimeline } from "../model/timeline";
import type { ControllerPointerEvent } from "./input";
import type { TrackSwitchControllerImpl } from "./player";

const MARKER_TIME_EPSILON = 0.000001;
const MARKER_SNAP_DISTANCE_PX = 12;
const MARKER_PREVIOUS_JUMP_MARGIN = 0.8;

export interface MarkerNavigationSelection {
	setId: string;
	markerId: string;
}

export interface MarkerNavigationDialogValues {
	jumpMarker: MarkerNavigationSelection | null;
}

export interface MarkerNavigationMarkerOption {
	id: string;
	label?: string;
	playerTime: number;
	formattedTime: string;
}

export interface MarkerNavigationSetOption {
	id: string;
	markers: MarkerNavigationMarkerOption[];
}

export function renderMarkerLayers(
	controller: TrackSwitchControllerImpl,
): void {
	synchronizeRuntimeMarkers(controller);

	controller.visibleMarkerSequenceIds =
		controller.renderer.renderTimelineMarkers({
			markerSequences: controller.markerSequences,
			// Surfaces and player state use the same reference coordinates.
			playerTimeline: playerTimeline(controller.alignment),
			projection: controller.alignment?.projection ?? null,
			audibleMarkerSequenceIds: new Set(
				getAudibleMarkerSequences(controller).map((resolved) =>
					String(resolved.id),
				),
			),
			getSeekTimelineContext: (seekWrap) =>
				controller.getSeekTimelineContext(seekWrap),
			formatReferenceValue: (value) =>
				controller.renderer.formatReferenceTimelineValue(value),
		});
}

export function synchronizeRuntimeMarkers(
	controller: TrackSwitchControllerImpl,
): void {
	const timeline = playerTimeline(controller.alignment);
	controller.runtimeMarkers = moveRuntimeMarker(
		controller.runtimeMarkers,
		"playhead",
		timeline,
		controller.state.position,
	);
	controller.runtimeMarkers = moveRuntimeMarker(
		controller.runtimeMarkers,
		"loopA",
		timeline,
		controller.state.loop.pointA,
	);
	controller.runtimeMarkers = moveRuntimeMarker(
		controller.runtimeMarkers,
		"loopB",
		timeline,
		controller.state.loop.pointB,
	);
}

export function requireMarkerSequence(
	controller: TrackSwitchControllerImpl,
	sequenceId: string,
): MarkerSequence {
	const sequence = controller.markerSequences.get(sequenceId);
	if (!sequence) {
		throw new Error(`Unknown marker sequence "${sequenceId}".`);
	}
	return sequence;
}

function markerUnits(
	controller: TrackSwitchControllerImpl,
): MarkerUnitConverter {
	return createMarkerUnitConverter(
		controller.alignment,
		controller.media,
		controller.alignment?.profiles ?? controller.mediaProfiles,
	);
}

/**
 * Replaces a sequence with an edited copy. Every edit — from the editing tools
 * or the public API — goes through here, so each one is undoable and announced.
 */
export function commitMarkerSequence(
	controller: TrackSwitchControllerImpl,
	sequenceId: string,
	sequence: MarkerSequence,
	recordUndo = true,
): void {
	if (recordUndo) {
		controller.markerUndoStack.push({
			sequenceId,
			sequence: requireMarkerSequence(controller, sequenceId),
		});
	}
	controller.markerSequences.set(sequenceId, sequence);
	controller.renderMarkerLayers();
	controller.updateMarkerNavigation();
	controller.emit("markers", { sequenceId });
}

export function addMarker(
	controller: TrackSwitchControllerImpl,
	sequenceId: string,
	position: number,
	label?: string,
): string {
	const sequence = requireMarkerSequence(controller, sequenceId);
	const result = addSequenceMarker(
		sequence,
		markerUnits(controller).toNative(sequence.timeline, position),
		label,
	);
	commitMarkerSequence(controller, sequenceId, result.sequence);
	return result.markerId;
}

export function updateMarker(
	controller: TrackSwitchControllerImpl,
	sequenceId: string,
	markerId: string,
	changes: { position?: number; label?: string },
): string {
	const sequence = requireMarkerSequence(controller, sequenceId);
	const result = updateSequenceMarker(sequence, markerId, {
		label: changes.label,
		position:
			changes.position === undefined
				? undefined
				: markerUnits(controller).toNative(sequence.timeline, changes.position),
	});
	commitMarkerSequence(controller, sequenceId, result.sequence);
	return result.markerId;
}

export function removeMarker(
	controller: TrackSwitchControllerImpl,
	sequenceId: string,
	markerId: string,
): void {
	commitMarkerSequence(
		controller,
		sequenceId,
		removeSequenceMarker(
			requireMarkerSequence(controller, sequenceId),
			markerId,
		),
	);
}

export function getMarkersCsv(
	controller: TrackSwitchControllerImpl,
	sequenceId: string,
): string {
	return formatMarkerSequenceCsv(
		requireMarkerSequence(controller, sequenceId),
		markerUnits(controller),
	);
}

function getAudibleMarkerSequences(
	controller: TrackSwitchControllerImpl,
): MarkerSequence[] {
	const anySelectedTrack = controller.runtimes.some(
		(runtime) => runtime.state.solo,
	);
	// With nothing soloed, only tracks of an exclusive list still sound, since such
	// a list always resolves to one of its rows.
	const silentFallback =
		controller.isAlignmentMode() && controller.globalSyncEnabled;
	const trackTimelineIds = new Set(
		controller.runtimes.map((runtime) => runtime.definition.id),
	);
	const audibleTrackIds = new Set(
		controller.runtimes
			.filter(
				(runtime, index) =>
					runtime.state.volume > 0 &&
					(anySelectedTrack
						? runtime.state.solo
						: !silentFallback && controller.isTrackExclusive(index)),
			)
			.map((runtime) => runtime.definition.id),
	);

	const sets: MarkerSequence[] = [];
	controller.markerSequences.forEach((resolved) => {
		// Solo/mute only governs timelines backed by an audio track. Timelines
		// with no track of their own (the implicit/aligned reference timeline,
		// midi, musicxml, ...) can't be muted, so they stay navigable as long
		// as something is audible at all.
		const isTrackTimeline = trackTimelineIds.has(resolved.timeline);
		const isAudible = isTrackTimeline
			? audibleTrackIds.has(resolved.timeline)
			: audibleTrackIds.size > 0;
		if (!isAudible) {
			return;
		}
		sets.push(resolved);
	});
	return sets;
}

function getDialogMarkerSequences(
	controller: TrackSwitchControllerImpl,
): MarkerSequence[] {
	return Array.from(controller.markerSequences.values());
}

export function resolveMarkerPlayerTime(
	controller: TrackSwitchControllerImpl,
	marker: Marker,
): number | null {
	const projection = controller.alignment?.projection ?? null;
	const time = projection
		? projection.projectMarker(marker, playerTimeline(controller.alignment))
		: marker.position;
	return time !== null &&
		Number.isFinite(time) &&
		time >= 0 &&
		time <= controller.longestDuration
		? time
		: null;
}

function getDialogMarkerSequenceOptions(
	controller: TrackSwitchControllerImpl,
): MarkerNavigationSetOption[] {
	return getDialogMarkerSequences(controller)
		.map((set) => {
			const markers = set.markers
				.filter((marker) => !marker.hidden)
				.map((marker) => {
					const playerTime = resolveMarkerPlayerTime(controller, marker);
					if (playerTime === null) {
						return null;
					}
					const label = marker.label?.trim();
					const option: MarkerNavigationMarkerOption = {
						id: marker.id,
						playerTime: playerTime,
						formattedTime:
							controller.renderer.formatReferenceTimelineValue(playerTime),
					};
					if (label) {
						option.label = label;
					}
					return option;
				})
				.filter(
					(marker): marker is MarkerNavigationMarkerOption => marker !== null,
				)
				.sort(
					(left, right) =>
						left.playerTime - right.playerTime ||
						left.id.localeCompare(right.id, undefined, { numeric: true }),
				);
			return { id: String(set.id), markers: markers };
		})
		.filter((set) => set.markers.length > 0);
}

function hasDialogMarkers(controller: TrackSwitchControllerImpl): boolean {
	return getDialogMarkerSequences(controller).some((set) =>
		set.markers.some(
			(marker) =>
				!marker.hidden && resolveMarkerPlayerTime(controller, marker) !== null,
		),
	);
}

function getVisibleMarkerSequences(
	controller: TrackSwitchControllerImpl,
): MarkerSequence[] {
	return Array.from(controller.markerSequences.entries())
		.filter(([setId]) => controller.visibleMarkerSequenceIds.has(setId))
		.map(([, resolved]) => resolved);
}

function getNavigationMarkerTimes(
	controller: TrackSwitchControllerImpl,
): number[] {
	// The ends of the timeline are always stops, so stepping works on a player
	// that shows no marker sequence at all.
	const times: number[] = [0, controller.longestDuration];
	getVisibleMarkerSequences(controller).forEach((resolved) => {
		resolved.markers.forEach((marker) => {
			const time = resolveMarkerPlayerTime(controller, marker);
			if (time !== null) {
				times.push(time);
			}
		});
	});
	times.sort((left, right) => left - right);

	const unique: number[] = [];
	times.forEach((time) => {
		const previous = unique[unique.length - 1];
		if (
			previous === undefined ||
			Math.abs(previous - time) > MARKER_TIME_EPSILON
		) {
			unique.push(time);
		}
	});
	return unique;
}

function getMarkerNavigationTargets(controller: TrackSwitchControllerImpl): {
	previous: number | null;
	next: number | null;
} {
	const position = controller.state.position;
	const times = getNavigationMarkerTimes(controller);
	let previous: number | null = null;
	let next: number | null = null;

	for (const time of times) {
		if (time < position - MARKER_PREVIOUS_JUMP_MARGIN) {
			previous = time;
			continue;
		}
		if (time > position + MARKER_TIME_EPSILON) {
			next = time;
			break;
		}
	}

	return { previous: previous, next: next };
}

export function updateMarkerNavigation(
	controller: TrackSwitchControllerImpl,
): void {
	const targets = getMarkerNavigationTargets(controller);
	const canOpenDialog = hasDialogMarkers(controller);
	controller.renderer.updateMarkerNavigationControls(
		targets.previous !== null,
		targets.next !== null,
		canOpenDialog,
	);
	if (controller.markerNavigationDialogOpen) {
		const dialogSets = getDialogMarkerSequenceOptions(controller);
		if (dialogSets.length === 0) {
			closeMarkerNavigationDialog(controller);
		} else {
			controller.renderer.updateMarkerNavigationDialogSets(dialogSets);
		}
	}
}

export function seekToAdjacentMarker(
	controller: TrackSwitchControllerImpl,
	direction: "previous" | "next",
): void {
	const target = getMarkerNavigationTargets(controller)[direction];
	if (target === null) {
		return;
	}
	controller.seekTo(target);
}

export function openMarkerNavigationDialog(
	controller: TrackSwitchControllerImpl,
): void {
	const sets = getDialogMarkerSequenceOptions(controller);
	if (sets.length === 0) {
		return;
	}
	controller.markerNavigationDialogOpen = true;
	controller.renderer.openMarkerNavigationDialog(sets);
}

export function closeMarkerNavigationDialog(
	controller: TrackSwitchControllerImpl,
): void {
	if (!controller.markerNavigationDialogOpen) {
		return;
	}
	controller.markerNavigationDialogOpen = false;
	controller.renderer.closeMarkerNavigationDialog();
}

function resolveDialogMarker(
	controller: TrackSwitchControllerImpl,
	selection: MarkerNavigationSelection | null,
): { time: number | null; error: string | null } {
	if (!selection) {
		return { time: null, error: null };
	}
	const set = getDialogMarkerSequences(controller).find(
		(candidate) => String(candidate.id) === selection.setId,
	);
	if (!set) {
		return {
			time: null,
			error:
				"The marker sequence is no longer available. Choose another marker.",
		};
	}
	const marker = set.markers.find(
		(candidate) => !candidate.hidden && candidate.id === selection.markerId,
	);
	const time = marker ? resolveMarkerPlayerTime(controller, marker) : null;
	return time === null
		? {
				time: null,
				error: "The marker is no longer available. Choose another marker.",
			}
		: { time, error: null };
}

export function submitMarkerNavigationDialog(
	controller: TrackSwitchControllerImpl,
	values: MarkerNavigationDialogValues,
): void {
	const jump = resolveDialogMarker(controller, values.jumpMarker);
	if (jump.error) {
		controller.renderer.setMarkerNavigationDialogError(jump.error);
		return;
	}

	closeMarkerNavigationDialog(controller);
	if (jump.time !== null) {
		controller.seekTo(jump.time);
	}
}

export function activateTimelineMarker(
	controller: TrackSwitchControllerImpl,
	markerElement: HTMLElement,
): void {
	const seekWrap = markerElement.closest(".seekwrap");
	if (!(seekWrap instanceof HTMLElement)) {
		return;
	}

	const surfaceTime = Number(
		markerElement.getAttribute("data-marker-surface-time"),
	);
	if (!Number.isFinite(surfaceTime)) {
		return;
	}

	const playerTime = controller
		.getSeekTimelineContext(seekWrap)
		.toReferenceTime(surfaceTime);
	if (!Number.isFinite(playerTime)) {
		return;
	}

	controller.seekTo(playerTime);
}

export function moveTimelineMarkerFocus(
	markerElement: HTMLElement,
	direction: "previous" | "next",
): void {
	const layer = markerElement.closest(".timeline-marker-layer");
	if (!layer) {
		return;
	}
	const markers = Array.from(
		layer.querySelectorAll<HTMLElement>(".timeline-marker"),
	);
	const currentIndex = markers.indexOf(markerElement);
	if (currentIndex < 0) {
		return;
	}
	const offset = direction === "previous" ? -1 : 1;
	const nextIndex = Math.max(
		0,
		Math.min(markers.length - 1, currentIndex + offset),
	);
	const nextMarker = markers[nextIndex];
	if (!nextMarker || nextMarker === markerElement) {
		return;
	}
	markers.forEach((marker) => {
		marker.tabIndex = marker === nextMarker ? 0 : -1;
	});
	nextMarker.focus();
}

export function snapLoopEndToMarker(
	controller: TrackSwitchControllerImpl,
	seekWrap: HTMLElement | null,
	event: ControllerPointerEvent,
	rawTime: number,
	loopStart: number,
): number {
	const movingForward = rawTime >= loopStart;
	return snapTimeToMarker(
		controller,
		seekWrap,
		event,
		rawTime,
		(surfaceTime) =>
			movingForward
				? surfaceTime >= loopStart + controller.loopMinDistance
				: surfaceTime <= loopStart - controller.loopMinDistance,
	);
}

export function snapLoopStartToMarker(
	controller: TrackSwitchControllerImpl,
	seekWrap: HTMLElement | null,
	event: ControllerPointerEvent,
	rawTime: number,
): number {
	return snapTimeToMarker(controller, seekWrap, event, rawTime);
}

function snapTimeToMarker(
	controller: TrackSwitchControllerImpl,
	seekWrap: HTMLElement | null,
	event: ControllerPointerEvent,
	rawTime: number,
	isCandidate: (surfaceTime: number) => boolean = () => true,
): number {
	if (!seekWrap || !Number.isFinite(event.pageX)) {
		return rawTime;
	}

	let closestTime: number | null = null;
	let closestDistance = Number.POSITIVE_INFINITY;
	seekWrap
		.querySelectorAll<HTMLElement>(".timeline-marker")
		.forEach((marker) => {
			const surfaceTime = Number(
				marker.getAttribute("data-marker-surface-time"),
			);
			if (!Number.isFinite(surfaceTime) || !isCandidate(surfaceTime)) {
				return;
			}

			const rect = marker.getBoundingClientRect();
			const scrollX = controller.root.ownerDocument.defaultView?.scrollX ?? 0;
			const markerCenterPageX = rect.left + scrollX + rect.width / 2;
			const distance = Math.abs((event.pageX as number) - markerCenterPageX);
			if (distance <= MARKER_SNAP_DISTANCE_PX && distance < closestDistance) {
				closestDistance = distance;
				closestTime = surfaceTime;
			}
		});

	return closestTime ?? rawTime;
}
