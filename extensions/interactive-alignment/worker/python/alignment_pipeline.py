import numpy as np
import gc
import io
import wave

# Execute the alignment method script (defines align_pair)
exec(alignment_method_script)

import libtsm
from synctoolbox.feature.pitch import audio_to_pitch_features
from synctoolbox.feature.chroma import pitch_to_chroma, quantize_chroma, quantized_chroma_to_CENS
from synctoolbox.feature.utils import estimate_tuning, shift_chroma_vectors
from synctoolbox.dtw.utils import compute_optimal_chroma_shift, make_path_strictly_monotonic

# Try to import onset features (may fail gracefully)
try:
    from synctoolbox.feature.pitch_onset import audio_to_pitch_onset_features
    from synctoolbox.feature.dlnco import pitch_onset_features_to_DLNCO
    HAS_ONSET_FEATURES = True
except Exception:
    HAS_ONSET_FEATURES = False

def extract_audio_features(audio_data, sample_rate, feature_rate, include_onset=False, progress_fn=None):
    """Extract chroma features and, optionally, DLNCO onset features from audio PCM data."""
    if progress_fn: progress_fn('Estimating tuning')
    tuning_offset = estimate_tuning(audio_data, sample_rate)

    if progress_fn: progress_fn('Computing pitch features')
    f_pitch = audio_to_pitch_features(
        f_audio=audio_data,
        Fs=sample_rate,
        tuning_offset=tuning_offset,
        feature_rate=feature_rate,
        verbose=False,
    )

    if progress_fn: progress_fn('Computing chroma features')
    f_chroma = pitch_to_chroma(f_pitch=f_pitch)
    f_chroma_quantized = quantize_chroma(f_chroma=f_chroma)

    f_onset = None
    if include_onset:
        if not HAS_ONSET_FEATURES:
            raise ValueError('DLNCO alignment requires synctoolbox onset feature support.')
        if progress_fn: progress_fn('Computing onset features')
        f_pitch_onset = audio_to_pitch_onset_features(
            f_audio=audio_data,
            Fs=sample_rate,
            tuning_offset=tuning_offset,
            verbose=False,
        )
        if progress_fn: progress_fn('Computing DLNCO features')
        f_onset = pitch_onset_features_to_DLNCO(
            f_peaks=f_pitch_onset,
            feature_rate=feature_rate,
            feature_sequence_length=f_chroma_quantized.shape[1],
            visualize=False,
        )

    return f_chroma_quantized, f_onset

def pitch_shift_cents_from_chroma_shift(chroma_shift):
    cents = int(chroma_shift) % 12
    if cents > 6:
        cents -= 12
    return int(cents * 100)

# libtsm's default window/hop sizes are fixed sample counts tuned for 22050 Hz.
# Passing Fs alone does not rescale them, so on full-resolution audio (typically
# 44.1/48 kHz) the windows cover half their intended duration, which collapses the
# phase vocoder's frequency resolution and produces phasy / smeared output. Scale
# the window and hop sizes by the actual sample rate to keep their physical
# duration constant and match the quality of running libtsm at 22050 Hz.
TSM_REFERENCE_FS = 22050

def tsm_window_kwargs(sample_rate):
    scale = float(sample_rate) / TSM_REFERENCE_FS
    def scaled(value):
        # Round to an even size: libtsm's STFT framing assumes even window
        # lengths and breaks (shape mismatch) when a non-integer scale produces
        # an odd one, e.g. at 48 kHz.
        return max(2, 2 * int(round(value * scale / 2.0)))
    return {
        'hps_ana_hop': scaled(256),
        'hps_win_length': scaled(1024),
        'pv_syn_hop': scaled(512),
        'pv_win_length': scaled(2048),
        'ola_syn_hop': scaled(128),
        'ola_win_length': scaled(256),
    }

def ensure_strict_time_map(time_map):
    if time_map.shape[0] <= 1:
        return time_map
    keep = np.ones(time_map.shape[0], dtype=bool)
    keep[1:] = (np.diff(time_map[:, 0]) > 0) & (np.diff(time_map[:, 1]) > 0)
    return time_map[keep]

