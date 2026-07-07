import { Midi } from "@tonejs/midi";
import type { WaveformPlaybackFollowMode } from "../domain/types";
import { sanitizeInlineStyle } from "../shared/dom";
import { formatSecondsToHHMMSSmmm } from "../shared/format";
import { clampPercent } from "../shared/math";
import {
	clampTimelineValue,
	getTimelineMaximumZoom,
	getTimelineSurfaceWidth,
	getTimelineViewportState,
	MIN_TIMELINE_ZOOM,
	reflowTimelineSurface,
	resolveTimelineBaseWidth,
	resolveTimelinePlaybackFollowScrollLeft,
	sanitizeTimelineDuration,
	setTimelineZoomForSurface,
	updateTimelineMinimapViewport,
} from "./timeline-surface";

const MIN_MIDI_ZOOM = MIN_TIMELINE_ZOOM;
const MIDI_RANGE_PADDING = 2;
const MIN_MIDI_NOTE_WIDTH = 36;

interface MidiNoteEvent {
	midi: number;
	time: number;
	duration: number;
	name: string;
	velocity: number;
}

export interface MidiSeekSurfaceMetadata {
	wrapper: HTMLElement;
	scrollContainer: HTMLElement;
	surface: HTMLElement;
	noteLayer: HTMLElement;
	overlay: HTMLElement;
	seekWrap: HTMLElement;
	source: string;
	alignmentColumn: string | null;
	playbackFollowMode: WaveformPlaybackFollowMode;
	originalHeight: number;
	maxZoomSeconds: number;
	baseWidth: number;
	zoom: number;
	timingNode: HTMLElement | null;
	zoomNode: HTMLElement;
	zoomMinimapNode: HTMLElement;
	zoomCanvas: HTMLCanvasElement;
	zoomViewportNode: HTMLElement;
	notes: MidiNoteEvent[];
	minMidi: number;
	maxMidi: number;
	midiDurationSeconds: number;
	lastRenderKey: string | null;
	lastMinimapKey: string | null;
}

export interface MidiTimelineContext {
	duration: number;
	toReferenceTime(timelineTime: number): number;
	fromReferenceTime(referenceTime: number): number;
}

export type MidiTimelineContextResolver = (
	surface: MidiSeekSurfaceMetadata,
) => MidiTimelineContext | null;

function clampTime(value: number, minimum: number, maximum: number): number {
	return clampTimelineValue(value, minimum, maximum);
}

function sanitizeDuration(value: number): number {
	return sanitizeTimelineDuration(value);
}

function parseMidiPlaybackFollowMode(
	value: string | null,
): WaveformPlaybackFollowMode {
	const normalized =
		typeof value === "string" ? value.trim().toLowerCase() : "";

	if (normalized === "center" || normalized === "jump") {
		return normalized;
	}

	return "off";
}

function parseMidiBoolean(value: string | null): boolean {
	return typeof value === "string" && value.trim().toLowerCase() === "true";
}

function parsePositiveFiniteNumber(
	value: string | null,
	fallback: number,
): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}

	return parsed;
}

function buildSeekWrap(leftPercent: number, rightPercent: number): string {
	return (
		'<div class="seekwrap" style="left: ' +
		leftPercent +
		"%; right: " +
		rightPercent +
		'%;">' +
		'<div class="loop-region"></div>' +
		'<div class="loop-marker marker-a"></div>' +
		'<div class="loop-marker marker-b"></div>' +
		'<div class="seekhead"></div>' +
		"</div>"
	);
}

function getMidiSurfaceWidth(surface: MidiSeekSurfaceMetadata): number {
	return getTimelineSurfaceWidth(surface);
}

function getMidiMaximumZoom(
	surface: MidiSeekSurfaceMetadata,
	durationSeconds: number,
): number {
	return getTimelineMaximumZoom(durationSeconds, surface.maxZoomSeconds);
}

function getMidiViewportState(surface: MidiSeekSurfaceMetadata): {
	startRatio: number;
	widthRatio: number;
} {
	return getTimelineViewportState(surface);
}

function updateMidiMinimapViewport(surface: MidiSeekSurfaceMetadata): void {
	updateTimelineMinimapViewport(surface);
}

