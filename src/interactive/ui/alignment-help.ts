import type { AlignmentHelpTooltipId } from "./alignment-help-types";

interface AlignmentHelpTooltipItem {
	title: string;
	description: string;
}

interface AlignmentHelpTooltipContent {
	heading: string;
	items: AlignmentHelpTooltipItem[];
}

interface TooltipRootElement extends HTMLElement {
	__tsHelpButton?: HTMLButtonElement | null;
	__tsHelpTooltip?: HTMLElement | null;
	__tsHelpTooltipPlaceholder?: Comment | null;
}

interface TooltipContainerElement extends HTMLElement {
	__tsAlignmentHelpCleanup__?: (() => void) | undefined;
}

export interface AlignmentHelpLabelHtmlOptions {
	label: string;
	selectId?: string;
	tooltipId: AlignmentHelpTooltipId;
	idPrefix: string;
	align?: "start" | "end";
}

const ALIGNMENT_HELP_TOOLTIP_CONTENT: Record<
	AlignmentHelpTooltipId,
	AlignmentHelpTooltipContent
> = {
	features: {
		heading:
			"Features are computed from audio files for synchronization. For scores, individual note events are extracted and further processed into chroma and/or onset features.",
		items: [
			{
				title: "Chroma + DLNCO (synctoolbox) (recommended)",
				description:
					'Like "Chroma + DLNCO", but DLNCO features are only used on the finest level. Only available with MrMsDTW algorithm.',
			},
			{
				title: "Chroma + DLNCO",
				description:
					"Combine chroma and DLNCO features in a cost matrix with equal weighting. Chroma cost via cosine distance, DLNCO cost via L1 distance.",
			},
			{
				title: "Chroma",
				description: "Simple Chroma features.",
			},
		],
	},
	algorithm: {
		heading:
			"The algorithm performs pair-wise comparisons of the computed features between all sources and the  reference to obtain a timing alignment.",
		items: [
			{
				title: "MrMsDTW (recommended)",
				description:
					"Memory-restricted multiscale DTW. Computes the warping path in a coarse-to-fine strategy. May not find the global optimal path, but is preferred for long sequences due to much lower memory usage and faster runtime.",
			},
			{
				title: "DTW",
				description:
					"Finds the global optimal solution, but can be very slow and memory-intensive for long sequences.",
			},
		],
	},
	"alignment-csv": {
		heading:
			"Import an existing alignment CSV instead of computing the alignment in the browser.",
		items: [
			{
				title: "Required columns",
				description:
					'The CSV must contain columns for every source that you uploaded to the player. Column names need to be based on the loaded filenames with the pattern "time_<filename>_<*number>". <*number> is only used when duplicate filenames are found. For score following, use "measure_<filename>_<*number>" columns to provide measure annotations.',
			},
			{
				title: "Restore previous session",
				description:
					"You can use this feature to upload an alignment.csv that was exported from a previous session.",
			},
		],
	},
	"sync-generation": {
		heading:
			"Render synchronized version of audio sources to enable simultaneous playback.",
		items: [
			{
				title: "Enables sync mode in the player",
				description:
					'You can use the "SYNC" button in the player interface to use synchronized audio sources and listen to multiple performances of the same piece at the same time.',
			},
			{
				title: "Uses time-scale modification",
				description:
					"The synchronized versions are rendered with a time-scale modification algorithm. Audio pitch shift is also applied if the algorithm detects a key mismatch between source and reference.",
			},
		],
	},
};

export function buildAlignmentHelpLabelHtml(
	options: AlignmentHelpLabelHtmlOptions,
): string {
	const labelAttributes = options.selectId
		? ` for="${escapeHtml(options.selectId)}"`
		: "";
	const labelTag = options.selectId ? "label" : "span";

	return (
		'<div class="ts-alignment-select-header">' +
		"<" +
		labelTag +
		' class="ts-alignment-select-label"' +
		labelAttributes +
		">" +
		escapeHtml(options.label) +
		"</" +
		labelTag +
		">" +
		buildAlignmentHelpTriggerHtml(options) +
		"</div>"
	);
}