def build_valid_time_map(warping_path, source_sample_count, target_sample_count, sample_rate, feature_rate):
    warping_path = make_path_strictly_monotonic(np.asarray(warping_path))
    source_samples = np.round(warping_path[1] / feature_rate * sample_rate).astype(int)
    target_samples = np.round(warping_path[0] / feature_rate * sample_rate).astype(int)
    time_map = np.column_stack((source_samples, target_samples))

    if time_map.shape[0] == 0:
        raise ValueError('time_map is empty.')

    max_source = max(0, int(source_sample_count) - 1)
    max_target = max(0, int(target_sample_count) - 1)
    time_map[:, 0] = np.clip(time_map[:, 0], 0, max_source)
    time_map[:, 1] = np.clip(time_map[:, 1], 0, max_target)

    time_map = ensure_strict_time_map(time_map)
    time_map = libtsm.ensure_validity(time_map)
    time_map = ensure_strict_time_map(time_map)

    if time_map.shape[0] == 0:
        raise ValueError('time_map is empty after validity filtering.')

    if time_map.shape[0] > 0 and time_map[0, 0] > 0 and time_map[0, 1] > 0:
        time_map = np.vstack(([0, 0], time_map))
        time_map = ensure_strict_time_map(time_map)

    if (
        time_map.shape[0] > 0
        and time_map[-1, 0] < max_source
        and time_map[-1, 1] < max_target
    ):
        time_map = np.vstack((time_map, [max_source, max_target]))
        time_map = ensure_strict_time_map(time_map)

    if time_map.shape[0] < 2:
        raise ValueError('time_map has too few anchor points after filtering.')

    return time_map.astype(int)

def encode_wav_bytes(audio_data, sample_rate):
    audio_array = np.asarray(audio_data, dtype=np.float32)
    if audio_array.ndim == 1:
        audio_array = audio_array[:, np.newaxis]

    # Time stretching / pitch shifting can push samples slightly past full scale.
    # Hard-clipping those overshoots produces audible distortion, so peak-limit
    # instead. Only attenuate when the peak actually exceeds full scale, so the
    # relative level between tracks is preserved whenever no overshoot occurs.
    peak = float(np.max(np.abs(audio_array))) if audio_array.size else 0.0
    if peak > 1.0:
        audio_array = audio_array / peak

    pcm = np.round(audio_array * 32767.0).astype(np.int16)

    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as wav_file:
        wav_file.setnchannels(int(pcm.shape[1]))
        wav_file.setsampwidth(2)
        wav_file.setframerate(int(sample_rate))
        wav_file.writeframes(pcm.reshape(-1).tobytes())

    return buffer.getvalue()

def render_synchronized_audio(fid, warping_path, chroma_shift, progress_fn=None):
    channels = full_resolution_audio.get(fid)
    if not channels:
        raise ValueError('No full-resolution audio channels available for synchronized rendering: ' + str(_file_names_dict.get(fid, fid)))

    sample_rate = int(audio_sample_rates[str(fid)])
    reference_duration = float(sync_render_reference_duration)
    target_sample_count = int(round(reference_duration * sample_rate))
    if progress_fn is not None:
        progress_fn(0.02, 'preparing time map')
    pitch_shift_cents = pitch_shift_cents_from_chroma_shift(chroma_shift)
    window_kwargs = tsm_window_kwargs(sample_rate)
    rendered_channels = []
    total_channels = len(channels)

    for channel_index, channel_audio in enumerate(channels):
        channel_start = channel_index / max(total_channels, 1)
        channel_span = 1.0 / max(total_channels, 1)
        channel_audio = np.asarray(channel_audio, dtype=np.float32).reshape(-1)
        time_map = build_valid_time_map(
            warping_path,
            len(channel_audio),
            target_sample_count,
            sample_rate,
            FEATURE_RATE
        )
        if progress_fn is not None:
            progress_fn(
                channel_start + 0.05 * channel_span,
                f'rendering channel {channel_index + 1}/{total_channels}'
            )
        shifted_audio = channel_audio
        if pitch_shift_enabled and pitch_shift_cents != 0:
            if progress_fn is not None:
                progress_fn(
                    channel_start + 0.18 * channel_span,
                    f'Synchronizing audio: pitch-shifting channel {channel_index + 1}/{total_channels}'
                )
            shifted_audio = libtsm.pitch_shift(
                channel_audio,
                pitch_shift_cents,
                Fs=sample_rate,
                order='tsm-res',
                **window_kwargs
            )
        shifted_audio = np.asarray(shifted_audio, dtype=np.float32).reshape(-1)
        if progress_fn is not None:
            progress_fn(
                channel_start + 0.62 * channel_span,
                f'Synchronizing audio: time-stretching channel {channel_index + 1}/{total_channels}'
            )
        synced_audio = libtsm.hps_tsm(shifted_audio, time_map, Fs=sample_rate, **window_kwargs)
        rendered_channels.append(np.asarray(synced_audio, dtype=np.float32).reshape(-1))

    if len(rendered_channels) == 0:
        raise ValueError('No audio channels available for synchronized rendering.')

    min_length = min(len(channel) for channel in rendered_channels)
    stacked = np.stack([channel[:min_length] for channel in rendered_channels], axis=1)
    if progress_fn is not None:
        progress_fn(0.98, 'encoding wav')
    return encode_wav_bytes(stacked, sample_rate)

