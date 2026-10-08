import { parseCsvRecords } from "../shared/csv";
import { requestText } from "../shared/request-text";
import type {
	AlignmentConfig,
	DuplicateAnchorPolicy,
	MediaConfig,
	OutsideCoverageMode,
} from "../types";
import { createMarker, type Marker, markerSequenceId } from "./marker";
import {
	createIdentityProfile,
	type MediaProfile,
	nativeUnitForMediaEntry,
	resolveTimelineUnit,
	type Timeline,
	type TimelineExtent,
	type TimelineId,
	type TimelineUnit,
	timelineId,
} from "./timeline";

const ANCHOR_SEQUENCE_ID = markerSequenceId("$alignment");

/**
 * One correspondence of the relation `A_{p,q}`: markers on distinct timelines
 * that refer to the same musical position. Any two of its markers form a pair
 * `(m, m') ∈ A_{p,q}`, which makes both of them alignment anchors; a row that
 * names more than two timelines records those pairs at once.
 */
interface AlignmentAnchor {
	readonly id: string;
	readonly markers: ReadonlyMap<TimelineId, Marker>;
}

/** The pair `(m, m')` this anchor contributes to `A_{p,q}`, if it has one. */
function anchorPair(
	anchor: AlignmentAnchor,
	from: TimelineId,
	to: TimelineId,
): readonly [Marker, Marker] | null {
	const left = anchor.markers.get(from);
	const right = anchor.markers.get(to);
	return left && right ? [left, right] : null;
}

/**
 * The continuous mapping `f_{i,j}: T_i → T_j` derived from the anchors by
 * linear interpolation, plus the questions a caller has to ask before trusting
 * it: whether a path exists at all, and whether a position lies inside the span
 * the anchors actually annotate.
 */
export interface Projection {
	project(
		value: number,
		from: TimelineId,
		to: TimelineId,
		preferredValue?: number,
	): number;
	projectMarker(marker: Marker, to: TimelineId): number | null;
	canProject(from: TimelineId, to: TimelineId): boolean;
	/**
	 * The span of `from` over which a mapping to `to` is actually annotated, in
	 * `from` coordinates — null when there is no path. Outside it a projection
	 * is an assumption rather than data, which is what `outsideCoverage`
	 * arbitrates; under "extrapolate" the span is unbounded.
	 */
	coverage(from: TimelineId, to: TimelineId): TimelineExtent | null;
	/** Whether projecting `value` from `from` to `to` stays inside that span. */
	isCovered(from: TimelineId, to: TimelineId, value: number): boolean;
}

/**
 * An alignment ready to project with: the anchors it was built from, the
 * timelines they relate, and the mapping derived from them. Every local
 * timeline is related to the one reference timeline `T_r`, so a mapping between
 * two local timelines is obtained by composing through it.
 */
export interface Alignment {
	readonly referenceTimeline: TimelineId;
	readonly timelines: ReadonlyMap<TimelineId, Timeline>;
	/** Native unit, extent and unit conversions per timeline. */
	readonly profiles: ReadonlyMap<TimelineId, MediaProfile>;
	readonly outsideCoverage: OutsideCoverageMode;
	readonly anchors: readonly AlignmentAnchor[];
	readonly projection: Projection;
	readonly referenceExtent: TimelineExtent;
}

/**
 * The positions `A_{p,q}` pairs, in anchor order — the discrete points that
 * `f_{i,j}` interpolates between, and what a warping path or a measure map is
 * drawn from.
 */
export function anchorPositions(
	alignment: Alignment,
	from: TimelineId,
	to: TimelineId,
): Array<{ from: number; to: number }> {
	const pairs: Array<{ from: number; to: number }> = [];
	for (const anchor of alignment.anchors) {
		const pair = anchorPair(anchor, from, to);
		if (pair) {
			pairs.push({ from: pair[0].position, to: pair[1].position });
		}
	}
	return pairs;
}

// ═══════════ parsing ═══════════

interface CsvNumericRow {
	[column: string]: number;
}

