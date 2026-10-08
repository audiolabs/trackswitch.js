import { resolveMarkerPlayerTime } from "./markers";
import type { TrackSwitchControllerImpl } from "./player";

/**
 * How far ahead of the playhead clicks are handed to the audio clock. Scheduling
 * ahead is what keeps a click on its marker to the sample instead of to the
 * next tick of the position monitor.
 */
const CLICK_LOOKAHEAD_SECONDS = 0.1;

/** Reference position from which clicks are still to be scheduled; null while stopped. */
export type MarkerClickHorizon = number | null;

/**
 * Seconds of sounding audio between two reference positions. In alignment mode
 * the lead track does not run at the reference timeline's pace.
 */
function playbackSecondsBetween(
	controller: TrackSwitchControllerImpl,
	from: number,
	to: number,
): number {
	const trackIndex = controller.alignmentPlaybackTrackIndex;
	if (
		!controller.isAlignmentMode() ||
		trackIndex === null ||
		controller.shouldBypassAlignmentMapping(trackIndex)
	) {
		return to - from;
	}
	return (
		controller.referenceToTrackTime(trackIndex, to) -
		controller.referenceToTrackTime(trackIndex, from)
	);
}

/** Called on every tick of running playback: clicks the markers coming up next. */
export function scheduleMarkerClicks(
	controller: TrackSwitchControllerImpl,
): void {
	const { sonifying, sequenceId } = controller.markerEditing;
	const sequence =
		sonifying && sequenceId !== null
			? controller.markerSequences.get(sequenceId)
			: undefined;
	if (!sequence) {
		return;
	}

	const position = controller.state.position;
	// Counted from where playback started, not from this tick, so a marker
	// playback starts right on is not already behind the playhead.
	const from = controller.markerClickHorizon ?? position;
	const until = position + CLICK_LOOKAHEAD_SECONDS;
	sequence.markers.forEach((marker) => {
		const time = marker.hidden
			? null
			: resolveMarkerPlayerTime(controller, marker);
		if (time === null || time < from || time >= until) {
			return;
		}
		controller.audioEngine.scheduleClick(
			playbackSecondsBetween(controller, position, time),
		);
	});
	controller.markerClickHorizon = until;
}

/**
 * Playback stopped, or (re)started at reference position `from`: nothing
 * scheduled so far is still due.
 */
export function resetMarkerClicks(
	controller: TrackSwitchControllerImpl,
	from: MarkerClickHorizon,
): void {
	controller.audioEngine.cancelClicks();
	controller.markerClickHorizon = from;
}
