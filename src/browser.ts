import { ElementConfigError, loadElementConfig } from "./config/config";
import {
	defineTrackswitchDefaultElement,
	TRACKSWITCH_DEFAULT_ELEMENT_NAME,
	TrackswitchPlayer,
} from "./element";
import { parseNumericCsv } from "./model/alignment";
import { createTrackSwitch } from "./player/player";
import { ensureTrackSwitchStyles } from "./shared/styles";
import { renderIconSlotHtml } from "./views/icons";
import {
	describeError,
	renderTrackSwitchErrorPanel,
	renderTrackSwitchLoadingPanel,
} from "./views/layout";

defineTrackswitchDefaultElement();

export const interactiveExtensionApi = {
	createTrackSwitch,
	describeError,
	ensureTrackSwitchStyles,
	isElementConfigError: (error: unknown) => error instanceof ElementConfigError,
	loadElementConfig,
	parseNumericCsv,
	renderIconSlotHtml,
	renderTrackSwitchErrorPanel,
	renderTrackSwitchLoadingPanel,
};

const TrackSwitch = {
	TrackswitchPlayer,
	TRACKSWITCH_DEFAULT_ELEMENT_NAME,
	createTrackSwitch,
	defineTrackswitchDefaultElement,
	interactiveExtensionApi,
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
	createTrackSwitch,
	defineTrackswitchDefaultElement,
	TRACKSWITCH_DEFAULT_ELEMENT_NAME,
	TrackswitchPlayer,
};
