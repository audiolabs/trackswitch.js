import { normalizeInit } from "../config/normalize-init";
import type { TrackSwitchController, TrackSwitchInit } from "../domain/types";
import { ensureTrackSwitchStyles } from "../shared/styles";
import { AlignmentTrackSwitchControllerImpl } from "./alignment-player-controller";

export function createTrackSwitchSyncPlayer(
	rootElement: HTMLElement,
	init: TrackSwitchInit,
): TrackSwitchController {
	ensureTrackSwitchStyles(rootElement);
	return new AlignmentTrackSwitchControllerImpl(
		rootElement,
		normalizeInit(rootElement, init, { variant: "sync" }),
	);
}
