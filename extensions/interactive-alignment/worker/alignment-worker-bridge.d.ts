import type { AlignmentAlgorithmId, AlignmentFeatureSetId, InteractiveFile, WorkerComputeResult } from "../types";
type ProgressCallback = (message: string) => void;
export declare class AlignmentWorkerBridge {
    private worker;
    private workerUrl;
    private pyodideCdnUrl;
    private ready;
    private music21Installed;
    private initPromise;
    private onProgress;
    constructor(workerUrl?: string, pyodideCdnUrl?: string);
    setProgressCallback(callback: ProgressCallback | null): void;
    initialize(): Promise<void>;
    installMusic21(): Promise<void>;
    computeAlignment(files: InteractiveFile[], referenceFileId: string, featureSet: AlignmentFeatureSetId, algorithm: AlignmentAlgorithmId, generateSyncedAudio: boolean, pitchShiftEnabled: boolean): Promise<WorkerComputeResult>;
    isReady(): boolean;
    destroy(): void;
    private ensureReady;
}
export {};
