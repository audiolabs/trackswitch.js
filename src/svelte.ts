import type { TrackswitchDomEventName, TrackswitchPlayer } from "./element";
import {
	defineTrackswitchDefaultElement,
	TRACKSWITCH_DOM_EVENTS,
} from "./element";
import type {
	TrackSwitchController,
	TrackSwitchEventMap,
	TrackSwitchInit,
} from "./types";

export type TrackswitchSvelteVariant = "default" | "sync";

export interface TrackswitchSvelteOptions {
	config: TrackSwitchInit;
	variant?: TrackswitchSvelteVariant;
	onLoaded?: (payload: TrackSwitchEventMap["loaded"]) => void;
	onError?: (payload: TrackSwitchEventMap["error"]) => void;
	onPosition?: (payload: TrackSwitchEventMap["position"]) => void;
	onTrackState?: (payload: TrackSwitchEventMap["trackState"]) => void;
	onMarkers?: (payload: TrackSwitchEventMap["markers"]) => void;
}

export interface TrackswitchSvelteAction {
	update(options: TrackswitchSvelteOptions): void;
	destroy(): void;
}

type TrackswitchSvelteElement = TrackswitchPlayer;

function bindEvent<P>(
	element: HTMLElement,
	eventName: TrackswitchDomEventName,
	getHandler: () => ((payload: P) => void) | undefined,
): () => void {
	const listener = (event: Event) => {
		getHandler()?.((event as CustomEvent<P>).detail);
	};

	element.addEventListener(eventName, listener);
	return function unsubscribe() {
		element.removeEventListener(eventName, listener);
	};
}

function defineElementForVariant(
	variant: TrackswitchSvelteVariant | undefined,
): void {
	if (variant === "sync") {
		return;
	}

	defineTrackswitchDefaultElement();
}

export function useTrackswitch(
	node: TrackswitchSvelteElement,
	options: TrackswitchSvelteOptions,
): TrackswitchSvelteAction {
	defineElementForVariant(options.variant);

	let currentOptions = options;
	node.config = currentOptions.config;

	const unsubscribers = [
		bindEvent(
			node,
			TRACKSWITCH_DOM_EVENTS.loaded,
			() => currentOptions.onLoaded,
		),
		bindEvent(node, TRACKSWITCH_DOM_EVENTS.error, () => currentOptions.onError),
		bindEvent(
			node,
			TRACKSWITCH_DOM_EVENTS.position,
			() => currentOptions.onPosition,
		),
		bindEvent(
			node,
			TRACKSWITCH_DOM_EVENTS.trackState,
			() => currentOptions.onTrackState,
		),
		bindEvent(
			node,
			TRACKSWITCH_DOM_EVENTS.markers,
			() => currentOptions.onMarkers,
		),
	];

	return {
		update(nextOptions: TrackswitchSvelteOptions) {
			defineElementForVariant(nextOptions.variant);
			currentOptions = nextOptions;
			node.config = nextOptions.config;
		},
		destroy() {
			unsubscribers.forEach((unsubscribe) => {
				unsubscribe();
			});
		},
	};
}

export function getTrackswitchController(
	node: TrackswitchPlayer,
): TrackSwitchController | null {
	return node.controller;
}
