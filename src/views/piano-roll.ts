import { Midi } from "@tonejs/midi";
import { formatTimelineValue, type TimelineUnit } from "../model/timeline";
import { applyCssOverrides } from "../shared/dom";
import { clamp, sanitizeDuration } from "../shared/math";
import {
	formatMidiNoteName,
	isBlackKey,
	parseMidiNoteRef,
} from "../shared/midi-notes";
import type {
	MidiNoteRange,
	PianoRollLegendPosition,
	TrackRuntime,
	TrackSwitchPianoRollViewConfig,
	TrackSwitchUiState,
} from "../types";
import type {
	ConfiguredViewHost,
	TimelineReadout,
	ViewRenderer,
} from "./renderer";
import {
	applyTimelineFollowScrollLeft,
	buildSeekWrap,
	createTimelineTimingNode,
	createTimelineZoomNode,
	getTimelineMaximumZoom,
	getTimelineSurfaceWidth,
	getTimelineTimeWidth,
	getTimelineViewportState,
	MIN_TIMELINE_ZOOM,
	positionTileCanvas,
	reflowTimelineSurface,
	refreshTimelineViewportWidth,
	resizeCanvasForCssSize,
	resolveTimelineDefaultZoom,
	resolveTimelinePlaybackFollowScrollLeft,
	resolveVisibleTileWindow,
	setTimelineZoomForSurface,
	type TimelineFollowMode,
	type TimelineScrollAnimation,
	updateTimelineMinimapViewport,
	updateTimelineZoomIndicators,
} from "./surface";

const MIN_PIANO_ROLL_ZOOM = MIN_TIMELINE_ZOOM;
const PIANO_ROLL_RANGE_PADDING = 2;
const MIN_PIANO_ROLL_NOTE_WIDTH = 1;
/** Below this row height an outline would swallow the note body, so skip it. */
const PIANO_ROLL_NOTE_BORDER_MIN_HEIGHT = 4;
/** A velocity bar is only legible once the note rect is at least this large. */
const PIANO_ROLL_VELOCITY_BAR_MIN_HEIGHT = 8;
const PIANO_ROLL_VELOCITY_BAR_MIN_WIDTH = 6;
/** Below this a checkerboard cell reads as noise rather than as a pattern. */
const MIN_CHECKERBOARD_CELL = 6;
/**
 * Rounds the corners of a note event just enough that two notes meeting on one
 * row — a repeated pitch, a legato pair — pinch apart visibly, including at row
 * heights too small for the outline to be drawn.
 */
const PIANO_ROLL_NOTE_CORNER_RADIUS = 2;
/** Below this row height a tinted black-key row reads as a haze, not as a key. */
const PIANO_ROLL_PITCH_GRID_MIN_ROW_HEIGHT = 3;
/** The closest two time grid lines may come before the grid steps up a rung. */
const MIN_TIME_GRID_SPACING_PX = 80;
/** Round intervals of seconds, in the order a zooming grid steps through them. */
const SECOND_GRID_STEPS = [
	0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600,
];
/** A ticks grid is a musical one: fractions and multiples of a quarter note. */
const TICK_GRID_BEAT_FACTORS = [
	1 / 16,
	1 / 8,
	1 / 4,
	1 / 2,
	1,
	2,
	4,
	8,
	16,
	32,
	64,
	128,
];
/** A runaway readout must not be able to spin the grid loop forever. */
const MAX_TIME_GRID_LINES = 4096;
/** The window a keyboard roll opens on when the view names no `defaultZoom`. */
const DEFAULT_PIANO_KEYBOARD_ZOOM_SECONDS = 10;
/** Falls back to the stylesheet's own default if the custom property can't be read. */
const DEFAULT_PIANO_ROLL_KEYBOARD_WIDTH = 64;

/** How many channel colours the stylesheet declares, cycled past the last one. */
const PIANO_ROLL_CHANNEL_PALETTE_SIZE = 16;

/** The reference lines a roll draws behind its notes; see the `grid` option. */
type PianoRollGridMode = "none" | "time" | "pitch" | "both";

interface MidiNoteEvent {
	midi: number;
	time: number;
	duration: number;
	name: string;
	velocity: number;
	channel: number;
}

interface PianoRollNoteColors {
	fill: string;
	border: string;
	velocity: string;
	/** Contrast colour for a velocity bar drawn on a solid note body. */
	velocityBar: string;
}

interface PianoRollGridColors {
	/** A vertical line of the time grid. */
	time: string;
	/** The line closing the drawing where the file ends. */
	end: string;
	/** The washes over the rows of a white and of a black key. */
	rowWhite: string;
	rowBlack: string;
}

export interface PianoRollSeekSurfaceMetadata {
	wrapper: HTMLElement;
	scrollContainer: HTMLElement;
	surface: HTMLElement;
	noteCanvas: HTMLCanvasElement;
	overlay: HTMLElement;
	seekWrap: HTMLElement;
	source: string;
	alignmentColumn: string | null;
	/** The media entry this roll draws, which is also its timeline id. */
	mediaId: string;
	/**
	 * `pinnedLeft` whenever `pianoKeyboard` is on — forced, not the configured
	 * `playbackFollowMode`, which a keyboard column overrides entirely; see
	 * `TimelineFollowMode`.
	 */
	playbackFollowMode: TimelineFollowMode;
	trailingPadPx: number;
	originalHeight: number;
	/** The configured `height`, immutable — the base a fullscreen grow restores to. */
	configuredHeight: number;
	/** `maxZoom` and `defaultZoom` as configured, in the unit of this view's medium. */
	maxZoomValue: number;
	defaultZoomValue: number | null;
	/** The same two in seconds, resolved once the timeline readouts are known. */
	maxZoomSeconds: number;
	defaultZoomSeconds: number | null;
	zoomUnitsResolved: boolean;
	/** Whether `defaultZoom` has opened this surface; a user zoom is never stomped. */
	defaultZoomApplied: boolean;
	baseWidth: number;
	zoom: number;
	timingNode: HTMLElement | null;
	zoomNode: HTMLElement;
	zoomMinimapNode: HTMLElement;
	zoomCanvas: HTMLCanvasElement;
	zoomViewportNode: HTMLElement;
	/** The keyboard column, drawn beside the roll when `pianoKeyboard` is on. */
	keyboardCanvas: HTMLCanvasElement | null;
	/** The keyboard's configured width, at `configuredHeight` — a fullscreen grow scales from this. */
	baseKeyboardWidth: number;
	/** Serialized sounding pitches, so the keyboard only redraws when they change. */
	lastKeyboardKey: string | null;
	/** The position the keys were last drawn for, so a reflow can repeat it. */
	lastKeyboardPosition: number;
	keyboardColors: PianoRollKeyboardColors | null;
	/** Parsed file, cached so the header is available for tick conversion. */
	midi: Midi | null;
	notes: MidiNoteEvent[];
	/** The configured pitch axis; `"automatic"` derives it from the file. */
	noteRange: "automatic" | [number, number];
	/** Whether note events carry a velocity bar, and whether velocity fades them. */
	velocityBars: boolean;
	velocityOpacity: boolean;
	/** The reference lines drawn behind the notes. */
	grid: PianoRollGridMode;
	/** The readout of the note event under the cursor, when the view asks for one. */
	tooltipNode: HTMLElement | null;
	/** Channel number to label, from the view's `channelToLabelMap` config. */
	channelToLabelMap: Map<number, string>;
	/** The legend naming every labelled channel, when the view asks for one. */
	legendNode: HTMLElement | null;
	/**
	 * The unit this view's medium reads out in, and the conversion to it. Cached
	 * per render pass because the drawing has no `ViewRenderer` to ask.
	 */
	timelineReadout: TimelineReadout | null;
	minMidi: number;
	maxMidi: number;
	pianoRollDurationSeconds: number;
	/** Longest note in `notes`; lets the draw loop bound its backwards scan. */
	maxNoteDuration: number;
	/** The audio tracks each paired channel follows, from the view config. */
	channelTrackIds: Map<number, string[]>;
	/** Whether every channel in the file takes its own palette colour. */
	colorPerChannel: boolean;
	/** Palette slot of a coloured channel, by ascending channel number. */
	channelPaletteIndex: Map<number, number>;
	/** Channels currently silent, and so left out of the drawing. */
	hiddenChannels: Set<number>;
	noteColors: PianoRollNoteColors | null;
	/** Resolved colours per palette slot, alongside the `noteColors` cache. */
	channelColors: Map<number, PianoRollNoteColors>;
	gridColors: PianoRollGridColors | null;
	/**
	 * The duration the notes were last drawn against, which is the roll's own file
	 * in alignment mode and the player's longest track outside it. The hover hit
	 * test reads it so that it can never disagree with the paint.
	 */
	lastRenderedDurationSeconds: number;
	/** The note geometry of the last draw, likewise for the hit test. */
	lastNoteGeometry: NoteGeometry | null;
	lastRenderKey: string | null;
	lastMinimapKey: string | null;
	lastPlaybackKey: string | null;
	lastFollowScrollLeft: number | null;
	/** The playhead's position as a 0-1 ratio, last seen on a playback tick. */
	lastPlayheadRatio: number;
	/** An in-flight animated follow-scroll started by `applyTimelineFollowScrollLeft`. */
	scrollAnimation?: TimelineScrollAnimation | null;
}

interface PianoRollTimelineContext {
	duration: number;
	toReferenceTime(timelineTime: number): number;
	fromReferenceTime(referenceTime: number): number;
	/** See `WaveformTimelineContext.getPlaybackPosition`. */
	playbackPosition?(): number | null;
}

export type PianoRollTimelineContextResolver = (
	surface: PianoRollSeekSurfaceMetadata,
) => PianoRollTimelineContext | null;

/** The stretch of surface the MIDI file itself occupies, without the trailing pad. */

function getPianoRollMaximumZoom(
	surface: PianoRollSeekSurfaceMetadata,
	durationSeconds: number,
): number {
	return getTimelineMaximumZoom(durationSeconds, surface.maxZoomSeconds);
}

function getPianoRollViewportState(surface: PianoRollSeekSurfaceMetadata): {
	startRatio: number;
	widthRatio: number;
} {
	return getTimelineViewportState(surface);
}

function setPianoRollSurfaceWidth(
	surface: PianoRollSeekSurfaceMetadata,
	width?: number,
): void {
	const surfaceWidth = width ?? getTimelineSurfaceWidth(surface);
	surface.surface.style.width = `${surfaceWidth}px`;
	surface.surface.style.height = `${surface.originalHeight}px`;
	surface.noteCanvas.style.height = `${surface.originalHeight}px`;
	// The seek surface covers the file, not the pad past its end, so a seek
	// ratio, a loop marker and a marker layer all still land on the right time.
	surface.seekWrap.style.width = `${getTimelineTimeWidth(surface)}px`;
	updateTimelineMinimapViewport(surface);
}

