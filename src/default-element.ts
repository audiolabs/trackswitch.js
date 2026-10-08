import { ElementConfigError, loadElementConfig } from "./config/config";
import { createTrackSwitch } from "./player/player";
import { ensureTrackSwitchStyles } from "./shared/styles";
import type {
	TrackSwitchController,
	TrackSwitchEventMap,
	TrackSwitchEventName,
	TrackSwitchInit,
} from "./types";
import {
	describeError,
	renderTrackSwitchErrorPanel,
	renderTrackSwitchLoadingPanel,
} from "./views/layout";

export type TrackswitchDomEventName =
	| "trackswitch-loaded"
	| "trackswitch-error"
	| "trackswitch-position"
	| "trackswitch-track-state"
	| "trackswitch-markers";

export interface TrackswitchPlayerElement extends HTMLElement {
	config: TrackSwitchInit | undefined;
	readonly controller: TrackSwitchController | null;
}

export const TRACKSWITCH_DEFAULT_ELEMENT_NAME = "trackswitch-player";

export const TRACKSWITCH_DOM_EVENTS: Record<
	TrackSwitchEventName,
	TrackswitchDomEventName
> = {
	loaded: "trackswitch-loaded",
	error: "trackswitch-error",
	position: "trackswitch-position",
	trackState: "trackswitch-track-state",
	markers: "trackswitch-markers",
};

function dispatchTrackSwitchEvent<K extends TrackSwitchEventName>(
	element: HTMLElement,
	eventName: K,
	detail: TrackSwitchEventMap[K],
): void {
	element.dispatchEvent(
		new CustomEvent(TRACKSWITCH_DOM_EVENTS[eventName], {
			detail,
			bubbles: true,
			composed: true,
		}),
	);
}

