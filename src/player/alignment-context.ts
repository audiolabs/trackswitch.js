import type { TrackRuntime } from "../domain/types";
import type { ParsedNumericCsv, TimeMappingSeries } from "../shared/alignment";
import { buildColumnTimeMapping } from "../shared/alignment";
import type { WarpingMatrixTrackSeries } from "../ui/view-renderer";

export interface TrackAlignmentConverter {
	referenceToTrack: TimeMappingSeries;
	trackToReference: TimeMappingSeries;
}

export type AlignmentReferenceAxisKey = "base" | "sync";

export interface AlignmentAxisContext {
	referenceTimeColumn: string;
	referenceDuration: number;
	converters: Map<number, TrackAlignmentConverter>;
}

interface AlignmentContextHost {
	alignmentContext: {
		baseAxis: AlignmentAxisContext | null;
		syncAxis: AlignmentAxisContext | null;
	} | null;
	resolveReferenceDuration(
		rows: ParsedNumericCsv["rows"],
		referenceTimeColumn: string,
	): number | string;
	getActiveAlignmentAxisKey(): AlignmentReferenceAxisKey;
}

export function buildAlignmentAxisContext(
	controller: Pick<AlignmentContextHost, "resolveReferenceDuration">,
	parsedCsv: ParsedNumericCsv,
	mappingByTrack: Map<number, string>,
	referenceTimeColumn: string,
): { axis: AlignmentAxisContext | null; error: string | null } {
	const referenceDuration = controller.resolveReferenceDuration(
		parsedCsv.rows,
		referenceTimeColumn,
	);
	if (typeof referenceDuration === "string") {
		return {
			axis: null,
			error: referenceDuration,
		};
	}

	const converters = new Map<number, TrackAlignmentConverter>();
	for (const [trackIndex, column] of mappingByTrack) {
		try {
			const referenceToTrack = buildColumnTimeMapping(
				parsedCsv.rows,
				referenceTimeColumn,
				column,
			);
			const trackToReference = buildColumnTimeMapping(
				parsedCsv.rows,
				column,
				referenceTimeColumn,
			);

			converters.set(trackIndex, {
				referenceToTrack,
				trackToReference,
			});
		} catch (error) {
			return {
				axis: null,
				error:
					error instanceof Error
						? error.message
						: "Failed to build alignment mappings.",
			};
		}
	}

	return {
		axis: {
			referenceTimeColumn,
			referenceDuration,
			converters,
		},
		error: null,
	};
}

export function getAlignmentAxisContext(
	controller: Pick<AlignmentContextHost, "alignmentContext">,
	axisKey: AlignmentReferenceAxisKey,
): AlignmentAxisContext | null {
	if (!controller.alignmentContext) {
		return null;
	}

	if (axisKey === "sync") {
		return controller.alignmentContext.syncAxis;
	}

	return controller.alignmentContext.baseAxis;
}

export function getActiveAlignmentAxisContext(
	controller: Pick<
		AlignmentContextHost,
		"alignmentContext" | "getActiveAlignmentAxisKey"
	>,
): AlignmentAxisContext | null {
	return getAlignmentAxisContext(
		controller,
		controller.getActiveAlignmentAxisKey(),
	);
}

export function buildWarpingSeries(
	runtime: TrackRuntime,
	trackIndex: number,
	columnKey: string,
	converter: TrackAlignmentConverter,
	referenceDuration: number,
): WarpingMatrixTrackSeries {
	const points = converter.referenceToTrack.points.map(
		(point: { x: number; y: number }) => {
			return {
				referenceTime: point.x,
				trackTime: point.y,
			};
		},
	);

	let trackDuration = runtime.baseSource.timing
		? runtime.baseSource.timing.effectiveDuration
		: runtime.baseSource.buffer
			? runtime.baseSource.buffer.duration
			: 0;
	let maxMappedTrackTime = Number.NEGATIVE_INFINITY;
	points.forEach((point: { trackTime: number }) => {
		if (
			Number.isFinite(point.trackTime) &&
			point.trackTime > maxMappedTrackTime
		) {
			maxMappedTrackTime = point.trackTime;
		}
	});

	const resolvedMappedDuration =
		Number.isFinite(maxMappedTrackTime) && maxMappedTrackTime > 0
			? maxMappedTrackTime
			: referenceDuration;
	if (!Number.isFinite(trackDuration) || trackDuration <= 0) {
		trackDuration = resolvedMappedDuration;
	} else {
		trackDuration = Math.max(trackDuration, resolvedMappedDuration);
	}

	return {
		trackIndex,
		columnKey,
		points,
		trackDuration,
	};
}
