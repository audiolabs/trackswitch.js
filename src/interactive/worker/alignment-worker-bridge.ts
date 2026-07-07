import {
	DEFAULT_WORKER_URL,
	FEATURE_RATE,
	PYODIDE_CDN_URL,
} from "../constants";
import { buildUniqueAlignmentColumnMaps } from "../file-handler";
import type {
	AlignmentAlgorithmId,
	AlignmentFeatureSetId,
	InteractiveFile,
	WorkerComputeMessage,
	WorkerComputeResult,
	WorkerFile,
	WorkerFileAudio,
	WorkerFileMidi,
	WorkerFileScore,
	WorkerResponse,
} from "../types";

type ProgressCallback = (message: string) => void;

export class AlignmentWorkerBridge {
	private worker: Worker | null = null;
	private workerUrl: string;
	private pyodideCdnUrl: string;
	private ready = false;
	private music21Installed = false;
	private initPromise: Promise<void> | null = null;
	private onProgress: ProgressCallback | null = null;

	constructor(workerUrl?: string, pyodideCdnUrl?: string) {
		this.workerUrl = workerUrl || DEFAULT_WORKER_URL;
		this.pyodideCdnUrl = pyodideCdnUrl || PYODIDE_CDN_URL;
	}

	setProgressCallback(callback: ProgressCallback | null): void {
		this.onProgress = callback;
	}

	initialize(): Promise<void> {
		if (this.initPromise) {
			return this.initPromise;
		}

		this.initPromise = new Promise((resolve, reject) => {
			try {
				this.worker = new Worker(this.workerUrl);
			} catch (_e) {
				reject(
					new Error(
						"Failed to create alignment worker. Ensure the worker script is available at: " +
							this.workerUrl,
					),
				);
				return;
			}

			const onMessage = (event: MessageEvent<WorkerResponse>) => {
				const response = event.data;
				if (response.type === "ready") {
					this.ready = true;
					this.worker?.removeEventListener("message", onMessage);
					resolve();
				} else if (response.type === "error") {
					reject(new Error(response.message));
				} else if (response.type === "progress" && this.onProgress) {
					this.onProgress(response.message);
				}
			};

			this.worker.addEventListener("message", onMessage);
			this.worker.addEventListener("error", (event) => {
				const message = event.message || "unknown";
				const location =
					event.filename || event.lineno || event.colno
						? ` (${event.filename || this.workerUrl}:${event.lineno || 0}:${event.colno || 0})`
						: "";
				reject(
					new Error(
						`Worker error while loading ${this.workerUrl}: ${message}${location}`,
					),
				);
			});

			this.worker.postMessage({
				type: "init",
				pyodideCdnUrl: this.pyodideCdnUrl,
			});
		});

		return this.initPromise;
	}

	async installMusic21(): Promise<void> {
		if (this.music21Installed) {
			return;
		}
		await this.ensureReady();
		const worker = this.worker;
		if (!worker) {
			throw new Error("Alignment worker is unavailable.");
		}

		return new Promise((resolve, reject) => {
			const onMessage = (event: MessageEvent<WorkerResponse>) => {
				const response = event.data;
				if (response.type === "music21_installed") {
					this.music21Installed = true;
					worker.removeEventListener("message", onMessage);
					resolve();
				} else if (response.type === "error") {
					worker.removeEventListener("message", onMessage);
					reject(new Error(response.message));
				} else if (response.type === "progress" && this.onProgress) {
					this.onProgress(response.message);
				}
			};

			worker.addEventListener("message", onMessage);
			worker.postMessage({ type: "install_music21" });
		});
	}

	async computeAlignment(
		files: InteractiveFile[],
		referenceFileId: string,
		featureSet: AlignmentFeatureSetId,
		algorithm: AlignmentAlgorithmId,
		generateSyncedAudio: boolean,
	): Promise<WorkerComputeResult> {
		await this.ensureReady();
		const worker = this.worker;
		if (!worker) {
			throw new Error("Alignment worker is unavailable.");
		}

		const hasMusicXml = files.some((f) => f.type === "musicxml");
		if (hasMusicXml) {
			await this.installMusic21();
		}

		const columnMaps = buildUniqueAlignmentColumnMaps(files);

		const workerFiles: WorkerFile[] = files.map((file): WorkerFile => {
			if (file.type === "audio") {
				if (!file.pcmData || typeof file.sampleRate !== "number") {
					throw new Error(`Audio file is missing decoded data: ${file.name}`);
				}
				const pcmCopy = new Float32Array(file.pcmData);
				const fullPcmChannels =
					generateSyncedAudio && file.id !== referenceFileId
						? (file.fullPcmChannels || []).map(
								(channelData) => new Float32Array(channelData),
							)
						: [];
				return {
					id: file.id,
					name: file.name,
					type: "audio",
					pcmData: pcmCopy,
					fullPcmChannels: fullPcmChannels,
					sampleRate: file.sampleRate,
				} as WorkerFileAudio;
			}
			if (file.type === "midi") {
				if (
					!file.midiNotes ||
					file.midiNotes.length === 0 ||
					!Number.isFinite(file.midiDuration) ||
					Number(file.midiDuration) <= 0
				) {
					throw new Error(
						`MIDI file is missing parsed note data: ${file.name}`,
					);
				}
				return {
					id: file.id,
					name: file.name,
					type: "midi",
					notes: file.midiNotes.map((note) => ({
						midi: note.midi,
						time: note.time,
						duration: note.duration,
						velocity: note.velocity,
					})),
					duration: file.midiDuration,
				} as WorkerFileMidi;
			}
			if (!file.xmlText) {
				throw new Error(`MusicXML file is missing XML text: ${file.name}`);
			}
			return {
				id: file.id,
				name: file.name,
				type: "musicxml",
				xmlText: file.xmlText,
			} as WorkerFileScore;
		});

		const transferables: Transferable[] = [];
		workerFiles.forEach((wf) => {
			if (wf.type === "audio") {
				transferables.push(wf.pcmData.buffer);
				wf.fullPcmChannels.forEach((channelData) => {
					transferables.push(channelData.buffer);
				});
			}
		});

		return new Promise((resolve, reject) => {
			const onMessage = (event: MessageEvent<WorkerResponse>) => {
				const response = event.data;
				if (response.type === "result") {
					worker.removeEventListener("message", onMessage);
					resolve(response.result);
				} else if (response.type === "error") {
					worker.removeEventListener("message", onMessage);
					reject(new Error(response.message));
				} else if (response.type === "progress" && this.onProgress) {
					this.onProgress(response.message);
				}
			};

			worker.addEventListener("message", onMessage);

			const message: WorkerComputeMessage = {
				type: "compute",
				files: workerFiles,
				referenceFileId: referenceFileId,
				timeColumnByFileId: columnMaps.timeColumnByFileId,
				measureColumnByFileId: columnMaps.measureColumnByFileId,
				featureSet: featureSet,
				algorithm: algorithm,
				featureRate: FEATURE_RATE,
				generateSyncedAudio: generateSyncedAudio,
			};

			worker.postMessage(message, transferables);
		});
	}

	isReady(): boolean {
		return this.ready;
	}

	destroy(): void {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
		this.ready = false;
		this.music21Installed = false;
		this.initPromise = null;
	}

	private async ensureReady(): Promise<void> {
		if (!this.initPromise) {
			await this.initialize();
		} else {
			await this.initPromise;
		}
	}
}
