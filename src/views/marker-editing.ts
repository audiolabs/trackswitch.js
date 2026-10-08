import { clamp } from "../shared/math";
import { renderIconSlotHtml } from "./icons";
import { resizeCanvasForCssSize } from "./surface";

export interface MarkerEditingControlsState {
	active: boolean;
	adding: boolean;
	removing: boolean;
	sonifying: boolean;
	sequenceId: string | null;
	sequenceIds: string[];
}

export function updateMarkerEditingControls(
	root: HTMLElement,
	state: MarkerEditingControlsState,
): void {
	root.classList.toggle("marker-editing", state.active);
	root.classList.toggle("marker-adding", state.active && state.adding);
	root.classList.toggle("marker-removing", state.active && state.removing);

	const toggle = root.querySelector(".marker-edit-toggle");
	if (!(toggle instanceof HTMLButtonElement)) {
		return;
	}
	toggle.disabled = state.sequenceIds.length === 0;
	toggle.classList.toggle("checked", state.active);
	toggle.setAttribute("aria-pressed", String(state.active));
	const toggleLabel = state.active ? "Stop editing markers" : "Edit markers";
	toggle.title = toggleLabel;
	toggle.setAttribute("aria-label", toggleLabel);

	const tools = root.querySelector(".marker-editing-tools");
	if (tools instanceof HTMLElement) {
		tools.hidden = !state.active;
	}

	const select = root.querySelector(".marker-edit-sequence");
	if (select instanceof HTMLSelectElement) {
		const signature = state.sequenceIds.join("\n");
		if (select.dataset.sequences !== signature) {
			select.dataset.sequences = signature;
			select.replaceChildren(
				...state.sequenceIds.map((id) => {
					const option = select.ownerDocument.createElement("option");
					option.value = id;
					option.textContent = id;
					return option;
				}),
			);
		}
		if (state.sequenceId !== null) {
			select.value = state.sequenceId;
		}
	}

	const add = root.querySelector(".marker-edit-add");
	if (add instanceof HTMLButtonElement) {
		add.classList.toggle("checked", state.adding);
		add.setAttribute("aria-pressed", String(state.adding));
	}

	const sonify = root.querySelector(".marker-edit-sonify");
	if (sonify instanceof HTMLButtonElement) {
		sonify.classList.toggle("checked", state.sonifying);
		sonify.setAttribute("aria-pressed", String(state.sonifying));
	}

	const remove = root.querySelector(".marker-edit-remove");
	if (remove instanceof HTMLButtonElement) {
		remove.classList.toggle("checked", state.removing);
		remove.setAttribute("aria-pressed", String(state.removing));
	}
}

const labelEditorDismissByRoot = new WeakMap<
	HTMLElement,
	(commit: boolean) => void
>();

/** Closes the open label field, keeping what was typed only when `commit` is set. */
export function closeMarkerLabelEditor(
	root: HTMLElement,
	commit = false,
): void {
	labelEditorDismissByRoot.get(root)?.(commit);
}

export interface MarkerLabelEditorOptions {
	/** Position on the surface, as a fraction of its width. */
	positionRatio: number;
	label: string;
	onCommit(label: string): void;
	/** Offers a remove button; absent for a marker that does not exist yet. */
	onRemove?(): void;
}

/**
 * A small text field pinned to a position on a seek surface. Enter and leaving
 * the field commit, Escape discards.
 */
export function openMarkerLabelEditor(
	root: HTMLElement,
	seekWrap: HTMLElement,
	options: MarkerLabelEditorOptions,
): void {
	closeMarkerLabelEditor(root, true);

	const document = seekWrap.ownerDocument;
	const editor = document.createElement("div");
	editor.className = "marker-label-editor";
	editor.classList.toggle(
		"marker-label-editor-before",
		options.positionRatio >= 0.75,
	);
	editor.style.setProperty(
		"--ts-marker-position",
		`${options.positionRatio * 100}%`,
	);

	const input = document.createElement("input");
	input.type = "text";
	input.className = "marker-label-input";
	input.placeholder = "Label";
	input.value = options.label;
	input.setAttribute("aria-label", "Marker label");
	editor.appendChild(input);

	let settled = false;
	const settle = (action?: () => void): void => {
		if (settled) {
			return;
		}
		settled = true;
		labelEditorDismissByRoot.delete(root);
		editor.remove();
		action?.();
	};
	const commit = (): void => settle(() => options.onCommit(input.value.trim()));
	labelEditorDismissByRoot.set(root, (keep) => (keep ? commit() : settle()));

	const { onRemove } = options;
	if (onRemove) {
		const remove = document.createElement("button");
		remove.type = "button";
		remove.className = "marker-label-remove";
		remove.title = "Remove marker";
		remove.setAttribute("aria-label", "Remove marker");
		remove.innerHTML = renderIconSlotHtml("trash");
		remove.addEventListener("click", () => settle(onRemove));
		editor.appendChild(remove);
	}

	// The editor sits inside a seek surface; its own pointer input must not seek.
	["mousedown", "touchstart", "click", "dblclick"].forEach((type) => {
		editor.addEventListener(type, (event) => event.stopPropagation());
	});
	input.addEventListener("keydown", (event) => {
		event.stopPropagation();
		if (event.key === "Enter") {
			event.preventDefault();
			commit();
		} else if (event.key === "Escape") {
			event.preventDefault();
			settle();
		}
	});
	editor.addEventListener("focusout", (event) => {
		if (
			event.relatedTarget instanceof Node &&
			editor.contains(event.relatedTarget)
		) {
			return;
		}
		commit();
	});

	seekWrap.appendChild(editor);
	input.focus();
	input.select();
}

