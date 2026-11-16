/**
 * Alignment Web Worker.
 *
 * Loads Pyodide, installs shims for unavailable packages (numba, libfmp, etc.),
 * installs synctoolbox, and runs the alignment pipeline on demand.
 */

import { SAMPLE_RATE } from "../constants";
import { getAlignmentMethod } from "../methods/alignment-method";
import type {
	WorkerComputeResult,
	WorkerMessage,
	WorkerResponse,
} from "../types";
import {
	ALIGNMENT_PIPELINE,
	CONVERT_INPUTS,
	DTW_SPEEDUP,
	INSTALL_MUSIC21,
	INSTALL_PACKAGES,
	SHIMS,
} from "./python-scripts";

declare const self: Worker & {
	addEventListener: (
		type: string,
		listener: (event: MessageEvent) => void,
	) => void;
	location: { href: string };
};

interface PyodideInterface {
	runPythonAsync(code: string): Promise<unknown>;
	loadPackage(packages: string | string[]): Promise<void>;
	globals: {
		set(key: string, value: unknown): void;
		get(key: string): unknown;
	};
	toPy(value: unknown): unknown;
}

interface PyodideModule {
	loadPyodide(options: { indexURL: string }): Promise<PyodideInterface>;
}

let pyodide: PyodideInterface | null = null;
let synctoolboxInstalled = false;
let music21Installed = false;

function postResponse(response: WorkerResponse): void {
	self.postMessage(response);
}

function postResult(result: WorkerComputeResult): void {
	const transferables = result.synchronizedAudio.map((entry) => entry.wavData);
	self.postMessage({ type: "result", result: result }, transferables);
}

function postProgress(message: string): void {
	postResponse({ type: "progress", message: message });
}

async function initializePyodide(cdnUrl: string): Promise<void> {
	if (!cdnUrl.startsWith("https://")) {
		throw new Error("pyodideCdnUrl must be an HTTPS URL");
	}

	// Init progress: 0% → ~15% of the overall compute pipeline.
	// If init already happened in the background, compute starts at 0% anyway.
	postProgress("[0%] Loading Pyodide runtime...");

	// Pyodide dropped classic-worker support, so this must stay an ES module
	// import of pyodide.mjs rather than importScripts() of pyodide.js.
	const pyodideModule: PyodideModule = await import(
		/* @vite-ignore */ `${cdnUrl}pyodide.mjs`
	);
	pyodide = await pyodideModule.loadPyodide({ indexURL: cdnUrl });

	postProgress("[3%] Loading NumPy and SciPy...");
	await pyodide.loadPackage(["numpy", "scipy"]);

	postProgress("[6%] Loading pandas and matplotlib...");
	await pyodide.loadPackage(["matplotlib", "pandas"]);

	postProgress("[9%] Loading scikit-learn...");
	await pyodide.loadPackage(["scikit-learn", "joblib", "micropip"]);

	postProgress("[12%] Installing compatibility shims...");
	await pyodide.runPythonAsync(SHIMS);

	postProgress("[14%] Installing synctoolbox and libtsm...");
	await pyodide.runPythonAsync(INSTALL_PACKAGES);

	synctoolboxInstalled = true;

	postProgress("[14%] Applying DTW speedup...");
	await pyodide.runPythonAsync(DTW_SPEEDUP);

	postProgress("[15%] Python environment ready");
}

async function installMusic21Impl(): Promise<void> {
	if (!pyodide || music21Installed) {
		return;
	}

	postProgress("Installing MusicXML support (music21)...");
	await pyodide.runPythonAsync(INSTALL_MUSIC21);
	music21Installed = true;
	postProgress("MusicXML support installed.");
}