abstract class TrackswitchPlayerBase
	extends HTMLElement
	implements TrackswitchPlayerElement
{
	private currentConfig: TrackSwitchInit | undefined;
	private currentController: TrackSwitchController | null = null;
	private mountRoot: HTMLDivElement | null = null;
	private unsubscribeHandlers: Array<() => void> = [];
	private configLoadGeneration = 0;

	get config(): TrackSwitchInit | undefined {
		return this.currentConfig;
	}

	set config(nextConfig: TrackSwitchInit | undefined) {
		this.configLoadGeneration += 1;
		this.currentConfig = nextConfig;
		void this.applyCurrentConfig();
	}

	get controller(): TrackSwitchController | null {
		return this.currentController;
	}

	protected abstract createController(
		rootElement: HTMLElement,
		init: TrackSwitchInit,
	): TrackSwitchController;

	connectedCallback(): void {
		this.ensureShadowRoot();
		if (this.currentConfig) {
			void this.applyCurrentConfig();
			return;
		}

		this.showLoading();
		void this.loadDeclarativeConfig();
	}

	disconnectedCallback(): void {
		this.configLoadGeneration += 1;
		this.destroyController();
		this.mountRoot?.replaceChildren();
	}

	private ensureShadowRoot(): void {
		const root = this.shadowRoot || this.attachShadow({ mode: "open" });
		if (this.mountRoot?.isConnected) {
			return;
		}

		const mountRoot = document.createElement("div");
		mountRoot.className = "trackswitch-element-mount";

		root.replaceChildren();
		ensureTrackSwitchStyles(root);
		root.append(mountRoot);
		this.mountRoot = mountRoot;
	}

	private async loadDeclarativeConfig(): Promise<void> {
		const generation = ++this.configLoadGeneration;

		try {
			const nextConfig = await loadElementConfig(
				this,
				(rawConfig) => rawConfig as TrackSwitchInit,
			);
			if (
				!this.isConnected ||
				this.configLoadGeneration !== generation ||
				!nextConfig
			) {
				return;
			}

			this.currentConfig = nextConfig;
			await this.applyCurrentConfig();
		} catch (error) {
			if (!this.isConnected || this.configLoadGeneration !== generation) {
				return;
			}

			this.showError(
				error,
				"Unexpected error while loading TrackSwitch config.",
				"Trackswitch config could not be loaded",
			);
		}
	}

	private async applyCurrentConfig(): Promise<void> {
		if (!this.isConnected || !this.currentConfig) {
			return;
		}

		this.ensureShadowRoot();

		if (!this.mountRoot) {
			return;
		}

		const controller = this.currentController;

		if (controller) {
			if (!(controller as { isLoaded?: boolean }).isLoaded) {
				this.destroyController();
			} else {
				try {
					if (
						!this.isConnected ||
						this.currentController !== controller ||
						!this.currentConfig
					) {
						return;
					}
					await controller.updateConfig(this.currentConfig);
					return;
				} catch (_error) {
					if (!this.isConnected || !this.currentConfig) {
						return;
					}
					this.destroyController();
				}
			}
		}

		try {
			this.mountController(this.currentConfig);
		} catch (error) {
			this.destroyController();
			this.showError(error, "Unexpected error while mounting TrackSwitch.");
		}
	}

	private showLoading(): void {
		if (this.mountRoot) {
			renderTrackSwitchLoadingPanel(this.mountRoot);
		}
	}

	private showError(
		error: unknown,
		fallbackMessage: string,
		title?: string,
	): void {
		const message = describeError(error, fallbackMessage);

		if (this.mountRoot) {
			const configError =
				error instanceof ElementConfigError ? error : undefined;
			renderTrackSwitchErrorPanel(this.mountRoot, {
				title: configError?.title ?? title,
				message,
				details: configError?.details,
			});
		}

		dispatchTrackSwitchEvent(this, "error", { message });
	}

	private mountController(init: TrackSwitchInit): void {
		if (!this.mountRoot) {
			return;
		}

		this.mountRoot.replaceChildren();
		const controller = this.createController(this.mountRoot, init);
		this.currentController = controller;
		this.unsubscribeHandlers = [
			controller.on("loaded", (detail) =>
				dispatchTrackSwitchEvent(this, "loaded", detail),
			),
			controller.on("error", (detail) =>
				dispatchTrackSwitchEvent(this, "error", detail),
			),
			controller.on("position", (detail) =>
				dispatchTrackSwitchEvent(this, "position", detail),
			),
			controller.on("trackState", (detail) =>
				dispatchTrackSwitchEvent(this, "trackState", detail),
			),
			controller.on("markers", (detail) =>
				dispatchTrackSwitchEvent(this, "markers", detail),
			),
		];
	}

	private destroyController(): void {
		const controller = this.currentController;
		this.currentController = null;

		this.unsubscribeHandlers.forEach((unsubscribe) => {
			unsubscribe();
		});
		this.unsubscribeHandlers = [];

		if (controller) {
			controller.destroy();
		}
	}
}

export class TrackswitchPlayer extends TrackswitchPlayerBase {
	protected createController(
		rootElement: HTMLElement,
		init: TrackSwitchInit,
	): TrackSwitchController {
		return createTrackSwitch(rootElement, init);
	}
}

function defineTrackswitchElementWithConstructor<
	T extends CustomElementConstructor,
>(
	registry: CustomElementRegistry,
	elementName: string,
	elementConstructor: T,
): T {
	const existingConstructor = registry.get(elementName);
	if (existingConstructor) {
		return existingConstructor as T;
	}

	registry.define(elementName, elementConstructor);
	return elementConstructor;
}

export function defineTrackswitchDefaultElement(
	registry: CustomElementRegistry = customElements,
): typeof TrackswitchPlayer {
	return defineTrackswitchElementWithConstructor(
		registry,
		TRACKSWITCH_DEFAULT_ELEMENT_NAME,
		TrackswitchPlayer,
	);
}

declare global {
	interface HTMLElementTagNameMap {
		[TRACKSWITCH_DEFAULT_ELEMENT_NAME]: TrackswitchPlayer;
	}
}
