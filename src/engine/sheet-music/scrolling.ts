import type { SheetMusicEntryModel } from "./types";
import { clampNumber } from "./types";

interface SheetMusicScrollContext {
	rebindMeasureCursor(
		entry: SheetMusicEntryModel,
	): SheetMusicEntryModel["measureCursor"];
	refreshCursorElement(entry: SheetMusicEntryModel): void;
}

export function ensureCurrentMeasureVisible(
	ctx: SheetMusicScrollContext,
	entry: SheetMusicEntryModel,
): void {
	scrollCurrentMeasure(ctx, entry, false);
}

export function centerCurrentMeasureInViewport(
	ctx: SheetMusicScrollContext,
	entry: SheetMusicEntryModel,
): void {
	scrollCurrentMeasure(ctx, entry, true);
}

export function scrollCurrentMeasure(
	ctx: SheetMusicScrollContext,
	entry: SheetMusicEntryModel,
	forceCenter: boolean,
): void {
	if (!entry.followPlayback || !entry.syncEnabled || !entry.scrollContainer) {
		return;
	}

	const cursor = ctx.rebindMeasureCursor(entry);
	if (!cursor) {
		return;
	}

	ctx.refreshCursorElement(entry);
	if (!(cursor.cursorElement instanceof Element)) {
		return;
	}

	const scrollContainer = entry.scrollContainer;
	const clientHeight = scrollContainer.clientHeight;
	const maxScrollTop = scrollContainer.scrollHeight - clientHeight;
	if (
		!Number.isFinite(maxScrollTop) ||
		maxScrollTop <= 1 ||
		clientHeight <= 0
	) {
		return;
	}

	const cursorRect = cursor.cursorElement.getBoundingClientRect();
	const viewportRect = scrollContainer.getBoundingClientRect();

	if (
		!Number.isFinite(cursorRect.top) ||
		!Number.isFinite(cursorRect.bottom) ||
		!Number.isFinite(viewportRect.top) ||
		!Number.isFinite(viewportRect.bottom)
	) {
		return;
	}

	const viewportTop = scrollContainer.scrollTop;
	const viewportBottom = viewportTop + clientHeight;
	const cursorTop = viewportTop + (cursorRect.top - viewportRect.top);
	const cursorBottom = viewportTop + (cursorRect.bottom - viewportRect.top);
	const padding = clampNumber(Math.round(clientHeight * 0.12), 8, 24);
	const visibleTop = viewportTop + padding;
	const visibleBottom = viewportBottom - padding;

	const cursorCenter = cursorTop + (cursorBottom - cursorTop) / 2;
	let nextScrollTop = viewportTop;
	if (forceCenter) {
		nextScrollTop = cursorCenter - clientHeight / 2;
	} else if (cursorTop < visibleTop) {
		nextScrollTop = cursorCenter - clientHeight / 2;
	} else if (cursorBottom > visibleBottom) {
		nextScrollTop = cursorCenter - clientHeight / 2;
	} else {
		return;
	}

	const clampedScrollTop = clampNumber(nextScrollTop, 0, maxScrollTop);
	if (Math.abs(clampedScrollTop - viewportTop) < 0.5) {
		return;
	}

	scrollContainer.scrollTo({
		top: clampedScrollTop,
		behavior: "smooth",
	});
}