/** Resizes a surface's rendered height (fullscreen growth/restore) and redraws it. */
export function setPianoRollSurfaceHeight(
	ctx: ViewRenderer,
	surface: PianoRollSeekSurfaceMetadata,
	height: number,
): void {
	if (surface.originalHeight === height) {
		return;
	}

	surface.originalHeight = height;
	surface.surface.style.height = `${height}px`;
	surface.noteCanvas.style.height = `${height}px`;
	if (surface.keyboardCanvas) {
		surface.keyboardCanvas.style.height = `${height}px`;
		// A fullscreen grow changes row height, so the keys have to widen by the
		// same factor to keep their proportions — otherwise a taller roll leaves
		// them looking abnormally thin.
		if (surface.baseKeyboardWidth > 0 && surface.configuredHeight > 0) {
			const scaledWidth =
				(surface.baseKeyboardWidth * height) / surface.configuredHeight;
			surface.wrapper.style.setProperty(
				"--ts-piano-roll-keyboard-width",
				`${scaledWidth}px`,
			);
		}
		surface.lastKeyboardKey = null;
	}
	surface.lastRenderKey = null;
	surface.lastMinimapKey = null;
	ctx.refreshPianoRollNoteTiles();
}

/**
 * A `pinnedLeft` roll always keeps the playhead the same distance from the
 * left edge, but the anchor-ratio math in `setTimelineZoomForSurface` doesn't
 * know about that mode — while paused, it would otherwise drift the surface
 * away from the pinned position on every zoom step. Force it back afterwards.
 */
function setPianoRollZoomForSurface(
	surface: PianoRollSeekSurfaceMetadata,
	zoom: number,
	maximum: number,
	anchorPageX?: number,
): boolean {
	const changed = setTimelineZoomForSurface(
		surface,
		zoom,
		maximum,
		anchorPageX,
		setPianoRollSurfaceWidth,
	);
	if (changed && surface.playbackFollowMode === "pinnedLeft") {
		const scrollLeft = resolveTimelinePlaybackFollowScrollLeft(
			surface,
			surface.lastPlayheadRatio,
		);
		if (scrollLeft !== null) {
			surface.lastFollowScrollLeft = scrollLeft;
			surface.scrollContainer.scrollLeft = scrollLeft;
		}
	}
	return changed;
}

function createPianoRollTooltipNode(overlay: HTMLElement): HTMLElement {
	const tooltip = document.createElement("div");
	tooltip.className = "piano-roll-note-tooltip";
	tooltip.style.display = "none";
	overlay.appendChild(tooltip);
	return tooltip;
}

/**
 * Only `"top-right"` is implemented; the caller has already excluded `"none"`.
 * The position feeds a CSS class name so a new position needs no branching
 * here — just a matching `.piano-roll-legend-<position>` rule.
 */
function createPianoRollLegendNode(
	overlay: HTMLElement,
	timingNode: HTMLElement | null,
	position: Exclude<PianoRollLegendPosition, "none">,
): HTMLElement {
	const legend = document.createElement("div");
	legend.className = `piano-roll-legend piano-roll-legend-${position}`;
	// The timer sits in the same corner; stack the legend below it rather than
	// overlapping.
	if (timingNode) {
		legend.classList.add("piano-roll-legend-below-timing");
	}
	overlay.appendChild(legend);
	return legend;
}

/**
 * Rebuilds the legend rows from `channelToLabelMap`, ascending by channel
 * number, skipping any channel currently muted out via `hiddenChannels`. Run
 * once the channel palette is known — after the notes load, again on a
 * reflow, since a theme change re-reads every channel colour, and again
 * whenever solo/mute state changes which channels are audible.
 */
function updatePianoRollLegend(surface: PianoRollSeekSurfaceMetadata): void {
	const legend = surface.legendNode;
	if (!legend) {
		return;
	}

	const rows = [...surface.channelToLabelMap.entries()]
		.filter(([channel]) => !surface.hiddenChannels.has(channel))
		.sort((a, b) => a[0] - b[0])
		.map(([channel, label]) =>
			buildPianoRollLegendRow(surface, channel, label),
		);
	legend.replaceChildren(...rows);
	legend.style.display = rows.length > 0 ? "flex" : "none";
}

function buildPianoRollLegendRow(
	surface: PianoRollSeekSurfaceMetadata,
	channel: number,
	label: string,
): HTMLElement {
	const row = document.createElement("div");
	row.className = "piano-roll-legend-row";
	const swatch = document.createElement("span");
	swatch.className = "piano-roll-legend-swatch";
	swatch.style.background = resolvePianoRollChannelColors(
		surface,
		channel,
	).velocity;
	const text = document.createElement("span");
	text.className = "piano-roll-legend-label";
	text.textContent = label;
	row.append(swatch, text);
	return row;
}

/**
 * The readout of the note event under the cursor. The note canvas takes no
 * pointer events and the seek surface does, so the pointer is followed on the
 * scroller: it is the one box whose left edge is shared with the overlay the
 * readout is placed in, with or without a keyboard column beside it.
 */
function bindPianoRollTooltip(surface: PianoRollSeekSurfaceMetadata): void {
	surface.scrollContainer.addEventListener("pointermove", (event) => {
		// A tap synthesizes a move and would leave the readout stuck on screen;
		// a held button means a seek or loop drag is under way.
		if (event.pointerType !== "mouse" || event.buttons !== 0) {
			hidePianoRollTooltip(surface);
			return;
		}

		updatePianoRollTooltip(surface, event);
	});
	surface.scrollContainer.addEventListener("pointerleave", () => {
		hidePianoRollTooltip(surface);
	});
	surface.scrollContainer.addEventListener("pointerdown", () => {
		hidePianoRollTooltip(surface);
	});
}

function hidePianoRollTooltip(surface: PianoRollSeekSurfaceMetadata): void {
	if (surface.tooltipNode) {
		surface.tooltipNode.style.display = "none";
	}
}

function updatePianoRollTooltip(
	surface: PianoRollSeekSurfaceMetadata,
	event: PointerEvent,
): void {
	const tooltip = surface.tooltipNode;
	const geometry = surface.lastNoteGeometry;
	if (!tooltip || !geometry) {
		return;
	}

	// The scroller's box is the viewport onto the surface, so the surface
	// coordinate the notes were drawn in is the offset plus the scroll.
	const viewport = surface.scrollContainer.getBoundingClientRect();
	const viewportX = event.clientX - viewport.left;
	const y = event.clientY - viewport.top;
	const x = viewportX + surface.scrollContainer.scrollLeft;
	const note = findPianoRollNoteAt(surface, geometry, x, y);
	if (!note) {
		hidePianoRollTooltip(surface);
		return;
	}

	tooltip.replaceChildren(...buildPianoRollTooltipContent(surface, note));
	tooltip.style.display = "block";
	positionPianoRollTooltip(surface, tooltip, viewportX, y);
}

/**
 * The note event drawn under a point of the surface, tested against the very
 * rectangle the drawing put there so that the readout can never point at
 * something the eye cannot see. Later notes paint over earlier ones, so the last
 * match is the one on top.
 */
function findPianoRollNoteAt(
	surface: PianoRollSeekSurfaceMetadata,
	geometry: NoteGeometry,
	x: number,
	y: number,
): MidiNoteEvent | null {
	const time = x / geometry.pixelsPerSecond;
	const notes = surface.notes;
	let found: MidiNoteEvent | null = null;
	for (
		let index = findFirstVisibleNoteIndex(
			notes,
			time - surface.maxNoteDuration,
		);
		index < notes.length;
		index += 1
	) {
		const note = notes[index];
		if (note.time > time) {
			break;
		}

		if (surface.hiddenChannels.has(note.channel)) {
			continue;
		}

		const { left, width, top } = resolveNoteRect(surface, note, geometry);
		// A note clamped to the minimum width is a sliver on screen; give it a
		// couple of pixels of reach so it can be pointed at at all. Wider notes
		// take no slop, or neighbours would answer for one another.
		const slop = width < 3 ? 2 : 0;
		if (
			x >= left - slop &&
			x <= left + width + slop &&
			y >= top &&
			y <= top + geometry.noteHeight
		) {
			found = note;
		}
	}

	return found;
}

function buildPianoRollTooltipContent(
	surface: PianoRollSeekSurfaceMetadata,
	note: MidiNoteEvent,
): HTMLElement[] {
	const readout = surface.timelineReadout;
	const unit = readout?.unit ?? "seconds";
	const toReadout = readout ? readout.toReadout : (value: number) => value;
	const end = note.time + note.duration;
	// A duration is a span, not a position: the readout is anchored at the origin
	// and only piecewise linear, so it has to be taken as a difference.
	const duration =
		unit === "seconds"
			? `${note.duration.toFixed(3)} s`
			: formatTimelineValue(unit, toReadout(end) - toReadout(note.time));

	const heading = document.createElement("div");
	heading.className = "piano-roll-note-tooltip-heading";
	const pitch = document.createElement("span");
	pitch.className = "piano-roll-note-tooltip-pitch";
	pitch.textContent = formatMidiNoteName(note.midi);
	const channel = document.createElement("span");
	channel.className = "piano-roll-note-tooltip-channel";
	channel.textContent =
		surface.channelToLabelMap.get(note.channel) ?? `ch ${note.channel}`;
	channel.style.color = resolvePianoRollChannelColors(
		surface,
		note.channel,
	).velocity;
	heading.append(pitch, channel);

	return [
		heading,
		buildPianoRollTooltipRow(
			"start",
			formatTimelineValue(unit, toReadout(note.time)),
		),
		buildPianoRollTooltipRow("end", formatTimelineValue(unit, toReadout(end))),
		buildPianoRollTooltipRow("duration", duration),
		// The parser normalizes velocity to 0-1; the file wrote it as 0-127.
		buildPianoRollTooltipRow(
			"velocity",
			String(Math.round(clamp(note.velocity, 0, 1) * 127)),
		),
	];
}

function buildPianoRollTooltipRow(label: string, value: string): HTMLElement {
	const row = document.createElement("div");
	row.className = "piano-roll-note-tooltip-row";
	const name = document.createElement("span");
	name.className = "piano-roll-note-tooltip-label";
	name.textContent = label;
	const content = document.createElement("span");
	content.textContent = value;
	row.append(name, content);
	return row;
}

/**
 * Places the readout beside the cursor, flipping to its other side rather than
 * spilling over an edge of the roll. The overlay is the offset parent, and its
 * left edge is the scroller's own, so the viewport offset is already overlay
 * relative.
 */
