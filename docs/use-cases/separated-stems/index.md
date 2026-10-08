---
layout: default
title: Separated Stems on Aligned Timelines
description: Two performances, each taken apart into harmonic, percussive and residual stems that mix on their own timeline.
permalink: /use-cases/separated-stems/
body_class: docs-page docs-page--narrow
---

# Separated Stems on Aligned Timelines

This page shows two performances of *Gefrorne Tränen*, each split into three audio stems.
The first selection level chooses a performance because the performances use separate aligned timelines.
The second level mixes the harmonic, percussive, and residual stems of the selected performance.
These three stems share one timeline and sum to the original recording.

<div class="ts-usecase-showcase">
  <aside class="ts-usecase-showcase__code-callout" aria-label="Copy player code">
    <h4 class="ts-usecase-showcase__code-title">Hover to show player config</h4>
    <button class="ts-copy-btn" type="button">Copy to clipboard</button>
  </aside>

  <div class="ts-usecase-showcase__player-stage">
    <trackswitch-player
      config-src="player-config.json"
      style="display: block;"></trackswitch-player>
  </div>

  <div class="ts-usecase-showcase__snippet-panel" aria-label="Code preview">
    <pre class="ts-usecase-showcase__snippet-shell"><code></code></pre>
  </div>
</div>

Audio data: [Schubert Winterreise Dataset](https://www.audiolabs-erlangen.de/resources/MIR/SWD), *Gefrorne Tränen*, D. 911, No. 3, performances HU33 and SC06.

## Two levels of selection

`comparisonGroup` decides what a `trackList` contributes to the choice:

| `comparisonGroup` | What the list contributes |
| --- | --- |
| declared | Every row is a selectable timeline of its own. |
| omitted | The list as a whole is one selectable timeline; its rows mix freely inside it. |

The first level holds every selectable timeline the lists contribute. Whatever is selected there sounds; everything else is silent.

- **Both lists in a `comparisonGroup`** — the player has one level. Every row of every list is a timeline, and exactly one of them plays. This is what the [Aligned Timelines](../aligned-timelines/) example does.
- **One list in a `comparisonGroup`, one not** — the first level holds that list's *N* rows plus one entry for the whole second list. Selecting the second list makes its stems audible together, and its rows become the second level.
- **Neither list in a `comparisonGroup`** — the first level holds one entry per list, and each list carries its own stem mix. That is the player above.

Because alignment already selects one timeline at a time across the whole player, the lists that do declare a `comparisonGroup` all share one number; a second number would name the same selection.

A list that declares no `comparisonGroup` gets an extra row above its tracks. That row is the list's own entry on the first level; its tracks are indented underneath it as the second level. Selecting a stem of an unselected list switches the player to that list. Its rows then toggle like an ordinary mixer, except that the last remaining stem stays audible — playback needs a timeline to run on. Switching away and back restores the mix the list was left with.

## One timeline per list

Stems only mix if they really are one recording taken apart, so a `trackList` without a `comparisonGroup` requires all of its tracks to name the same alignment column and to carry the same `startOffsetMs` and `endOffsetMs`:

```json
"alignment": {
  "src": "../../assets/alignment/alignment.csv",
  "referenceTimeline": "reference",
  "timelines": {
    "reference": "time_sync_reference",
    "score": "measure_Schubert_D911-03_2",
    "hu33Harmonic": "time_Schubert_D911-03_HU33",
    "hu33Percussive": "time_Schubert_D911-03_HU33",
    "hu33Residual": "time_Schubert_D911-03_HU33",
    "sc06Harmonic": "time_Schubert_D911-03_SC06",
    "sc06Percussive": "time_Schubert_D911-03_SC06",
    "sc06Residual": "time_Schubert_D911-03_SC06"
  }
}
```

The three HU33 stems share the HU33 column, and the three SC06 stems share the SC06 column. Both perform the same piece at their own tempo, and the alignment maps between them as it would for the undecomposed recordings — the sheet music above follows either performance.

The lists themselves declare nothing but their tracks and a title for the selection row. Leaving `comparisonGroup` out is what makes their stems mix:

```json
{
  "type": "trackList",
  "title": "Performance HU33",
  "tracks": ["hu33Harmonic", "hu33Percussive", "hu33Residual"],
  "trackVolumeControls": true
}
```

The waveform view above the lists uses `"tracks": "audible"`, so it draws whatever currently sounds: the stems of the selected performance, on that performance's own time axis.

## How the stems were made

The stems come from [librosa](https://librosa.org)'s harmonic/percussive source separation, applied to each recording's spectrogram. What the two components leave over is kept as a third, residual stem, so the three of them add back up to the input:

```python
import librosa

y, sr = librosa.load(path, sr=None, mono=True)
stft = librosa.stft(y, n_fft=2048, hop_length=512)

harmonic, percussive = librosa.decompose.hpss(stft, margin=(2.0, 2.0))
residual = stft - (harmonic + percussive)

for name, spectrum in {"h": harmonic, "p": percussive, "r": residual}.items():
    signal = librosa.istft(spectrum, hop_length=512, length=len(y))
```

A margin above `1.0` makes the separation stricter and pushes everything the masks disagree about into the residual, which is what makes that third stem worth listening to.
