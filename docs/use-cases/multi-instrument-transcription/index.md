---
layout: default
title: Piano Roll
description: A MIDI transcription of a four-part ensemble, displayed in a piano roll and coloured per channel.
permalink: /use-cases/multi-instrument-transcription/
body_class: docs-page docs-page--narrow
---

# Piano Roll

This page shows a multichannel MIDI transcription of a four-part chorale.
Trackswitch displays the MIDI notes in a piano roll.
This first player is channel unaware: it has no notion of individual channels, so every note is drawn in the same plain colour.
A second player links each MIDI channel to an audio track, so its piano roll colors each channel and follows the audible track selection, and shows the same transcription as notes that move toward a piano keyboard.

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

Audio data: [ChoraleWind](https://www.audiolabs-erlangen.de/resources/MIR/2026-ChoraleWind), Drese, *Jesu geh voran*.

## How it works

Piano roll views color the note events separately per channel by default — `colorPerChannel` defaults to `true`, so this needs no configuration even for a single combined recording:

```json
{
  "type": "pianoRoll",
  "mediaID": "notes",
  "height": 260
}
```

Additionally, specific tracks can be assigned to each MIDI channel to show or hide MIDI note events depending on the audible track selection:

```json
{
  "type": "pianoRoll",
  "mediaID": "notes",
  "height": 260,
  "channelToTrackIDMap": {
    "0": "soprano",
    "1": "alto",
    "2": "tenor",
    "3": "bass"
  }
}
```

Each value names a media entry of type `audio`. Two channels may name the same track, which is what a transcription of a two-handed piano part needs — the track's row then shows both colours, split with a hard edge.

A channel `channelToTrackIDMap` leaves out is still coloured — it's just always drawn, regardless of which tracks are audible. Setting `colorPerChannel` to `false` turns coloring off entirely, so every channel falls back to the plain accent, whether or not it's paired with a track:

```json
{
  "type": "pianoRoll",
  "mediaID": "notes",
  "colorPerChannel": false,
  "channelToTrackIDMap": { "0": "soprano", "1": "alto" }
}
```

Colours are handed out by ascending channel number — orange, red, green, blue, purple, brown, pink, gray, olive, cyan, then around again. The first colour is the accent of the player, so a roll with a single channel keeps the appearance of an unpaired one. Every colour is a [theming token](../../documentation.html#theming), so a view can override one on its own:

```json
{
  "type": "pianoRoll",
  "mediaID": "notes",
  "channelToTrackIDMap": { "0": "soprano", "1": "alto" },
  "css": { "--ts-color-channel-2": "#8844cc" }
}
```
## With a piano keyboard

The same transcription again, this time channel-aware and as a falling-notes display.
Each channel is linked to its track through `channelToTrackIDMap`, so the roll follows the audible track selection.
`pianoKeyboard` draws a keyboard column beside the pitch axis, pins the playhead to its edge and scrolls the roll past it, so the notes fly into the keys they sound on.

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

The keyboard is a real keyboard on its far edge — seven white keys per octave, with the black keys stopping short of it — while its near edge carries one row per semitone, the same grid the roll draws on. That is what lets a note bar meet its own key. Every C is labelled in gray.

A sounding note lights its key in the colour of its channel. Two channels holding the same pitch split that key along its length, one box each, so a unison stays readable.

`pianoKeyboard` turns on a few things, one of which — `defaultZoom` — is also available on its own:

- Playback holds the playhead against the left edge of the surface instead of centering on it. The surface carries one viewport of empty space past the end of the file, so the playhead stays pinned through the final note. This follow behaviour is exclusive to a keyboard-enabled roll and switches on with it; `playbackFollowMode` is ignored while the keyboard is on.
- Dragging the note grid pans the sheet directly under the pointer, as if pulling the paper, rather than jumping to the click — playback position pans along with it.
- `defaultZoom` is the span the view opens on, here 8 seconds of a 22-second piece. It only sets the starting zoom; scrolling and zooming from there work as they always do. Both `defaultZoom` and `maxZoom` are read in the unit the medium declares through `media.timelineUnit` — MIDI ticks for a file that declares them — and in seconds when it declares none.

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
