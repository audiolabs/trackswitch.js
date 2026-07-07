export function sanitizeInlineStyle(styleValue: unknown): string {
	const style = typeof styleValue === "string" ? styleValue.trim() : "";
	if (!style) {
		return "";
	}

	return style
		.replace(/url\s*\(/gi, "")
		.replace(/expression\s*\(/gi, "")
		.replace(/javascript\s*:/gi, "")
		.replace(/vbscript\s*:/gi, "")
		.replace(/@import/gi, "")
		.replace(/behavior\s*:/gi, "")
		.replace(/[<>]/g, "");
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

export function getOwnerDocument(node: Node | null | undefined): Document {
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
