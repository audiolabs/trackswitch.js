import type { AlignmentAlgorithmId, AlignmentFeatureSetId } from "../types";

const CHROMA_DLNCO_COST_ALPHA = 0.5;

export interface AlignmentMethodConfig {
	featureRate: number;
	featureSet: AlignmentFeatureSetId;
}

export interface AlignmentMethod {
	id: AlignmentAlgorithmId;
	name: string;
	/** Return the Python script that performs alignment given features are already extracted. */
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
		if (config.featureSet === "chroma_dlnco") {
			return `
import numpy as np
from synctoolbox.dtw.cost import compute_high_res_cost_matrix, cosine_distance
from synctoolbox.dtw.core import compute_warping_path
from synctoolbox.dtw.utils import make_path_strictly_monotonic

FEATURE_RATE = ${config.featureRate}
CHROMA_DLNCO_COST_ALPHA = ${CHROMA_DLNCO_COST_ALPHA}

def align_pair(f_ref, f_other, f_aux_ref=None, f_aux_other=None):
    if f_aux_ref is None or f_aux_other is None:
        C = cosine_distance(f_ref, f_other)
    else:
        C = compute_high_res_cost_matrix(
            f_chroma1=f_ref,
            f_chroma2=f_other,
            f_onset1=f_aux_ref,
            f_onset2=f_aux_other,
            weights=np.array([CHROMA_DLNCO_COST_ALPHA, 1.0 - CHROMA_DLNCO_COST_ALPHA]),
        )
    D, E, wp = compute_warping_path(C)
    wp = make_path_strictly_monotonic(wp)
    return wp
`;
		}

		return `
import numpy as np
from synctoolbox.dtw.cost import cosine_distance
from synctoolbox.dtw.core import compute_warping_path
from synctoolbox.dtw.utils import make_path_strictly_monotonic

FEATURE_RATE = ${config.featureRate}

def align_pair(f_ref, f_other):
    C = cosine_distance(f_ref, f_other)
    D, E, wp = compute_warping_path(C)
    wp = make_path_strictly_monotonic(wp)
    return wp
`;
	},
};

