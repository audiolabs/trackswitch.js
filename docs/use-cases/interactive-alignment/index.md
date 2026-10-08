---
layout: default
title: Interactive Alignment
description: A dedicated extension interface for audio, sheet music, and MIDI alignment in the browser.
permalink: /use-cases/interactive-alignment/
body_class: docs-page docs-page--narrow
interactive_demo: true
---

# Interactive Alignment

This page contains an extension that creates alignments directly in the browser.
Drop audio, MusicXML, or MIDI files into the interface and select a synchronization method.
The **Synchronize** action computes the alignment locally, so the files stay on your device.
The extension loads the result into a Trackswitch player for playback and inspection.
You can also download the aligned timeline positions as a CSV file.

<div class="ts-usecase-showcase">

  <div class="ts-usecase-showcase__player-stage">
    <trackswitch-sync-interactive
      config-src="player-config.json"
      style="display: block;"></trackswitch-sync-interactive>
  </div>
</div>

## Developing your own extensions

With the help of AI-assisted programming, new users can easily fork the project and create their own extension of trackswitch.
We are excited to see trackswitch being integrated into your projects!
If you are working on a project that aims to extend trackswitch, feel free to contact <mailto:manuel.peters@audiolabs-erlangen.de>. 
