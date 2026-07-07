import { requestText } from "../../shared/request-text";
import type {
	SheetMusicMeasureMapsByAxis,
	SheetMusicProjectedTempoSegment,
	SheetMusicProjectedTempoSegmentsByAxis,
	SheetMusicTempoSegment,
} from "./types";

interface ParsedMusicXmlTempoMap {
	fallbackTempoBpm: number | null;
	measureSegments: SheetMusicTempoSegment[];
}

interface MeasureMapPointLike {
	start: number;
	measure: number;
}

export async function loadProjectedTempoMap(
	musicXmlUrl: string,
	measureMap: MeasureMapPointLike[] | null,
): Promise<{
	fallbackTempoBpm: number | null;
	projectedSegments: SheetMusicProjectedTempoSegment[];
}> {
	const { fallbackTempoBpm, projectedSegmentsByAxis } =
		await loadProjectedTempoMaps(musicXmlUrl, {
			base: measureMap,
			sync: null,
		});

	return {
		fallbackTempoBpm: fallbackTempoBpm,
		projectedSegments: projectedSegmentsByAxis.base || [],
	};
}

export async function loadProjectedTempoMaps(
	musicXmlUrl: string,
	measureMaps: SheetMusicMeasureMapsByAxis,
): Promise<{
	fallbackTempoBpm: number | null;
	projectedSegmentsByAxis: SheetMusicProjectedTempoSegmentsByAxis;
}> {
	const xmlText = await requestText(musicXmlUrl, "MusicXML source");
	const parsed = parseMusicXmlTempoMap(xmlText);

	return {
		fallbackTempoBpm: parsed.fallbackTempoBpm,
		projectedSegmentsByAxis: {
			base: measureMaps.base
				? projectTempoSegmentsToReferenceTime(
						parsed.measureSegments,
						measureMaps.base,
					)
				: null,
			sync: measureMaps.sync
				? projectTempoSegmentsToReferenceTime(
						parsed.measureSegments,
						measureMaps.sync,
					)
				: null,
		},
	};
}

function parseMusicXmlTempoMap(xmlText: string): ParsedMusicXmlTempoMap {
	const parser = new DOMParser();
	const documentNode = parser.parseFromString(xmlText, "application/xml");
	if (documentNode.querySelector("parsererror")) {
		throw new Error("Failed to parse MusicXML tempo map.");
	}

	const firstPart = documentNode.querySelector(
		"score-partwise > part, score-timewise > part",
	);
	if (!firstPart) {
		return {
			fallbackTempoBpm: null,
			measureSegments: [],
		};
	}

	const measureSegments: SheetMusicTempoSegment[] = [];
	let fallbackTempoBpm: number | null = null;

	firstPart.querySelectorAll("measure").forEach((measureElement) => {
		const measureNumber = parseMeasureNumber(
			measureElement.getAttribute("number"),
		);
		const bpm = extractMeasureTempoBpm(measureElement);
		if (bpm === null) {
			return;
		}

		if (fallbackTempoBpm === null) {
			fallbackTempoBpm = bpm;
		}

		if (measureNumber === null) {
			return;
		}

		const previous = measureSegments[measureSegments.length - 1];
		if (previous && previous.measure === measureNumber) {
			previous.bpm = bpm;
			return;
		}

		measureSegments.push({
			measure: measureNumber,
			bpm: bpm,
		});
	});

	return {
		fallbackTempoBpm: fallbackTempoBpm,
		measureSegments: measureSegments,
	};
}

function parseMeasureNumber(value: string | null): number | null {
	if (value === null) {
		return null;
	}

	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
}

function extractMeasureTempoBpm(measureElement: Element): number | null {
	const directionElements = Array.from(
		measureElement.querySelectorAll(":scope > direction"),
	);
	for (let index = 0; index < directionElements.length; index += 1) {
		const directionElement = directionElements[index];
		const metronomeBpm = parseBpmValue(
			directionElement.querySelector("direction-type > metronome > per-minute")
				?.textContent ?? null,
		);
		if (metronomeBpm !== null) {
			return metronomeBpm;
		}

		const soundBpm = parseBpmValue(
			directionElement.querySelector("sound")?.getAttribute("tempo") ?? null,
		);
		if (soundBpm !== null) {
			return soundBpm;
		}
	}

	return null;
}

function parseBpmValue(rawValue: string | null): number | null {
	if (typeof rawValue !== "string") {
		return null;
	}

	const match = rawValue.match(/-?\d+(?:\.\d+)?/);
	if (!match) {
		return null;
	}

	const numeric = Number(match[0]);
	if (!Number.isFinite(numeric) || numeric <= 0) {
		return null;
	}

	return numeric;
}

function projectTempoSegmentsToReferenceTime(
	measureSegments: SheetMusicTempoSegment[],
	measureMap: MeasureMapPointLike[] | null,
): SheetMusicProjectedTempoSegment[] {
	if (!measureMap || measureMap.length === 0) {
		return [];
	}

	const projectedSegments: SheetMusicProjectedTempoSegment[] = [];
	measureSegments.forEach((segment) => {
		const referenceStartTime = resolveReferenceStartForMeasure(
			measureMap,
			segment.measure,
		);
		if (!Number.isFinite(referenceStartTime)) {
			return;
		}

		const previous = projectedSegments[projectedSegments.length - 1];
		if (previous && previous.referenceStartTime === referenceStartTime) {
			previous.bpm = segment.bpm;
			return;
		}

		projectedSegments.push({
			referenceStartTime: referenceStartTime,
			bpm: segment.bpm,
		});
	});

	return projectedSegments;
}

function resolveReferenceStartForMeasure(
	measureMap: MeasureMapPointLike[],
	targetMeasure: number,
): number {
	let firstExactStart: number | null = null;
	let lastLowerStart: number | null = null;

	for (let index = 0; index < measureMap.length; index += 1) {
		const point = measureMap[index];
		const mappedMeasure = Math.floor(point.measure);

		if (mappedMeasure === Math.floor(targetMeasure)) {
			if (firstExactStart === null) {
				firstExactStart = point.start;
			}
			continue;
		}

		if (mappedMeasure < targetMeasure) {
			lastLowerStart = point.start;
		}
	}

	if (firstExactStart !== null) {
		return firstExactStart;
	}

	if (lastLowerStart !== null) {
		return lastLowerStart;
	}

	return measureMap[0].start;
}