/** See `SeekSurfaceRangeRenderer`; crops the image a seek surface lies over. */
export function drawImageSurfaceRange(
	seekWrap: HTMLElement,
	canvas: HTMLCanvasElement,
	cssWidth: number,
	cssHeight: number,
	startRatio: number,
	widthRatio: number,
): void {
	const context = resizeCanvasForCssSize(canvas, cssWidth, cssHeight);
	const image = seekWrap.parentElement?.querySelector("img");
	if (!context || !(image instanceof HTMLImageElement) || !image.naturalWidth) {
		return;
	}
	// The seek surface may cover only part of the picture (its margins).
	const imageRect = image.getBoundingClientRect();
	const wrapRect = seekWrap.getBoundingClientRect();
	const scale = image.naturalWidth / imageRect.width;
	context.drawImage(
		image,
		(wrapRect.left - imageRect.left + startRatio * wrapRect.width) * scale,
		0,
		widthRatio * wrapRect.width * scale,
		image.naturalHeight,
		0,
		0,
		cssWidth,
		cssHeight,
	);
}

const MARKER_LOUPE_WIDTH = 280;
const MARKER_LOUPE_MAX_HEIGHT = 120;
const MARKER_LOUPE_GAP = 8;

export interface MarkerLoupe {
	readonly canvas: HTMLCanvasElement;
	readonly width: number;
	readonly height: number;
	setReadout(readout: string): void;
	close(): void;
}

/**
 * A small magnified window over a seek surface, shown above it (below when
 * there is no room) around the pointer.
 */
export function openMarkerLoupe(
	root: HTMLElement,
	seekWrap: HTMLElement,
	clientX: number,
): MarkerLoupe {
	root.querySelectorAll(".marker-loupe").forEach((existing) => {
		existing.remove();
	});

	const document = root.ownerDocument;
	const loupe = document.createElement("div");
	loupe.className = "marker-loupe";
	loupe.setAttribute("aria-hidden", "true");
	const canvas = document.createElement("canvas");
	canvas.className = "marker-loupe-canvas";
	const line = document.createElement("div");
	line.className = "marker-loupe-line";
	const readout = document.createElement("div");
	readout.className = "marker-loupe-readout";
	loupe.append(canvas, line, readout);

	// The visible part of the surface: a zoomed surface scrolls inside its wrap.
	const viewport = (
		seekWrap.closest(".waveform-wrap, .piano-roll-wrap, .seekable-img-wrap") ??
		seekWrap
	).getBoundingClientRect();
	const width = MARKER_LOUPE_WIDTH;
	const height = Math.min(MARKER_LOUPE_MAX_HEIGHT, Math.round(viewport.height));
	const top =
		viewport.top - height - MARKER_LOUPE_GAP >= 0
			? viewport.top - height - MARKER_LOUPE_GAP
			: viewport.bottom + MARKER_LOUPE_GAP;
	loupe.style.width = `${width}px`;
	loupe.style.height = `${height}px`;
	loupe.style.top = `${top}px`;
	loupe.style.left = `${clamp(
		clientX - width / 2,
		MARKER_LOUPE_GAP,
		Math.max(
			MARKER_LOUPE_GAP,
			// Without the scrollbar and the loupe's own border.
			document.documentElement.clientWidth - width - 2 - MARKER_LOUPE_GAP,
		),
	)}px`;
	// The magnified content is drawn in the surface's colours, so it needs the
	// surface's backdrop behind it: the nearest one painted around the surface.
	for (
		let element: HTMLElement | null = seekWrap;
		element && element !== root.parentElement;
		element = element.parentElement
	) {
		const background = getComputedStyle(element).backgroundColor;
		if (background !== "rgba(0, 0, 0, 0)" && background !== "transparent") {
			loupe.style.backgroundColor = background;
			break;
		}
	}
	root.appendChild(loupe);

	return {
		canvas,
		width,
		height,
		setReadout(text) {
			readout.textContent = text;
		},
		close() {
			loupe.remove();
		},
	};
}
