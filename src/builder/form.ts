import type { TrackSwitchViewConfig } from "../types";
import type { BuilderProject } from "./model";
import { type JsonSchema, resolveSchema } from "./schema";

export interface FormTarget {
	kind:
		| "media"
		| "view"
		| "view-draft"
		| "alignment"
		| "marker"
		| "preset"
		| "features";
	id?: string;
	resourceId?: string;
	/** Set for "view-draft" targets, whose view isn't in project.views yet. */
	viewType?: TrackSwitchViewConfig["type"];
}

export interface FormContext {
	rootSchema: JsonSchema;
	project: BuilderProject;
	target: FormTarget;
	onChange(): void;
	onStructureChange(): void;
}

type MutableRecord = Record<string, unknown>;

function hasOwn(target: object, key: PropertyKey): boolean {
	return Object.keys(target).includes(String(key));
}

export function placeNavigationControl<T extends string>(
	controls: readonly T[],
	control: T,
	targetIndex: number,
): T[] {
	const next = controls.filter((entry) => entry !== control);
	const index = Math.max(0, Math.min(targetIndex, next.length));
	next.splice(index, 0, control);
	return next;
}

export function removeNavigationControl<T extends string>(
	controls: readonly T[],
	control: T,
): T[] {
	return controls.filter((entry) => entry !== control);
}

const NAVIGATION_CONTROLS = [
	"playback",
	"globalVolume",
	"globalPan",
	"markerNavigation",
	"markerEditing",
	"looping",
	"sync",
	"presets",
	"timer",
	"seekBar",
	"fullscreen-control",
] as const;

const FIELD_DEFAULTS: Record<string, unknown> = {
	align: "center",
	alignedPlayhead: false,
	autoload: false,
	bold: false,
	channelColorIcons: true,
	colorPerChannel: true,
	comparisonGroup: 0,
	customizablePanelOrder: false,
	cursorAlpha: 0.4,
	defaultZoom: 5,
	duplicateAnchors: "first",
	endOffsetMs: 0,
	foldToReference: false,
	fontSize: 16,
	followPlayback: true,
	globalPanControl: "balance",
	grid: "none",
	height: 150,
	italic: false,
	keyboard: true,
	legend: "none",
	line: "dashed",
	lineWidth: 1,
	maxHeight: 380,
	maxWidth: 1000,
	maxZoom: 5,
	muteOtherPlayerInstances: true,
	normalizeLoudness: false,
	noteRange: "automatic",
	noteTooltip: false,
	opacity: 0.5,
	outsideCoverage: "error",
	pan: 0,
	palette: "light",
	panControl: "none",
	pianoKeyboard: false,
	playbackFollowMode: "center",
	renderScale: 0.7,
	repeatEnabled: false,
	rowHeight: 50,
	seekable: false,
	seekMarginLeft: 0,
	seekMarginRight: 0,
	solo: false,
	startOffsetMs: 0,
	tabView: false,
	tempoSmoothingSeconds: 5,
	thickness: 2,
	timer: false,
	trackPanControls: "none",
	trackVolumeControls: false,
	velocityBars: false,
	velocityOpacity: false,
	volume: 1,
	volumeControl: false,
	waveformBarWidth: 1,
};

function titleFor(key: string): string {
	return key
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[-_]+/g, " ")
		.replace(/^./, (letter) => letter.toUpperCase());
}

function resolved(context: FormContext, schema: JsonSchema): JsonSchema {
	return resolveSchema(context.rootSchema, schema);
}

function schemaType(
	context: FormContext,
	schema: JsonSchema,
): string | undefined {
	const node = resolved(context, schema);
	if (node.const !== undefined) return typeof node.const;
	return Array.isArray(node.type) ? undefined : node.type;
}

function defaultValue(context: FormContext, schema: JsonSchema): unknown {
	const node = resolved(context, schema);
	if (node.const !== undefined) return node.const;
	if (Array.isArray(node.type)) {
		return defaultValue(context, { ...node, type: node.type[0] });
	}
	if (node.default !== undefined) return structuredClone(node.default);
	const union = node.oneOf ?? node.anyOf;
	if (union?.length) return defaultValue(context, union[0]);
	if (node.type === "array") return [];
	if (node.type === "object") return {};
	if (node.type === "boolean") return false;
	if (node.type === "number" || node.type === "integer") return 0;
	if (node.enum?.length) return node.enum[0];
	return "";
}

