"""Compatibility shims for packages that are unavailable in Pyodide.

Covers numba (fake @jit), libfmp (minimal reimplementation of the functions
synctoolbox actually calls) and soundfile/pretty_midi/librosa (import-only
stubs).  All of these must be registered in sys.modules before synctoolbox
is installed and imported.
"""

import sys
from types import ModuleType

import numpy as np

# ════════ numba ════════
# Makes @jit / @njit no-op decorators and prange a plain range.

numba_module = ModuleType('numba')

def _jit(*args, **kwargs):
    def decorator(func):
        return func
    if len(args) == 1 and callable(args[0]):
        return args[0]
    return decorator

numba_module.jit = _jit
numba_module.njit = _jit
numba_module.prange = range
sys.modules['numba'] = numba_module

# ════════ libfmp ════════
# Visualization entry points are no-ops; computational ones are real
# reimplementations.

libfmp = ModuleType('libfmp')
libfmp_b = ModuleType('libfmp.b')
libfmp_c1 = ModuleType('libfmp.c1')
libfmp_c2 = ModuleType('libfmp.c2')
libfmp_c3 = ModuleType('libfmp.c3')
libfmp_c6 = ModuleType('libfmp.c6')

# ── libfmp.b: visualization stubs (no-ops) ──
def plot_matrix(*a, **kw):
    return None, None

def plot_chromagram(*a, **kw):
    return None, None

class MultiplePlotsWithColorbar:
    def __init__(self, *a, **kw): pass
    def __enter__(self): return self, [None], [None]
    def __exit__(self, *a): pass

libfmp_b.plot_matrix = plot_matrix
libfmp_b.plot_chromagram = plot_chromagram
libfmp_b.MultiplePlotsWithColorbar = MultiplePlotsWithColorbar

# ── libfmp.c1: CSV / list utilities ──
def list_to_csv(score, csv_filepath):
    import csv
    with open(csv_filepath, 'w', newline='') as f:
        writer = csv.writer(f, delimiter=';')
        writer.writerow(['start', 'duration', 'pitch', 'velocity', 'instrument'])
        for row in score:
            writer.writerow(row)

libfmp_c1.list_to_csv = list_to_csv

# ── libfmp.c3: alignment / tuning functions ──

def compute_strict_alignment_path_mask(P):
    """Compute strict alignment path from a warping path.
    Reimplements libfmp.c3.compute_strict_alignment_path_mask.
    P has shape (K, 2)."""
    P = np.array(P, copy=True)
    if P.shape[0] < 2:
        return P
    N, M = P[-1]
    # Keep points where both indices strictly increase from the previous kept point
    keep_mask = np.concatenate(([True], (P[1:, 0] > P[:-1, 0]) & (P[1:, 1] > P[:-1, 1])))
    # Remove all points on the last row or last column (boundary)
    keep_mask[(P[:, 0] == N) | (P[:, 1] == M)] = False
    # Force the very last point to be included (end boundary condition)
    keep_mask[-1] = True
    return P[keep_mask, :]

def compute_freq_distribution(x, Fs, N=16384, gamma=100, local=True, filt=True, filt_len=101):
    """Compute frequency distribution for tuning estimation.
    Returns (v, F_coef_cents) where v is the distribution and F_coef_cents are cent values."""
    from scipy.fft import rfft

    if local:
        # STFT approach: split into overlapping windows
        hop = N // 2
        num_frames = max(1, (len(x) - N) // hop + 1)
        X_sum = np.zeros(N // 2 + 1)
        for i in range(num_frames):
            segment = x[i * hop : i * hop + N]
            if len(segment) < N:
                segment = np.pad(segment, (0, N - len(segment)))
            X = np.abs(rfft(segment * np.hanning(N)))
            X_sum += X
        X_avg = X_sum / num_frames
    else:
        if len(x) < N:
            x = np.pad(x, (0, N - len(x)))
        X_avg = np.abs(rfft(x[:N] * np.hanning(N)))

    # Log compression
    X_log = np.log(1 + gamma * X_avg)

    # Convert to cent scale
    freq_res = Fs / N
    num_bins = len(X_log)
    F_coef_hertz = np.arange(num_bins) * freq_res

    # Map to cents relative to A4=440Hz
    # cents = 1200 * log2(f / 440) + 6900
    # We compute distribution over cents mod 100 (within each semitone)
    v = np.zeros(100)
    for k in range(1, num_bins):
        f = F_coef_hertz[k]
        if f <= 0:
            continue
        cents = 1200 * np.log2(f / 440) + 6900
        cents_mod = cents % 100
        idx = int(cents_mod) % 100
        v[idx] += X_log[k]

    if filt:
        # Local averaging with triangular window
        kernel_len = min(filt_len, 99)
        kernel = np.bartlett(kernel_len)
        kernel /= kernel.sum()
        v_padded = np.concatenate([v, v, v])
        v_filtered = np.convolve(v_padded, kernel, mode='same')
        v = v_filtered[100:200]
        # Half-wave rectification
        v_mean = np.mean(v)
        v = np.maximum(v - v_mean, 0)

    F_coef_cents = np.arange(100)
    return v, F_coef_cents


def tuning_similarity(v):
    """Estimate tuning from frequency distribution.
    Returns (sim, F_coef_cents_shift, v_shift, tuning, max_sim)."""
    # Find peak in distribution = tuning offset
    peak_idx = np.argmax(v)
    # Convert to centered tuning: 0-49 -> 0 to 49 cents sharp, 50-99 -> -50 to -1 cents flat
    if peak_idx <= 50:
        tuning = peak_idx
    else:
        tuning = peak_idx - 100

    sim = np.max(v)
    return sim, np.arange(100), v, tuning, sim

libfmp_c3.compute_strict_alignment_path_mask = compute_strict_alignment_path_mask
libfmp_c3.compute_freq_distribution = compute_freq_distribution
libfmp_c3.tuning_similarity = tuning_similarity

# ── libfmp.c6: novelty / local average ──
def compute_local_average(x, M):
    """Compute local average using a uniform kernel of width 2*M+1."""
    L = len(x)
    local_avg = np.zeros(L)
    for n in range(L):
        start = max(0, n - M)
        end = min(L, n + M + 1)
        local_avg[n] = np.mean(x[start:end])
    return local_avg

libfmp_c6.compute_local_average = compute_local_average

sys.modules['libfmp'] = libfmp
sys.modules['libfmp.b'] = libfmp_b
sys.modules['libfmp.c1'] = libfmp_c1
sys.modules['libfmp.c2'] = libfmp_c2
sys.modules['libfmp.c3'] = libfmp_c3
sys.modules['libfmp.c6'] = libfmp_c6

# ════════ import-only stubs ════════
# Packages synctoolbox imports but whose functionality we never reach.

# soundfile: file I/O only, never used since audio arrives as numpy arrays.
sf = ModuleType('soundfile')
def _sf_read(*a, **kw): raise RuntimeError('soundfile not available in Pyodide')
sf.read = _sf_read
sys.modules['soundfile'] = sf

# pretty_midi
pm = ModuleType('pretty_midi')
sys.modules['pretty_midi'] = pm

# librosa (synctoolbox imports it but uses implementation='synctoolbox' by default)
librosa = ModuleType('librosa')
librosa_sequence = ModuleType('librosa.sequence')
librosa.sequence = librosa_sequence
sys.modules['librosa'] = librosa
sys.modules['librosa.sequence'] = librosa_sequence