function resizeCanvasForCssSize(
	canvas: HTMLCanvasElement,
	width: number,
	height: number,
): CanvasRenderingContext2D | null {
	const ratio = Math.max(1, window.devicePixelRatio || 1);
	const pixelWidth = Math.max(1, Math.round(width * ratio));
	const pixelHeight = Math.max(1, Math.round(height * ratio));
	if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
		canvas.width = pixelWidth;
		canvas.height = pixelHeight;
	}
	canvas.style.width = `${Math.max(1, Math.round(width))}px`;
	canvas.style.height = `${Math.max(1, Math.round(height))}px`;

	const context = canvas.getContext("2d");
	if (!context) {
		return null;
	}

	context.setTransform(ratio, 0, 0, ratio, 0, 0);
	context.clearRect(0, 0, width, height);
	return context;
}

function setMidiSurfaceWidth(
	surface: MidiSeekSurfaceMetadata,
	width?: number,
): void {
	const surfaceWidth = width ?? getMidiSurfaceWidth(surface);
	surface.surface.style.width = `${surfaceWidth}px`;
	surface.surface.style.height = `${surface.originalHeight}px`;
	surface.noteLayer.style.height = `${surface.originalHeight}px`;
	updateMidiMinimapViewport(surface);
}

function setMidiZoomForSurface(
	surface: MidiSeekSurfaceMetadata,
	zoom: number,
	maximum: number,
	anchorPageX?: number,
): boolean {
	return setTimelineZoomForSurface(
		surface,
		zoom,
		maximum,
		anchorPageX,
		setMidiSurfaceWidth,
	);
}

function createMidiTimingNode(overlay: HTMLElement): HTMLElement {
	const timing = document.createElement("div");
	timing.className = "midi-timing";
	timing.textContent = "--:--:--:--- / --:--:--:---";
	overlay.appendChild(timing);
	return timing;
}

function createMidiZoomNode(overlay: HTMLElement): HTMLElement {
	const zoom = document.createElement("div");
	zoom.className = "midi-zoom";
	zoom.innerHTML =
		'<span class="midi-zoom-label">Zoom</span>' +
		'<div class="midi-zoom-minimap">' +
		'<canvas class="midi-zoom-canvas"></canvas>' +
		'<div class="midi-zoom-viewport"></div>' +
		"</div>";
	zoom.style.display = "none";
	overlay.appendChild(zoom);
	return zoom;
}

function flattenMidiNotes(midi: Midi, source: string): MidiNoteEvent[] {
	const notes: MidiNoteEvent[] = [];
	for (const track of midi.tracks) {
		for (const note of track.notes) {
			notes.push({
				midi: note.midi,
				time: note.time,
				duration: note.duration,
				name: note.name,
				velocity: note.velocity,
			});
		}
	}

	if (notes.length === 0) {
		throw new Error(`MIDI file contains no note events: ${source}`);
	}

	notes.sort((a, b) => a.time - b.time || a.midi - b.midi);
	return notes;
}

function applyMidiNotes(
	surface: MidiSeekSurfaceMetadata,
	notes: MidiNoteEvent[],
): void {
	let minMidi = Number.POSITIVE_INFINITY;
	let maxMidi = Number.NEGATIVE_INFINITY;
	let durationSeconds = 0;
	for (const note of notes) {
		minMidi = Math.min(minMidi, note.midi);
		maxMidi = Math.max(maxMidi, note.midi);
		durationSeconds = Math.max(durationSeconds, note.time + note.duration);
	}

	surface.notes = notes;
	surface.minMidi = Math.floor(minMidi) - MIDI_RANGE_PADDING;
	surface.maxMidi = Math.ceil(maxMidi) + MIDI_RANGE_PADDING;
	surface.midiDurationSeconds = durationSeconds;
	surface.lastRenderKey = null;
	surface.lastMinimapKey = null;
}

