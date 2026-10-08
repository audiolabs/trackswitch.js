import {
	defineTrackSwitchSyncInteractiveElement,
	TRACKSWITCH_SYNC_INTERACTIVE_ELEMENT_NAME,
	TrackswitchSyncInteractive,
} from "./interactive-element";
import { createTrackSwitchSyncInteractive } from "./interactive-factory";

defineTrackSwitchSyncInteractiveElement();

const TrackSwitchInteractive = {
	TrackswitchSyncInteractive,
	TRACKSWITCH_SYNC_INTERACTIVE_ELEMENT_NAME,
	createTrackSwitchSyncInteractive,
	defineTrackSwitchSyncInteractiveElement,
};

declare global {
	interface Window {
		TrackSwitchInteractive: typeof TrackSwitchInteractive;
	}
}

if (typeof window !== "undefined") {
	window.TrackSwitchInteractive = TrackSwitchInteractive;
}

export {
	createTrackSwitchSyncInteractive,
	defineTrackSwitchSyncInteractiveElement,
	TRACKSWITCH_SYNC_INTERACTIVE_ELEMENT_NAME,
	TrackswitchSyncInteractive,
};