const mrmsdtwMethod: AlignmentMethod = {
	id: "mrmsdtw",
	name: "MrMsDTW",
	getPythonScript(config: AlignmentMethodConfig): string {
		if (config.featureSet === "chroma_dlnco") {
			return `
import numpy as np
from synctoolbox.dtw.anchor import derive_anchors_from_projected_alignment, derive_neighboring_anchors, project_alignment_on_a_new_feature_rate
from synctoolbox.dtw.utils import build_path_from_warping_paths, compute_cost_matrices_between_anchors, compute_warping_paths_from_cost_matrices, find_anchor_indices_in_warping_path, make_path_strictly_monotonic
from synctoolbox.feature.utils import smooth_downsample_feature, normalize_feature

FEATURE_RATE = ${config.featureRate}
CHROMA_DLNCO_COST_ALPHA = ${CHROMA_DLNCO_COST_ALPHA}

def _compute_area(f1, f2):
    return f1.shape[1] * f2.shape[1]

def _refine_wp(wp, anchors, wp_list_refine, neighboring_anchors, neighboring_anchor_indices):
    wp_length = wp[:, neighboring_anchor_indices[-1]:].shape[1]
    last_list = wp[:, neighboring_anchor_indices[-1]:] - np.tile(
        wp[:, neighboring_anchor_indices[-1]].reshape(-1, 1), wp_length
    )
    wp_list_tmp = [wp[:, :neighboring_anchor_indices[0] + 1]] + wp_list_refine + [last_list]
    A_tmp = np.concatenate(
        [anchors[:, 0].reshape(-1, 1), neighboring_anchors, anchors[:, -1].reshape(-1, 1)],
        axis=1,
    )
    return build_path_from_warping_paths(warping_paths=wp_list_tmp, anchors=A_tmp)

def sync_via_mrmsdtw_combined_cost(
    f_chroma1,
    f_chroma2,
    f_dlnco1,
    f_dlnco2,
    input_feature_rate=50,
    step_sizes=np.array([[1, 0], [0, 1], [1, 1]], np.int32),
    step_weights=np.array([1.0, 1.0, 1.0], np.float64),
    threshold_rec=10000,
    win_len_smooth=np.array([201, 101, 21, 1]),
    downsamp_smooth=np.array([50, 25, 5, 1]),
    dtw_implementation='synctoolbox',
    normalize_chroma=True,
    chroma_norm_ord=2,
    chroma_norm_threshold=0.001,
    alpha=CHROMA_DLNCO_COST_ALPHA,
):
    if f_dlnco1 is None or f_dlnco2 is None:
        raise ValueError('Combined Chroma + DLNCO alignment requires auxiliary DLNCO features.')

    if (
        f_chroma1.shape[1] != f_dlnco1.shape[1]
        or f_chroma2.shape[1] != f_dlnco2.shape[1]
    ):
        raise ValueError('Chroma and DLNCO features must be of the same length.')

    if downsamp_smooth[-1] != 1 or win_len_smooth[-1] != 1:
        raise ValueError('The last MrMsDTW iteration must run at the input feature rate.')

    num_iterations = win_len_smooth.shape[0]
    cost_matrix_size_old = tuple()
    feature_rate_old = input_feature_rate / downsamp_smooth[0]
    alignment = None

    it = (num_iterations - 1) if _compute_area(f_chroma1, f_chroma2) < threshold_rec else 0

    while it < num_iterations:
        f_chroma1_cur, _ = smooth_downsample_feature(
            f_chroma1,
            input_feature_rate=input_feature_rate,
            win_len_smooth=win_len_smooth[it],
            downsamp_smooth=downsamp_smooth[it],
        )
        f_chroma2_cur, feature_rate_new = smooth_downsample_feature(
            f_chroma2,
            input_feature_rate=input_feature_rate,
            win_len_smooth=win_len_smooth[it],
            downsamp_smooth=downsamp_smooth[it],
        )
        f_dlnco1_cur, _ = smooth_downsample_feature(
            f_dlnco1,
            input_feature_rate=input_feature_rate,
            win_len_smooth=win_len_smooth[it],
            downsamp_smooth=downsamp_smooth[it],
        )
        f_dlnco2_cur, _ = smooth_downsample_feature(
            f_dlnco2,
            input_feature_rate=input_feature_rate,
            win_len_smooth=win_len_smooth[it],
            downsamp_smooth=downsamp_smooth[it],
        )

        if normalize_chroma:
            f_chroma1_cur = normalize_feature(
                f_chroma1_cur,
                norm_ord=chroma_norm_ord,
                threshold=chroma_norm_threshold,
            )
            f_chroma2_cur = normalize_feature(
                f_chroma2_cur,
                norm_ord=chroma_norm_ord,
                threshold=chroma_norm_threshold,
            )

        cost_matrix_size_new = (f_chroma1_cur.shape[1], f_chroma2_cur.shape[1])

        if alignment is None:
            anchors = np.array([[0, f_chroma1_cur.shape[1] - 1], [0, f_chroma2_cur.shape[1] - 1]])
        else:
            projected_alignment = project_alignment_on_a_new_feature_rate(
                alignment=alignment,
                feature_rate_old=feature_rate_old,
                feature_rate_new=feature_rate_new,
                cost_matrix_size_old=cost_matrix_size_old,
                cost_matrix_size_new=cost_matrix_size_new,
            )
            anchors = derive_anchors_from_projected_alignment(
                projected_alignment=projected_alignment,
                threshold=threshold_rec,
            )

        cost_matrices_step1 = compute_cost_matrices_between_anchors(
            f_chroma1=f_chroma1_cur,
            f_chroma2=f_chroma2_cur,
            f_onset1=f_dlnco1_cur,
            f_onset2=f_dlnco2_cur,
            anchors=anchors,
            alpha=alpha,
        )

        wp_list = compute_warping_paths_from_cost_matrices(
            cost_matrices_step1,
            step_sizes=step_sizes,
            step_weights=step_weights,
            implementation=dtw_implementation,
        )
        wp = build_path_from_warping_paths(warping_paths=wp_list, anchors=anchors)

        anchor_indices_in_warping_path = find_anchor_indices_in_warping_path(wp, anchors=anchors)
        neighboring_anchors, neighboring_anchor_indices = derive_neighboring_anchors(
            wp,
            anchor_indices=anchor_indices_in_warping_path,
        )

        cost_matrices_step2 = compute_cost_matrices_between_anchors(
            f_chroma1=f_chroma1_cur,
            f_chroma2=f_chroma2_cur,
            f_onset1=f_dlnco1_cur,
            f_onset2=f_dlnco2_cur,
            anchors=neighboring_anchors,
            alpha=alpha,
        )

        wp_list_refine = compute_warping_paths_from_cost_matrices(
            cost_matrices=cost_matrices_step2,
            step_sizes=step_sizes,
            step_weights=step_weights,
            implementation=dtw_implementation,
        )

        wp = _refine_wp(wp, anchors, wp_list_refine, neighboring_anchors, neighboring_anchor_indices)

        alignment = wp
        feature_rate_old = feature_rate_new
        cost_matrix_size_old = cost_matrix_size_new
        it += 1

    return alignment

def align_pair(f_ref, f_other, f_aux_ref=None, f_aux_other=None):
    step_weights = np.array([1.5, 1.5, 2.0])
    threshold_rec = 10 ** 6
    wp = sync_via_mrmsdtw_combined_cost(
        f_chroma1=f_ref,
        f_chroma2=f_other,
        f_dlnco1=f_aux_ref,
        f_dlnco2=f_aux_other,
        input_feature_rate=FEATURE_RATE,
        step_weights=step_weights,
        threshold_rec=threshold_rec,
        alpha=CHROMA_DLNCO_COST_ALPHA,
    )
    wp = make_path_strictly_monotonic(wp)
    return wp
`;
		}

		return `
import numpy as np
from synctoolbox.dtw.mrmsdtw import sync_via_mrmsdtw
from synctoolbox.dtw.utils import make_path_strictly_monotonic

FEATURE_RATE = ${config.featureRate}

def align_pair(f_ref, f_other, f_aux_ref=None, f_aux_other=None):
    step_weights = np.array([1.5, 1.5, 2.0])
    threshold_rec = 10 ** 6
    wp = sync_via_mrmsdtw(
        f_chroma1=f_ref,
        f_onset1=f_aux_ref,
        f_chroma2=f_other,
        f_onset2=f_aux_other,
        input_feature_rate=FEATURE_RATE,
        step_weights=step_weights,
        threshold_rec=threshold_rec,
        verbose=False,
    )
    wp = make_path_strictly_monotonic(wp)
    return wp
`;
	},
};