function renderMidiMinimap(
	surface: MidiSeekSurfaceMetadata,
	durationSeconds: number,
): void {
	const width = Math.max(1, surface.zoomMinimapNode.clientWidth);
	const height = Math.max(1, surface.zoomMinimapNode.clientHeight);
	const drawKey = [
		Math.round(width),
		Math.round(height),
		Math.round(durationSeconds * 1000),
		surface.notes.length,
		surface.minMidi,
		surface.maxMidi,
		Math.max(1, window.devicePixelRatio || 1),
	].join("#");
	if (surface.lastMinimapKey === drawKey) {
		updateMidiMinimapViewport(surface);
		return;
	}

	const context = resizeCanvasForCssSize(surface.zoomCanvas, width, height);
	if (!context) {
		return;
	}

	const safeDuration = sanitizeDuration(durationSeconds);
	context.fillStyle = getComputedStyle(surface.zoomCanvas)
		.getPropertyValue("--midi-note-color")
		.trim();
	const range = Math.max(1, surface.maxMidi - surface.minMidi + 1);
	for (const note of surface.notes) {
		if (safeDuration <= 0) {
			continue;
		}

		const x = (note.time / safeDuration) * width;
		const w = Math.max(1, (note.duration / safeDuration) * width);
		const y = ((surface.maxMidi - note.midi) / range) * height;
		const h = Math.max(1, height / range);
		context.globalAlpha = 0.35 + clampTime(note.velocity, 0, 1) * 0.55;
		context.fillRect(x, y, w, h);
	}
	context.globalAlpha = 1;
	surface.lastMinimapKey = drawKey;
	updateMidiMinimapViewport(surface);
}

function renderMidiNotes(
	surface: MidiSeekSurfaceMetadata,
	durationSeconds: number,
): void {
	const surfaceWidth = getMidiSurfaceWidth(surface);
	const height = surface.originalHeight;
	const safeDuration = sanitizeDuration(durationSeconds);
	const renderKey = [
		surfaceWidth,
		height,
		Math.round(safeDuration * 1000),
		surface.notes.length,
		surface.minMidi,
		surface.maxMidi,
	].join("#");
	if (surface.lastRenderKey === renderKey) {
		return;
	}

	surface.noteLayer.replaceChildren();
	const range = Math.max(1, surface.maxMidi - surface.minMidi + 1);
	const rowHeight = height / range;
	for (const note of surface.notes) {
		if (safeDuration <= 0) {
			continue;
		}

		const left = (note.time / safeDuration) * surfaceWidth;
		const width = Math.max(
			MIN_MIDI_NOTE_WIDTH,
			(note.duration / safeDuration) * surfaceWidth,
		);
		const top = (surface.maxMidi - note.midi) * rowHeight;
		const noteElement = document.createElement("div");
		noteElement.className = "midi-note";
		noteElement.style.left = `${left}px`;
		noteElement.style.top = `${top + 1}px`;
		noteElement.style.width = `${width}px`;
		noteElement.style.height = `${Math.max(3, rowHeight - 2)}px`;
		noteElement.style.setProperty(
			"--ts-midi-note-velocity",
			String(clampTime(note.velocity, 0, 1)),
		);

		const label = document.createElement("span");
		label.className = "midi-note-label";
		label.textContent = note.name;
		noteElement.appendChild(label);

		const velocity = document.createElement("span");
		velocity.className = "midi-note-velocity";
		noteElement.appendChild(velocity);

		surface.noteLayer.appendChild(noteElement);
	}
	surface.lastRenderKey = renderKey;
}

function resolvePlaybackFollowScrollLeft(
	surface: MidiSeekSurfaceMetadata,
	playheadRatio: number,
): number | null {
	return resolveTimelinePlaybackFollowScrollLeft(surface, playheadRatio);
}

function resolveMidiTimelineDuration(
	surface: MidiSeekSurfaceMetadata,
	playerDuration: number,
	useMidiLocalTimeline: boolean,
): number {
	return useMidiLocalTimeline
		? sanitizeDuration(surface.midiDurationSeconds)
		: sanitizeDuration(playerDuration);
}

function resolveMidiTimelinePosition(
	surface: MidiSeekSurfaceMetadata,
	playerPosition: number,
	playerDuration: number,
	useMidiLocalTimeline: boolean,
): number {
	const duration = resolveMidiTimelineDuration(
		surface,
		playerDuration,
		useMidiLocalTimeline,
	);
	if (duration <= 0) {
		return 0;
	}

	return clampTime(playerPosition, 0, duration);
}

