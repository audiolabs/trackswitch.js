import stylesheetText from "../css/trackswitch.css?inline";

const TRACKSWITCH_STYLE_ATTRIBUTE = "data-trackswitch-styles";

export function ensureTrackSwitchStyles(
	rootElement: HTMLElement | ShadowRoot,
): void {
	const ownerDocument = rootElement.ownerDocument;
	const rootNode =
		rootElement instanceof ShadowRoot ? rootElement : rootElement.getRootNode();
	const styleHost =
		rootNode instanceof ShadowRoot ? rootNode : ownerDocument.head;

	if (styleHost.querySelector(`style[${TRACKSWITCH_STYLE_ATTRIBUTE}]`)) {
		return;
	}

	const styleElement = ownerDocument.createElement("style");
	styleElement.setAttribute(TRACKSWITCH_STYLE_ATTRIBUTE, "");
	styleElement.textContent = stylesheetText;
	styleHost.prepend(styleElement);
}