def extract_score_note_events_and_measure_map(xml_text):
    """Extract score note events and measure boundaries from MusicXML."""
    import music21
    import pandas as pd

    score = music21.converter.parse(xml_text)
    score = score.stripTies()
    try:
        score = score.expandRepeats()
    except Exception:
        pass

    # Extract note events
    notes = []
    for part in score.parts:
        instrument_obj = part.getInstrument(returnDefault=True)
        instrument_name = "Unknown"
        if instrument_obj is not None:
            instrument_name = instrument_obj.partName or instrument_obj.instrumentName or "Unknown"

        for note in part.flatten().notes:
            if isinstance(note, music21.chord.Chord):
                for chord_note in note.pitches:
                    notes.append({
                        'start': float(note.offset) * 60.0 / 120.0,
                        'duration': float(note.quarterLength) * 60.0 / 120.0,
                        'pitch': int(chord_note.ps),
                        'velocity': int(note.volume.realized * 127) if note.volume.realized else 64,
                        'instrument': instrument_name,
                    })
            elif hasattr(note, 'pitch'):
                notes.append({
                    'start': float(note.offset) * 60.0 / 120.0,
                    'duration': float(note.quarterLength) * 60.0 / 120.0,
                    'pitch': int(note.pitch.ps),
                    'velocity': int(note.volume.realized * 127) if note.volume.realized else 64,
                    'instrument': instrument_name,
                })

    if not notes:
        raise ValueError("No notes found in MusicXML file")

    tempos = score.flatten().getElementsByClass(music21.tempo.MetronomeMark)
    default_bpm = 120.0
    if tempos:
        default_bpm = tempos[0].number

    for n in notes:
        n['start'] = n['start'] * 120.0 / default_bpm
        n['duration'] = n['duration'] * 120.0 / default_bpm

    measure_times = []
    try:
        ref_part = score.parts[0]
        for m in ref_part.getElementsByClass(music21.stream.Measure):
            measure_num = m.number
            time_sec = float(m.offset) * 60.0 / default_bpm
            measure_times.append((time_sec, measure_num))
        measure_times.sort(key=lambda x: x[0])
    except Exception:
        measure_times = []

    return pd.DataFrame(notes), measure_times

def extract_score_features(xml_text, feature_rate, include_onset=False):
    """Extract score chroma features, optional DLNCO features, and measure map."""
    from synctoolbox.feature.csv_tools import df_to_pitch_features, df_to_pitch_onset_features

    df, measure_times = extract_score_note_events_and_measure_map(xml_text)

    f_pitch = df_to_pitch_features(df, feature_rate=feature_rate)
    f_chroma = pitch_to_chroma(f_pitch=f_pitch)
    f_chroma_quantized = quantize_chroma(f_chroma=f_chroma)

    f_onset = None
    if include_onset:
        if not HAS_ONSET_FEATURES:
            raise ValueError('DLNCO alignment requires synctoolbox onset feature support.')
        f_pitch_onset = df_to_pitch_onset_features(df)
        f_onset = pitch_onset_features_to_DLNCO(
            f_peaks=f_pitch_onset,
            feature_rate=feature_rate,
            feature_sequence_length=f_chroma_quantized.shape[1],
            visualize=False,
        )

    return f_chroma_quantized, f_onset, measure_times

