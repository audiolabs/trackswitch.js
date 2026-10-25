import type { TrackSwitchControllerImpl } from "./player";

/**
 * Scroll positions the lock has just written, by scroll container. A scroll
 * event reports them a moment later, and is then the lock's own echo rather
 * than a scroll to carry on — carrying it would bounce rounding back and forth.
 */
const pendingScrolls = new WeakMap<HTMLElement, number>();

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

function getViewport(
	ctx: TrackSwitchControllerImpl,
	surface: LockedSurface,
): { startRatio: number; widthRatio: number } | null {
	return surface.isPianoRoll
		? ctx.renderer.getPianoRollMinimapViewport(surface.seekWrap)
		: ctx.renderer.getWaveformMinimapViewport(surface.seekWrap);
}

/**
 * Carries the visible stretch of the surface behind `source` to every other
 * zoomable surface while `features.lockZoom` is on. The stretch travels
 * through the reference timeline, so surfaces on aligned timelines show the
 * same passage even where their recordings run at different tempos. A surface
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

	const pending = pendingScrolls.get(sourceSurface.scrollContainer);
	if (pending !== undefined) {
		pendingScrolls.delete(sourceSurface.scrollContainer);
		if (Math.abs(sourceSurface.scrollContainer.scrollLeft - pending) <= 1) {
			return;
		}
	}

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
		const zoom = surface.isPianoRoll
			? ctx.renderer.getPianoRollZoom(surface.seekWrap)
			: ctx.renderer.getWaveformZoom(surface.seekWrap);
		if (!viewport || zoom === null || timeline.duration <= 0) {
			return;
		}
		const start = timeline.fromReferenceTime(referenceStart);
		const span = timeline.fromReferenceTime(referenceEnd) - start;
		if (span <= 0) {
			return;
		}

		// The visible share of a surface is inversely proportional to its zoom.
		const nextZoom = (zoom * viewport.widthRatio * timeline.duration) / span;
		if (surface.isPianoRoll) {
			ctx.renderer.setPianoRollZoom(
				surface.seekWrap,
				nextZoom,
				timeline.duration,
				undefined,
			);
			ctx.renderer.setPianoRollMinimapViewportStart(
				surface.seekWrap,
				start / timeline.duration,
			);
		} else {
			ctx.renderer.setWaveformZoom(
				surface.seekWrap,
				nextZoom,
				timeline.duration,
				undefined,
			);
			ctx.renderer.setWaveformMinimapViewportStart(
				surface.seekWrap,
				start / timeline.duration,
			);
			movedWaveform = true;
		}
		pendingScrolls.set(
			surface.scrollContainer,
			surface.scrollContainer.scrollLeft,
		);
	});

	if (movedWaveform) {
		ctx.requestWaveformRender();
	}
}
