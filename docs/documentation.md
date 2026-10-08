---
layout: default
title: Documentation
description: Configuration reference for trackswitch
permalink: /documentation.html
body_class: docs-page docs-page--config
toc_script: true
---

# Documentation

- [Introduction](#introduction)
- [Quick setup](#quick-setup)
- [Configuration shape](#configuration-shape)
- [Data](#data)
  - [`media`](#media)
  - [`alignment`](#alignment)
  - [`markers`](#markers)
  - [`presets`](#presets)
- [Views](#views)
  - [`image`](#image)
  - [`perTrackImage`](#pertrackimage)
  - [`waveform`](#waveform)
  - [`pianoRoll`](#pianoroll)
  - [`sheetMusic`](#sheetmusic)
  - [`warpingMatrix`](#warpingmatrix)
  - [`text`](#text)
  - [`separator`](#separator)
  - [`trackList`](#tracklist)
  - [`navigationBar`](#navigationbar)
- [Features](#features)
- [Theming](#theming)
- [IDE Support](#ide-support)
- [Keyboard and loop controls](#keyboard-and-loop-controls)
- [Configuration requirements](#configuration-requirements)

## Introduction

TrackSwitch is a web-based multitrack audio player for scientific audio results. It allows for playback of multiple audio tracks in one easy-to-use and very customizable interface.
This page is the reference for all possible configuration keys that can be used to set up a trackswitch player. 

The [Tutorials & Use Cases]({{ '/use-cases/' | relative_url }}) pages explain the main concepts of the
player and show concrete and complete configuration examples. Read them for further usage examples.

## Quick setup

In the first row, select the player type. In the second row, select the integration method.

<div class="ts-doc-tabs" data-doc-matrix data-doc-matrix-version="default" data-doc-matrix-integration="html" markdown="1">
  <div class="ts-doc-tabs__list ts-doc-tabs__list--versions ts-doc-tabs__list--stacked" aria-label="Player type">
    <button class="ts-doc-tabs__tab is-active" type="button" aria-pressed="true" data-doc-matrix-control="version" data-doc-matrix-value="default">Default</button>
    <button class="ts-doc-tabs__tab" type="button" aria-pressed="false" data-doc-matrix-control="version" data-doc-matrix-value="aligned">Multiple timelines</button>
  </div>
  <div class="ts-doc-tabs__list" aria-label="Integration method">
    <button class="ts-doc-tabs__tab is-active" type="button" aria-pressed="true" data-doc-matrix-control="integration" data-doc-matrix-value="html">HTML</button>
    <button class="ts-doc-tabs__tab" type="button" aria-pressed="false" data-doc-matrix-control="integration" data-doc-matrix-value="esm">ESM</button>
    <button class="ts-doc-tabs__tab" type="button" aria-pressed="false" data-doc-matrix-control="integration" data-doc-matrix-value="react">React</button>
    <button class="ts-doc-tabs__tab" type="button" aria-pressed="false" data-doc-matrix-control="integration" data-doc-matrix-value="vue">Vue</button>
    <button class="ts-doc-tabs__tab" type="button" aria-pressed="false" data-doc-matrix-control="integration" data-doc-matrix-value="svelte">Svelte</button>
  </div>
  <div class="ts-doc-tabs__panel is-active" data-doc-matrix-panel data-doc-matrix-version="default" data-doc-matrix-integration="html" markdown="1">

```html
<script src="dist/js/trackswitch.js"></script>

<trackswitch-player>
  <script type="application/json">
    {
      "media": {
        "drums": { "type": "audio", "src": "drums.mp3", "title": "Drums" },
        "bass": { "type": "audio", "src": "bass.mp3", "title": "Bass" },
        "synth": { "type": "audio", "src": "synth.mp3", "title": "Synth" }
      },
      "views": [
        {
          "type": "navigationBar",
          "controls": ["playback", "globalVolume", "markerNavigation", "presets", "timer", "seekBar"]
        },
        { "type": "waveform", "tracks": "audible" },
        {
          "type": "trackList",
          "tracks": ["drums", "bass", "synth"],
          "trackVolumeControls": true,
          "trackPanControls": "balance"
        }
      ]
    }
  </script>
</trackswitch-player>
```

  </div>
  <div class="ts-doc-tabs__panel" data-doc-matrix-panel data-doc-matrix-version="default" data-doc-matrix-integration="esm" hidden markdown="1">

```ts
import {
  defineTrackswitchDefaultElement,
  type TrackSwitchInit,
} from "trackswitch";

const config: TrackSwitchInit = {
  media: {
    drums: { type: "audio", src: "drums.mp3", title: "Drums" },
    bass: { type: "audio", src: "bass.mp3", title: "Bass" },
    synth: { type: "audio", src: "synth.mp3", title: "Synth" },
  },
  views: [
    {
      type: "navigationBar",
      controls: ["playback", "globalVolume", "markerNavigation", "presets", "timer", "seekBar"],
    },
    { type: "waveform", tracks: "audible" },
    {
      type: "trackList",
      tracks: ["drums", "bass", "synth"],
      trackVolumeControls: true,
      trackPanControls: "balance",
    },
  ],
};

defineTrackswitchDefaultElement();
const player = document.querySelector("trackswitch-player") as HTMLElement & {
  config: TrackSwitchInit;
};
player.config = config;
```

  </div>
  <div class="ts-doc-tabs__panel" data-doc-matrix-panel data-doc-matrix-version="default" data-doc-matrix-integration="react" hidden markdown="1">

```tsx
import { useMemo } from "react";
import type { TrackSwitchInit } from "trackswitch";
import { TrackSwitchPlayer } from "trackswitch/react";

export function ExamplePlayer() {
  const config = useMemo<TrackSwitchInit>(() => {
    return {
      media: {
        drums: { type: "audio", src: "drums.mp3", title: "Drums" },
        bass: { type: "audio", src: "bass.mp3", title: "Bass" },
        synth: { type: "audio", src: "synth.mp3", title: "Synth" },
      },
      views: [
        {
          type: "navigationBar",
          controls: ["playback", "globalVolume", "markerNavigation", "presets", "timer", "seekBar"],
        },
        { type: "waveform", tracks: "audible" },
        {
          type: "trackList",
          tracks: ["drums", "bass", "synth"],
          trackVolumeControls: true,
          trackPanControls: "balance",
        },
      ],
    };
  }, []);

  return <TrackSwitchPlayer config={config} className="trackswitch-host" />;
}
```

  </div>
  <div class="ts-doc-tabs__panel" data-doc-matrix-panel data-doc-matrix-version="default" data-doc-matrix-integration="vue" hidden markdown="1">

```vue
<script setup lang="ts">
import type { TrackSwitchInit } from "trackswitch";
import { TrackSwitchPlayer } from "trackswitch/vue";

const config: TrackSwitchInit = {
  media: {
    drums: { type: "audio", src: "drums.mp3", title: "Drums" },
    bass: { type: "audio", src: "bass.mp3", title: "Bass" },
    synth: { type: "audio", src: "synth.mp3", title: "Synth" },
  },
  views: [
    {
      type: "navigationBar",
      controls: ["playback", "globalVolume", "markerNavigation", "presets", "timer", "seekBar"],
    },
    { type: "waveform", tracks: "audible" },
    {
      type: "trackList",
      tracks: ["drums", "bass", "synth"],
      trackVolumeControls: true,
      trackPanControls: "balance",
    },
  ],
};
</script>

<template>
  <TrackSwitchPlayer :config="config" class="trackswitch-host" />
</template>
```

  </div>
  <div class="ts-doc-tabs__panel" data-doc-matrix-panel data-doc-matrix-version="default" data-doc-matrix-integration="svelte" hidden markdown="1">

```svelte
<script lang="ts">
  import {
    useTrackswitch,
    type TrackswitchSvelteOptions,
  } from "trackswitch/svelte";

  const options: TrackswitchSvelteOptions = {
    config: {
      media: {
        drums: { type: "audio", src: "drums.mp3", title: "Drums" },
        bass: { type: "audio", src: "bass.mp3", title: "Bass" },
        synth: { type: "audio", src: "synth.mp3", title: "Synth" },
      },
      views: [
        {
          type: "navigationBar",
          controls: ["playback", "globalVolume", "markerNavigation", "presets", "timer", "seekBar"],
        },
        { type: "waveform", tracks: "audible" },
        {
          type: "trackList",
          tracks: ["drums", "bass", "synth"],
          trackVolumeControls: true,
          trackPanControls: "balance",
        },
      ],
    },
  };
</script>

<trackswitch-player use:useTrackswitch={options} class="trackswitch-host" />
```

  </div>
  <div class="ts-doc-tabs__panel" data-doc-matrix-panel data-doc-matrix-version="aligned" data-doc-matrix-integration="html" hidden markdown="1">

```html
<script src="dist/js/trackswitch.js"></script>

<trackswitch-player>
  <script type="application/json">
    {
      "media": {
        "score": { "type": "musicxml", "src": "score.musicxml" },
        "notes": { "type": "midi", "src": "notes.mid" },
        "takeA": {
          "type": "audio",
          "src": "take-a.wav",
          "srcTimeScaled": { "src": "take-a-synced.wav" },
          "title": "Take A"
        },
        "takeB": {
          "type": "audio",
          "src": "take-b.wav",
          "srcTimeScaled": { "src": "take-b-synced.wav" },
          "title": "Take B"
        }
      },
      "alignment": {
        "src": "alignment.csv",
        "referenceTimeline": "score",
        "timelines": {
          "score": "measure",
          "notes": "midi_seconds",
          "takeA": "take_a_seconds",
          "takeB": "take_b_seconds"
        },
        "outsideCoverage": "hold"
      },
      "markers": {
        "sections": {
          "type": "segments",
          "src": "sections.csv",
          "timeline": "score",
          "timeCol": "measure",
          "labelCol": "section"
        }
      },
      "views": [
        {
          "type": "navigationBar",
          "controls": ["playback", "globalVolume", "markerNavigation", "looping", "sync", "timer", "seekBar"]
        },
        { "type": "sheetMusic", "mediaID": "score" },
        { "type": "pianoRoll", "mediaID": "notes", "timer": true },
        {
          "type": "waveform",
          "tracks": ["takeA"],
          "timer": true,
          "alignedPlayhead": true,
          "markerLayers": [
            { "sequence": "sections", "color": "#ed8c01" },
            { "sequence": "alignment", "color": "#777", "foldToReference": true }
          ]
        },
        { "type": "waveform", "tracks": ["takeB"], "timer": true },
        { "type": "warpingMatrix", "x": "takeA", "y": "takeB" },
        { "type": "trackList", "tracks": ["takeA", "takeB"], "comparisonGroup": 0 }
      ]
    }
  </script>
</trackswitch-player>
```

  </div>
  <div class="ts-doc-tabs__panel" data-doc-matrix-panel data-doc-matrix-version="aligned" data-doc-matrix-integration="esm" hidden markdown="1">

```ts
import {
  defineTrackswitchDefaultElement,
  type TrackSwitchInit,
} from "trackswitch";

const config: TrackSwitchInit = {
  media: {
    score: { type: "musicxml", src: "score.musicxml" },
    takeA: { type: "audio", src: "take-a.wav", title: "Take A" },
    takeB: { type: "audio", src: "take-b.wav", title: "Take B" },
  },
  alignment: {
    src: "alignment.csv",
    referenceTimeline: "score",
    timelines: {
      score: "measure",
      takeA: "take_a_seconds",
      takeB: "take_b_seconds",
    },
    outsideCoverage: "hold",
  },
  views: [
    {
      type: "navigationBar",
      controls: ["playback", "markerNavigation", "looping", "sync", "timer", "seekBar"],
    },
    { type: "sheetMusic", mediaID: "score" },
    { type: "waveform", tracks: ["takeA"], alignedPlayhead: true },
    { type: "waveform", tracks: ["takeB"], alignedPlayhead: true },
    { type: "warpingMatrix", x: "takeA", y: "takeB" },
    { type: "trackList", tracks: ["takeA", "takeB"], comparisonGroup: 0 },
  ],
};

defineTrackswitchDefaultElement();
const player = document.querySelector("trackswitch-player") as HTMLElement & {
  config: TrackSwitchInit;
};
player.config = config;
```

  </div>
  <div class="ts-doc-tabs__panel" data-doc-matrix-panel data-doc-matrix-version="aligned" data-doc-matrix-integration="react" hidden markdown="1">

```tsx
import { useMemo } from "react";
import type { TrackSwitchInit } from "trackswitch";
import { TrackSwitchPlayer } from "trackswitch/react";

export function AlignedPlayer() {
  const config = useMemo<TrackSwitchInit>(() => ({
    media: {
      score: { type: "musicxml", src: "score.musicxml" },
      takeA: { type: "audio", src: "take-a.wav", title: "Take A" },
      takeB: { type: "audio", src: "take-b.wav", title: "Take B" },
    },
    alignment: {
      src: "alignment.csv",
      referenceTimeline: "score",
      timelines: {
        score: "measure",
        takeA: "take_a_seconds",
        takeB: "take_b_seconds",
      },
    },
    views: [
      {
        type: "navigationBar",
        controls: ["playback", "markerNavigation", "looping", "sync", "timer", "seekBar"],
      },
      { type: "sheetMusic", mediaID: "score" },
      { type: "waveform", tracks: ["takeA"], alignedPlayhead: true },
      { type: "waveform", tracks: ["takeB"], alignedPlayhead: true },
      { type: "trackList", tracks: ["takeA", "takeB"], comparisonGroup: 0 },
    ],
  }), []);

  return <TrackSwitchPlayer config={config} />;
}
```

  </div>
  <div class="ts-doc-tabs__panel" data-doc-matrix-panel data-doc-matrix-version="aligned" data-doc-matrix-integration="vue" hidden markdown="1">

```vue
<script setup lang="ts">
import type { TrackSwitchInit } from "trackswitch";
import { TrackSwitchPlayer } from "trackswitch/vue";

const config: TrackSwitchInit = {
  media: {
    score: { type: "musicxml", src: "score.musicxml" },
    takeA: { type: "audio", src: "take-a.wav", title: "Take A" },
    takeB: { type: "audio", src: "take-b.wav", title: "Take B" },
  },
  alignment: {
    src: "alignment.csv",
    referenceTimeline: "score",
    timelines: {
      score: "measure",
      takeA: "take_a_seconds",
      takeB: "take_b_seconds",
    },
  },
  views: [
    {
      type: "navigationBar",
      controls: ["playback", "markerNavigation", "looping", "sync", "timer", "seekBar"],
    },
    { type: "sheetMusic", mediaID: "score" },
    { type: "waveform", tracks: ["takeA"], alignedPlayhead: true },
    { type: "waveform", tracks: ["takeB"], alignedPlayhead: true },
    { type: "trackList", tracks: ["takeA", "takeB"], comparisonGroup: 0 },
  ],
};
</script>

<template>
  <TrackSwitchPlayer :config="config" />
</template>
```

  </div>
  <div class="ts-doc-tabs__panel" data-doc-matrix-panel data-doc-matrix-version="aligned" data-doc-matrix-integration="svelte" hidden markdown="1">

```svelte
<script lang="ts">
  import { useTrackswitch } from "trackswitch/svelte";
  import type { TrackSwitchInit } from "trackswitch";

  const config: TrackSwitchInit = {
    media: {
      score: { type: "musicxml", src: "score.musicxml" },
      takeA: { type: "audio", src: "take-a.wav", title: "Take A" },
      takeB: { type: "audio", src: "take-b.wav", title: "Take B" },
    },
    alignment: {
      src: "alignment.csv",
      referenceTimeline: "score",
      timelines: {
        score: "measure",
        takeA: "take_a_seconds",
        takeB: "take_b_seconds",
      },
    },
    views: [
      {
        type: "navigationBar",
        controls: ["playback", "markerNavigation", "looping", "sync", "timer", "seekBar"],
      },
      { type: "sheetMusic", mediaID: "score" },
      { type: "waveform", tracks: ["takeA"], alignedPlayhead: true },
      { type: "waveform", tracks: ["takeB"], alignedPlayhead: true },
      { type: "trackList", tracks: ["takeA", "takeB"], comparisonGroup: 0 },
    ],
  };
</script>

<trackswitch-player use:useTrackswitch={{ config }} />
```

  </div>
</div>

## Concepts

The configuration is built from four elementary blocks — media, markers, alignments, and views — which realize three concepts.

**Timelines.** A timeline is an ordered coordinate system for the temporal axis of one medium. Every entry in `media` defines its own timeline, identified by its media ID, and expressed in that medium's [unit](#timeline-units): seconds for audio and MIDI, measures for a score, percent of width for an image. Media whose material occurs at exactly the same coordinates effectively share a timeline, so a player whose tracks are stems of one recording needs no alignment at all.

**Markers.** A marker is a discrete position on one timeline, optionally carrying a label. Markers that belong together — downbeats, measure starts, structural boundaries — form a *marker sequence*, configured as one entry in [`markers`](#markers). A sequence is bound to the timeline its positions are read on, and one timeline may carry any number of sequences. Their order is what previous/next navigation steps along.

**Alignments.** An [`alignment`](#alignment) relates timelines by pairing markers that refer to the same musical position. Each row of the alignment CSV is an *anchor*: one position per timeline column, all naming the same musical moment. Between consecutive anchors the player interpolates linearly, which turns the discrete anchors into a continuous projection between any two timelines. One timeline is designated the reference timeline, and mappings between the others are composed through it.

Two forms of navigation follow from this. *Intra-timeline navigation* steps between consecutive markers of a sequence — the next beat, the next section. *Inter-timeline navigation* projects the current position onto another timeline, so switching between performances, or clicking a measure in a score, keeps the musical position rather than the elapsed time.

**Views.** Views decide what is shown and in which order; they are the presentation layer over the data above, and are listed in [Views](#views).

Audio playback comes in two modes. In *comparative listening* one track sounds at a time and listeners switch between alternatives without interrupting playback — configured with `comparisonGroup` on a [`trackList`](#tracklist). In *simultaneous listening* several tracks sound together, which requires them to share a timeline; media on distinct, aligned timelines can only be compared, unless time-scale-modified renditions are supplied through `srcTimeScaled` and the `sync` control is enabled.

## Configuration shape

The configuration uses these top-level keys:

| Key | Required | Description |
| --- | --- | --- |
| `media` | yes | Contains named audio, MIDI, and MusicXML resources. It must contain at least one audio entry. |
| `views` | yes | Contains visual surfaces in their shown order. It must contain at least one view. |
| `alignment` | no | Contains the anchors relating two or more timelines. |
| `markers` | no | Contains named marker sequences, each read from a CSV file. |
| `presets` | no | Contains named groups of audio tracks. |
| `features` | no | Controls player behavior and user interaction. |
| `css` | no | Overrides [theming tokens](#theming) for the whole player. |
| `$schema` | no | Names the JSON Schema so editors can help. See [IDE Support](#ide-support). |

The player rejects unknown keys.

## Data

Data keys define the player model. Views use the data IDs.

### `media`

`media` maps stable IDs to source entries. Audio entries create playable tracks.

MIDI, MusicXML, and image entries are visual resources. They do not create audio output.

```json
{
  "media": {
    "violin": {
      "type": "audio",
      "src": "violin.mp3",
      "title": "Violin",
      "imageID": "violinFig",
      "solo": true,
      "volume": 0.9,
      "pan": -0.2,
      "startOffsetMs": 100,
      "endOffsetMs": 50
    },
    "notes": { "type": "midi", "src": "notes.mid" },
    "score": { "type": "musicxml", "src": "score.musicxml" },
    "violinFig": { "type": "image", "src": "violin.png" },
    "spectrogram": { "type": "image", "src": "spectrogram.png" }
  }
}
```

Audio media properties:

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `type` | `"audio"` | - | Identifies a playable audio track. |
| `src` | `string` | - | Specifies the audio file URL. |
| `title?` | `string` | media ID | Specifies the name in track lists. |
| `imageID?` | `string` | none | Identifies an `image` media entry shown by `perTrackImage` while this track is soloed. |
| `solo?` | `boolean` | `false` | Specifies the initial active state of the track. |
| `volume?` | `number` | `1` | Specifies the initial track volume. |
| `pan?` | `number` | `0` | Specifies the initial stereo pan. |
| `volumeControl?` | `boolean` | trackList's `trackVolumeControls` | Overrides the owning trackList's volume control visibility for this track only. |
| `panControl?` | `"balance" \| "pan" \| "none"` | trackList's `trackPanControls` | Overrides the owning trackList's pan control visibility (and algorithm) for this track only. |
| `startOffsetMs?` | `number` | `0` | Trims or pads the start. A positive value trims audio. A negative value adds silence. |
| `endOffsetMs?` | `number` | `0` | Trims or pads the end. A positive value trims audio. A negative value adds silence. |
| `srcTimeScaled?` | `object` | none | Specifies optional audio pre-warped onto the reference timeline, played by the `sync` control. |
| `timelineUnit?` | `string` | native unit | Specifies the unit this medium's positions read out in. See [timeline units](#timeline-units). |
| `css?` | `object` | none | Overrides [theming tokens](#theming) for this track's row. |

`srcTimeScaled` identifies a version of the recording that is already warped
onto the reference timeline, which is what the `sync` control plays:

```json
{
  "srcTimeScaled": { "src": "violin-synchronized.wav" }
}
```

`srcTimeScaled` accepts its own `startOffsetMs` and `endOffsetMs`. They apply
only to the synchronized file and do not inherit from the media entry, because a
time-warped rendition carries its silence differently from the original:

```json
{
  "src": "violin.wav",
  "startOffsetMs": 600,
  "endOffsetMs": 300,
  "srcTimeScaled": {
    "src": "violin-synchronized.wav",
    "startOffsetMs": 300,
    "endOffsetMs": 6900
  }
}
```

MIDI, MusicXML, and image entries accept `type`, `src`, and `timelineUnit`:

```json
{
  "media": {
    "notes": { "type": "midi", "src": "notes.mid", "timelineUnit": "ticks" },
    "score": { "type": "musicxml", "src": "score.musicxml" },
    "spectrogram": { "type": "image", "src": "spectrogram.png" }
  }
}
```

An `image` media entry can use its own timeline. Add a column for the image to `alignment.timelines`.

Then add an `image` view that uses the image `mediaID`. The player seeks through the alignment instead of a linear position.

This configuration supports a spectrogram, scanned page, or structure plot with a nonuniform time axis.

### `alignment`

If media do not share one timeline, use `alignment`. The CSV contains corresponding positions from each abstract timeline.

```json
{
  "alignment": {
    "src": "alignment.csv",
    "referenceTimeline": "score",
    "timelines": {
      "score": "measure",
      "notes": "midi_seconds",
      "takeA": "take_a_seconds",
      "takeB": "take_b_samples"
    },
    "outsideCoverage": "hold",
    "duplicateAnchors": "average"
  }
}
```

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `src` | `string` | - | Specifies the CSV file with timing correspondences. |
| `referenceTimeline` | `string` | - | Specifies the timeline for the main timer and shared navigation. |
| `timelines` | `Record<string, string>` | - | Maps each timeline ID to a CSV column name. |
| `outsideCoverage?` | `"hold" \| "extrapolate" \| "error"` | `"error"` | Controls projection outside the CSV coverage. |
| `duplicateAnchors?` | `"first" \| "average" \| "error"` | `"first"` | Controls rows that map to the same timeline position. |

Timeline IDs usually match media IDs. The value of `referenceTimeline` must be a key in `timelines`.

#### Repeated and revisited positions

A column may place the same position on several rows, and it may step backwards.
Both happen when one performance plays a repeat that another one skips: the
performance that plays the passage once sits at the same moment for both passes,
and its column returns to that moment when the repeat begins.

Placements are therefore not required to increase. The player reads each column
as a path through the alignment rather than as a sorted list, and it splits that
path wherever a column steps backwards. Projecting **onto** such a timeline stays
unambiguous — its playhead simply jumps back when the repeat starts. Projecting
**from** it is ambiguous, because one of its positions belongs to two moments
elsewhere, and `duplicateAnchors` decides that case:

- `first` (default) — Uses the earliest matching row, so an ambiguous position
  resolves to the first pass.
- `average` — Blends the matching rows. Useful when duplicates are a quantization
  plateau, such as a measure column that holds a value for several frames, rather
  than a genuine repeat.
- `error` — Rejects a CSV that places a timeline twice at one position. Use it
  while developing a CSV that is meant to be one-to-one.

Only the ambiguous direction is affected; the interpolation on either side of a
repeat is unchanged.

Put a performance that plays every repeat — or an abstract unfolded timeline —
on `referenceTimeline`. The selected audio performance drives playback by
projecting its local clock onto that reference. If it skips an occurrence, the
reference position jumps over that occurrence; if it includes the occurrence,
playback visits it normally.

#### Where the reference stands still

A reference column may hold one value across a stretch of another timeline. A
score ends at its last measure while the recording of it keeps sounding for
several seconds; a measure column that was tracked at a coarse resolution holds
each measure for many audio frames. Over such a stretch the reference position
is a lossy summary — it does not move, even though playback does.

The player therefore carries the position at full resolution on the timeline it
was established on: the playing track's own clock, or the surface a seek landed
on. Every surface is placed from that, projecting between timelines directly, so
a waveform head and a piano roll run smoothly through a stretch the reference
holds. Only the surfaces that genuinely have nothing further to show — the score
cursor, the reference timer and its seek bar — stand still with it.

Arriving from the reference itself has no such position to work from, so it
resolves to the *first* placement of the held value: clicking the last measure of
a score, or a marker on it, seeks to the moment that measure starts sounding, and
playback runs on through the rest of the stretch from there.

#### Timeline units

A timeline belongs to its medium, and so does the meaning of the numbers in its column: `media.timelineUnit` defines it. When the player loads the alignment, it converts the values.

In the example above, `take_b_samples` holds sample indices because the `takeB` media entry declares `"timelineUnit": "samples"`. The converted values use the playback coordinates of the media item, so annotations can use the unit from the source analysis:

| Media type | Native unit | Also accepts | Converted using |
| --- | --- | --- | --- |
| `audio` | `seconds` | `samples` | the sample rate in the file's container header |
| `midi` | `seconds` | `ticks` | the file header, including tempo changes |
| `musicxml` | `measures` | - | - |
| `image` | `percent` (of image width) | `pixels` | the natural width of the decoded image |

If you omit `timelineUnit`, the medium uses the native unit of its type.

A timeline without a media entry has no unit to declare and no conversion to do. Its values stand as they are.

Sample indices refer to the file as it was authored. The rate is read from the container header of the source (WAV, FLAC, Ogg, MP3, MP4/M4A), not from the decoded buffer, whose rate is the audio context's output rate. A `samples` column on a source whose header cannot be read raises an error.

#### Units without an alignment

`timelineUnit` does not need an `alignment` block. Without one every medium shares a single timeline, so the declaration is purely a readout: a surface prints the shared position in the unit of the medium it draws.

```json
{
  "media": {
    "takeA": { "type": "audio", "src": "take-a.wav", "timelineUnit": "samples" },
    "takeB": { "type": "audio", "src": "take-b.wav" }
  }
}
```

The `takeA` waveform reads out in samples of its own file, the `takeB` waveform stays in `HH:MM:SS.mmm`, and the navigation bar timer takes the first medium that declares a unit — `takeA` here.

A declared unit also sets what the zoom spans of a view are written in. `maxZoom` and `defaultZoom` on a `pianoRoll` view are read in the unit of the medium named by its `mediaID`; on a `waveform` view they are read in the unit of the reference timeline. Both fall back to seconds when no unit is declared. A unit that runs at a varying rate against seconds — MIDI ticks under a tempo change, or measures — converts the span at the start of the medium.

See [Timeline Units]({{ '/use-cases/timeline-units/' | relative_url }}) for a worked example.

#### Coverage and playback

Alignment data covers only the span of its CSV rows. `outsideCoverage` controls positions outside this span:

- `hold` — Holds positions at the nearest covered point. The player dims surfaces without data (`ts-out-of-coverage`), and stops playback once the lead track reaches the edge of its alignment coverage, mirroring the clamp applied when a seek starts outside coverage.
- `extrapolate` — Continues the slope of the outermost segment. Each timeline keeps a value, but values outside coverage are extrapolations. The only mode where playback continues into a track's uncovered lead-in or tail.
- `error` — Throws an error for projection outside coverage. Use this value during CSV development.

The **reference timeline** controls the player position, duration, loops, and
navigation. It may be an abstract timeline with no media entry. The selected
audio performance supplies the physical playback clock: its local time is
projected onto the reference after every update.

When media backs the reference timeline, that medium's playable extent defines
the player bounds. Audio start and end offsets therefore affect the reference
duration. An abstract reference instead uses the extent covered by its alignment
CSV column. A trimmed reference is rebased to zero in the player readout; the
removed source-time offset remains relevant only when alignment rows are mapped
onto the cropped audio.

The main timer therefore always shows the reference timeline. With `hold`, a
surface outside alignment coverage stays at its nearest covered position and is
dimmed, and playback stops rather than continuing into that uncovered stretch.

### `markers`

Marker sequences represent independent points or consecutive segments.
Point sequences are for beats, onsets, lyrics, and other positions.
Segment sequences are for sections, chords, and other annotations that remain valid until the next marker.

```json
{
  "markers": {
    "sections": {
      "type": "segments",
      "src": "sections.csv",
      "timeline": "takeA",
      "timeCol": "start",
      "labelCol": "label"
    }
  }
}
```

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `type` | `"points" \| "segments"` | - | Specifies whether each marker is an independent point or begins a segment that ends at the next marker. |
| `colors?` | `Record<string, string>` | none | Maps segment labels to CSS colors. Requires `type: "segments"` and `labelCol`. |
| `src` | `string` | - | Specifies the CSV file with marker data. |
| `timeline?` | `string` | reference timeline | Specifies the timeline for `timeCol`. |
| `timeCol` | `string` | - | Specifies the CSV column with marker positions, in the unit of that timeline. |
| `labelCol?` | `string` | none | Specifies the CSV column with marker labels. |

The player reads `timeCol` values in the [timeline unit](#timeline-units) of their timeline.
The alignment column and the timeline display use the same unit.
A sequence on a timeline with `"timelineUnit": "samples"` uses sample indices.
A sequence on a `musicxml` timeline uses measure numbers.
Without an `alignment` block, the sequence belongs to the single implicit timeline.

For `type: "segments"`, each visible marker begins a half-open segment that ends at the next marker.
The marker label belongs to that segment.
The final visible marker extends to the hidden marker at the end of the timeline.
Marker layers display these segments as labeled, translucent regions.
The boundary markers remain available for seeking, navigation, and loop snapping.
The optional `colors` map assigns a CSS color to each label.
Labels without a map entry use the marker layer color.

Previous and next navigation uses the marker sequences a view currently shows. A sequence becomes a navigation target through a `markerLayers` entry, so a sequence that no view draws is not navigable.

On a waveform with `tracks: "audible"`, the layers follow the audible tracks. Track selection and track-volume changes therefore update the available navigation targets immediately. Layers on a fixed-track waveform, a `pianoRoll` view, or an image keep their markers regardless of solo state.

The jump field searches all annotation sets. Visibility and audible track state do not affect these searches.

Each result identifies the marker sequence, numerical ID, label, and reference-timeline position.

Each set numbers its annotation markers in CSV order, starting at `1`. Each set also contains hidden boundary IDs.

ID `0` sits at the start of the player timeline. ID `N+1` sits at its end, where `N` is the number of annotation markers.

Previous and next navigation can use boundary markers. Marker layers and searchable fields do not show them.

If a set does not have `labelCol`, the marker hover text shows the numerical ID.

#### Editing markers

The `"markerEditing"` navigation bar control lets the listener add, move, relabel, and remove markers by hand.
Its button switches editing on and off. While editing is on, a tool group opens beside it with the sequence that new markers are added to, the add tool, the remove tool, a click toggle, and a CSV download.

- **Add.** With the add tool selected, click or tap a waveform, piano roll, or image view to place a marker. If the sequence has a `labelCol`, a label field opens at that position: Enter confirms, Escape cancels. `M` adds a marker at the current position without interrupting playback. During playback that is the position being heard at the keypress: the marker is set back by the audio output latency the browser reports.
- **Move.** Press and hold a marker, or drag it with the mouse. A magnified window opens over the view, centred on the marker, and horizontal movement moves the marker on a fine scale. Playback pauses for the adjustment and resumes afterwards; the playhead follows the marker and a short snippet of audio (0.3 s) is played from its position.
- **Relabel and remove.** Double-click a marker, or hold it without moving, to open its label field with a remove button. With the remove tool selected, a click or tap on a marker removes it. `Delete` removes the focused marker.
- **Undo.** `Ctrl + Z` undoes the last marker edit.
- **Listen.** The click toggle is on when editing starts. With it on, playback sounds a short click on every marker of the selected sequence, so a marker can be checked against the audio by ear.

A click on a marker still jumps to it, and a right-click drag still sets a loop.
Boundaries of a `segments` sequence cannot be moved past their neighbours.

A marker CSV may consist of a header row only, which gives an empty sequence to fill by hand.
The download writes the sequence in the column layout of its CSV, with positions in the unit of its timeline. Untouched rows keep their original values, including columns the player does not read.
After an edit, the markers of a sequence are numbered again in timeline order.

The same edits are available from code: `addMarker`, `updateMarker`, `removeMarker`, and `getMarkersCsv` on the controller, and the `markers` event (`trackswitch-markers` on the element), which reports the ID of the edited sequence.

Views show marker sequences through `markerLayers`:

```json
{
  "type": "waveform",
  "tracks": ["takeA"],
  "markerLayers": [
    { "sequence": "sections", "color": "#ed8c01", "line": "dashed", "lineWidth": 2 },
    { "sequence": "alignment", "color": "#777", "foldToReference": true }
  ]
}
```

`sequence` identifies a marker sequence. The special `alignment` sequence exists only with an `alignment` block.

`foldToReference` draws connectors between the current view timeline and the reference timeline. These connectors show warping points.

Marker layer properties:

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `sequence` | `string` | - | Specifies a marker sequence ID or the implicit `alignment` anchors. |
| `color?` | `string` | current color | Specifies the marker color. |
| `line?` | `"solid" \| "dashed"` | `"dashed"` | Specifies the marker line style. |
| `lineWidth?` | `number` | `1` | Specifies the marker line width in CSS pixels. |
| `opacity?` | `number` | `--ts-marker-opacity` | Specifies the resting opacity from `0` to `1`. |
| `foldToReference?` | `boolean` | `false` | Shows connectors from the timeline to the reference where applicable. |

### `presets`

Presets define named track groups. They support selection of a full mix, instrument family, or analysis condition.

```json
{
  "presets": {
    "all": { "label": "All tracks", "tracks": ["violin", "bass", "drums"] },
    "rhythm": { "label": "Rhythm", "tracks": ["bass", "drums"] }
  }
}
```

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `label?` | `string` | preset ID | Specifies the name in the user interface. |
| `tracks` | `string[]` | - | Specifies the audio media IDs in the preset. |

A preset that names several tracks of one `comparisonGroup` narrows it to the first of
them, because such a selection plays one track at a time. With an `alignment` block that applies to
the whole player, so a preset resolves to a single selected timeline — one track, or the
tracks it names within one non-exclusive list.

## Views

The player shows views in declaration order. Each view has a `type`. Most views accept an optional `css` block of [theming tokens](#theming).

The `image`, `perTrackImage`, `waveform`, and `pianoRoll` views can provide seekable surfaces. They accept `markerLayers`.

The two image views also accept `seekMarginLeft` and `seekMarginRight`, because a supplied picture can carry axes or whitespace around its plot area. The player draws waveforms and piano rolls itself, so those surfaces always span their full width.

### `image`

An `image` view shows one static image, such as cover art, a diagram, or a time-aligned illustration.

Every image is a media entry, so the view names one with `mediaID`:

```json
{
  "type": "image",
  "mediaID": "cover",
  "seekable": true,
  "seekMarginLeft": 3,
  "seekMarginRight": 3,
  "markerLayers": [{ "sequence": "sections", "line": "solid" }]
}
```

If the entry has a column in `alignment.timelines`, the player projects its playhead, seek positions, and marker layers.

Thus, an image with a nonuniform time axis can align with other media:

```json
{ "type": "image", "mediaID": "spectrogram", "seekable": true }
```

Without such a column, the image maps linearly onto the reference timeline.

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `mediaID` | `string` | - | Identifies an `image` media entry. |
| `seekable?` | `boolean` | `false` | Lets the user click or drag the image to seek. |
| `seekMarginLeft?` | `number` | `0` | Specifies the non-seekable left margin as a percentage. |
| `seekMarginRight?` | `number` | `0` | Specifies the non-seekable right margin as a percentage. |
| `markerLayers?` | `MarkerLayerConfig[]` | none | Specifies marker layers on the seek surface. |
| `css?` | `object` | none | Overrides [theming tokens](#theming) for this view. |

### `perTrackImage`

A `perTrackImage` view shows the `imageID` media entry of the active audio track. It supports players with exclusive solo.

Because that entry is a medium, it carries its own alignment column. The surface adopts the column of whichever track is soloed, so a per-stem spectrogram seeks and folds markers on its own time axis.

```json
{
  "type": "perTrackImage",
  "seekable": true,
  "markerLayers": [{ "sequence": "sections" }]
}
```

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `seekable?` | `boolean` | `false` | Lets the user click or drag the current track image to seek. |
| `seekMarginLeft?` | `number` | `0` | Specifies the non-seekable left margin as a percentage. |
| `seekMarginRight?` | `number` | `0` | Specifies the non-seekable right margin as a percentage. |
| `markerLayers?` | `MarkerLayerConfig[]` | none | Specifies marker layers on the seek surface. |
| `css?` | `object` | none | Overrides [theming tokens](#theming) for this view. |

### `waveform`

A `waveform` view shows an interactive waveform. In a standard multitrack player, it can represent all audible tracks.

In an aligned player, a fixed-track waveform uses the local timeline of that track.

```json
{
  "type": "waveform",
  "tracks": ["takeA"],
  "height": 120,
  "waveformBarWidth": 1,
  "maxZoom": 5,
  "defaultZoom": 30,
  "playbackFollowMode": "center",
  "timeAxis": "individual",
  "timer": true,
  "alignedPlayhead": true,
  "markerLayers": [{ "sequence": "sections", "color": "#ed8c01" }]
}
```

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `tracks?` | `"audible" \| string[]` | `"audible"` | Selects the audio tracks for the waveform. |
| `height?` | `number` | `150` | Specifies the waveform height in pixels. |
| `waveformBarWidth?` | `number` | `1` | Specifies the thickness of waveform bars. |
| `maxZoom?` | `number` | `5` | Specifies the smallest visible interval. A smaller value permits more zoom, and `0` lifts the zoom limit. |
| `defaultZoom?` | `number` | none | Specifies the visible interval the view opens on. Unset shows the whole timeline. |
| `playbackFollowMode?` | `"off" \| "center" \| "jump"` | `"center"` | Controls how the view moves with playback. |
| `timeAxis?` | `"shared" \| "individual"` | `"shared"` (`"individual"` for `tracks: "audible"` under `alignment`) | Selects a shared longest-track duration or the duration of each fixed track. |
| `timer?` | `boolean` | `false` (`true` under `alignment`) | Shows a local timer in the waveform. Each aligned waveform runs on its own timeline, so it carries a timer unless you set this to `false`. |
| `alignedPlayhead?` | `boolean` | `false` | Shows geometry from the reference playhead to the local playhead. |
| `markerLayers?` | `MarkerLayerConfig[]` | none | Specifies marker layers on the waveform. |
| `css?` | `object` | none | Overrides [theming tokens](#theming) for this view. |

If `alignment` exists, specify `tracks`. Its value must be `"audible"` or an array with one track ID.

If all audio uses one timeline, a fixed waveform can contain multiple tracks. Alignment also enables exclusive solo.

Thus, exactly one track is audible. The `"audible"` value follows the solo track.

The waveform shows the unwarped local shape, playhead, and markers of that track. It also supports `alignedPlayhead` and `timeAxis: "individual"`.

For an aligned `"audible"` waveform, `timeAxis` defaults to `"individual"`. This default shows the pace of the current track.

The current track can change with the solo state. Fixed sources use `"shared"` by default.

Set `timeAxis` explicitly to replace either default. This property changes the meaning of distances between playheads in different waveform views:

- **`shared`** — Each waveform uses the duration of the longest track. A gap between playheads shows the absolute time difference between performances.
- **`individual`** — Each waveform uses its own total duration from 0% to 100%. A playhead shows progress through that recording.

In `individual` mode, different performance pacing produces different playhead positions for the same musical content. This difference is not a musical misalignment.

Only the start and end of the work always align. Neither mode warps waveform peaks to a shared reference axis.

Both modes show the natural recorded waveform of each track. In `shared` mode, shading covers the region after a shorter track ends.

The waveform and the zoom overview both show this shading.

### `pianoRoll`

A `pianoRoll` view shows a MIDI file as a piano roll. MIDI files do not create audio output.

```json
{
  "type": "pianoRoll",
  "mediaID": "notes",
  "height": 180,
  "maxZoom": 5,
  "defaultZoom": 30,
  "playbackFollowMode": "center",
  "timer": true
}
```

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `mediaID` | `string` | - | Identifies a `media` entry with `type: "midi"`. |
| `height?` | `number` | `180` | Specifies the piano-roll height in pixels. |
| `maxZoom?` | `number` | `5` | Specifies the smallest visible interval, where `0` lifts the zoom limit. |
| `defaultZoom?` | `number` | none (`10` seconds with `pianoKeyboard`) | Specifies the visible interval the view opens on. Unset shows the whole file. |
| `playbackFollowMode?` | `"off" \| "center" \| "jump"` | `"center"` | Controls how the piano roll moves with playback. Ignored while `pianoKeyboard` is on — see there. |
| `timer?` | `boolean` | `false` | Shows a local timer in the piano roll. |
| `pianoKeyboard?` | `boolean` | `false` | Draws a piano keyboard beside the pitch axis and pins the playhead to its edge. Forces a pinned-left follow that overrides `playbackFollowMode`, and changes the note grid's drag gesture to pan the sheet under the pointer instead of jumping to the click. |
| `noteRange?` | `"automatic" \| [note, note]` | `"automatic"` | Fixes the pitch axis. Each entry is a note name or a MIDI note number. |
| `grid?` | `"none" \| "time" \| "pitch" \| "both"` | `"none"` | Draws reference lines behind the notes: a time grid, a pitch grid, or both. |
| `noteTooltip?` | `boolean` | `false` | Shows the pitch, channel, start, end, duration and velocity of the note event under the cursor. |
| `velocityBars?` | `boolean` | `false` | Draws a bar inside each note event showing its velocity. |
| `velocityOpacity?` | `boolean` | `false` | Fades note events by their velocity instead of drawing them solid. |
| `channelToTrackIDMap?` | `object` | none | Pairs MIDI channels with audio tracks, keyed by channel number. |
| `colorPerChannel?` | `boolean` | `true` | Gives every channel in the file its own palette colour. |
| `palette?` | `"light" \| "dark" \| "colorblind-light" \| "colorblind-dark"` | `"light"` | Selects the channel colour set and background. |
| `markerLayers?` | `MarkerLayerConfig[]` | none | Specifies marker layers on the piano roll. |
| `css?` | `object` | none | Overrides [theming tokens](#theming) for this view. |

`mediaID` must identify a `media` entry with `type: "midi"`.

If `alignment.timelines` contains the same ID, the piano roll uses its local timeline for seeking, playback movement, loops, and markers.

#### Grid and note readout

A time grid draws its lines on round values of the unit the medium declares in `timelineUnit`, so a MIDI entry declaring `"ticks"` gets a grid on beats rather than on seconds — one that stays with the music through a tempo change. The interval steps up and down as the view is zoomed, keeping the lines readably far apart.

A pitch grid bands the rows of the black keys, which is the same reading the `pianoKeyboard` column gives — dark rows for the black keys against light ones for the white keys, in every palette. It needs a few pixels per semitone, so a short roll spanning a wide `noteRange` draws no pitch grid.

`noteTooltip` reads out the note event under the cursor — its pitch, channel, start, end, duration and velocity — with the times in the same unit as the view's `timer` and the velocity as the 0–127 value the file was written with.

#### Channels

A file that transcribes several instruments carries one channel per instrument. With `colorPerChannel` at its default of `true`, every channel already takes its own colour — a single combined recording gets a legible piano roll with no further configuration.

`channelToTrackIDMap` additionally pairs channels with the audio tracks of the player, so a channel is drawn only while one of its tracks is audible:

```json
{
  "type": "pianoRoll",
  "mediaID": "notes",
  "channelToTrackIDMap": { "0": "soprano", "1": "alto", "2": "tenor", "3": "bass" }
}
```

Each key is a channel number from 0 to 15, and each value names a `media` entry with `type: "audio"`, or an array of several. Two channels may name the same track — the track's row then splits its colour across both, with a hard edge, instead of picking just one.

A value can also be a list of tracks, which keeps the channel visible while any one of them is audible. This suits a channel that belongs to a `comparisonGroup` of alternate takes — one mixed recording, say, standing in for four solo tracks that are never audible at the same time:

```json
{
  "type": "pianoRoll",
  "mediaID": "notes",
  "channelToTrackIDMap": {
    "0": ["soprano", "mix"],
    "1": ["alto", "mix"],
    "2": ["tenor", "mix"],
    "3": ["bass", "mix"]
  }
}
```

A paired channel is drawn only while one of its tracks is audible, following the same rule as a waveform with `"tracks": "audible"`. A channel the map leaves out is always drawn, still in its own colour by default. Set `colorPerChannel` to `false` to turn off per-channel colour entirely — every channel then falls back to the plain, unpaired colour, whether or not it's in the map.

Coloured channels take the colours `--ts-color-channel-1` to `--ts-color-channel-16` by ascending channel number — one per MIDI channel, so a 16-channel file never repeats a colour. The first colour is the accent, so a file with a single channel looks like it did before this view had a palette at all.

#### Palette

`palette` picks the channel colour set and the surface behind it:

```json
{
  "type": "pianoRoll",
  "mediaID": "notes",
  "palette": "dark"
}
```

- `"light"` (default) — the colours above on the light `--ts-color-surface-base` background.
- `"dark"` — the same 16 channels re-tuned for contrast against a dark `--ts-color-surface-base-dark` background, including the piano keyboard column.
- `"colorblind-light"` — an alternate, colorblind-friendly hue set (derived from the Okabe-Ito palette) on the light background. Channels 1-8 take the eight base hues; 9-16 repeat them as a lighter tint, so every channel still reads as one of the eight.
- `"colorblind-dark"` — the same colorblind-friendly hues re-tuned for the dark background.

Any of these can still be overridden per view with `css`, for an individual channel or the background. A channel's fill and border are separate tokens from its solid colour, so recolouring one fully means setting all three (with the matching `-dark`/`-colorblind`/`-colorblind-dark` suffix):

```json
{
  "type": "pianoRoll",
  "mediaID": "notes",
  "palette": "dark",
  "css": {
    "--ts-color-channel-3-dark": "#00ffaa",
    "--ts-color-channel-3-dark-soft-30": "rgba(0, 255, 170, 0.25)",
    "--ts-color-channel-3-dark-soft-55": "rgba(0, 255, 170, 0.55)"
  }
}
```

The background is `--ts-color-surface-base` (light) or `--ts-color-surface-base-dark` (dark).

#### Pitch axis

With `noteRange` at its default of `"automatic"`, the pitch axis spans every note of the file, hidden channels included, so switching a track off never rescales the roll. A pair fixes it instead. Each entry is a MIDI note number or a name in scientific pitch notation, where middle C is `C4` = 60, so these two are the same axis:

```json
{ "type": "pianoRoll", "mediaID": "notes", "noteRange": ["C1", "C4"] }
{ "type": "pianoRoll", "mediaID": "notes", "noteRange": [24, 60] }
```

#### Piano keyboard

`pianoKeyboard` draws a keyboard column beside the pitch axis and turns the roll into a falling-notes display. Its far edge is a real keyboard — seven white keys per octave, with the black keys stopping short of it — while its near edge carries one row per semitone, the grid the roll itself draws on, so a note bar meets its own key. Every C carries a gray label.

A sounding note lights its key in the colour of its channel. Two channels holding one pitch split that key along its length, one box each.

The keyboard changes how the roll follows playback and how its note grid drags, on top of a `defaultZoom` default that can be set on its own:

- Playback follow switches to holding the playhead against the left edge of the surface — the near edge of the keys — rather than whatever `playbackFollowMode` says; that option is ignored while the keyboard is on. The surface carries one viewport of empty space past the end of the medium, so the playhead stays pinned through the final note. This pinned-left follow is not itself configurable — it is exclusive to a keyboard-enabled piano roll and switches on automatically with it.
- Dragging the note grid pans the sheet directly under the pointer instead of jumping to the click, as if pulling the paper: the notes track the drag, and playback position pans along with them.
- `defaultZoom` becomes 10 seconds, so the view opens on a phrase rather than on the whole file.

#### Velocity

Note events are drawn solid. Velocity is opt-in, through two switches that work independently: `velocityBars` draws a small bar inside each note event, and `velocityOpacity` fades the note by its velocity.

Because solid notes cannot be told apart by transparency, a pitch several channels sound at the same time is drawn as a checkerboard over the stretch they share: one row per channel, with the colours rotating by one row from column to column.

A second note-on for a pitch already sounding on the same channel is read as a re-trigger — the note that was running ends there, instead of the two overlapping on one row.

See [Piano Roll]({{ '/use-cases/multi-instrument-transcription/' | relative_url }}) for a complete player.

### `sheetMusic`

A `sheetMusic` view shows a MusicXML score.

```json
{
  "type": "sheetMusic",
  "mediaID": "score",
  "maxWidth": 1000,
  "maxHeight": 370,
  "renderScale": 0.7,
  "followPlayback": true,
  "cursorColor": "#999999",
  "cursorAlpha": 0.4
}
```

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `mediaID` | `string` | - | Identifies a `media` entry with `type: "musicxml"`. |
| `maxWidth?` | `number` | `1000` | Specifies the maximum score width in pixels. |
| `maxHeight?` | `number` | `380` | Specifies the maximum score height in pixels. |
| `renderScale?` | `number` | `0.7` | Specifies the scale for the score renderer. |
| `followPlayback?` | `boolean` | `true` | Moves the score view with playback. |
| `cursorColor?` | `string` | `"#999999"` | Specifies the playback cursor color. |
| `cursorAlpha?` | `number` | `0.4` | Specifies playback cursor opacity from `0` to `1`. |
| `css?` | `object` | none | Overrides [theming tokens](#theming) for this view. |

`mediaID` must identify a `media` entry with `type: "musicxml"`.

If `alignment.timelines` contains this ID, playback follow and measure seeking use the aligned timeline.

#### Measure numbers

A `measures` column refers to the measure numbers **printed on the score**, that is, the `number` attribute of each `<measure>` in the MusicXML.

An excerpt therefore keeps the numbering of the edition it comes from. If a score starts at bar 231, its alignment CSV starts at 231 as well, and no renumbering to 1 is needed.

The score timeline covers the range of printed numbers. Clicks and cursor positions report them.

### `warpingMatrix`

A `warpingMatrix` view shows the relationship between two aligned timelines.

```json
{
  "type": "warpingMatrix",
  "x": "takeA",
  "y": "takeB",
  "height": 220,
  "tempoSmoothingSeconds": 5
}
```

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `x` | `string` | - | Specifies the audio timeline for the horizontal axis. |
| `y` | `string` | - | Specifies the audio timeline for the vertical axis. |
| `height?` | `number` | auto | Specifies the chart height in pixels. |
| `tempoSmoothingSeconds?` | `number` | none | Specifies the smoothing window for local tempo differences. |
| `css?` | `object` | none | Overrides [theming tokens](#theming) for this view. |

`x` and `y` must identify timelines in `alignment.timelines`.

### `text`

A `text` view adds a plain-text section.

```json
{
  "type": "text",
  "text": "Compare the two performances",
  "bold": true,
  "italic": false,
  "fontSize": 18,
  "align": "center"
}
```

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `text` | `string` | - | Specifies the text to show. |
| `bold?` | `boolean` | `false` | Shows the text in bold. |
| `italic?` | `boolean` | `false` | Shows the text in italic. |
| `fontSize?` | `number` | inherited | Specifies the font size in pixels. |
| `align?` | `"left" \| "center" \| "right"` | `"center"` | Specifies the horizontal text alignment. |
| `css?` | `object` | none | Overrides [theming tokens](#theming) for this view. |

The view treats the value as plain text, not HTML.

### `separator`

A `separator` view draws a horizontal rule between panels.

```json
{
  "type": "separator",
  "thickness": 4
}
```

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `thickness?` | `number` | `2` | Specifies the rule thickness in pixels. |

The rule replaces the 1px hairline the player draws between panels, so a
`separator` never doubles up with it. It is not reorderable, even when
`customizablePanelOrder` is on.

### `trackList`

A `trackList` view shows audio tracks and their controls.

```json
{
  "type": "trackList",
  "tracks": ["takeA", "takeB"],
  "comparisonGroup": 0,
  "rowHeight": 52,
  "trackVolumeControls": true,
  "trackPanControls": "balance"
}
```

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `tracks` | `string[]` | - | Specifies the audio media IDs in this list. |
| `title?` | `string` | - | Labels the list. An aligned player shows it on the row that selects the list as a whole. |
| `comparisonGroup?` | `number` | none | Names the selection this list belongs to, which permits only one active track at a time. Lists sharing a number share one selection. Use it to compare performances or stems. |
| `rowHeight?` | `number` | auto | Fixes the track-row height in pixels. Padding, control size, icon size, font size and slider size scale down with it, so values below the default row height produce compact rows. |
| `trackVolumeControls?` | `boolean` | `false` | Shows a volume control for each track. |
| `trackPanControls?` | `"balance" \| "pan" \| "none"` | `"none"` | Shows a left-right pan control for each track and selects its algorithm. |
| `channelColorIcons?` | `boolean` | `true` | Repeats a track's piano-roll channel colour(s) on its `solo` icon. Set to `false` to keep every row's icon in the plain foreground colour regardless of channel pairing. |

`tracks` contains audio media IDs. Every track in `media` must appear in some `trackList` view.
Multiple `trackList` views can show separate track groups in different layout positions.

`comparisonGroup` turns the list's rows into radio buttons: activating one deactivates the
others, and the list always keeps one track active. Its value is any non-negative integer, and
it names the selection the list belongs to. A player can therefore combine a comparison group
with an ordinary mixer group — a list without a `comparisonGroup` mixes its tracks freely — and give
each comparison group a number of its own:

```json
"views": [
  { "type": "trackList", "tracks": ["sopranoFlute", "sopranoOboe"], "comparisonGroup": 0 },
  { "type": "trackList", "tracks": ["altoFlute", "altoOboe"], "comparisonGroup": 1 }
]
```

Lists that name the *same* number share one selection: picking a track in either of them
deselects whatever the other had, so several lists act as one set of radio buttons. That is how
a player splits one comparison into separate lists — with a `separator`, a `text` caption, or
another view between them — without splitting the choice. Such a set opens with one audible
track between all of its lists.

An `alignment` block changes what the setting means. Alignment places each timeline at its own
audible position, so tracks of two timelines sounding together would sit at different moments
of the piece. The player therefore selects one timeline at a time, across all lists, and each
list decides what it contributes to that choice:

- With a `comparisonGroup` — every row of the list is a selectable timeline of its own.
- Without one — the list *is* one timeline, and its rows mix freely inside it. The
  list gets an extra row above its tracks that selects it as a whole, and its rows become a
  second level of the choice, where the last remaining active track stays active.

Because that selection already spans the whole player, an aligned player has at most one
`comparisonGroup` number to share; a second one would be the same selection under another name, and
the player rejects it.

Omitting `comparisonGroup` under alignment therefore claims that the list's tracks are one
recording taken apart, such as separated stems. The player checks that claim: all of them must
name the same `alignment.timelines` column, declare the same `timelineUnit`, and carry the same
`startOffsetMs` and `endOffsetMs`. See the
[Separated Stems]({{ '/use-cases/separated-stems/' | relative_url }}) use case.

Sync mode is what makes different timelines audible together: it runs the time-stretched
sources on a shared clock, and while it is on, all lists play simultaneously regardless of
`comparisonGroup`.

A track's pan control snaps to dead center (50/50) and only moves freely once dragged past a 35/65 split, so a near-center release always lands exactly on 50/50.

Each view controls the visibility of its volume and pan controls. `trackPanControls` also selects the pan algorithm:

- `"balance"` (default) — Controls the gain of each stereo channel separately. At hard left, only the original left channel remains audible.
- `"pan"` — Uses the equal-power pan law of the Web Audio API `StereoPannerNode`.

For a stereo source, `"pan"` blends the channels as the value moves from the center. At hard left, both channels enter the left output.

This behavior is standard for mono content in a stereo field. A true stereo recording usually requires `"balance"`.

A track's own `volumeControl` and `panControl` (on its `media` entry) override these per track,
so a single trackList can show mix controls on some tracks and not others without splitting into
multiple lists.

### `navigationBar`

A `navigationBar` view shows playback and navigation controls for the player.

```json
{
  "type": "navigationBar",
  "controls": [
    "playback",
    "globalVolume",
    "globalPan",
    "markerNavigation",
    "looping",
    "sync",
    "presets",
    "timer",
    "seekBar"
  ],
  "repeatEnabled": false,
  "globalPanControl": "balance"
}
```

The player shows controls in the specified order. If synchronized sources are available, it shows `sync`.

If at least two presets exist, it shows `presets`.

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `controls` | `TrackSwitchNavigationBarControl[]` | - | Specifies the required control list in order. See the supported values after this table. |
| `repeatEnabled?` | `boolean` | `false` | Enables repeat at player startup. |
| `globalPanControl?` | `"balance" \| "pan"` | `"balance"` | Selects the pan algorithm for the global pan control shown by `"globalPan"`. See [`trackPanControls`](#tracklist) for the algorithm behaviors. |

`controls` supports `"playback"`, `"globalVolume"`, `"globalPan"`, `"markerNavigation"`, `"markerEditing"`, `"looping"`, `"sync"`, `"presets"`, `"timer"`, and `"seekBar"`.

`"globalPan"` shows a left-right pan control that adjusts every track together, styled like a track's own pan control. It snaps to dead center the same way per-track pan controls do.

## Features

`features` controls optional behavior for the complete player. Each view contains its own view-specific properties.

An omitted feature uses the default value in the table.

```json
{
  "features": {
    "muteOtherPlayerInstances": true,
    "customizablePanelOrder": false,
    "tabView": false,
    "keyboard": true,
    "normalizeLoudness": false,
    "autoload": false
  }
}
```

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `muteOtherPlayerInstances?` | `boolean` | `true` | When this player starts, it stops other TrackSwitch players on the page. |
| `customizablePanelOrder?` | `boolean` | `false` | Lets users change the order of visible view panels. It does not change track order. |
| `tabView?` | `boolean` | `false` | Shows track rows as tabs. |
| `keyboard?` | `boolean` | `true` | Enables keyboard shortcuts. |
| `normalizeLoudness?` | `boolean` | `false` | Normalizes each track to -14 LUFS integrated loudness at load time, clamped so it never clips. |
| `autoload?` | `boolean` | `false` | Decodes the audio and renders the waveforms as soon as the player is created, instead of waiting for the first click or keypress. This doesn't start playback — browsers only gate producing sound behind a user gesture, not decoding — so it needs no interaction, but it does spend bandwidth and CPU on every visitor whether or not they press play. |

The player rejects unknown feature keys.

Solo behavior is not a feature: each `trackList` view decides on its own whether only one of
its tracks may sound, and an `alignment` block makes the whole player resolve to a single
audible timeline. See `comparisonGroup` in the `trackList` section.

## Theming

The player draws its colors and dimensions from CSS custom properties. A `css` block overrides
them. At the top level it applies to the whole player:

```json
{
  "css": {
    "--ts-color-accent": "#00a0ff",
    "--ts-track-min-height": "40px"
  },
  "media": { "…": "…" },
  "views": ["…"]
}
```

Most views and every audio media entry accept the same block. Because custom properties inherit,
a block on a view reaches everything that view draws and nothing outside it — so an accent color
set on one `waveform` recolors that waveform alone:

```json
{ "type": "waveform", "tracks": "audible", "css": { "--ts-color-accent": "#8c54ff" } }
```

A `css` block always wins over the stylesheet, including the responsive rules that adjust sizing
on narrow screens. The player rejects a token name it does not know, so a typo fails at load
rather than silently doing nothing.

{% include css-tokens.md %}

## IDE Support

The player configuration has a published JSON Schema. Naming it in a config file gives editors
that understand JSON Schema — VS Code and the JetBrains IDEs among them — completion, inline
documentation and validation while writing:

```json
{
  "$schema": "https://audiolabs.github.io/trackswitch.js/schema/trackswitch.schema.json",
  "media": { "…": "…" },
  "views": ["…"]
}
```

Completion narrows as the config takes shape: once a view declares `"type": "waveform"`, only the
waveform view's options are offered, and a `css` block completes the theming tokens above with
their default values.

The player ignores `$schema`; it is only there for the editor.

This works for a config in its own file, loaded through the `config-src` attribute. An editor
cannot attach a schema to JSON embedded in an inline `<script type="application/json">` element,
so a separate config file is the better choice while a player is being written.

## Keyboard and loop controls

If `features.keyboard` is `true`, use these shortcuts:

| Keys | Action |
| --- | --- |
| `F1` | Open or close the keyboard-shortcut panel. |
| `Space` | Play or pause. |
| `Escape` | Stop and return to the start. |
| `R` | Toggle repeat. |
| `Left` / `Right` | Move backward or forward by 2 seconds. |
| `Shift + Left` / `Shift + Right` | Move backward or forward by 5 seconds. |
| `Home` | Go to the start. |
| `Up` / `Down` | If `controls` contains `"globalVolume"`, change the global volume. |
| `1` to `0` | Control tracks 1 to 10. |

If `controls` contains `"looping"`, use these additional shortcuts:

| Keys | Action |
| --- | --- |
| `A` | Set loop point A. |
| `B` | Set loop point B. |
| `L` | Turn the loop on or off. |
| `C` | Clear the loop. |

The loop buttons also control loops. On a seekable control, right-click to add a loop region.

These shortcuts step through the markers and are always available. The start and the end of the timeline count as stops, so they also work without any marker sequence:

| Keys | Action |
| --- | --- |
| `,` | Jump to the previous marker, or to the start. |
| `.` | Jump to the next marker, or to the end. |

If `controls` contains `"markerEditing"`, these shortcuts apply while marker editing is on:

| Keys | Action |
| --- | --- |
| `M` | Add a marker at the current position. |
| `Delete` | Remove the focused marker. |
| `Ctrl + Z` | Undo the last marker edit. |

## Configuration requirements

- `media` must contain at least one audio entry.
- `views` must contain at least one view.
- `views` can contain a maximum of one `navigationBar`.
- Every ID referenced by `trackList`, `waveform.tracks`, presets, or view `mediaID`
  must exist in `media`.
- `alignment.referenceTimeline` must be one of the keys in `alignment.timelines`.
- Timeline IDs used by marker sequences, piano roll views, and sheet music views must match IDs in `alignment.timelines`.
- Timeline IDs used by warping matrices must match IDs in `alignment.timelines`, and `x` and `y` must differ.
- Seekable `image` and `perTrackImage` views need `seekMarginLeft + seekMarginRight` below `100`.
- If one track is active at a time (a `trackList` with a `comparisonGroup`), use `perTrackImage`.
- `warpingMatrix` requires an `alignment` block.
- Every track in `media` must appear in some `trackList` view.
- `comparisonGroup` must be a non-negative integer.
- With an `alignment` block, a `trackList` without a `comparisonGroup` needs all of its tracks on one
  timeline: the same `alignment.timelines` column, the same `timelineUnit`, and the same
  `startOffsetMs` and `endOffsetMs`. Aligned players accept at most one `comparisonGroup` number.
- `perTrackImage` requires every `trackList` view to declare the same `comparisonGroup`.

The player rejects unknown keys *and* unknown values. A property that takes a fixed set of
values, such as `playbackFollowMode` or `align`, rejects anything outside that set instead of
falling back to its default, so a typo surfaces as an error rather than as unexpected behavior.
The same applies to numbers outside their valid range and to non-boolean values on boolean
properties.
