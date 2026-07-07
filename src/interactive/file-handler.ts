import { Midi } from "@tonejs/midi";
import { SAMPLE_RATE } from "./constants";
import type {
	InteractiveFile,
	InteractiveFileType,
	InteractiveMidiNote,
} from "./types";

let idCounter = 0;

function generateFileId(): string {
	idCounter += 1;
	return `ifile-${idCounter}-${Date.now()}`;
}

const AUDIO_EXTENSIONS = new Set([
	".wav",
	".mp3",
	".ogg",
	".flac",
	".m4a",
	".aac",
	".webm",
]);
const MUSICXML_EXTENSIONS = new Set([".xml", ".musicxml", ".mxl"]);
const MIDI_EXTENSIONS = new Set([".mid", ".midi"]);

function getExtension(filename: string): string {
	const dot = filename.lastIndexOf(".");
	return dot >= 0 ? filename.substring(dot).toLowerCase() : "";
}

export function classifyFileType(file: File): InteractiveFileType | null {
	const ext = getExtension(file.name);
	if (AUDIO_EXTENSIONS.has(ext)) {
		return "audio";
	}
	if (MUSICXML_EXTENSIONS.has(ext)) {
		return "musicxml";
	}
	if (MIDI_EXTENSIONS.has(ext)) {
		return "midi";
	}
	return null;
}

export function readFileAsText(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			resolve(reader.result as string);
		};
		reader.onerror = () => {
			reject(new Error(`Failed to read file: ${file.name}`));
		};
		reader.readAsText(file);
	});
}

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			resolve(reader.result as ArrayBuffer);
		};
		reader.onerror = () => {
			reject(new Error(`Failed to read file: ${file.name}`));
		};
		reader.readAsArrayBuffer(file);
	});
}

export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
	const arrayBuffer = await readFileAsArrayBuffer(file);
	const audioContext = new AudioContext();
	try {
		return await audioContext.decodeAudioData(arrayBuffer);
	} finally {
		await audioContext.close();
	}
}

export async function resampleToMono(
	audioBuffer: AudioBuffer,
	targetSampleRate: number,
): Promise<Float32Array> {
	const totalSamples = Math.ceil(audioBuffer.duration * targetSampleRate);
	const offline = new OfflineAudioContext(1, totalSamples, targetSampleRate);
	const source = offline.createBufferSource();
	source.buffer = audioBuffer;
	source.connect(offline.destination);
	source.start();
	const resampled = await offline.startRendering();
	return resampled.getChannelData(0);
}

export async function processAudioFile(file: File): Promise<InteractiveFile> {
	const audioBuffer = await decodeAudioFile(file);
	const pcmData = await resampleToMono(audioBuffer, SAMPLE_RATE);
	const fullPcmChannels: Float32Array[] = [];

	for (
		let channelIndex = 0;
		channelIndex < audioBuffer.numberOfChannels;
		channelIndex += 1
	) {
		fullPcmChannels.push(
			new Float32Array(audioBuffer.getChannelData(channelIndex)),
		);
	}

	return {
		id: generateFileId(),
		name: file.name,
		type: "audio",
		file: file,
		pcmData: pcmData,
		fullPcmChannels: fullPcmChannels,
		sampleRate: audioBuffer.sampleRate,
		duration: audioBuffer.duration,
	};
}

export async function processMusicXmlFile(
	file: File,
): Promise<InteractiveFile> {
	const xmlText = await readFileAsText(file);
	return {
		id: generateFileId(),
		name: file.name,
		type: "musicxml",
		file: file,
		xmlText: xmlText,
	};
}

function flattenMidiNotes(
	midi: Midi,
	fileName: string,
): {
	notes: InteractiveMidiNote[];
	duration: number;
} {
	const notes: InteractiveMidiNote[] = [];
	let duration = 0;

	midi.tracks.forEach((track) => {
		track.notes.forEach((note) => {
			const start = Number(note.time);
			const noteDuration = Number(note.duration);
			const pitch = Number(note.midi);
			const velocity = Number(note.velocity);
			if (
				!Number.isFinite(start) ||
				!Number.isFinite(noteDuration) ||
				!Number.isFinite(pitch) ||
				noteDuration < 0
			) {
				return;
			}

			notes.push({
				midi: Math.round(pitch),
				time: Math.max(0, start),
				duration: noteDuration,
				velocity: Number.isFinite(velocity) ? Math.max(0, velocity) : 0,
			});
			duration = Math.max(duration, Math.max(0, start) + noteDuration);
		});
	});

	notes.sort((a, b) => a.time - b.time || a.midi - b.midi);

	if (notes.length === 0 || !Number.isFinite(duration) || duration <= 0) {
		throw new Error(`MIDI file contains no note events: ${fileName}`);
	}

	return {
		notes: notes,
		duration: duration,
	};
}

export async function processMidiFile(file: File): Promise<InteractiveFile> {
	const arrayBuffer = await readFileAsArrayBuffer(file);
	const midi = new Midi(arrayBuffer);
	const parsed = flattenMidiNotes(midi, file.name);

	return {
		id: generateFileId(),
		name: file.name,
		type: "midi",
		file: file,
		midiNotes: parsed.notes,
		midiDuration: parsed.duration,
		duration: parsed.duration,
	};
}

export async function processFile(file: File): Promise<InteractiveFile> {
	const fileType = classifyFileType(file);
	if (fileType === "audio") {
		return processAudioFile(file);
	}
	if (fileType === "musicxml") {
		return processMusicXmlFile(file);
	}
	if (fileType === "midi") {
		return processMidiFile(file);
	}
	throw new Error(`Unsupported file type: ${file.name}`);
}

export function stripExtension(filename: string): string {
	const dot = filename.lastIndexOf(".");
	return dot > 0 ? filename.substring(0, dot) : filename;
}

/** Keep the original filename for visible UI labels. */
export function fileNameToDisplayTitle(filename: string): string {
	return stripExtension(filename);
}

/** Sanitize a filename into a valid CSV column name. */
export function fileNameToColumnName(filename: string): string {
	return `time_${stripExtension(filename).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/** Measure column name matching the Python pipeline's naming convention. */
export function fileNameToMeasureColumnName(filename: string): string {
	return `measure_${stripExtension(filename).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function uniquifyColumnName(baseName: string, seenNames: Set<string>): string {
	let candidate = baseName;
	let suffix = 2;

	while (seenNames.has(candidate)) {
		candidate = `${baseName}_${suffix}`;
		suffix += 1;
	}

	seenNames.add(candidate);
	return candidate;
}

export function buildUniqueAlignmentColumnMaps(files: InteractiveFile[]): {
	timeColumnByFileId: Record<string, string>;
	measureColumnByFileId: Record<string, string>;
} {
	const timeColumnByFileId: Record<string, string> = {};
	const measureColumnByFileId: Record<string, string> = {};
	const seenTimeColumns = new Set<string>();
	const seenMeasureColumns = new Set<string>();

	files.forEach((file) => {
		timeColumnByFileId[file.id] = uniquifyColumnName(
			fileNameToColumnName(file.name),
			seenTimeColumns,
		);
		measureColumnByFileId[file.id] = uniquifyColumnName(
			fileNameToMeasureColumnName(file.name),
			seenMeasureColumns,
		);
	});

	return {
		timeColumnByFileId: timeColumnByFileId,
		measureColumnByFileId: measureColumnByFileId,
	};
}
