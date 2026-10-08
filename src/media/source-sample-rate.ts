/**
 * The sample rate an encoded audio file was authored in.
 *
 * `decodeAudioData` resamples everything to the AudioContext's rate, so a
 * decoded `AudioBuffer` reports the output device's rate rather than the file's.
 * An alignment column declared in `samples` means sample indices of the file,
 * so the rate has to be read out of the container header instead — see
 * `src/timeline/media-profile.ts`.
 */
export function readSourceSampleRate(bytes: ArrayBuffer): number | null {
	const view = new DataView(bytes);
	return (
		readWavSampleRate(view) ??
		readFlacSampleRate(view) ??
		readOggSampleRate(view) ??
		readIsoBmffSampleRate(view) ??
		readMpegSampleRate(view)
	);
}

function hasAscii(view: DataView, offset: number, ascii: string): boolean {
	if (offset + ascii.length > view.byteLength) {
		return false;
	}
	for (let index = 0; index < ascii.length; index += 1) {
		if (view.getUint8(offset + index) !== ascii.charCodeAt(index)) {
			return false;
		}
	}
	return true;
}

function plausible(rate: number): number | null {
	return Number.isFinite(rate) && rate >= 1000 && rate <= 768000 ? rate : null;
}

/** RIFF/WAVE and RF64: the rate sits in the `fmt ` chunk. */
function readWavSampleRate(view: DataView): number | null {
	const isRiff = hasAscii(view, 0, "RIFF") || hasAscii(view, 0, "RF64");
	if (!isRiff || !hasAscii(view, 8, "WAVE")) {
		return null;
	}

	let offset = 12;
	while (offset + 8 <= view.byteLength) {
		const chunkSize = view.getUint32(offset + 4, true);
		if (hasAscii(view, offset, "fmt ") && offset + 12 <= view.byteLength) {
			return plausible(view.getUint32(offset + 12, true));
		}
		offset += 8 + chunkSize + (chunkSize % 2);
	}
	return null;
}

/** FLAC: 20 bits at the start of the mandatory STREAMINFO block. */
function readFlacSampleRate(view: DataView): number | null {
	if (!hasAscii(view, 0, "fLaC") || view.byteLength < 30) {
		return null;
	}
	const streamInfo = 8;
	const packed = view.getUint32(streamInfo + 10, false);
	return plausible(packed >>> 12);
}

/** Ogg: the rate lives in the first packet of the logical bitstream. */
function readOggSampleRate(view: DataView): number | null {
	if (!hasAscii(view, 0, "OggS") || view.byteLength < 28) {
		return null;
	}

	const segmentCount = view.getUint8(26);
	const packet = 27 + segmentCount;

	// Vorbis identification header: "\x01vorbis" then version and channels.
	if (hasAscii(view, packet + 1, "vorbis") && view.getUint8(packet) === 1) {
		return plausible(view.getUint32(packet + 12, true));
	}
	// Opus always decodes at 48 kHz; the header's rate is the original input rate.
	if (hasAscii(view, packet, "OpusHead")) {
		return plausible(view.getUint32(packet + 12, true));
	}
	return null;
}

const ISO_BMFF_CONTAINER_BOXES = new Set([
	"moov",
	"trak",
	"mdia",
	"minf",
	"stbl",
]);

/**
 * MP4/M4A: descends the box tree to `stsd`, whose first sample entry carries the
 * rate as a 16.16 fixed-point number.
 */
function readIsoBmffSampleRate(view: DataView): number | null {
	if (!hasAscii(view, 4, "ftyp")) {
		return null;
	}
	return findStsdSampleRate(view, 0, view.byteLength);
}

function findStsdSampleRate(
	view: DataView,
	start: number,
	end: number,
): number | null {
	let offset = start;
	while (offset + 8 <= end) {
		const boxSize = view.getUint32(offset, false);
		if (boxSize < 8) {
			return null;
		}
		const boxEnd = Math.min(offset + boxSize, end);

		if (hasAscii(view, offset + 4, "stsd")) {
			// 4 bytes version/flags, 4 bytes entry count, then the first entry:
			// 8 bytes size and type, 8 bytes reserved, 2 channels, 2 sample size,
			// 2 pre-defined, 2 reserved, then the 16.16 rate.
			const rateOffset = offset + 8 + 8 + 8 + 8 + 8;
			if (rateOffset + 2 > view.byteLength) {
				return null;
			}
			return plausible(view.getUint16(rateOffset, false));
		}

		if (ISO_BMFF_CONTAINER_BOXES.has(readBoxType(view, offset + 4))) {
			const nested = findStsdSampleRate(view, offset + 8, boxEnd);
			if (nested !== null) {
				return nested;
			}
		}

		offset = boxEnd;
	}
	return null;
}

function readBoxType(view: DataView, offset: number): string {
	if (offset + 4 > view.byteLength) {
		return "";
	}
	return String.fromCharCode(
		view.getUint8(offset),
		view.getUint8(offset + 1),
		view.getUint8(offset + 2),
		view.getUint8(offset + 3),
	);
}

/** Sample rates per MPEG version index, indexed by the two-bit rate index. */
const MPEG_SAMPLE_RATES: Record<number, readonly number[]> = {
	// MPEG 2.5, reserved, MPEG 2, MPEG 1
	0: [11025, 12000, 8000],
	2: [22050, 24000, 16000],
	3: [44100, 48000, 32000],
};

/** MPEG audio (MP3): the first frame header after any ID3v2 tag. */
function readMpegSampleRate(view: DataView): number | null {
	let offset = 0;
	if (hasAscii(view, 0, "ID3") && view.byteLength >= 10) {
		const size =
			(view.getUint8(6) << 21) |
			(view.getUint8(7) << 14) |
			(view.getUint8(8) << 7) |
			view.getUint8(9);
		offset = 10 + size;
	}

	const limit = Math.min(view.byteLength - 4, offset + 65536);
	for (; offset <= limit; offset += 1) {
		if (view.getUint8(offset) !== 0xff) {
			continue;
		}
		if ((view.getUint8(offset + 1) & 0xe0) !== 0xe0) {
			continue;
		}
		const versionIndex = (view.getUint8(offset + 1) >> 3) & 0x03;
		const rateIndex = (view.getUint8(offset + 2) >> 2) & 0x03;
		const rates = MPEG_SAMPLE_RATES[versionIndex];
		if (!rates || rateIndex === 3) {
			continue;
		}
		return plausible(rates[rateIndex]);
	}
	return null;
}
