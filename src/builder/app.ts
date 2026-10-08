import { processFile } from "../../extensions/interactive-alignment/file-handler";
import type {
	AlignmentAlgorithmId,
	AlignmentFeatureSetId,
	InteractiveFile,
	WorkerComputeResult,
} from "../../extensions/interactive-alignment/types";
import {
	bindAlignmentHelpTooltips,
	buildAlignmentHelpLabelHtml,
} from "../../extensions/interactive-alignment/ui/alignment-help";
import type { AlignmentHelpTooltipId } from "../../extensions/interactive-alignment/ui/alignment-help-types";
import { AlignmentWorkerBridge } from "../../extensions/interactive-alignment/worker/alignment-worker-bridge";
import { normalizeTrackSwitchConfig } from "../config/config";
import { parseCsvRecords } from "../shared/csv";
import type {
	MarkerLayerConfig,
	MediaEntryConfig,
	TrackSwitchController,
	TrackSwitchInit,
	TrackSwitchViewConfig,
} from "../types";
import {
	type ArchiveVariant,
	buildArchiveEntries,
	createArchiveBlob,
	type StandaloneAssets,
} from "./archive";
import { type FormTarget, renderSchemaForm, schemaForFeatures } from "./form";
import {
	addFilesToProject,
	type BuilderProject,
	type BuilderResource,
	type BuilderView,
	buildPlayerConfig,
	buildRuntimePreviewConfig,
	createBuilderProject,
	detachMedia,
	findMarkerReferences,
	renameMarkerId,
	renameMediaId,
	slugifyId,
} from "./model";
import {
	assertBuilderSchemaCoverage,
	BUILDER_VIEW_TYPES,
	getDefinition,
	getDiscriminatedSchema,
	type JsonSchema,
} from "./schema";
import { appendViewIfValid, validateBuilderProject } from "./validation";

interface BuilderAssetUrls {
	playerScript: string;
	license: string;
	thirdPartyNotices: string;
	alignmentWorkerUrl: string;
}

interface ComputeProgressElements {
	wrapper: HTMLElement;
	fill: HTMLElement;
	percent: HTMLElement;
	message: HTMLElement;
}

interface TrackswitchPreviewElement extends HTMLElement {
	config: TrackSwitchInit | undefined;
	readonly controller: TrackSwitchController | null;
}

/** Views that can draw marker layers. */
const MARKER_LAYER_VIEW_TYPES = new Set([
	"image",
	"perTrackImage",
	"waveform",
	"pianoRoll",
]);

const VIEW_LABELS: Record<(typeof BUILDER_VIEW_TYPES)[number], string> = {
	image: "Image",
	perTrackImage: "Per-track image",
	waveform: "Waveform",
	pianoRoll: "Piano roll",
	sheetMusic: "Sheet music",
	warpingMatrix: "Warping matrix",
	text: "Text",
	separator: "Separator",
	trackList: "Track list",
	navigationBar: "Navigation bar",
};

function button(
	label: string,
	className = "ts-builder-secondary-button",
): HTMLButtonElement {
	const element = document.createElement("button");
	element.type = "button";
	element.className = className;
	element.textContent = label;
	return element;
}