function defaultFieldValue(
	context: FormContext,
	key: string,
	schema: JsonSchema,
): unknown {
	const node = resolved(context, schema);
	if (
		key === "height" &&
		(context.target.kind === "view" || context.target.kind === "view-draft")
	) {
		const viewType =
			context.target.viewType ??
			context.project.views.find((entry) => entry.id === context.target.id)
				?.config.type;
		if (viewType === "pianoRoll") return 180;
		if (viewType === "warpingMatrix") return "";
	}
	const describedDefault = node.description?.match(/^Default: (.+)$/)?.[1];
	if (describedDefault !== undefined && schemaType(context, node) === "string")
		return describedDefault;
	return Object.keys(FIELD_DEFAULTS).includes(key)
		? structuredClone(FIELD_DEFAULTS[key])
		: defaultValue(context, node);
}

function fieldOptions(
	context: FormContext,
	key: string,
	path: string,
): string[] | undefined {
	const media = Object.entries(context.project.media);
	if (key === "imageID") {
		return media
			.filter(([, value]) => value.config.type === "image")
			.map(([id]) => id);
	}
	if (key === "mediaID") {
		const viewType =
			context.target.viewType ??
			(context.target.id
				? context.project.views.find((entry) => entry.id === context.target.id)
						?.config.type
				: undefined);
		const wanted =
			viewType === "pianoRoll"
				? "midi"
				: viewType === "sheetMusic"
					? "musicxml"
					: "image";
		return media
			.filter(([, value]) => value.config.type === wanted)
			.map(([id]) => id);
	}
	if (key === "x" || key === "y") {
		return media
			.filter(([, value]) => value.config.type === "audio")
			.map(([id]) => id);
	}
	if (key === "referenceTimeline" || key === "timeline") {
		return Array.from(
			new Set([
				...Object.keys(context.project.media),
				...Object.keys(context.project.alignment?.config.timelines ?? {}),
			]),
		);
	}
	if (key === "sequence") {
		return [
			...Object.keys(context.project.markers),
			...(context.project.alignment ? ["alignment"] : []),
		];
	}
	if (key === "timeCol" || key === "labelCol" || path.endsWith("timelines.*")) {
		const resource = context.target.resourceId
			? context.project.resources[context.target.resourceId]
			: undefined;
		return resource?.csvHeaders;
	}
	if (key === "tracks" || path.includes("channelToTrackIDMap")) {
		return media
			.filter(([, value]) => value.config.type === "audio")
			.map(([id]) => id);
	}
	return undefined;
}

function descriptionElement(schema: JsonSchema): HTMLElement | null {
	if (!schema.description) return null;
	const description = document.createElement("p");
	description.className = "ts-builder-field__description";
	description.textContent = schema.description;
	return description;
}

function smallEmptyMessage(text: string): HTMLSpanElement {
	const message = document.createElement("span");
	message.className = "ts-builder-control-zone__empty";
	message.textContent = text;
	return message;
}

function emitInputChange(
	element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
	setValue: (value: unknown) => void,
	type: string | undefined,
	context: FormContext,
): void {
	element.addEventListener("input", () => {
		if (element instanceof HTMLInputElement && element.type === "checkbox") {
			setValue(element.checked);
		} else if (type === "number" || type === "integer") {
			setValue(element.value === "" ? undefined : Number(element.value));
		} else {
			setValue(element.value);
		}
		context.onChange();
	});
}

