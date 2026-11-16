"""Convert the audio globals handed over by the worker into numpy arrays.

Expects `audio_files_js`, `full_resolution_audio_files` and `audio_sample_rates`
to be set as Pyodide globals; produces `audio_files`, `full_resolution_audio`
and a normalized `audio_sample_rates` for the pipeline to consume.
"""

import numpy as np

# Mono PCM at SAMPLE_RATE, one array per file.
audio_files = {
    fid: np.array(arr, dtype=np.float32)
    for fid, arr in dict(audio_files_js).items()
}

# Original-rate PCM, one array per channel per file.
full_resolution_audio = {
    fid: [np.array(channel, dtype=np.float32) for channel in channels]
    for fid, channels in dict(full_resolution_audio_files).items()
}

audio_sample_rates = {
    str(fid): int(rate) for fid, rate in dict(audio_sample_rates).items()
}
