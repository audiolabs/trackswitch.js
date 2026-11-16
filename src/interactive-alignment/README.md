# Interactive Alignment

A browser tool for producing an alignment: drop two or more recordings (and
optionally a score) into the page, run a DTW variant in the browser, and get back
a trackswitch player configured with the resulting anchors — plus the alignment
CSV to keep.

It is built on top of the player as a separate bundle. Only the builder imports
from this folder, and the only things it takes from the rest of `src/` are
type declarations ([core-adapter.ts](core-adapter.ts)): at runtime it reaches the
core through `window.TrackSwitch.interactiveExtensionApi`, so the two bundles
stay independent.

## Build

```
npm run build:interactive        # → dist/interactive/
```

Produces `trackswitch-interactive.js` and the module worker
`trackswitch-interactive-worker.js`; both are copied into `docs/js/` by
`npm run docs:assets`. The worker downloads Pyodide from a CDN on first use.
