export function clampPercent(value: unknown): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return 0;
	}

	return Math.max(0, Math.min(100, parsed));
}

/** Non-finite input collapses to `min`, so callers never propagate a NaN. */
export function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) {
		return min;
	}

	return Math.max(min, Math.min(max, value));
}

/** Gain/volume range. */
export function clamp01(value: number): number {
	return clamp(value, 0, 1);
}

/** Pan position, hard-left to hard-right. */
export function clampPan(value: number): number {
	return clamp(value, -1, 1);
}

export function clampNonNegative(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}

	return Math.max(0, value);
}

/** A duration that is not a usable positive number reads as "unknown", i.e. 0. */
export function sanitizeDuration(value: number): number {
	if (!Number.isFinite(value) || value <= 0) {
		return 0;
	}

	return value;
}
