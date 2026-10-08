---
layout: default
title: A Repeated Section
description: Two performances of Mozart's K. 545, aligned across two written repeats.
permalink: /use-cases/repeated-section/
body_class: docs-page docs-page--narrow
---

# A Repeated Section

This page compares two performances of Mozart’s *Piano Sonata No. 16 in C major, K. 545*.
Bernd Krueger plays both written repeats, while Robin Alciatore omits them.
The alignment uses Krueger’s complete performance as its reference.
It maps both repeated passages to the same passage in Alciatore’s shorter performance:

- Krueger: `exposition → exposition → development + recapitulation → development + recapitulation`
- Alciatore: `exposition → development + recapitulation`

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

Audio data: [Robin Alciatore, via Musopen](https://commons.wikimedia.org/wiki/File:Wolfgang_Amadeus_Mozart_-_sonata_no._16_in_c_major%2C_k.545_%27sonata_facile%27_-_i._allegro.ogg) (2:14, public domain) and [Bernd Krueger](https://commons.wikimedia.org/wiki/File:Mozart_-_Piano_Sonata_No._16_in_C_major_-_I._Allegro.ogg) (4:23, CC BY-SA 3.0 Germany). Both recordings are used unmodified.

At 0:49.69 on Krueger's timeline, the exposition starts again. Alciatore's playhead jumps from the end of the exposition back to the opening. At 3:00.46, Krueger repeats the complete development and recapitulation, producing a second backward jump in Alciatore's performance.

## Repeats in the alignment

Krueger carries the reference timeline because it contains every occurrence. At each repeat sign, two rows share the same Krueger time while Alciatore's time steps backward:

```csv
krueger,alciatore
49.691,51.084
49.691,0.929
...
180.465,133.190
180.465,51.270
```

The shared reference time makes each repeat explicit in the alignment data. During a repeated passage, Alciatore's single traversal can accompany either occurrence.

```json
"alignment": {
  "src": "alignment.csv",
  "referenceTimeline": "krueger",
  "timelines": {
    "krueger": "krueger",
    "alciatore": "alciatore"
  },
  "outsideCoverage": "hold"
}
```

## Additional notes

The alignment was computed with chroma-based dynamic time warping. Alciatore's performance was aligned to one traversal of Krueger's rendering, then that mapping was unfolded over both repeats.
