import type { TrackRuntime } from "../domain/types";
import { eventTargetAsElement } from "../shared/dom";
import type { TrackSwitchControllerImpl } from "./player-controller";

export function toggleSoloFromPointerEvent(
	controller: TrackSwitchControllerImpl,
	event: MouseEvent,
): void {
	const index = controller.trackIndexFromTarget(event.target ?? null);
	if (index < 0) {
		return;
	}

	if (
		event.shiftKey &&
		!controller.features.exclusiveSolo &&
		controller.runtimes[index]?.state.solo
	) {
		const selectedCount = controller.runtimes.reduce(
			(count: number, runtime: TrackRuntime) =>
				count + (runtime.state.solo ? 1 : 0),
			0,
		);

		if (selectedCount === 1) {
			controller.runtimes.forEach((runtime) => {
				runtime.state.solo = true;
			});
			controller.applyTrackProperties();
			controller.updateMainControls();
			return;
		}
	}

	controller.toggleSolo(index, !!event.shiftKey);
}

export function parseSliderValue(target: HTMLInputElement): number {
	return parseFloat(target.value || "0") / 100;
}

export function getTrackInputTarget(
	controller: TrackSwitchControllerImpl,
	event: Event,
): { target: HTMLInputElement; trackIndex: number } | null {
	const target = eventTargetAsElement(event.target ?? null);
	if (!(target instanceof HTMLInputElement)) {
		return null;
	}

	const trackIndex = controller.trackIndexFromTarget(target);
	if (trackIndex < 0) {
		return null;
	}

	return {
		target,
		trackIndex,
	};
}
