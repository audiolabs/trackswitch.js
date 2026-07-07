import type {
	TrackDefinitionAlignment,
	TrackSourceDefinition,
	TrackSwitchImageConfig,
	TrackSwitchMidiConfig,
	TrackSwitchPerTrackImageConfig,
	TrackSwitchSheetMusicConfig,
	TrackSwitchTextAlign,
	TrackSwitchTextConfig,
	TrackSwitchTrackGroupUiElement,
	TrackSwitchUiConfig,
	TrackSwitchUiElement,
	TrackSwitchWarpingMatrixConfig,
	TrackSwitchWaveformConfig,
	WaveformPlaybackFollowMode,
} from "../domain/types";
import { clampPercent } from "../shared/math";
import {
	normalizeWaveformSource,
	serializeWaveformSource,
} from "../shared/waveform-source";
import {
	assertAllowedKeys,
	normalizeOptionalBoolean,
	normalizePositiveFiniteNumber,
	normalizePositiveInteger,
	toConfigRecord,
} from "./validation";

const uiImageAllowedKeys = [
	"type",
	"src",
	"seekable",
	"style",
	"seekMarginLeft",
	"seekMarginRight",
] as const;
const uiPerTrackImageAllowedKeys = [
	"type",
	"seekable",
	"style",
	"seekMarginLeft",
	"seekMarginRight",
] as const;
const uiWaveformAllowedKeys = [
	"type",
	"height",
	"waveformBarWidth",
	"maxZoom",
	"waveformSource",
	"playbackFollowMode",
	"timer",
	"alignedPlayhead",
	"showAlignmentPoints",
	"style",
	"seekMarginLeft",
	"seekMarginRight",
] as const;
const uiMidiAllowedKeys = [
	"type",
	"src",
	"alignmentColumn",
	"height",
	"maxZoom",
	"playbackFollowMode",
	"timer",
	"style",
	"seekMarginLeft",
	"seekMarginRight",
] as const;
const uiTrackGroupAllowedKeys = ["type", "rowHeight", "trackGroup"] as const;
const uiSheetMusicAllowedKeys = [
	"type",
	"src",
	"measureColumn",
	"maxWidth",
	"maxHeight",
	"renderScale",
	"followPlayback",
	"style",
	"cursorColor",
	"cursorAlpha",
] as const;
const uiWarpingMatrixAllowedKeys = [
	"type",
	"style",
	"height",
	"tempoSmoothingSeconds",
	"bpm",
] as const;
const uiTextAllowedKeys = [
	"type",
	"text",
	"bold",
	"italic",
	"fontSize",
	"align",
	"style",
] as const;

const trackAllowedKeys = [
	"title",
	"solo",
	"volume",
	"pan",
	"image",
	"style",
	"presets",
	"sources",
	"alignment",
] as const;

const trackAlignmentAllowedKeys = ["column", "synchronizedSources"] as const;
const sourceAllowedKeys = [
	"src",
	"type",
	"startOffsetMs",
	"endOffsetMs",
] as const;

const uiAllowedKeysByType: Record<string, readonly string[]> = {
	image: uiImageAllowedKeys,
	perTrackImage: uiPerTrackImageAllowedKeys,
	waveform: uiWaveformAllowedKeys,
	midi: uiMidiAllowedKeys,
	trackGroup: uiTrackGroupAllowedKeys,
	sheetMusic: uiSheetMusicAllowedKeys,
	warpingMatrix: uiWarpingMatrixAllowedKeys,
	text: uiTextAllowedKeys,
};

function toMarginString(value: number | undefined): string {
	return String(clampPercent(value));
}

function toCanvasSize(value: number | undefined, fallback: number): number {
	if (!Number.isFinite(value) || !value) {
		return fallback;
	}

	return Math.max(1, Math.round(value));
}

function normalizeWaveformBarWidth(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
		return 1;
	}

	return Math.max(1, Math.floor(value));
}

function normalizeWaveformMaxZoom(value: unknown): number {
	if (value === undefined) {
		return 5;
	}

	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(
			"Invalid ui.waveform configuration: maxZoom must be a finite number of seconds.",
		);
	}

	if (value <= 0) {
		return 0;
	}

	return value;
}

function normalizeWaveformPlaybackFollowMode(
	value: unknown,
): WaveformPlaybackFollowMode {
	if (value === "center" || value === "jump") {
		return value;
	}

	return "off";
}

