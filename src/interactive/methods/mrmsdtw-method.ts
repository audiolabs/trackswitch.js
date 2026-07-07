/**
 * MrMsDTW (Memory-Restricted Multi-Scale DTW) alignment algorithm.
 *
 * Uses synctoolbox.dtw.mrmsdtw for higher-quality, multi-scale warping.
 * The interactive pipeline can feed it plain feature matrices or
 * chroma-plus-onset combinations depending on the selected feature set.
 */
export { getAlignmentMethod } from "./alignment-method";
