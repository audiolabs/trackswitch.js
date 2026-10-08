import type { Marker, MarkerSequence } from "./marker";

/** A duration-bearing annotation induced by two consecutive marker positions. */
export interface MarkerSegment {
	readonly id: string;
	readonly start: Marker;
	readonly end: Marker;
	readonly label?: string;
	readonly color?: string;
}

/**
 * Each visible marker of a segment sequence begins a half-open segment that
 * ends at the next marker. Hidden timeline bounds may close the final segment,
 * but never begin one of their own.
 */
export function deriveMarkerSegments(
	sequence: MarkerSequence,
): MarkerSegment[] {
	if (sequence.type !== "segments") {
		return [];
	}

	const segments: MarkerSegment[] = [];
	sequence.markers.forEach((start, index) => {
		const end = sequence.markers[index + 1];
		if (start.hidden || !end || end.position <= start.position) {
			return;
		}
		segments.push({
			id: start.id,
			start,
			end,
			label: start.label,
			color: start.label ? sequence.colors?.[start.label] : undefined,
		});
	});
	return segments;
}
