---
layout: default
title: Player Builder
description: Build and export a TrackSwitch player from local media
body_class: builder-page
builder: true
---

<div
  id="ts-builder-root"
  data-player-script="{{ '/js/trackswitch.js' | relative_url }}"
  data-license="{{ '/assets/builder/LICENSE' | relative_url }}"
  data-third-party-notices="{{ '/assets/builder/THIRD_PARTY_NOTICES.md' | relative_url }}"
  data-alignment-worker-url="{{ '/js/trackswitch-interactive-worker.js' | relative_url }}"
></div>
