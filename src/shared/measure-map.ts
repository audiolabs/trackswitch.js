import type { CsvNumericRow } from "./alignment";

export interface MeasureMapPoint {
	start: number;
	measure: number;
}

export function buildMeasureMapFromColumns(
	rows: CsvNumericRow[],
	headers: string[],
	referenceTimeColumn: string,
	measureColumn: string,
): MeasureMapPoint[] {
	if (headers.indexOf(referenceTimeColumn) < 0) {
		throw new Error(
			"Alignment CSV is missing configured referenceTimeColumn: " +
				referenceTimeColumn,
		);
	}

	if (headers.indexOf(measureColumn) < 0) {
		throw new Error(
			`Alignment CSV is missing configured measureColumn: ${measureColumn}`,
		);
	}

	const points: MeasureMapPoint[] = [];

	for (let lineIndex = 0; lineIndex < rows.length; lineIndex += 1) {
		const sourceRow = rows[lineIndex] || {};
		const start = Number(sourceRow[referenceTimeColumn]);
		const measure = Number(sourceRow[measureColumn]);
		if (!Number.isFinite(start) || !Number.isFinite(measure)) {
			continue;
		}

		points.push({
			start: start,
			measure: measure,
		});
	}

	if (points.length === 0) {
		throw new Error(
			"Alignment CSV does not contain valid measure-map rows for columns " +
				referenceTimeColumn +
				" -> " +
				measureColumn +
				".",
		);
	}

	points.sort((a, b) => {
		if (a.start === b.start) {
			return a.measure - b.measure;
		}
		return a.start - b.start;
	});

	return points;
}
