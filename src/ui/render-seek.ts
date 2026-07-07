import { clampPercent } from "../shared/math";

interface LoopState {
	pointA: number | null;
	pointB: number | null;
	enabled: boolean;
}

function setDisplay(element: Element, displayValue: string): void {
	(element as HTMLElement).style.display = displayValue;
}

function resolveSeekGeometryRoot(seekWrap: HTMLElement): HTMLElement {
	const seekbar = seekWrap.querySelector(":scope > .seekbar");
	return seekbar instanceof HTMLElement ? seekbar : seekWrap;
}

function setPercentProperty(
	element: HTMLElement,
	propertyName: string,
	value: number,
): void {
	element.style.setProperty(propertyName, `${clampPercent(value)}%`);
}

function clampTime(value: number, minimum: number, maximum: number): number {
	if (!Number.isFinite(value)) {
		return minimum;
	}

	if (value < minimum) {
		return minimum;
	}

	if (value > maximum) {
		return maximum;
	}

	return value;
}

function sanitizeDuration(value: number): number {
	if (!Number.isFinite(value) || value <= 0) {
		return 0;
	}

	return value;
}

function setMainSeekbarPlayheadPosition(
	seekbar: HTMLElement,
	seekhead: HTMLElement,
	seekRatio: number,
): void {
	const seekheadWidth = seekhead.offsetWidth;
	const seekbarWidth = seekbar.clientWidth;
	const scaledSeekheadLeft = seekRatio * (seekbarWidth - seekheadWidth);

	seekbar.style.setProperty(
		"--ts-playhead-position",
		`${scaledSeekheadLeft}px`,
	);
}

export function updateSeekWrapVisuals(
	seekWrap: HTMLElement,
	position: number,
	duration: number,
	loop: LoopState,
	loopingEnabled: boolean,
): void {
	const safeDuration = sanitizeDuration(duration);
	const safePosition =
		safeDuration > 0 ? clampTime(position, 0, safeDuration) : 0;
	const geometryRoot = resolveSeekGeometryRoot(seekWrap);
	const seekhead = geometryRoot.querySelector(".seekhead");

	if (seekhead instanceof HTMLElement) {
		const seekRatio = safeDuration > 0 ? safePosition / safeDuration : 0;
		if (geometryRoot.classList.contains("seekbar")) {
			setMainSeekbarPlayheadPosition(geometryRoot, seekhead, seekRatio);
		} else {
			setPercentProperty(
				geometryRoot,
				"--ts-playhead-position",
				clampPercent(seekRatio * 100),
			);
		}
	}

	if (!loopingEnabled) {
		return;
	}

	const markerA = seekWrap.querySelector(".loop-marker.marker-a");
	if (markerA && loop.pointA !== null && safeDuration > 0) {
		const pointAPerc = clampPercent(
			(clampTime(loop.pointA, 0, safeDuration) / safeDuration) * 100,
		);
		setPercentProperty(geometryRoot, "--ts-loop-marker-a", pointAPerc);
		setDisplay(markerA, "block");
	} else if (markerA) {
		setDisplay(markerA, "none");
	}

	const markerB = seekWrap.querySelector(".loop-marker.marker-b");
	if (markerB && loop.pointB !== null && safeDuration > 0) {
		const pointBPerc = clampPercent(
			(clampTime(loop.pointB, 0, safeDuration) / safeDuration) * 100,
		);
		setPercentProperty(geometryRoot, "--ts-loop-marker-b", pointBPerc);
		setDisplay(markerB, "block");
	} else if (markerB) {
		setDisplay(markerB, "none");
	}

	const loopRegion = seekWrap.querySelector(".loop-region");
	if (
		loopRegion &&
		loop.pointA !== null &&
		loop.pointB !== null &&
		safeDuration > 0
	) {
		const orderedPointA = Math.min(loop.pointA, loop.pointB);
		const orderedPointB = Math.max(loop.pointA, loop.pointB);
		const pointAPerc = clampPercent(
			(clampTime(orderedPointA, 0, safeDuration) / safeDuration) * 100,
		);
		const pointBPerc = clampPercent(
			(clampTime(orderedPointB, 0, safeDuration) / safeDuration) * 100,
		);

		setPercentProperty(geometryRoot, "--ts-loop-region-start", pointAPerc);
		setPercentProperty(
			geometryRoot,
			"--ts-loop-region-width",
			Math.max(0, pointBPerc - pointAPerc),
		);
		setDisplay(loopRegion, "block");
		loopRegion.classList.toggle("active", loop.enabled);
	} else if (loopRegion) {
		setDisplay(loopRegion, "none");
		loopRegion.classList.remove("active");
	}
}
