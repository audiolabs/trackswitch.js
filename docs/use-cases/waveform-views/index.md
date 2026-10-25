---
layout: default
title: Waveform Views
description: Show, zoom, and navigate waveforms of a mix, of chosen tracks, and of both stereo channels.
permalink: /use-cases/waveform-views/
body_class: docs-page docs-page--narrow
---

# Waveform Views

This page builds up the `waveform` view step by step.
It starts with a waveform of everything you hear, binds waveforms to single tracks, zooms in, follows playback while zoomed, and ends with a stereo waveform.
Every player on this page mixes the same violin, synth, bass, and drum stems.

## 1. A waveform of what you hear

A `waveform` view with `"tracks": "audible"` shows the mix of all tracks that are currently audible, at their current volumes.
`"audible"` is also what a waveform shows when it names no tracks at all.

Uncheck a track or pull its volume slider down, and the waveform redraws with the mix you now hear.
Click or drag anywhere on the waveform to seek.

<div class="ts-usecase-showcase">
  <aside class="ts-usecase-showcase__code-callout" aria-label="Copy audible waveform player code">
    <h4 class="ts-usecase-showcase__code-title">Hover to show player config</h4>
    <button class="ts-copy-btn" type="button">Copy to clipboard</button>
  </aside>

  <div class="ts-usecase-showcase__player-stage">
    <trackswitch-player
      config-src="audible-player-config.json"
      style="display: block;"></trackswitch-player>
  </div>

  <div class="ts-usecase-showcase__snippet-panel" aria-label="Audible waveform code preview">
    <pre class="ts-usecase-showcase__snippet-shell"><code></code></pre>
  </div>
</div>

## 2. Waveforms of chosen tracks

`tracks` can also name the tracks a waveform shows, such as `"tracks": ["bass"]`.
Naming several tracks shows their mix.

This player stacks three waveforms: one of all audible tracks, one bound to the bass, and one bound to the drums.
`text` views above them name each one.
Uncheck the violins: the top waveform changes, while the bass and drums waveforms keep showing their instrument.
A bound waveform draws its tracks only while they are audible, so unchecking the drums replaces the drums waveform with a faded placeholder.

<div class="ts-usecase-showcase">
  <aside class="ts-usecase-showcase__code-callout" aria-label="Copy track waveforms player code">
    <h4 class="ts-usecase-showcase__code-title">Hover to show player config</h4>
    <button class="ts-copy-btn" type="button">Copy to clipboard</button>
  </aside>

  <div class="ts-usecase-showcase__player-stage">
    <trackswitch-player
      config-src="tracks-player-config.json"
      style="display: block;"></trackswitch-player>
  </div>

  <div class="ts-usecase-showcase__snippet-panel" aria-label="Track waveforms code preview">
    <pre class="ts-usecase-showcase__snippet-shell"><code></code></pre>
  </div>
</div>

## 3. Zooming, seeking, and navigating

Every waveform can be zoomed and navigated:

- **Zoom** with the mouse wheel over the waveform, or with a pinch on a touch screen. The view zooms around the pointer.
- **Seek** by clicking or dragging on the waveform, or with the arrow keys: ← and → move by 2 seconds, and with Shift by 5 seconds.
- **Navigate** with the zoom overview in the top-left corner, which appears once the view is zoomed in. It shows the whole timeline and marks the visible part; drag that part to move through the track, or click elsewhere in the overview to jump there. A trackpad or a touch screen also scrolls the waveform sideways.

`defaultZoom` sets the span the view opens on — this player opens on 20 seconds.
`maxZoom` sets the shortest span the view can zoom in to.
Its default, `0`, lets the view zoom in until the individual samples show, where the waveform turns into a line through them.
`"timer": true` adds the waveform's own time readout in the top-right corner.

<div class="ts-usecase-showcase">
  <aside class="ts-usecase-showcase__code-callout" aria-label="Copy zoomed waveform player code">
    <h4 class="ts-usecase-showcase__code-title">Hover to show player config</h4>
    <button class="ts-copy-btn" type="button">Copy to clipboard</button>
  </aside>

  <div class="ts-usecase-showcase__player-stage">
    <trackswitch-player
      config-src="zoom-player-config.json"
      style="display: block;"></trackswitch-player>
  </div>

  <div class="ts-usecase-showcase__snippet-panel" aria-label="Zoomed waveform code preview">
    <pre class="ts-usecase-showcase__snippet-shell"><code></code></pre>
  </div>
</div>

## 4. Following playback while zoomed

A zoomed-in waveform shows only part of the timeline, so `playbackFollowMode` decides how it keeps up with the playhead:

- **`"center"`** (the default) scrolls along with playback, keeping the playhead in the middle of the view.
- **`"jump"`** holds the view still until the playhead reaches its right edge, then turns a page so the playhead starts again at the left.
- **`"off"`** never moves the view on its own. The playhead runs out of view, and the zoom overview or scrolling brings it back.

This player shows all three modes on the same playback, each zoomed to 10 seconds.
Start playback and watch how the three views move.
While you drag a zoom overview, its view holds still and resumes following afterwards.

<div class="ts-usecase-showcase">
  <aside class="ts-usecase-showcase__code-callout" aria-label="Copy playback follow player code">
    <h4 class="ts-usecase-showcase__code-title">Hover to show player config</h4>
    <button class="ts-copy-btn" type="button">Copy to clipboard</button>
  </aside>

  <div class="ts-usecase-showcase__player-stage">
    <trackswitch-player
      config-src="follow-player-config.json"
      style="display: block;"></trackswitch-player>
  </div>

  <div class="ts-usecase-showcase__snippet-panel" aria-label="Playback follow code preview">
    <pre class="ts-usecase-showcase__snippet-shell"><code></code></pre>
  </div>
</div>

## 5. Stereo waveforms

`"stereo": true` replaces the single waveform with two lanes: the upper one, labelled "L", shows the left channel of the mix, and the lower one, labelled "R", the right channel.
Each lane follows every track's volume and pan the way the player routes the audio, so a track panned hard left disappears from the right lane.
Both lanes share one scale, so a louder left channel also looks larger than the right one.
The `height` of the view covers both lanes.

In this player the violins start panned to the left and the synths to the right, so the two lanes differ from the first second on.
Move a pan slider and both lanes redraw.

Every track a stereo waveform shows must have two-channel audio.
If a track has one channel or more than two, the player reports an error instead of loading.

<div class="ts-usecase-showcase">
  <aside class="ts-usecase-showcase__code-callout" aria-label="Copy stereo waveform player code">
    <h4 class="ts-usecase-showcase__code-title">Hover to show player config</h4>
    <button class="ts-copy-btn" type="button">Copy to clipboard</button>
  </aside>

  <div class="ts-usecase-showcase__player-stage">
    <trackswitch-player
      config-src="stereo-player-config.json"
      style="display: block;"></trackswitch-player>
  </div>

  <div class="ts-usecase-showcase__snippet-panel" aria-label="Stereo waveform code preview">
    <pre class="ts-usecase-showcase__snippet-shell"><code></code></pre>
  </div>
</div>
