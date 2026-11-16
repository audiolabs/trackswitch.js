import numpy as np
import synctoolbox.dtw.core as _dtw_core

def _fast_C_to_DE(C, dn=np.array([1,1,0], np.int64),
                  dm=np.array([1,0,1], np.int64),
                  dw=np.array([1.0,1.0,1.0], np.float64),
                  sub_sequence=False):
    """Vectorized anti-diagonal DTW accumulation."""
    N, M = C.shape
    S = dn.size

    D = np.full((N, M), np.inf, dtype=np.float64)
    E = np.full((N, M), -1, dtype=np.int64)

    if sub_sequence:
        D[0, :] = C[0, :]
    else:
        D[0, 0] = C[0, 0]

    # Process each anti-diagonal d = n + m, from 1 to N+M-2.
    # All cells on the same anti-diagonal are independent.
    for d in range(1, N + M - 1):
        n_min = max(0, d - M + 1)
        n_max = min(N - 1, d)
        ns = np.arange(n_min, n_max + 1, dtype=np.int64)
        ms = d - ns
        L = len(ns)

        c_vals = C[ns, ms]

        best_cost = np.full(L, np.inf)
        best_step = np.full(L, -1, dtype=np.int64)

        for s in range(S):
            pn = ns - dn[s]
            pm = ms - dm[s]
            valid = (pn >= 0) & (pm >= 0)
            if not np.any(valid):
                continue
            step_cost = np.full(L, np.inf)
            step_cost[valid] = D[pn[valid], pm[valid]] + c_vals[valid] * dw[s]

            improved = step_cost < best_cost
            best_cost[improved] = step_cost[improved]
            best_step[improved] = s

        finite = np.isfinite(best_cost) & (best_cost < D[ns, ms])
        D[ns[finite], ms[finite]] = best_cost[finite]
        E[ns[finite], ms[finite]] = best_step[finite]

    return D, E

# Monkey-patch the slow pure-Python version
_dtw_core.__C_to_DE = _fast_C_to_DE
