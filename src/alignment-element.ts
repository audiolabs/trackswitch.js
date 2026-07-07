import { TrackswitchPlayerBase } from "./default-element";
import type { TrackSwitchController, TrackSwitchInit } from "./domain/types";
import { createTrackSwitchSyncPlayer } from "./player/alignment-factory";

export const TRACKSWITCH_SYNC_PLAYER_ELEMENT_NAME = "trackswitch-sync-player";

export class TrackswitchSyncPlayer extends TrackswitchPlayerBase {
	protected createController(
		rootElement: HTMLElement,
		init: TrackSwitchInit,
	): TrackSwitchController {
		return createTrackSwitchSyncPlayer(rootElement, init);
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

export function defineTrackSwitchSyncPlayerElement(
	registry: CustomElementRegistry = customElements,
): typeof TrackswitchSyncPlayer {
	return defineTrackswitchElementWithConstructor(
		registry,
		TRACKSWITCH_SYNC_PLAYER_ELEMENT_NAME,
		TrackswitchSyncPlayer,
	);
}

declare global {
	interface HTMLElementTagNameMap {
		[TRACKSWITCH_SYNC_PLAYER_ELEMENT_NAME]: TrackswitchSyncPlayer;
	}
}
