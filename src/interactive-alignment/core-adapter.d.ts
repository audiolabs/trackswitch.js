import type {
	ElementConfigError,
	ElementConfigParser,
} from "../config/config";
import type {
	MediaConfig,
	TrackSwitchController,
	TrackSwitchViewConfig,
	WaveformPlaybackFollowMode,
} from "../types";
import type { TrackSwitchIconName } from "../views/icons";

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
			typeof import("../player/player").createTrackSwitch
		>[1],
	) => TrackSwitchController;
	describeError: (error: unknown, fallbackMessage: string) => string;
	ensureTrackSwitchStyles: (rootElement: HTMLElement | ShadowRoot) => void;
	isElementConfigError: (error: unknown) => error is ElementConfigError;
	loadElementConfig: <TConfig>(
		element: HTMLElement,
		parseConfig: ElementConfigParser<TConfig>,
	) => Promise<TConfig | undefined>;
	parseNumericCsv: typeof import("../model/alignment").parseNumericCsv;
	renderIconSlotHtml: (
		iconName: TrackSwitchIconName,
		extraClassName?: string,
	) => string;
	renderTrackSwitchErrorPanel: typeof import("../views/layout").renderTrackSwitchErrorPanel;
	renderTrackSwitchLoadingPanel: typeof import("../views/layout").renderTrackSwitchLoadingPanel;
};
export declare function createTrackSwitch(
	rootElement: HTMLElement,
	init: Parameters<InteractiveCoreApi["createTrackSwitch"]>[1],
): TrackSwitchController;
export declare function describeError(
	error: unknown,
	fallbackMessage: string,
): string;
export declare function ensureTrackSwitchStyles(
	rootElement: HTMLElement | ShadowRoot,
): void;
export declare function isElementConfigError(
	error: unknown,
): error is ElementConfigError;
export declare function loadElementConfig<TConfig>(
	element: HTMLElement,
	parseConfig: ElementConfigParser<TConfig>,
): Promise<TConfig | undefined>;
export declare function parseNumericCsv(
	csvText: string,
): ReturnType<InteractiveCoreApi["parseNumericCsv"]>;
export declare function renderIconSlotHtml(
	iconName: TrackSwitchIconName,
	extraClassName?: string,
): string;
export declare function renderTrackSwitchErrorPanel(
	rootElement: HTMLElement,
	options: Parameters<InteractiveCoreApi["renderTrackSwitchErrorPanel"]>[1],
): void;
export declare function renderTrackSwitchLoadingPanel(
	rootElement: HTMLElement,
): void;