function positionPianoRollTooltip(
	surface: PianoRollSeekSurfaceMetadata,
	tooltip: HTMLElement,
	viewportX: number,
	y: number,
): void {
	const boxWidth = surface.overlay.clientWidth;
	const boxHeight = surface.overlay.clientHeight;
	const width = tooltip.offsetWidth;
	const height = tooltip.offsetHeight;
	let left = viewportX + 12;
	if (left + width > boxWidth) {
		left = viewportX - 12 - width;
	}
	let top = y + 14;
	if (top + height > boxHeight) {
		top = y - 14 - height;
	}

	tooltip.style.left = `${Math.round(clamp(left, 0, Math.max(0, boxWidth - width)))}px`;
	tooltip.style.top = `${Math.round(clamp(top, 0, Math.max(0, boxHeight - height)))}px`;
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
				// A note carries no channel of its own; it belongs to its track.
				channel: track.channel,
			});
		}
	}

	if (notes.length === 0) {
		throw new Error(`MIDI file contains no note events: ${source}`);
	}

	notes.sort((a, b) => a.time - b.time || a.midi - b.midi);
	applyRetriggers(notes);
	return notes;
}

/**
 * A second note-on for a pitch already sounding on the same channel is a
 * re-trigger: the note that was running ends there. The parser pairs note-ons
 * with note-offs first-in-first-out, which would otherwise leave two notes
 * overlapping on one row — a shape the drawing reserves for two channels
 * sounding the same pitch at once.
 */
function applyRetriggers(notes: MidiNoteEvent[]): void {
	const sounding = new Map<number, MidiNoteEvent>();
	for (const note of notes) {
		const voice = note.channel * 128 + note.midi;
		const previous = sounding.get(voice);
		if (previous && previous.time + previous.duration > note.time) {
			previous.duration = Math.max(0, note.time - previous.time);
		}
		sounding.set(voice, note);
	}
}

function applyMidiNotes(
	surface: PianoRollSeekSurfaceMetadata,
	notes: MidiNoteEvent[],
): void {
	let minMidi = Number.POSITIVE_INFINITY;
	let maxMidi = Number.NEGATIVE_INFINITY;
	let durationSeconds = 0;
	let maxNoteDuration = 0;
	for (const note of notes) {
		minMidi = Math.min(minMidi, note.midi);
		maxMidi = Math.max(maxMidi, note.midi);
		durationSeconds = Math.max(durationSeconds, note.time + note.duration);
		maxNoteDuration = Math.max(maxNoteDuration, note.duration);
	}

	// An automatic range spans every note, hidden channels included, so that
	// switching a channel off leaves the pitch axis — and every remaining note —
	// where it is. A configured one stands as written.
	surface.notes = notes;
	if (surface.noteRange === "automatic") {
		surface.minMidi = Math.floor(minMidi) - PIANO_ROLL_RANGE_PADDING;
		surface.maxMidi = Math.ceil(maxMidi) + PIANO_ROLL_RANGE_PADDING;
	} else {
		[surface.minMidi, surface.maxMidi] = surface.noteRange;
	}
	surface.pianoRollDurationSeconds = durationSeconds;
	surface.maxNoteDuration = maxNoteDuration;
	assignChannelPalette(surface, notes);
	updatePianoRollLegend(surface);
	surface.lastRenderKey = null;
	surface.lastMinimapKey = null;
}

/**
 * Hands out palette slots by ascending channel number, once the file's own
 * channels are known. With `colorPerChannel` on, every channel the file uses
 * gets a slot — paired with a track or not — so the block is a pure
 * audibility pairing and coloring no longer depends on it. Off, no channel
 * gets a slot and every note falls back to the plain, unpaired colour.
 */
function assignChannelPalette(
	surface: PianoRollSeekSurfaceMetadata,
	notes: MidiNoteEvent[],
): void {
	surface.channelPaletteIndex.clear();
	surface.channelColors.clear();
	if (!surface.colorPerChannel) {
		return;
	}

	const channels = new Set<number>(surface.channelTrackIds.keys());
	for (const note of notes) {
		channels.add(note.channel);
	}

	[...channels]
		.sort((a, b) => a - b)
		.forEach((channel, index) => {
			surface.channelPaletteIndex.set(
				channel,
				(index % PIANO_ROLL_CHANNEL_PALETTE_SIZE) + 1,
			);
		});
}

function resolvePianoRollNoteColors(
	surface: PianoRollSeekSurfaceMetadata,
): PianoRollNoteColors {
	if (surface.noteColors) {
		return surface.noteColors;
	}

	const computed = getComputedStyle(surface.noteCanvas);
	const read = (property: string, fallback: string): string =>
		computed.getPropertyValue(property).trim() || fallback;
	const colors: PianoRollNoteColors = {
		fill: read("--piano-roll-note-fill", "rgba(0, 0, 0, 0.3)"),
		border: read("--piano-roll-note-border", "rgba(0, 0, 0, 0.55)"),
		velocity: read("--piano-roll-note-color", "#000"),
		velocityBar: read("--piano-roll-velocity-bar", "rgba(255, 255, 255, 0.85)"),
	};
	surface.noteColors = colors;
	return colors;
}

function resolvePianoRollGridColors(
	surface: PianoRollSeekSurfaceMetadata,
): PianoRollGridColors {
	if (surface.gridColors) {
		return surface.gridColors;
	}

	const computed = getComputedStyle(surface.noteCanvas);
	const read = (property: string, fallback: string): string =>
		computed.getPropertyValue(property).trim() || fallback;
	const colors: PianoRollGridColors = {
		time: read("--piano-roll-grid-time", "rgba(153, 153, 153, 0.26)"),
		end: read("--piano-roll-grid-end", "rgba(153, 153, 153, 0.55)"),
		rowWhite: read("--piano-roll-grid-row-white", "rgba(255, 255, 255, 0.62)"),
		rowBlack: read("--piano-roll-grid-row-black", "rgba(56, 56, 56, 0.06)"),
	};
	surface.gridColors = colors;
	return colors;
}

/**
 * The colours of one channel: its palette slot when the view pairs it with a
 * track, and the plain note colours when it does not.
 */
function resolvePianoRollChannelColors(
	surface: PianoRollSeekSurfaceMetadata,
	channel: number,
): PianoRollNoteColors {
	const paletteIndex = surface.channelPaletteIndex.get(channel);
	if (paletteIndex === undefined) {
		return resolvePianoRollNoteColors(surface);
	}

	const cached = surface.channelColors.get(paletteIndex);
	if (cached) {
		return cached;
	}

	const computed = getComputedStyle(surface.noteCanvas);
	const read = (property: string): string =>
		computed.getPropertyValue(property).trim();
	const colors: PianoRollNoteColors = {
		fill: read(`--piano-roll-channel-${paletteIndex}-fill`),
		border: read(`--piano-roll-channel-${paletteIndex}-border`),
		velocity: read(`--piano-roll-channel-${paletteIndex}-color`),
		velocityBar: read("--piano-roll-velocity-bar"),
	};
	surface.channelColors.set(paletteIndex, colors);
	return colors;
}

/** A draw key ingredient, so hiding a channel invalidates the memoized render. */
function hiddenChannelsKey(surface: PianoRollSeekSurfaceMetadata): string {
	return [...surface.hiddenChannels].sort((a, b) => a - b).join(",");
}

/**
 * Notes are solid unless the view asks for velocity to fade them, in which case
 * the softest note still keeps a third of its opacity.
 */
function resolveNoteAlpha(
	surface: PianoRollSeekSurfaceMetadata,
	note: MidiNoteEvent,
): number {
	return surface.velocityOpacity ? 0.35 + clamp(note.velocity, 0, 1) * 0.55 : 1;
}

/**
 * The body colour of a note. Fading by velocity draws on the soft channel
 * colour, which is translucent by design; drawing solid takes the full one, so
 * "no velocity" really means one flat block of the channel's colour.
 */
function resolveNoteFill(
	surface: PianoRollSeekSurfaceMetadata,
	channel: number,
): string {
	const colors = resolvePianoRollChannelColors(surface, channel);
	return surface.velocityOpacity ? colors.fill : colors.velocity;
}

/**
 * Index of the first note that can still overlap `startTime`. Notes are sorted
 * by start time, so anything beginning more than `maxNoteDuration` earlier has
 * certainly ended before the window opens.
 */
function findFirstVisibleNoteIndex(
	notes: MidiNoteEvent[],
	startTime: number,
): number {
	let low = 0;
	let high = notes.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (notes[middle].time < startTime) {
			low = middle + 1;
		} else {
			high = middle;
		}
	}

	return low;
}

function renderPianoRollMinimap(
	surface: PianoRollSeekSurfaceMetadata,
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
		hiddenChannelsKey(surface),
		Math.max(1, window.devicePixelRatio || 1),
	].join("#");
	if (surface.lastMinimapKey === drawKey) {
		updateTimelineMinimapViewport(surface);
		return;
	}

	const context = resizeCanvasForCssSize(surface.zoomCanvas, width, height);
	if (!context) {
		return;
	}

	const safeDuration = sanitizeDuration(durationSeconds);
	const range = Math.max(1, surface.maxMidi - surface.minMidi + 1);
	for (const note of surface.notes) {
		if (safeDuration <= 0 || surface.hiddenChannels.has(note.channel)) {
			continue;
		}

		context.fillStyle = resolvePianoRollChannelColors(
			surface,
			note.channel,
		).velocity;
		const x = (note.time / safeDuration) * width;
		const w = Math.max(1, (note.duration / safeDuration) * width);
		const y = ((surface.maxMidi - note.midi) / range) * height;
		const h = Math.max(1, height / range);
		context.globalAlpha = resolveNoteAlpha(surface, note);
		context.fillRect(x, y, w, h);
	}
	context.globalAlpha = 1;
	surface.lastMinimapKey = drawKey;
	updateTimelineMinimapViewport(surface);
}

/**
 * Draws the notes onto a single viewport-sized canvas that slides over the
 * virtual surface, mirroring the waveform tile layer. Only the notes intersecting
 * the buffered window are visited, so the cost tracks the viewport rather than
 * the size of the MIDI file.
 */
function renderPianoRollNotes(
	surface: PianoRollSeekSurfaceMetadata,
	durationSeconds: number,
): void {
	const height = surface.originalHeight;
	const safeDuration = sanitizeDuration(durationSeconds);
	const tileWindow = resolveVisibleTileWindow(surface, height);
	positionTileCanvas(surface.noteCanvas, tileWindow);

	const { tileStartPx, tileCssWidth, tileCssHeight, surfaceWidth } = tileWindow;
	const timeWidth = getTimelineTimeWidth(surface);
	const renderKey = [
		tileStartPx,
		tileCssWidth,
		tileCssHeight,
		surfaceWidth,
		Math.round(safeDuration * 1000),
		surface.notes.length,
		surface.minMidi,
		surface.maxMidi,
		hiddenChannelsKey(surface),
		surface.velocityBars ? "1" : "0",
		surface.velocityOpacity ? "1" : "0",
		surface.grid,
		// The grid lands on different values once the medium's readout arrives.
		surface.timelineReadout?.unit ?? "seconds",
		Math.max(1, window.devicePixelRatio || 1),
	].join("#");
	if (surface.lastRenderKey === renderKey) {
		return;
	}

	const context = resizeCanvasForCssSize(
		surface.noteCanvas,
		tileCssWidth,
		tileCssHeight,
	);
	if (!context) {
		return;
	}

	surface.lastRenderKey = renderKey;
	surface.lastRenderedDurationSeconds = safeDuration;
	if (safeDuration <= 0 || surfaceWidth <= 0) {
		surface.lastNoteGeometry = null;
		return;
	}

	surface.lastNoteGeometry = drawPianoRollNotes(
		context,
		surface,
		safeDuration,
		{ tileStartPx, tileCssWidth, timeWidth },
		height,
	);
}