export interface ParsedNumericCsv {
	headers: string[];
	rows: CsvNumericRow[];
}

export function parseNumericCsv(csvText: string): ParsedNumericCsv {
	const parsed = parseCsvRecords(csvText, {
		emptyDataError:
			"Alignment CSV must include a header and at least one data row.",
	});

	const rows: CsvNumericRow[] = [];

	for (const sourceRow of parsed.rows) {
		const row: CsvNumericRow = {};
		let validRow = true;

		for (const header of parsed.headers) {
			const parsedCell = Number(sourceRow?.[header]);
			if (!Number.isFinite(parsedCell)) {
				validRow = false;
				break;
			}
			row[header] = parsedCell;
		}

		if (validRow) {
			rows.push(row);
		}
	}

	if (rows.length === 0) {
		throw new Error("Alignment CSV does not contain valid numeric rows.");
	}

	return { headers: parsed.headers, rows };
}

/**
 * Reads the correspondence rows: one column per timeline, one anchor per row.
 * Positions are rewritten from their declared unit into the medium's native
 * coordinate, so the projection and everything downstream deal in native units
 * only.
 */
function parseAnchors(
	csvText: string,
	columns: Record<string, string>,
	units: ReadonlyMap<TimelineId, TimelineUnit>,
	profiles: ReadonlyMap<TimelineId, MediaProfile>,
): AlignmentAnchor[] {
	const parsed = parseCsvRecords(csvText, {
		emptyDataError:
			"The alignment must include a header and at least one data row.",
	});

	const columnEntries = Object.entries(columns).map(
		([timeline, column]) => [timelineId(timeline), column] as const,
	);
	for (const [timeline, column] of columnEntries) {
		if (!parsed.headers.includes(column)) {
			throw new Error(
				`The alignment is missing column "${column}" for timeline "${timeline}".`,
			);
		}
	}

	const toNative = (timeline: TimelineId, value: number): number => {
		const profile = profiles.get(timeline);
		const unit = units.get(timeline);
		return profile && unit !== undefined
			? profile.toNative(value, unit)
			: value;
	};

	return parsed.rows.map((row, rowIndex) => {
		const csvRow = rowIndex + 2;
		const id = `anchor:${rowIndex}`;
		const markers = new Map<TimelineId, Marker>();

		for (const [timeline, column] of columnEntries) {
			const raw = row[column];
			if (raw === undefined || raw === null || raw === "") {
				continue;
			}
			const value = typeof raw === "number" ? raw : Number(raw);
			if (!Number.isFinite(value)) {
				throw new Error(
					`The alignment has a non-numeric value "${raw}" in column "${column}" ` +
						`(timeline "${timeline}") at row ${csvRow}.`,
				);
			}
			markers.set(
				timeline,
				createMarker(
					`${id}:${timeline}`,
					ANCHOR_SEQUENCE_ID,
					timeline,
					toNative(timeline, value),
				),
			);
		}

		if (markers.size === 0) {
			throw new Error(
				`The alignment has no numeric value on any configured timeline at row ${csvRow}.`,
			);
		}

		return { id, markers };
	});
}

function validateAnchors(
	anchors: readonly AlignmentAnchor[],
	declaredTimelines: ReadonlySet<TimelineId>,
	referenceTimeline: TimelineId,
	duplicateAnchors: DuplicateAnchorPolicy,
): void {
	// Anchor positions are deliberately not required to be monotonic: a
	// performance that plays a repeat its counterpart skips revisits the same
	// span, so its column steps backwards at the repeat boundary.
	const seenPerTimeline = new Map<TimelineId, Set<number>>();

	anchors.forEach((anchor, rowIndex) => {
		const csvRow = rowIndex + 2;
		if (!anchor.markers.has(referenceTimeline)) {
			throw new Error(
				`The alignment has no position on the reference timeline "${referenceTimeline}" at row ${csvRow}.`,
			);
		}

		for (const [timeline, marker] of anchor.markers) {
			if (!declaredTimelines.has(timeline)) {
				throw new Error(
					`The alignment references timeline "${timeline}", which is not declared in media or alignment.timelines.`,
				);
			}
			if (duplicateAnchors !== "error") {
				continue;
			}
			let seenValues = seenPerTimeline.get(timeline);
			if (!seenValues) {
				seenValues = new Set();
				seenPerTimeline.set(timeline, seenValues);
			}
			if (seenValues.has(marker.position)) {
				throw new Error(
					`The alignment repeats the position ${marker.position} on timeline "${timeline}" at row ${csvRow}. ` +
						'Remove duplicateAnchors: "error" to keep the first of them ("first") or blend ' +
						'them ("average") instead of failing.',
				);
			}
			seenValues.add(marker.position);
		}
	});
}