function uniqueId(base: string, existing: readonly string[]): string {
	if (!existing.includes(base)) return base;
	let suffix = 2;
	while (existing.includes(`${base}-${String(suffix)}`)) suffix += 1;
	return `${base}-${String(suffix)}`;
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function resourceLabel(resource: BuilderResource): string {
	const megabytes = resource.file.size / (1024 * 1024);
	return `${resource.file.name} · ${megabytes < 0.1 ? "<0.1" : megabytes.toFixed(1)} MB`;
}

function firstMediaId(
	project: BuilderProject,
	type: MediaEntryConfig["type"],
): string {
	return (
		Object.entries(project.media).find(
			([, media]) => media.config.type === type,
		)?.[0] ?? ""
	);
}

function defaultView(
	project: BuilderProject,
	type: TrackSwitchViewConfig["type"],
): TrackSwitchViewConfig {
	const audio = Object.entries(project.media)
		.filter(([, media]) => media.config.type === "audio")
		.map(([id]) => id);
	switch (type) {
		case "image":
			return { type, mediaID: firstMediaId(project, "image") };
		case "perTrackImage":
			return { type };
		case "waveform":
			return { type, tracks: "audible" };
		case "pianoRoll":
			return {
				type,
				mediaID: firstMediaId(project, "midi"),
				pianoKeyboard: true,
			};
		case "sheetMusic":
			return { type, mediaID: firstMediaId(project, "musicxml") };
		case "warpingMatrix":
			return { type, x: audio[0] ?? "", y: audio[1] ?? "" };
		case "text":
			return { type, text: "Add your text" };
		case "separator":
			return { type };
		case "trackList":
			return { type, tracks: audio };
		case "navigationBar":
			return {
				type,
				controls: ["playback", "globalVolume", "timer", "seekBar"],
			};
	}
}

/** Only drags from the file explorer add files; panel reordering drags carry no files. */
function isFileDrag(event: DragEvent): boolean {
	return event.dataTransfer?.types.includes("Files") ?? false;
}

interface DialogSnapshot {
	resources: BuilderProject["resources"];
	rest: Omit<BuilderProject, "resources">;
}

export class BuilderApp {
	private readonly project = createBuilderProject();
	private readonly rootSchema: JsonSchema;
	private readonly assetUrls: BuilderAssetUrls;
	private readonly root: HTMLElement;
	private readonly fileInput: HTMLInputElement;
	private readonly csvInput: HTMLInputElement;
	private readonly sidebar: HTMLElement;
	private readonly status: HTMLElement;
	private readonly previewHost: HTMLElement;
	private readonly panelRail: HTMLElement;
	private readonly addPanelMenu: HTMLElement;
	private readonly dialog: HTMLDialogElement;
	private readonly dialogTitle: HTMLElement;
	private readonly dialogBody: HTMLElement;
	private readonly dialogOk: HTMLButtonElement;
	private readonly dialogCancel: HTMLButtonElement;
	private readonly dialogError: HTMLElement;
	private readonly alignmentWorkerBridge: AlignmentWorkerBridge;
	private activeTarget: FormTarget | null = null;
	/** What OK does for the open dialog; closing it accepts the live edits. */
	private confirmDialog: () => void = () => this.acceptDialog();
	private dialogSnapshot: DialogSnapshot | null = null;
	private dialogAccepted = false;
	private deferredRevocations: string[] = [];
	private pendingDraft: {
		type: TrackSwitchViewConfig["type"];
		config: TrackSwitchViewConfig;
	} | null = null;
	private previewTimer: number | undefined;
	private preview: TrackswitchPreviewElement | null = null;
	private runtimeFailed = false;
	private draggedViewId: string | null = null;
	private csvIntakeTarget: "alignment" | "marker" | null = null;
	private pendingViewId: string | null = null;

	constructor(
		root: HTMLElement,
		rootSchema: JsonSchema,
		assetUrls: BuilderAssetUrls,
	) {
		assertBuilderSchemaCoverage(rootSchema);
		this.root = root;
		this.rootSchema = rootSchema;
		this.assetUrls = assetUrls;
		this.root.innerHTML = `
			<div class="ts-builder-mobile-message" role="note">
				<strong>The Builder needs a larger screen.</strong>
				<span>Open this page in a desktop browser wider than 900 pixels.</span>
			</div>
			<div class="ts-builder-app">
				<header class="ts-builder-header">
					<h1>Build your own player</h1>
				</header>
				<div class="ts-builder-workspace">
					<aside class="ts-builder-sidebar" aria-label="Project settings"><p class="ts-builder-status" role="status" aria-live="polite"></p></aside>
					<main class="ts-builder-main">
						<input data-input="media" type="file" multiple accept="audio/*,.mid,.midi,.xml,.musicxml,image/*,.csv" hidden>
						<input data-input="csv" type="file" accept=".csv,text/csv" hidden>
						<div class="ts-builder-preview-stage" aria-label="Player builder canvas">
							<div class="ts-builder-preview-shell">
								<div class="ts-builder-preview"><button type="button" class="ts-builder-drop-prompt" data-action="empty-choose-files"><strong>Drop files here</strong><span>Audio, MIDI (.mid/.midi), MusicXML (.xml/.musicxml), images, and CSV files are supported.</span></button></div>
								<div class="ts-builder-panel-rail" aria-label="Panel order"></div>
								<div class="ts-builder-drop-overlay" aria-hidden="true">Drop files to add them</div>
							</div>
						</div>
						<div class="ts-builder-add-view">
							<button type="button" class="ts-builder-secondary-button" data-action="toggle-panel-menu" aria-expanded="false" aria-haspopup="menu">Add panel</button>
							<div class="ts-builder-panel-menu" role="menu" hidden></div>
						</div>
					</main>
				</div>
			</div>
			<dialog class="ts-builder-dialog" aria-labelledby="ts-builder-dialog-title">
				<div class="ts-builder-dialog__header"><h2 id="ts-builder-dialog-title"></h2></div>
				<div class="ts-builder-dialog__body"></div>
				<p class="ts-builder-dialog__error" role="alert" hidden></p>
				<div class="ts-builder-dialog__footer">
					<button type="button" class="ts-builder-secondary-button" data-action="dialog-cancel">Cancel</button>
					<button type="button" class="ts-builder-primary-button" data-action="dialog-ok">OK</button>
				</div>
			</dialog>`;

		this.fileInput = this.required('[data-input="media"]');
		this.csvInput = this.required('[data-input="csv"]');
		this.sidebar = this.required(".ts-builder-sidebar");
		this.status = this.required(".ts-builder-status");
		this.previewHost = this.required(".ts-builder-preview");
		this.panelRail = this.required(".ts-builder-panel-rail");
		this.addPanelMenu = this.required(".ts-builder-panel-menu");
		this.dialog = this.required(".ts-builder-dialog");
		this.dialogTitle = this.required("#ts-builder-dialog-title");
		this.dialogBody = this.required(".ts-builder-dialog__body");
		this.dialogOk = this.required('[data-action="dialog-ok"]');
		this.dialogCancel = this.required('[data-action="dialog-cancel"]');
		this.dialogError = this.required(".ts-builder-dialog__error");
		this.alignmentWorkerBridge = new AlignmentWorkerBridge(
			this.assetUrls.alignmentWorkerUrl,
		);
		this.bindStaticEvents();
		this.renderPanelMenu();
		this.render();
		window.addEventListener("beforeunload", (event) => {
			if (Object.keys(this.project.resources).length === 0) return;
			event.preventDefault();
		});
		window.addEventListener("unload", () => this.revokeAllUrls());
	}

	private required<T extends Element>(selector: string): T {
		const element =
			this.root.querySelector<T>(selector) ??
			document.querySelector<T>(selector);
		if (!element) throw new Error(`Builder element not found: ${selector}`);
		return element;
	}

	private bindStaticEvents(): void {
		const dropzone = this.required<HTMLElement>(".ts-builder-preview-shell");
		this.required<HTMLButtonElement>(
			'[data-action="empty-choose-files"]',
		).addEventListener("click", () => this.fileInput.click());
		for (const eventName of ["dragenter", "dragover"] as const) {
			dropzone.addEventListener(eventName, (event) => {
				if (!isFileDrag(event)) return;
				event.preventDefault();
				dropzone.classList.add("is-dragging");
			});
		}
		dropzone.addEventListener("dragleave", (event) => {
			if (
				event.relatedTarget instanceof Node &&
				dropzone.contains(event.relatedTarget)
			)
				return;
			dropzone.classList.remove("is-dragging");
		});
		dropzone.addEventListener("drop", (event) => {
			if (!isFileDrag(event)) return;
			event.preventDefault();
			dropzone.classList.remove("is-dragging");
			void this.addFiles(event.dataTransfer?.files ?? []);
		});
		this.fileInput.addEventListener("change", () => {
			void this.addFiles(this.fileInput.files ?? []);
			this.fileInput.value = "";
		});
		this.csvInput.addEventListener("change", () => {
			void this.finishCsvIntake();
		});
		this.dialogCancel.addEventListener("click", () => this.dialog.close());
		this.dialogOk.addEventListener("click", () => this.confirmDialog());
		this.dialog.addEventListener("close", () => {
			this.finishDialogTransaction();
			this.activeTarget = null;
			this.pendingDraft = null;
			this.render();
		});
		const menuButton = this.required<HTMLButtonElement>(
			'[data-action="toggle-panel-menu"]',
		);
		menuButton.addEventListener("click", () => {
			const open = this.addPanelMenu.hidden;
			this.addPanelMenu.hidden = !open;
			menuButton.setAttribute("aria-expanded", String(open));
			if (open)
				this.addPanelMenu.querySelector<HTMLButtonElement>("button")?.focus();
		});
		this.addPanelMenu.addEventListener("keydown", (event) => {
			if (event.key !== "Escape") return;
			this.closePanelMenu();
			menuButton.focus();
		});
		document.addEventListener("click", (event) => {
			const addView = this.required<HTMLElement>(".ts-builder-add-view");
			if (event.target instanceof Node && addView.contains(event.target))
				return;
			this.closePanelMenu();
		});
		document.addEventListener("click", (event) => {
			const group = this.sidebar.querySelector<HTMLElement>(
				".ts-builder-download-split",
			);
			const menu = group?.querySelector<HTMLElement>(
				".ts-builder-download-menu",
			);
			if (!group || !menu || menu.hidden) return;
			if (event.target instanceof Node && group.contains(event.target)) return;
			menu.hidden = true;
			group
				.querySelector<HTMLButtonElement>(".ts-builder-download-split__toggle")
				?.setAttribute("aria-expanded", "false");
		});
		window.addEventListener("resize", () => this.decoratePreviewPanels());
	}

	private renderPanelMenu(): void {
		for (const type of BUILDER_VIEW_TYPES) {
			const option = button(VIEW_LABELS[type], "ts-builder-panel-menu__item");
			option.setAttribute("role", "menuitem");
			option.addEventListener("click", () => {
				this.closePanelMenu();
				this.addView(type);
			});
			this.addPanelMenu.append(option);
		}
	}

	private closePanelMenu(): void {
		this.addPanelMenu.hidden = true;
		this.required<HTMLButtonElement>(
			'[data-action="toggle-panel-menu"]',
		).setAttribute("aria-expanded", "false");
	}

	private async addFiles(
		files: FileList | readonly File[],
	): Promise<BuilderResource[]> {
		const result = addFilesToProject(this.project, Array.from(files));
		for (const resource of [...result.added]) {
			if (resource.kind !== "csv") continue;
			try {
				const parsed = parseCsvRecords(await resource.file.text(), {
					emptyDataError: "CSV must contain a header row.",
					// A marker sequence may start empty and be filled in the player.
					allowNoRows: true,
				});
				resource.csvHeaders = parsed.headers;
			} catch (error) {
				const message = describeError(error);
				result.errors.push(`${resource.file.name}: ${message}`);
				this.removeResourceNow(resource.id);
				result.added.splice(result.added.indexOf(resource), 1);
			}
		}
		this.render();
		this.setStatus(
			result.errors.length
				? result.errors.join(" ")
				: `${String(result.added.length)} file(s) added.`,
			result.errors.length > 0,
		);
		return result.added;
	}

	private pickCsvFor(target: "alignment" | "marker"): void {
		this.csvIntakeTarget = target;
		this.csvInput.click();
	}

	private async finishCsvIntake(): Promise<void> {
		const target = this.csvIntakeTarget;
		this.csvIntakeTarget = null;
		const files = Array.from(this.csvInput.files ?? []);
		this.csvInput.value = "";
		if (!target || files.length === 0) return;
		const added = await this.addFiles(files);
		const csv = added.find((resource) => resource.kind === "csv");
		if (!csv) return;
		if (target === "alignment") this.addAlignment(csv);
		else this.addMarker(csv);
	}

	private render(): void {
		this.renderSidebar();
		const errors = this.validationErrors();
		this.setExportDisabled(errors.length > 0 || this.runtimeFailed);
		if (errors.length && Object.keys(this.project.resources).length > 0)
			this.setStatus(errors.join(" "), true);
		else if (Object.keys(this.project.resources).length === 0)
			this.setStatus("");
		this.schedulePreview(errors);
		if (this.activeTarget && this.dialog.open)
			this.renderInspector(this.activeTarget);
	}

	private setExportDisabled(disabled: boolean): void {
		for (const selector of [
			'[data-action="standalone-zip"]',
			'[data-action="toggle-download-menu"]',
		]) {
			this.required<HTMLButtonElement>(selector).disabled = disabled;
		}
	}

	private renderSidebar(): void {
		this.sidebar.replaceChildren();
		const mediaSection = this.sidebarSection("Media");
		const mediaEntries = Object.entries(this.project.media);
		for (const [id, media] of mediaEntries) {
			const resource = this.project.resources[media.resourceId];
			mediaSection.append(
				this.sidebarItem(
					id,
					`${media.config.type} · ${resourceLabel(resource)}`,
					() =>
						this.openInspector({ kind: "media", id, resourceId: resource.id }),
					() => this.removeMedia(id),
				),
			);
		}
		const csvResources = Object.values(this.project.resources).filter(
			(resource) => resource.kind === "csv",
		);
		if (csvResources.length) {
			for (const resource of csvResources) {
				mediaSection.append(
					this.sidebarItem(
						resource.file.name,
						resource.csvError ??
							`${String(resource.csvHeaders?.length ?? 0)} columns`,
						undefined,
						() => this.removeResource(resource.id),
					),
				);
			}
		}
		const addFiles = button("Add media");
		addFiles.addEventListener("click", () => this.fileInput.click());
		mediaSection.append(addFiles);
		this.sidebar.append(mediaSection);

		const alignment = this.sidebarSection("Alignment");
		if (this.project.alignment) {
			alignment.append(
				this.sidebarItem(
					"Alignment mapping",
					this.project.resources[this.project.alignment.resourceId]?.file
						.name ?? "Missing CSV",
					() =>
						this.openInspector({
							kind: "alignment",
							resourceId: this.project.alignment?.resourceId,
						}),
					() => {
						this.project.alignment = undefined;
						this.render();
					},
				),
			);
		} else {
			const actions = document.createElement("div");
			actions.className =
				"ts-builder-sidebar-actions ts-builder-sidebar-actions--or";
			const uploadCsv = button("Upload CSV");
			uploadCsv.addEventListener("click", () => this.pickCsvFor("alignment"));
			const or = document.createElement("span");
			or.className = "ts-builder-sidebar-actions__or";
			or.textContent = "or";
			const compute = button("Compute in browser");
			compute.addEventListener("click", () => this.openAlignmentCompute());
			actions.append(uploadCsv, or, compute);
			alignment.append(actions);
		}
		this.sidebar.append(alignment);

		const markers = this.sidebarSection("Markers");
		for (const [id, marker] of Object.entries(this.project.markers)) {
			markers.append(
				this.sidebarItem(
					id,
					marker.config.type,
					() =>
						this.openInspector({
							kind: "marker",
							id,
							resourceId: marker.resourceId,
						}),
					() => this.removeMarker(id),
				),
			);
		}
		const markerActions = document.createElement("div");
		markerActions.className =
			"ts-builder-sidebar-actions ts-builder-sidebar-actions--or";
		const uploadMarkers = button("Upload CSV");
		uploadMarkers.addEventListener("click", () => this.pickCsvFor("marker"));
		const markersOr = document.createElement("span");
		markersOr.className = "ts-builder-sidebar-actions__or";
		markersOr.textContent = "or";
		const addInBrowser = button("Add blank marker set");
		addInBrowser.addEventListener(
			"click",
			() => void this.createEmptyMarkerSequence(),
		);
		markerActions.append(uploadMarkers, markersOr, addInBrowser);
		markers.append(markerActions);
		this.sidebar.append(markers);

		const presets = this.sidebarSection("Presets");
		for (const id of Object.keys(this.project.presets)) {
			presets.append(
				this.sidebarItem(
					id,
					`${String(this.project.presets[id].tracks.length)} tracks`,
					() => this.openInspector({ kind: "preset", id }),
					() => {
						delete this.project.presets[id];
						this.render();
					},
				),
			);
		}
		const addPreset = button("Add preset");
		addPreset.addEventListener("click", () => this.addPreset());
		presets.append(addPreset);
		this.sidebar.append(presets);

		const global = this.sidebarSection("Player");
		const features = button("Feature settings");
		features.addEventListener("click", () =>
			this.openInspector({ kind: "features" }),
		);
		global.append(features);
		this.sidebar.append(global);

		const exportSection = this.sidebarSection("Export");
		exportSection.append(this.renderDownloadSplitButton());
		this.sidebar.append(exportSection);
		this.sidebar.append(this.status);
	}

	private sidebarSection(label: string): HTMLElement {
		const section = document.createElement("section");
		section.className = "ts-builder-sidebar__section";
		section.setAttribute("aria-label", label);
		const heading = document.createElement("h3");
		heading.textContent = label;
		section.append(heading);
		return section;
	}

	private sidebarItem(
		title: string,
		meta: string,
		edit?: () => void,
		remove?: () => void,
	): HTMLElement {
		const item = document.createElement("div");
		item.className = "ts-builder-sidebar-item";
		const copy = document.createElement("div");
		const strong = document.createElement("strong");
		strong.textContent = title;
		const small = document.createElement("span");
		small.textContent = meta;
		copy.append(strong, small);
		const actions = document.createElement("div");
		if (edit) {
			const gear = button("⚙", "ts-builder-icon-button");
			gear.setAttribute("aria-label", `Configure ${title}`);
			gear.addEventListener("click", edit);
			actions.append(gear);
		}
		if (remove) {
			const removeButton = button("×", "ts-builder-icon-button");
			removeButton.setAttribute("aria-label", `Remove ${title}`);
			removeButton.addEventListener("click", remove);
			actions.append(removeButton);
		}
		item.append(copy, actions);
		return item;
	}

	private renderDownloadSplitButton(): HTMLElement {
		const group = document.createElement("div");
		group.className = "ts-builder-download-split";

		const main = button("Download player", "ts-builder-primary-button");
		main.classList.add("ts-builder-download-split__main");
		main.dataset.action = "standalone-zip";
		main.addEventListener(
			"click",
			() => void this.downloadArchive("standalone"),
		);

		const toggle = document.createElement("button");
		toggle.type = "button";
		toggle.className = "ts-builder-download-split__toggle";
		toggle.dataset.action = "toggle-download-menu";
		toggle.setAttribute("aria-haspopup", "menu");
		toggle.setAttribute("aria-expanded", "false");
		toggle.setAttribute("aria-label", "More download options");
		toggle.textContent = "▾";

		const menu = document.createElement("div");
		menu.className = "ts-builder-download-menu";
		menu.setAttribute("role", "menu");
		menu.hidden = true;

		const closeMenu = () => {
			menu.hidden = true;
			toggle.setAttribute("aria-expanded", "false");
		};

		const configOnly = button(
			"Config only (.json)",
			"ts-builder-panel-menu__item",
		);
		configOnly.setAttribute("role", "menuitem");
		configOnly.addEventListener("click", () => {
			closeMenu();
			this.downloadConfig();
		});
		const projectZip = button(
			"Config + media (.zip)",
			"ts-builder-panel-menu__item",
		);
		projectZip.setAttribute("role", "menuitem");
		projectZip.addEventListener("click", () => {
			closeMenu();
			void this.downloadArchive("project");
		});
		menu.append(configOnly, projectZip);

		toggle.addEventListener("click", () => {
			const open = menu.hidden;
			menu.hidden = !open;
			toggle.setAttribute("aria-expanded", String(open));
			if (open) configOnly.focus();
		});
		menu.addEventListener("keydown", (event) => {
			if (event.key !== "Escape") return;
			closeMenu();
			toggle.focus();
		});

		group.append(main, toggle, menu);
		return group;
	}

	private moveView(from: number, to: number): void {
		if (to < 0 || to >= this.project.views.length) return;
		const [view] = this.project.views.splice(from, 1);
		this.project.views.splice(to, 0, view);
		this.render();
	}

	private showViewDropIndicator(row: HTMLElement, before: boolean): void {
		for (const item of this.panelRail.children) {
			item.classList.remove("is-drop-before", "is-drop-after");
		}
		row.classList.add(before ? "is-drop-before" : "is-drop-after");
	}

	/** `slot` is the gap to drop into: 0 is above the first panel. */
	private dropViewAt(slot: number): void {
		if (!this.draggedViewId) return;
		const from = this.project.views.findIndex(
			(view) => view.id === this.draggedViewId,
		);
		if (from < 0) return;
		this.moveView(from, from < slot ? slot - 1 : slot);
	}

	private addView(type: TrackSwitchViewConfig["type"]): void {
		if (
			type === "navigationBar" &&
			this.project.views.some((view) => view.config.type === type)
		) {
			this.setStatus("Only one navigation bar is allowed.", true);
			return;
		}
		this.pendingDraft = { type, config: defaultView(this.project, type) };
		this.openInspector({ kind: "view-draft", viewType: type });
	}

	private commitDraft(): void {
		const draft = this.pendingDraft;
		if (!draft) return;
		if (
			draft.type === "navigationBar" &&
			this.project.views.some((view) => view.config.type === draft.type)
		) {
			this.setDialogError("Only one navigation bar is allowed.");
			return;
		}
		const id = uniqueId(
			draft.type,
			this.project.views.map((view) => view.id),
		);
		const result = appendViewIfValid(
			this.project,
			{ id, config: draft.config },
			normalizeTrackSwitchConfig,
		);
		if (!result.added) {
			this.setDialogError(
				`Could not add ${VIEW_LABELS[draft.type]}: ${result.errors.join(" ")}`,
			);
			return;
		}
		this.pendingDraft = null;
		this.pendingViewId = id;
		this.acceptDialog();
	}

	private setDialogError(message: string): void {
		this.dialogError.textContent = message;
		this.dialogError.hidden = false;
	}

	private addAlignment(
		csv: BuilderResource,
		preferredReference?: string,
		openSettings = true,
		syncTimelineColumn: string | null = null,
	): void {
		const timelines: Record<string, string> = {};
		Object.keys(this.project.media).forEach((id, index) => {
			timelines[id] = csv.csvHeaders?.[index] ?? "";
		});
		if (syncTimelineColumn) timelines[syncTimelineColumn] = syncTimelineColumn;
		this.project.alignment = {
			resourceId: csv.id,
			config: {
				referenceTimeline:
					preferredReference ?? Object.keys(timelines)[0] ?? "",
				timelines,
			},
		};
		this.applyAlignmentFriendlyDefaults();
		const errors = this.validationErrors();
		if (errors.length) {
			this.project.alignment = undefined;
			this.render();
			this.setStatus(`Could not add alignment: ${errors.join(" ")}`, true);
			return;
		}
		this.render();
		if (openSettings) {
			this.openInspector({ kind: "alignment", resourceId: csv.id });
		} else {
			this.acceptDialog();
		}
	}

	/**
	 * Alignment plays one timeline at a time, so a trackList without a
	 * comparisonGroup requires all its tracks to share one alignment column —
	 * which almost never holds for tracks that were separate uploads. Give
	 * those lists a comparisonGroup automatically so alignment stays valid and
	 * its tracks become independently selectable timelines instead.
	 */
	private applyAlignmentFriendlyDefaults(): void {
		const alignment = this.project.alignment;
		if (!alignment) return;
		const timelines = alignment.config.timelines;
		const trackLists = this.project.views.filter(
			(
				view,
			): view is BuilderView & {
				config: Extract<TrackSwitchViewConfig, { type: "trackList" }>;
			} => view.config.type === "trackList",
		);
		const existingGroup = trackLists
			.map((view) => view.config.comparisonGroup)
			.find((group) => group !== undefined);
		for (const view of trackLists) {
			const config = view.config;
			if (config.comparisonGroup !== undefined) continue;
			const placements = config.tracks.map((id) => timelines[id] ?? "");
			const diverges = placements.some(
				(placement) => placement !== placements[0],
			);
			if (diverges) config.comparisonGroup = existingGroup ?? 0;
		}
	}

	/**
	 * Settings apply live to the preview, so Cancel has to undo them: the
	 * dialog snapshots the project when it opens and restores it unless OK was
	 * pressed. Resource URLs stay valid until the outcome is known.
	 */
	private showDialog(): void {
		if (this.dialog.open) return;
		const { resources, ...rest } = this.project;
		this.dialogSnapshot = {
			resources: { ...resources },
			rest: structuredClone(rest),
		};
		this.dialogAccepted = false;
		this.deferredRevocations = [];
		this.dialogOk.disabled = false;
		this.dialogCancel.disabled = false;
		this.dialog.showModal();
	}

	private acceptDialog(): void {
		this.dialogAccepted = true;
		this.dialog.close();
	}

	private finishDialogTransaction(): void {
		const snapshot = this.dialogSnapshot;
		this.dialogSnapshot = null;
		if (!snapshot) return;
		if (this.dialogAccepted) {
			for (const url of this.deferredRevocations) URL.revokeObjectURL(url);
		} else {
			for (const [id, resource] of Object.entries(this.project.resources)) {
				if (!(id in snapshot.resources))
					URL.revokeObjectURL(resource.previewUrl);
			}
			for (const key of Object.keys(this.project.resources)) {
				delete this.project.resources[key];
			}
			Object.assign(this.project.resources, snapshot.resources);
			const project = this.project as unknown as Record<string, unknown>;
			for (const key of Object.keys(project)) {
				if (key !== "resources") delete project[key];
			}
			Object.assign(project, snapshot.rest);
		}
		this.deferredRevocations = [];
	}

	private openAlignmentCompute(): void {
		this.activeTarget = null;
		this.pendingDraft = null;
		this.dialogError.hidden = true;
		this.dialogError.textContent = "";
		this.dialogTitle.textContent = "Compute alignment in browser";
		this.dialogBody.replaceChildren();
		this.confirmDialog = () => this.acceptDialog();
		this.renderAlignmentComputeForm();
		this.showDialog();
	}

	private renderAlignmentComputeForm(): void {
		const eligible = Object.entries(this.project.media).filter(
			([, media]) =>
				media.config.type === "audio" ||
				media.config.type === "midi" ||
				media.config.type === "musicxml",
		);
		const container = document.createElement("div");
		container.className = "ts-builder-form";

		if (eligible.length < 2) {
			const note = document.createElement("p");
			note.textContent =
				"Add at least two audio, MIDI, or MusicXML files before computing an alignment.";
			container.append(note);
			this.dialogBody.append(container);
			return;
		}

		const selectField = (
			labelText: string,
			options: [string, string][],
			tooltipId?: AlignmentHelpTooltipId,
		) => {
			const field = document.createElement("label");
			field.className = "ts-builder-special-field";
			if (tooltipId) {
				field.innerHTML = buildAlignmentHelpLabelHtml({
					label: labelText,
					tooltipId,
					idPrefix: "builder-alignment",
				});
			} else {
				field.append(document.createTextNode(labelText));
			}
			const select = document.createElement("select");
			select.className = "ts-builder-input";
			for (const [value, text] of options) {
				const option = document.createElement("option");
				option.value = value;
				option.textContent = text;
				select.append(option);
			}
			field.append(select);
			return { field, select };
		};

		const reference = selectField(
			"Reference track",
			eligible.map(([id]) => [id, id]),
		);
		const featureSet = selectField(
			"Feature set",
			[
				["chroma", "Chroma"],
				["chroma_dlnco", "Chroma + DLNCO"],
				["chroma_dlnco_synctoolbox", "Chroma + DLNCO (synctoolbox)"],
			],
			"features",
		);
		featureSet.select.value = "chroma_dlnco_synctoolbox";
		const algorithm = selectField(
			"Algorithm",
			[
				["dtw", "DTW"],
				["mrmsdtw", "MrMsDTW"],
			],
			"algorithm",
		);
		algorithm.select.value = "mrmsdtw";

		const checkboxField = (
			labelText: string,
			tooltipId: AlignmentHelpTooltipId,
		) => {
			const field = document.createElement("label");
			field.className = "ts-builder-special-field";
			field.innerHTML = buildAlignmentHelpLabelHtml({
				label: labelText,
				tooltipId,
				idPrefix: "builder-alignment",
			});
			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.style.justifySelf = "start";
			field.append(checkbox);
			return { field, checkbox };
		};
		const syncGeneration = checkboxField(
			"Generate time-synchronized versions of audio",
			"sync-generation",
		);
		const pitchShift = checkboxField(
			"Pitch-shift synchronized audio to match the reference key",
			"pitch-shift",
		);
		pitchShift.checkbox.disabled = true;
		syncGeneration.checkbox.addEventListener("change", () => {
			pitchShift.checkbox.disabled = !syncGeneration.checkbox.checked;
			if (!syncGeneration.checkbox.checked) pitchShift.checkbox.checked = false;
		});

		const progress = this.buildComputeProgressElement();

		this.confirmDialog = () => {
			void this.runAlignmentCompute(
				eligible.map(([id]) => id),
				reference.select.value,
				featureSet.select.value as AlignmentFeatureSetId,
				algorithm.select.value as AlignmentAlgorithmId,
				syncGeneration.checkbox.checked,
				pitchShift.checkbox.checked,
				{ compute: this.dialogOk, cancel: this.dialogCancel, progress },
			);
		};

		container.append(
			reference.field,
			featureSet.field,
			algorithm.field,
			syncGeneration.field,
			pitchShift.field,
			progress.wrapper,
		);
		this.dialogBody.append(container);
		bindAlignmentHelpTooltips(container);
	}

	private buildComputeProgressElement(): ComputeProgressElements {
		const wrapper = document.createElement("div");
		wrapper.className = "ts-builder-compute-progress";
		wrapper.hidden = true;
		const bar = document.createElement("div");
		bar.className = "ts-progress-bar";
		const fill = document.createElement("div");
		fill.className = "ts-progress-fill";
		fill.style.width = "0%";
		bar.append(fill);
		const row = document.createElement("div");
		row.className = "ts-builder-compute-progress__row";
		const percent = document.createElement("span");
		percent.className = "ts-progress-percent";
		percent.textContent = "--%";
		const message = document.createElement("span");
		message.className = "ts-computing-message";
		row.append(percent, message);
		wrapper.append(bar, row);
		return { wrapper, fill, percent, message };
	}

	private updateComputeProgress(
		progress: ComputeProgressElements,
		rawMessage: string,
		isError = false,
	): void {
		progress.wrapper.hidden = false;
		progress.wrapper.classList.toggle("is-error", isError);
		const match = rawMessage.match(/^\[(\d+)%\]\s*(.*)/);
		const displayText = match ? match[2] : rawMessage;
		const percentage = match ? Number.parseInt(match[1], 10) : -1;
		progress.message.textContent = displayText;
		progress.percent.textContent =
			percentage >= 0 ? `${String(percentage)}%` : "--%";
		if (percentage >= 0) progress.fill.style.width = `${String(percentage)}%`;
	}

	private async runAlignmentCompute(
		mediaIds: string[],
		referenceId: string,
		featureSet: AlignmentFeatureSetId,
		algorithm: AlignmentAlgorithmId,
		generateSyncedAudio: boolean,
		pitchShiftEnabled: boolean,
		controls: {
			compute: HTMLButtonElement;
			cancel: HTMLButtonElement;
			progress: ComputeProgressElements;
		},
	): Promise<void> {
		controls.compute.disabled = true;
		controls.cancel.disabled = true;
		this.updateComputeProgress(controls.progress, "Preparing files…");
		this.alignmentWorkerBridge.setProgressCallback((message) => {
			this.updateComputeProgress(controls.progress, message);
		});
		try {
			const files: InteractiveFile[] = [];
			for (const id of mediaIds) {
				const media = this.project.media[id];
				const resource = this.project.resources[media.resourceId];
				const interactiveFile = await processFile(resource.file);
				files.push({ ...interactiveFile, id });
			}
			this.updateComputeProgress(controls.progress, "Initializing Pyodide…");
			await this.alignmentWorkerBridge.initialize();
			this.updateComputeProgress(controls.progress, "Computing alignment…");
			const result = await this.alignmentWorkerBridge.computeAlignment(
				files,
				referenceId,
				featureSet,
				algorithm,
				generateSyncedAudio,
				pitchShiftEnabled,
			);
			const csvFile = new File([result.csv], "alignment.csv", {
				type: "text/csv",
			});
			const added = await this.addFiles([csvFile]);
			const csv = added.find((resource) => resource.kind === "csv");
			if (!csv) throw new Error("Could not read the computed alignment.");
			this.addSynchronizedAudio(result.synchronizedAudio);
			this.addAlignment(
				csv,
				referenceId,
				false,
				result.syncReferenceTimeColumn,
			);
		} catch (error) {
			this.updateComputeProgress(controls.progress, describeError(error), true);
			controls.compute.disabled = false;
			controls.cancel.disabled = false;
		} finally {
			this.alignmentWorkerBridge.setProgressCallback(null);
		}
	}

	private addSynchronizedAudio(
		synchronizedAudio: WorkerComputeResult["synchronizedAudio"],
	): void {
		for (const entry of synchronizedAudio) {
			const binding = this.project.media[entry.fileId];
			if (binding?.config.type !== "audio") continue;
			const file = new File(
				[entry.wavData],
				`${entry.fileId}-synchronized.wav`,
				{
					type: entry.mimeType || "audio/wav",
				},
			);
			const result = addFilesToProject(this.project, [file], undefined, false);
			if (result.added[0]?.kind !== "audio") {
				for (const added of result.added) this.removeResourceNow(added.id);
				throw new Error(
					result.errors[0] ?? "Could not add synchronized audio.",
				);
			}
			binding.synchronizedResourceId = result.added[0].id;
			binding.config.srcTimeScaled = { src: result.added[0].exportPath };
		}
		this.render();
	}

	/** `labelCol` is given for a blank set, which is added without asking for settings. */
	private addMarker(csv: BuilderResource, labelCol?: string): string | null {
		const id = uniqueId("markers", Object.keys(this.project.markers));
		this.project.markers[id] = {
			resourceId: csv.id,
			config: {
				type: "points",
				timeCol: csv.csvHeaders?.[0] ?? "",
				...(labelCol ? { labelCol } : {}),
			},
		};
		const errors = this.validationErrors();
		if (errors.length) {
			delete this.project.markers[id];
			this.render();
			this.setStatus(
				`Could not add marker sequence: ${errors.join(" ")}`,
				true,
			);
			return null;
		}
		this.render();
		if (!labelCol) {
			this.openInspector({ kind: "marker", id, resourceId: csv.id });
		}
		return id;
	}

	/**
	 * A sequence with no markers yet, to be filled by hand in the player. It is
	 * only useful where it can be seen and edited, so every view that draws
	 * marker layers gets one for it and the navigation bar gets the marker tools.
	 */
	private async createEmptyMarkerSequence(): Promise<void> {
		const fileName = `${uniqueId(
			"markers",
			Object.values(this.project.resources).map((resource) =>
				resource.file.name.replace(/\.csv$/, ""),
			),
		)}.csv`;
		const added = await this.addFiles([
			new File(["time,label\n"], fileName, { type: "text/csv" }),
		]);
		const csv = added.find((resource) => resource.kind === "csv");
		const id = csv ? this.addMarker(csv, "label") : null;
		if (id === null) return;

		for (const view of this.project.views) {
			const config = view.config;
			if (MARKER_LAYER_VIEW_TYPES.has(config.type)) {
				const layered = config as { markerLayers?: MarkerLayerConfig[] };
				layered.markerLayers = [
					...(layered.markerLayers ?? []),
					{ sequence: id },
				];
			} else if (config.type === "navigationBar") {
				// The marker tools go with the transport: right after playback and
				// the global volume and pan, ahead of everything else in the bar.
				const added = (["markerNavigation", "markerEditing"] as const).filter(
					(control) => !config.controls.includes(control),
				);
				const insertAt =
					Math.max(
						...(["playback", "globalVolume", "globalPan"] as const).map(
							(control) => config.controls.indexOf(control),
						),
					) + 1;
				config.controls = [
					...config.controls.slice(0, insertAt),
					...added,
					...config.controls.slice(insertAt),
				];
			}
		}
		this.render();
	}

	/**
	 * Markers edited in the preview live in the player. Writing them back into
	 * the sequence's CSV resource is what carries them through the next preview
	 * reload and into the export.
	 */
	private persistEditedMarkers(sequenceId: string): void {
		const marker = this.project.markers[sequenceId];
		const resource = marker
			? this.project.resources[marker.resourceId]
			: undefined;
		const controller = this.preview?.controller;
		if (!resource || !controller) return;

		resource.file = new File(
			[controller.getMarkersCsv(sequenceId)],
			resource.file.name,
			{ type: "text/csv" },
		);
		URL.revokeObjectURL(resource.previewUrl);
		resource.previewUrl = URL.createObjectURL(resource.file);
	}

	private addPreset(): void {
		const tracks = Object.entries(this.project.media)
			.filter(([, media]) => media.config.type === "audio")
			.map(([id]) => id);
		if (!tracks.length) {
			this.setStatus("Add audio before creating a preset.", true);
			return;
		}
		const id = uniqueId("preset", Object.keys(this.project.presets));
		this.project.presets[id] = { tracks };
		this.render();
		this.openInspector({ kind: "preset", id });
	}

	private openInspector(target: FormTarget): void {
		this.activeTarget = target;
		this.confirmDialog =
			target.kind === "view-draft"
				? () => this.commitDraft()
				: () => this.acceptDialog();
		this.renderInspector(target);
		this.showDialog();
		this.dialogBody
			.querySelector<HTMLElement>("input, select, button")
			?.focus();
	}

	private renderInspector(target: FormTarget): void {
		this.dialogBody.replaceChildren();
		let title = "Settings";
		let value: Record<string, unknown>;
		let schema: JsonSchema;
		let skip = new Set(["type", "src", "css"]);
		if (target.kind === "media" && target.id) {
			const binding = this.project.media[target.id];
			if (!binding) return;
			title = `${target.id} media`;
			value = binding.config as unknown as Record<string, unknown>;
			schema = getDiscriminatedSchema(
				this.rootSchema,
				"MediaEntryConfig",
				binding.config.type,
			);
			this.dialogBody.append(
				this.idEditor("Media ID", target.id, (oldId, nextId) => {
					const renamed = renameMediaId(this.project, oldId, nextId);
					this.activeTarget = { ...target, id: renamed };
				}),
			);
			if (binding.config.type === "audio") {
				skip = new Set(["type", "src", "srcTimeScaled", "css"]);
				this.dialogBody.append(this.synchronizedSourceEditor(target.id));
			}
		} else if (target.kind === "view" && target.id) {
			const view = this.project.views.find((entry) => entry.id === target.id);
			if (!view) return;
			title = `${VIEW_LABELS[view.config.type]} settings`;
			value = view.config as unknown as Record<string, unknown>;
			schema = getDiscriminatedSchema(
				this.rootSchema,
				"TrackSwitchViewConfig",
				view.config.type,
			);
			if (view.config.type === "image" || view.config.type === "pianoRoll") {
				const config = view.config;
				skip = new Set(["type", "src", "css", "mediaID"]);
				this.dialogBody.append(
					this.mediaFileEditor(
						config.type === "image" ? "image" : "midi",
						() => config,
						() => this.render(),
					),
				);
			}
		} else if (target.kind === "view-draft" && this.pendingDraft) {
			const draft = this.pendingDraft;
			title = `${VIEW_LABELS[draft.type]} settings`;
			value = draft.config as unknown as Record<string, unknown>;
			schema = getDiscriminatedSchema(
				this.rootSchema,
				"TrackSwitchViewConfig",
				draft.type,
			);
			if (draft.config.type === "image" || draft.config.type === "pianoRoll") {
				const config = draft.config;
				skip = new Set(["type", "src", "css", "mediaID"]);
				this.dialogBody.append(
					this.mediaFileEditor(
						config.type === "image" ? "image" : "midi",
						() => config,
						() => this.render(),
					),
				);
			}
		} else if (target.kind === "alignment" && this.project.alignment) {
			title = "Alignment settings";
			value = this.project.alignment.config as unknown as Record<
				string,
				unknown
			>;
			schema = getDefinition(this.rootSchema, "AlignmentConfig");
			this.dialogBody.append(
				this.csvSourceEditor(target, this.project.alignment),
			);
		} else if (target.kind === "marker" && target.id) {
			const marker = this.project.markers[target.id];
			if (!marker) return;
			title = `${target.id} marker settings`;
			value = marker.config as unknown as Record<string, unknown>;
			schema = getDefinition(this.rootSchema, "MarkerSequenceSourceConfig");
			this.dialogBody.append(
				this.idEditor("Sequence ID", target.id, (oldId, nextId) => {
					const renamed = renameMarkerId(this.project, oldId, nextId);
					this.activeTarget = { ...target, id: renamed };
				}),
			);
			this.dialogBody.append(this.csvSourceEditor(target, marker));
		} else if (target.kind === "preset" && target.id) {
			const preset = this.project.presets[target.id];
			if (!preset) return;
			title = `${target.id} preset`;
			value = preset as unknown as Record<string, unknown>;
			schema = getDefinition(this.rootSchema, "PresetConfig");
			this.dialogBody.append(
				this.idEditor("Preset ID", target.id, (oldId, nextId) => {
					const clean = slugifyId(nextId);
					if (clean !== oldId && this.project.presets[clean])
						throw new Error(`Preset ID already exists: ${clean}`);
					delete this.project.presets[oldId];
					this.project.presets[clean] = preset;
					this.activeTarget = { ...target, id: clean };
				}),
			);
		} else if (target.kind === "features") {
			title = "Feature settings";
			value = this.project.features as Record<string, unknown>;
			schema = schemaForFeatures(this.rootSchema);
		} else return;

		this.dialogError.hidden = true;
		this.dialogError.textContent = "";
		this.dialogTitle.textContent = title;
		const form = document.createElement("div");
		form.className = "ts-builder-form";
		this.dialogBody.append(form);
		renderSchemaForm(
			form,
			value,
			schema,
			{
				rootSchema: this.rootSchema,
				project: this.project,
				target: this.activeTarget ?? target,
				onChange: () => this.renderAfterFieldChange(),
				onStructureChange: () => {
					if (this.activeTarget) this.renderInspector(this.activeTarget);
					this.renderAfterFieldChange();
				},
			},
			skip,
		);
	}

	private idEditor(
		labelText: string,
		currentId: string,
		rename: (oldId: string, nextId: string) => void,
	): HTMLElement {
		const field = document.createElement("label");
		field.className = "ts-builder-special-field";
		field.append(document.createTextNode(labelText));
		const input = document.createElement("input");
		input.className = "ts-builder-input";
		input.value = currentId;
		input.addEventListener("change", () => {
			try {
				rename(currentId, input.value);
				this.render();
			} catch (error) {
				input.value = currentId;
				this.setStatus(describeError(error), true);
			}
		});
		field.append(input);
		return field;
	}

	private mediaFileEditor(
		kind: "image" | "midi",
		getConfig: () => { mediaID: string },
		onPicked: () => void,
	): HTMLElement {
		const labels = {
			image: {
				title: "Track image",
				choose: "Choose an uploaded image…",
				prompt: "Drop or paste an image, or click to choose a file",
				accept: "image/*",
				invalid: "Select a supported image file.",
			},
			midi: {
				title: "MIDI file",
				choose: "Choose an uploaded MIDI file…",
				prompt: "Drop a MIDI file here, or click to choose a file",
				accept: ".mid,.midi,audio/midi,audio/x-midi",
				invalid: "Select a supported MIDI file.",
			},
		}[kind];
		const wrapper = document.createElement("div");
		wrapper.className = "ts-builder-special-field";
		const label = document.createElement("strong");
		label.textContent = labels.title;
		wrapper.append(label);

		const config = getConfig();
		const currentBinding = config.mediaID
			? this.project.media[config.mediaID]
			: undefined;
		if (currentBinding && kind === "image") {
			const preview = document.createElement("img");
			preview.className = "ts-builder-image-picker__preview";
			preview.alt = "";
			preview.src =
				this.project.resources[currentBinding.resourceId].previewUrl;
			wrapper.append(preview);
		}

		const existing = Object.entries(this.project.media).filter(
			([, media]) => media.config.type === kind,
		);
		if (existing.length) {
			const select = document.createElement("select");
			select.className = "ts-builder-input";
			const blank = document.createElement("option");
			blank.value = "";
			blank.textContent = labels.choose;
			blank.selected = !config.mediaID;
			select.append(blank);
			for (const [id] of existing) {
				const option = document.createElement("option");
				option.value = id;
				option.textContent = id;
				option.selected = id === config.mediaID;
				select.append(option);
			}
			select.addEventListener("change", () => {
				getConfig().mediaID = select.value;
				onPicked();
			});
			wrapper.append(select);
		}

		const picker = document.createElement("div");
		picker.className = "ts-builder-image-picker";
		picker.tabIndex = 0;
		picker.textContent = labels.prompt;
		const input = document.createElement("input");
		input.type = "file";
		input.accept = labels.accept;
		input.hidden = true;
		picker.append(input);
		const pick = (file: File) =>
			this.pickMediaFile(kind, labels.invalid, file, getConfig, onPicked);
		picker.addEventListener("click", () => input.click());
		picker.addEventListener("keydown", (event) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				input.click();
			}
		});
		picker.addEventListener("dragover", (event) => {
			if (!isFileDrag(event)) return;
			event.preventDefault();
			picker.classList.add("is-drop-target");
		});
		picker.addEventListener("dragleave", () =>
			picker.classList.remove("is-drop-target"),
		);
		picker.addEventListener("drop", (event) => {
			if (!isFileDrag(event)) return;
			event.preventDefault();
			picker.classList.remove("is-drop-target");
			const file = event.dataTransfer?.files[0];
			if (file) pick(file);
		});
		if (kind === "image") {
			picker.addEventListener("paste", (event) => {
				const item = Array.from(event.clipboardData?.items ?? []).find(
					(entry) => entry.type.startsWith("image/"),
				);
				const file = item?.getAsFile();
				if (file) pick(file);
			});
		}
		input.addEventListener("change", () => {
			const file = input.files?.[0];
			if (file) pick(file);
			input.value = "";
		});
		wrapper.append(picker);

		return wrapper;
	}

	private pickMediaFile(
		kind: "image" | "midi",
		invalidMessage: string,
		file: File,
		getConfig: () => { mediaID: string },
		onPicked: () => void,
	): void {
		const result = addFilesToProject(this.project, [file], undefined, false);
		const resource = result.added[0];
		if (resource?.kind !== kind) {
			for (const added of result.added) this.removeResourceNow(added.id);
			this.setStatus(result.errors[0] ?? invalidMessage, true);
			return;
		}
		const mediaId = uniqueId(
			slugifyId(file.name.replace(/\.[^./]+$/, "")),
			Object.keys(this.project.media),
		);
		this.project.media[mediaId] = {
			resourceId: resource.id,
			config: { type: kind, src: resource.exportPath },
		};
		getConfig().mediaID = mediaId;
		onPicked();
	}

	private csvSourceEditor(
		_target: FormTarget,
		owner: { resourceId: string },
	): HTMLElement {
		const field = document.createElement("label");
		field.className = "ts-builder-special-field";
		field.append(document.createTextNode("CSV source"));
		const select = document.createElement("select");
		select.className = "ts-builder-input";
		for (const resource of Object.values(this.project.resources).filter(
			(entry) => entry.kind === "csv",
		)) {
			const option = document.createElement("option");
			option.value = resource.id;
			option.textContent = resource.file.name;
			option.selected = resource.id === owner.resourceId;
			select.append(option);
		}
		select.addEventListener("change", () => {
			owner.resourceId = select.value;
			if (this.activeTarget) this.activeTarget.resourceId = select.value;
			this.render();
		});
		field.append(select);
		return field;
	}

	private synchronizedSourceEditor(mediaId: string): HTMLElement {
		const binding = this.project.media[mediaId];
		const wrapper = document.createElement("div");
		wrapper.className = "ts-builder-special-field";
		const label = document.createElement("strong");
		label.textContent = "Time-scaled audio source";
		const resource = binding.synchronizedResourceId
			? this.project.resources[binding.synchronizedResourceId]
			: undefined;
		const copy = document.createElement("span");
		copy.textContent = resource ? resource.file.name : "Not included";
		const choose = button(resource ? "Replace source" : "Choose audio file");
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "audio/*";
		input.hidden = true;
		choose.addEventListener("click", () => input.click());
		input.addEventListener("change", () => {
			const selected = input.files?.[0];
			if (!selected) return;
			const result = addFilesToProject(
				this.project,
				[selected],
				undefined,
				false,
			);
			if (result.added[0]?.kind !== "audio") {
				for (const added of result.added) this.removeResourceNow(added.id);
				this.setStatus(
					result.errors[0] ?? "Select a supported audio file.",
					true,
				);
				return;
			}
			if (resource) this.removeResourceNow(resource.id);
			binding.synchronizedResourceId = result.added[0].id;
			if (binding.config.type === "audio")
				binding.config.srcTimeScaled = { src: result.added[0].exportPath };
			this.render();
		});
		wrapper.append(label, copy, choose, input);
		if (
			resource &&
			binding.config.type === "audio" &&
			binding.config.srcTimeScaled
		) {
			const settings = document.createElement("div");
			settings.className = "ts-builder-form";
			renderSchemaForm(
				settings,
				binding.config.srcTimeScaled as unknown as Record<string, unknown>,
				getDefinition(this.rootSchema, "SynchronizedAudioSourceConfig"),
				{
					rootSchema: this.rootSchema,
					project: this.project,
					target: this.activeTarget ?? { kind: "media", id: mediaId },
					onChange: () => this.renderAfterFieldChange(),
					onStructureChange: () => {
						if (this.activeTarget) this.renderInspector(this.activeTarget);
						this.renderAfterFieldChange();
					},
				},
				new Set(["src"]),
			);
			wrapper.append(settings);
			const remove = button("Remove source", "ts-builder-text-button");
			remove.addEventListener("click", () => {
				this.removeResourceNow(resource.id);
				delete binding.synchronizedResourceId;
				if (binding.config.type === "audio")
					delete binding.config.srcTimeScaled;
				this.render();
			});
			wrapper.append(remove);
		}
		return wrapper;
	}

	private renderAfterFieldChange(): void {
		const errors = this.validationErrors();
		this.setExportDisabled(errors.length > 0 || this.runtimeFailed);
		if (errors.length) this.setStatus(errors.join(" "), true);
		this.schedulePreview(errors);
	}

	private validationErrors(): string[] {
		return validateBuilderProject(this.project, normalizeTrackSwitchConfig);
	}

	private schedulePreview(errors: string[]): void {
		if (this.previewTimer !== undefined) window.clearTimeout(this.previewTimer);
		if (errors.length) return;
		this.runtimeFailed = false;
		this.setExportDisabled(false);
		this.previewTimer = window.setTimeout(() => {
			this.updatePreview(buildRuntimePreviewConfig(this.project));
		}, 250);
	}

	private updatePreview(config: TrackSwitchInit): void {
		if (!this.preview) {
			this.preview = document.createElement(
				"trackswitch-player",
			) as TrackswitchPreviewElement;
			this.preview.addEventListener("trackswitch-loaded", () => {
				this.runtimeFailed = false;
				this.pendingViewId = null;
				this.setExportDisabled(this.validationErrors().length > 0);
				this.decoratePreviewPanels();
			});
			this.preview.addEventListener("trackswitch-error", (event) => {
				const detail = (event as CustomEvent<{ message?: string }>).detail;
				const message = detail?.message ?? "Unknown runtime error.";
				if (this.pendingViewId) {
					const failedViewId = this.pendingViewId;
					this.pendingViewId = null;
					const index = this.project.views.findIndex(
						(view) => view.id === failedViewId,
					);
					if (index >= 0) this.project.views.splice(index, 1);
					if (
						this.activeTarget?.kind === "view" &&
						this.activeTarget.id === failedViewId &&
						this.dialog.open
					) {
						this.activeTarget = null;
						this.acceptDialog();
					} else {
						this.render();
					}
					this.setStatus(
						`Could not add panel, so it was removed: ${message}`,
						true,
					);
					return;
				}
				this.runtimeFailed = true;
				this.setExportDisabled(true);
				this.setStatus(`Player could not load: ${message}`, true);
			});
			this.preview.addEventListener("trackswitch-markers", (event) => {
				const detail = (event as CustomEvent<{ sequenceId: string }>).detail;
				this.persistEditedMarkers(detail.sequenceId);
			});
			this.previewHost.replaceChildren(this.preview);
		}
		this.preview.config = config;
		window.requestAnimationFrame(() => this.decoratePreviewPanels());
	}

	private decoratePreviewPanels(): void {
		const shadowRoot = this.preview?.shadowRoot;
		const mount = shadowRoot?.querySelector<HTMLElement>(
			".trackswitch-element-mount",
		);
		this.panelRail.replaceChildren();
		if (!shadowRoot || !mount) return;
		shadowRoot
			.querySelectorAll(".ts-builder-preview-toolbar")
			.forEach((toolbar) => {
				toolbar.remove();
			});
		mount
			.querySelectorAll<HTMLElement>("[data-builder-panel]")
			.forEach((host) => {
				delete host.dataset.builderPanel;
				host.draggable = false;
			});
		const mountChildren = Array.from(mount.children).filter(
			(child): child is HTMLElement =>
				child instanceof HTMLElement &&
				!child.classList.contains("ts-builder-preview-toolbar"),
		);
		const hosts = mountChildren.slice(-this.project.views.length);
		const previewRect = this.previewHost.getBoundingClientRect();
		let previousBottom = -8;
		this.project.views.forEach((view, index) => {
			const host = hosts[index];
			if (!host) return;
			const hostRect = host.getBoundingClientRect();
			const row = document.createElement("div");
			row.className = "ts-builder-panel-rail__item";
			row.draggable = true;
			row.dataset.viewId = view.id;
			row.setAttribute(
				"aria-label",
				`${VIEW_LABELS[view.config.type]} panel controls`,
			);
			const naturalTop = hostRect.top - previewRect.top;
			const top = Math.max(naturalTop, previousBottom + 4);
			row.style.top = `${String(Math.max(0, Math.round(top)))}px`;
			previousBottom = top + 64;
			const heading = document.createElement("div");
			heading.className = "ts-builder-panel-rail__heading";
			const grip = document.createElement("span");
			grip.className = "ts-builder-panel-rail__grip";
			grip.textContent = "⠿";
			grip.setAttribute("aria-hidden", "true");
			const name = document.createElement("span");
			name.textContent = `${String(index + 1).padStart(2, "0")} ${VIEW_LABELS[view.config.type]}`;
			heading.append(grip, name);
			const actions = document.createElement("span");
			actions.className = "ts-builder-panel-rail__actions";
			const control = (
				text: string,
				accessibleLabel: string,
				onClick: () => void,
			) => {
				const element = document.createElement("button");
				element.type = "button";
				element.className = "ts-builder-icon-button";
				element.textContent = text;
				element.setAttribute("aria-label", accessibleLabel);
				element.addEventListener("click", (event) => {
					event.stopPropagation();
					onClick();
				});
				return element;
			};
			const up = control("↑", `Move ${name.textContent} up`, () =>
				this.moveView(index, index - 1),
			);
			up.disabled = index === 0;
			const down = control("↓", `Move ${name.textContent} down`, () =>
				this.moveView(index, index + 1),
			);
			down.disabled = index === this.project.views.length - 1;
			const gear = control("⚙", `Configure ${name.textContent}`, () =>
				this.openInspector({ kind: "view", id: view.id }),
			);
			const remove = control("×", `Remove ${name.textContent}`, () => {
				this.project.views.splice(index, 1);
				this.render();
			});
			actions.append(up, down, gear, remove);
			row.append(heading, actions);
			row.addEventListener("dragstart", (event) => {
				this.draggedViewId = view.id;
				if (event.dataTransfer) {
					event.dataTransfer.effectAllowed = "move";
					event.dataTransfer.setData("text/plain", view.id);
				}
				row.classList.add("is-dragging");
			});
			row.addEventListener("dragend", () => {
				this.draggedViewId = null;
				row.classList.remove("is-dragging");
				for (const item of this.panelRail.children) {
					item.classList.remove("is-drop-before", "is-drop-after");
				}
			});
			// Insertion slot (0..views.length): before this panel when the pointer
			// is in its upper half, after it otherwise.
			const slotFor = (event: DragEvent) => {
				const rect = row.getBoundingClientRect();
				return event.clientY < rect.top + rect.height / 2 ? index : index + 1;
			};
			row.addEventListener("dragover", (event) => {
				if (!this.draggedViewId) return;
				event.preventDefault();
				if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
				this.showViewDropIndicator(row, slotFor(event) === index);
			});
			row.addEventListener("dragleave", () =>
				row.classList.remove("is-drop-before", "is-drop-after"),
			);
			row.addEventListener("drop", (event) => {
				if (!this.draggedViewId) return;
				event.preventDefault();
				this.dropViewAt(slotFor(event));
			});
			this.panelRail.append(row);
		});
	}

	private removeMedia(id: string): void {
		const binding = this.project.media[id];
		if (!binding) return;
		detachMedia(this.project, id);
		this.removeResourceNow(binding.resourceId);
		if (binding.synchronizedResourceId)
			this.removeResourceNow(binding.synchronizedResourceId);
		delete this.project.media[id];
		this.render();
	}

	private removeMarker(id: string): void {
		const references = findMarkerReferences(this.project, id);
		if (references.length) {
			this.setStatus(
				`Remove marker layers before deleting ${id}: ${references.join(", ")}.`,
				true,
			);
			return;
		}
		delete this.project.markers[id];
		this.render();
	}

	private removeResource(id: string): void {
		const usedBy = [
			...(this.project.alignment?.resourceId === id ? ["alignment"] : []),
			...Object.entries(this.project.markers)
				.filter(([, marker]) => marker.resourceId === id)
				.map(([markerId]) => `markers.${markerId}`),
		];
		if (usedBy.length) {
			this.setStatus(
				`Remove references before deleting this file: ${usedBy.join(", ")}.`,
				true,
			);
			return;
		}
		this.removeResourceNow(id);
		this.render();
	}

	private removeResourceNow(id: string): void {
		const resource = this.project.resources[id];
		if (resource) {
			if (this.dialogSnapshot)
				this.deferredRevocations.push(resource.previewUrl);
			else URL.revokeObjectURL(resource.previewUrl);
		}
		delete this.project.resources[id];
	}

	private downloadConfig(): void {
		const errors = this.validationErrors();
		if (errors.length) {
			this.setStatus(errors.join(" "), true);
			return;
		}
		const json = `${JSON.stringify(buildPlayerConfig(this.project, "export"), null, "\t")}\n`;
		const url = URL.createObjectURL(
			new Blob([json], { type: "application/json" }),
		);
		const link = document.createElement("a");
		link.href = url;
		link.download = "trackswitch-config.json";
		link.click();
		window.setTimeout(() => URL.revokeObjectURL(url), 0);
		this.setStatus("trackswitch-config.json downloaded.");
	}

	private async downloadArchive(variant: ArchiveVariant): Promise<void> {
		const errors = this.validationErrors();
		if (errors.length) {
			this.setStatus(errors.join(" "), true);
			return;
		}
		try {
			this.setStatus("Building ZIP…");
			let assets: StandaloneAssets | undefined;
			if (variant === "standalone") {
				const [playerScript, license, thirdPartyNotices] = await Promise.all([
					this.fetchText(this.assetUrls.playerScript),
					this.fetchText(this.assetUrls.license),
					this.fetchText(this.assetUrls.thirdPartyNotices),
				]);
				assets = { playerScript, license, thirdPartyNotices };
			}
			const blob = await createArchiveBlob(
				buildArchiveEntries(this.project, variant, assets),
			);
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download =
				variant === "standalone"
					? "trackswitch-standalone.zip"
					: "trackswitch-project.zip";
			link.click();
			window.setTimeout(() => URL.revokeObjectURL(url), 0);
			this.setStatus(`${link.download} downloaded.`);
		} catch (error) {
			this.setStatus(`Could not build the ZIP: ${describeError(error)}`, true);
		}
	}

	private async fetchText(url: string): Promise<string> {
		const response = await fetch(url);
		if (!response.ok)
			throw new Error(`${url} returned ${String(response.status)}.`);
		return response.text();
	}

	private setStatus(message: string, error = false): void {
		this.status.textContent = message;
		this.status.classList.toggle("is-error", error);
	}

	private revokeAllUrls(): void {
		for (const resource of Object.values(this.project.resources))
			URL.revokeObjectURL(resource.previewUrl);
	}
}
