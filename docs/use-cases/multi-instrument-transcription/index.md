---
layout: default
title: Piano Roll
description: A MIDI transcription of a four-part ensemble, displayed in a piano roll and coloured per channel.
permalink: /use-cases/multi-instrument-transcription/
body_class: docs-page docs-page--narrow
---

# Piano Roll

This page shows a multichannel MIDI transcription of a four-part chorale.
Trackswitch displays the MIDI note events in a piano roll.

<div class="ts-usecase-showcase">
  <aside class="ts-usecase-showcase__code-callout" aria-label="Copy player code">
    <h4 class="ts-usecase-showcase__code-title">Hover to show player config</h4>
    <button class="ts-copy-btn" type="button">Copy to clipboard</button>
  </aside>

  <div class="ts-usecase-showcase__player-stage">
    <trackswitch-player
      config-src="piano-config.json"
      style="display: block;"></trackswitch-player>
  </div>

  <div class="ts-usecase-showcase__snippet-panel" aria-label="Code preview">
    <pre class="ts-usecase-showcase__snippet-shell"><code></code></pre>
  </div>
</div>

## How it works

```json
{
  "type": "pianoRoll",
  "mediaID": "notes",
  "height": 380,
  "pianoKeyboard": true,
  "noteRange": ["F2", "F5"],
  "defaultZoom": 8,
  "palette": "colorblind-dark",
  "channelToTrackIDMap": {
    "0": "soprano",
    "1": "alto",
    "2": "tenor",
    "3": "bass"
  }
}
```

A note that is currently playing according to the MIDI lights up in the colour of its channel. Two channels holding the same pitch split that key along its length, one box each, so a unison stays readable.

`pianoKeyboard` turns on a few things, one of which — `defaultZoom` — is also available on its own:

`noteRange` fixes the pitch axis instead of deriving it from the file. Each entry is a note name or a MIDI note number, so `["F2", "F5"]` and `[41, 77]` are the same range. Left at its default of `"automatic"`, the axis spans every note of the file with two semitones of padding.

## Labeling channels

`channelToLabelMap` names each channel — by instrument, part, or anything else — keyed the same way as `channelToTrackIDMap`:

```json
{
  "type": "pianoRoll",
  "mediaID": "notes",
  "noteTooltip": true,
  "legend": "top-right",
  "channelToLabelMap": {
    "0": "Soprano",
    "1": "Alto",
    "2": "Tenor",
    "3": "Bass"
  }
}
```

A labelled channel shows its name in place of the plain channel number in the [`noteTooltip`](#with-a-piano-keyboard) readout. `legend` draws a small panel — colour swatch and label per channel — at the given position; `"top-right"` is the only one implemented so far, and `"none"` (the default) leaves it off. The tooltip and the legend read from the same map, and either can be turned on without the other. A channel `channelToLabelMap` leaves out falls back to its plain channel number in the tooltip, and is left out of the legend entirely.

The piano roll in the keyboard example above has both switched on — hover a note to see its instrument name, or read the legend in the corner.

## Velocity and overlapping notes

Note events are drawn solid by default. Velocity is opt-in, through two switches that work independently:

```json
{
  "type": "pianoRoll",
  "mediaID": "notes",
  "velocityBars": true,
  "velocityOpacity": true
}
```

`velocityBars` draws a small bar inside each note event, and `velocityOpacity` fades the note by its velocity. With both off — the default — every note is a solid block of its channel colour.

Solid notes cannot be told apart by transparency where they overlap, so a pitch held by several channels at once is drawn as a checkerboard: one row per channel, the colours rotating by one row from column to column. Two channels give the two-row pattern; a third adds a third row.

A second note-on for a pitch that is already sounding on the same channel is read as a re-trigger — the note that was running ends there, rather than the two being drawn on top of each other.