/**
 * Draws the grid and the notes of one window of the roll. `timeWidth` is the
 * width the whole duration would take at the window's scale, which need not be
 * the surface's own: the marker loupe draws the same notes magnified.
 */
function drawPianoRollNotes(
	context: CanvasRenderingContext2D,
	surface: PianoRollSeekSurfaceMetadata,
	safeDuration: number,
	tileWindow: { tileStartPx: number; tileCssWidth: number; timeWidth: number },
	height: number,
): NoteGeometry {
	const { tileStartPx, tileCssWidth, timeWidth } = tileWindow;

	// Draw in surface coordinates; the canvas only covers [tileStartPx, +width).
	context.translate(-tileStartPx, 0);

	const range = Math.max(1, surface.maxMidi - surface.minMidi + 1);
	const rowHeight = height / range;
	const noteHeight = Math.max(3, rowHeight - 2);
	const pixelsPerSecond = timeWidth / safeDuration;
	const visibleStartTime = tileStartPx / pixelsPerSecond;
	const visibleEndTime = (tileStartPx + tileCssWidth) / pixelsPerSecond;
	const drawBorder = rowHeight >= PIANO_ROLL_NOTE_BORDER_MIN_HEIGHT;
	const drawVelocityBar =
		surface.velocityBars && noteHeight >= PIANO_ROLL_VELOCITY_BAR_MIN_HEIGHT;

	context.lineWidth = 1;

	const visible = collectVisibleNotes(
		surface,
		visibleStartTime,
		visibleEndTime,
	);
	const geometry: NoteGeometry = { pixelsPerSecond, rowHeight, noteHeight };

	drawPianoRollGrid(context, surface, tileWindow, geometry);

	// Solid bodies first, then the checkerboard over the stretches where two or
	// more channels sound one pitch, then the per-note decorations on top.
	for (const note of visible) {
		const { left, width, top } = resolveNoteRect(surface, note, geometry);
		context.globalAlpha = resolveNoteAlpha(surface, note);
		context.fillStyle = resolveNoteFill(surface, note.channel);
		traceNoteShape(
			context,
			left,
			top,
			width,
			noteHeight,
			PIANO_ROLL_NOTE_CORNER_RADIUS,
		);
		context.fill();
	}

	drawOverlapCheckerboards(context, surface, visible, geometry);

	context.globalAlpha = 1;
	for (const note of visible) {
		const { left, width, top } = resolveNoteRect(surface, note, geometry);
		const colors = resolvePianoRollChannelColors(surface, note.channel);
		if (drawBorder) {
			context.strokeStyle = colors.border;
			traceNoteShape(
				context,
				left + 0.5,
				top + 0.5,
				width - 1,
				noteHeight - 1,
				PIANO_ROLL_NOTE_CORNER_RADIUS - 0.5,
			);
			context.stroke();
		}

		if (drawVelocityBar && width >= PIANO_ROLL_VELOCITY_BAR_MIN_WIDTH) {
			const barWidth = Math.max(1, (width - 6) * clamp(note.velocity, 0, 1));
			// On a faded body the full channel colour reads as the bar; on a solid
			// one only the contrast colour does.
			context.fillStyle = surface.velocityOpacity
				? colors.velocity
				: resolvePianoRollNoteColors(surface).velocityBar;
			context.fillRect(left + 3, top + noteHeight - 5, barWidth, 3);
		}
	}

	return geometry;
}

/** See `SeekSurfaceRangeRenderer`; draws a stretch of the roll's notes. */
export function drawPianoRollRange(
	surface: PianoRollSeekSurfaceMetadata,
	canvas: HTMLCanvasElement,
	cssWidth: number,
	cssHeight: number,
	startRatio: number,
	widthRatio: number,
): void {
	const context = resizeCanvasForCssSize(canvas, cssWidth, cssHeight);
	const safeDuration = sanitizeDuration(surface.lastRenderedDurationSeconds);
	if (!context || safeDuration <= 0 || widthRatio <= 0) {
		return;
	}
	const timeWidth = cssWidth / widthRatio;
	drawPianoRollNotes(
		context,
		surface,
		safeDuration,
		{ tileStartPx: startRatio * timeWidth, tileCssWidth: cssWidth, timeWidth },
		cssHeight,
	);
}

/**
 * Traces one note event as a path with rounded corners. The radius is clamped
 * to half the rectangle, because a note bottoms out at three pixels tall and at
 * one pixel wide; below a whole pixel of radius the rounding cannot be seen and
 * a plain rectangle draws it, which matters on a zoomed-out roll where this runs
 * for every note of the file.
 */
function traceNoteShape(
	context: CanvasRenderingContext2D,
	left: number,
	top: number,
	width: number,
	height: number,
	radius: number,
): void {
	const corner = Math.min(radius, width / 2, height / 2);
	context.beginPath();
	if (corner < 1) {
		context.rect(left, top, width, height);
		return;
	}

	context.roundRect(left, top, width, height, corner);
}

/**
 * The reference lines behind the notes: vertical lines on round values of the
 * unit the medium reads out in, and a wash over the rows of the black keys with
 * every C marked. Drawn before the note bodies, so the notes stay on top.
 */
function drawPianoRollGrid(
	context: CanvasRenderingContext2D,
	surface: PianoRollSeekSurfaceMetadata,
	tileWindow: { tileStartPx: number; tileCssWidth: number; timeWidth: number },
	geometry: NoteGeometry,
): void {
	// Everything the grid draws belongs to the file, so all of it stops where the
	// file does. That is not the end of the surface: the roll spans the player's
	// timeline, which a longer audio track can carry well past the last note, and
	// a `pinnedLeft` roll pads even that so the last notes can reach the playhead.
	const { tileStartPx, tileCssWidth, timeWidth } = tileWindow;
	const fileEndPx = Math.min(
		timeWidth,
		surface.pianoRollDurationSeconds * geometry.pixelsPerSecond,
	);
	const left = Math.max(0, tileStartPx);
	const right = Math.min(fileEndPx, tileStartPx + tileCssWidth);
	const colors = resolvePianoRollGridColors(surface);
	if (surface.grid === "pitch" || surface.grid === "both") {
		drawPianoRollPitchGrid(
			context,
			surface,
			left,
			right - left,
			geometry.rowHeight,
			colors,
		);
	}

	if (surface.grid === "time" || surface.grid === "both") {
		drawPianoRollTimeGrid(
			context,
			surface,
			left,
			right,
			fileEndPx,
			geometry.pixelsPerSecond,
			colors,
		);
	}

	// The end of the file is worth marking whether or not a grid is drawn: it is
	// otherwise indistinguishable from a passage that simply has no notes.
	if (fileEndPx > tileStartPx && fileEndPx <= tileStartPx + tileCssWidth) {
		context.fillStyle = colors.end;
		context.fillRect(Math.round(fileEndPx) - 1, 0, 1, surface.originalHeight);
	}
}

function drawPianoRollPitchGrid(
	context: CanvasRenderingContext2D,
	surface: PianoRollSeekSurfaceMetadata,
	left: number,
	width: number,
	rowHeight: number,
	colors: PianoRollGridColors,
): void {
	if (rowHeight < PIANO_ROLL_PITCH_GRID_MIN_ROW_HEIGHT || width <= 0) {
		return;
	}

	for (let midi = surface.minMidi; midi <= surface.maxMidi; midi += 1) {
		// Round the two edges rather than the height: rounding the height leaves a
		// seam or an overlap between neighbouring rows. The row itself is the one
		// the keyboard column draws its keys on, so the wash meets its black keys.
		const rowTop = Math.round((surface.maxMidi - midi) * rowHeight);
		const rowBottom = Math.round((surface.maxMidi - midi + 1) * rowHeight);
		context.fillStyle = isBlackKey(midi) ? colors.rowBlack : colors.rowWhite;
		context.fillRect(left, rowTop, width, Math.max(1, rowBottom - rowTop));
	}
}

function drawPianoRollTimeGrid(
	context: CanvasRenderingContext2D,
	surface: PianoRollSeekSurfaceMetadata,
	left: number,
	right: number,
	fileEndPx: number,
	pixelsPerSecond: number,
	colors: PianoRollGridColors,
): void {
	if (right <= left || pixelsPerSecond <= 0) {
		return;
	}

	const readout = surface.timelineReadout;
	const toReadout = readout ? readout.toReadout : (value: number) => value;
	const fromReadout = readout ? readout.fromReadout : (value: number) => value;
	const startValue = toReadout(left / pixelsPerSecond);
	const endValue = toReadout(right / pixelsPerSecond);
	if (!(endValue > startValue)) {
		return;
	}

	// The rate is taken across the drawn window rather than globally: a unit that
	// runs at a varying rate against seconds — ticks under a tempo map — has no
	// single one, and the spacing that matters is the one on screen.
	const step = resolveTimeGridStep(
		readout?.unit ?? "seconds",
		(right - left) / (endValue - startValue),
		surface.midi?.header.ppq,
	);
	context.fillStyle = colors.time;
	let drawn = 0;
	for (
		let index = Math.ceil(startValue / step);
		index * step <= endValue && drawn < MAX_TIME_GRID_LINES;
		index += 1
	) {
		// Multiplied rather than accumulated, so the step does not drift over a
		// long file, and placed through the readout one value at a time, so a
		// tempo change bends the grid with the music.
		const x = fromReadout(index * step) * pixelsPerSecond;
		drawn += 1;
		if (x < 0 || x > fileEndPx) {
			continue;
		}

		context.fillRect(Math.round(x), 0, 1, surface.originalHeight);
	}
}

/**
 * The interval between two grid lines: the first round value of the medium's own
 * unit that keeps the lines at least `MIN_TIME_GRID_SPACING_PX` apart. Ticks step
 * in fractions and multiples of a beat, which is the reason to read a file in
 * ticks at all; everything else steps in 1/2/5 of its own decades.
 */
