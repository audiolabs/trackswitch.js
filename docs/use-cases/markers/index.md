---
layout: default
title: Markers
description: Point markers and colored segment annotations on performances of Schubert, Gefrorne Tränen.
permalink: /use-cases/markers/
body_class: docs-page docs-page--narrow
---

# Markers

This page shows two types of markers on a recording of Schubert’s *Gefrorne Tränen*.
Point markers identify individual positions, such as the start of each measure.
Segment markers show longer regions, such as parts of the musical structure.
Trackswitch reads the positions and labels from CSV files and displays them on the waveform.

## Measure markers

This player displays each measure position in performance HU33 as an individual marker.

<div class="ts-usecase-showcase">
  <aside class="ts-usecase-showcase__code-callout" aria-label="Copy measure marker player code">
    <h4 class="ts-usecase-showcase__code-title">Hover to show player config</h4>
    <button class="ts-copy-btn" type="button">Copy to clipboard</button>
  </aside>

  <div class="ts-usecase-showcase__player-stage">
    <trackswitch-player
      config-src="measure-player-config.json"
      style="display: block;"></trackswitch-player>
  </div>

  <div class="ts-usecase-showcase__snippet-panel" aria-label="Measure marker code preview">
    <pre class="ts-usecase-showcase__snippet-shell"><code></code></pre>
  </div>
</div>

The annotation file contains one row for each measure position:

```csv
start;label
0.243809524;Measure 0.750
0.993764172;Measure 1
3.524489796;Measure 2
5.988843537;Measure 3
```

The `points` type displays each row as an independent marker:

```json
"markers": {
  "measures": {
    "type": "points",
    "src": "../../assets/alignment/HU33-markers.csv",
    "timeCol": "start",
    "labelCol": "label"
  }
}
```

Point markers are suitable for measures, beats, note onsets, and other individual positions.

## Structure annotations

This player compares structural annotations for the aligned HU33 and SC06 performances.
Each waveform displays the sequence for its performance.

<div class="ts-usecase-showcase">
  <aside class="ts-usecase-showcase__code-callout" aria-label="Copy structure annotation player code">
    <h4 class="ts-usecase-showcase__code-title">Hover to show player config</h4>
    <button class="ts-copy-btn" type="button">Copy to clipboard</button>
  </aside>

  <div class="ts-usecase-showcase__player-stage">
    <trackswitch-player
      config-src="structure-player-config.json"
      style="display: block;"></trackswitch-player>
  </div>

  <div class="ts-usecase-showcase__snippet-panel" aria-label="Structure annotation code preview">
    <pre class="ts-usecase-showcase__snippet-shell"><code></code></pre>
  </div>
</div>

Audio data: [Schubert Winterreise Dataset](https://www.audiolabs-erlangen.de/resources/MIR/SWD), *Gefrorne Tränen*, D. 911, No. 3, performances HU33 and SC06.

The source files contain start and end times with a structural label.
The `start` and `end` values are seconds on the local audio timeline of each performance.

```csv
start;end;structure
0.66;18.38;I
18.38;50.44;A
50.44;72.32;B
72.32;96.78;C
```

The `segments` type starts a region at each marker.
Each region ends at the next marker, and the final region ends with the timeline.
Trackswitch does not use the `end` column in this configuration.

```json
"sc06Structure": {
  "type": "segments",
  "src": "Schubert_D911-03_SC06.csv",
  "timeline": "sc06",
  "timeCol": "start",
  "labelCol": "structure",
  "colors": {
    "I": "var(--ts-color-channel-1)",
    "A": "var(--ts-color-channel-2)",
    "B": "var(--ts-color-channel-3)",
    "C": "var(--ts-color-channel-4)"
  }
}
```

The `colors` map assigns one color to each label.
It belongs to the marker sequence, so all views use the same structural palette.
The text labels also identify each region without color.

Both marker types retain the normal marker interactions.
The controls can select a marker, move between markers, or use markers as loop boundaries.
