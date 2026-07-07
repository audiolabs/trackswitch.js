/**
 * DTW alignment algorithm.
 *
 * Uses basic Dynamic Time Warping with a cosine-distance cost matrix
 * from synctoolbox.dtw.core. It can operate on any compatible feature
 * matrix the interactive alignment pipeline prepares.
 */
export { getAlignmentMethod } from "./alignment-method";