function resolveTimeGridStep(
	unit: TimelineUnit,
	pixelsPerUnit: number,
	ticksPerBeat: number | undefined,
): number {
	const minimum = MIN_TIME_GRID_SPACING_PX / pixelsPerUnit;
	const ladder =
		unit === "seconds"
			? SECOND_GRID_STEPS
			: unit === "ticks" && ticksPerBeat
				? TICK_GRID_BEAT_FACTORS.map((factor) => factor * ticksPerBeat).filter(
						(step) => step >= 1,
					)
				: [];
	for (const step of ladder) {
		if (step >= minimum) {
			return step;
		}
	}

	// Past the end of a ladder, or a unit with none, the grid carries on in
	// decades of 1, 2 and 5.
	const decade =
		10 ** Math.floor(Math.log10(Math.max(minimum, Number.EPSILON)));
	for (const factor of [1, 2, 5]) {
		if (decade * factor >= minimum) {
			return decade * factor;
		}
	}

	return decade * 10;
}

interface NoteGeometry {
	pixelsPerSecond: number;
	rowHeight: number;
	noteHeight: number;
}

interface NoteRect {
	left: number;
	width: number;
	top: number;
}

function resolveNoteRect(
	surface: PianoRollSeekSurfaceMetadata,
	note: MidiNoteEvent,
	geometry: NoteGeometry,
): NoteRect {
	return {
		left: note.time * geometry.pixelsPerSecond,
		width: Math.max(
			MIN_PIANO_ROLL_NOTE_WIDTH,
			note.duration * geometry.pixelsPerSecond,
		),
		top: (surface.maxMidi - note.midi) * geometry.rowHeight + 1,
	};
}

/**
 * The audible notes touching the drawn window, in file order. The binary search
 * and the early break keep the cost on the viewport rather than the file.
 */
function collectVisibleNotes(
	surface: PianoRollSeekSurfaceMetadata,
	visibleStartTime: number,
	visibleEndTime: number,
): MidiNoteEvent[] {
	const notes = surface.notes;
	const visible: MidiNoteEvent[] = [];
	const startIndex = findFirstVisibleNoteIndex(
		notes,
		visibleStartTime - surface.maxNoteDuration,
	);
	for (let index = startIndex; index < notes.length; index += 1) {
		const note = notes[index];
		if (note.time > visibleEndTime) {
			break;
		}

		if (
			note.time + note.duration < visibleStartTime ||
			surface.hiddenChannels.has(note.channel)
		) {
			continue;
		}

		visible.push(note);
	}

	return visible;
}

/**
 * Where several channels sound one pitch at the same time, their colours share
 * the stretch as a checkerboard: one row per channel, square-ish cells, and the
 * colours rotating by one row from column to column. Solid notes would otherwise
 * simply cover one another.
 */
function drawOverlapCheckerboards(
	context: CanvasRenderingContext2D,
	surface: PianoRollSeekSurfaceMetadata,
	visible: MidiNoteEvent[],
	geometry: NoteGeometry,
): void {
	const byPitch = new Map<number, MidiNoteEvent[]>();
	for (const note of visible) {
		const pitch = byPitch.get(note.midi);
		if (pitch) {
			pitch.push(note);
		} else {
			byPitch.set(note.midi, [note]);
		}
	}

	const { pixelsPerSecond, rowHeight, noteHeight } = geometry;
	for (const [midi, pitchNotes] of byPitch) {
		if (pitchNotes.length < 2) {
			continue;
		}

		const top = (surface.maxMidi - midi) * rowHeight + 1;
		for (const segment of resolveOverlapSegments(pitchNotes)) {
			const channels = segment.notes.map((note) => note.channel);
			const rows = channels.length;
			const left = segment.start * pixelsPerSecond;
			const width = Math.max(
				MIN_PIANO_ROLL_NOTE_WIDTH,
				(segment.end - segment.start) * pixelsPerSecond,
			);
			const rowPixels = noteHeight / rows;
			const cellWidth = Math.max(MIN_CHECKERBOARD_CELL, rowPixels * 2);
			const columns = Math.max(1, Math.ceil(width / cellWidth));
			for (let column = 0; column < columns; column += 1) {
				const cellLeft = left + column * cellWidth;
				const cellRight = Math.min(left + width, cellLeft + cellWidth);
				for (let row = 0; row < rows; row += 1) {
					const note = segment.notes[(row + column) % rows];
					context.globalAlpha = resolveNoteAlpha(surface, note);
					context.fillStyle = resolveNoteFill(surface, note.channel);
					context.fillRect(
						cellLeft,
						top + row * rowPixels,
						cellRight - cellLeft,
						rowPixels,
					);
				}
			}
		}
	}
}

interface OverlapSegment {
	start: number;
	end: number;
	/** The notes sounding across the whole segment, by ascending channel. */
	notes: MidiNoteEvent[];
}

/**
 * Sweeps one pitch row for the stretches covered by more than one note. The
 * parser's re-trigger pass has already removed same-channel overlaps, so every
 * segment this returns is several channels at once.
 */
function resolveOverlapSegments(notes: MidiNoteEvent[]): OverlapSegment[] {
	const boundaries = new Set<number>();
	for (const note of notes) {
		boundaries.add(note.time);
		boundaries.add(note.time + note.duration);
	}

	const sorted = [...boundaries].sort((a, b) => a - b);
	const segments: OverlapSegment[] = [];
	for (let index = 0; index + 1 < sorted.length; index += 1) {
		const start = sorted[index];
		const end = sorted[index + 1];
		if (end <= start) {
			continue;
		}

		const middle = (start + end) / 2;
		const active = notes
			.filter(
				(note) => note.time <= middle && note.time + note.duration > middle,
			)
			.sort((a, b) => a.channel - b.channel);
		if (active.length < 2) {
			continue;
		}

		const previous = segments[segments.length - 1];
		if (
			previous &&
			previous.end === start &&
			sameNotes(previous.notes, active)
		) {
			previous.end = end;
			continue;
		}

		segments.push({ start, end, notes: active });
	}

	return segments;
}

function sameNotes(left: MidiNoteEvent[], right: MidiNoteEvent[]): boolean {
	return (
		left.length === right.length &&
		left.every((note, index) => note === right[index])
	);
}

function resolvePianoRollTimelineDuration(
	surface: PianoRollSeekSurfaceMetadata,
	playerDuration: number,
	usePianoRollLocalTimeline: boolean,
): number {
	return usePianoRollLocalTimeline
		? sanitizeDuration(surface.pianoRollDurationSeconds)
		: sanitizeDuration(playerDuration);
}

function resolvePianoRollTimelinePosition(
	surface: PianoRollSeekSurfaceMetadata,
	playerPosition: number,
	playerDuration: number,
	usePianoRollLocalTimeline: boolean,
): number {
	const duration = resolvePianoRollTimelineDuration(
		surface,
		playerDuration,
		usePianoRollLocalTimeline,
	);
	if (duration <= 0) {
		return 0;
	}

	return clamp(playerPosition, 0, duration);
}

/**
 * The configured pitch axis as note numbers. Configuration normalization has
 * already resolved and ordered the pair; anything it let through that does not
 * parse falls back to the automatic axis rather than to a broken one.
 */
function resolveConfiguredNoteRange(
	noteRange: MidiNoteRange | undefined,
): "automatic" | [number, number] {
	if (!noteRange || noteRange === "automatic") {
		return "automatic";
	}

	const low = parseMidiNoteRef(noteRange[0]);
	const high = parseMidiNoteRef(noteRange[1]);
	if (low === null || high === null || low === high) {
		return "automatic";
	}

	return low < high ? [low, high] : [high, low];
}

/**
 * Turns the configured zoom spans into seconds. `maxZoom` and `defaultZoom` are
 * written in the unit the medium declares, which is only known once the timeline
 * readouts are in place — after the layout that built this surface.
 */
function resolvePianoRollZoomUnits(
	ctx: ViewRenderer,
	surface: PianoRollSeekSurfaceMetadata,
): void {
	if (surface.zoomUnitsResolved) {
		return;
	}

	surface.zoomUnitsResolved = true;
	surface.maxZoomSeconds = ctx.resolveLocalSpanSeconds(
		surface.mediaId,
		surface.maxZoomValue,
	);
	surface.defaultZoomSeconds =
		surface.defaultZoomValue === null
			? // A keyboard roll opens on a phrase rather than on the whole file.
				surface.keyboardCanvas
				? DEFAULT_PIANO_KEYBOARD_ZOOM_SECONDS
				: null
			: ctx.resolveLocalSpanSeconds(surface.mediaId, surface.defaultZoomValue);
}

/** Reads the `channelToLabelMap` block of a view into a channel → label lookup. */
function resolveChannelToLabelMap(
	channelToLabelMap: Record<string, string> | undefined,
): Map<number, string> {
	const labels = new Map<number, string>();
	if (!channelToLabelMap) {
		return labels;
	}

	for (const [key, label] of Object.entries(channelToLabelMap)) {
		labels.set(Number(key), label);
	}

	return labels;
}

/** Reads the `channelToTrackIDMap` block of a view into a channel → tracks lookup. */
function resolveChannelTrackIds(
	channelToTrackIDMap: Record<string, string | string[]> | undefined,
): Map<number, string[]> {
	const channelTrackIds = new Map<number, string[]>();
	if (!channelToTrackIDMap) {
		return channelTrackIds;
	}

	for (const [key, trackIds] of Object.entries(channelToTrackIDMap)) {
		channelTrackIds.set(
			Number(key),
			Array.isArray(trackIds) ? trackIds : [trackIds],
		);
	}

	return channelTrackIds;
}