function validateSeekMargins(
	config: { seekMarginLeft?: number; seekMarginRight?: number },
	label: string,
): void {
	const left = clampPercent(config.seekMarginLeft);
	const right = clampPercent(config.seekMarginRight);

	if (left + right >= 100) {
		throw new Error(
			"Invalid " +
				label +
				" configuration: seekMarginLeft + seekMarginRight must be less than 100.",
		);
	}
}

function normalizeWaveformConfig<T extends TrackSwitchWaveformConfig>(
	waveform: T,
): T {
	const normalized = {
		...waveform,
		waveformBarWidth: normalizeWaveformBarWidth(waveform.waveformBarWidth),
		maxZoom: normalizeWaveformMaxZoom(waveform.maxZoom),
		waveformSource: normalizeWaveformSource(waveform.waveformSource),
		playbackFollowMode: normalizeWaveformPlaybackFollowMode(
			waveform.playbackFollowMode,
		),
		timer: normalizeOptionalBoolean(waveform.timer),
		alignedPlayhead: normalizeOptionalBoolean(waveform.alignedPlayhead),
		showAlignmentPoints: normalizeOptionalBoolean(waveform.showAlignmentPoints),
	};

	validateSeekMargins(normalized, "ui.waveform");
	return normalized;
}

function normalizeMidiConfig<T extends TrackSwitchMidiConfig>(midi: T): T {
	if (typeof midi.src !== "string" || midi.src.trim().length === 0) {
		throw new Error("Invalid ui.midi configuration: src must be a string.");
	}

	const normalized = {
		...midi,
		src: midi.src.trim(),
		alignmentColumn:
			typeof midi.alignmentColumn === "string" &&
			midi.alignmentColumn.trim().length > 0
				? midi.alignmentColumn.trim()
				: undefined,
		height: toCanvasSize(midi.height, 180),
		maxZoom: normalizeWaveformMaxZoom(midi.maxZoom),
		playbackFollowMode: normalizeWaveformPlaybackFollowMode(
			midi.playbackFollowMode,
		),
		timer: normalizeOptionalBoolean(midi.timer),
	};

	validateSeekMargins(normalized, "ui.midi");
	return normalized;
}

function normalizeCursorAlpha(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return 0.4;
	}

	if (value < 0) {
		return 0;
	}

	if (value > 1) {
		return 1;
	}

	return value;
}

function normalizeSheetMusicFollowPlayback(
	value: boolean | undefined,
): boolean {
	if (value === undefined) {
		return true;
	}

	return typeof value === "boolean" ? value : true;
}

function normalizeSheetMusicConfig<T extends TrackSwitchSheetMusicConfig>(
	sheetmusic: T,
): T {
	const normalizedMaxWidth = normalizePositiveInteger(sheetmusic.maxWidth);
	const measureColumn =
		typeof sheetmusic.measureColumn === "string"
			? sheetmusic.measureColumn.trim()
			: undefined;

	return {
		...sheetmusic,
		measureColumn:
			measureColumn && measureColumn.length > 0 ? measureColumn : undefined,
		maxWidth: normalizedMaxWidth ?? 1000,
		maxHeight: normalizePositiveInteger(sheetmusic.maxHeight) ?? 380,
		renderScale: normalizePositiveFiniteNumber(sheetmusic.renderScale) ?? 0.7,
		followPlayback: normalizeSheetMusicFollowPlayback(
			sheetmusic.followPlayback,
		),
		cursorAlpha: normalizeCursorAlpha(sheetmusic.cursorAlpha),
	};
}

function normalizeWarpingMatrixConfig<T extends TrackSwitchWarpingMatrixConfig>(
	warpingMatrix: T,
): T {
	const normalizedTempoSmoothingSeconds = normalizePositiveFiniteNumber(
		warpingMatrix.tempoSmoothingSeconds,
	);
	const normalizedBpm = normalizeWarpingMatrixBpm(warpingMatrix.bpm);

	return {
		...warpingMatrix,
		height: normalizePositiveInteger(warpingMatrix.height),
		tempoSmoothingSeconds: normalizedTempoSmoothingSeconds,
		bpm: normalizedBpm,
	};
}

function normalizeTextAlign(value: unknown): TrackSwitchTextAlign {
	if (value === "left" || value === "right") {
		return value;
	}

	return "center";
}

function normalizeTextBoolean(value: unknown): boolean | undefined {
	return normalizeOptionalBoolean(value as boolean | undefined);
}

