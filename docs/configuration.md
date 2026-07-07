---
layout: default
title: Documentation
permalink: /documentation.html
---

- [Player Versions](#player-versions)
- [Quick Minimal Setup](#quick-setup)
- [Full Options Reference](#full-options-reference)
- [Configuration](#player-wide-settings)
  - [`ui`](#ui)
  - [`presetNames`](#presetnames)
  - [`features`](#features)
  - [`alignment`](#alignment)
- [Track Settings](#track-settings)
  - [`trackGroup`](#trackgroup)
  - [Track Options](#track-options)
  - [Audio Source Options](#audio-source-options)
  - [Track Alignment Options](#track-alignment-options)
- [Visualizations](#visualizations)
  - [`text`](#text)
  - [`image`](#image)
  - [`perTrackImage`](#pertrackimage)
  - [`waveform`](#waveform)
  - [`midi`](#midi)
  - [`sheetMusic`](#sheetmusic)
  - [`warpingMatrix`](#warpingmatrix)
- [Keyboard and Loop Controls](#keyboard-and-loop-controls)
- [Things to Check](#things-to-check)

## Player Versions {#player-versions}

trackswitch.js ships one browser-ready JavaScript bundle for all player versions. The interactive sync player also needs the separate worker file.

| Version | Custom HTML tag |
| --- | --- |
| Default player | `<trackswitch-player>` |
| Sync player | `<trackswitch-sync-player>` |
| Interactive sync player | `<trackswitch-sync-interactive>` |

## Quick Minimal Setup {#quick-setup}

<div class="ts-doc-tabs" data-doc-matrix data-doc-matrix-version="default" data-doc-matrix-integration="html" markdown="1">
  <div class="ts-doc-tabs__list ts-doc-tabs__list--versions ts-doc-tabs__list--stacked" aria-label="Player version">
    <button class="ts-doc-tabs__tab is-active" type="button" aria-pressed="true" data-doc-matrix-control="version" data-doc-matrix-value="default">Default</button>
    <button class="ts-doc-tabs__tab" type="button" aria-pressed="false" data-doc-matrix-control="version" data-doc-matrix-value="sync">Sync</button>
    <button class="ts-doc-tabs__tab" type="button" aria-pressed="false" data-doc-matrix-control="version" data-doc-matrix-value="interactive">Interactive Sync</button>
  </div>
  <div class="ts-doc-tabs__list" aria-label="Integration method">
    <button class="ts-doc-tabs__tab is-active" type="button" aria-pressed="true" data-doc-matrix-control="integration" data-doc-matrix-value="html">HTML</button>
    <button class="ts-doc-tabs__tab" type="button" aria-pressed="false" data-doc-matrix-control="integration" data-doc-matrix-value="esm">ESM</button>
    <button class="ts-doc-tabs__tab" type="button" aria-pressed="false" data-doc-matrix-control="integration" data-doc-matrix-value="react">React</button>
    <button class="ts-doc-tabs__tab" type="button" aria-pressed="false" data-doc-matrix-control="integration" data-doc-matrix-value="vue">Vue</button>
  </div>
  <div class="ts-doc-tabs__panel is-active" data-doc-matrix-panel data-doc-matrix-version="default" data-doc-matrix-integration="html" markdown="1">

```html
<script src="dist/js/trackswitch.js"></script>

<trackswitch-player>
  <script type="application/json">
    {
      "ui": [
        {
          "type": "trackGroup",
          "trackGroup": [
            {
              "title": "Track 1",
              "sources": [{ "src": "track1.mp3", "type": "audio/mpeg" }]
            }
          ]
        }
      ]
    }
  </script>
</trackswitch-player>
```

  </div>
  <div class="ts-doc-tabs__panel" data-doc-matrix-panel data-doc-matrix-version="default" data-doc-matrix-integration="esm" hidden markdown="1">

```ts
import { defineTrackswitchDefaultElement, type TrackSwitchInit } from 'trackswitch';

const config: TrackSwitchInit = {
  ui: [
    {
      type: 'trackGroup',
      trackGroup: [
        {
          title: 'Track 1',
          sources: [{ src: 'track1.mp3', type: 'audio/mpeg' }],
        },
      ],
    },
  ],
};

defineTrackswitchDefaultElement();
document.querySelector('trackswitch-player')!.config = config;
```

  </div>
  <div class="ts-doc-tabs__panel" data-doc-matrix-panel data-doc-matrix-version="default" data-doc-matrix-integration="react" hidden markdown="1">

```tsx
import { useMemo } from 'react';
import { TrackSwitchPlayer, type TrackSwitchInit } from 'trackswitch/react';

export function ExamplePlayer() {
  const config = useMemo<TrackSwitchInit>(() => {
    return {
      ui: [
        {
          type: 'trackGroup',
          trackGroup: [
            {
              title: 'Track 1',
              sources: [{ src: 'track1.mp3', type: 'audio/mpeg' }],
            },
          ],
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
import { TrackSwitchPlayer, type TrackSwitchInit } from 'trackswitch/vue';

const config: TrackSwitchInit = {
  ui: [
    {
      type: 'trackGroup',
      trackGroup: [
        {
          title: 'Track 1',
          sources: [{ src: 'track1.mp3', type: 'audio/mpeg' }],
        },
      ],
    },
  ],
};
</script>

<template>
  <TrackSwitchPlayer :config="config" class="trackswitch-host" />
</template>
```

  </div>
  <div class="ts-doc-tabs__panel" data-doc-matrix-panel data-doc-matrix-version="sync" data-doc-matrix-integration="html" hidden markdown="1">

```html
<script src="dist/js/trackswitch.js"></script>

<trackswitch-sync-player>
  <script type="application/json">
    {
      "ui": [
        {
          "type": "trackGroup",
          "trackGroup": [
            {
              "title": "Track 1",
              "sources": [{ "src": "track1.mp3", "type": "audio/mpeg" }],
              "alignment": { "column": "track_1_time" }
            },
            {
              "title": "Track 2",
              "sources": [{ "src": "track2.mp3", "type": "audio/mpeg" }],
              "alignment": { "column": "track_2_time" }
            }
          ]
        }
      ],
      "alignment": {
        "csv": "alignment.csv",
        "referenceTimeColumn": "track_1_time"
      }
    }
  </script>
</trackswitch-sync-player>
```

  </div>
  <div class="ts-doc-tabs__panel" data-doc-matrix-panel data-doc-matrix-version="sync" data-doc-matrix-integration="esm" hidden markdown="1">

```ts
import { defineTrackSwitchSyncPlayerElement, type TrackSwitchInit } from 'trackswitch';

const config: TrackSwitchInit = {
  ui: [
    {
      type: 'trackGroup',
      trackGroup: [
        {
          title: 'Track 1',
          sources: [{ src: 'track1.mp3', type: 'audio/mpeg' }],
          alignment: { column: 'track_1_time' },
        },
        {
          title: 'Track 2',
          sources: [{ src: 'track2.mp3', type: 'audio/mpeg' }],
          alignment: { column: 'track_2_time' },
        },
      ],
    },
  ],
  alignment: {
    csv: 'alignment.csv',
    referenceTimeColumn: 'track_1_time',
  },
};

defineTrackSwitchSyncPlayerElement();
document.querySelector('trackswitch-sync-player')!.config = config;
```

  </div>
  <div class="ts-doc-tabs__panel" data-doc-matrix-panel data-doc-matrix-version="sync" data-doc-matrix-integration="react" hidden markdown="1">

```tsx
import { TrackSwitchSyncPlayer, type TrackSwitchInit } from 'trackswitch/react';

const config: TrackSwitchInit = {
  ui: [
    {
      type: 'trackGroup',
      trackGroup: [
        {
          title: 'Track 1',
          sources: [{ src: 'track1.mp3', type: 'audio/mpeg' }],
          alignment: { column: 'track_1_time' },
        },
        {
          title: 'Track 2',
          sources: [{ src: 'track2.mp3', type: 'audio/mpeg' }],
          alignment: { column: 'track_2_time' },
        },
      ],
    },
  ],
  alignment: {
    csv: 'alignment.csv',
    referenceTimeColumn: 'track_1_time',
  },
};

export function ExamplePlayer() {
  return <TrackSwitchSyncPlayer config={config} className="trackswitch-host" />;
}
```

  </div>
  <div class="ts-doc-tabs__panel" data-doc-matrix-panel data-doc-matrix-version="sync" data-doc-matrix-integration="vue" hidden markdown="1">

```vue
<script setup lang="ts">
import { TrackSwitchSyncPlayer, type TrackSwitchInit } from 'trackswitch/vue';

const config: TrackSwitchInit = {
  ui: [
    {
      type: 'trackGroup',
      trackGroup: [
        {
          title: 'Track 1',
          sources: [{ src: 'track1.mp3', type: 'audio/mpeg' }],
          alignment: { column: 'track_1_time' },
        },
        {
          title: 'Track 2',
          sources: [{ src: 'track2.mp3', type: 'audio/mpeg' }],
          alignment: { column: 'track_2_time' },
        },
      ],
    },
  ],
  alignment: {
    csv: 'alignment.csv',
    referenceTimeColumn: 'track_1_time',
  },
};
</script>

<template>
  <TrackSwitchSyncPlayer :config="config" class="trackswitch-host" />
</template>
```

  </div>
  <div class="ts-doc-tabs__panel" data-doc-matrix-panel data-doc-matrix-version="interactive" data-doc-matrix-integration="html" hidden markdown="1">

```html
<script src="dist/js/trackswitch.js"></script>

<trackswitch-sync-interactive>
  <script type="application/json">
    {
      "workerUrl": "dist/js/trackswitch-interactive-worker.js"
    }
  </script>
</trackswitch-sync-interactive>
```

  </div>
  <div class="ts-doc-tabs__panel" data-doc-matrix-panel data-doc-matrix-version="interactive" data-doc-matrix-integration="esm" hidden markdown="1">

```ts
import {
  defineTrackSwitchSyncInteractiveElement,
  type InteractiveTrackSwitchInit,
} from 'trackswitch/interactive';

const config: InteractiveTrackSwitchInit = {
  workerUrl: 'dist/js/trackswitch-interactive-worker.js',
};

defineTrackSwitchSyncInteractiveElement();
document.querySelector('trackswitch-sync-interactive')!.config = config;
```

  </div>
  <div class="ts-doc-tabs__panel" data-doc-matrix-panel data-doc-matrix-version="interactive" data-doc-matrix-integration="react" hidden markdown="1">

```tsx
import { TrackSwitchSyncInteractive } from 'trackswitch/react';
import type { InteractiveTrackSwitchInit } from 'trackswitch/interactive';

const config: InteractiveTrackSwitchInit = {
  workerUrl: 'dist/js/trackswitch-interactive-worker.js',
};

export function ExamplePlayer() {
  return <TrackSwitchSyncInteractive config={config} className="trackswitch-host" />;
}
```

  </div>
  <div class="ts-doc-tabs__panel" data-doc-matrix-panel data-doc-matrix-version="interactive" data-doc-matrix-integration="vue" hidden markdown="1">

```vue
<script setup lang="ts">
import { TrackSwitchSyncInteractive } from 'trackswitch/vue';
import type { InteractiveTrackSwitchInit } from 'trackswitch/interactive';

const config: InteractiveTrackSwitchInit = {
  workerUrl: 'dist/js/trackswitch-interactive-worker.js',
};
</script>

<template>
  <TrackSwitchSyncInteractive :config="config" class="trackswitch-host" />
</template>
```

  </div>
</div>

## Full Options Reference {#full-options-reference}

<div class="ts-doc-tabs" data-doc-matrix data-doc-matrix-version="default" markdown="1">
  <div class="ts-doc-tabs__list ts-doc-tabs__list--versions" aria-label="Player version">
    <button class="ts-doc-tabs__tab is-active" type="button" aria-pressed="true" data-doc-matrix-control="version" data-doc-matrix-value="default">Default</button>
    <button class="ts-doc-tabs__tab" type="button" aria-pressed="false" data-doc-matrix-control="version" data-doc-matrix-value="sync">Sync</button>
    <button class="ts-doc-tabs__tab" type="button" aria-pressed="false" data-doc-matrix-control="version" data-doc-matrix-value="interactive">Interactive Sync</button>
  </div>
  <div class="ts-doc-tabs__panel is-active" data-doc-matrix-panel data-doc-matrix-version="default" markdown="1">

```javascript
TrackSwitch.createDefaultTrackSwitch(rootElement, {
  presetNames: ['Full Mix', 'Strings', 'Rhythm'],
  ui: [
    {
      type: 'image',
      src: 'cover.jpg',
      seekable: true,
      seekMarginLeft: 5,
      seekMarginRight: 5,
      style: 'margin: 0;',
    },
    {
      type: 'text',
      text: 'Choose which parts of the arrangement you want to hear.',
      bold: true,
      italic: false,
      fontSize: 18,
      align: 'center',
      style: 'margin: 0;',
    },
    {
      type: 'waveform',
      height: 160,
      waveformBarWidth: 2,
      maxZoom: 5,
      waveformSource: 'audible',
      playbackFollowMode: 'center',
      timer: false,
      seekMarginLeft: 3,
      seekMarginRight: 4,
      style: 'margin: 0;',
    },
    {
      type: 'trackGroup',
      rowHeight: 44,
      trackGroup: [
        {
          title: 'Violins',
          solo: true,
          volume: 0.9,
          pan: -0.2,
          image: 'violins.png',
          style: 'border-left: 3px solid #4f8dc9;',
          presets: [0, 1],
          sources: [
            { src: 'violins.mp3', type: 'audio/mpeg', startOffsetMs: 0, endOffsetMs: 0 },
            { src: 'violins.ogg', type: 'audio/ogg' },
          ],
        },
        {
          title: 'Drums',
          solo: false,
          volume: 1,
          pan: 0,
          image: 'drums.png',
          style: 'border-left: 3px solid #ed8c01;',
          presets: [0, 2],
          sources: [{ src: 'drums.mp3', type: 'audio/mpeg', startOffsetMs: -120, endOffsetMs: 250 }],
        },
      ],
    },
    {
      type: 'sheetMusic',
      src: 'score.musicxml',
      maxWidth: 960,
      maxHeight: 360,
      renderScale: 0.75,
      followPlayback: true,
      cursorColor: '#999999',
      cursorAlpha: 0.1,
      style: 'margin: 0;',
    },
  ],
  features: {
    exclusiveSolo: false,
    muteOtherPlayerInstances: true,
    globalVolume: true,
    trackVolumeControls: true,
    trackPanControls: true,
    repeat: false,
    tabView: false,
    iosAudioUnlock: true,
    keyboard: true,
    looping: true,
    seekBar: true,
    timer: true,
    presets: true,
    customizablePanelOrder: true,
  },
});
```

  </div>
  <div class="ts-doc-tabs__panel" data-doc-matrix-panel data-doc-matrix-version="sync" hidden markdown="1">


```javascript
TrackSwitch.createTrackSwitchSyncPlayer(rootElement, {
  ui: [
    {
      type: 'image',
      src: 'score-overview.jpg',
      seekable: false,
      seekMarginLeft: 0,
      seekMarginRight: 0,
      style: 'margin: 0;',
    },
    {
      type: 'perTrackImage',
      seekable: true,
      seekMarginLeft: 4,
      seekMarginRight: 4,
      style: 'margin: 0;',
    },
    {
      type: 'text',
      text: 'Compare aligned tracks on the shared score timeline.',
      bold: true,
      fontSize: 18,
      align: 'center',
      style: 'margin: 0;',
    },
    {
      type: 'waveform',
      height: 160,
      waveformBarWidth: 3,
      maxZoom: 8,
      waveformSource: 0,
      playbackFollowMode: 'jump',
      timer: true,
      alignedPlayhead: true,
      showAlignmentPoints: true,
      seekMarginLeft: 3,
      seekMarginRight: 4,
      style: 'margin: 0;',
    },
    {
      type: 'trackGroup',
      rowHeight: 44,
      trackGroup: [
        {
          title: 'Track 1',
          solo: true,
          volume: 1,
          pan: 0,
          image: 'track1.png',
          style: 'border-left: 3px solid #4f8dc9;',
          sources: [{ src: 'track1.mp3', type: 'audio/mpeg', startOffsetMs: 0, endOffsetMs: 0 }],
          alignment: {
            column: 'track_1_time',
            synchronizedSources: [
              { src: 'track1-synced.mp3', type: 'audio/mpeg', startOffsetMs: 0, endOffsetMs: 0 },
            ],
          },
        },
        {
          title: 'Track 2',
          solo: false,
          volume: 0.92,
          pan: 0.1,
          image: 'track2.png',
          style: 'border-left: 3px solid #6c757d;',
          sources: [{ src: 'track2.mp3', type: 'audio/mpeg', startOffsetMs: 50, endOffsetMs: 0 }],
          alignment: {
            column: 'track_2_time',
            synchronizedSources: [{ src: 'track2-synced.mp3', type: 'audio/mpeg' }],
          },
        },
      ],
    },
    {
      type: 'sheetMusic',
      src: 'score.musicxml',
      measureColumn: 'measure',
      maxWidth: 960,
      maxHeight: 360,
      renderScale: 0.75,
      followPlayback: true,
      cursorColor: '#999999',
      cursorAlpha: 0.1,
      style: 'margin: 0;',
    },
    {
      type: 'warpingMatrix',
      height: 240,
      tempoSmoothingSeconds: 5,
      bpm: 'infer_score',
      style: 'margin: 0;',
    },
  ],
  alignment: {
    csv: 'alignment.csv',
    referenceTimeColumn: 'score_time_sec',
    referenceTimeColumnSync: 'synced_time_sec',
    outOfRange: 'clamp',
  },
  features: {
    muteOtherPlayerInstances: true,
    globalVolume: true,
    trackVolumeControls: true,
    trackPanControls: true,
    repeat: false,
    tabView: false,
    iosAudioUnlock: true,
    keyboard: true,
    looping: true,
    seekBar: true,
    timer: true,
    presets: false,
    customizablePanelOrder: false,
  },
});
```

  </div>
  <div class="ts-doc-tabs__panel" data-doc-matrix-panel data-doc-matrix-version="interactive" hidden markdown="1">

```javascript
TrackSwitch.createTrackSwitchSyncInteractive(rootElement, {
  workerUrl: 'dist/js/trackswitch-interactive-worker.js',
});
```

  </div>
</div>

## Configuration {#player-wide-settings}

### `ui` {#ui}

`ui` is required. It decides which sections appear in the player and in what order they appear.

Use it to add any of these section types:

- `trackGroup`
- `image`
- `perTrackImage`
- `text`
- `waveform`
- `midi`
- `sheetMusic`
- `warpingMatrix`

At least one `trackGroup` section is required because that is where the tracks live.

### `presetNames` {#presetnames}

Use `presetNames` to create ensembles and name your track combinations.

Example:

```javascript
presetNames: ['Full Mix', 'Vocals Only', 'Backing Track']
```

Notes:

- Preset numbers start at `0`.
- Presets only appear in the ui when you have at least two usable preset choices.
- Tracks decide which presets they belong to through each track's `presets` setting.
- If you use presets, `presetNames` assigns names to preset IDs in numerical order.
- If `features.exclusiveSolo` is `true`, presets are disabled.

### `features` {#features}

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `exclusiveSolo?` | `boolean` | `false` | Listen to one track at a time only instead of mixing several tracks together. |
| `muteOtherPlayerInstances?` | `boolean` | `true` | Stops another player on the same page when this one starts playing. |
| `globalVolume?` | `boolean` | `false` | Shows a main volume control for the whole player. |
| `trackVolumeControls?` | `boolean` | `false` | Shows per-track volume controls. |
| `trackPanControls?` | `boolean` | `false` | Shows per-track left-right pan controls. |
| `customizablePanelOrder?` | `boolean` | `false` | Lets listeners rearrange the visible UI elements. Affects the visible sections on the page, not the track order itself. |
| `repeat?` | `boolean` | `false` | Starts with repeat already turned on. |
| `tabView?` | `boolean` | `false` | Changes the look of the track rows to a tab-like style. |
| `iosAudioUnlock?` | `boolean` | `true` | Helps playback start more reliably on iPhone and iPad. Recommended to leave this on. |
| `keyboard?` | `boolean` | `true` | Enable keyboard shortcuts. |
| `looping?` | `boolean` | `false` | Show loop tools and allow A/B looping. |
| `seekBar?` | `boolean` | `true` | Show the main seekbar. |
| `timer?` | `boolean` | `true` | Show the main time display. |
| `presets?` | `boolean` | `true` | Show preset switching UI element when presets are available. |

Unknown feature keys are rejected.

### `alignment` {#alignment}

Use `alignment` only with sync or interactive sync modes. Default-mode players reject this block.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `csv` | `string` | `-` | The timing data file used to connect the different performances. |
| `referenceTimeColumn` | `string` | `-` | The csv column to determine the main shared timeline used by the player. A usual setup would be to align tracks to a reference timeline calculated from the score. |
| `referenceTimeColumnSync?` | `string` | none | The csv column to determine the shared timeline when synchronized playback is turned on in sync mode. |
| `outOfRange?` | `'clamp' | 'linear'` | `'clamp'` | What the player should do when playback reaches a part of the timing map that has no matching value. |

## Track Settings {#track-settings}

### `trackGroup` {#trackgroup}

Use `type: 'trackGroup'` to add one or more tracks to the player.

Example:

```javascript
{
  type: 'trackGroup',
  rowHeight: 44,
  trackGroup: [
    {
      title: 'Drums',
      image: 'drums.png',
      presets: [0, 2],
      sources: [{ src: 'drums.mp3' }],
    },
  ],
}
```

Section options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `rowHeight?` | `number` | none | Sets the height of the track rows. |
| `trackGroup` | `object[]` | `-` | The list of tracks shown in this section. |

Notes:

- You can use more than one `trackGroup` section.
- `ui` order controls where each `trackGroup` appears on the page.

### Track Options {#track-options}

Each entry inside `trackGroup` can use these options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `title?` | `string` | none | Name shown in the track list. |
| `solo?` | `boolean` | `false` | Starting on/off state for that track. |
| `volume?` | `number` | `1` | Starting track volume. Starts at `1` if you do not set it. |
| `pan?` | `number` | `0` | Starting left-right placement. Starts at `0` if you do not set it. |
| `image?` | `string` | none | Image used by `perTrackImage` and other track-based visuals. |
| `presets?` | `number[]` | none | Decides which presets include this track. |
| `sources` | `object[]` | `-` | Audio files for this track. |
| `alignment?` | `object` | none | Alignment settings for this track in a sync player. |
| `style?` | `string` | none | Lets you give that track row its own visual styling. |

### Audio Source Options {#audio-source-options}

Each entry inside `sources` and `alignment.synchronizedSources` can use these options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `src` | `string` | `-` | Audio file to use. |
| `type?` | `string` | none | Optional file-type hint. If you omit it, trackswitch.js recognizes these source file extensions automatically: `.aac`, `.aif`, `.aiff`, `.au`, `.flac`, `.m4a`, `.mp1`, `.mp2`, `.mp3`, `.mp4`, `.mpeg`, `.mpg`, `.oga`, `.ogg`, `.wav`, `.webm`. |
| `startOffsetMs?` | `number` | `0` | Trims or pads the beginning of the file. Positive values trim. Negative values add silence. |
| `endOffsetMs?` | `number` | `0` | Trims or pads the end of the file. Positive values trim. Negative values add silence. |

Notes:

- Every track needs at least one `src`.
- If you list several source files, the player uses the first one that works for the listener's browser.
- If `type` is omitted and the file extension is not in the table above, the player asks the browser about `audio/<extension>`.

### Track Alignment Options {#track-alignment-options}

In sync mode, each track can also use an `alignment` block:

```javascript
trackGroup: [
    {
      title: 'Track 1',
      sources: [{ src: 'track1.mp3' }],
      alignment: {
        column: 'track_1_time',
        synchronizedSources: [{ src: 'track1-synced.mp3' }],
      }
    },
  ],
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `column?` | `string` | none | The timing-data column for that performance. Required in sync mode. |
| `synchronizedSources?` | `object[]` | none | Extra audio files used when synchronized playback is turned on. |

Notes:

- `synchronizedSources` are what make mixed synced playback possible.
- Sync is only available when the player also has a shared sync timeline through `referenceTimeColumnSync`.

## Visualizations {#visualizations}

### `text` {#text}

Use `type: 'text'` to add a plain text section to the player.

Example:

```javascript
{
  type: 'text',
  text: 'Choose which parts of the arrangement you want to hear.',
  bold: true,
  italic: false,
  fontSize: 18,
  align: 'center',
  style: 'margin: 12px 0;',
}
```

Section options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `text` | `string` | `-` | The text to show. |
| `bold?` | `boolean` | `false` | Makes the text bold. |
| `italic?` | `boolean` | `false` | Makes the text italic. |
| `fontSize?` | `number` | none | Sets the text size in pixels. |
| `align?` | `'left' | 'center' | 'right'` | `'center'` | Sets horizontal text alignment. |
| `style?` | `string` | none | Lets you fine-tune the look or spacing of the section with CSS. |

Notes:

- The text is plain text only. It is not interpreted as HTML.

### `image` {#image}

Use `type: 'image'` for one main image, such as cover art, a diagram, or a screenshot.

Example:

```javascript
{
  type: 'image',
  src: 'cover.jpg',
  seekable: true,
  seekMarginLeft: 5,
  seekMarginRight: 5,
  style: 'margin: 12px auto;',
}
```

Section options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `src` | `string` | `-` | The image file to show. |
| `seekable?` | `boolean` | `false` | Lets listeners click the image to jump to a different point in the audio. |
| `seekMarginLeft?` | `number` | `0` | Leaves a non-seekable area on the left side of the image. |
| `seekMarginRight?` | `number` | `0` | Leaves a non-seekable area on the right side of the image. |
| `style?` | `string` | none | Lets you fine-tune the look of the section with CSS. |

### `perTrackImage` {#pertrackimage}

Use `type: 'perTrackImage'` to show the image for the currently active track.

Example:

```javascript
{
  type: 'perTrackImage',
  seekable: false,
  style: 'margin: 12px auto;',
}
```

Section options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `seekable?` | `boolean` | `false` | Lets listeners click the current track image to jump in time. |
| `seekMarginLeft?` | `number` | `0` | Leaves a non-seekable area on the left side of the image. |
| `seekMarginRight?` | `number` | `0` | Leaves a non-seekable area on the right side of the image. |
| `style?` | `string` | none | Lets you fine-tune the look or spacing of the section with CSS. |

Notes:

- Only works if `exclusiveSolo` is `true`.
- This section uses each track's `image` attribute.

### `waveform` {#waveform}

Use `type: 'waveform'` to show an interactive waveform.

Example:

```javascript
{
  type: 'waveform',
  height: 150,
  waveformBarWidth: 2,
  maxZoom: 5,
  waveformSource: 'audible',
  playbackFollowMode: 'center',
  timer: true,
  style: 'margin: 16px 0;',
}
```

Section options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `height?` | `number` | `150` | Height of the waveform. |
| `waveformBarWidth?` | `number` | `1` | Thickness of the waveform bars. |
| `maxZoom?` | `number` | `5` | The closest zoom level listeners can reach, in seconds. Smaller numbers allow tighter zoom. |
| `waveformSource?` | `'audible' | number | number[]` | `'audible'` | Chooses which sound the waveform represents. |
| `playbackFollowMode?` | `'off' | 'center' | 'jump'` | `'off'` | Decides whether the waveform view follows playback automatically. |
| `timer?` | `boolean` | Standard: `false`; Sync: `true` | Shows a small time label inside the waveform panel. |
| `alignedPlayhead?` | `boolean` | `false` | Draws a diagonal Z-shaped indicator that shows where the reference timeline position is relative to this track's local playhead. Only has an effect in sync mode and requires `waveformSource` to be a track index (number). |
| `showAlignmentPoints?` | `boolean` | `false` | Draws a thin dashed Z-shaped line for every alignment anchor point that exists, showing the full warping path across the waveform. Only has an effect in sync mode and requires `waveformSource` to be a track index (number). |
| `seekMarginLeft?` | `number` | `0` | Leaves a non-seekable area on the left side. |
| `seekMarginRight?` | `number` | `0` | Leaves a non-seekable area on the right side. |
| `style?` | `string` | none | Lets you fine-tune the look or spacing of the section with CSS. |

Notes:

- If you leave out `timer`, the waveform timer is off in a standard player and on in a sync player.
- When listeners zoom in, the waveform shows a small overview map for quick navigation.

### `midi` {#midi}

Use `type: 'midi'` to show a MIDI file as a piano-roll visualization. MIDI files are only visual; they do not add playback tracks or change audio output.

Example:

```javascript
{
  type: 'midi',
  src: 'notes.mid',
  alignmentColumn: 'time_notes',
  height: 180,
  maxZoom: 5,
  playbackFollowMode: 'center',
  timer: true,
  style: 'margin: 16px 0;',
}
```

Section options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `src` | `string` | - | MIDI file to visualize. |
| `alignmentColumn?` | `string` | none | Alignment CSV column containing this MIDI file's local seconds. Used by sync players for mapped playback heads, timers, following, loops, and seeking. |
| `height?` | `number` | `180` | Height of the MIDI view. |
| `maxZoom?` | `number` | `5` | The closest zoom level listeners can reach, in seconds. Smaller numbers allow tighter zoom. |
| `playbackFollowMode?` | `'off' | 'center' | 'jump'` | `'off'` | Decides whether the MIDI view follows playback automatically. |
| `timer?` | `boolean` | `false` | Shows a small time label inside the MIDI panel. |
| `seekMarginLeft?` | `number` | `0` | Leaves a non-seekable area on the left side. |
| `seekMarginRight?` | `number` | `0` | Leaves a non-seekable area on the right side. |
| `style?` | `string` | none | Lets you fine-tune the look or spacing of the section with CSS. |

Notes:

- MIDI note timing is read directly from the file in seconds. Standard players use the main player timeline; sync players use the MIDI file duration as the MIDI view's local timeline.
- The visible pitch range is calculated from the notes in the file with two semitones of padding above and below.
- Clicking or dragging the MIDI view seeks the audio player, like waveform sections.
- MIDI files with no note events are treated as load errors.

### `sheetMusic` {#sheetmusic}

Use `type: 'sheetMusic'` to show a MusicXML score.

Example:

```javascript
{
  type: 'sheetMusic',
  src: 'score.musicxml',
  measureColumn: 'measure',
  maxWidth: 960,
  maxHeight: 360,
  renderScale: 0.75,
  followPlayback: true,
  cursorColor: '#999999',
  cursorAlpha: 0.1,
  style: 'margin: 20px auto;',
}
```

Section options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `src` | `string` | `-` | The MusicXML file to show. |
| `measureColumn?` | `string` | none | The column in the alignment data that contains measure numbers for score following. |
| `maxWidth?` | `number` | `1000` | The widest the score area should become. |
| `maxHeight?` | `number` | `380` | The tallest the score area should become. |
| `renderScale?` | `number` | `0.7` | Determines the size of rendered score elements. |
| `followPlayback?` | `boolean` | `true` | Keeps the score view moving with playback. |
| `cursorColor?` | `string` | `'#999999'` | Color of the playback follow cursor. |
| `cursorAlpha?` | `number` | `0.4` | Transparency of the playback follow cursor. Values below `0` become `0`; values above `1` become `1`. |
| `style?` | `string` | none | Lets you fine-tune the look or spacing of the section with CSS. |

Notes:

- If `measureColumn` is set and matching alignment data is available, listeners can click measures to jump through the music.
- In a standard player, `measureColumn` can use `init.alignment` as timing CSV metadata for score following. Full alignment features such as track alignment, aligned waveform overlays, and warping matrices still require the sync player.

### `warpingMatrix` {#warpingmatrix}

Use `type: 'warpingMatrix'` to show interactive warping path and local tempo deviation graphs in sync mode.

Example:

```javascript
{
  type: 'warpingMatrix',
  height: 240,
  tempoSmoothingSeconds: 5,
  bpm: 'infer_score',
  style: 'margin: 12px 0;',
}
```

Section options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `height?` | `number` | auto | Height of the chart area. |
| `tempoSmoothingSeconds?` | `number` | `5` | How much the local tempo deviation graph should be smoothed. Tempo Deviation is computed as a central differences variant of the warping path. Larger values give a smoother curve. |
| `bpm?` | `number | 'infer_score' | null` | `null` | Controls whether the left tempo axis is shown as BPM. Use a positive number for a fixed global BPM, `'infer_score'` to infer it from the score dynamically (changing BPM also supported), or `null` to hide the BPM axis and show only tempo percent. |
| `style?` | `string` | none | Lets you fine-tune the look or spacing of the section with CSS. |

Notes:

- This section is only useful in sync mode.
- It shows two views: the timing relationship between the active track and the reference timeline, and the local tempo deviation of the active track over time.
- This section is only enabled when synchronized playback is off in sync mode.
- `bpm: 'infer_score'` requires at least one `sheetMusic` ui element in the player.
- Positive `height`, `tempoSmoothingSeconds`, and numeric `bpm` values are used as given. Invalid values are ignored.

## Keyboard and Loop Controls {#keyboard-and-loop-controls}

When `features.keyboard` is on, you can use keyboard shortcuts:

| Keys | Action |
| --- | --- |
| `F1` | Open or close the shortcut help panel |
| `Space` | Play or pause |
| `Escape` | Stop and return to the start |
| `R` | Toggle repeat |
| `Left / Right` | Jump backward or forward by 2 seconds |
| `Shift + Left / Shift + Right` | Jump backward or forward by 5 seconds |
| `Home` | Go to the start |
| `Up / Down` | Change global volume when `globalVolume` is on |
| `1` to `0` | Control tracks 1 to 10 |

When `features.looping` is on, you can also use:

| Keys | Action |
| --- | --- |
| `A` | Set loop point A |
| `B` | Set loop point B |
| `L` | Turn the loop on or off |
| `C` | Clear the loop |

Looping is also available through the loop buttons. On seekable controls, loop regions can be marked directly using right-click on mouse.

## Things to Check {#things-to-check}

- `ui` must contain at least one `trackGroup`.
- Every track must have at least one audio file in `sources`.
- Seekable `image`, `perTrackImage`, and `waveform` sections need `seekMarginLeft + seekMarginRight` to stay below `100`.
- `perTrackImage` is meant for setups where one track is active at a time (`exclusiveSolo: true`).
- Presets are only shown in the UI when you have at least two preset choices.
- `sheetMusic.measureColumn` only works for clickable measure syncing when matching alignment data is also available.
- `warpingMatrix` works only when synchronized playback is off in sync mode, not default mode.
- In sync mode, each track needs its own `alignment.column`.
