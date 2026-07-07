import type {
	AlignmentAlgorithmId,
	AlignmentFeatureSetId,
	AlignmentMethodId,
	AlignmentSelection,
} from "./types";

export interface AlignmentFeatureSetOption {
	id: AlignmentFeatureSetId;
	label: string;
}

export interface AlignmentAlgorithmOption {
	id: AlignmentAlgorithmId;
	label: string;
}

export const ALIGNMENT_FEATURE_SET_OPTIONS: AlignmentFeatureSetOption[] = [
	{ id: "chroma_dlnco_synctoolbox", label: "Chroma + DLNCO (synctoolbox)" },
	{ id: "chroma_dlnco", label: "Chroma + DLNCO" },
	{ id: "chroma", label: "Chroma" },
];

export const ALIGNMENT_ALGORITHM_OPTIONS: AlignmentAlgorithmOption[] = [
	{ id: "mrmsdtw", label: "MrMsDTW" },
	{ id: "dtw", label: "DTW" },
];

const COMPATIBLE_ALGORITHMS_BY_FEATURE_SET: Record<
	AlignmentFeatureSetId,
	AlignmentAlgorithmId[]
> = {
	chroma_dlnco_synctoolbox: ["mrmsdtw"],
	chroma_dlnco: ["mrmsdtw", "dtw"],
	chroma: ["mrmsdtw", "dtw"],
};

const COMPATIBLE_FEATURE_SETS_BY_ALGORITHM: Record<
	AlignmentAlgorithmId,
	AlignmentFeatureSetId[]
> = {
	mrmsdtw: ["chroma_dlnco_synctoolbox", "chroma_dlnco", "chroma"],
	dtw: ["chroma_dlnco", "chroma"],
};

export function getDefaultAlignmentSelection(): AlignmentSelection {
	return {
		featureSet: "chroma_dlnco_synctoolbox",
		algorithm: "mrmsdtw",
	};
}

export function getCompatibleAlgorithms(
	featureSet: AlignmentFeatureSetId,
): AlignmentAlgorithmId[] {
	return [...COMPATIBLE_ALGORITHMS_BY_FEATURE_SET[featureSet]];
}

export function getCompatibleFeatureSets(
	algorithm: AlignmentAlgorithmId,
): AlignmentFeatureSetId[] {
	return [...COMPATIBLE_FEATURE_SETS_BY_ALGORITHM[algorithm]];
}

export function isCompatibleAlignmentSelection(
	featureSet: AlignmentFeatureSetId,
	algorithm: AlignmentAlgorithmId,
): boolean {
	return COMPATIBLE_ALGORITHMS_BY_FEATURE_SET[featureSet].includes(algorithm);
}

export function normalizeAlignmentSelection(input: {
	featureSet?: AlignmentFeatureSetId;
	algorithm?: AlignmentAlgorithmId;
	alignmentMethod?: AlignmentMethodId;
}): AlignmentSelection {
	const legacySelection = input.alignmentMethod
		? mapLegacyAlignmentMethod(input.alignmentMethod)
		: getDefaultAlignmentSelection();

	const featureSetProvided = !!input.featureSet;
	const algorithmProvided = !!input.algorithm;
	let featureSet = input.featureSet || legacySelection.featureSet;
	let algorithm = input.algorithm || legacySelection.algorithm;

	if (!featureSetProvided && algorithmProvided) {
		featureSet = getCompatibleFeatureSets(algorithm)[0];
	}

	if (featureSetProvided && !algorithmProvided) {
		algorithm = getCompatibleAlgorithms(featureSet)[0];
	}

	if (!isCompatibleAlignmentSelection(featureSet, algorithm)) {
		algorithm = getCompatibleAlgorithms(featureSet)[0];
	}

	return {
		featureSet: featureSet,
		algorithm: algorithm,
	};
}

export function coerceAlignmentSelectionForFeatureSet(
	featureSet: AlignmentFeatureSetId,
	currentAlgorithm: AlignmentAlgorithmId,
): AlignmentSelection {
	if (isCompatibleAlignmentSelection(featureSet, currentAlgorithm)) {
		return {
			featureSet: featureSet,
			algorithm: currentAlgorithm,
		};
	}

	return {
		featureSet: featureSet,
		algorithm: getCompatibleAlgorithms(featureSet)[0],
	};
}

export function coerceAlignmentSelectionForAlgorithm(
	currentFeatureSet: AlignmentFeatureSetId,
	algorithm: AlignmentAlgorithmId,
): AlignmentSelection {
	if (isCompatibleAlignmentSelection(currentFeatureSet, algorithm)) {
		return {
			featureSet: currentFeatureSet,
			algorithm: algorithm,
		};
	}

	const currentIndex = ALIGNMENT_FEATURE_SET_OPTIONS.findIndex(
		(option) => option.id === currentFeatureSet,
	);
	const compatibleFeatureSets = getCompatibleFeatureSets(algorithm);
	let nearestFeatureSet = compatibleFeatureSets[0];
	let nearestDistance = Number.POSITIVE_INFINITY;

	compatibleFeatureSets.forEach((featureSetId) => {
		const optionIndex = ALIGNMENT_FEATURE_SET_OPTIONS.findIndex(
			(option) => option.id === featureSetId,
		);
		const distance =
			optionIndex === -1 || currentIndex === -1
				? Number.POSITIVE_INFINITY
				: Math.abs(optionIndex - currentIndex);

		if (distance < nearestDistance) {
			nearestDistance = distance;
			nearestFeatureSet = featureSetId;
		}
	});

	return {
		featureSet: nearestFeatureSet,
		algorithm: algorithm,
	};
}

export function mapLegacyAlignmentMethod(
	method: AlignmentMethodId,
): AlignmentSelection {
	switch (method) {
		case "dtw":
			return {
				featureSet: "chroma",
				algorithm: "dtw",
			};
		default:
			return {
				featureSet: "chroma_dlnco_synctoolbox",
				algorithm: "mrmsdtw",
			};
	}
}