function normalizeTextFontSize(value: unknown): number | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return undefined;
	}

	return Math.max(1, Math.round(value));
}

function normalizeTextConfig<T extends TrackSwitchTextConfig>(text: T): T {
	if (typeof text.text !== "string") {
		throw new Error("Invalid ui.text configuration: text must be a string.");
	}

	return {
		...text,
		bold: normalizeTextBoolean(text.bold),
		italic: normalizeTextBoolean(text.italic),
		fontSize: normalizeTextFontSize(text.fontSize),
		align: normalizeTextAlign(text.align),
	};
}

function normalizeWarpingMatrixBpm(
	value: TrackSwitchWarpingMatrixConfig["bpm"],
): TrackSwitchWarpingMatrixConfig["bpm"] {
	if (value === undefined) {
		return null;
	}

	if (value === null) {
		return null;
	}

	if (value === "infer_score") {
		return "infer_score";
	}

	if (typeof value === "number" && Number.isFinite(value) && value > 0) {
		return value;
	}

	return null;
}

function normalizeSourceConfig(
	source: TrackSourceDefinition,
): TrackSourceDefinition {
	const sourceRecord = toConfigRecord(source, "source");
	assertAllowedKeys(sourceRecord, sourceAllowedKeys, "source");
	return { ...source };
}

function normalizeTrackAlignmentConfig(
	alignment: TrackDefinitionAlignment | undefined,
): TrackDefinitionAlignment | undefined {
	if (!alignment) {
		return alignment;
	}

	const alignmentRecord = toConfigRecord(alignment, "track alignment");
	assertAllowedKeys(
		alignmentRecord,
		trackAlignmentAllowedKeys,
		"track alignment",
	);

	return {
		...alignment,
		synchronizedSources: Array.isArray(alignment.synchronizedSources)
			? alignment.synchronizedSources.map((source) =>
					normalizeSourceConfig(source),
				)
			: alignment.synchronizedSources,
	};
}

function normalizeTrackGroupConfig<T extends TrackSwitchTrackGroupUiElement>(
	group: T,
): T {
	const normalizedTracks = Array.isArray(group.trackGroup)
		? group.trackGroup.map((track) => {
				const trackRecord = toConfigRecord(track, "track");
				assertAllowedKeys(trackRecord, trackAllowedKeys, "track");

				return {
					...track,
					sources: Array.isArray(track.sources)
						? track.sources.map((source) => normalizeSourceConfig(source))
						: track.sources,
					alignment: normalizeTrackAlignmentConfig(track.alignment),
				};
			})
		: group.trackGroup;

	return {
		...group,
		rowHeight: normalizePositiveInteger(group.rowHeight),
		trackGroup: normalizedTracks,
	};
}

export function normalizeUiElement(
	element: TrackSwitchUiElement,
): TrackSwitchUiElement {
	const elementRecord = toConfigRecord(element, "ui element");
	const elementType = elementRecord.type;
	if (typeof elementType !== "string") {
		throw new Error("Invalid ui element type.");
	}

	const allowedElementKeys = uiAllowedKeysByType[elementType];
	if (!allowedElementKeys) {
		throw new Error(`Invalid ui element type: ${elementType}`);
	}
	assertAllowedKeys(elementRecord, allowedElementKeys, `ui.${elementType}`);

	if (element.type === "waveform") {
		return normalizeWaveformConfig(element);
	}

	if (element.type === "midi") {
		return normalizeMidiConfig(element);
	}

	if (element.type === "sheetMusic") {
		return normalizeSheetMusicConfig(element);
	}

	if (element.type === "warpingMatrix") {
		return normalizeWarpingMatrixConfig(element);
	}

	if (element.type === "text") {
		return normalizeTextConfig(element);
	}

	if (element.type === "trackGroup") {
		return normalizeTrackGroupConfig(element);
	}

	if (element.type === "image") {
		if (element.seekable) {
			validateSeekMargins(element, "ui.image");
		}
		return element;
	}

	if (element.type === "perTrackImage") {
		if (element.seekable) {
			validateSeekMargins(element, "ui.perTrackImage");
		}
		return element;
	}

	throw new Error(`Invalid ui element type: ${elementType}`);
}

