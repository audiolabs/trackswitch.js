---
layout: default
title: Multitrack Playback
description: Compare synchronized audio tracks on a shared timeline.
permalink: /use-cases/multitrack-playback/
body_class: docs-page docs-page--narrow
---

# Multitrack Playback

This page shows how to play several synchronized audio files in one player.
In simultaneous listening mode, users can select and mix multiple tracks.
In comparative listening mode, only one track plays at a time, which makes direct comparisons easy.

## Simultaneous listening

This player mixes violin, synth, bass, and drum stems of an arrangement.
All four tracks play together by default, and the per-track volume and pan controls let listeners adjust the mix.

<div class="ts-usecase-showcase">
  <aside class="ts-usecase-showcase__code-callout" aria-label="Copy simultaneous listening player code">
    <h4 class="ts-usecase-showcase__code-title">Hover to show player config</h4>
    <button class="ts-copy-btn" type="button">Copy to clipboard</button>
  </aside>

  <div class="ts-usecase-showcase__player-stage">
    <trackswitch-player
      config-src="simultaneous-player-config.json"
      style="display: block;"></trackswitch-player>
  </div>

  <div class="ts-usecase-showcase__snippet-panel" aria-label="Simultaneous listening code preview">
    <pre class="ts-usecase-showcase__snippet-shell"><code></code></pre>
  </div>
</div>

## Comparative listening

This player uses solo mode to compare the output of several dereverberation methods.
Selecting a track mutes the others, so only one method plays at a time.

<div class="ts-usecase-showcase">
  <aside class="ts-usecase-showcase__code-callout" aria-label="Copy comparative listening player code">
    <h4 class="ts-usecase-showcase__code-title">Hover to show player config</h4>
    <button class="ts-copy-btn" type="button">Copy to clipboard</button>
  </aside>

  <div class="ts-usecase-showcase__player-stage">
    <trackswitch-player
      config-src="comparative-player-config.json"
      style="display: block;"></trackswitch-player>
  </div>

  <div class="ts-usecase-showcase__snippet-panel" aria-label="Comparative listening code preview">
    <pre class="ts-usecase-showcase__snippet-shell"><code></code></pre>
  </div>
</div>

Audio data: S. Braun and E. A. P. Habets, “[Online Dereverberation for Dynamic Scenarios Using a Kalman Filter With an Autoregressive Model](https://doi.org/10.1109/LSP.2016.2616888),” *IEEE Signal Processing Letters*, vol. 23, no. 12, pp. 1741–1745, Dec. 2016. [Accompanying Website](https://www.audiolabs-erlangen.de/resources/2016-SPL-MAR-KALMAN).
