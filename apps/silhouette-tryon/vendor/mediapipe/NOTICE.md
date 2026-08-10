# Vendored: MediaPipe Tasks Vision

Vendored here, unmodified, for self-hosting (no CDN dependency, no third-party
network calls at runtime — see PRINCIPLES.md on trackers):

- `vision_bundle.mjs` — `@mediapipe/tasks-vision` v1.0.1, from npm.
- `wasm/vision_wasm_internal.{js,wasm}` and `wasm/vision_wasm_nosimd_internal.{js,wasm}`
  — the SIMD and non-SIMD WASM runtimes shipped in the same npm package. The
  browser picks one at load time based on feature detection; only one is
  downloaded per visit.
- `pose_landmarker_lite.task` — the BlazePose GHUM "lite" pose landmark model,
  from `storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/`.

All of the above are licensed **Apache License 2.0** by Google LLC, which
permits redistribution. Full license text: `LICENSE` in this directory
(`https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE`).

**Known issue, mitigated by CSP, not by patching this vendor code:** current
builds of `@mediapipe/tasks-vision` (through 1.0.1) contain a telemetry call
that attempts to reach a Google logging endpoint regardless of self-hosting
(see upstream issues mediapipe#6291, #4991 — unresolved as of Aug 2026). The
app enforces `connect-src 'self'` via a `Content-Security-Policy` meta tag in
`index.html`, so the browser itself blocks any such request — this is a
verifiable property, not a patch to a minified vendor file. Do not remove
that CSP directive when touching this app.
