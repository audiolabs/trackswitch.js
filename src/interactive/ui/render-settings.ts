import { renderIconSlotHtml } from "../../ui/icons";
import {
	ALIGNMENT_ALGORITHM_OPTIONS,
	ALIGNMENT_FEATURE_SET_OPTIONS,
	coerceAlignmentSelectionForFeatureSet,
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

export interface SettingsPanelState {
	files: InteractiveFile[];
	referenceFileId: string | null;
	featureSet: AlignmentFeatureSetId;
	algorithm: AlignmentAlgorithmId;
	syncGenerationEnabled: boolean;
	advancedOptionsExpanded: boolean;
}

export interface SettingsPanelEvents {
	onApply(state: SettingsPanelState): void;
	onCancel(): void;
	onAddFiles(files: File[]): void;
}

export function buildSettingsPanelHtml(state: SettingsPanelState): string {
	const featureSelectId = "ts-settings-feature-set-select";
	const algorithmSelectId = "ts-settings-algorithm-select";
	let html = '<div class="ts-settings-panel" role="presentation">';
	html += '<div class="ts-settings-backdrop"></div>';
	html +=
		'<div class="ts-settings-dialog" role="dialog" aria-modal="true" aria-label="Interactive settings">';

	// Header
	html +=
		'<div class="ts-settings-panel-header">' +
		'<div class="ts-settings-panel-heading">' +
		'<span class="ts-section-kicker">Interactive mode</span>' +
		'<strong class="ts-settings-title">Alignment settings</strong>' +
		'<p class="ts-settings-copy">Adjust your file set, choose the reference timeline, and pick the features and algorithm used to compute the warping path.</p>' +
		"</div>" +
		'<button class="ts-settings-cancel-btn" type="button" title="Close">' +
		renderIconSlotHtml("xmark") +
		"</button>" +
		"</div>";

	// Body
	html += '<div class="ts-settings-panel-body">';

	// Files section
	html +=
		'<div class="ts-settings-section">' +
		'<div class="ts-settings-section-title">Files &amp; Reference</div>' +
		'<div class="ts-settings-section-copy">Choose the anchor file the rest of the material should align to.</div>' +
		'<div class="ts-settings-file-table-wrap">' +
		'<table class="ts-settings-file-table">';

	html +=
		"<thead><tr>" +
		"<th>Ref</th>" +
		"<th>File</th>" +
		"<th>Type</th>" +
		"<th></th>" +
		"</tr></thead><tbody>";

	for (let i = 0; i < state.files.length; i += 1) {
		const file = state.files[i];
		const isReference = file.id === state.referenceFileId;
		const iconName = file.type === "audio" ? "file-audio" : "file-code";
		const typeLabel =
			file.type === "audio" ? "Audio" : file.type === "midi" ? "MIDI" : "Score";

		html +=
			'<tr data-file-id="' +
			escapeHtml(file.id) +
			'"' +
			(isReference ? ' class="is-reference"' : "") +
			">" +
			"<td>" +
			buildReferenceToggleHtml(file.id, file.name, isReference) +
			"</td>" +
			'<td><span class="ts-file-name">' +
			escapeHtml(file.name) +
			"</span></td>" +
			'<td><span class="ts-file-type-icon">' +
			renderIconSlotHtml(iconName) +
			" " +
			typeLabel +
			"</span></td>" +
			'<td><button class="ts-file-remove-btn ts-settings-remove-btn" type="button" ' +
			'data-file-id="' +
			escapeHtml(file.id) +
			'" title="Remove">' +
			renderIconSlotHtml("trash") +
			"</button></td>" +
			"</tr>";
	}

	html += "</tbody></table></div>";

	// Add files button
	html +=
		'<div class="ts-settings-add-files">' +
		'<button class="ts-settings-add-files-btn" type="button">' +
		renderIconSlotHtml("upload") +
		" Add Files" +
		"</button>" +
		'<span class="ts-settings-add-files-copy">Add more audio or MusicXML without leaving this flow.</span>' +
		'<input type="file" class="ts-settings-add-files-input" style="display:none;" ' +
		'multiple accept=".wav,.mp3,.ogg,.flac,.m4a,.aac,.webm,.xml,.musicxml,.mxl">' +
		"</div>";

	html += "</div>";

	// Method section
	html +=
		'<div class="ts-settings-section">' +
		'<div class="ts-settings-section-title">Warping Path</div>' +
		'<div class="ts-settings-section-copy">Keep the core setup front and center, then unfold advanced controls only when you want to tune alignment behavior.</div>' +
		buildAdvancedOptionsHtml(
			state.featureSet,
			state.algorithm,
			state.syncGenerationEnabled,
			featureSelectId,
			algorithmSelectId,
			"settings",
			state.advancedOptionsExpanded,
		) +
		"</div>";

	html += "</div>";

	// Footer
	html +=
		'<div class="ts-settings-panel-footer">' +
		'<button class="ts-settings-btn ts-settings-cancel-action" type="button">Cancel</button>' +
		'<button class="ts-settings-btn ts-settings-btn-primary ts-settings-apply-action" type="button">Apply Changes</button>' +
		"</div>";

	html += "</div></div>";
	return html;
}

function buildFeatureSetOptionsHtml(
	selectedFeatureSet: AlignmentFeatureSetId,
): string {
	return ALIGNMENT_FEATURE_SET_OPTIONS.map(
		(option) =>
			'<option value="' +
			option.id +
			'"' +
			(selectedFeatureSet === option.id ? " selected" : "") +
			">" +
			option.label +
			"</option>",
	).join("");
}

function buildAlgorithmOptionsHtml(
	featureSet: AlignmentFeatureSetId,
	selectedAlgorithm: AlignmentAlgorithmId,
): string {
	return ALIGNMENT_ALGORITHM_OPTIONS.filter((option) =>
		isCompatibleAlignmentSelection(featureSet, option.id),
	)
		.map(
			(option) =>
				'<option value="' +
				option.id +
				'"' +
				(selectedAlgorithm === option.id ? " selected" : "") +
				">" +
				option.label +
				"</option>",
		)
		.join("");
}

function buildAdvancedOptionsHtml(
	featureSet: AlignmentFeatureSetId,
	algorithm: AlignmentAlgorithmId,
	syncGenerationEnabled: boolean,
	featureSelectId: string,
	algorithmSelectId: string,
	idPrefix: string,
	expanded: boolean,
): string {
	const featureOptions = buildFeatureSetOptionsHtml(featureSet);
	const algorithmOptions = buildAlgorithmOptionsHtml(featureSet, algorithm);

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
		'<div class="ts-alignment-select-wrap">' +
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
		'<div class="ts-alignment-select-wrap">' +
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
		'<span class="ts-sync-toggle-title">Generate synchronized audios</span>' +
		'<span class="ts-sync-toggle-hint">Also export time- and pitch-matched audio renders.</span>' +
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
		"</div>" +
		"</div>" +
		"</details>"
	);
}