export function wrapMidiCanvases(ctx: any): any {
	return function (this: any) {
		this.midiSeekSurfaces.length = 0;

		const canvases = this.root.querySelectorAll("canvas.midi");
		canvases.forEach((canvasElement: Element) => {
			if (!(canvasElement instanceof HTMLCanvasElement)) {
				return;
			}

			if (canvasElement.closest(".midi-wrap")) {
				return;
			}

			const source = String(canvasElement.getAttribute("data-midi-src") || "");
			if (!source) {
				return;
			}

			const wrapper = document.createElement("div");
			wrapper.className = "midi-wrap ts-stack-section";
			wrapper.setAttribute(
				"style",
				sanitizeInlineStyle(canvasElement.getAttribute("data-midi-style")) +
					"; display: block;",
			);

			const scrollContainer = document.createElement("div");
			scrollContainer.className = "midi-scroll";

			const surface = document.createElement("div");
			surface.className = "midi-surface";

			const noteLayer = document.createElement("div");
			noteLayer.className = "midi-note-layer";

			const overlay = document.createElement("div");
			overlay.className = "midi-overlay";

			const parent = canvasElement.parentElement;
			if (!parent) {
				return;
			}

			parent.insertBefore(wrapper, canvasElement);
			wrapper.appendChild(scrollContainer);
			scrollContainer.appendChild(surface);
			surface.appendChild(noteLayer);
			surface.insertAdjacentHTML(
				"beforeend",
				buildSeekWrap(
					clampPercent(canvasElement.getAttribute("data-seek-margin-left")),
					clampPercent(canvasElement.getAttribute("data-seek-margin-right")),
				),
			);
			wrapper.appendChild(overlay);
			canvasElement.remove();

			const seekWrap = surface.querySelector(".seekwrap");
			if (!(seekWrap instanceof HTMLElement)) {
				return;
			}
			seekWrap.setAttribute("data-seek-surface", "midi");

			const originalHeight = Math.max(1, canvasElement.height);
			surface.style.height = `${originalHeight}px`;
			noteLayer.style.height = `${originalHeight}px`;

			const timingNode = parseMidiBoolean(
				canvasElement.getAttribute("data-midi-timer"),
			)
				? createMidiTimingNode(overlay)
				: null;
			const zoomNode = createMidiZoomNode(overlay);
			const zoomMinimapNode = zoomNode.querySelector(".midi-zoom-minimap");
			const zoomCanvas = zoomNode.querySelector(".midi-zoom-canvas");
			const zoomViewportNode = zoomNode.querySelector(".midi-zoom-viewport");
			if (
				!(zoomMinimapNode instanceof HTMLElement) ||
				!(zoomCanvas instanceof HTMLCanvasElement) ||
				!(zoomViewportNode instanceof HTMLElement)
			) {
				return;
			}

			const metadata: MidiSeekSurfaceMetadata = {
				wrapper,
				scrollContainer,
				surface,
				noteLayer,
				overlay,
				seekWrap,
				source,
				alignmentColumn:
					canvasElement.getAttribute("data-midi-alignment-column")?.trim() ||
					null,
				playbackFollowMode: parseMidiPlaybackFollowMode(
					canvasElement.getAttribute("data-midi-playback-follow-mode"),
				),
				originalHeight,
				maxZoomSeconds: parsePositiveFiniteNumber(
					canvasElement.getAttribute("data-midi-max-zoom"),
					5,
				),
				baseWidth: this.resolveMidiBaseWidth(
					scrollContainer,
					canvasElement.width,
				),
				zoom: MIN_MIDI_ZOOM,
				timingNode,
				zoomNode,
				zoomMinimapNode,
				zoomCanvas,
				zoomViewportNode,
				notes: [],
				minMidi: 0,
				maxMidi: 0,
				midiDurationSeconds: 0,
				lastRenderKey: null,
				lastMinimapKey: null,
			};
			this.midiSeekSurfaces.push(metadata);

			scrollContainer.addEventListener(
				"scroll",
				() => {
					updateMidiMinimapViewport(metadata);
				},
				{ passive: true },
			);
		});
	}.call(ctx);
}

export function resolveMidiBaseWidth(
	ctx: any,
	scrollContainer: HTMLElement,
	fallback: number,
): number {
	return function (this: any, scrollContainer: HTMLElement, fallback: number) {
		return resolveTimelineBaseWidth(scrollContainer, fallback);
	}.call(ctx, scrollContainer, fallback);
}

export function reflowMidiDisplays(ctx: any): any {
	return function (this: any) {
		this.midiSeekSurfaces.forEach((surface: MidiSeekSurfaceMetadata) => {
			reflowTimelineSurface(surface, setMidiSurfaceWidth);
		});
	}.call(ctx);
}

