trackswitch
==============

[![npm version](https://img.shields.io/npm/v/trackswitch)](https://www.npmjs.com/package/trackswitch)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Live Demo](https://img.shields.io/badge/demo-live-black)](https://audiolabs.github.io/trackswitch.js/)

**trackswitch** is a web-based player for exploring related music representations — audio recordings, MIDI, sheet music and analysis results — in one interface.

It is built on three concepts. **Timelines** are the coordinate systems of individual media, expressed in seconds, measures or ticks. **Markers** identify discrete positions on a timeline and are grouped into marker sequences, such as beats, measures or structural boundaries. **Alignments** pair markers on different timelines as anchors, and interpolate between them to project any position from one timeline onto another.

Audio can be heard in two ways: *comparative listening*, where one track sounds at a time and listeners switch between alternatives without interrupting playback, and *simultaneous listening*, where tracks sharing a timeline mix together. Performances on distinct timelines are compared rather than mixed, unless time-scale-modified renditions are supplied, which the Sync control then plays together.

Live Demo
-------------

- See what **trackswitch** can do on our demo website: https://audiolabs.github.io/trackswitch.js/

Installation
------------

Install from npm:

```bash
npm install trackswitch
```

Or download the browser bundle from GitHub Releases:

```text
trackswitch-release/
├── dist/
│   ├── js/
│   │   └── trackswitch.js
│   └── interactive/
│       ├── trackswitch-interactive.js
│       └── trackswitch-interactive-worker.js
├── LICENSE
└── THIRD_PARTY_NOTICES.md
```

Or build locally:

1. Clone Repo
2. `npm install`
3. `npm run build`

Quick Setup
-----------
Take a look at the [Tutorials & Use Cases](https://audiolabs.github.io/trackswitch.js/use-cases/) for complete, working configuration examples.

For further information on integrating the player into an ESM / React project, see [Documentation](https://audiolabs.github.io/trackswitch.js/documentation.html)

Features
-----------------

### Default Mode

- Multitrack audio playback
- Play, pause, stop, seek, and repeat controls
- Global volume control
- Looping controls
- Per-track solo, volume, and pan controls (balance or equal-power pan law)
- Annotation marker navigation by previous/next or searchable sequence, ID, and label
- Presets for common track combinations
- Comparison groups: switch tracks inside groups, each group living in one shared timeline
- Automatic loudness normalization
- (Seekable) images and per-track images
- Interactive waveforms with zoom support and optional playback-follow modes
- MIDI piano roll with per-channel colors, light/dark/colorblind palettes, velocity and note event info on hover
- Interactive sheet music (MusicXML) display with playback-following cursor
- Text and separator views for annotating and structuring the layout
- Completely customizable order of panels and elements in the navigation bar
- Keyboard shortcuts
- Responsive layout for narrow and mobile screens
- Theming through CSS custom properties, globally or per view
- Optional autoload
- Manual marker editing with fine adjustment in a magnified window, audible marker clicks, undo, and CSV export

### Aligned timelines (Sync mode)

- Compare and switch between different audio tracks living on separate, aligned timelines
- Timelines in custom units possible, e.g. seconds, measures or ticks
- Handling of repeated sections and positions where the reference stands still
- Configurable behavior outside alignment coverage (hold, extrapolate, error)
- Marker sequences projected between timelines
- Optional synchronized playback for mixing performances together
- Optional alignment warping path and local tempo deviation visualizations

### Additional Features

- [Player Builder](https://audiolabs.github.io/trackswitch.js/builder.html): assemble and export a player from local media
- Interactive alignment: run DTW in the browser on your own recordings and get a configured player and alignment CSV back
- Published JSON Schema for completion and validation in your editor

Programmatic API
----------------

`TrackSwitch.createDefaultTrackSwitch(rootElement, init)` and `TrackSwitch.createTrackSwitchSyncPlayer(rootElement, init)` return controllers for playback, seeking, looping, presets, and track state. This means that the player can be controlled by your application, independently from the end user.

Citation
--------

If you use trackswitch in scientific work, please cite:

Werner, Nils, et al. **"trackswitch.js: A Versatile Web-Based Audio Player for Presenting Scientific Results."** 3rd Web Audio Conference, London, UK. 2017.

```bibtex
@inproceedings{werner2017trackswitchjs,
  title={trackswitch.js: A Versatile Web-Based Audio Player for Presenting Scientific Results},
  author={Nils Werner and Stefan Balke and Fabian-Rober Stöter and Meinard Müller and Bernd Edler},
  booktitle={3rd web audio conference, London, UK},
  year={2017},
  organization={Citeseer}
}
```