export function bindSettingsPanelEvents(
	container: HTMLElement,
	initialState: SettingsPanelState,
	events: SettingsPanelEvents,
): void {
	bindAlignmentHelpTooltips(container);

	// Working copy of state
	const workingState: SettingsPanelState = {
		files: [...initialState.files],
		referenceFileId: initialState.referenceFileId,
		featureSet: initialState.featureSet,
		algorithm: initialState.algorithm,
		syncGenerationEnabled: initialState.syncGenerationEnabled,
		advancedOptionsExpanded: initialState.advancedOptionsExpanded,
	};

	// Reference change
	container.addEventListener("click", (e) => {
		const referenceToggle = (e.target as HTMLElement).closest(
			".ts-settings-reference-toggle",
		) as HTMLElement | null;
		if (referenceToggle) {
			const fileId = referenceToggle.getAttribute("data-file-id");
			if (fileId) {
				workingState.referenceFileId = fileId;
				syncReferenceSelection(container, fileId);
			}
		}
	});

	const featureSetSelect = container.querySelector(
		".ts-feature-set-select",
	) as HTMLSelectElement | null;
	const algorithmSelect = container.querySelector(
		".ts-algorithm-select",
	) as HTMLSelectElement | null;
	const syncToggleInput = container.querySelector(
		".ts-sync-toggle-input",
	) as HTMLInputElement | null;
	const advancedOptions = container.querySelector(
		".ts-advanced-options",
	) as HTMLDetailsElement | null;

	function syncCompatibilityOptions(): void {
		if (featureSetSelect) {
			featureSetSelect.innerHTML = buildFeatureSetOptionsHtml(
				workingState.featureSet,
			);
			featureSetSelect.value = workingState.featureSet;
		}

		if (algorithmSelect) {
			algorithmSelect.innerHTML = buildAlgorithmOptionsHtml(
				workingState.featureSet,
				workingState.algorithm,
			);
			algorithmSelect.value = workingState.algorithm;
		}

		if (syncToggleInput) {
			syncToggleInput.checked = workingState.syncGenerationEnabled;
		}
	}

	if (featureSetSelect) {
		featureSetSelect.addEventListener("change", () => {
			const nextSelection = coerceAlignmentSelectionForFeatureSet(
				featureSetSelect.value as AlignmentFeatureSetId,
				workingState.algorithm,
			);
			workingState.featureSet = nextSelection.featureSet;
			workingState.algorithm = nextSelection.algorithm;
			syncCompatibilityOptions();
		});
	}

	if (algorithmSelect) {
		algorithmSelect.addEventListener("change", () => {
			workingState.algorithm = algorithmSelect.value as AlignmentAlgorithmId;
			syncCompatibilityOptions();
		});
	}

	if (syncToggleInput) {
		syncToggleInput.addEventListener("change", () => {
			workingState.syncGenerationEnabled = syncToggleInput.checked;
		});
	}

	if (advancedOptions) {
		bindAdvancedOptionsAnimation(advancedOptions);
		advancedOptions.addEventListener("toggle", () => {
			workingState.advancedOptionsExpanded = advancedOptions.open;
		});
	}

	syncCompatibilityOptions();

	// Remove buttons
	container.addEventListener("click", (e) => {
		const removeBtn = (e.target as HTMLElement).closest(
			".ts-settings-remove-btn",
		) as HTMLElement | null;
		if (removeBtn) {
			const fileId = removeBtn.getAttribute("data-file-id");
			if (fileId) {
				workingState.files = workingState.files.filter((f) => f.id !== fileId);
				const row = removeBtn.closest("tr");
				if (row) {
					row.remove();
				}
				if (
					workingState.referenceFileId === fileId &&
					workingState.files.length > 0
				) {
					workingState.referenceFileId = workingState.files[0].id;
					syncReferenceSelection(container, workingState.referenceFileId);
				}
			}
		}
	});

	// Add files
	const addBtn = container.querySelector(
		".ts-settings-add-files-btn",
	) as HTMLElement | null;
	const addInput = container.querySelector(
		".ts-settings-add-files-input",
	) as HTMLInputElement | null;
	if (addBtn && addInput) {
		addBtn.addEventListener("click", () => {
			addInput.click();
		});
		addInput.addEventListener("change", () => {
			if (addInput.files && addInput.files.length > 0) {
				const validFiles: File[] = [];
				for (let i = 0; i < addInput.files.length; i += 1) {
					if (classifyFileType(addInput.files[i]) !== null) {
						validFiles.push(addInput.files[i]);
					}
				}
				if (validFiles.length > 0) {
					events.onAddFiles(validFiles);
				}
				addInput.value = "";
			}
		});
	}

	// Cancel
	const cancelActions = container.querySelectorAll(
		".ts-settings-cancel-btn, .ts-settings-cancel-action",
	);
	cancelActions.forEach((el) => {
		el.addEventListener("click", () => {
			events.onCancel();
		});
	});

	const backdrop = container.querySelector(".ts-settings-backdrop");
	if (backdrop) {
		backdrop.addEventListener("click", () => {
			events.onCancel();
		});
	}

	// Apply
	const applyBtn = container.querySelector(".ts-settings-apply-action");
	if (applyBtn) {
		applyBtn.addEventListener("click", () => {
			events.onApply(workingState);
		});
	}
}

