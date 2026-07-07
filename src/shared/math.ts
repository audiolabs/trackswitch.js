export function clampPercent(value: unknown): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return 0;
	}

	return Math.max(0, Math.min(100, parsed));
}

export function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) {
		return min;
	}

	return Math.max(min, Math.min(max, value));
}
