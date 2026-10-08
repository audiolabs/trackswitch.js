import { ensureTrackSwitchStyles } from "./core-adapter";
import interactiveStylesheetText from "./interactive.css?inline";

const INTERACTIVE_STYLE_ATTRIBUTE = "data-trackswitch-interactive-styles";

export function ensureInteractiveTrackSwitchStyles(
	rootElement: HTMLElement | ShadowRoot,
): void {
	ensureTrackSwitchStyles(rootElement);

	const ownerDocument = rootElement.ownerDocument;
	const rootNode =
		rootElement instanceof ShadowRoot ? rootElement : rootElement.getRootNode();
	const styleHost =
		rootNode instanceof ShadowRoot ? rootNode : ownerDocument.head;

	if (styleHost.querySelector(`style[${INTERACTIVE_STYLE_ATTRIBUTE}]`)) {
		return;
	}

	const styleElement = ownerDocument.createElement("style");
	styleElement.setAttribute(INTERACTIVE_STYLE_ATTRIBUTE, "");
	styleElement.textContent = interactiveStylesheetText;
	styleHost.prepend(styleElement);
}
