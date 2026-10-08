---
layout: default
title: Aligned Timelines
description: Two performances and their sheet music synchronized by musical position.
permalink: /use-cases/aligned-timelines/
body_class: docs-page docs-page--narrow
---

# Aligned Timelines

This page shows two performances of Franz Schubert’s *Gefrorne Tränen* and the corresponding sheet music.
The performances have different tempos, so the same passage occurs at different times in each recording.
An **alignment** CSV connects corresponding positions on their separate timelines.
When you switch performances, playback continues at the same musical passage and the sheet music follows the active recording.

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

## How it works

A timeline is an ordered sequence of numerical positions. Depending on the music representation, its coordinates may encode physical time in seconds, musical time in beats or measures, sample indices, or other numerical units that permit interpolation. Each media element in trackswitch is associated with a timeline, and one timeline is designated as the reference timeline.

The relationship between an individual timeline and the reference timeline is specified by an ordered set of alignment points.
Each alignment point links two corresponding positions and thus serves as an anchor correspondence between the timelines.
Usually, the beginning and end of each timeline are treated as implicit alignment points. Between consecutive alignment points, trackswitch applies linear interpolation to obtain a continuous, piecewise-linear mapping. Correspondences between two non-reference timelines are determined through their respective mappings to the reference timeline.

This model distinguishes synchronization from equal playback time. 
For example, a position at 01:19 (mm:ss) in one performance may correspond to 01:13 in another performance and to measure 30 in a score.
When a user seeks to one of these positions, trackswitch moves each representation to the corresponding position rather than to the same numerical value. 
During playback, the representations may therefore indicate different local coordinates while referring to the same musical position.

Alignment data are supplied as a CSV file containing an arbitrary number of alignment points. A sparse set may describe coarse structural correspondences, whereas a denser set can capture local tempo variations. The player neither prescribes nor implements a particular synchronization method. Instead, it provides an interaction layer for inspecting and communicating alignment results from tasks such as performance synchronization, score--audio alignment, transcription, and score following.

Example for an alignment csv:

```csv
time_Schubert_D911-03_HU33,time_Schubert_D911-03_SC06,time_Schubert_D911-03_2,time_Schubert_D911-03,measure_Schubert_D911-03_2,time_sync_reference
0.000000,0.000000,0.000000,0.000000,0.000000,0.000000
0.020000,0.020000,0.020000,0.020000,0.020000,0.020000
2.960000,2.980000,4.100000,4.100000,1.775000,2.960000
2.980000,3.000000,4.120000,4.120000,1.780000,2.980000
3.000000,3.020000,4.140000,4.140000,1.785000,3.000000
```

Each column is a timeline, named by header, and each row is an alignment point linking the corresponding positions across all timelines.

Example for how to specify an alignment in trackswitch:

```json
"alignment": {
  "src": "alignment.csv",
  "referenceTimeline": "reference",
  "timelines": {
    "reference": "time_sync_reference",
    "score": "measure_Schubert_D911-03_2",
    "midi": "time_Schubert_D911-03",
    "hu33": "time_Schubert_D911-03_HU33",
    "sc06": "time_Schubert_D911-03_SC06"
  },
  "outsideCoverage": "hold",
  "duplicateAnchors": "average"
}
```

`timelines` maps each media ID to the CSV column that holds its coordinates, and `referenceTimeline` names the media whose timeline all others are aligned against.
