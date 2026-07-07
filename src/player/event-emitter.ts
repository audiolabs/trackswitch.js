import type {
	TrackSwitchEventHandler,
	TrackSwitchEventMap,
	TrackSwitchEventName,
	TrackSwitchSnapshot,
} from "../domain/types";
import { createControllerSnapshot } from "./controller-state";
import type { TrackSwitchControllerImpl } from "./player-controller";

type UntypedEventHandler = (payload: unknown) => void;

function toUntypedHandler<K extends TrackSwitchEventName>(
	handler: TrackSwitchEventHandler<K>,
): UntypedEventHandler {
	return handler as unknown as UntypedEventHandler;
}

export function getState(ctx: TrackSwitchControllerImpl): TrackSwitchSnapshot {
	return createControllerSnapshot(ctx);
}

export function on<K extends TrackSwitchEventName>(
	ctx: TrackSwitchControllerImpl,
	eventName: K,
	handler: TrackSwitchEventHandler<K>,
): () => void {
	ctx.listeners[eventName].add(toUntypedHandler(handler));
	return () => off(ctx, eventName, handler);
}

export function off<K extends TrackSwitchEventName>(
	ctx: TrackSwitchControllerImpl,
	eventName: K,
	handler: TrackSwitchEventHandler<K>,
): void {
	ctx.listeners[eventName].delete(toUntypedHandler(handler));
}

export function emit<K extends TrackSwitchEventName>(
	ctx: TrackSwitchControllerImpl,
	eventName: K,
	payload: TrackSwitchEventMap[K],
): void {
	ctx.listeners[eventName].forEach((handler) => {
		handler(payload);
	});
}
