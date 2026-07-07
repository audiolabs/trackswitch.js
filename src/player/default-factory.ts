import { normalizeInit } from "../config/normalize-init";
import type { TrackSwitchController, TrackSwitchInit } from "../domain/types";
import { ensureTrackSwitchStyles } from "../shared/styles";
import { TrackSwitchControllerImpl } from "./player-controller";

export function createDefaultTrackSwitch(
	rootElement: HTMLElement,
	init: TrackSwitchInit,
): TrackSwitchController {
	ensureTrackSwitchStyles(rootElement);
	return new TrackSwitchControllerImpl(
		rootElement,
		normalizeInit(rootElement, init, { variant: "default" }),
	);
}

export const createTrackSwitch = createDefaultTrackSwitch;
