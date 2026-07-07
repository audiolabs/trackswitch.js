import type { AlignmentOutOfRangeMode } from "../domain/types";
import { parseCsvRecords } from "./csv";
import { requestText } from "./request-text";

export interface CsvNumericRow {
	[column: string]: number;
}

export interface ParsedNumericCsv {
	headers: string[];
	rows: CsvNumericRow[];
}

export interface TimeMappingPoint {
	x: number;
	y: number;
}

export interface TimeMappingSeries {
	points: TimeMappingPoint[];
}

export function loadNumericCsv(url: string): Promise<ParsedNumericCsv> {
	return requestText(url, "CSV source").then((text) => parseNumericCsv(text));
}

export function parseNumericCsv(csvText: string): ParsedNumericCsv {
	const parsed = parseCsvRecords(csvText, {
		emptyDataError:
			"Alignment CSV must include a header and at least one data row.",
	});

	const rows: CsvNumericRow[] = [];

	for (let lineIndex = 0; lineIndex < parsed.rows.length; lineIndex += 1) {
		const sourceRow = parsed.rows[lineIndex] || {};
		const row: CsvNumericRow = {};
		let validRow = true;

		for (let cellIndex = 0; cellIndex < parsed.headers.length; cellIndex += 1) {
			const header = parsed.headers[cellIndex];
			const parsedCell = Number(sourceRow[header]);
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

	return {
		headers: parsed.headers,
		rows: rows,
	};
}

export function createTimeMappingSeries(
	points: TimeMappingPoint[],
): TimeMappingSeries {
	if (!Array.isArray(points) || points.length === 0) {
		throw new Error("Time mapping series requires at least one point.");
	}

	const normalized = points
		.map((point) => ({
			x: Number(point.x),
			y: Number(point.y),
		}))
		.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

	if (normalized.length === 0) {
		throw new Error("Time mapping series requires finite numeric points.");
	}

	normalized.sort((a, b) => {
		if (a.x === b.x) {
			return a.y - b.y;
		}
		return a.x - b.x;
	});

	return {
		points: normalized,
	};
}

export function buildColumnTimeMapping(
	rows: CsvNumericRow[],
	fromColumn: string,
	toColumn: string,
): TimeMappingSeries {
	const points: TimeMappingPoint[] = [];

	rows.forEach((row) => {
		const x = Number(row[fromColumn]);
		const y = Number(row[toColumn]);
		if (!Number.isFinite(x) || !Number.isFinite(y)) {
			return;
		}

		points.push({ x: x, y: y });
	});

	if (points.length === 0) {
		throw new Error(
			"Alignment CSV does not contain valid mapping points for columns " +
				fromColumn +
				" -> " +
				toColumn +
				".",
		);
	}

	return createTimeMappingSeries(points);
}

export function resolveAlignmentOutOfRangeMode(
	mode: AlignmentOutOfRangeMode | undefined,
): AlignmentOutOfRangeMode {
	return mode === "linear" ? "linear" : "clamp";
}

export function mapTime(
	series: TimeMappingSeries,
	time: number,
	outOfRange: AlignmentOutOfRangeMode,
): number {
	const points = series.points;
	if (points.length === 0 || !Number.isFinite(time)) {
		return 0;
	}

	if (points.length === 1) {
		return points[0].y;
	}

	const first = points[0];
	const last = points[points.length - 1];

	if (time <= first.x) {
		if (outOfRange === "clamp") {
			return first.y;
		}
		return extrapolateFromStart(points, time);
	}

	if (time >= last.x) {
		if (outOfRange === "clamp") {
			return last.y;
		}
		return extrapolateFromEnd(points, time);
	}

	const rightIndex = firstIndexGreaterOrEqual(points, time);
	if (rightIndex <= 0) {
		return points[0].y;
	}

	if (points[rightIndex].x === time) {
		return averageExactMatch(points, rightIndex, time);
	}

	const left = points[rightIndex - 1];
	const right = points[rightIndex];

	return interpolate(left, right, time);
}

function firstIndexGreaterOrEqual(
	points: TimeMappingPoint[],
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

function averageExactMatch(
	points: TimeMappingPoint[],
	index: number,
	x: number,
): number {
	let start = index;
	let end = index;

	while (start > 0 && points[start - 1].x === x) {
		start -= 1;
	}

	while (end < points.length - 1 && points[end + 1].x === x) {
		end += 1;
	}

	let total = 0;
	let count = 0;

	for (let currentIndex = start; currentIndex <= end; currentIndex += 1) {
		total += points[currentIndex].y;
		count += 1;
	}

	return count > 0 ? total / count : points[index].y;
}

function extrapolateFromStart(
	points: TimeMappingPoint[],
	time: number,
): number {
	const first = points[0];
	const next = findDistinct(points, 0, 1);
	if (!next) {
		return first.y;
	}

	return interpolate(first, next, time);
}

function extrapolateFromEnd(points: TimeMappingPoint[], time: number): number {
	const last = points[points.length - 1];
	const previous = findDistinct(points, points.length - 1, -1);
	if (!previous) {
		return last.y;
	}

	return interpolate(previous, last, time);
}

function findDistinct(
	points: TimeMappingPoint[],
	startIndex: number,
	direction: 1 | -1,
): TimeMappingPoint | null {
	const anchor = points[startIndex];
	let index = startIndex + direction;

	while (index >= 0 && index < points.length) {
		const candidate = points[index];
		if (candidate.x !== anchor.x) {
			return candidate;
		}
		index += direction;
	}

	return null;
}

function interpolate(
	a: TimeMappingPoint,
	b: TimeMappingPoint,
	x: number,
): number {
	const deltaX = b.x - a.x;
	if (deltaX === 0) {
		return (a.y + b.y) / 2;
	}

	const t = (x - a.x) / deltaX;
	return a.y + t * (b.y - a.y);
}