export async function initializeMidiDisplays(
	ctx: any,
	timelineDuration: number,
	useMidiLocalTimeline = false,
): Promise<void> {
	const surfaces = ctx.midiSeekSurfaces as MidiSeekSurfaceMetadata[];
	if (surfaces.length === 0) {
		return;
	}

	await Promise.all(
		surfaces.map(async (surface) => {
			surface.wrapper.classList.add("midi-loading");
			const midi = await Midi.fromUrl(surface.source);
			applyMidiNotes(surface, flattenMidiNotes(midi, surface.source));
			surface.wrapper.classList.remove("midi-loading");
		}),
	);
	ctx.renderMidiDisplays(timelineDuration, useMidiLocalTimeline);
}

export function renderMidiDisplays(
	ctx: any,
	timelineDuration: number,
	useMidiLocalTimeline = false,
): any {
	return function (
		this: any,
		timelineDuration: number,
		useMidiLocalTimeline: boolean,
	) {
		if (this.midiSeekSurfaces.length === 0) {
			return;
		}

		this.reflowMidiDisplays();
		this.midiSeekSurfaces.forEach((surface: MidiSeekSurfaceMetadata) => {
			const surfaceDuration = resolveMidiTimelineDuration(
				surface,
				timelineDuration,
				useMidiLocalTimeline,
			);
			setMidiZoomForSurface(
				surface,
				surface.zoom,
				getMidiMaximumZoom(surface, surfaceDuration),
			);
			renderMidiNotes(surface, surfaceDuration);
			renderMidiMinimap(surface, surfaceDuration);
		});
		this.updateMidiZoomIndicators();
	}.call(ctx, timelineDuration, useMidiLocalTimeline);
}

export function updateMidiPlaybackState(
	ctx: any,
	state: {
		position: number;
		longestDuration: number;
		loop?: { pointA: number | null; pointB: number | null; enabled: boolean };
	},
	suppressPlaybackFollow: boolean,
	useMidiLocalTimeline = false,
	timelineContextResolver?: MidiTimelineContextResolver,
): any {
	return function (
		this: any,
		state: {
			position: number;
			longestDuration: number;
			loop?: { pointA: number | null; pointB: number | null; enabled: boolean };
		},
		suppressPlaybackFollow: boolean,
		useMidiLocalTimeline: boolean,
		timelineContextResolver?: MidiTimelineContextResolver,
	) {
		this.midiSeekSurfaces.forEach((surface: MidiSeekSurfaceMetadata) => {
			const timelineContext = timelineContextResolver
				? timelineContextResolver(surface)
				: null;
			const safeDuration = timelineContext
				? sanitizeDuration(timelineContext.duration)
				: resolveMidiTimelineDuration(
						surface,
						state.longestDuration,
						useMidiLocalTimeline,
					);
			const position = timelineContext
				? clampTime(
						timelineContext.fromReferenceTime(state.position),
						0,
						safeDuration,
					)
				: resolveMidiTimelinePosition(
						surface,
						state.position,
						state.longestDuration,
						useMidiLocalTimeline,
					);
			const loopPointA =
				state.loop?.pointA === null || state.loop?.pointA === undefined
					? null
					: timelineContext
						? clampTime(
								timelineContext.fromReferenceTime(state.loop.pointA),
								0,
								safeDuration,
							)
						: clampTime(state.loop.pointA, 0, safeDuration);
			const loopPointB =
				state.loop?.pointB === null || state.loop?.pointB === undefined
					? null
					: timelineContext
						? clampTime(
								timelineContext.fromReferenceTime(state.loop.pointB),
								0,
								safeDuration,
							)
						: clampTime(state.loop.pointB, 0, safeDuration);
			this.updateSeekWrapVisuals(surface.seekWrap, position, safeDuration, {
				pointA: loopPointA,
				pointB: loopPointB,
				enabled: state.loop?.enabled === true,
			});

			if (surface.timingNode) {
				surface.timingNode.textContent =
					formatSecondsToHHMMSSmmm(position) +
					" / " +
					formatSecondsToHHMMSSmmm(safeDuration);
			}

			if (!suppressPlaybackFollow && safeDuration > 0) {
				const scrollLeft = resolvePlaybackFollowScrollLeft(
					surface,
					position / safeDuration,
				);
				if (Number.isFinite(scrollLeft)) {
					surface.scrollContainer.scrollLeft = scrollLeft as number;
					updateMidiMinimapViewport(surface);
				}
			}
		});
	}.call(
		ctx,
		state,
		suppressPlaybackFollow,
		useMidiLocalTimeline,
		timelineContextResolver,
	);
}

