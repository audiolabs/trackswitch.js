import {
	type CSSProperties,
	createElement,
	forwardRef,
	type MutableRefObject,
	type Ref,
	useEffect,
	useImperativeHandle,
	useRef,
} from "react";
import type {
	TrackSwitchController,
	TrackSwitchEventMap,
	TrackSwitchInit,
} from "./domain/types";
import type { TrackswitchDomEventName, TrackswitchPlayer } from "./element";
import {
	defineTrackSwitchSyncPlayerElement,
	defineTrackswitchDefaultElement,
	TRACKSWITCH_DOM_EVENTS,
} from "./element";
import { defineTrackSwitchSyncInteractiveElement } from "./interactive/interactive-element";
import type {
	InteractiveTrackSwitchController,
	InteractiveTrackSwitchInit,
} from "./interactive/types";

export interface TrackSwitchEventProps {
	onLoaded?: (payload: TrackSwitchEventMap["loaded"]) => void;
	onError?: (payload: TrackSwitchEventMap["error"]) => void;
	onPosition?: (payload: TrackSwitchEventMap["position"]) => void;
	onTrackState?: (payload: TrackSwitchEventMap["trackState"]) => void;
}

export interface TrackSwitchPlayerProps extends TrackSwitchEventProps {
	config: TrackSwitchInit;
	configKey?: string | number;
	id?: string;
	className?: string;
	style?: CSSProperties;
}

export interface TrackSwitchInteractiveProps {
	config?: InteractiveTrackSwitchInit;
	configKey?: string | number;
	id?: string;
	className?: string;
	style?: CSSProperties;
}

export interface UseTrackSwitchElementOptions extends TrackSwitchEventProps {
	configKey?: string | number;
}

export interface UseTrackSwitchElementResult {
	rootRef: MutableRefObject<TrackswitchPlayer | null>;
	controllerRef: MutableRefObject<TrackSwitchController | null>;
}

function addTrackswitchListener<K extends keyof TrackSwitchEventProps>(
	element: TrackswitchPlayer,
	eventName: TrackswitchDomEventName,
	handler: TrackSwitchEventProps[K],
): () => void {
	if (!handler) {
		return function noop() {
			return;
		};
	}

	const listener = (event: Event) => {
		handler((event as CustomEvent).detail);
	};

	element.addEventListener(eventName, listener);
	return function unsubscribe() {
		element.removeEventListener(eventName, listener);
	};
}

function defineTrackSwitchElementForTag(tagName: string): void {
	if (tagName === "trackswitch-sync-player") {
		defineTrackSwitchSyncPlayerElement();
		return;
	}

	defineTrackswitchDefaultElement();
}

export function useTrackSwitchElement(
	config: TrackSwitchInit,
	{
		configKey,
		onLoaded,
		onError,
		onPosition,
		onTrackState,
	}: UseTrackSwitchElementOptions = {},
	tagName = "trackswitch-player",
): UseTrackSwitchElementResult {
	const rootRef = useRef<TrackswitchPlayer | null>(null);
	const controllerRef = useRef<TrackSwitchController | null>(null);

	useEffect(() => {
		defineTrackSwitchElementForTag(tagName);
	}, [tagName]);

	useEffect(() => {
		void configKey;
		const element = rootRef.current;
		if (!element) {
			return;
		}

		const unsubscribeLoaded = addTrackswitchListener(
			element,
			TRACKSWITCH_DOM_EVENTS.loaded,
			onLoaded,
		);
		const unsubscribeError = addTrackswitchListener(
			element,
			TRACKSWITCH_DOM_EVENTS.error,
			onError,
		);
		const unsubscribePosition = addTrackswitchListener(
			element,
			TRACKSWITCH_DOM_EVENTS.position,
			onPosition,
		);
		const unsubscribeTrackState = addTrackswitchListener(
			element,
			TRACKSWITCH_DOM_EVENTS.trackState,
			onTrackState,
		);

		return () => {
			unsubscribeLoaded();
			unsubscribeError();
			unsubscribePosition();
			unsubscribeTrackState();
			controllerRef.current = null;
		};
	}, [configKey, onLoaded, onError, onPosition, onTrackState]);

	useEffect(() => {
		void configKey;
		const element = rootRef.current;
		if (!element) {
			return;
		}

		element.config = config;
		controllerRef.current = element.controller;
	}, [config, configKey]);

	return {
		rootRef,
		controllerRef,
	};
}

function createTrackSwitchReactComponent(
	tagName: "trackswitch-player" | "trackswitch-sync-player",
) {
	return forwardRef(function TrackSwitchReactComponent(
		{
			config,
			configKey,
			id,
			className,
			style,
			onLoaded,
			onError,
			onPosition,
			onTrackState,
		}: TrackSwitchPlayerProps,
		ref: Ref<TrackSwitchController | null>,
	) {
		const { rootRef, controllerRef } = useTrackSwitchElement(
			config,
			{
				configKey,
				onLoaded,
				onError,
				onPosition,
				onTrackState,
			},
			tagName,
		);

		useImperativeHandle(ref, () => {
			void configKey;
			return controllerRef.current;
		}, [controllerRef.current, configKey]);

		return createElement(tagName, {
			ref: rootRef,
			id,
			className,
			style,
		});
	});
}

export const TrackSwitchPlayer =
	createTrackSwitchReactComponent("trackswitch-player");
export const TrackSwitchSyncPlayer = createTrackSwitchReactComponent(
	"trackswitch-sync-player",
);

export const TrackSwitchSyncInteractive = forwardRef(
	function TrackSwitchSyncInteractive(
		{ config, configKey, id, className, style }: TrackSwitchInteractiveProps,
		ref: Ref<InteractiveTrackSwitchController | null>,
	) {
		const rootRef = useRef<
			| (HTMLElement & {
					config?: InteractiveTrackSwitchInit;
					controller?: InteractiveTrackSwitchController | null;
			  })
			| null
		>(null);
		const controllerRef = useRef<InteractiveTrackSwitchController | null>(null);

		useEffect(() => {
			defineTrackSwitchSyncInteractiveElement();
		}, []);

		useEffect(() => {
			void configKey;
			const element = rootRef.current;
			if (!element) {
				return;
			}

			element.config = config || {};
			controllerRef.current = element.controller || null;

			return () => {
				controllerRef.current = null;
			};
		}, [config, configKey]);

		useEffect(() => {
			const element = rootRef.current;
			if (!element) {
				return;
			}

			element.config = config || {};
			controllerRef.current = element.controller || null;
		}, [config]);

		useImperativeHandle(ref, () => {
			void configKey;
			return controllerRef.current;
		}, [configKey]);

		return createElement("trackswitch-sync-interactive", {
			ref: rootRef,
			id,
			className,
			style,
		});
	},
);

export const TrackSwitchElement = TrackSwitchPlayer;
