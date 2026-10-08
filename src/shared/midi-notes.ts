/**
 * Note numbers and the names they are written with. Scientific pitch notation,
 * with middle C as C4 = 60 — the same naming `@tonejs/midi` puts on `note.name`,
 * so a range authored as `"C4"` names the pitch the file calls `C4`.
 */

export const MIN_MIDI_NOTE = 0;
export const MAX_MIDI_NOTE = 127;

/** Semitone offset within the octave, by letter. */
const SEMITONE_BY_LETTER: Record<string, number> = {
	C: 0,
	D: 2,
	E: 4,
	F: 5,
	G: 7,
	A: 9,
	B: 11,
};

/** Sharp spellings, which is what a note number is rendered back as. */
const NAME_BY_SEMITONE = [
	"C",
	"C#",
	"D",
	"D#",
	"E",
	"F",
	"F#",
	"G",
	"G#",
	"A",
	"A#",
	"B",
];

const NOTE_NAME_PATTERN = /^([A-Ga-g])([#b♯♭s]*)(-?\d+)$/;

export function isBlackKey(midi: number): boolean {
	return NAME_BY_SEMITONE[((midi % 12) + 12) % 12].length > 1;
}

export function formatMidiNoteName(midi: number): string {
	const semitone = ((midi % 12) + 12) % 12;
	return `${NAME_BY_SEMITONE[semitone]}${Math.floor(midi / 12) - 1}`;
}

/**
 * A note reference as configuration writes it: a raw note number, or a name
 * like `C4`, `F#3`, `Bb-1`. Returns null for anything that is neither, so the
 * caller can raise an error naming the property it came from.
 */
export function parseMidiNoteRef(value: unknown): number | null {
	if (typeof value === "number") {
		return Number.isInteger(value) &&
			value >= MIN_MIDI_NOTE &&
			value <= MAX_MIDI_NOTE
			? value
			: null;
	}

	if (typeof value !== "string") {
		return null;
	}

	const match = NOTE_NAME_PATTERN.exec(value.trim());
	if (!match) {
		return null;
	}

	const [, letter, accidentals, octave] = match;
	let midi =
		SEMITONE_BY_LETTER[letter.toUpperCase()] + (Number(octave) + 1) * 12;
	for (const accidental of accidentals) {
		midi += accidental === "b" || accidental === "♭" ? -1 : 1;
	}

	return midi >= MIN_MIDI_NOTE && midi <= MAX_MIDI_NOTE ? midi : null;
}