export function updateMidiZoomIndicators(ctx: any): any {
	return function (this: any) {
		this.midiSeekSurfaces.forEach((surface: MidiSeekSurfaceMetadata) => {
			if (surface.zoom <= MIN_MIDI_ZOOM + 0.000001) {
				surface.zoomNode.style.display = "none";
				return;
			}

			updateMidiMinimapViewport(surface);
			surface.zoomNode.style.display = "flex";
		});
	}.call(ctx);
}

export function findMidiSurface(ctx: any, seekWrap: HTMLElement | null): any {
	return function (this: any, seekWrap: HTMLElement | null) {
		if (!seekWrap) {
			return null;
		}

		for (const surface of this.midiSeekSurfaces as MidiSeekSurfaceMetadata[]) {
			if (surface.seekWrap === seekWrap) {
				return surface;
			}
		}

		return null;
	}.call(ctx, seekWrap);
}

export function getMidiZoom(ctx: any, seekWrap: HTMLElement): any {
	return function (this: any, seekWrap: HTMLElement) {
		const surface = this.findMidiSurface(seekWrap);
		return surface ? surface.zoom : null;
	}.call(ctx, seekWrap);
}

export function isMidiZoomEnabled(
	ctx: any,
	seekWrap: HTMLElement,
	durationSeconds: number,
): any {
	return function (this: any, seekWrap: HTMLElement, durationSeconds: number) {
		const surface = this.findMidiSurface(seekWrap);
		return surface
			? getMidiMaximumZoom(surface, durationSeconds) > MIN_MIDI_ZOOM
			: false;
	}.call(ctx, seekWrap, durationSeconds);
}

export function setMidiZoom(
	ctx: any,
	seekWrap: HTMLElement,
	zoom: number,
	durationSeconds: number,
	anchorPageX?: number,
): any {
	return function (
		this: any,
		seekWrap: HTMLElement,
		zoom: number,
		durationSeconds: number,
		anchorPageX?: number,
	) {
		const surface = this.findMidiSurface(seekWrap);
		if (!surface) {
			return false;
		}

		const changed = setMidiZoomForSurface(
			surface,
			zoom,
			getMidiMaximumZoom(surface, durationSeconds),
			anchorPageX,
		);
		if (changed) {
			this.renderMidiDisplays(durationSeconds, false);
		}
		return changed;
	}.call(ctx, seekWrap, zoom, durationSeconds, anchorPageX);
}

export function getMidiMinimapViewport(ctx: any, seekWrap: HTMLElement): any {
	return function (this: any, seekWrap: HTMLElement) {
		const surface = this.findMidiSurface(seekWrap);
		return surface ? getMidiViewportState(surface) : null;
	}.call(ctx, seekWrap);
}

export function setMidiMinimapViewportStart(
	ctx: any,
	seekWrap: HTMLElement,
	startRatio: number,
): any {
	return function (this: any, seekWrap: HTMLElement, startRatio: number) {
		const surface = this.findMidiSurface(seekWrap);
		if (!surface) {
			return false;
		}

		const viewportState = getMidiViewportState(surface);
		const surfaceWidth = getMidiSurfaceWidth(surface);
		const maxStartRatio = Math.max(0, 1 - viewportState.widthRatio);
		const nextStartRatio = clampTime(startRatio, 0, maxStartRatio);
		const nextScrollLeft = nextStartRatio * surfaceWidth;
		const maxScrollLeft = Math.max(
			0,
			surfaceWidth - surface.scrollContainer.clientWidth,
		);
		const clampedScrollLeft = clampTime(nextScrollLeft, 0, maxScrollLeft);
		if (
			Math.abs(clampedScrollLeft - surface.scrollContainer.scrollLeft) <
			0.000001
		) {
			updateMidiMinimapViewport(surface);
			return false;
		}

		surface.scrollContainer.scrollLeft = clampedScrollLeft;
		updateMidiMinimapViewport(surface);
		return true;
	}.call(ctx, seekWrap, startRatio);
}

export function destroyMidiDisplays(ctx: any): any {
	return function (this: any) {
		this.midiSeekSurfaces.length = 0;
	}.call(ctx);
}