// ═══════════ the mapping f_{i,j} ═══════════

interface MappingPoint {
	x: number;
	y: number;
}

/** A stretch of the correspondence path over which the source value never decreases. */
interface MappingRun {
	points: MappingPoint[];
}

interface MappingSeries {
	runs: MappingRun[];
	/** The annotated span on the source axis, across every run. */
	extent: { start: number; end: number };
	/**
	 * The earliest position at each end of the span, which the ends map to
	 * whatever the duplicate policy is. Where the source holds one value across
	 * several anchors, that value names the whole stretch, and arriving at it
	 * means arriving at its beginning — seeking to the last measure of a score
	 * reaches the moment that measure starts sounding, not the end of its decay.
	 */
	edgeValues: { start: number; end: number };
	duplicateAnchors: DuplicateAnchorPolicy;
}

/**
 * Splits the correspondence path into maximal stretches over which the source
 * value never decreases. A performance that plays a repeat its counterpart
 * skips walks the same span of the other timeline twice, so projecting *from*
 * that timeline has two answers — one run each — while projecting *to* it stays
 * a single run that steps backwards at the repeat boundary.
 */
function splitIntoRuns(points: MappingPoint[]): MappingRun[] {
	const runs: MappingRun[] = [];
	let current: MappingPoint[] = [points[0]];

	for (let index = 1; index < points.length; index += 1) {
		const point = points[index];
		if (point.x < current[current.length - 1].x) {
			runs.push({ points: current });
			current = [point];
			continue;
		}
		current.push(point);
	}

	runs.push({ points: current });
	return runs;
}

function createMappingSeries(
	points: MappingPoint[],
	duplicateAnchors: DuplicateAnchorPolicy,
): MappingSeries {
	const normalized = points.filter(
		(point) => Number.isFinite(point.x) && Number.isFinite(point.y),
	);

	if (normalized.length === 0) {
		throw new Error("A projection requires at least one finite anchor pair.");
	}

	const runs = splitIntoRuns(normalized);
	let start = Number.POSITIVE_INFINITY;
	let end = Number.NEGATIVE_INFINITY;
	for (const run of runs) {
		start = Math.min(start, run.points[0].x);
		end = Math.max(end, run.points[run.points.length - 1].x);
	}

	let startValue = Number.POSITIVE_INFINITY;
	let endValue = Number.POSITIVE_INFINITY;
	for (const point of normalized) {
		if (point.x === start) {
			startValue = Math.min(startValue, point.y);
		}
		if (point.x === end) {
			endValue = Math.min(endValue, point.y);
		}
	}

	return {
		runs,
		extent: { start, end },
		edgeValues: { start: startValue, end: endValue },
		duplicateAnchors,
	};
}