async function computeAlignment(
	message: Extract<WorkerMessage, { type: "compute" }>,
): Promise<WorkerComputeResult> {
	if (!pyodide || !synctoolboxInstalled) {
		throw new Error("Pyodide is not initialized.");
	}

	const {
		files,
		referenceFileId,
		timeColumnByFileId,
		measureColumnByFileId,
		featureSet,
		algorithm,
		featureRate,
		generateSyncedAudio,
		pitchShiftEnabled,
	} = message;

	// Prepare data dictionaries for Python
	const audioFiles: Record<string, Float32Array> = {};
	const fullResolutionAudioFiles: Record<string, number[][]> = {};
	const audioSampleRates: Record<string, number> = {};
	const scoreFiles: Record<string, string> = {};
	const midiFiles: Record<
		string,
		{
			notes: Array<{
				midi: number;
				time: number;
				duration: number;
				velocity: number;
			}>;
			duration: number;
		}
	> = {};
	const fileNames: Record<string, string> = {};

	for (const file of files) {
		fileNames[file.id] = file.name;
		if (file.type === "audio") {
			audioFiles[file.id] = file.pcmData;
			if (generateSyncedAudio && file.id !== referenceFileId) {
				fullResolutionAudioFiles[file.id] = file.fullPcmChannels.map(
					(channelData) => Array.from(channelData),
				);
			}
			audioSampleRates[file.id] = file.sampleRate;
		} else if (file.type === "musicxml") {
			scoreFiles[file.id] = file.xmlText;
		} else if (file.type === "midi") {
			midiFiles[file.id] = {
				notes: file.notes,
				duration: file.duration,
			};
		}
	}

	// Get alignment method script
	const alignmentAlgorithm = getAlignmentMethod(algorithm);
	const methodScript = alignmentAlgorithm.getPythonScript({
		featureRate: featureRate,
		featureSet: featureSet,
	});

	postProgress("[15%] Preparing data...");

	// Set global variables in Python
	// Convert audio arrays to Python
	const audioFilesPlain: Record<string, number[]> = {};
	for (const key of Object.keys(audioFiles)) {
		audioFilesPlain[key] = Array.from(audioFiles[key]);
	}
	const pyAudioFiles = pyodide.toPy(audioFilesPlain);

	// Set ALL globals BEFORE running any Python that references them
	pyodide.globals.set("audio_files_js", pyAudioFiles);
	pyodide.globals.set(
		"full_resolution_audio_files",
		pyodide.toPy(fullResolutionAudioFiles),
	);
	pyodide.globals.set("audio_sample_rates", pyodide.toPy(audioSampleRates));
	pyodide.globals.set("score_files", pyodide.toPy(scoreFiles));
	pyodide.globals.set("midi_files", pyodide.toPy(midiFiles));
	pyodide.globals.set("file_names", pyodide.toPy(fileNames));
	pyodide.globals.set(
		"file_time_column_names",
		pyodide.toPy(timeColumnByFileId),
	);
	pyodide.globals.set(
		"file_measure_column_names",
		pyodide.toPy(measureColumnByFileId),
	);
	pyodide.globals.set("reference_file_id", referenceFileId);
	pyodide.globals.set("alignment_feature_set_id", featureSet);
	pyodide.globals.set("alignment_algorithm_id", algorithm);
	pyodide.globals.set("alignment_method_script", methodScript);
	pyodide.globals.set("FEATURE_RATE", featureRate);
	pyodide.globals.set("SAMPLE_RATE", SAMPLE_RATE);
	pyodide.globals.set("generate_synced_audio", generateSyncedAudio);
	pyodide.globals.set("pitch_shift_enabled", pitchShiftEnabled);

	// Convert audio arrays from JS lists to numpy arrays
	await pyodide.runPythonAsync(CONVERT_INPUTS);

	// Expose a progress reporting function to Python
	pyodide.globals.set("report_progress", (msg: string) => {
		postProgress(msg);
	});

	// Run the pipeline
	await pyodide.runPythonAsync(ALIGNMENT_PIPELINE);

	// Get the CSV output and synchronized audio payloads
	const csvOutput = pyodide.globals.get("csv_output") as string;
	const syncReferenceTimeColumn = pyodide.globals.get(
		"sync_reference_time_column",
	) as string | null;
	const synchronizedAudioProxy = pyodide.globals.get("sync_audio_outputs");
	const maybeToJsProxy = synchronizedAudioProxy as
		| { toJs?: () => unknown }
		| null
		| undefined;
	const synchronizedAudioRecord =
		maybeToJsProxy && typeof maybeToJsProxy.toJs === "function"
			? maybeToJsProxy.toJs()
			: synchronizedAudioProxy;
	const synchronizedAudio: WorkerComputeResult["synchronizedAudio"] = [];

	if (synchronizedAudioRecord) {
		const synchronizedEntries =
			synchronizedAudioRecord instanceof Map
				? Array.from(synchronizedAudioRecord.entries())
				: Object.entries(
						synchronizedAudioRecord as Record<string, Uint8Array | ArrayBuffer>,
					);

		synchronizedEntries.forEach((entry) => {
			const fileId = String(entry[0]);
			const rawData = entry[1] as Uint8Array | ArrayBuffer | ArrayLike<number>;
			let wavData: ArrayBuffer;

			if (rawData instanceof ArrayBuffer) {
				wavData = rawData;
			} else if (ArrayBuffer.isView(rawData)) {
				wavData = new Uint8Array(
					rawData.buffer,
					rawData.byteOffset,
					rawData.byteLength,
				).slice().buffer;
			} else {
				const fallbackBytes = new Uint8Array(rawData as ArrayLike<number>);
				wavData = fallbackBytes.buffer;
			}

			synchronizedAudio.push({
				fileId: fileId,
				wavData: wavData,
				mimeType: "audio/wav",
			});
		});
	}

	postProgress("Alignment complete.");
	return {
		csv: csvOutput,
		syncReferenceTimeColumn: syncReferenceTimeColumn || null,
		synchronizedAudio: synchronizedAudio,
	};
}

// ── Message handler ──

self.addEventListener("message", async (event: MessageEvent<WorkerMessage>) => {
	const message = event.data;

	try {
		switch (message.type) {
			case "init": {
				await initializePyodide(message.pyodideCdnUrl);
				postResponse({ type: "ready" });
				break;
			}

			case "install_music21": {
				await installMusic21Impl();
				postResponse({ type: "music21_installed" });
				break;
			}

			case "compute": {
				const result = await computeAlignment(message);
				postResult(result);
				break;
			}

			default:
				postResponse({ type: "error", message: "Unknown message type." });
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		postResponse({ type: "error", message: errorMessage });
	}
});