function buildReferenceToggleHtml(
	fileId: string,
	fileName: string,
	isReference: boolean,
): string {
	return (
		'<button class="ts-settings-reference-toggle' +
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

function bindAdvancedOptionsAnimation(
	advancedOptions: HTMLDetailsElement,
): void {
	const animatedClassName = "is-opening";
	let skipNextInitialOpenAnimation = advancedOptions.open;

	advancedOptions.addEventListener("toggle", () => {
		advancedOptions.classList.remove(animatedClassName);

		if (!advancedOptions.open) {
			skipNextInitialOpenAnimation = false;
			return;
		}

		if (skipNextInitialOpenAnimation) {
			skipNextInitialOpenAnimation = false;
			return;
		}

		void advancedOptions.offsetWidth;
		advancedOptions.classList.add(animatedClassName);
	});

	advancedOptions.addEventListener("animationend", (event) => {
		if (!(event.target instanceof HTMLElement)) {
			return;
		}
		if (!event.target.classList.contains("ts-advanced-options-panel")) {
			return;
		}
		advancedOptions.classList.remove(animatedClassName);
	});
}

function syncReferenceSelection(
	container: HTMLElement,
	selectedFileId: string | null,
): void {
	const toggles = container.querySelectorAll(".ts-settings-reference-toggle");
	toggles.forEach((toggle) => {
		if (!(toggle instanceof HTMLElement)) {
			return;
		}

		const isSelected = toggle.getAttribute("data-file-id") === selectedFileId;
		toggle.classList.toggle("is-selected", isSelected);
		toggle.setAttribute("aria-pressed", String(isSelected));
		toggle.innerHTML = renderIconSlotHtml(isSelected ? "circle-dot" : "circle");

		const row = toggle.closest("tr");
		if (row) {
			row.classList.toggle("is-reference", isSelected);
		}
	});
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