/** The y this run gives for a value known to lie inside its span. */
function mapWithinRun(
	run: MappingRun,
	value: number,
	duplicateAnchors: DuplicateAnchorPolicy,
	preferredValue?: number,
): number {
	const points = run.points;
	// The first index whose x reaches `value`, so an exact hit lands on the
	// earliest of any points sharing that x — what "first" selects.
	const rightIndex = firstIndexGreaterOrEqual(points, value);
	const right = points[rightIndex];

	if (right.x === value) {
		if (Number.isFinite(preferredValue)) {
			let closest = right.y;
			let closestDistance = Math.abs(right.y - (preferredValue as number));
			for (
				let index = rightIndex + 1;
				index < points.length && points[index].x === value;
				index += 1
			) {
				const distance = Math.abs(points[index].y - (preferredValue as number));
				if (distance < closestDistance) {
					closest = points[index].y;
					closestDistance = distance;
				}
			}
			return closest;
		}
		if (duplicateAnchors !== "average") {
			return right.y;
		}
		let total = 0;
		let count = 0;
		for (
			let index = rightIndex;
			index < points.length && points[index].x === value;
			index += 1
		) {
			total += points[index].y;
			count += 1;
		}
		return total / count;
	}

	if (rightIndex === 0) {
		return right.y;
	}

	return interpolate(points[rightIndex - 1], right, value);
}

function mapValue(
	series: MappingSeries,
	value: number,
	outsideCoverage: OutsideCoverageMode,
	preferredValue?: number,
): number {
	const runs = series.runs;
	if (runs.length === 0 || !Number.isFinite(value)) {
		return 0;
	}

	// The ends of the span answer with the first position there rather than the
	// middle of a held value, so arriving at a held value arrives at the start of
	// the stretch it names and playback runs through the rest of it.
	if (value === series.extent.start && !Number.isFinite(preferredValue)) {
		return series.edgeValues.start;
	}
	if (value === series.extent.end && !Number.isFinite(preferredValue)) {
		return series.edgeValues.end;
	}

	const candidates: number[] = [];
	for (const run of runs) {
		const points = run.points;
		if (value < points[0].x || value > points[points.length - 1].x) {
			continue;
		}
		candidates.push(
			mapWithinRun(run, value, series.duplicateAnchors, preferredValue),
		);
	}

	if (candidates.length === 1) {
		return candidates[0];
	}

	if (candidates.length > 1) {
		if (Number.isFinite(preferredValue)) {
			return candidates.reduce((closest, candidate) =>
				Math.abs(candidate - (preferredValue as number)) <
				Math.abs(closest - (preferredValue as number))
					? candidate
					: closest,
			);
		}
		if (series.duplicateAnchors !== "average") {
			// Runs are in CSV order, so the earliest one is "the first in the list".
			return candidates[0];
		}
		let total = 0;
		for (const candidate of candidates) {
			total += candidate;
		}
		return total / candidates.length;
	}

	const extent = series.extent;
	if (outsideCoverage === "error") {
		throw new Error(
			`Value ${value} is outside the mapped coverage [${extent.start}, ${extent.end}].`,
		);
	}

	const firstRun = runs[0].points;
	const lastRun = runs[runs.length - 1].points;

	if (value < extent.start) {
		return outsideCoverage === "hold"
			? firstRun[0].y
			: extrapolate(firstRun, 0, 1, value);
	}

	return outsideCoverage === "hold"
		? lastRun[lastRun.length - 1].y
		: extrapolate(lastRun, lastRun.length - 1, -1, value);
}

function firstIndexGreaterOrEqual(
	points: MappingPoint[],
	value: number,
): number {
	let low = 0;
	let high = points.length - 1;

	while (low < high) {
		const mid = Math.floor((low + high) / 2);
		if (points[mid].x < value) {
			low = mid + 1;
		} else {
			high = mid;
		}
	}

	return low;
}

/** Continues the line through the outermost pair of distinct anchors. */
function extrapolate(
	points: MappingPoint[],
	edgeIndex: number,
	direction: 1 | -1,
	value: number,
): number {
	const edge = points[edgeIndex];
	let index = edgeIndex + direction;

	while (index >= 0 && index < points.length) {
		const candidate = points[index];
		if (candidate.x !== edge.x) {
			return direction === 1
				? interpolate(edge, candidate, value)
				: interpolate(candidate, edge, value);
		}
		index += direction;
	}

	return edge.y;
}

function interpolate(a: MappingPoint, b: MappingPoint, x: number): number {
	const deltaX = b.x - a.x;
	if (deltaX === 0) {
		return (a.y + b.y) / 2;
	}

	return a.y + ((x - a.x) / deltaX) * (b.y - a.y);
}

