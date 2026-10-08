import numpy as np
from synctoolbox.dtw.cost import compute_high_res_cost_matrix, cosine_distance
from synctoolbox.dtw.core import compute_warping_path
from synctoolbox.dtw.utils import make_path_strictly_monotonic

CHROMA_DLNCO_COST_ALPHA = 0.5

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
