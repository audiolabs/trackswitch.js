import {
	defineTrackSwitchSyncPlayerElement,
	defineTrackswitchDefaultElement,
	defineTrackswitchElement,
	defineTrackswitchElements,
	TRACKSWITCH_DEFAULT_ELEMENT_NAME,
	TRACKSWITCH_ELEMENT_NAME,
	TRACKSWITCH_SYNC_PLAYER_ELEMENT_NAME,
	TrackswitchPlayer,
	TrackswitchSyncPlayer,
} from "./element";
import {
	defineTrackSwitchSyncInteractiveElement,
	TRACKSWITCH_SYNC_INTERACTIVE_ELEMENT_NAME,
	TrackswitchSyncInteractive,
} from "./interactive/interactive-element";
import {
	createInteractiveTrackSwitch,
	createTrackSwitchSyncInteractive,
} from "./interactive/interactive-factory";
import {
	createDefaultTrackSwitch,
	createTrackSwitch,
	createTrackSwitchSyncPlayer,
} from "./player/factory";

defineTrackswitchElements();
defineTrackSwitchSyncInteractiveElement();

const TrackSwitch = {
	TrackswitchSyncPlayer,
	TrackswitchSyncInteractive,
	TrackswitchPlayer,
	TRACKSWITCH_SYNC_PLAYER_ELEMENT_NAME,
	TRACKSWITCH_SYNC_INTERACTIVE_ELEMENT_NAME,
	TRACKSWITCH_DEFAULT_ELEMENT_NAME,
	TRACKSWITCH_ELEMENT_NAME,
	createTrackSwitchSyncInteractive,
	createTrackSwitchSyncPlayer,
	createDefaultTrackSwitch,
	createInteractiveTrackSwitch,
	createTrackSwitch,
	defineTrackSwitchSyncPlayerElement,
	defineTrackswitchDefaultElement,
	defineTrackswitchElement,
	defineTrackswitchElements,
	defineTrackSwitchSyncInteractiveElement,
};

declare global {
	interface Window {
		TrackSwitch: typeof TrackSwitch;
	}
}

if (typeof window !== "undefined") {
	window.TrackSwitch = TrackSwitch;
}

export {
	createDefaultTrackSwitch,
	createInteractiveTrackSwitch,
	createTrackSwitch,
	createTrackSwitchSyncInteractive,
	createTrackSwitchSyncPlayer,
	defineTrackSwitchSyncInteractiveElement,
	defineTrackSwitchSyncPlayerElement,
	defineTrackswitchDefaultElement,
	defineTrackswitchElement,
	defineTrackswitchElements,
	TRACKSWITCH_DEFAULT_ELEMENT_NAME,
	TRACKSWITCH_ELEMENT_NAME,
	TRACKSWITCH_SYNC_INTERACTIVE_ELEMENT_NAME,
	TRACKSWITCH_SYNC_PLAYER_ELEMENT_NAME,
	TrackswitchPlayer,
	TrackswitchSyncInteractive,
	TrackswitchSyncPlayer,
};
