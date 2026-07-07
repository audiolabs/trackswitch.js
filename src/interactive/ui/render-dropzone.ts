import { renderIconSlotHtml } from "../../ui/icons";
import {
	ALIGNMENT_ALGORITHM_OPTIONS,
	ALIGNMENT_FEATURE_SET_OPTIONS,
	isCompatibleAlignmentSelection,
} from "../alignment-options";
import { classifyFileType } from "../file-handler";
import type {
	AlignmentAlgorithmId,
	AlignmentFeatureSetId,
	InteractiveFile,
} from "../types";
import {
	bindAlignmentHelpTooltips,
	buildAlignmentHelpLabelHtml,
	buildAlignmentHelpTriggerHtml,
} from "./alignment-help";

export function buildDropZoneInputHtml(): string {
	return (
		'<input type="file" class="ts-dropzone-input" multiple ' +
		'accept=".wav,.mp3,.ogg,.flac,.m4a,.aac,.webm,.xml,.musicxml,.mxl,.mid,.midi">'
	);
}

export function buildDropZoneHtml(): string {
	return (
		'<div class="ts-dropzone" tabindex="0">' +
		'<div class="ts-dropzone-prompt">' +
		'<strong class="ts-dropzone-title">Music Synchronization</strong>' +
		'<span class="ts-dropzone-hint">Processing is done only on your device, no files are uploaded to any server.</span>' +
		'<span class="ts-dropzone-icon">' +
		renderIconSlotHtml("upload") +
		"</span>" +
		'<strong class="ts-dropzone-title">Drop audio, sheet music, and MIDI here</strong>' +
		'<span class="ts-dropzone-hint">Supported Audio Formats: WAV, MP3, OGG, FLAC, M4A, AAC, WebM</span>' +
		'<span class="ts-dropzone-hint">Supported Sheet Music Formats: XML, MusicXML, MXL</span>' +
		'<span class="ts-dropzone-hint">Supported MIDI Formats: MID, MIDI</span>' +
		"</div>" +
		buildDropZoneInputHtml() +
		"</div>"
	);
}

export function buildFileListHtml(
	files: InteractiveFile[],
	referenceFileId: string | null,
	infoMessage?: string,
): string {
	if (files.length === 0) {
		return "";
	}

	let html =
		'<div class="ts-interactive-file-list">' +
		'<div class="ts-interactive-list-header">' +
		"<div>" +
		'<span class="ts-section-kicker">Selected files</span>' +
		'<strong class="ts-section-title">Pick a reference to align other sources to</strong>' +
		"</div>" +
		'<div class="ts-file-list-actions">' +
		'<span class="ts-file-count">' +
		files.length +
		(files.length === 1 ? " file" : " files") +
		"</span>" +
		'<button class="ts-upload-more-files-btn" type="button">Upload more files</button>' +
		"</div>" +
		"</div>";

	if (infoMessage) {
		html +=
			'<div class="ts-interactive-list-info">' +
			escapeHtml(infoMessage) +
			"</div>";
	}

	html +=
		"" +
		"<table>" +
		"<thead><tr>" +
		"<th>Reference</th>" +
		"<th>File</th>" +
		"<th>Type</th>" +
		"<th></th>" +
		"</tr></thead>" +
		"<tbody>";

	for (let i = 0; i < files.length; i += 1) {
		const file = files[i];
		const isReference = file.id === referenceFileId;
		const iconName =
			file.type === "audio"
				? "file-audio"
				: file.type === "midi"
					? "file-code"
					: "file-code";
		const typeLabel =
			file.type === "audio" ? "Audio" : file.type === "midi" ? "MIDI" : "Score";

		html +=
			'<tr data-file-id="' +
			escapeHtml(file.id) +
			'"' +
			(isReference ? ' class="is-reference"' : "") +
			">" +
			"<td>" +
			buildReferenceToggleHtml(
				file.id,
				file.name,
				isReference,
				"ts-reference-toggle",
			) +
			"</td>" +
			'<td><span class="ts-file-name">' +
			escapeHtml(file.name) +
			"</span></td>" +
			'<td><span class="ts-file-type-icon">' +
			renderIconSlotHtml(iconName) +
			" " +
			typeLabel +
			"</span></td>" +
			'<td><button class="ts-file-remove-btn" data-file-id="' +
			escapeHtml(file.id) +
			'" title="Remove file">' +
			renderIconSlotHtml("trash") +
			"</button></td>" +
			"</tr>";
	}

	html += "</tbody></table></div>";
	return html;
}