def extract_midi_features(midi_entry, feature_rate, include_onset=False):
    """Extract MIDI chroma features and optional DLNCO features from parsed note events."""
    from synctoolbox.feature.csv_tools import df_to_pitch_features, df_to_pitch_onset_features
    import pandas as pd

    notes_raw = list(dict(midi_entry).get('notes', []))
    notes = []
    for raw_note in notes_raw:
        note = dict(raw_note)
        start = float(note.get('time', 0.0))
        duration = float(note.get('duration', 0.0))
        pitch = int(round(float(note.get('midi', 0))))
        velocity = float(note.get('velocity', 1.0))
        if velocity <= 1.0:
            velocity *= 127.0
        if not np.isfinite(start) or not np.isfinite(duration) or duration < 0:
            continue
        notes.append({
            'start': max(0.0, start),
            'duration': duration,
            'pitch': pitch,
            'velocity': int(max(1, min(127, round(velocity)))),
            'instrument': 'MIDI',
        })

    if not notes:
        raise ValueError('No notes found in MIDI file')

    df = pd.DataFrame(notes)
    f_pitch = df_to_pitch_features(df, feature_rate=feature_rate)
    f_chroma = pitch_to_chroma(f_pitch=f_pitch)
    f_chroma_quantized = quantize_chroma(f_chroma=f_chroma)

    f_onset = None
    if include_onset:
        if not HAS_ONSET_FEATURES:
            raise ValueError('DLNCO alignment requires synctoolbox onset feature support.')
        f_pitch_onset = df_to_pitch_onset_features(df)
        f_onset = pitch_onset_features_to_DLNCO(
            f_peaks=f_pitch_onset,
            feature_rate=feature_rate,
            feature_sequence_length=f_chroma_quantized.shape[1],
            visualize=False,
        )

    return f_chroma_quantized, f_onset


# ── Main pipeline ──

file_time_column_names = dict(file_time_column_names)
file_measure_column_names = dict(file_measure_column_names)

report_progress('[18%] Importing synctoolbox modules...')

midi_files = dict(midi_files)
all_file_ids = list(audio_files.keys()) + list(score_files.keys()) + list(midi_files.keys())
total_files = len(all_file_ids)
non_ref_count = total_files - 1
sync_audio_file_ids = [
    fid for fid in all_file_ids
    if (
        generate_synced_audio
        and fid in audio_files
        and fid != reference_file_id
        and fid in full_resolution_audio
        and len(full_resolution_audio[fid]) > 0
    )
]
sync_audio_count = len(sync_audio_file_ids)
_file_names_dict = dict(file_names)
_feature_cache = globals().get('_interactive_feature_cache')
if _feature_cache is None:
    _feature_cache = {}
    globals()['_interactive_feature_cache'] = _feature_cache

NEEDS_DLNCO_FEATURES = alignment_feature_set_id in ('chroma_dlnco_synctoolbox', 'chroma_dlnco')

def _progress_percent(value):
    return int(np.clip(np.round(value), 0, 100))

def _phase_end(start, weight, total_weight, progress_span):
    return start + (weight / total_weight) * progress_span

def _clone_feature_matrix(matrix):
    if matrix is None:
        return None
    return np.array(matrix, copy=True)

def _clone_measure_map(measure_map):
    if not measure_map:
        return []
    return [(float(time_sec), int(measure_num)) for time_sec, measure_num in measure_map]

def _clone_cached_file_features(cached_entry):
    cloned = {
        'chroma': _clone_feature_matrix(cached_entry['chroma']),
        'onset': _clone_feature_matrix(cached_entry.get('onset')),
    }
    if 'measure_map' in cached_entry:
        cloned['measure_map'] = _clone_measure_map(cached_entry['measure_map'])
    return cloned

PIPELINE_IMPORT_PCT = 18.0
PIPELINE_START_PCT = 20.0
PIPELINE_END_PCT = 99.0
PIPELINE_SPAN = PIPELINE_END_PCT - PIPELINE_START_PCT