export function buildAlignmentHelpTriggerHtml(
	options: AlignmentHelpLabelHtmlOptions,
): string {
	const tooltipDomId = `ts-help-tooltip-${options.idPrefix}-${options.tooltipId}`;
	const tooltipContent = ALIGNMENT_HELP_TOOLTIP_CONTENT[options.tooltipId];
	const triggerAlignClass =
		options.align === "end"
			? " ts-help-trigger-wrap-end"
			: " ts-help-trigger-wrap-start";
	const itemsHtml = tooltipContent.items
		.map(
			(item) =>
				'<li class="ts-help-tooltip-item">' +
				'<strong class="ts-help-tooltip-item-title">' +
				escapeHtml(item.title) +
				"</strong>" +
				'<span class="ts-help-tooltip-item-copy">' +
				escapeHtml(item.description) +
				"</span>" +
				"</li>",
		)
		.join("");

	return (
		'<span class="ts-help-trigger-wrap' +
		triggerAlignClass +
		'">' +
		'<button class="ts-help-trigger" type="button" aria-label="Show help for ' +
		escapeHtml(options.label) +
		'" aria-expanded="false" aria-controls="' +
		tooltipDomId +
		'">?</button>' +
		'<span class="ts-help-tooltip" id="' +
		tooltipDomId +
		'" role="tooltip">' +
		'<span class="ts-help-tooltip-title">' +
		escapeHtml(tooltipContent.heading) +
		"</span>" +
		'<ul class="ts-help-tooltip-list">' +
		itemsHtml +
		"</ul>" +
		"</span>" +
		"</span>"
	);
}