function renderScalar(
	container: HTMLElement,
	key: string,
	value: unknown,
	schema: JsonSchema,
	setValue: (value: unknown) => void,
	context: FormContext,
	path: string,
): void {
	const node = resolved(context, schema);
	const type = schemaType(context, node);
	const options = (
		node.enum?.map(String) ?? fieldOptions(context, key, path)
	)?.filter((option, index, values) => values.indexOf(option) === index);
	let input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
	if (options !== undefined) {
		const select = document.createElement("select");
		if (options.length === 0) {
			const empty = document.createElement("option");
			empty.value = "";
			empty.textContent = "No compatible resources";
			select.append(empty);
			select.disabled = true;
		}
		for (const option of options) {
			const element = document.createElement("option");
			element.value = option;
			element.textContent = option;
			select.append(element);
		}
		select.value = String(value ?? options[0] ?? "");
		input = select;
	} else if (type === "boolean") {
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.checked = Boolean(value);
		input = checkbox;
	} else if (key === "text") {
		const textarea = document.createElement("textarea");
		textarea.rows = 4;
		textarea.value = String(value ?? "");
		input = textarea;
	} else {
		const basicInput = document.createElement("input");
		basicInput.type =
			type === "number" || type === "integer" ? "number" : "text";
		basicInput.value = value === undefined ? "" : String(value);
		basicInput.step = type === "integer" ? "1" : "any";
		input = basicInput;
	}
	input.id = `ts-builder-${path.replace(/[^a-z0-9]+/gi, "-")}`;
	input.className = "ts-builder-input";
	emitInputChange(input, setValue, type, context);
	container.append(input);
}

function renderPrimitiveArray(
	container: HTMLElement,
	key: string,
	value: unknown[],
	setValue: (value: unknown) => void,
	context: FormContext,
	path: string,
): void {
	const options = fieldOptions(context, key, path);
	if (options !== undefined) {
		const choices = document.createElement("div");
		choices.className = "ts-builder-choices";
		if (options.length === 0) {
			const empty = document.createElement("span");
			empty.textContent = "No compatible resources";
			choices.append(empty);
		}
		for (const option of options) {
			const label = document.createElement("label");
			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.checked = value.includes(option);
			checkbox.addEventListener("change", () => {
				const next = value.filter((entry) => entry !== option);
				if (checkbox.checked) next.push(option);
				setValue(next);
				context.onStructureChange();
			});
			label.append(checkbox, document.createTextNode(option));
			choices.append(label);
		}
		container.append(choices);
		return;
	}

	const input = document.createElement("input");
	input.className = "ts-builder-input";
	input.value = value.map(String).join(", ");
	input.placeholder = "Comma-separated values";
	input.addEventListener("input", () => {
		setValue(
			input.value
				.split(",")
				.map((entry) => entry.trim())
				.filter(Boolean),
		);
		context.onChange();
	});
	container.append(input);
}

