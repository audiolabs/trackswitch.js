import type { TrackSwitchCssOverrides } from "../types";

/**
 * Writes a config `css` block onto an element. `setProperty` takes the value as
 * a single declaration value, so — unlike the raw style string this replaced —
 * there is no way for a config to open a second declaration or a new rule.
 */
export function applyCssOverrides(
	element: HTMLElement,
	css: TrackSwitchCssOverrides | undefined,
): void {
	if (!css) {
		return;
	}

	Object.entries(css).forEach(([token, value]) => {
		element.style.setProperty(token, value);
	});
}

export function escapeHtml(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function eventTargetAsElement(
	target: EventTarget | null | undefined,
): Element | null {
	if (!target || typeof target !== "object") {
		return null;
	}

	const candidate = target as { nodeType?: unknown };
	return candidate.nodeType === 1 ? (target as Element) : null;
}

function getOwnerDocument(node: Node | null | undefined): Document {
	if (node?.ownerDocument) {
		return node.ownerDocument;
	}

	return document;
}

export function getOwnerWindow(node: Node | null | undefined): Window {
	return getOwnerDocument(node).defaultView || window;
}

export function getDeepActiveElement(
	root: Document | ShadowRoot | HTMLElement | null | undefined,
): Element | null {
	let currentRoot: Document | ShadowRoot;

	if (!root) {
		currentRoot = document;
	} else if (root instanceof HTMLElement) {
		const rootNode = root.getRootNode();
		currentRoot =
			rootNode instanceof ShadowRoot || rootNode instanceof Document
				? rootNode
				: root.ownerDocument;
	} else {
		currentRoot = root;
	}

	let activeElement: Element | null = null;

	while (true) {
		const candidate = currentRoot.activeElement;
		if (!(candidate instanceof Element)) {
			return activeElement;
		}

		activeElement = candidate;
		if (!candidate.shadowRoot) {
			return activeElement;
		}

		currentRoot = candidate.shadowRoot;
	}
}

export function closestInRoot(
	root: HTMLElement,
	target: EventTarget | null | undefined,
	selector: string,
): HTMLElement | null {
	const element = eventTargetAsElement(target ?? null);
	if (!element) {
		return null;
	}

	const matched = element.closest(selector);
	if (!matched || !root.contains(matched)) {
		return null;
	}

	return matched as HTMLElement;
}

export function setDisplay(element: Element, displayValue: string): void {
	(element as HTMLElement).style.display = displayValue;
}

export function downloadTextFile(
	document: Document,
	fileName: string,
	text: string,
	mimeType: string,
): void {
	const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.click();
	document.defaultView?.setTimeout(() => URL.revokeObjectURL(url), 0);
}