export function buildComputeBarHtml(
	canCompute: boolean,
	status: string,
	featureSet: AlignmentFeatureSetId,
	algorithm: AlignmentAlgorithmId,
	isComputing: boolean,
	showCancel: boolean,
	syncGenerationEnabled: boolean,
	advancedOptionsExpanded: boolean,
): string {
	const featureSelectId = "ts-dropzone-feature-set-select";
	const algorithmSelectId = "ts-dropzone-algorithm-select";
	let html =
		'<div class="ts-compute-bar">' +
		'<div class="ts-compute-bar-row">' +
		buildAdvancedOptionsHtml(
			featureSet,
			algorithm,
			syncGenerationEnabled,
			featureSelectId,
			algorithmSelectId,
			"dropzone",
			canCompute,
			advancedOptionsExpanded,
		) +
		'<div class="ts-compute-actions">';

	if (showCancel) {
		html +=
			'<button class="ts-cancel-btn" type="button">' +
			"<span>Cancel</span></button>";
	}

	html +=
		'<button class="ts-compute-btn"' +
		(canCompute ? "" : " disabled") +
		">" +
		"<span>Synchronize</span></button>" +
		"</div>" +
		"</div>";

	if (status && !isComputing) {
		const isError = status.toLowerCase().includes("error");
		html +=
			'<span class="ts-compute-status' +
			(isError ? " ts-compute-status-error" : "") +
			'">' +
			escapeHtml(status) +
			"</span>";
	}

	html += "</div>";
	return html;
}

export function buildComputingOverlayHtml(message: string): string {
	return (
		'<div class="ts-computing-overlay">' +
		'<div class="ts-computing-card">' +
		'<div class="ts-progress-bar"><div class="ts-progress-fill" style="width: 0%;"></div></div>' +
		'<span class="ts-progress-percent">--%</span>' +
		'<span class="ts-computing-message">' +
		escapeHtml(message) +
		"</span>" +
		"</div>" +
		"</div>"
	);
}

