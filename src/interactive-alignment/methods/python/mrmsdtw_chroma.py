import numpy as np
from synctoolbox.dtw.mrmsdtw import sync_via_mrmsdtw
from synctoolbox.dtw.utils import make_path_strictly_monotonic

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
