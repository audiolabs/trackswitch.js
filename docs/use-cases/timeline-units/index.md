---
layout: default
title: Timeline Units
description: Author alignment columns in samples, ticks, measures or pixels instead of seconds.
permalink: /use-cases/timeline-units/
body_class: docs-page docs-page--narrow
---

# Timeline Units

This page shows how Trackswitch uses different units for different media timelines.
Audio can use seconds or samples, MIDI can use seconds or ticks, and sheet music uses measures.
Set `timelineUnit` on a media entry when you do not want its default unit.
The alignment CSV can then connect positions that use different units.

Trackswitch supports the following timeline units, depending on the type of media:

| Media type | Allowed Timeline Units | Default Unit
| ----------- | ----------- | --------- |
| Audio | seconds, samples | seconds |
| MIDI | seconds, ticks | seconds |
| Sheet Music | measures | measures |
| Image | percent (of the image width), pixels | percent (of the image width) |

Note: Trackswitch uses the MIDI header for tick conversion, so tempo changes convert correctly across the complete piece.

The reference timeline is independent of a medium and the player displays it in seconds.
The example connects measures, MIDI ticks, and audio samples for three versions of Schubert’s *Gefrorne Tränen*.

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

## Declaring a unit

All timelines (except for the reference timeline) need to be tied to a medium, so the unit is declared on the media entry, with
`timelineUnit`:

```json
"media": {
  "takeA": { "type": "audio", "src": "take-a.wav", "timelineUnit": "samples" },
  "takeB": { "type": "audio", "src": "take-b.wav" }
}
```

That single declaration does both jobs: the medium's alignment column is read in that unit,
and every surface the medium owns reads out in it. A medium without a `timelineUnit` uses
the native unit of its type.

## In the example above

The alignment above was computed on a 20 ms grid. Its HU33 column was written out as sample
indices and its MIDI column as ticks, while the score column holds measure positions:

```csv
measure,hu33_samples,notes_ticks
0.000000,0,0
0.020000,441,19
0.040000,882,38
0.060000,1323,58
```

Two of the three media declare a unit; the score needs none, because `measures` is already
what a score plays back in:

```json
"media": {
  "score": { "type": "musicxml", "src": "Schubert_D911-03.xml" },
  "notes": { "type": "midi", "src": "Schubert_D911-03.mid", "timelineUnit": "ticks" },
  "hu33": { "type": "audio", "src": "HU33.wav", "timelineUnit": "samples" }
},
"alignment": {
  "src": "alignment.csv",
  "referenceTimeline": "score",
  "timelines": {
    "score": "measure",
    "hu33": "hu33_samples",
    "notes": "notes_ticks"
  },
  "outsideCoverage": "hold",
  "duplicateAnchors": "average"
}
```

A score makes a good reference timeline for exactly the reason its unit is unusual: measure
positions are the coordinate every performance of the piece has in common, so the main timer
names a place in the music rather than a place in one recording.

## Further Notes

- Marker CSV entries for the `timeCol` column must be in the specified unit of the timeline the marker sequence belongs to.

See [Aligned Timelines]({{ '/use-cases/aligned-timelines/' | relative_url }}) for the
alignment model itself, and the
[`alignment` reference]({{ '/documentation.html#alignment' | relative_url }}) for the complete
list of configuration properties.