// ═══════════ building the projection ═══════════

const EDGE_SEPARATOR = " ";

function edgeKey(from: TimelineId, to: TimelineId): string {
	return `${from}${EDGE_SEPARATOR}${to}`;
}

const UNBOUNDED: TimelineExtent = {
	start: Number.NEGATIVE_INFINITY,
	end: Number.POSITIVE_INFINITY,
};

function buildProjection(
	anchors: readonly AlignmentAnchor[],
	referenceTimeline: TimelineId,
	outsideCoverage: OutsideCoverageMode,
	duplicateAnchors: DuplicateAnchorPolicy,
): Projection {
	const edges = new Map<string, MappingSeries>();
	const pointsByEdge = new Map<string, MappingPoint[]>();

	for (const anchor of anchors) {
		const timelines = Array.from(anchor.markers.keys());
		for (const from of timelines) {
			for (const to of timelines) {
				if (from === to) {
					continue;
				}
				const pair = anchorPair(anchor, from, to);
				if (!pair) {
					continue;
				}
				const key = edgeKey(from, to);
				let points = pointsByEdge.get(key);
				if (!points) {
					points = [];
					pointsByEdge.set(key, points);
				}
				points.push({ x: pair[0].position, y: pair[1].position });
			}
		}
	}

	for (const [key, points] of pointsByEdge) {
		edges.set(key, createMappingSeries(points, duplicateAnchors));
	}

	function directProject(
		value: number,
		from: TimelineId,
		to: TimelineId,
		preferredValue?: number,
	): number | null {
		if (from === to) {
			return value;
		}
		const series = edges.get(edgeKey(from, to));
		return series
			? mapValue(series, value, outsideCoverage, preferredValue)
			: null;
	}

	function canProject(from: TimelineId, to: TimelineId): boolean {
		return (
			from === to ||
			edges.has(edgeKey(from, to)) ||
			(edges.has(edgeKey(from, referenceTimeline)) &&
				edges.has(edgeKey(referenceTimeline, to)))
		);
	}

	function project(
		value: number,
		from: TimelineId,
		to: TimelineId,
		preferredValue?: number,
	): number {
		const direct = directProject(value, from, to, preferredValue);
		if (direct !== null) {
			return direct;
		}

		// Composed through the reference timeline, which every local timeline is
		// related to.
		const viaReference = directProject(value, from, referenceTimeline);
		if (viaReference === null) {
			throw new Error(
				`No alignment path from timeline "${from}" to the reference timeline "${referenceTimeline}".`,
			);
		}

		const result = directProject(
			viaReference,
			referenceTimeline,
			to,
			preferredValue,
		);
		if (result === null) {
			throw new Error(
				`No alignment path from the reference timeline "${referenceTimeline}" to timeline "${to}".`,
			);
		}

		return result;
	}

	function edgeCoverage(
		from: TimelineId,
		to: TimelineId,
	): TimelineExtent | null {
		const series = edges.get(edgeKey(from, to));
		if (!series) {
			return null;
		}
		return outsideCoverage === "extrapolate"
			? UNBOUNDED
			: { start: series.extent.start, end: series.extent.end };
	}

	function coverage(from: TimelineId, to: TimelineId): TimelineExtent | null {
		if (from === to) {
			return UNBOUNDED;
		}
		return edgeCoverage(from, to) ?? edgeCoverage(from, referenceTimeline);
	}

	function isCovered(from: TimelineId, to: TimelineId, value: number): boolean {
		const span = coverage(from, to);
		if (!span || value < span.start || value > span.end) {
			return false;
		}
		if (from === to || edges.has(edgeKey(from, to))) {
			return true;
		}

		// Routed via the reference: the second hop has its own annotated span.
		const viaReference = directProject(value, from, referenceTimeline);
		if (viaReference === null) {
			return false;
		}
		const secondHop = edgeCoverage(referenceTimeline, to);
		return (
			!!secondHop &&
			viaReference >= secondHop.start &&
			viaReference <= secondHop.end
		);
	}

	function projectMarker(marker: Marker, to: TimelineId): number | null {
		if (marker.timeline === to) {
			return marker.position;
		}
		return canProject(marker.timeline, to)
			? project(marker.position, marker.timeline, to)
			: null;
	}

	return { project, projectMarker, canProject, coverage, isCovered };
}

