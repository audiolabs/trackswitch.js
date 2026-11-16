import type { AlignmentAlgorithmId, AlignmentFeatureSetId } from "../types";
import dtwChroma from "./python/dtw_chroma.py?raw";
import dtwChromaDlnco from "./python/dtw_chroma_dlnco.py?raw";
import mrmsdtwChroma from "./python/mrmsdtw_chroma.py?raw";
import mrmsdtwChromaDlnco from "./python/mrmsdtw_chroma_dlnco.py?raw";

interface AlignmentMethodConfig {
	featureRate: number;
	featureSet: AlignmentFeatureSetId;
}

export interface AlignmentMethod {
	id: AlignmentAlgorithmId;
	name: string;
	/**
	 * Return the Python script that performs alignment given features are already extracted.
	 * Defines `align_pair`. Runs via `exec()` inside the alignment pipeline, where `FEATURE_RATE`
	 * is already present as a Pyodide global, so these scripts don't need to redeclare it.
	 */
	getPythonScript(config: AlignmentMethodConfig): string;
}

export function getAlignmentMethod(id: AlignmentAlgorithmId): AlignmentMethod {
	switch (id) {
		case "dtw":
			return dtwMethod;
		case "mrmsdtw":
			return mrmsdtwMethod;
		default:
			return mrmsdtwMethod;
	}
}

const dtwMethod: AlignmentMethod = {
	id: "dtw",
	name: "DTW",
	getPythonScript(config: AlignmentMethodConfig): string {
		return config.featureSet === "chroma_dlnco" ? dtwChromaDlnco : dtwChroma;
	},
};

const mrmsdtwMethod: AlignmentMethod = {
	id: "mrmsdtw",
	name: "MrMsDTW",
	getPythonScript(config: AlignmentMethodConfig): string {
		return config.featureSet === "chroma_dlnco"
			? mrmsdtwChromaDlnco
			: mrmsdtwChroma;
	},
};