feature_weight = max(float(total_files), 1.0)
shift_weight = max(float(non_ref_count) * 0.65, 0.75)
align_weight = max(float(non_ref_count) * 1.0, 1.0)
csv_weight = 0.8
sync_weight = float(sync_audio_count) * 2.4 if generate_synced_audio else 0.0
total_weight = feature_weight + shift_weight + align_weight + csv_weight + sync_weight

FEAT_START = PIPELINE_START_PCT
FEAT_END = _phase_end(FEAT_START, feature_weight, total_weight, PIPELINE_SPAN)
SHIFT_START = FEAT_END
SHIFT_END = _phase_end(SHIFT_START, shift_weight, total_weight, PIPELINE_SPAN)
ALIGN_START = SHIFT_END
ALIGN_END = _phase_end(ALIGN_START, align_weight, total_weight, PIPELINE_SPAN)
CSV_START = ALIGN_END
CSV_END = _phase_end(CSV_START, csv_weight, total_weight, PIPELINE_SPAN)
SYNC_START = CSV_END
SYNC_END = PIPELINE_END_PCT

if NEEDS_DLNCO_FEATURES:
    # tuning=10%, pitch=35%, chroma=10%, onset=25%, dlnco=20%
    _audio_substeps = [
        ('Estimating tuning', 0.0),
        ('Computing pitch features', 0.10),
        ('Computing chroma features', 0.45),
        ('Computing onset features', 0.55),
        ('Computing DLNCO features', 0.80),
    ]
else:
    # tuning=10%, pitch=55%, chroma=35%
    _audio_substeps = [
        ('Estimating tuning', 0.0),
        ('Computing pitch features', 0.10),
        ('Computing chroma features', 0.65),
    ]

report_progress(f'[{_progress_percent(FEAT_START)}%] Starting feature extraction...')

# Extract features for all files
features = {}
score_measure_maps = {}  # file_id -> [(time_sec, measure_num), ...]
for file_idx, fid in enumerate(all_file_ids):
    file_start_pct = FEAT_START + (file_idx / total_files) * (FEAT_END - FEAT_START)
    file_end_pct = FEAT_START + ((file_idx + 1) / total_files) * (FEAT_END - FEAT_START)
    fname = str(_file_names_dict[fid])
    cached_entry = _feature_cache.get(fid)
    cache_satisfies_request = (
        cached_entry is not None
        and (not NEEDS_DLNCO_FEATURES or cached_entry.get('onset') is not None)
    )

    if cache_satisfies_request:
        report_progress(f'[{_progress_percent(file_start_pct)}%] Reusing cached features: {fname}')
        file_features = _clone_cached_file_features(cached_entry)
        if fid in score_files and file_features.get('measure_map'):
            score_measure_maps[fid] = file_features['measure_map']
        features[fid] = file_features
        continue

    if fid in audio_files:
        def _make_progress_fn(base, span, name):
            def fn(step_name):
                # Map sub-step name to fractional progress within this file
                frac = 0.0
                for sname, sfrac in _audio_substeps:
                    if sname == step_name:
                        frac = sfrac
                        break
                pct = _progress_percent(base + frac * span)
                report_progress(f'[{pct}%] {name}: {step_name.lower()}')
            return fn
        prog_fn = _make_progress_fn(file_start_pct, file_end_pct - file_start_pct, fname)
        report_progress(f'[{_progress_percent(file_start_pct)}%] Extracting features: {fname}')
        chroma, onset = extract_audio_features(
            audio_files[fid],
            SAMPLE_RATE,
            FEATURE_RATE,
            include_onset=NEEDS_DLNCO_FEATURES,
            progress_fn=prog_fn,
        )
        file_features = {
            'chroma': chroma,
            'onset': onset,
        }
        _feature_cache[fid] = {
            'type': 'audio',
            'chroma': _clone_feature_matrix(chroma),
            'onset': _clone_feature_matrix(onset),
        }
    elif fid in score_files:
        report_progress(f'[{_progress_percent(file_start_pct)}%] Parsing score: {fname}')
        chroma, onset, measure_map = extract_score_features(
            score_files[fid],
            FEATURE_RATE,
            include_onset=NEEDS_DLNCO_FEATURES,
        )
        if measure_map:
            score_measure_maps[fid] = measure_map
        file_features = {
            'chroma': chroma,
            'onset': onset,
        }
        _feature_cache[fid] = {
            'type': 'musicxml',
            'chroma': _clone_feature_matrix(chroma),
            'onset': _clone_feature_matrix(onset),
            'measure_map': _clone_measure_map(measure_map),
        }
    else:
        report_progress(f'[{_progress_percent(file_start_pct)}%] Parsing MIDI: {fname}')
        chroma, onset = extract_midi_features(
            midi_files[fid],
            FEATURE_RATE,
            include_onset=NEEDS_DLNCO_FEATURES,
        )
        file_features = {
            'chroma': chroma,
            'onset': onset,
        }
        _feature_cache[fid] = {
            'type': 'midi',
            'chroma': _clone_feature_matrix(chroma),
            'onset': _clone_feature_matrix(onset),
        }
    features[fid] = file_features