function renderNavigationControls(
	container: HTMLElement,
	value: unknown[],
	setValue: (value: unknown) => void,
	context: FormContext,
): void {
	const controls = value.filter(
		(entry): entry is (typeof NAVIGATION_CONTROLS)[number] =>
			typeof entry === "string" &&
			NAVIGATION_CONTROLS.includes(
				entry as (typeof NAVIGATION_CONTROLS)[number],
			),
	);
	let dragged: (typeof NAVIGATION_CONTROLS)[number] | null = null;
	const commit = (next: readonly string[]) => {
		setValue([...next]);
		context.onStructureChange();
	};
	const editor = document.createElement("div");
	editor.className = "ts-builder-control-editor";
	const instruction = document.createElement("p");
	instruction.className = "ts-builder-control-editor__instruction";
	instruction.textContent =
		"Drag available controls into the player row. Drag shown controls to reorder them.";

	const shown = document.createElement("div");
	shown.className = "ts-builder-control-group";
	const shownLabel = document.createElement("strong");
	shownLabel.textContent = "Shown controls";
	const shownZone = document.createElement("div");
	shownZone.className = "ts-builder-control-zone is-shown";
	shownZone.setAttribute("role", "list");
	shownZone.setAttribute("aria-label", "Shown navigation controls");
	const shownCards: HTMLElement[] = [];
	const clearIndicator = () => {
		shownZone.classList.remove("is-drop-target");
		for (const card of shownCards)
			card.classList.remove("is-drop-before", "is-drop-after");
	};
	// Slot (0..controls.length) the pointer is closest to, reading the wrapped
	// cards in order: before the first card whose row the pointer is above, or
	// whose left half it is in.
	const slotAt = (x: number, y: number): number => {
		for (const [slot, card] of shownCards.entries()) {
			const rect = card.getBoundingClientRect();
			if (y < rect.top || (y <= rect.bottom && x < rect.left + rect.width / 2))
				return slot;
		}
		return shownCards.length;
	};
	const showIndicator = (slot: number) => {
		clearIndicator();
		if (shownCards.length === 0) shownZone.classList.add("is-drop-target");
		else if (slot < shownCards.length)
			shownCards[slot].classList.add("is-drop-before");
		else shownCards[slot - 1].classList.add("is-drop-after");
	};
	shownZone.addEventListener("dragover", (event) => {
		if (!dragged) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
		showIndicator(slotAt(event.clientX, event.clientY));
	});
	shownZone.addEventListener("dragleave", (event) => {
		if (
			event.relatedTarget instanceof Node &&
			shownZone.contains(event.relatedTarget)
		)
			return;
		clearIndicator();
	});
	shownZone.addEventListener("drop", (event) => {
		if (!dragged) return;
		event.preventDefault();
		let slot = slotAt(event.clientX, event.clientY);
		const from = controls.indexOf(dragged);
		// placeNavigationControl removes the dragged control before inserting.
		if (from >= 0 && from < slot) slot -= 1;
		clearIndicator();
		commit(placeNavigationControl(controls, dragged, slot));
	});
	for (const [index, control] of controls.entries()) {
		const card = document.createElement("div");
		card.className = "ts-builder-control-card is-shown";
		card.draggable = true;
		card.tabIndex = 0;
		card.setAttribute("role", "listitem");
		card.setAttribute(
			"aria-label",
			`${titleFor(control)}. Drag to reorder, use arrow keys to move, or Delete to remove.`,
		);
		const grip = document.createElement("span");
		grip.className = "ts-builder-control-card__grip";
		grip.textContent = "⠿";
		grip.setAttribute("aria-hidden", "true");
		const name = document.createElement("span");
		name.textContent = titleFor(control);
		const remove = document.createElement("button");
		remove.type = "button";
		remove.className = "ts-builder-control-card__remove";
		remove.textContent = "×";
		remove.setAttribute("aria-label", `Hide ${titleFor(control)}`);
		remove.addEventListener("click", () =>
			commit(removeNavigationControl(controls, control)),
		);
		card.append(grip, name, remove);
		card.addEventListener("dragstart", (event) => {
			dragged = control;
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = "move";
				event.dataTransfer.setData("text/plain", control);
			}
			card.classList.add("is-dragging");
		});
		card.addEventListener("dragend", () => {
			dragged = null;
			card.classList.remove("is-dragging");
			clearIndicator();
		});
		card.addEventListener("keydown", (event) => {
			if (event.key === "ArrowLeft" && index > 0) {
				event.preventDefault();
				commit(placeNavigationControl(controls, control, index - 1));
			} else if (event.key === "ArrowRight" && index < controls.length - 1) {
				event.preventDefault();
				commit(placeNavigationControl(controls, control, index + 1));
			} else if (event.key === "Delete" || event.key === "Backspace") {
				event.preventDefault();
				commit(removeNavigationControl(controls, control));
			}
		});
		shownZone.append(card);
		shownCards.push(card);
	}
	if (controls.length === 0)
		shownZone.append(smallEmptyMessage("No controls shown."));
	shown.append(shownLabel, shownZone);

	const available = document.createElement("div");
	available.className = "ts-builder-control-group";
	const availableLabel = document.createElement("strong");
	availableLabel.textContent = "Available controls";
	const availableZone = document.createElement("div");
	availableZone.className = "ts-builder-control-zone is-available";
	availableZone.setAttribute("aria-label", "Available navigation controls");
	availableZone.addEventListener("dragover", (event) => {
		if (!dragged) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
		availableZone.classList.add("is-drop-target");
	});
	availableZone.addEventListener("dragleave", (event) => {
		if (
			event.relatedTarget instanceof Node &&
			availableZone.contains(event.relatedTarget)
		)
			return;
		availableZone.classList.remove("is-drop-target");
	});
	availableZone.addEventListener("drop", (event) => {
		if (!dragged) return;
		event.preventDefault();
		availableZone.classList.remove("is-drop-target");
		commit(removeNavigationControl(controls, dragged));
	});
	for (const control of NAVIGATION_CONTROLS.filter(
		(candidate) => !controls.includes(candidate),
	)) {
		const add = document.createElement("button");
		add.type = "button";
		add.className = "ts-builder-control-card is-available";
		add.draggable = true;
		add.textContent = `+ ${titleFor(control)}`;
		add.setAttribute("aria-label", `Show ${titleFor(control)}`);
		add.addEventListener("click", () =>
			commit(placeNavigationControl(controls, control, controls.length)),
		);
		add.addEventListener("dragstart", (event) => {
			dragged = control;
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = "move";
				event.dataTransfer.setData("text/plain", control);
			}
			add.classList.add("is-dragging");
		});
		add.addEventListener("dragend", () => {
			dragged = null;
			add.classList.remove("is-dragging");
			clearIndicator();
		});
		availableZone.append(add);
	}
	if (availableZone.childElementCount === 0)
		availableZone.append(smallEmptyMessage("All controls are shown."));
	available.append(availableLabel, availableZone);
	editor.append(instruction, shown, available);
	container.append(editor);
}

