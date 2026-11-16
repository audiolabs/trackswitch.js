import {
	BasicMIDI,
	type BasicSoundBank,
	SoundBankLoader,
	SpessaSynthProcessor,
	SpessaSynthSequencer,
} from "spessasynth_core";

/** Seconds rendered past the last event, so releases and reverb tails die away. */
const TAIL_SECONDS = 2;
/**
 * The interval between modulator and LFO updates, so small. Rendering one block
 * is fast; the render hands the thread back to the page every few of them.
 */
const RENDER_BLOCK_SAMPLES = 128;
const BLOCKS_PER_YIELD = 400;

const soundBanks = new Map<string, Promise<BasicSoundBank>>();

/**
 * Parses a sound font once per URL: every MIDI track of a player renders from the
 * same bank, and a General MIDI font is far too large to fetch and parse each time.
 */
function loadSoundBank(
	url: string,
	requestArrayBuffer: (url: string) => Promise<ArrayBuffer>,
): Promise<BasicSoundBank> {
	let bank = soundBanks.get(url);
	if (!bank) {
		bank = requestArrayBuffer(url).then((bytes) =>
			SoundBankLoader.fromArrayBuffer(bytes),
		);
		soundBanks.set(url, bank);
	}
	return bank;
}

function yieldToPage(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

/**
 * Plays a MIDI file through a sound font into a stereo buffer, in one pass ahead
 * of playback. The result is an ordinary audio buffer, so a synthesized track
 * solos, pans, seeks and aligns like any recorded one.
 */
export async function renderMidiToBuffer(
	context: BaseAudioContext,
	midiBytes: ArrayBuffer,
	soundFontUrl: string,
	requestArrayBuffer: (url: string) => Promise<ArrayBuffer>,
): Promise<AudioBuffer> {
	const midi = BasicMIDI.fromArrayBuffer(midiBytes);
	const soundBank = await loadSoundBank(soundFontUrl, requestArrayBuffer);

	const sampleRate = context.sampleRate;
	const synth = new SpessaSynthProcessor(sampleRate, { eventsEnabled: false });
	synth.soundBankManager.addSoundBank(soundBank, "main");
	await synth.ready;
	// A dense passage must not drop notes; an offline render has no deadline.
	synth.setSystemParameter("autoAllocateVoices", true);

	const sequencer = new SpessaSynthSequencer(synth);
	// The first note keeps its place in the file: the track has to line up with
	// the piano roll and the alignment, both of which count from the file's start.
	sequencer.skipToFirstNoteOn = false;
	sequencer.loadNewSongList([midi]);
	sequencer.play();

	const sampleCount = Math.ceil(sampleRate * (midi.duration + TAIL_SECONDS));
	const left = new Float32Array(sampleCount);
	const right = new Float32Array(sampleCount);
	let filled = 0;
	let blocks = 0;
	while (filled < sampleCount) {
		sequencer.processTick();
		const blockSize = Math.min(RENDER_BLOCK_SAMPLES, sampleCount - filled);
		synth.process(left, right, filled, blockSize);
		filled += blockSize;
		blocks += 1;
		if (blocks % BLOCKS_PER_YIELD === 0) {
			await yieldToPage();
		}
	}

	const buffer = context.createBuffer(2, sampleCount, sampleRate);
	buffer.copyToChannel(left, 0);
	buffer.copyToChannel(right, 1);
	return buffer;
}
