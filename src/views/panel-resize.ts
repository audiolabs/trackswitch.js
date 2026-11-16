/** The shortest a panel can be dragged to, in CSS pixels. */
const MIN_PANEL_HEIGHT = 60;
/** How far one arrow key press moves the edge, in CSS pixels. */
const KEYBOARD_STEP = 16;

export interface PanelResizeTarget {
	/** The panel the handle is attached to, along its bottom edge. */
	panel: HTMLElement;
	getHeight(): number;
	setHeight(height: number): void;
	/** The tallest the panel may be right now, given its current height; `Infinity` when nothing bounds it. */
	getMaxHeight(): number;
}

/**
 * Adds a handle along a panel's bottom edge that drags its height, moves it
 * with the up and down arrow keys while focused, and resets it to the height
 * the panel opened at on a double click.
 */
export function attachPanelResizeHandle(target: PanelResizeTarget): void {
	const handle = document.createElement("div");
	handle.className = "ts-resize-handle";
	handle.setAttribute("role", "separator");
	handle.setAttribute("aria-orientation", "horizontal");
	handle.setAttribute("aria-label", "Resize panel");
	handle.setAttribute("title", "Drag to resize, double-click to reset");
	handle.tabIndex = 0;
	target.panel.appendChild(handle);

	// The height the panel opens at, which a double click returns to.
	const initialHeight = target.getHeight();

	let startY = 0;
	let startHeight = 0;
	let activePointerId: number | null = null;

	// Fixed when a drag starts: the free space shrinks as the panel grows, so
	// measuring it mid-drag would move the limit under the pointer.
	let maxHeight = Number.POSITIVE_INFINITY;

	const apply = (height: number): void => {
		target.setHeight(
			Math.min(maxHeight, Math.max(MIN_PANEL_HEIGHT, Math.round(height))),
		);
	};

	handle.addEventListener("pointerdown", (event: PointerEvent) => {
		if (event.button !== 0) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		activePointerId = event.pointerId;
		startY = event.clientY;
		startHeight = target.getHeight();
		maxHeight = target.getMaxHeight();
		handle.setPointerCapture(event.pointerId);
		handle.classList.add("ts-resize-handle-active");
	});

	handle.addEventListener("pointermove", (event: PointerEvent) => {
		if (event.pointerId !== activePointerId) {
			return;
		}
		apply(startHeight + event.clientY - startY);
	});

	const finish = (event: PointerEvent): void => {
		if (event.pointerId !== activePointerId) {
			return;
		}
		activePointerId = null;
		handle.classList.remove("ts-resize-handle-active");
	};
	handle.addEventListener("pointerup", finish);
	handle.addEventListener("pointercancel", finish);

	handle.addEventListener("dblclick", (event: MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		maxHeight = target.getMaxHeight();
		apply(initialHeight);
	});

	handle.addEventListener("keydown", (event: KeyboardEvent) => {
		if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		maxHeight = target.getMaxHeight();
		const delta = event.key === "ArrowDown" ? KEYBOARD_STEP : -KEYBOARD_STEP;
		apply(target.getHeight() + delta);
	});
}
