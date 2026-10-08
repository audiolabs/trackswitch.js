---
layout: default
title: Score Following
description: A score view that follows the recording, with measures as seek targets.
permalink: /use-cases/score-following/
body_class: docs-page docs-page--narrow
---

# Score Following

This page shows a recording together with its sheet music.
An alignment connects seconds in the recording to measures in the MusicXML score.
During playback, Trackswitch highlights the current measure and moves the score with the recording.
You can click a measure to seek to the corresponding passage in the recording.

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

Audio and annotation data: [Schubert Winterreise Dataset](https://www.audiolabs-erlangen.de/resources/MIR/SWD), *Gefrorne Tränen*, D. 911, No. 3, performance HU33.

## How it works

The score is a `musicxml` medium, so it carries its own timeline whose unit is measures,
not seconds. Two columns of the alignment CSV connect them: one anchor per row, holding
a measure number and the second it is heard at.

```json
"alignment": {
  "src": "../../assets/alignment/alignment.csv",
  "referenceTimeline": "hu33",
  "timelines": {
    "score": "measure_Schubert_D911-03_2",
    "hu33": "time_Schubert_D911-03_HU33"
  },
  "outsideCoverage": "hold",
  "duplicateAnchors": "average"
}
```

`duplicateAnchors: "average"` matters here: a measure sounds for a while, so several rows
may carry the same measure number. Averaging blends them; `"first"` would seek to the
moment the measure starts.

The score view names the medium it renders and can be told to scroll along with playback:

```json
{
  "type": "sheetMusic",
  "mediaID": "score",
  "maxHeight": 360,
  "followPlayback": true,
  "cursorColor": "#ed8c01"
}
```

Nothing else in the configuration mentions the score. Because the alignment covers all
timelines of the player, seeking anywhere — dragging the waveform, jumping to a marker,
clicking a measure — updates every view to its own corresponding position.

The measure markers drawn on the waveform come from a separate annotation file on the
`hu33` timeline, which turns the measures into navigation targets for the previous/next
controls as well:

```json
"markers": {
  "measures": {
    "type": "points",
    "src": "../../assets/alignment/HU33-markers.csv",
    "timeline": "hu33",
    "timeCol": "start",
    "labelCol": "label"
  }
}
```

To follow a second performance in the same score, add its audio medium and its column to
`alignment.timelines`, then put both tracks in one
[`comparisonGroup`]({{ '/documentation.html#tracklist' | relative_url }}) — see
[Aligned Timelines]({{ '/use-cases/aligned-timelines/' | relative_url }}).
