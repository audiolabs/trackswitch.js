---
layout: default
title: Shared Timeline - Groups
description: Four track groups on one shared timeline, each playing one instrument at a time.
permalink: /use-cases/shared-timeline-groups/
body_class: docs-page docs-page--narrow
---

# Shared Timeline - Groups

This page shows a four-part chorale with several instrument recordings for each voice.
All recordings share the same timeline, so they do not need an alignment.
Each voice has its own `trackList`, and each list keeps one instrument active.
You can select one instrument for each voice and hear all four voices together.

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
Audio data: S. Balke, A. Berndt, and M. Müller, “[ChoraleBricks: A Modular Multitrack Dataset for Wind Music Research](https://doi.org/10.5334/tismir.252),” *Transactions of the International Society for Music Information Retrieval*, vol. 8, no. 1, pp. 39–54, 2025. [Accompanying Website](https://www.audiolabs-erlangen.de/resources/MIR/2025-ChoraleBricks). Drese: *Jesu geh voran*. [Original player](https://www.audiolabs-erlangen.de/resources/MIR/2025-ChoraleBricks/Drese_JesuGehVoran).

## How it works

Each voice is one `trackList` view with a `comparisonGroup` of its own:

```json
{
  "type": "trackList",
  "tracks": ["sopranoFlute", "sopranoOboe", "sopranoClarinet", "sopranoTrumpet", "sopranoFlugelhorn"],
  "comparisonGroup": 0,
  "trackVolumeControls": true
}
```

`comparisonGroup` makes the rows of that list behave as radio buttons: selecting an instrument deselects the previous one, and the list always keeps one instrument active. It names the selection the list belongs to, and the alto, tenor, and bass lists name `1`, `2`, and `3`, so choosing a different soprano instrument leaves the other voices untouched. Four numbers therefore give four independent choices, and four instruments sound at once.

Repeating a number does the opposite: lists that share one share the selection, so picking a track in either of them deselects whatever the other had. Four voices that all named `0` would let exactly one instrument sound in the whole player.

The same player could mix modes. A list without a `comparisonGroup` toggles its tracks independently, so an ordinary stem mixer can sit next to these comparison groups in one player.

A `separator` view in front of each list divides the voices:

```json
{ "type": "separator", "thickness": 2 }
```

Each track declares its own starting state with `solo`, which selects the instrument the list opens with. A list whose tracks say nothing about `solo` opens with its first track.

## Presets

The presets name a complete ensemble, one instrument per voice:

```json
"brassChoir": {
  "label": "Brass Choir",
  "tracks": ["sopranoTrumpet", "altoFlugelhorn", "tenorBaritone", "bassTuba"]
}
```

A preset activates exactly the tracks it names. Where a preset names several tracks of one `comparisonGroup`, that selection keeps the first of them, so a preset always resolves to a single instrument per voice. The player opens with the first preset in the file.