export function bindAlignmentHelpTooltips(container: HTMLElement): void {
	const tooltipContainer = container as TooltipContainerElement;
	if (tooltipContainer.__tsAlignmentHelpCleanup__) {
		tooltipContainer.__tsAlignmentHelpCleanup__();
	}

	const roots = Array.from(
		container.querySelectorAll(".ts-help-trigger-wrap"),
	).filter((node) => node instanceof HTMLElement) as TooltipRootElement[];

	if (roots.length === 0) {
		return;
	}

	let openRoot: TooltipRootElement | null = null;
	let manualRoot: TooltipRootElement | null = null;

	function updateTooltipLayout(root: TooltipRootElement): void {
		const tooltip = root.__tsHelpTooltip;
		const button = root.__tsHelpButton;
		const playerRoot = root.closest(".trackswitch") as HTMLElement | null;
		if (!tooltip || !button || !playerRoot) {
			return;
		}

		const playerRect = playerRoot.getBoundingClientRect();
		const buttonRect = button.getBoundingClientRect();
		const margin = 12;
		const gap = 12;

		if (tooltip.parentElement !== playerRoot) {
			const placeholder = root.ownerDocument.createComment(
				"ts-help-tooltip-anchor",
			);
			root.__tsHelpTooltipPlaceholder = placeholder;
			if (tooltip.parentNode) {
				tooltip.parentNode.insertBefore(placeholder, tooltip);
			}
			playerRoot.insertBefore(tooltip, playerRoot.firstChild);
		}

		tooltip.style.position = "absolute";
		tooltip.style.left = "";
		tooltip.style.right = "";
		tooltip.style.top = "";
		tooltip.style.bottom = "";
		tooltip.style.maxWidth = "";
		tooltip.style.transform = "";
		tooltip.style.opacity = "1";
		tooltip.style.visibility = "visible";
		tooltip.style.pointerEvents = "auto";

		const availableWidth = Math.max(
			180,
			Math.floor(playerRect.width - margin * 2),
		);
		tooltip.style.maxWidth = `${availableWidth}px`;
		tooltip.style.left = `${margin}px`;
		tooltip.style.top = `${margin}px`;
		tooltip.style.transform = "none";

		const tooltipRect = tooltip.getBoundingClientRect();
		const tooltipWidth = tooltipRect.width;
		const tooltipHeight = tooltipRect.height;
		const minLeft = margin;
		const maxLeft = Math.max(minLeft, playerRect.width - margin - tooltipWidth);
		const minTop = margin;
		const maxTop = Math.max(minTop, playerRect.height - margin - tooltipHeight);
		const spaceRight = playerRect.right - buttonRect.right - margin;
		const spaceLeft = buttonRect.left - playerRect.left - margin;
		const preferLeft =
			spaceRight < Math.min(tooltipWidth, 280) && spaceLeft > spaceRight;

		const preferredLeft = preferLeft
			? buttonRect.left - playerRect.left - tooltipWidth - gap
			: buttonRect.right - playerRect.left + gap;
		const preferredTop =
			buttonRect.top -
			playerRect.top +
			buttonRect.height / 2 -
			tooltipHeight / 2;

		tooltip.style.left = `${Math.min(Math.max(preferredLeft, minLeft), maxLeft)}px`;
		tooltip.style.top = `${Math.min(Math.max(preferredTop, minTop), maxTop)}px`;
	}

	function closeRoot(root: TooltipRootElement): void {
		root.classList.remove("is-open");
		if (root.__tsHelpButton) {
			root.__tsHelpButton.setAttribute("aria-expanded", "false");
		}
		if (root.__tsHelpTooltip) {
			const placeholder = root.__tsHelpTooltipPlaceholder;
			if (placeholder?.parentNode) {
				placeholder.parentNode.insertBefore(root.__tsHelpTooltip, placeholder);
				placeholder.parentNode.removeChild(placeholder);
			}
			root.__tsHelpTooltipPlaceholder = null;
			root.__tsHelpTooltip.style.position = "";
			root.__tsHelpTooltip.style.left = "";
			root.__tsHelpTooltip.style.right = "";
			root.__tsHelpTooltip.style.top = "";
			root.__tsHelpTooltip.style.bottom = "";
			root.__tsHelpTooltip.style.maxWidth = "";
			root.__tsHelpTooltip.style.transform = "";
			root.__tsHelpTooltip.style.opacity = "";
			root.__tsHelpTooltip.style.visibility = "";
			root.__tsHelpTooltip.style.pointerEvents = "";
		}
		if (openRoot === root) {
			openRoot = null;
		}
		if (manualRoot === root) {
			manualRoot = null;
		}
	}

	function closeAll(): void {
		roots.forEach((root) => {
			closeRoot(root);
		});
	}

	function openRootWithMode(root: TooltipRootElement, manual: boolean): void {
		if (openRoot && openRoot !== root) {
			closeRoot(openRoot);
		}

		root.classList.add("is-open");
		updateTooltipLayout(root);
		if (root.__tsHelpButton) {
			root.__tsHelpButton.setAttribute("aria-expanded", "true");
		}
		openRoot = root;
		manualRoot = manual || manualRoot === root ? root : null;
	}

	function ensureConnected(): boolean {
		if (container.isConnected) {
			return true;
		}
		cleanup();
		return false;
	}

	const teardownCallbacks: Array<() => void> = [];

	roots.forEach((root) => {
		const button = root.querySelector(
			".ts-help-trigger",
		) as HTMLButtonElement | null;
		const tooltip = root.querySelector(
			".ts-help-tooltip",
		) as HTMLElement | null;
		root.__tsHelpButton = button;
		root.__tsHelpTooltip = tooltip;
		if (!button) {
			return;
		}

		const handleMouseEnter = (): void => {
			if (manualRoot && manualRoot !== root) {
				return;
			}
			openRootWithMode(root, false);
		};
		const handleMouseLeave = (event: MouseEvent): void => {
			if (manualRoot === root) {
				return;
			}
			const relatedTarget = event.relatedTarget as Node | null;
			if (
				relatedTarget &&
				(root.contains(relatedTarget) ||
					!!root.__tsHelpTooltip?.contains(relatedTarget))
			) {
				return;
			}
			closeRoot(root);
		};
		const handleTooltipMouseLeave = (event: MouseEvent): void => {
			if (manualRoot === root) {
				return;
			}
			const relatedTarget = event.relatedTarget as Node | null;
			if (relatedTarget && root.contains(relatedTarget)) {
				return;
			}
			closeRoot(root);
		};
		const handleFocusIn = (): void => {
			if (manualRoot && manualRoot !== root) {
				return;
			}
			openRootWithMode(root, false);
		};
		const handleFocusOut = (): void => {
			window.setTimeout(() => {
				if (!ensureConnected()) {
					return;
				}
				const activeElement = container.ownerDocument.activeElement;
				if (
					manualRoot === root ||
					(activeElement && root.contains(activeElement))
				) {
					return;
				}
				closeRoot(root);
			}, 0);
		};
		const handleClick = (event: MouseEvent): void => {
			event.preventDefault();
			event.stopPropagation();
			if (manualRoot === root) {
				closeRoot(root);
				return;
			}
			openRootWithMode(root, true);
		};

		root.addEventListener("mouseenter", handleMouseEnter);
		root.addEventListener("mouseleave", handleMouseLeave);
		root.addEventListener("focusin", handleFocusIn);
		root.addEventListener("focusout", handleFocusOut);
		button.addEventListener("click", handleClick);
		tooltip?.addEventListener("mouseleave", handleTooltipMouseLeave);

		teardownCallbacks.push(() => {
			root.removeEventListener("mouseenter", handleMouseEnter);
			root.removeEventListener("mouseleave", handleMouseLeave);
			root.removeEventListener("focusin", handleFocusIn);
			root.removeEventListener("focusout", handleFocusOut);
			button.removeEventListener("click", handleClick);
			tooltip?.removeEventListener("mouseleave", handleTooltipMouseLeave);
		});
	});

	const handleDocumentPointerDown = (event: PointerEvent): void => {
		if (!ensureConnected()) {
			return;
		}
		const target = event.target as Node | null;
		if (!target) {
			closeAll();
			return;
		}
		const clickedInsideTooltip = roots.some(
			(root) =>
				root.contains(target) || !!root.__tsHelpTooltip?.contains(target),
		);
		if (!clickedInsideTooltip) {
			closeAll();
		}
	};

	const handleDocumentKeyDown = (event: KeyboardEvent): void => {
		if (!ensureConnected()) {
			return;
		}
		if (event.key === "Escape" && openRoot) {
			const button = openRoot.__tsHelpButton;
			closeAll();
			if (button) {
				button.focus();
			}
		}
	};

	const handleWindowLayoutChange = (): void => {
		if (!ensureConnected() || !openRoot) {
			return;
		}
		updateTooltipLayout(openRoot);
	};

	const ownerWindow = container.ownerDocument.defaultView || window;
	container.ownerDocument.addEventListener(
		"pointerdown",
		handleDocumentPointerDown,
		true,
	);
	container.ownerDocument.addEventListener(
		"keydown",
		handleDocumentKeyDown,
		true,
	);
	ownerWindow.addEventListener("resize", handleWindowLayoutChange);
	ownerWindow.addEventListener("scroll", handleWindowLayoutChange, true);

	teardownCallbacks.push(() => {
		container.ownerDocument.removeEventListener(
			"pointerdown",
			handleDocumentPointerDown,
			true,
		);
		container.ownerDocument.removeEventListener(
			"keydown",
			handleDocumentKeyDown,
			true,
		);
		ownerWindow.removeEventListener("resize", handleWindowLayoutChange);
		ownerWindow.removeEventListener("scroll", handleWindowLayoutChange, true);
	});

	function cleanup(): void {
		teardownCallbacks.forEach((callback) => {
			callback();
		});
		tooltipContainer.__tsAlignmentHelpCleanup__ = undefined;
	}

	tooltipContainer.__tsAlignmentHelpCleanup__ = cleanup;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
