---
layout: default
title: Spectrogram Views
description: Show the magnitude spectrogram of a mix or of chosen tracks, on linear, log, mel, or Bark frequency axes, in Hz or note names.
permalink: /use-cases/spectrogram-views/
body_class: docs-page docs-page--narrow
---

# Spectrogram Views

This page introduces the `spectrogram` view.
A spectrogram shows how much of each frequency the audio holds over time: time runs left to right, frequency runs bottom to top, and louder parts appear in a stronger colour.
Every player on this page mixes the same violin, synth, bass, and drum stems.

## 1. A spectrogram of what you hear

A `spectrogram` view with `"tracks": "audible"` analyses the mix of all tracks that are currently audible, at their current volumes.
It zooms, seeks, and follows playback exactly like a `waveform` view.

Uncheck the drums or pull their volume down, and the broadband drum hits fade out of the picture right away.
The labels on the left read the frequency axis, which is linear by default.
Magnitudes are compressed with `log(1 + γx)` by default, which brings out quiet parts without letting the loudest ones saturate.

<div class="ts-usecase-showcase">
  <aside class="ts-usecase-showcase__code-callout" aria-label="Copy audible spectrogram player code">
    <h4 class="ts-usecase-showcase__code-title">Hover to show player config</h4>
    <button class="ts-copy-btn" type="button">Copy to clipboard</button>
  </aside>

  <div class="ts-usecase-showcase__player-stage">
    <trackswitch-player
      config-src="audible-player-config.json"
      style="display: block;"></trackswitch-player>
  </div>

  <div class="ts-usecase-showcase__snippet-panel" aria-label="Audible spectrogram code preview">
    <pre class="ts-usecase-showcase__snippet-shell"><code></code></pre>
  </div>
</div>

## 2. Frequency scales, pitch labels, and compression

`frequencyScale` spaces the frequency axis linearly (`"linear"`), by octaves (`"log"`), or on the perceptual `"mel"` and `"bark"` scales.
`axisLabels: "midi"` names the C of every octave instead of printing Hz, and `frequencyRange` accepts note names as well as frequencies.

The bass spectrogram spaces its axis by octaves with `frequencyScale: "log"` and uses a long analysis frame (`fftSize: 8192`), which separates its low notes cleanly.
The drums spectrogram uses a short one (`fftSize: 1024`), which keeps the hits sharp in time, and a short `hopSize` of 128 samples, which places a frame every 3 ms.
`window` selects the window each frame is weighted with, Hann by default, and `hopSize` defaults to the largest hop that window allows under the constant-overlap-add condition: half of `fftSize` for Hann, so neighbouring frames overlap by 50%.
It also shows magnitudes in decibels instead of the default `log(1 + γx)`: `amplitude: "db"` with a `dynamicRange` of 60 dB.

<div class="ts-usecase-showcase">
  <aside class="ts-usecase-showcase__code-callout" aria-label="Copy pitch spectrogram player code">
    <h4 class="ts-usecase-showcase__code-title">Hover to show player config</h4>
    <button class="ts-copy-btn" type="button">Copy to clipboard</button>
  </aside>

  <div class="ts-usecase-showcase__player-stage">
    <trackswitch-player
      config-src="pitch-player-config.json"
      style="display: block;"></trackswitch-player>
  </div>

  <div class="ts-usecase-showcase__snippet-panel" aria-label="Pitch spectrogram code preview">
    <pre class="ts-usecase-showcase__snippet-shell"><code></code></pre>
  </div>
</div>

## 3. A stereo spectrogram

With `stereo`, the view shows the left and the right channel of the mix in two lanes and follows each track's pan.
Here the violins sit on the left and the synths on the right, on a Bark axis.
Move a pan slider and watch the track move between the lanes.

<div class="ts-usecase-showcase">
  <aside class="ts-usecase-showcase__code-callout" aria-label="Copy stereo spectrogram player code">
    <h4 class="ts-usecase-showcase__code-title">Hover to show player config</h4>
    <button class="ts-copy-btn" type="button">Copy to clipboard</button>
  </aside>

  <div class="ts-usecase-showcase__player-stage">
    <trackswitch-player
      config-src="stereo-player-config.json"
      style="display: block;"></trackswitch-player>
  </div>

  <div class="ts-usecase-showcase__snippet-panel" aria-label="Stereo spectrogram code preview">
    <pre class="ts-usecase-showcase__snippet-shell"><code></code></pre>
  </div>
</div>

See the [`spectrogram` reference]({{ '/documentation.html#spectrogram' | relative_url }}) for every option.
