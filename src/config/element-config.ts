export type ElementConfigParser<TConfig> = (rawConfig: unknown) => TConfig;

const INLINE_CONFIG_SCRIPT_TYPE = "application/json";
const DECLARATIVE_CONFIG_WAIT_TIMEOUT_MS = 500;

export function getInlineConfigScripts(
	element: HTMLElement,
): HTMLScriptElement[] {
	return Array.from(element.children).filter(
		(child): child is HTMLScriptElement =>
			child instanceof HTMLScriptElement &&
			child.type.trim().toLowerCase() === INLINE_CONFIG_SCRIPT_TYPE,
	);
}

function hasDeclarativeConfigSource(element: HTMLElement): boolean {
	return (
		element.hasAttribute("config-src") ||
		getInlineConfigScripts(element).length > 0
	);
}

function waitForAnimationFrame(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => resolve());
	});
}

async function waitForDeclarativeConfigSource(
	element: HTMLElement,
): Promise<void> {
	if (hasDeclarativeConfigSource(element)) {
		return;
	}

	await waitForAnimationFrame();
	if (hasDeclarativeConfigSource(element)) {
		return;
	}

	await new Promise<void>((resolve) => {
		let timeoutId = 0;
		let observer: MutationObserver | null = null;

		const cleanup = (): void => {
			window.clearTimeout(timeoutId);
			observer?.disconnect();
			resolve();
		};

		observer = new MutationObserver(() => {
			if (!hasDeclarativeConfigSource(element)) {
				return;
			}

			cleanup();
		});
		timeoutId = window.setTimeout(
			() => cleanup(),
			DECLARATIVE_CONFIG_WAIT_TIMEOUT_MS,
		);

		observer.observe(element, {
			childList: true,
			attributes: true,
			attributeFilter: ["config-src"],
		});
	});
}

export async function loadElementConfig<TConfig>(
	element: HTMLElement,
	parseConfig: ElementConfigParser<TConfig>,
): Promise<TConfig | undefined> {
	await waitForDeclarativeConfigSource(element);

	const configSrc = element.getAttribute("config-src");
	const inlineConfigScripts = getInlineConfigScripts(element);

	if (configSrc && inlineConfigScripts.length > 0) {
		throw new Error(
			"TrackSwitch config error: use either config-src or inline JSON, not both.",
		);
	}

	if (inlineConfigScripts.length > 1) {
		throw new Error(
			"TrackSwitch config error: expected exactly one inline JSON config script.",
		);
	}

	if (configSrc) {
		let response: Response;
		try {
			response = await fetch(configSrc);
		} catch (_error) {
			throw new Error(
				'TrackSwitch config error: failed to load config-src "' +
					configSrc +
					'".',
			);
		}

		if (!response.ok) {
			throw new Error(
				'TrackSwitch config error: failed to load config-src "' +
					configSrc +
					'".',
			);
		}

		try {
			return parseConfig(await response.json());
		} catch (_error) {
			throw new Error(
				'TrackSwitch config error: invalid JSON from config-src "' +
					configSrc +
					'".',
			);
		}
	}

	if (inlineConfigScripts.length === 1) {
		try {
			return parseConfig(JSON.parse(inlineConfigScripts[0].textContent || ""));
		} catch (_error) {
			throw new Error("TrackSwitch config error: invalid inline JSON config.");
		}
	}

	throw new Error(
		"TrackSwitch config error: expected declarative config via config-src or one inline JSON config script.",
	);
}
