import numpy as np
from synctoolbox.dtw.cost import cosine_distance
from synctoolbox.dtw.core import compute_warping_path
from synctoolbox.dtw.utils import make_path_strictly_monotonic

def align_pair(f_ref, f_other):
    C = cosine_distance(f_ref, f_other)
    D, E, wp = compute_warping_path(C)
    wp = make_path_strictly_monotonic(wp)
    return wp
