import type {
	ElementConfigError,
	ElementConfigParser,
} from "../../src/config/config";
import type {
	MediaConfig,
	TrackSwitchController,
	TrackSwitchViewConfig,
	WaveformPlaybackFollowMode,
} from "../../src/types";
import type { TrackSwitchIconName } from "../../src/views/icons";

export type {
	MediaConfig,
	TrackSwitchController,
	TrackSwitchIconName,
	TrackSwitchViewConfig,
	WaveformPlaybackFollowMode,
};

type InteractiveCoreApi = {
	createTrackSwitch: (
		rootElement: HTMLElement,
		init: Parameters<
			typeof import("../../src/player/player").createTrackSwitch
		>[1],
	) => TrackSwitchController;
	describeError: (error: unknown, fallbackMessage: string) => string;
	ensureTrackSwitchStyles: (rootElement: HTMLElement | ShadowRoot) => void;
	isElementConfigError: (error: unknown) => error is ElementConfigError;
	loadElementConfig: <TConfig>(
		element: HTMLElement,
		parseConfig: ElementConfigParser<TConfig>,
	) => Promise<TConfig | undefined>;
	parseNumericCsv: typeof import("../../src/model/alignment").parseNumericCsv;
	renderIconSlotHtml: (
		iconName: TrackSwitchIconName,
		extraClassName?: string,
	) => string;
	renderTrackSwitchErrorPanel: typeof import("../../src/views/layout").renderTrackSwitchErrorPanel;
	renderTrackSwitchLoadingPanel: typeof import("../../src/views/layout").renderTrackSwitchLoadingPanel;
};

function coreApi(): InteractiveCoreApi {
	const api = (
		globalThis as typeof globalThis & {
			TrackSwitch?: { interactiveExtensionApi?: InteractiveCoreApi };
		}
	).TrackSwitch?.interactiveExtensionApi;

	if (!api) {
		throw new Error(
			"The TrackSwitch core browser bundle must load before the interactive extension.",
		);
	}

	return api;
}

export function createTrackSwitch(
	rootElement: HTMLElement,
	init: Parameters<InteractiveCoreApi["createTrackSwitch"]>[1],
): TrackSwitchController {
	return coreApi().createTrackSwitch(rootElement, init);
}

export function describeError(error: unknown, fallbackMessage: string): string {
	return coreApi().describeError(error, fallbackMessage);
}

export function ensureTrackSwitchStyles(
	rootElement: HTMLElement | ShadowRoot,
): void {
	coreApi().ensureTrackSwitchStyles(rootElement);
}

export function isElementConfigError(
	error: unknown,
): error is ElementConfigError {
	return coreApi().isElementConfigError(error);
}

export function loadElementConfig<TConfig>(
	element: HTMLElement,
	parseConfig: ElementConfigParser<TConfig>,
): Promise<TConfig | undefined> {
	return coreApi().loadElementConfig(element, parseConfig);
}

export function parseNumericCsv(
	csvText: string,
): ReturnType<InteractiveCoreApi["parseNumericCsv"]> {
	return coreApi().parseNumericCsv(csvText);
}

export function renderIconSlotHtml(
	iconName: TrackSwitchIconName,
	extraClassName = "",
): string {
	return coreApi().renderIconSlotHtml(iconName, extraClassName);
}

export function renderTrackSwitchErrorPanel(
	rootElement: HTMLElement,
	options: Parameters<InteractiveCoreApi["renderTrackSwitchErrorPanel"]>[1],
): void {
	coreApi().renderTrackSwitchErrorPanel(rootElement, options);
}

export function renderTrackSwitchLoadingPanel(rootElement: HTMLElement): void {
	coreApi().renderTrackSwitchLoadingPanel(rootElement);
}