export function wrapPianoRollCanvases(ctx: ViewRenderer): void {
	ctx.pianoRollSeekSurfaces.length = 0;

	const canvases = ctx.root.querySelectorAll("canvas.piano-roll");
	canvases.forEach((canvasElement: Element) => {
		if (!(canvasElement instanceof HTMLCanvasElement)) {
			return;
		}

		if (canvasElement.closest(".piano-roll-wrap")) {
			return;
		}

		const definition: ConfiguredViewHost =
			ctx.getConfiguredViewHost(canvasElement);
		if (definition.view.type !== "pianoRoll") return;
		const config = definition.view as TrackSwitchPianoRollViewConfig;
		const source = definition.source;
		if (!source) return;

		const wrapper = document.createElement("div");
		wrapper.className = "piano-roll-wrap ts-stack-section";
		wrapper.dataset.palette = config.palette ?? "light";
		applyCssOverrides(wrapper, config.css);

		const scrollContainer = document.createElement("div");
		scrollContainer.className = "piano-roll-scroll";

		const surface = document.createElement("div");
		surface.className = "piano-roll-surface";

		// One viewport-sized canvas slides over the virtual piano-roll surface, so the
		// note count no longer drives the DOM node count.
		const noteCanvas = document.createElement("canvas");
		noteCanvas.className = "piano-roll-note-layer";

		const overlay = document.createElement("div");
		overlay.className = "piano-roll-overlay";

		const parent = canvasElement.parentElement;
		if (!parent) {
			return;
		}

		// The keyboard is a column beside the scroller rather than part of the
		// scrolled surface, so the notes travel into keys that stay put.
		const pianoKeyboard = config.pianoKeyboard === true;
		let keyboardCanvas: HTMLCanvasElement | null = null;
		if (pianoKeyboard) {
			wrapper.classList.add("piano-roll-has-keyboard");
			keyboardCanvas = document.createElement("canvas");
			keyboardCanvas.className = "piano-roll-keyboard";
		}

		parent.insertBefore(wrapper, canvasElement);
		if (keyboardCanvas) {
			wrapper.appendChild(keyboardCanvas);
		}
		wrapper.appendChild(scrollContainer);
		scrollContainer.appendChild(surface);
		surface.appendChild(noteCanvas);
		surface.insertAdjacentHTML("beforeend", buildSeekWrap());
		wrapper.appendChild(overlay);
		canvasElement.remove();

		const seekWrap = surface.querySelector(".seekwrap");
		if (!(seekWrap instanceof HTMLElement)) {
			return;
		}
		ctx.registerSeekMarkerLayers(seekWrap, config.markerLayers);
		ctx.registerSeekTimeline(
			seekWrap,
			definition.alignmentTimeline?.trim() || null,
		);
		seekWrap.setAttribute("data-seek-surface", "piano-roll");

		const channelTrackIds = resolveChannelTrackIds(config.channelToTrackIDMap);

		const originalHeight = Math.max(1, canvasElement.height);
		surface.style.height = `${originalHeight}px`;
		noteCanvas.style.height = `${originalHeight}px`;
		let baseKeyboardWidth = 0;
		if (keyboardCanvas) {
			keyboardCanvas.style.height = `${originalHeight}px`;
			baseKeyboardWidth =
				parseFloat(
					getComputedStyle(wrapper).getPropertyValue(
						"--ts-piano-roll-keyboard-width",
					),
				) || DEFAULT_PIANO_ROLL_KEYBOARD_WIDTH;
		}

		// Same default as a waveform: an aligned player runs every surface on its
		// own local clock, which is only readable with the timer on.
		const timerEnabled = config.timer ?? ctx.isAlignmentMode();
		const timingNode = timerEnabled
			? createTimelineTimingNode(overlay, "piano-roll-timing")
			: null;
		const zoomNode = createTimelineZoomNode(overlay, "piano-roll");
		const zoomMinimapNode = zoomNode.querySelector(".piano-roll-zoom-minimap");
		const zoomCanvas = zoomNode.querySelector(".piano-roll-zoom-canvas");
		const zoomViewportNode = zoomNode.querySelector(
			".piano-roll-zoom-viewport",
		);
		if (
			!(zoomMinimapNode instanceof HTMLElement) ||
			!(zoomCanvas instanceof HTMLCanvasElement) ||
			!(zoomViewportNode instanceof HTMLElement)
		) {
			return;
		}

		const metadata: PianoRollSeekSurfaceMetadata = {
			wrapper,
			scrollContainer,
			surface,
			noteCanvas,
			overlay,
			seekWrap,
			source,
			alignmentColumn: definition.alignmentTimeline?.trim() || null,
			mediaId: config.mediaID,
			playbackFollowMode: pianoKeyboard
				? "pinnedLeft"
				: (config.playbackFollowMode ?? "center"),
			trailingPadPx: 0,
			originalHeight,
			configuredHeight: originalHeight,
			maxZoomValue: config.maxZoom ?? 5,
			defaultZoomValue: config.defaultZoom ?? null,
			maxZoomSeconds: config.maxZoom ?? 5,
			defaultZoomSeconds: null,
			zoomUnitsResolved: false,
			defaultZoomApplied: false,
			baseWidth: ctx.resolveTimelineBaseWidth(
				scrollContainer,
				canvasElement.width,
			),
			zoom: MIN_PIANO_ROLL_ZOOM,
			timingNode,
			zoomNode,
			zoomMinimapNode,
			zoomCanvas,
			zoomViewportNode,
			keyboardCanvas,
			baseKeyboardWidth,
			lastKeyboardKey: null,
			lastKeyboardPosition: 0,
			keyboardColors: null,
			midi: null,
			notes: [],
			noteRange: resolveConfiguredNoteRange(config.noteRange),
			velocityBars: config.velocityBars === true,
			velocityOpacity: config.velocityOpacity === true,
			grid: config.grid ?? "none",
			tooltipNode:
				config.noteTooltip === true
					? createPianoRollTooltipNode(overlay)
					: null,
			channelToLabelMap: resolveChannelToLabelMap(config.channelToLabelMap),
			legendNode:
				config.legend && config.legend !== "none"
					? createPianoRollLegendNode(overlay, timingNode, config.legend)
					: null,
			timelineReadout: null,
			minMidi: 0,
			maxMidi: 0,
			pianoRollDurationSeconds: 0,
			maxNoteDuration: 0,
			channelTrackIds,
			colorPerChannel: config.colorPerChannel ?? true,
			channelPaletteIndex: new Map<number, number>(),
			hiddenChannels: new Set<number>(),
			noteColors: null,
			channelColors: new Map<number, PianoRollNoteColors>(),
			gridColors: null,
			lastRenderedDurationSeconds: 0,
			lastNoteGeometry: null,
			lastRenderKey: null,
			lastMinimapKey: null,
			lastPlaybackKey: null,
			lastFollowScrollLeft: null,
			lastPlayheadRatio: 0,
		};
		ctx.pianoRollSeekSurfaces.push(metadata);

		scrollContainer.addEventListener(
			"scroll",
			() => {
				// Scroll handlers run after layout, so refreshing the cached width
				// here is free and keeps the per-frame paths off the layout path.
				refreshTimelineViewportWidth(metadata);
				updateTimelineMinimapViewport(metadata);
				// The roll travels under a stationary cursor while playback follows,
				// so whatever the readout points at has moved on.
				hidePianoRollTooltip(metadata);
				ctx.schedulePianoRollNoteRefresh();
			},
			{ passive: true },
		);

		if (metadata.tooltipNode) {
			bindPianoRollTooltip(metadata);
		}
	});
}

export function reflowPianoRollDisplays(ctx: ViewRenderer): void {
	ctx.pianoRollSeekSurfaces.forEach((surface: PianoRollSeekSurfaceMetadata) => {
		// Theme variables may have changed along with the layout, and the
		// colours are only re-read on a draw the render key does not skip.
		surface.noteColors = null;
		surface.gridColors = null;
		surface.keyboardColors = null;
		surface.lastKeyboardKey = null;
		surface.lastRenderKey = null;
		surface.channelColors.clear();
		hidePianoRollTooltip(surface);
		updatePianoRollLegend(surface);
		reflowTimelineSurface(surface, setPianoRollSurfaceWidth);
	});
}

/**
 * Fetch and decode every MIDI source. Split out of rendering so that
 * `pianoRollDurationSeconds` and the parsed header — which the alignment needs for
 * extents and tick conversion — are available before the alignment resolves.
 * The parsed file is cached on the surface so nothing is fetched twice.
 */
export async function loadMidiSources(ctx: ViewRenderer): Promise<void> {
	const surfaces = ctx.pianoRollSeekSurfaces;
	if (surfaces.length === 0) {
		return;
	}

	await Promise.all(
		surfaces.map(async (surface) => {
			if (surface.midi) {
				return;
			}
			surface.wrapper.classList.add("piano-roll-loading");
			const midi = await Midi.fromUrl(surface.source);
			surface.midi = midi;
			applyMidiNotes(surface, flattenMidiNotes(midi, surface.source));
			surface.wrapper.classList.remove("piano-roll-loading");
		}),
	);
}

/** Parsed MIDI files keyed by source url, for reuse by the media profiler. */
export function getLoadedMidiBySource(ctx: ViewRenderer): Map<string, Midi> {
	const bySource = new Map<string, Midi>();
	ctx.pianoRollSeekSurfaces.forEach((surface) => {
		if (surface.midi) {
			bySource.set(surface.source, surface.midi);
		}
	});
	return bySource;
}

export async function initializePianoRollDisplays(
	ctx: ViewRenderer,
	timelineDuration: number,
	usePianoRollLocalTimeline = false,
): Promise<void> {
	const surfaces = ctx.pianoRollSeekSurfaces;
	if (surfaces.length === 0) {
		return;
	}

	await loadMidiSources(ctx);
	ctx.renderPianoRollDisplays(timelineDuration, usePianoRollLocalTimeline);
}

export function renderPianoRollDisplays(
	ctx: ViewRenderer,
	timelineDuration: number,
	usePianoRollLocalTimeline = false,
): void {
	if (ctx.pianoRollSeekSurfaces.length === 0) {
		return;
	}

	ctx.latestPianoRollRenderInput = {
		timelineDuration,
		usePianoRollLocalTimeline,
	};
	ctx.reflowPianoRollDisplays();
	ctx.pianoRollSeekSurfaces.forEach((surface: PianoRollSeekSurfaceMetadata) => {
		const surfaceDuration = resolvePianoRollTimelineDuration(
			surface,
			timelineDuration,
			usePianoRollLocalTimeline,
		);
		resolvePianoRollZoomUnits(ctx, surface);
		// The grid and the note readout speak the unit ctx view's medium
		// declares, which the drawing has no `ViewRenderer` to look up.
		surface.timelineReadout = ctx.timelineReadouts.get(surface.mediaId) ?? null;
		const maximumZoom = getPianoRollMaximumZoom(surface, surfaceDuration);
		// `defaultZoom` only ever opens the surface: once it has, a reflow or a
		// hot reload leaves whatever zoom the listener is on.
		let targetZoom = surface.zoom;
		if (!surface.defaultZoomApplied && surfaceDuration > 0) {
			surface.defaultZoomApplied = true;
			targetZoom = resolveTimelineDefaultZoom(
				surfaceDuration,
				surface.defaultZoomSeconds,
				maximumZoom,
			);
		}
		setPianoRollZoomForSurface(surface, targetZoom, maximumZoom);
		renderPianoRollNotes(surface, surfaceDuration);
		renderPianoRollMinimap(surface, surfaceDuration);
		refreshPianoRollKeyboard(surface, surface.lastKeyboardPosition);
	});
	updateTimelineZoomIndicators(ctx.pianoRollSeekSurfaces);
}

/**
 * Redraws the sliding note canvases from the inputs of the last full render.
 * Unlike `renderPianoRollDisplays` this touches no layout and never writes
 * `scrollLeft`, so it is safe to run from scroll and zoom handlers.
 */
export function refreshPianoRollNoteTiles(ctx: ViewRenderer): void {
	const latestInput = ctx.latestPianoRollRenderInput;
	if (!latestInput || ctx.pianoRollSeekSurfaces.length === 0) {
		return;
	}

	ctx.pianoRollSeekSurfaces.forEach((surface: PianoRollSeekSurfaceMetadata) => {
		const surfaceDuration = resolvePianoRollTimelineDuration(
			surface,
			latestInput.timelineDuration,
			latestInput.usePianoRollLocalTimeline,
		);
		renderPianoRollNotes(surface, surfaceDuration);
		renderPianoRollMinimap(surface, surfaceDuration);
	});
}

