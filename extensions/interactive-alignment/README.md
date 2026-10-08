# Interactive Alignment

A browser tool for producing an alignment: drop two or more recordings (and
optionally a score) into the page, run a DTW variant in the browser, and get back
a trackswitch player configured with the resulting anchors — plus the alignment
CSV to keep.

It is an **extension built on top of the player**, not part of it. Nothing in
`src/` imports from this folder, and the only things it takes from `src/` are
type declarations ([core-adapter.ts](core-adapter.ts)): at runtime it reaches the
core through `window.TrackSwitch.interactiveExtensionApi`, so the two bundles
stay independent.

## Layout

| | |
|---|---|
| `browser.ts` | IIFE entry — defines the `<trackswitch-sync-interactive>` element |
| `interactive-controller.ts` | the tool's state machine: files in, config out |
| `core-adapter.ts` | the narrow surface the tool uses from the player core |
| `methods/` | the offered alignment methods and their Python implementations |
| `worker/` | Pyodide module worker running the alignment pipeline off-thread |
| `ui/` | dropzone, settings panel, help text |

## Build

```
npm run build:interactive        # → dist/interactive/
```

Produces `trackswitch-interactive.js` and the module worker
`trackswitch-interactive-worker.js`; both are copied into `docs/js/` by
`npm run docs:assets`. The worker downloads Pyodide from a CDN on first use.
