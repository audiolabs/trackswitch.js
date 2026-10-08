/**
 * Python source, executed in the Pyodide Web Worker, loaded from `./python/*.py`
 * via Vite's `?raw` import so the scripts remain plain, lintable/highlightable
 * Python files instead of JS template-literal strings.
 *
 * Each export is one step of the worker's setup/compute sequence; see the
 * module docstring at the top of each `.py` file for details.
 */

/**
 * Main alignment pipeline script.
 * Executed after all shims are installed and synctoolbox is available.
 * Expects global variables set by the worker:
 *   - audio_files: dict of {file_id: numpy_array} (mono PCM at SAMPLE_RATE)
 *   - full_resolution_audio: dict of {file_id: [numpy_array, ...]} (per-channel PCM at original sample rate)
 *   - audio_sample_rates: dict of {file_id: sample_rate}
 *   - score_files: dict of {file_id: xml_text_string}
 *   - midi_files: dict of {file_id: {'notes': note_events, 'duration': seconds}}
 *   - file_names: dict of {file_id: filename}
 *   - reference_file_id: str
 *   - alignment_feature_set_id: str
 *   - alignment_algorithm_id: str
 *   - alignment_method_script: str (defines align_pair function)
 *   - FEATURE_RATE: int
 *   - SAMPLE_RATE: int
 *   - generate_synced_audio: bool
 *   - pitch_shift_enabled: bool
 */
export { default as ALIGNMENT_PIPELINE } from "./python/alignment_pipeline.py?raw";
/** Converts the JS audio arrays set as globals into numpy arrays. */
export { default as CONVERT_INPUTS } from "./python/convert_inputs.py?raw";
/**
 * Monkey-patches synctoolbox's __C_to_DE (DTW accumulated cost matrix)
 * with a vectorized anti-diagonal implementation.
 *
 * The original is a triple-nested Python loop (N × M × S) that relies on
 * numba @jit for speed. Without numba (Pyodide), it's extremely slow.
 *
 * The anti-diagonal approach exploits the fact that all cells on the same
 * anti-diagonal (n + m = d) are independent — their predecessors lie on
 * earlier anti-diagonals.  This lets us process each anti-diagonal as a
 * single vectorized numpy operation, reducing N*M Python iterations to
 * N+M numpy-vectorized iterations.
 */
export { default as DTW_SPEEDUP } from "./python/dtw_speedup.py?raw";
/** micropip install of music21, done lazily when MusicXML input appears. */
export { default as INSTALL_MUSIC21 } from "./python/install_music21.py?raw";
/** micropip install of synctoolbox + libtsm. */
export { default as INSTALL_PACKAGES } from "./python/install_packages.py?raw";
/**
 * Shims for packages unavailable in Pyodide (numba, libfmp, soundfile,
 * pretty_midi, librosa). Must run before synctoolbox is installed.
 */
export { default as SHIMS } from "./python/shims.py?raw";