/**
 * Points every paired channel at the current solo state. A channel paired with
 * several tracks (e.g. every track of a `comparisonGroup`) stays visible as long as
 * any one of them is audible. The draw keys carry the hidden set, so a refresh
 * that changes nothing costs a key comparison.
 */
export function updatePianoRollChannelVisibility(
	ctx: ViewRenderer,
	runtimes: TrackRuntime[],
): void {
	if (ctx.pianoRollSeekSurfaces.length === 0) {
		return;
	}

	const indexByTrackId = new Map<string, number>();
	runtimes.forEach((runtime, index) => {
		indexByTrackId.set(runtime.definition.id, index);
	});

	ctx.pianoRollSeekSurfaces.forEach((surface: PianoRollSeekSurfaceMetadata) => {
		surface.hiddenChannels.clear();
		surface.channelTrackIds.forEach((trackIds, channel) => {
			const audible = trackIds.some((trackId) => {
				const trackIndex = indexByTrackId.get(trackId);
				return trackIndex !== undefined && ctx.isTrackAudible(trackIndex);
			});
			if (!audible) {
				surface.hiddenChannels.add(channel);
			}
		});
		updatePianoRollLegend(surface);
	});

	ctx.schedulePianoRollNoteRefresh();
}

/**
 * The colours a track carries in the piano roll, for the views that repeat
 * the channel code outside it — one per channel paired with the track, in
 * ascending channel order. Null when no roll colours a channel paired with
 * this track (no pairing, or `colorPerChannel` is off).
 */
export function resolvePianoRollTrackChannelColors(
	ctx: ViewRenderer,
	trackId: string,
): string[] | null {
	for (const surface of ctx.pianoRollSeekSurfaces) {
		const channels = [...surface.channelTrackIds]
			.filter(([, pairedTrackIds]) => pairedTrackIds.includes(trackId))
			.map(([channel]) => channel)
			.sort((a, b) => a - b)
			.filter((channel) => surface.channelPaletteIndex.has(channel));

		if (channels.length > 0) {
			return channels.map(
				(channel) => resolvePianoRollChannelColors(surface, channel).velocity,
			);
		}
	}

	return null;
}

export function schedulePianoRollNoteRefresh(ctx: ViewRenderer): void {
	if (ctx.pianoRollNoteRefreshFrameId !== null) {
		return;
	}

	ctx.pianoRollNoteRefreshFrameId = requestAnimationFrame(() => {
		ctx.pianoRollNoteRefreshFrameId = null;
		ctx.refreshPianoRollNoteTiles();
	});
}

export function updatePianoRollPlaybackState(
	ctx: ViewRenderer,
	state: TrackSwitchUiState,
	suppressPlaybackFollow: boolean,
	usePianoRollLocalTimeline = false,
	timelineContextResolver?: PianoRollTimelineContextResolver,
	animate = false,
): void {
	ctx.pianoRollSeekSurfaces.forEach((surface: PianoRollSeekSurfaceMetadata) => {
		const timelineContext = timelineContextResolver
			? timelineContextResolver(surface)
			: null;
		const safeDuration = timelineContext
			? sanitizeDuration(timelineContext.duration)
			: resolvePianoRollTimelineDuration(
					surface,
					state.longestDuration,
					usePianoRollLocalTimeline,
				);
		const position = timelineContext
			? clamp(
					timelineContext.playbackPosition?.() ??
						timelineContext.fromReferenceTime(state.position),
					0,
					safeDuration,
				)
			: resolvePianoRollTimelinePosition(
					surface,
					state.position,
					state.longestDuration,
					usePianoRollLocalTimeline,
				);
		const loopPointA =
			state.loop?.pointA === null || state.loop?.pointA === undefined
				? null
				: timelineContext
					? clamp(
							timelineContext.fromReferenceTime(state.loop.pointA),
							0,
							safeDuration,
						)
					: clamp(state.loop.pointA, 0, safeDuration);
		const loopPointB =
			state.loop?.pointB === null || state.loop?.pointB === undefined
				? null
				: timelineContext
					? clamp(
							timelineContext.fromReferenceTime(state.loop.pointB),
							0,
							safeDuration,
						)
					: clamp(state.loop.pointB, 0, safeDuration);
		surface.lastPlayheadRatio = safeDuration > 0 ? position / safeDuration : 0;
		// This runs on every 16 ms playback tick, so bail out early when nothing
		// observable changed since the previous one.
		const playbackKey = [
			Math.round(position * 1000),
			Math.round(safeDuration * 1000),
			loopPointA === null ? "-" : Math.round(loopPointA * 1000),
			loopPointB === null ? "-" : Math.round(loopPointB * 1000),
			state.loop?.enabled === true ? "1" : "0",
			suppressPlaybackFollow ? "1" : "0",
		].join("#");
		if (surface.lastPlaybackKey === playbackKey) {
			return;
		}
		surface.lastPlaybackKey = playbackKey;

		refreshPianoRollKeyboard(surface, position);

		ctx.updateSeekWrapVisuals(surface.seekWrap, position, safeDuration, {
			pointA: loopPointA,
			pointB: loopPointB,
			enabled: state.loop?.enabled === true,
		});

		if (surface.timingNode) {
			// A piano-roll surface always shows its own file's clock, so it reads out
			// in the unit its own alignment column was declared in.
			const timeline = surface.mediaId;
			surface.timingNode.textContent = ctx.formatLocalTimelinePair(
				timeline,
				position,
				safeDuration,
			);
		}

		if (!suppressPlaybackFollow && safeDuration > 0) {
			const scrollLeft = resolveTimelinePlaybackFollowScrollLeft(
				surface,
				position / safeDuration,
			);
			// Writing scrollLeft and then reading layout back would force a
			// synchronous reflow every tick. The native scroll event already
			// refreshes the minimap viewport and the note tiles, including on
			// each frame of an animated seek.
			if (
				Number.isFinite(scrollLeft) &&
				scrollLeft !== surface.lastFollowScrollLeft
			) {
				surface.lastFollowScrollLeft = scrollLeft as number;
				applyTimelineFollowScrollLeft(
					surface,
					scrollLeft as number,
					animate,
					() => {},
				);
			}
		}
	});
}

/**
 * The pitches sounding at `position`, each with the colours of the channels
 * playing it, by ascending channel. A pitch two channels hold at once lights its
 * key with both.
 */
function collectSoundingPitches(
	surface: PianoRollSeekSurfaceMetadata,
	position: number,
): Map<number, string[]> {
	const sounding = new Map<number, number[]>();
	const notes = surface.notes;
	const startIndex = findFirstVisibleNoteIndex(
		notes,
		position - surface.maxNoteDuration,
	);
	for (let index = startIndex; index < notes.length; index += 1) {
		const note = notes[index];
		if (note.time > position) {
			break;
		}

		if (
			note.time + note.duration <= position ||
			surface.hiddenChannels.has(note.channel)
		) {
			continue;
		}

		const channels = sounding.get(note.midi);
		if (channels) {
			if (!channels.includes(note.channel)) {
				channels.push(note.channel);
			}
		} else {
			sounding.set(note.midi, [note.channel]);
		}
	}

	const colors = new Map<number, string[]>();
	sounding.forEach((channels, midi) => {
		colors.set(
			midi,
			channels
				.sort((a, b) => a - b)
				.map(
					(channel) => resolvePianoRollChannelColors(surface, channel).velocity,
				),
		);
	});
	return colors;
}

/** Redraws the keyboard column, but only when what it shows has changed. */
function refreshPianoRollKeyboard(
	surface: PianoRollSeekSurfaceMetadata,
	position: number,
): void {
	const canvas = surface.keyboardCanvas;
	if (!canvas) {
		return;
	}

	surface.lastKeyboardPosition = position;
	const active = collectSoundingPitches(surface, position);
	const drawKey = [
		surface.minMidi,
		surface.maxMidi,
		surface.originalHeight,
		canvas.clientWidth,
		Math.max(1, window.devicePixelRatio || 1),
		[...active]
			.sort((a, b) => a[0] - b[0])
			.map(([midi, colors]) => `${midi}:${colors.join("|")}`)
			.join(","),
	].join("#");
	if (surface.lastKeyboardKey === drawKey) {
		return;
	}

	surface.lastKeyboardKey = drawKey;
	if (!surface.keyboardColors) {
		surface.keyboardColors = resolvePianoRollKeyboardColors(canvas);
	}

	drawPianoRollKeyboard(canvas, {
		minMidi: surface.minMidi,
		maxMidi: surface.maxMidi,
		height: surface.originalHeight,
		colors: surface.keyboardColors,
		active,
	});
}

export function findPianoRollSurface(
	ctx: ViewRenderer,
	seekWrap: HTMLElement | null,
): PianoRollSeekSurfaceMetadata | null {
	if (!seekWrap) {
		return null;
	}

	for (const surface of ctx.pianoRollSeekSurfaces) {
		if (surface.seekWrap === seekWrap) {
			return surface;
		}
	}

	return null;
}

export function getPianoRollZoom(
	ctx: ViewRenderer,
	seekWrap: HTMLElement,
): number | null {
	const surface = ctx.findPianoRollSurface(seekWrap);
	return surface ? surface.zoom : null;
}

export function isPianoRollZoomEnabled(
	ctx: ViewRenderer,
	seekWrap: HTMLElement,
	durationSeconds: number,
): boolean {
	const surface = ctx.findPianoRollSurface(seekWrap);
	return surface
		? getPianoRollMaximumZoom(surface, durationSeconds) > MIN_PIANO_ROLL_ZOOM
		: false;
}

export function setPianoRollZoom(
	ctx: ViewRenderer,
	seekWrap: HTMLElement,
	zoom: number,
	durationSeconds: number,
	anchorPageX?: number,
): boolean {
	const surface = ctx.findPianoRollSurface(seekWrap);
	if (!surface) {
		return false;
	}

	const changed = setPianoRollZoomForSurface(
		surface,
		zoom,
		getPianoRollMaximumZoom(surface, durationSeconds),
		anchorPageX,
	);
	if (changed) {
		// Geometry is applied synchronously above so the anchor stays under the
		// cursor; the redraw is coalesced to one per frame.
		ctx.latestPianoRollRenderInput = {
			timelineDuration: durationSeconds,
			usePianoRollLocalTimeline: false,
		};
		updateTimelineZoomIndicators(ctx.pianoRollSeekSurfaces);
		ctx.schedulePianoRollNoteRefresh();
	}
	return changed;
}

export function getPianoRollMinimapViewport(
	ctx: ViewRenderer,
	seekWrap: HTMLElement,
): { startRatio: number; widthRatio: number } | null {
	const surface = ctx.findPianoRollSurface(seekWrap);
	return surface ? getPianoRollViewportState(surface) : null;
}