/**
 * Widens a medium-backed extent to whatever the alignment actually anchors
 * beyond it — a score's last printed measure is 19, say, but an anchor lands
 * at 19.917, partway through it. The extent stays fractional; only a duration
 * *readout* rounds up to name a whole measure (see `formatTimelineValuePair`).
 * Kept fractional here because seeking and coverage checks both key off this
 * value, and rounding it up would let a seek land past what the alignment
 * actually covers.
 */
function widenExtentToAnchors(
	profileExtent: TimelineExtent,
	anchoredExtent: TimelineExtent | null,
): TimelineExtent {
	if (!anchoredExtent) {
		return profileExtent;
	}

	return {
		start: Math.min(profileExtent.start, anchoredExtent.start),
		end: Math.max(profileExtent.end, anchoredExtent.end),
	};
}

const NATIVE_BOUNDARY_SEQUENCE_ID = markerSequenceId(
	"$alignment-native-bounds",
);

/**
 * Two synthetic anchors, as if the CSV carried one extra row at the very
 * start and one at the very end, each column filled in with that medium's own
 * native boundary — every track keeps sounding to its own real end under
 * `extrapolate`, so the reference timeline should reach a real, interpolated
 * point there too, not the unbounded slope of whichever track's tempo happens
 * to run fastest right at the edge of the last real row (one synthetic take's
 * extrapolated slope alone pushed a shared bound to measure 24.5 against
 * every other take's ~20). A timeline with no probed profile — no media, or
 * media whose extent couldn't be read — sits out both rows, same as an
 * unpopulated column in a real CSV row.
 *
 * A "measures" native unit treats its printed numbering as labeling material
 * rather than bounding it, so neither end of `profile.extent` is the actual
 * boundary: the first printed measure names where its material *begins* (not
 * where the piece does), so the start row uses measure 0 instead, and
 * likewise the last printed measure names where its material begins rather
 * than where the piece finishes sounding, so the end row extends it by one.
 *
 * Returned as a `{start, end}` pair rather than a plain list because where
 * they go relative to the real rows matters: `splitIntoRuns` starts a new run
 * wherever a source value dips below the one before it, so the caller has to
 * put `start` before every real anchor and `end` after all of them. Appending
 * both after (the first cut of this) placed the start row's low x right after
 * the real rows' high one — a dip that split the real data into its own
 * short-lived run, which then fell out of coverage the moment a track passed
 * its last real anchor, leaving only the start-to-end straight line to
 * interpolate and producing a visible jump backward right at that boundary.
 */
function nativeBoundaryAnchors(
	timelines: readonly TimelineId[],
	profiles: ReadonlyMap<TimelineId, MediaProfile>,
): { start: AlignmentAnchor; end: AlignmentAnchor } {
	const startMarkers = new Map<TimelineId, Marker>();
	const endMarkers = new Map<TimelineId, Marker>();

	timelines.forEach((timeline) => {
		const profile = profiles.get(timeline);
		if (!profile) {
			return;
		}

		const start = profile.nativeUnit === "measures" ? 0 : profile.extent.start;
		const end =
			profile.nativeUnit === "measures"
				? profile.extent.end + 1
				: profile.extent.end;

		startMarkers.set(
			timeline,
			createMarker(
				`native-start:${timeline}`,
				NATIVE_BOUNDARY_SEQUENCE_ID,
				timeline,
				start,
			),
		);
		endMarkers.set(
			timeline,
			createMarker(
				`native-end:${timeline}`,
				NATIVE_BOUNDARY_SEQUENCE_ID,
				timeline,
				end,
			),
		);
	});

	return {
		start: { id: "$native-start", markers: startMarkers },
		end: { id: "$native-end", markers: endMarkers },
	};
}