function injectWarpingMatrix(
	root: HTMLElement,
	warpingMatrix: TrackSwitchWarpingMatrixConfig,
): void {
	const container = document.createElement("div");
	container.className = "warping-matrix";

	if (typeof warpingMatrix.style === "string") {
		container.setAttribute("data-warping-matrix-style", warpingMatrix.style);
	}

	if (warpingMatrix.height !== undefined) {
		container.setAttribute(
			"data-warping-matrix-height",
			String(warpingMatrix.height),
		);
	}

	if (warpingMatrix.tempoSmoothingSeconds !== undefined) {
		container.setAttribute(
			"data-warping-matrix-tempo-smoothing-seconds",
			String(warpingMatrix.tempoSmoothingSeconds),
		);
	}

	if (warpingMatrix.bpm !== null && warpingMatrix.bpm !== undefined) {
		container.setAttribute(
			"data-warping-matrix-bpm",
			String(warpingMatrix.bpm),
		);
	}

	root.appendChild(container);
}

function injectTrackGroup(root: HTMLElement, trackGroupIndex: number): void {
	const container = document.createElement("div");
	container.className = "track-group ts-stack-section";
	container.setAttribute("data-track-group-index", String(trackGroupIndex));
	root.appendChild(container);
}

function injectText(root: HTMLElement, text: TrackSwitchTextConfig): void {
	const container = document.createElement("div");
	container.className = "ts-text";
	container.textContent = text.text;
	container.setAttribute("data-ts-text-align", text.align || "center");

	if (text.bold === true) {
		container.setAttribute("data-ts-text-bold", "true");
	}

	if (text.italic === true) {
		container.setAttribute("data-ts-text-italic", "true");
	}

	if (text.fontSize !== undefined) {
		container.setAttribute("data-ts-text-font-size", String(text.fontSize));
	}

	if (typeof text.style === "string") {
		container.setAttribute("data-ts-text-style", text.style);
	}

	root.appendChild(container);
}

function injectImage(root: HTMLElement, image: TrackSwitchImageConfig): void {
	const imageElement = createImageElement(image);
	imageElement.src = image.src;
	root.appendChild(imageElement);
}

function injectPerTrackImage(
	root: HTMLElement,
	image: TrackSwitchPerTrackImageConfig,
): void {
	const imageElement = createImageElement(image);
	imageElement.classList.add("per-track-image");
	imageElement.setAttribute("data-per-track-image", "true");
	imageElement.style.display = "none";
	root.appendChild(imageElement);
}

function createImageElement(
	image: Pick<
		TrackSwitchImageConfig,
		"seekable" | "style" | "seekMarginLeft" | "seekMarginRight"
	>,
): HTMLImageElement {
	const imageElement = document.createElement("img");

	if (image.seekable) {
		imageElement.classList.add("seekable");
	}

	if (typeof image.style === "string") {
		imageElement.setAttribute("data-style", image.style);
	}

	if (typeof image.seekMarginLeft === "number") {
		imageElement.setAttribute(
			"data-seek-margin-left",
			toMarginString(image.seekMarginLeft),
		);
	}

	if (typeof image.seekMarginRight === "number") {
		imageElement.setAttribute(
			"data-seek-margin-right",
			toMarginString(image.seekMarginRight),
		);
	}

	return imageElement;
}

function injectWaveform(
	root: HTMLElement,
	waveform: TrackSwitchWaveformConfig,
): void {
	const canvas = document.createElement("canvas");
	canvas.className = "waveform";
	canvas.width = 1200;
	canvas.height = toCanvasSize(waveform.height, 150);
	canvas.setAttribute(
		"data-waveform-bar-width",
		String(waveform.waveformBarWidth),
	);
	canvas.setAttribute(
		"data-waveform-source",
		serializeWaveformSource(waveform.waveformSource),
	);
	canvas.setAttribute("data-waveform-max-zoom", String(waveform.maxZoom));
	canvas.setAttribute(
		"data-waveform-playback-follow-mode",
		waveform.playbackFollowMode || "off",
	);

	if (typeof waveform.timer === "boolean") {
		canvas.setAttribute("data-waveform-timer", String(waveform.timer));
	}

	if (typeof waveform.alignedPlayhead === "boolean") {
		canvas.setAttribute(
			"data-waveform-aligned-playhead",
			String(waveform.alignedPlayhead),
		);
	}

	if (typeof waveform.showAlignmentPoints === "boolean") {
		canvas.setAttribute(
			"data-waveform-show-alignment-points",
			String(waveform.showAlignmentPoints),
		);
	}

	if (typeof waveform.style === "string") {
		canvas.setAttribute("data-waveform-style", waveform.style);
	}

	if (typeof waveform.seekMarginLeft === "number") {
		canvas.setAttribute(
			"data-seek-margin-left",
			toMarginString(waveform.seekMarginLeft),
		);
	}

	if (typeof waveform.seekMarginRight === "number") {
		canvas.setAttribute(
			"data-seek-margin-right",
			toMarginString(waveform.seekMarginRight),
		);
	}

	root.appendChild(canvas);
}

