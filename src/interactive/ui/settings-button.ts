import { renderIconSlotHtml } from "../../ui/icons";

/**
 * Inject the settings button into an existing player's main control bar.
 * Returns the button element for event binding.
 */
export function injectSettingsButton(
	rootElement: HTMLElement,
): HTMLElement | null {
	const controlList = rootElement.querySelector(".main-control ul.control");
	if (!controlList) {
		return null;
	}

	const existing = controlList.querySelector(".settings-button");
	if (existing) {
		return existing as HTMLElement;
	}

	const li = rootElement.ownerDocument.createElement("li");
	li.className = "settings-button button";
	li.title = "Settings";
	li.setAttribute("aria-label", "Settings");
	li.innerHTML = renderIconSlotHtml("gear");
	const timing = controlList.querySelector(".timing");
	if (timing) {
		controlList.insertBefore(li, timing);
	} else {
		controlList.appendChild(li);
	}
	return li;
}
