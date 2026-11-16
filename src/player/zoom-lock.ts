import { MIN_TIMELINE_ZOOM } from "../views/surface";
import type { TrackSwitchControllerImpl } from "./player";

/** A zoomable surface, as the lock reads and moves it. */
interface LockedSurface {
	seekWrap: HTMLElement;
	scrollContainer: HTMLElement;
	isPianoRoll: boolean;
}

function listLockedSurfaces(ctx: TrackSwitchControllerImpl): LockedSurface[] {
	return [
		...ctx.renderer.waveformSeekSurfaces.map((surface) => ({
			seekWrap: surface.seekWrap,
			scrollContainer: surface.scrollContainer,
			isPianoRoll: false,
		})),
		...ctx.renderer.pianoRollSeekSurfaces.map((surface) => ({
			seekWrap: surface.seekWrap,
			scrollContainer: surface.scrollContainer,
			isPianoRoll: true,
		})),
	];
}

/**
 * Brings every zoomable surface to the stretch the first one on the page
 * shows, while `features.lockZoom` is on — for when the surfaces opened, or
 * reopened, each at its own zoom.
 */
export function alignLockedZoom(ctx: TrackSwitchControllerImpl): void {
	if (!ctx.features.lockZoom) {
		return;
	}

	const first = ctx.root.querySelector(
		'.seekwrap[data-seek-surface="waveform"], .seekwrap[data-seek-surface="piano-roll"]',
	);
	if (first instanceof HTMLElement) {
		syncLockedZoom(ctx, first);
	}
}

/**
 * The share of a surface's whole view that a column beside its scroller takes,
 * such as a piano keyboard. The lock compares whole views, column included —
 * that is where a centered playhead sits — so a roll with a keyboard reads as
 * wider than its scroller, extending under the column.
 */
function getLeadingShare(
	ctx: TrackSwitchControllerImpl,
	surface: LockedSurface,
): number {
	if (!surface.isPianoRoll) {
		return 0;
	}
	const roll = ctx.renderer.findPianoRollSurface(surface.seekWrap);
	const columnPx = roll?.cachedLeadingColumnPx ?? 0;
	const viewPx = surface.scrollContainer.clientWidth + columnPx;
	return viewPx > 0 ? columnPx / viewPx : 0;
}

function getZoom(
	ctx: TrackSwitchControllerImpl,
	surface: LockedSurface,
): number | null {
	return surface.isPianoRoll
		? ctx.renderer.getPianoRollZoom(surface.seekWrap)
		: ctx.renderer.getWaveformZoom(surface.seekWrap);
}

/** The visible stretch of the whole view, as ratios of the surface's timeline. */
function getViewport(
	ctx: TrackSwitchControllerImpl,
	surface: LockedSurface,
): { startRatio: number; widthRatio: number } | null {
	const viewport = surface.isPianoRoll
		? ctx.renderer.getPianoRollMinimapViewport(surface.seekWrap)
		: ctx.renderer.getWaveformMinimapViewport(surface.seekWrap);
	if (!viewport) {
		return null;
	}
	const share = getLeadingShare(ctx, surface);
	const widthRatio = viewport.widthRatio / (1 - share);
	return {
		startRatio: viewport.startRatio - widthRatio * share,
		widthRatio,
	};
}

/**
 * Carries the zoom level of the surface behind `source` to every other
 * zoomable surface while `features.lockZoom` is on. Only the level travels —
 * how much music fits the view, measured through the reference timeline so
 * aligned surfaces agree even where their recordings run at different tempos.
 * Where each surface looks stays its own, following its playhead. A surface
 * that cannot zoom that far shows as close a stretch as it can.
 */
export function syncLockedZoom(
	ctx: TrackSwitchControllerImpl,
	source: HTMLElement,
): void {
	if (!ctx.features.lockZoom) {
		return;
	}

	const surfaces = listLockedSurfaces(ctx);
	const sourceSurface = surfaces.find((surface) => surface.seekWrap === source);
	if (!sourceSurface) {
		return;
	}

	const sourceZoom = getZoom(ctx, sourceSurface);
	// Zoomed out all the way shows the whole medium, whatever its length: the
	// others follow to their own whole, rather than to the same stretch of music,
	// which a shorter or longer recording would not fill exactly.
	const sourceFullyZoomedOut =
		sourceZoom !== null && sourceZoom <= MIN_TIMELINE_ZOOM;

	const sourceTimeline = ctx.getSeekTimelineContext(source);
	const sourceViewport = getViewport(ctx, sourceSurface);
	if (!sourceViewport || sourceTimeline.duration <= 0) {
		return;
	}
	const referenceStart = sourceTimeline.toReferenceTime(
		sourceViewport.startRatio * sourceTimeline.duration,
	);
	const referenceEnd = sourceTimeline.toReferenceTime(
		(sourceViewport.startRatio + sourceViewport.widthRatio) *
			sourceTimeline.duration,
	);

	let movedWaveform = false;
	surfaces.forEach((surface) => {
		if (surface === sourceSurface) {
			return;
		}

		const timeline = ctx.getSeekTimelineContext(surface.seekWrap);
		const viewport = getViewport(ctx, surface);
		const zoom = getZoom(ctx, surface);
		if (!viewport || zoom === null || timeline.duration <= 0) {
			return;
		}
		const start = timeline.fromReferenceTime(referenceStart);
		const span = timeline.fromReferenceTime(referenceEnd) - start;
		if (span <= 0) {
			return;
		}

		// The visible share of a surface is inversely proportional to its zoom.
		const nextZoom = sourceFullyZoomedOut
			? MIN_TIMELINE_ZOOM
			: (zoom * viewport.widthRatio * timeline.duration) / span;
		if (surface.isPianoRoll) {
			ctx.renderer.setPianoRollZoom(
				surface.seekWrap,
				nextZoom,
				timeline.duration,
				undefined,
			);
		} else {
			ctx.renderer.setWaveformZoom(
				surface.seekWrap,
				nextZoom,
				timeline.duration,
				undefined,
			);
			movedWaveform = true;
		}
	});

	if (movedWaveform) {
		ctx.requestWaveformRender();
	}
}