function renderArray(
	container: HTMLElement,
	key: string,
	value: unknown[],
	schema: JsonSchema,
	setValue: (value: unknown) => void,
	context: FormContext,
	path: string,
): void {
	if (
		key === "controls" &&
		(context.target.kind === "view" || context.target.kind === "view-draft")
	) {
		renderNavigationControls(container, value, setValue, context);
		return;
	}
	const node = resolved(context, schema);
	const itemSchemas = Array.isArray(node.items)
		? node.items
		: node.items
			? [node.items]
			: [];
	const firstItem = itemSchemas[0]
		? resolved(context, itemSchemas[0])
		: { type: "string" };
	if (firstItem.type !== "object" && !firstItem.oneOf && !firstItem.anyOf) {
		renderPrimitiveArray(container, key, value, setValue, context, path);
		return;
	}

	const list = document.createElement("div");
	list.className = "ts-builder-nested-list";
	value.forEach((item, index) => {
		const row = document.createElement("fieldset");
		row.className = "ts-builder-nested-item";
		const legend = document.createElement("legend");
		legend.textContent = `${titleFor(key)} ${String(index + 1)}`;
		const actions = document.createElement("div");
		actions.className = "ts-builder-nested-actions";
		const move = (label: string, destination: number) => {
			const moveButton = document.createElement("button");
			moveButton.type = "button";
			moveButton.className = "ts-builder-text-button";
			moveButton.textContent = label;
			moveButton.disabled = destination < 0 || destination >= value.length;
			moveButton.addEventListener("click", () => {
				const next = [...value];
				const [moved] = next.splice(index, 1);
				next.splice(destination, 0, moved);
				setValue(next);
				context.onStructureChange();
			});
			return moveButton;
		};
		const remove = document.createElement("button");
		remove.type = "button";
		remove.className = "ts-builder-text-button";
		remove.textContent = "Remove";
		remove.addEventListener("click", () => {
			const next = [...value];
			next.splice(index, 1);
			setValue(next);
			context.onStructureChange();
		});
		actions.append(
			move("Move up", index - 1),
			move("Move down", index + 1),
			remove,
		);
		row.append(legend, actions);
		const itemSchema = itemSchemas[index] ??
			itemSchemas[0] ?? { type: "string" };
		renderValue(
			row,
			String(index),
			item,
			itemSchema,
			(next) => {
				value[index] = next;
				setValue(value);
			},
			context,
			`${path}.${String(index)}`,
			true,
		);
		list.append(row);
	});
	const add = document.createElement("button");
	add.type = "button";
	add.className = "ts-builder-secondary-button";
	add.textContent = `Add ${titleFor(key).replace(/s$/, "")}`;
	add.addEventListener("click", () => {
		const itemSchema = itemSchemas[value.length] ??
			itemSchemas[0] ?? { type: "string" };
		setValue([...value, defaultValue(context, itemSchema)]);
		context.onStructureChange();
	});
	list.append(add);
	container.append(list);
}

