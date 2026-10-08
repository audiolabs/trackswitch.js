import {
	defineComponent,
	h,
	onBeforeUnmount,
	onMounted,
	type PropType,
	ref,
	watch,
} from "vue";
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

type TrackSwitchVueEventHandlers = {
	loaded: (payload: TrackSwitchEventMap["loaded"]) => true;
	error: (payload: TrackSwitchEventMap["error"]) => true;
	position: (payload: TrackSwitchEventMap["position"]) => true;
	trackState: (payload: TrackSwitchEventMap["trackState"]) => true;
	markers: (payload: TrackSwitchEventMap["markers"]) => true;
};

type TrackSwitchVueEmit = <K extends keyof TrackSwitchVueEventHandlers>(
	eventName: K,
	payload: Parameters<TrackSwitchVueEventHandlers[K]>[0],
) => void;

export interface TrackSwitchVueExpose {
	element: TrackswitchPlayer | null;
	controller: TrackSwitchController | null;
}

function createTrackSwitchVueComponent(
	componentName: string,
	tagName: "trackswitch-player" | "trackswitch-sync-player",
) {
	return defineComponent({
		name: componentName,
		props: {
			config: {
				type: Object as PropType<TrackSwitchInit>,
				required: true,
			},
		},
		emits: {
			loaded: (_payload: TrackSwitchEventMap["loaded"]) => true,
			error: (_payload: TrackSwitchEventMap["error"]) => true,
			position: (_payload: TrackSwitchEventMap["position"]) => true,
			trackState: (_payload: TrackSwitchEventMap["trackState"]) => true,
			markers: (_payload: TrackSwitchEventMap["markers"]) => true,
		} satisfies TrackSwitchVueEventHandlers,
		setup(
			props: { config: TrackSwitchInit },
			{
				emit,
				expose,
				attrs,
			}: {
				emit: TrackSwitchVueEmit;
				expose: (exposed: TrackSwitchVueExpose) => void;
				attrs: Record<string, unknown>;
			},
		) {
			const elementRef = ref<TrackswitchPlayer | null>(null);

			const controller = (): TrackSwitchController | null =>
				elementRef.value?.controller || null;

			expose({
				get element() {
					return elementRef.value;
				},
				get controller() {
					return controller();
				},
			} satisfies TrackSwitchVueExpose);

			onMounted(() => {
				if (tagName === "trackswitch-sync-player") {
				} else {
					defineTrackswitchDefaultElement();
				}
				if (elementRef.value) {
					elementRef.value.config = props.config;
				}
			});

			watch(
				() => props.config,
				(nextConfig) => {
					if (elementRef.value) {
						elementRef.value.config = nextConfig;
					}
				},
				{ deep: false },
			);

			const listeners: Array<() => void> = [];
			onMounted(() => {
				const element = elementRef.value;
				if (!element) {
					return;
				}

				const bind = (
					eventName: TrackswitchDomEventName,
					vueEventName: keyof TrackSwitchVueEventHandlers,
				) => {
					const listener = (event: Event) => {
						emit(vueEventName, (event as CustomEvent).detail);
					};
					element.addEventListener(eventName, listener);
					listeners.push(function unsubscribe() {
						element.removeEventListener(eventName, listener);
					});
				};

				bind(TRACKSWITCH_DOM_EVENTS.loaded, "loaded");
				bind(TRACKSWITCH_DOM_EVENTS.error, "error");
				bind(TRACKSWITCH_DOM_EVENTS.position, "position");
				bind(TRACKSWITCH_DOM_EVENTS.trackState, "trackState");
				bind(TRACKSWITCH_DOM_EVENTS.markers, "markers");
			});

			onBeforeUnmount(() => {
				listeners.forEach((unsubscribe) => {
					unsubscribe();
				});
				listeners.length = 0;
			});

			return function render() {
				return h(tagName, {
					...attrs,
					ref: elementRef,
				});
			};
		},
	});
}

export const TrackSwitchPlayer = createTrackSwitchVueComponent(
	"TrackSwitchPlayer",
	"trackswitch-player",
);
export const TrackSwitchSyncPlayer = createTrackSwitchVueComponent(
	"TrackSwitchSyncPlayer",
	"trackswitch-sync-player",
);

export default TrackSwitchPlayer;