export function buildFullDropZonePanel(
	files: InteractiveFile[],
	referenceFileId: string | null,
	canCompute: boolean,
	statusMessage: string,
	isComputing: boolean,
	computingMessage: string,
	featureSet: AlignmentFeatureSetId,
	algorithm: AlignmentAlgorithmId,
	showCancel: boolean,
	syncGenerationEnabled: boolean,
	advancedOptionsExpanded: boolean,
	fileListInfoMessage?: string,
): string {
	let html = '<div class="ts-interactive-panel ts-stack-section">';

	if (files.length === 0) {
		html += buildDropZoneHtml();
	} else {
		html += buildDropZoneInputHtml();
	}
	html += buildFileListHtml(files, referenceFileId, fileListInfoMessage);
	html += buildComputeBarHtml(
		canCompute,
		statusMessage,
		featureSet,
		algorithm,
		isComputing,
		showCancel,
		syncGenerationEnabled,
		advancedOptionsExpanded,
	);

	if (isComputing) {
		html += buildComputingOverlayHtml(computingMessage);
	}

	html += "</div>";
	return html;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

// ── Event binding ──

export interface DropZoneEvents {
	onFilesAdded(files: File[]): void;
	onReferenceChanged(fileId: string): void;
	onFileRemoved(fileId: string): void;
	onFeatureSetChanged(featureSet: AlignmentFeatureSetId): void;
	onAlgorithmChanged(algorithm: AlignmentAlgorithmId): void;
	onSyncGenerationChanged(enabled: boolean): void;
	onAdvancedOptionsChanged(expanded: boolean): void;
	onAlignmentCsvSelected(file: File): void;
	onCancelClicked(): void;
	onComputeClicked(): void;
}

export function bindDropZoneEvents(
	container: HTMLElement,
	events: DropZoneEvents,
): void {
	bindAlignmentHelpTooltips(container);

	const dropZone = container.querySelector(
		".ts-dropzone",
	) as HTMLElement | null;
	const fileInput = container.querySelector(
		".ts-dropzone-input",
	) as HTMLInputElement | null;
	let dragDepth = 0;

	function setDragOverState(active: boolean): void {
		container.classList.toggle("ts-interactive-panel-dragover", active);
		if (dropZone) {
			dropZone.classList.toggle("ts-dropzone-dragover", active);
		}
	}

	if (dropZone && fileInput) {
		dropZone.addEventListener("click", (e) => {
			if ((e.target as HTMLElement).closest(".ts-file-remove-btn")) {
				return;
			}
			fileInput.click();
		});
	}

	const uploadMoreButton = container.querySelector(
		".ts-upload-more-files-btn",
	) as HTMLButtonElement | null;
	if (uploadMoreButton && fileInput) {
		uploadMoreButton.addEventListener("click", () => {
			fileInput.click();
		});
	}

	if (fileInput) {
		container.addEventListener(
			"dragenter",
			(e) => {
				e.preventDefault();
				e.stopPropagation();
				dragDepth += 1;
				setDragOverState(true);
			},
			true,
		);

		container.addEventListener(
			"dragover",
			(e) => {
				e.preventDefault();
				e.stopPropagation();
				setDragOverState(true);
			},
			true,
		);

		container.addEventListener(
			"dragleave",
			(e) => {
				e.preventDefault();
				e.stopPropagation();
				dragDepth = Math.max(0, dragDepth - 1);
				if (dragDepth === 0) {
					setDragOverState(false);
				}
			},
			true,
		);

		container.addEventListener(
			"drop",
			(e) => {
				e.preventDefault();
				e.stopPropagation();
				dragDepth = 0;
				setDragOverState(false);
				if (e.dataTransfer && e.dataTransfer.files.length > 0) {
					const validFiles = filterValidFiles(e.dataTransfer.files);
					if (validFiles.length > 0) {
						events.onFilesAdded(validFiles);
					}
				}
			},
			true,
		);

		fileInput.addEventListener("change", () => {
			if (fileInput.files && fileInput.files.length > 0) {
				const validFiles = filterValidFiles(fileInput.files);
				if (validFiles.length > 0) {
					events.onFilesAdded(validFiles);
				}
				fileInput.value = "";
			}
		});
	}

	// Reference buttons
	container.addEventListener("click", (e) => {
		const referenceToggle = (e.target as HTMLElement).closest(
			".ts-reference-toggle",
		) as HTMLElement | null;
		if (referenceToggle) {
			const fileId = referenceToggle.getAttribute("data-file-id");
			if (fileId) {
				events.onReferenceChanged(fileId);
			}
		}
	});

	// Remove buttons
	container.addEventListener("click", (e) => {
		const removeBtn = (e.target as HTMLElement).closest(
			".ts-file-remove-btn",
		) as HTMLElement | null;
		if (removeBtn) {
			e.stopPropagation();
			const fileId = removeBtn.getAttribute("data-file-id");
			if (fileId) {
				events.onFileRemoved(fileId);
			}
		}
	});

	const featureSetSelect = container.querySelector(
		".ts-feature-set-select",
	) as HTMLSelectElement | null;
	if (featureSetSelect) {
		featureSetSelect.addEventListener("change", () => {
			events.onFeatureSetChanged(
				featureSetSelect.value as AlignmentFeatureSetId,
			);
		});
	}

	const algorithmSelect = container.querySelector(
		".ts-algorithm-select",
	) as HTMLSelectElement | null;
	if (algorithmSelect) {
		algorithmSelect.addEventListener("change", () => {
			events.onAlgorithmChanged(algorithmSelect.value as AlignmentAlgorithmId);
		});
	}

	const advancedOptions = container.querySelector(
		".ts-advanced-options",
	) as HTMLDetailsElement | null;
	if (advancedOptions) {
		bindAdvancedOptionsAnimation(advancedOptions);
		advancedOptions.addEventListener("toggle", () => {
			events.onAdvancedOptionsChanged(advancedOptions.open);
		});
	}

	const syncToggleInput = container.querySelector(
		".ts-sync-toggle-input",
	) as HTMLInputElement | null;
	if (syncToggleInput) {
		syncToggleInput.addEventListener("change", () => {
			events.onSyncGenerationChanged(syncToggleInput.checked);
		});
	}

	const alignmentCsvInput = container.querySelector(
		".ts-alignment-csv-input",
	) as HTMLInputElement | null;
	if (alignmentCsvInput) {
		alignmentCsvInput.addEventListener("change", () => {
			const selectedFile =
				alignmentCsvInput.files && alignmentCsvInput.files.length > 0
					? alignmentCsvInput.files[0]
					: null;
			if (selectedFile) {
				events.onAlignmentCsvSelected(selectedFile);
			}
			alignmentCsvInput.value = "";
		});
	}

	container.addEventListener("click", (e) => {
		const btn = (e.target as HTMLElement).closest(
			".ts-upload-alignment-btn",
		) as HTMLButtonElement | null;
		if (btn && !btn.disabled && alignmentCsvInput) {
			alignmentCsvInput.click();
		}
	});

	// Compute button
	container.addEventListener("click", (e) => {
		const btn = (e.target as HTMLElement).closest(
			".ts-compute-btn",
		) as HTMLButtonElement | null;
		if (btn && !btn.disabled) {
			events.onComputeClicked();
		}
	});

	container.addEventListener("click", (e) => {
		const btn = (e.target as HTMLElement).closest(
			".ts-cancel-btn",
		) as HTMLButtonElement | null;
		if (btn) {
			events.onCancelClicked();
		}
	});
}

function buildReferenceToggleHtml(
	fileId: string,
	fileName: string,
	isReference: boolean,
	className: string,
): string {
	return (
		'<button class="' +
		className +
		(isReference ? " is-selected" : "") +
		'"' +
		' type="button" data-file-id="' +
		escapeHtml(fileId) +
		'"' +
		' aria-label="Use ' +
		escapeHtml(fileName) +
		' as reference"' +
		' aria-pressed="' +
		String(isReference) +
		'">' +
		renderIconSlotHtml(isReference ? "circle-dot" : "circle") +
		"</button>"
	);
}

function filterValidFiles(fileList: FileList): File[] {
	const result: File[] = [];
	for (let i = 0; i < fileList.length; i += 1) {
		if (classifyFileType(fileList[i]) !== null) {
			result.push(fileList[i]);
		}
	}
	return result;
}

function buildAdvancedOptionsHtml(
	featureSet: AlignmentFeatureSetId,
	algorithm: AlignmentAlgorithmId,
	syncGenerationEnabled: boolean,
	featureSelectId: string,
	algorithmSelectId: string,
	idPrefix: string,
	canImportCsv: boolean,
	expanded: boolean,
): string {
	const featureOptions = ALIGNMENT_FEATURE_SET_OPTIONS.map(
		(option) =>
			'<option value="' +
			option.id +
			'"' +
			(featureSet === option.id ? " selected" : "") +
			">" +
			option.label +
			"</option>",
	).join("");
	const algorithmOptions = ALIGNMENT_ALGORITHM_OPTIONS.filter((option) =>
		isCompatibleAlignmentSelection(featureSet, option.id),
	)
		.map(
			(option) =>
				'<option value="' +
				option.id +
				'"' +
				(algorithm === option.id ? " selected" : "") +
				">" +
				option.label +
				"</option>",
		)
		.join("");

	return (
		'<details class="ts-advanced-options"' +
		(expanded ? " open" : "") +
		">" +
		'<summary class="ts-advanced-options-summary">' +
		'<span class="ts-advanced-options-title">Advanced</span>' +
		'<span class="ts-advanced-options-chevron" aria-hidden="true"></span>' +
		"</summary>" +
		'<div class="ts-advanced-options-panel">' +
		'<div class="ts-advanced-options-grid">' +
		'<div class="ts-alignment-select-wrap ts-feature-set-select-wrap">' +
		buildAlignmentHelpLabelHtml({
			label: "Features",
			selectId: featureSelectId,
			tooltipId: "features",
			idPrefix: idPrefix,
			align: "start",
		}) +
		'<select id="' +
		featureSelectId +
		'" class="ts-alignment-select ts-alignment-select-compact ts-feature-set-select">' +
		featureOptions +
		"</select>" +
		"</div>" +
		'<div class="ts-alignment-select-wrap ts-algorithm-select-wrap">' +
		buildAlignmentHelpLabelHtml({
			label: "Algorithm",
			selectId: algorithmSelectId,
			tooltipId: "algorithm",
			idPrefix: idPrefix,
			align: "end",
		}) +
		'<select id="' +
		algorithmSelectId +
		'" class="ts-alignment-select ts-alignment-select-compact ts-algorithm-select">' +
		algorithmOptions +
		"</select>" +
		"</div>" +
		'<div class="ts-sync-toggle-row-wrap">' +
		'<label class="ts-sync-toggle-row ts-sync-toggle-row-compact">' +
		'<span class="ts-sync-toggle-copy">' +
		'<span class="ts-sync-toggle-title">Generate time-/pitch-synchronized versions of audio for multitrack playback</span>' +
		"</span>" +
		'<span class="ts-sync-toggle-switch ts-sync-toggle-switch-compact">' +
		'<input class="ts-sync-toggle-input" type="checkbox"' +
		(syncGenerationEnabled ? " checked" : "") +
		">" +
		'<span class="ts-sync-toggle-knob" aria-hidden="true"></span>' +
		"</span>" +
		"</label>" +
		'<span class="ts-sync-toggle-help">' +
		buildAlignmentHelpTriggerHtml({
			label: "synchronized audio generation",
			tooltipId: "sync-generation",
			idPrefix: idPrefix,
			align: "end",
		}) +
		"</span>" +
		"</div>" +
		'<div class="ts-advanced-upload-row">' +
		'<input type="file" class="ts-alignment-csv-input" accept=".csv,text/csv" hidden>' +
		'<div class="ts-advanced-upload-actions">' +
		'<button class="ts-upload-alignment-btn ts-upload-alignment-btn-subtle"' +
		(canImportCsv ? "" : " disabled") +
		">" +
		"<span>Upload custom alignment CSV</span></button>" +
		buildAlignmentHelpTriggerHtml({
			label: "alignment.csv",
			tooltipId: "alignment-csv",
			idPrefix: idPrefix,
			align: "start",
		}) +
		"</div>" +
		"</div>" +
		"</div>" +
		"</div>" +
		"</details>"
	);
}

function bindAdvancedOptionsAnimation(
	advancedOptions: HTMLDetailsElement,
): void {
	void advancedOptions;
}