function renderRecord(
	container: HTMLElement,
	key: string,
	value: MutableRecord,
	schema: JsonSchema,
	setValue: (value: unknown) => void,
	context: FormContext,
	path: string,
): void {
	const node = resolved(context, schema);
	const valueSchema =
		typeof node.additionalProperties === "object"
			? node.additionalProperties
			: { type: "string" };
	const list = document.createElement("div");
	list.className = "ts-builder-record";
	for (const [entryKey, entryValue] of Object.entries(value)) {
		const row = document.createElement("div");
		row.className = "ts-builder-record__row";
		const keyInput = document.createElement("input");
		keyInput.className = "ts-builder-input";
		keyInput.value = entryKey;
		keyInput.setAttribute("aria-label", `${titleFor(key)} key`);
		keyInput.addEventListener("change", () => {
			const nextKey = keyInput.value.trim();
			if (!nextKey || nextKey === entryKey || hasOwn(value, nextKey)) return;
			delete value[entryKey];
			value[nextKey] = entryValue;
			setValue(value);
			context.onStructureChange();
		});
		const valueHost = document.createElement("div");
		valueHost.className = "ts-builder-record__value";
		renderValue(
			valueHost,
			entryKey,
			entryValue,
			valueSchema,
			(next) => {
				value[entryKey] = next;
				setValue(value);
			},
			context,
			`${path}.*`,
			true,
		);
		const remove = document.createElement("button");
		remove.type = "button";
		remove.className = "ts-builder-icon-button";
		remove.textContent = "×";
		remove.setAttribute("aria-label", `Remove ${entryKey}`);
		remove.addEventListener("click", () => {
			delete value[entryKey];
			setValue(value);
			context.onStructureChange();
		});
		row.append(keyInput, valueHost, remove);
		list.append(row);
	}
	const add = document.createElement("button");
	add.type = "button";
	add.className = "ts-builder-secondary-button";
	add.textContent = `Add ${titleFor(key).replace(/s$/, "")} entry`;
	add.addEventListener("click", () => {
		let entryKey = "entry";
		let suffix = 2;
		while (hasOwn(value, entryKey)) {
			entryKey = `entry-${String(suffix)}`;
			suffix += 1;
		}
		value[entryKey] = defaultValue(context, valueSchema);
		setValue(value);
		context.onStructureChange();
	});
	list.append(add);
	container.append(list);
}

function unionBranch(
	context: FormContext,
	schema: JsonSchema,
	value: unknown,
): JsonSchema {
	const node = resolved(context, schema);
	const branches = node.oneOf ?? node.anyOf ?? [];
	return (
		branches.find((branch) => {
			const candidate = resolved(context, branch);
			if (candidate.const !== undefined) return candidate.const === value;
			if (candidate.type === "array") return Array.isArray(value);
			return candidate.type === typeof value;
		}) ?? branches[0]
	);
}

