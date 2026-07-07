import { CursorType, OpenSheetMusicDisplay } from "./osmd";
import type { SheetMusicCursor, SheetMusicEntryModel } from "./types";
import {
	MAX_OSMD_ZOOM,
	MIN_HOST_WIDTH_DELTA_FOR_RERENDER_PX,
	MIN_OSMD_ZOOM,
} from "./types";

interface SheetMusicEntryLifecycleContext {
	destroyed: boolean;
	loadTempoMap(entry: SheetMusicEntryModel): Promise<void>;
	handleHostTouchStart(entry: SheetMusicEntryModel, event: TouchEvent): void;
	handleHostTouchMove(entry: SheetMusicEntryModel, event: TouchEvent): void;
	handleHostClick(entry: SheetMusicEntryModel, event: MouseEvent): void;
	handleHostTouch(entry: SheetMusicEntryModel, event: TouchEvent): void;
}

export async function initializeEntry(
	ctx: SheetMusicEntryLifecycleContext,
	entry: SheetMusicEntryModel,
): Promise<void> {
	entry.host.classList.remove(
		"sheetmusic-error",
		"sheetmusic-ready",
		"sheetmusic-map-error",
	);
	entry.host.classList.add("sheetmusic-loading");

	const measureMapsPromise = entry.measureMapsPromise
		.then((points) => {
			entry.measureMaps = points;
			entry.measureMap = entry.syncReferenceTimeEnabled
				? points.sync
				: points.base;
			entry.host.classList.remove("sheetmusic-map-error");
			return points;
		})
		.catch((error) => {
			entry.measureMaps = {
				base: null,
				sync: null,
			};
			entry.measureMap = null;
			entry.host.classList.add("sheetmusic-map-error");
			console.warn(
				"[trackswitch] Failed to load sheet-music measure map:",
				entry.source,
				error,
			);
			return null;
		});

	try {
		const osmd = new OpenSheetMusicDisplay(entry.host, {
			backend: "svg",
			cursorsOptions: [
				{
					type: CursorType.CurrentArea,
					color: entry.cursorColor,
					alpha: entry.cursorAlpha,
					follow: false,
				},
			],
		});

		await osmd.load(entry.source);
		if (ctx.destroyed) {
			return;
		}

		entry.osmd = osmd;
		applyConfiguredRenderScale(entry);
		renderFullScore(entry);
		entry.lastRenderedHostWidth = readHostWidth(entry.host);
		osmd.enableOrDisableCursors(true);

		rebindMeasureCursor(entry);
		refreshCursorElement(entry);
		entry.availableMeasures = collectAvailableMeasures(osmd);
		entry.availableMeasureSet = new Set(entry.availableMeasures);

		if (entry.availableMeasures.length === 0) {
			console.warn(
				"[trackswitch] Sheet music rendered but no score measures were detected for source:",
				entry.source,
			);
		}
	} catch (error) {
		entry.osmd = null;
		entry.measureCursor = null;
		entry.projectedTempoSegmentsByAxis = {
			base: null,
			sync: null,
		};
		entry.projectedTempoSegments = null;
		entry.fallbackTempoBpm = null;
		entry.availableMeasures = [];
		entry.availableMeasureSet = new Set<number>();
		entry.host.classList.add("sheetmusic-error");
		console.warn(
			"[trackswitch] Failed to load or render sheet music source:",
			entry.source,
			error,
		);
	}

	await measureMapsPromise;
	await ctx.loadTempoMap(entry);

	entry.syncEnabled = Boolean(
		entry.osmd &&
			entry.measureMap &&
			entry.measureMap.length > 0 &&
			entry.availableMeasures.length > 0 &&
			entry.measureCursor,
	);
	entry.targetMeasure = null;

	entry.host.classList.remove("sheetmusic-loading");
	entry.host.classList.toggle("sheetmusic-ready", Boolean(entry.osmd));
	entry.host.classList.toggle("sheetmusic-error", !entry.osmd);

	if (entry.osmd) {
		const touchStartListener = (event: TouchEvent) => {
			ctx.handleHostTouchStart(entry, event);
		};
		const touchMoveListener = (event: TouchEvent) => {
			ctx.handleHostTouchMove(entry, event);
		};
		const clickListener = (event: MouseEvent) => {
			ctx.handleHostClick(entry, event);
		};
		const touchListener = (event: TouchEvent) => {
			ctx.handleHostTouch(entry, event);
		};
		entry.touchStartListener = touchStartListener;
		entry.touchMoveListener = touchMoveListener;
		entry.clickListener = clickListener;
		entry.touchListener = touchListener;
		entry.host.addEventListener("touchstart", touchStartListener, {
			passive: true,
		});
		entry.host.addEventListener("touchmove", touchMoveListener, {
			passive: true,
		});
		entry.host.addEventListener("click", clickListener);
		entry.host.addEventListener("touchend", touchListener, { passive: false });
	}
}

export function applyConfiguredRenderScale(entry: SheetMusicEntryModel): void {
	if (!entry.osmd) {
		return;
	}

	if (entry.renderScale === null) {
		entry.osmd.Zoom = 1;
		return;
	}

	entry.osmd.Zoom = Math.max(
		MIN_OSMD_ZOOM,
		Math.min(MAX_OSMD_ZOOM, entry.renderScale),
	);
}