export function setPianoRollMinimapViewportStart(
	ctx: ViewRenderer,
	seekWrap: HTMLElement,
	startRatio: number,
): boolean {
	const surface = ctx.findPianoRollSurface(seekWrap);
	if (!surface) {
		return false;
	}

	const viewportState = getPianoRollViewportState(surface);
	const maxStartRatio = Math.max(0, 1 - viewportState.widthRatio);
	const nextStartRatio = clamp(startRatio, 0, maxStartRatio);
	// The minimap shows the file, so a ratio on it is a ratio of the time
	// width; the scroll it maps to is bounded by the padded surface.
	const nextScrollLeft = nextStartRatio * getTimelineTimeWidth(surface);
	const maxScrollLeft = Math.max(
		0,
		getTimelineSurfaceWidth(surface) - surface.scrollContainer.clientWidth,
	);
	const clampedScrollLeft = clamp(nextScrollLeft, 0, maxScrollLeft);
	if (
		Math.abs(clampedScrollLeft - surface.scrollContainer.scrollLeft) < 0.000001
	) {
		updateTimelineMinimapViewport(surface);
		return false;
	}

	surface.scrollContainer.scrollLeft = clampedScrollLeft;
	updateTimelineMinimapViewport(surface);
	return true;
}

export function destroyPianoRollDisplays(ctx: ViewRenderer): void {
	if (ctx.pianoRollNoteRefreshFrameId !== null) {
		cancelAnimationFrame(ctx.pianoRollNoteRefreshFrameId);
		ctx.pianoRollNoteRefreshFrameId = null;
	}
	ctx.pianoRollSeekSurfaces.forEach((surface) => {
		if (surface.scrollAnimation) {
			cancelAnimationFrame(surface.scrollAnimation.rafId);
		}
	});
	ctx.latestPianoRollRenderInput = null;
	ctx.pianoRollSeekSurfaces.length = 0;
}

/**
 * The keyboard column beside a piano roll. Its near edge — the one the notes
 * fly into — carries one row per semitone, exactly the grid the roll draws on,
 * so a note bar meets its key. Its far edge carries seven equal white keys per
 * octave, with the black keys stopping short of it, which is what makes the
 * column read as a keyboard rather than as a strip of twelve equal slots.
 */

/** Share of the column the black keys reach, measured from the note edge. */
const BLACK_KEY_LENGTH_RATIO = 0.7;
/** A label needs at least this much white key to sit in. */
const LABEL_MIN_KEY_HEIGHT = 9;
const LABEL_FONT_SIZE = 9;

interface PianoRollKeyboardColors {
	white: string;
	black: string;
	border: string;
	label: string;
	labelFont: string;
}

interface PianoRollKeyboardOptions {
	minMidi: number;
	maxMidi: number;
	height: number;
	colors: PianoRollKeyboardColors;
	/**
	 * Sounding pitches, each with the colours lighting its key in channel order.
	 * Several colours split the key along its length, one box each.
	 */
	active: ReadonlyMap<number, string[]>;
}

function resolvePianoRollKeyboardColors(
	canvas: HTMLCanvasElement,
): PianoRollKeyboardColors {
	const computed = getComputedStyle(canvas);
	const read = (property: string, fallback: string): string =>
		computed.getPropertyValue(property).trim() || fallback;
	return {
		white: read("--piano-roll-keyboard-white", "#ffffff"),
		black: read("--piano-roll-keyboard-black", "#222222"),
		border: read("--piano-roll-keyboard-border", "rgba(0, 0, 0, 0.35)"),
		label: read("--piano-roll-keyboard-label", "#808080"),
		labelFont: `${LABEL_FONT_SIZE}px ${read("--ts-font-ui", "sans-serif")}`,
	};
}

const SEMITONES_PER_OCTAVE = 12;
/** Position of each semitone in the white-key sequence; -1 for a black key. */
const WHITE_INDEX_IN_OCTAVE = [0, -1, 1, -1, 2, 3, -1, 4, -1, 5, -1, 6];

/**
 * Two white keys meet with no black key between them — B/C and E/F — so those
 * two boundaries are the only ones drawn out in the open, and they have to land
 * exactly on the semitone row they share or the key visibly kinks there. Every
 * other boundary hides under a black key, which swallows the step between the
 * band and the row. So the octave is cut at E/F and each half shares its
 * semitones evenly: C D E over five, F G A B over seven. The two resulting key
 * heights are 5/3 and 7/4 of a row — a 5% difference, invisible beside the
 * crinkle that forcing all seven to 12/7 would leave at every E/F.
 */
const LOWER_WHITE_KEYS = 3;
const UPPER_WHITE_KEYS = 4;
const LOWER_SEMITONES = 5;
const UPPER_SEMITONES = SEMITONES_PER_OCTAVE - LOWER_SEMITONES;

/**
 * A white key's far-side band, in semitones, anchored to its own pitch rather
 * than to whatever keys happen to be visible — spreading bands over the visible
 * range instead would drift against the semitone rows on any range that is not
 * a whole number of octaves, and a key would end up stepping clear of its row.
 */
function whiteKeyBand(midi: number): { bottom: number; top: number } {
	const octave = Math.floor(midi / SEMITONES_PER_OCTAVE);
	const index = WHITE_INDEX_IN_OCTAVE[midi - octave * SEMITONES_PER_OCTAVE];
	const inLowerHalf = index < LOWER_WHITE_KEYS;
	const height = inLowerHalf
		? LOWER_SEMITONES / LOWER_WHITE_KEYS
		: UPPER_SEMITONES / UPPER_WHITE_KEYS;
	const bottom =
		octave * SEMITONES_PER_OCTAVE +
		(inLowerHalf
			? index * height
			: LOWER_SEMITONES + (index - LOWER_WHITE_KEYS) * height);
	return { bottom, top: bottom + height };
}

/**
 * Every white key whose far-side band can reach the drawing, from the highest
 * pitch down. The band of a key is wider than its row, so the keys just past
 * each end still have to be drawn — clipped — for the column to look continuous.
 */
function collectWhiteKeys(minMidi: number, maxMidi: number): number[] {
	const whiteKeys: number[] = [];
	for (let midi = maxMidi + 2; midi >= minMidi - 2; midi -= 1) {
		if (!isBlackKey(midi)) {
			whiteKeys.push(midi);
		}
	}
	return whiteKeys;
}

/** The two horizontal boundaries a key spans: on the far edge, and on the note edge. */
interface KeyBands {
	farTop: number;
	farBottom: number;
	nearTop: number;
	nearBottom: number;
}

/**
 * The far band (7 keys/octave) and the near row (12 keys/octave) rarely line
 * up, so every white key is a step rather than a rectangle: a tall slab out to
 * `blackStart` at the far band's height, then a one-row tongue reaching the
 * near edge, flush with the black keys beside it. The two heights meet on a
 * vertical segment at `blackStart`, so the key is drawn from horizontals and
 * verticals only — no diagonal, which is what a real keyboard looks like.
 * How far the step juts either way differs per key, exactly as the notches
 * between the black keys of a piano do.
 */
function traceWhiteKey(
	context: CanvasRenderingContext2D,
	bands: KeyBands,
	blackStart: number,
	width: number,
): void {
	const { farTop, farBottom, nearTop, nearBottom } = bands;
	context.beginPath();
	context.moveTo(0, farTop);
	context.lineTo(blackStart, farTop);
	context.lineTo(blackStart, nearTop);
	context.lineTo(width, nearTop);
	context.lineTo(width, nearBottom);
	context.lineTo(blackStart, nearBottom);
	context.lineTo(blackStart, farBottom);
	context.lineTo(0, farBottom);
	context.closePath();
}

/** Fills a box with the colours of everything sounding on it, side by side. */
function fillActiveBoxes(
	context: CanvasRenderingContext2D,
	colors: string[],
	left: number,
	top: number,
	width: number,
	height: number,
): void {
	const boxWidth = width / colors.length;
	colors.forEach((color, index) => {
		context.fillStyle = color;
		context.fillRect(left + index * boxWidth, top, boxWidth, height);
	});
}

function drawPianoRollKeyboard(
	canvas: HTMLCanvasElement,
	options: PianoRollKeyboardOptions,
): void {
	const width = Math.max(1, canvas.clientWidth);
	const height = Math.max(1, options.height);
	const context = resizeCanvasForCssSize(canvas, width, height);
	if (!context) {
		return;
	}

	const { minMidi, maxMidi, colors, active } = options;
	const range = Math.max(1, maxMidi - minMidi + 1);
	const rowHeight = height / range;
	const blackStart = width * (1 - BLACK_KEY_LENGTH_RATIO);
	const whiteKeys = collectWhiteKeys(minMidi, maxMidi);
	// The pitch axis in canvas coordinates, in semitones rather than in rows, so
	// the far-side bands — 12 rows to every 7 keys — can be placed on it.
	const semitoneY = (semitone: number): number =>
		(maxMidi + 1 - semitone) * rowHeight;
	const nearTop = (midi: number): number => semitoneY(midi + 1);

	context.lineWidth = 1;
	context.strokeStyle = colors.border;
	context.textBaseline = "middle";
	context.font = colors.labelFont;

	whiteKeys.forEach((midi) => {
		const band = whiteKeyBand(midi);
		const bands: KeyBands = {
			farTop: semitoneY(band.top),
			farBottom: semitoneY(band.bottom),
			nearTop: nearTop(midi),
			nearBottom: nearTop(midi) + rowHeight,
		};
		traceWhiteKey(context, bands, blackStart, width);
		context.fillStyle = colors.white;
		context.fill();

		const activeColors = active.get(midi);
		if (activeColors && activeColors.length > 0) {
			context.save();
			context.clip();
			fillActiveBoxes(
				context,
				activeColors,
				0,
				Math.min(bands.farTop, bands.nearTop),
				width,
				Math.max(bands.farBottom, bands.nearBottom) -
					Math.min(bands.farTop, bands.nearTop),
			);
			context.restore();
		}

		context.stroke();

		if (
			midi % SEMITONES_PER_OCTAVE === 0 &&
			bands.farBottom - bands.farTop >= LABEL_MIN_KEY_HEIGHT
		) {
			context.fillStyle = colors.label;
			context.fillText(
				formatMidiNoteName(midi),
				3,
				(bands.farTop + bands.farBottom) / 2,
			);
		}
	});

	// Black keys last: they overlap the white keys they sit between, and are
	// short, so the far half of the column stays a plain seven-key octave.
	for (let midi = maxMidi; midi >= minMidi; midi -= 1) {
		if (!isBlackKey(midi)) {
			continue;
		}

		const top = nearTop(midi);
		context.fillStyle = colors.black;
		context.fillRect(blackStart, top, width - blackStart, rowHeight);

		const activeColors = active.get(midi);
		if (activeColors && activeColors.length > 0) {
			fillActiveBoxes(
				context,
				activeColors,
				blackStart,
				top,
				width - blackStart,
				rowHeight,
			);
		}

		context.strokeRect(
			blackStart,
			top + 0.5,
			width - blackStart,
			rowHeight - 1,
		);
	}
}