function renderValue(
	container: HTMLElement,
	key: string,
	value: unknown,
	schema: JsonSchema,
	setValue: (value: unknown) => void,
	context: FormContext,
	path: string,
	bare = false,
): void {
	const node = resolved(context, schema);
	if (Array.isArray(node.type)) {
		renderValue(
			container,
			key,
			value,
			{
				...node,
				type: undefined,
				oneOf: node.type.map((type) => ({ ...node, type })),
			},
			setValue,
			context,
			path,
			bare,
		);
		return;
	}
	const union = node.oneOf ?? node.anyOf;
	if (union?.length) {
		const wrapper = document.createElement("div");
		wrapper.className = "ts-builder-union";
		const select = document.createElement("select");
		select.className = "ts-builder-input";
		const active = unionBranch(context, node, value);
		union.forEach((branch, index) => {
			const candidate = resolved(context, branch);
			const option = document.createElement("option");
			option.value = String(index);
			option.textContent =
				candidate.const !== undefined
					? String(candidate.const)
					: candidate.type === "array"
						? "Custom list"
						: String(candidate.type ?? `Option ${String(index + 1)}`);
			if (branch === active) option.selected = true;
			select.append(option);
		});
		select.addEventListener("change", () => {
			setValue(defaultValue(context, union[Number(select.value)]));
			context.onStructureChange();
		});
		wrapper.append(select);
		if (resolved(context, active).const === undefined) {
			renderValue(wrapper, key, value, active, setValue, context, path, true);
		}
		container.append(wrapper);
		return;
	}

	const type = schemaType(context, node);
	const host = bare ? container : document.createElement("div");
	if (!bare) host.className = "ts-builder-field__control";
	if (type === "array") {
		renderArray(
			host,
			key,
			Array.isArray(value) ? value : [],
			node,
			setValue,
			context,
			path,
		);
	} else if (type === "object") {
		if (node.properties) {
			renderObjectFields(host, value as MutableRecord, node, context, path);
		} else {
			renderRecord(
				host,
				key,
				(value as MutableRecord) ?? {},
				node,
				setValue,
				context,
				path,
			);
		}
	} else {
		renderScalar(host, key, value, node, setValue, context, path);
	}
	if (!bare) container.append(host);
}

function renderObjectFields(
	container: HTMLElement,
	value: MutableRecord,
	schema: JsonSchema,
	context: FormContext,
	path: string,
	skip: ReadonlySet<string> = new Set(),
): void {
	const node = resolved(context, schema);
	for (const [key, propertySchema] of Object.entries(node.properties ?? {})) {
		if (skip.has(key) || resolved(context, propertySchema).const !== undefined)
			continue;
		const fieldPath = `${path}.${key}`;
		const fieldId = `ts-builder-${fieldPath.replace(/[^a-z0-9]+/gi, "-")}`;
		const displayedValue =
			value[key] ?? defaultFieldValue(context, key, propertySchema);
		const row = document.createElement("div");
		row.className = "ts-builder-field";
		const heading = document.createElement("div");
		heading.className = "ts-builder-field__heading";
		const label = document.createElement("label");
		label.textContent = titleFor(key);
		label.htmlFor = fieldId;
		heading.append(label);
		if (schemaType(context, propertySchema) === "boolean") {
			const switchLabel = document.createElement("label");
			switchLabel.className = "ts-builder-switch";
			switchLabel.htmlFor = fieldId;
			const input = document.createElement("input");
			input.id = fieldId;
			input.type = "checkbox";
			input.checked = Boolean(displayedValue);
			input.setAttribute("role", "switch");
			input.addEventListener("input", () => {
				value[key] = input.checked;
				context.onChange();
			});
			const track = document.createElement("span");
			track.className = "ts-builder-switch__track";
			track.setAttribute("aria-hidden", "true");
			switchLabel.append(input, track);
			heading.append(switchLabel);
		}
		row.append(heading);
		const description = descriptionElement(propertySchema);
		if (description) row.append(description);
		if (schemaType(context, propertySchema) !== "boolean") {
			renderValue(
				row,
				key,
				displayedValue,
				propertySchema,
				(next) => {
					value[key] = next;
				},
				context,
				fieldPath,
			);
		}
		container.append(row);
	}
}

export function renderSchemaForm(
	container: HTMLElement,
	value: MutableRecord,
	schema: JsonSchema,
	context: FormContext,
	skip: ReadonlySet<string> = new Set(["type", "src", "css"]),
): void {
	container.replaceChildren();
	const hidden = new Set([...skip, "css"]);
	renderObjectFields(
		container,
		value,
		schema,
		context,
		context.target.kind,
		hidden,
	);
}

export function schemaForFeatures(root: JsonSchema): JsonSchema {
	const features = root.properties?.features;
	if (!features) throw new Error("Generated schema has no features block.");
	return resolveSchema(root, features);
}