/**
 * The playable reference extent. A medium-backed reference uses that medium's
 * native extent so trimming and padding affect the player duration. An abstract
 * reference falls back to the span its anchors cover.
 */
function anchorExtent(
	anchors: readonly AlignmentAnchor[],
	timeline: TimelineId,
): TimelineExtent | null {
	let start = Number.POSITIVE_INFINITY;
	let end = Number.NEGATIVE_INFINITY;

	for (const anchor of anchors) {
		const marker = anchor.markers.get(timeline);
		if (!marker) {
			continue;
		}
		start = Math.min(start, marker.position);
		end = Math.max(end, marker.position);
	}

	return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null;
}

export async function buildAlignment(
	config: AlignmentConfig,
	media: MediaConfig,
	profiles: ReadonlyMap<TimelineId, MediaProfile> = new Map(),
): Promise<Alignment> {
	const csvText = await requestText(config.src, "alignment CSV source");
	const timelineEntries = Object.entries(config.timelines);

	const columns: Record<string, string> = {};
	const units = new Map<TimelineId, TimelineUnit>();
	timelineEntries.forEach(([timeline, column]) => {
		columns[timeline] = column;
		units.set(timelineId(timeline), resolveTimelineUnit(media[timeline]));
	});

	// Normalization resolves these; an absent value means an unnormalized config.
	const { outsideCoverage, duplicateAnchors } = config;
	if (outsideCoverage === undefined || duplicateAnchors === undefined) {
		throw new Error(
			"Internal error: alignment.outsideCoverage/duplicateAnchors reached the player unresolved.",
		);
	}

	const referenceTimeline = timelineId(config.referenceTimeline);
	const orderedTimelines = timelineEntries.map(([timeline]) =>
		timelineId(timeline),
	);

	const anchors = parseAnchors(csvText, columns, units, profiles);
	validateAnchors(
		anchors,
		new Set(orderedTimelines),
		referenceTimeline,
		duplicateAnchors,
	);

	// Under `extrapolate`, project as if the CSV carried one extra row at each
	// medium's own native start and one at its native end — see
	// `nativeBoundaryAnchors`. Kept out of the anchors an alignment actually
	// exposes (warping matrices, anchor markers) since nobody authored them.
	// Order matters here — see that function's doc comment.
	const anchorsForProjection = (() => {
		if (outsideCoverage !== "extrapolate") {
			return anchors;
		}
		const { start, end } = nativeBoundaryAnchors(orderedTimelines, profiles);
		return [start, ...anchors, end];
	})();

	const projection = buildProjection(
		anchorsForProjection,
		referenceTimeline,
		outsideCoverage,
		duplicateAnchors,
	);

	const referenceProfile = profiles.get(referenceTimeline);
	const referenceExtent = referenceProfile
		? widenExtentToAnchors(
				referenceProfile.extent,
				anchorExtent(anchorsForProjection, referenceTimeline),
			)
		: anchorExtent(anchorsForProjection, referenceTimeline);
	if (!referenceExtent) {
		throw new Error(
			`The alignment has no position on the reference timeline "${referenceTimeline}".`,
		);
	}

	const resolvedProfiles = new Map<TimelineId, MediaProfile>();
	const timelines = new Map(
		orderedTimelines.map((timeline) => {
			const mediaEntry = media[timeline];
			const profile =
				profiles.get(timeline) ??
				createIdentityProfile(
					nativeUnitForMediaEntry(mediaEntry),
					anchorExtent(anchors, timeline) ?? { start: 0, end: 0 },
				);
			resolvedProfiles.set(timeline, profile);
			return [
				timeline,
				{
					id: timeline,
					unit: units.get(timeline) ?? "seconds",
					media: mediaEntry ? timeline : undefined,
				} satisfies Timeline,
			] as const;
		}),
	);

	return {
		referenceTimeline,
		timelines,
		profiles: resolvedProfiles,
		outsideCoverage,
		anchors,
		projection,
		referenceExtent: { ...referenceExtent },
	};
}