report_progress(f'[{_progress_percent(SHIFT_START)}%] Feature extraction complete')

ref_chroma = features[reference_file_id]['chroma']

# ── Optimal chroma shift ──
# Compute CENS features (smoothed + downsampled to ~1Hz) for efficient shift search,
# then apply the found shift to the full-resolution chroma and DLNCO features.
# This compensates for pitch transpositions between recordings.
report_progress(f'[{_progress_percent(SHIFT_START)}%] Computing optimal chroma shifts...')

ref_cens = quantized_chroma_to_CENS(ref_chroma, 201, 50, FEATURE_RATE)[0]
chroma_shifts = {reference_file_id: 0}

shift_idx = 0
for fid in all_file_ids:
    if fid == reference_file_id:
        continue
    pct = _progress_percent(SHIFT_START + (shift_idx / max(non_ref_count, 1)) * (SHIFT_END - SHIFT_START))
    fname = str(_file_names_dict[fid])
    report_progress(f'[{pct}%] Finding optimal chroma shift: {fname}')

    other_chroma = features[fid]['chroma']
    other_onset = features[fid]['onset']
    other_cens = quantized_chroma_to_CENS(other_chroma, 201, 50, FEATURE_RATE)[0]
    opt_shift = compute_optimal_chroma_shift(ref_cens, other_cens)
    chroma_shifts[fid] = int(opt_shift)

    if opt_shift != 0:
        report_progress(f'[{pct}%] Applying chroma shift ({opt_shift} bins): {fname}')
        other_chroma = shift_chroma_vectors(other_chroma, opt_shift)
        if other_onset is not None:
            other_onset = shift_chroma_vectors(other_onset, opt_shift)
        features[fid]['chroma'] = other_chroma
        features[fid]['onset'] = other_onset

    shift_idx += 1

report_progress(f'[{_progress_percent(ALIGN_START)}%] Chroma shift complete')

def get_alignment_pair_features(reference_id, other_id):
    ref_features = features[reference_id]
    other_features = features[other_id]

    if alignment_feature_set_id == 'chroma':
        return (
            ref_features['chroma'],
            other_features['chroma'],
            None,
            None,
        )

    if alignment_feature_set_id in ('chroma_dlnco_synctoolbox', 'chroma_dlnco'):
        return (
            ref_features['chroma'],
            other_features['chroma'],
            ref_features.get('onset'),
            other_features.get('onset'),
        )

    return (
        ref_features['chroma'],
        other_features['chroma'],
        None,
        None,
    )

def get_reference_feature_length(reference_id):
    reference_features = features[reference_id]

    return int(reference_features['chroma'].shape[1])

# Align each non-reference file to the reference
warping_paths = {}
align_idx = 0
for fid in all_file_ids:
    if fid == reference_file_id:
        continue
    pct = _progress_percent(ALIGN_START + (align_idx / max(non_ref_count, 1)) * (ALIGN_END - ALIGN_START))
    fname = str(_file_names_dict[fid])
    report_progress(f'[{pct}%] Computing warping path: {fname}')
    ref_feature_matrix, other_feature_matrix, ref_onset, other_onset = get_alignment_pair_features(reference_file_id, fid)
    try:
        wp = align_pair(ref_feature_matrix, other_feature_matrix, ref_onset, other_onset)
    except TypeError:
        wp = align_pair(ref_feature_matrix, other_feature_matrix)
    warping_paths[fid] = wp
    align_idx += 1