function injectMidi(root: HTMLElement, midi: TrackSwitchMidiConfig): void {
	const canvas = document.createElement("canvas");
	canvas.className = "midi";
	canvas.width = 1200;
	canvas.height = toCanvasSize(midi.height, 180);
	canvas.setAttribute("data-midi-src", midi.src);
	canvas.setAttribute("data-midi-max-zoom", String(midi.maxZoom));
	canvas.setAttribute("data-midi-alignment-column", midi.alignmentColumn || "");
	canvas.setAttribute(
		"data-midi-playback-follow-mode",
		midi.playbackFollowMode || "off",
	);

	if (typeof midi.timer === "boolean") {
		canvas.setAttribute("data-midi-timer", String(midi.timer));
	}

	if (typeof midi.style === "string") {
		canvas.setAttribute("data-midi-style", midi.style);
	}

	if (typeof midi.seekMarginLeft === "number") {
		canvas.setAttribute(
			"data-seek-margin-left",
			toMarginString(midi.seekMarginLeft),
		);
	}

	if (typeof midi.seekMarginRight === "number") {
		canvas.setAttribute(
			"data-seek-margin-right",
			toMarginString(midi.seekMarginRight),
		);
	}

	root.appendChild(canvas);
}

function injectSheetMusic(
	root: HTMLElement,
	sheetmusic: TrackSwitchSheetMusicConfig,
): void {
	const container = document.createElement("div");
	container.className = "sheetmusic";
	container.setAttribute("data-sheetmusic-src", String(sheetmusic.src || ""));
	container.setAttribute(
		"data-sheetmusic-measure-column",
		String(sheetmusic.measureColumn || ""),
	);
	container.setAttribute(
		"data-sheetmusic-follow-playback",
		String(sheetmusic.followPlayback),
	);
	container.setAttribute(
		"data-sheetmusic-cursor-alpha",
		String(sheetmusic.cursorAlpha),
	);

	if (sheetmusic.maxWidth !== undefined) {
		container.setAttribute(
			"data-sheetmusic-max-width",
			String(sheetmusic.maxWidth),
		);
	}

	if (sheetmusic.maxHeight !== undefined) {
		container.setAttribute(
			"data-sheetmusic-max-height",
			String(sheetmusic.maxHeight),
		);
	}

	if (sheetmusic.renderScale !== undefined) {
		container.setAttribute(
			"data-sheetmusic-render-scale",
			String(sheetmusic.renderScale),
		);
	}

	if (typeof sheetmusic.style === "string") {
		container.setAttribute("data-sheetmusic-style", sheetmusic.style);
	}

	if (typeof sheetmusic.cursorColor === "string") {
		container.setAttribute(
			"data-sheetmusic-cursor-color",
			sheetmusic.cursorColor,
		);
	}

	root.appendChild(container);
}

export function injectConfiguredUiElements(
	root: HTMLElement,
	uiElements: TrackSwitchUiConfig | undefined,
): void {
	if (!uiElements) {
		return;
	}

	let trackGroupIndex = 0;
	uiElements.forEach((entry) => {
		if (entry.type === "trackGroup") {
			injectTrackGroup(root, trackGroupIndex);
			trackGroupIndex += 1;
			return;
		}

		if (entry.type === "image") {
			injectImage(root, entry);
			return;
		}

		if (entry.type === "text") {
			injectText(root, entry);
			return;
		}

		if (entry.type === "perTrackImage") {
			injectPerTrackImage(root, entry);
			return;
		}

		if (entry.type === "waveform") {
			injectWaveform(root, entry);
			return;
		}

		if (entry.type === "midi") {
			injectMidi(root, entry);
			return;
		}

		if (entry.type === "sheetMusic") {
			injectSheetMusic(root, entry);
			return;
		}

		if (entry.type === "warpingMatrix") {
			injectWarpingMatrix(root, entry);
			return;
		}

		throw new Error(
			`Invalid ui element type: ${String((entry as { type?: unknown }).type)}`,
		);
	});
}
