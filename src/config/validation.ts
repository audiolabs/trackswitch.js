export function toConfigRecord(
	value: unknown,
	label: string,
): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`Invalid ${label} configuration.`);
	}

	return value as Record<string, unknown>;
}

export function assertAllowedKeys(
	target: Record<string, unknown>,
	allowedKeys: readonly string[],
	label: string,
): void {
	const allowed = new Set(allowedKeys);
	Object.keys(target).forEach((key) => {
		if (!allowed.has(key)) {
			throw new Error(
				"Invalid " +
					label +
					" key: " +
					key +
					". Allowed keys: " +
					allowedKeys.join(", "),
			);
		}
	});
}

export function normalizePositiveInteger(
	value: number | undefined,
): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
		return undefined;
	}

	return Math.max(1, Math.round(value));
}

export function normalizePositiveFiniteNumber(
	value: number | undefined,
): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return undefined;
	}

	return value;
}

export function normalizeOptionalBoolean(
	value: boolean | undefined,
): boolean | undefined {
	if (value === undefined) {
		return undefined;
	}

	return typeof value === "boolean" ? value : undefined;
}
