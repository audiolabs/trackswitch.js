---
layout: default
title: Images
description: Seekable images that are shared by all tracks or linked to the active track.
permalink: /use-cases/images/
body_class: docs-page docs-page--narrow
---

# Images

This page shows how to display images inside a Trackswitch player.
A simple image stays visible for all tracks, while a per-track image changes with the audible track.
Both image types can show the playback position.
They can also let users seek by clicking or dragging inside the image.

## Simple image

This player pairs a shared plot with a mix and its component tracks.

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

Audio data: P. Meier, C.-Y. Chiu, and M. Müller, “[A Real-Time Beat Tracking System with Zero Latency and Enhanced Controllability](https://doi.org/10.5334/tismir.189),” *Transactions of the International Society for Music Information Retrieval*, vol. 7, no. 1, pp. 213–227, 2024. [Accompanying Website](https://www.audiolabs-erlangen.de/resources/MIR/2024-RealTimePLP-ControlSignals).

## Per-track images

To display a different image for each selected track, use per-track images.
The view shows the image of the one audible track, so it needs a player in which exactly one track sounds at a time.

The player below compares different audio dereverberation methods. 
Each audio track has a different spectrogram plot that is displayed depending on the track selection state.

<div class="ts-usecase-showcase">
  <aside class="ts-usecase-showcase__code-callout" aria-label="Copy player code">
    <h4 class="ts-usecase-showcase__code-title">Hover to show player config</h4>
    <button class="ts-copy-btn" type="button">Copy to clipboard</button>
  </aside>

  <div class="ts-usecase-showcase__player-stage">
    <trackswitch-player
      config-src="per-track-player-config.json"
      style="display: block;"></trackswitch-player>
  </div>

  <div class="ts-usecase-showcase__snippet-panel" aria-label="Code preview">
    <pre class="ts-usecase-showcase__snippet-shell"><code></code></pre>
  </div>
</div>

Audio data: S. Braun and E. A. P. Habets, “[Online Dereverberation for Dynamic Scenarios Using a Kalman Filter With an Autoregressive Model](https://doi.org/10.1109/LSP.2016.2616888),” *IEEE Signal Processing Letters*, vol. 23, no. 12, pp. 1741–1745, Dec. 2016. [Accompanying Website](https://www.audiolabs-erlangen.de/resources/2016-SPL-MAR-KALMAN).

## How it works

First, you define the images as media entries of type `image`:

```json
"media": {
  "controlSignalPlot": {
    "type": "image",
    "src": "assets/example-1-normal.png"
  }
}
```

Then, for a simple shared image, you add it as an `image` view naming that entry:

```json
{
  "type": "image",
  "mediaID": "controlSignalPlot",
  "seekable": true,
  "seekMarginLeft": 6.6,
  "seekMarginRight": 0.4
}
```

`seekable` makes the image accept clicks and drags, and draws the playhead on it.

For per-track images, each audio entry names the image it belongs to with `imageID`, meaning the media ID of the image that should be shown while that audio track is audible:

```json
"media": {
  "input": {
    "type": "audio",
    "title": "Input signal",
    "src": "assets/input.wav",
    "imageID": "inputPlot",
    "solo": true
  },
  "inputPlot": {
    "type": "image",
    "src": "assets/input.png"
  }
}
```

Then add a `perTrackImage` view. It takes no `mediaID`, because the track selection decides what it shows:

```json
{
  "type": "perTrackImage",
  "seekable": true,
  "seekMarginLeft": 12.4,
  "seekMarginRight": 13.5
}
```

`seekMarginLeft` and `seekMarginRight` restrict the space that the seekhead takes.
This is useful if you want to show a plot, and want to exclude axis labelling or color bars from the seeking area.
Both are percentages of the image width, and together they must stay below 100.
