# Vendored: MediaPipe Tasks Vision

This directory vendors, unmodified, files from Google's MediaPipe project so the app can run
the pose landmarker fully client-side with no runtime CDN dependency.

- `vision_bundle.mjs` — `@mediapipe/tasks-vision` v1.0.1 JS API, from
  https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-1.0.1.tgz
- `wasm/vision_wasm_internal.js`, `wasm/vision_wasm_internal.wasm` — the SIMD WASM runtime from
  the same package. The non-SIMD fallback build is intentionally not vendored (adds ~11MB for a
  code path essentially no 2026 browser needs); if WASM init fails, the app shows a clear error
  instead of silently vendoring dead weight.
- `models/pose_landmarker_lite.task` — the Pose Landmarker "lite" model bundle, from
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
  (per the official BlazePose GHUM 3D model card, Apache-2.0, redistributable).
- `models/selfie_segmenter.tflite` — the Selfie Segmenter model (~250KB, float16), from
  https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite
  (Apache-2.0, redistributable). Added 2026-08-10 to clip the garment overlay to the person's
  actual outline instead of the coarser landmark-derived quad — see `segment.js`. Uses the same
  `vision_bundle.mjs` + WASM runtime already vendored above; no second runtime was added.

All under Apache License 2.0 (see `LICENSE` in this directory) — google-ai-edge/mediapipe,
homepage http://mediapipe.dev. Downloaded 2026-08-10 for the Voyeur project
(github.com/avikabra/voyeur), vendored per the license's redistribution terms, unmodified.

## Known issue: undocumented telemetry, and how this app handles it

As of v1.0.1, the vendored JS library contains an internal call to
`https://odml.pa.googleapis.com/v1/log` that fires regardless of self-hosting the assets —
confirmed by grepping the bundle for the literal endpoint string. This is a known, open,
unresolved upstream issue (google-ai-edge/mediapipe#6291, #4991); there is no documented way to
disable it from the library's public API.

This conflicts with Voyeur's "no trackers, every asset served from our own deploy" principle, so
**this app enforces a strict `connect-src 'self'` Content-Security-Policy** (see `index.html`) —
the browser itself blocks any network request the library's code attempts to any non-origin
host, regardless of what the vendored code tries to do. This is intentionally the fix instead of
patching the minified bundle: a declarative browser-enforced policy is verifiable (see the
adversarial-loop network-log check in the run log) and doesn't silently break on a future vendor
update the way a hand-patched file would.