export function readHostWidth(host: HTMLElement): number {
	const width = host.clientWidth || host.getBoundingClientRect().width;
	if (!Number.isFinite(width) || width <= 0) {
		return 0;
	}

	return width;
}

export function shouldRerenderOnResize(entry: SheetMusicEntryModel): boolean {
	const currentWidth = readHostWidth(entry.host);
	const previousWidth = entry.lastRenderedHostWidth;

	if (currentWidth <= 0) {
		return false;
	}

	if (previousWidth <= 0) {
		return true;
	}

	return (
		Math.abs(currentWidth - previousWidth) >=
		MIN_HOST_WIDTH_DELTA_FOR_RERENDER_PX
	);
}

export function renderFullScore(entry: SheetMusicEntryModel): void {
	const osmd = entry.osmd;
	if (!osmd) {
		return;
	}

	osmd.disableIncrementalRenderingOnScroll();
	osmd.resetIncrementalRendering();
	osmd.render();
}

export function refreshCursorElement(entry: SheetMusicEntryModel): void {
	const cursor = entry.measureCursor;
	if (!cursor) {
		return;
	}

	if (
		cursor.cursorElement instanceof Element &&
		cursor.cursorElement.isConnected &&
		entry.host.contains(cursor.cursorElement)
	) {
		return;
	}

	const hostCursor = entry.host.querySelector('[id^="osmdCursor"]');
	if (hostCursor instanceof Element) {
		cursor.cursorElement = hostCursor;
		return;
	}

	cursor.cursorElement = null;
}

export function disposeEntry(entry: SheetMusicEntryModel): void {
	if (entry.touchStartListener) {
		entry.host.removeEventListener("touchstart", entry.touchStartListener);
		entry.touchStartListener = null;
	}

	if (entry.touchMoveListener) {
		entry.host.removeEventListener("touchmove", entry.touchMoveListener);
		entry.touchMoveListener = null;
	}

	if (entry.clickListener) {
		entry.host.removeEventListener("click", entry.clickListener);
		entry.clickListener = null;
	}

	if (entry.touchListener) {
		entry.host.removeEventListener("touchend", entry.touchListener);
		entry.touchListener = null;
	}

	entry.touchTapState = null;

	const osmd = entry.osmd;
	if (!osmd) {
		return;
	}

	try {
		osmd.enableOrDisableCursors(false);
	} catch (error) {
		console.warn("[trackswitch] Failed to disable sheet-music cursor.", error);
	}

	try {
		osmd.disableIncrementalRenderingOnScroll();
	} catch (error) {
		console.warn(
			"[trackswitch] Failed to disable sheet-music incremental rendering.",
			error,
		);
	}

	try {
		osmd.AutoResizeEnabled = false;
	} catch (error) {
		console.warn(
			"[trackswitch] Failed to disable sheet-music auto-resize.",
			error,
		);
	}

	try {
		osmd.clear();
	} catch (error) {
		console.warn("[trackswitch] Failed to clear sheet-music renderer.", error);
	}

	entry.osmd = null;
	entry.measureCursor = null;
	entry.measureMaps = {
		base: null,
		sync: null,
	};
	entry.measureMap = null;
	entry.projectedTempoSegmentsByAxis = {
		base: null,
		sync: null,
	};
	entry.projectedTempoSegments = null;
	entry.fallbackTempoBpm = null;
	entry.syncEnabled = false;
	entry.lastRenderedHostWidth = -1;
}

export function resolveRuntimeCursor(
	entry: SheetMusicEntryModel,
): SheetMusicEntryModel["measureCursor"] {
	const osmd = entry.osmd;
	if (!osmd) {
		return null;
	}

	const runtimeCursor =
		osmd.cursors && osmd.cursors.length > 0 ? osmd.cursors[0] : osmd.cursor;
	return (runtimeCursor as SheetMusicEntryModel["measureCursor"]) || null;
}

export function rebindMeasureCursor(
	entry: SheetMusicEntryModel,
): SheetMusicCursor | null {
	const runtimeCursor = resolveRuntimeCursor(entry);
	if (!runtimeCursor) {
		entry.measureCursor = null;
		entry.syncEnabled = false;
		return null;
	}

	if (entry.measureCursor !== runtimeCursor) {
		entry.measureCursor = runtimeCursor;
		entry.targetMeasure = null;
	}

	if (entry.measureCursor?.show) {
		entry.measureCursor.show();
	}

	if (
		!entry.syncEnabled &&
		entry.measureMap &&
		entry.measureMap.length > 0 &&
		entry.availableMeasures.length > 0
	) {
		entry.syncEnabled = true;
	}

	return entry.measureCursor as SheetMusicCursor;
}

export function collectAvailableMeasures(
	osmd: import("./osmd").OpenSheetMusicDisplayType,
): number[] {
	const sourceMeasures = osmd.Sheet?.SourceMeasures;
	if (!Array.isArray(sourceMeasures)) {
		return [];
	}

	const unique = new Set<number>();
	sourceMeasures.forEach((measure) => {
		const rawMeasureNumber = measure?.MeasureNumber;
		const parsedMeasureNumber = Number(rawMeasureNumber);
		if (!Number.isFinite(parsedMeasureNumber)) {
			return;
		}
		unique.add(Math.floor(parsedMeasureNumber));
	});

	return Array.from(unique).sort((a, b) => a - b);
}