report_progress(f'[{_progress_percent(CSV_START)}%] Building CSV output...')

import pandas as pd

ref_length = get_reference_feature_length(reference_file_id)
ref_times = np.arange(ref_length, dtype=np.float64) / FEATURE_RATE
if reference_file_id in audio_files:
    sync_render_reference_duration = len(audio_files[reference_file_id]) / SAMPLE_RATE
elif reference_file_id in midi_files:
    sync_render_reference_duration = float(dict(midi_files[reference_file_id]).get('duration', ref_length / FEATURE_RATE))
else:
    sync_render_reference_duration = ref_length / FEATURE_RATE

other_file_ids_ordered = [fid for fid in all_file_ids if fid != reference_file_id]

ref_col_name = str(file_time_column_names[reference_file_id])
columns = {ref_col_name: ref_times}

for fid in other_file_ids_ordered:
    wp = warping_paths[fid]
    col_name = str(file_time_column_names[fid])
    # Vectorized interpolation: map ref frames to other file times
    columns[col_name] = np.interp(ref_times, wp[0] / FEATURE_RATE, wp[1] / FEATURE_RATE)

# Add measure columns for MusicXML files.
# For each score file, map each reference time frame to a fractional measure number
# by interpolating between measure boundaries.
for fid, mmap in score_measure_maps.items():
    if len(mmap) < 2:
        continue
    m_times = np.array([m[0] for m in mmap], dtype=np.float64)
    m_nums = np.array([m[1] for m in mmap], dtype=np.float64)
    col_name = str(file_measure_column_names[fid])

    if fid == reference_file_id:
        # Score is the reference: map ref_times directly to measure numbers
        columns[col_name] = np.interp(ref_times, m_times, m_nums)
    else:
        # Score is not the reference: use its warping path to map ref times
        # to score times, then score times to measure numbers
        wp = warping_paths[fid]
        score_times = np.interp(ref_times, wp[0] / FEATURE_RATE, wp[1] / FEATURE_RATE)
        columns[col_name] = np.interp(score_times, m_times, m_nums)

sync_audio_outputs = {}
sync_reference_time_column = None

if generate_synced_audio:
    sync_reference_time_column = 'time_sync_reference'
    columns[sync_reference_time_column] = ref_times

report_progress(f'[{_progress_percent(CSV_END)}%] Writing CSV...')

df = pd.DataFrame(columns)
csv_output = df.to_csv(index=False, float_format='%.6f')

if generate_synced_audio:
    report_progress(f'[{_progress_percent(SYNC_START)}%] Releasing alignment buffers before audio rendering...')
    _feature_cache.clear()
    for _name in (
        'audio_files',
        'score_files',
        'midi_files',
        'features',
        'score_measure_maps',
        'ref_chroma',
        'ref_cens',
        'other_chroma',
        'other_onset',
        'other_cens',
        'columns',
        'df',
        'ref_times',
        'm_times',
        'm_nums',
        'score_times',
        'file_features',
        'cached_entry',
    ):
        globals().pop(_name, None)
    gc.collect()

    total_sync_files = max(len(sync_audio_file_ids), 1)

    def _make_sync_progress_fn(base, span, name):
        def fn(frac, stage):
            pct = _progress_percent(base + np.clip(frac, 0.0, 1.0) * span)
            report_progress(f'[{pct}%] {name}: {stage}')
        return fn

    for sync_index, fid in enumerate(sync_audio_file_ids):
        file_start_pct = SYNC_START + (sync_index / total_sync_files) * (SYNC_END - SYNC_START)
        file_end_pct = SYNC_START + ((sync_index + 1) / total_sync_files) * (SYNC_END - SYNC_START)
        fname = str(_file_names_dict[fid])
        report_progress(f'[{_progress_percent(file_start_pct)}%] Rendering synced audio: {fname}')
        sync_audio_outputs[fid] = np.frombuffer(
            render_synchronized_audio(
                fid,
                warping_paths[fid],
                chroma_shifts.get(fid, 0),
                progress_fn=_make_sync_progress_fn(file_start_pct, file_end_pct - file_start_pct, fname)
            ),
            dtype=np.uint8
        )
        full_resolution_audio.pop(fid, None)
        gc.collect()

report_progress('[100%] Alignment complete')
