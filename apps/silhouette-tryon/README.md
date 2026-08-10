# Silhouette Try-On

**A rough, honest fit preview — not a photo.**

Upload a photo of yourself and a photo of a garment (a screenshot from a shop works well). Your
pose is detected entirely in-browser, the garment's background is lifted off, and its shape is
warped onto your pose. The result is rendered as a semi-transparent, dashed-outline overlay —
deliberately not trying to look like a real photo of you wearing it.

Nothing you upload is ever sent anywhere. Load this page once, then try it with your network
disconnected — it still works.

---

## What it does

1. **Your photo** — MediaPipe's Pose Landmarker (vendored, self-hosted, Apache-2.0) finds your
   shoulders and hips.
2. **The garment photo** — a classical (non-ML) background-removal heuristic samples the four
   corners of the photo to estimate the background color and lifts it off, feathering the edges.
3. **The warp** — the garment's shape is split into two triangles and mapped onto a matching pair
   of triangles anchored to your shoulders and hips, via a piecewise-affine warp — the same
   family of technique used by classic virtual-fitting-room research (TPS/mesh warping), done
   here in plain Canvas 2D with no model and no dependency.
4. **Sliders** let you correct for a garment that runs looser or longer than the auto-detected
   fit, and mirror the garment image if needed.

## What it can't do

See `manifest.json`'s `limitations` — non-exhaustive highlights: not photorealistic, tops/dresses
only, needs a clear front-facing photo, background removal is a best-effort heuristic on plain
backgrounds specifically.

## Why this exists

Photorealistic virtual try-on needs GPU-hosted generative models — that costs real money per
image, which is why every "free" try-on app on the market rate-limits you after a few uses (see
`manifest.json`'s evidence). Voyeur can't run anything that costs money at scale, so this app
takes the honest alternative: a classical, deterministic warp that can't fake fabric physics and
doesn't pretend to. See `docs/RESEARCH.md` and the run log for the fuller landscape scan.

## How it works, technically

Zero dependencies, zero build step, five files:

- `pose.js` — thin wrapper around MediaPipe's `PoseLandmarker`, vendored under
  `vendor/mediapipe/` (see that directory's `NOTICE.md` for provenance, licensing, and a known
  upstream telemetry issue and how this app neutralizes it via CSP).
- `cutout.js` — corner-sampled, feathered background removal for garment photos; falls back to
  the unmodified photo (a safe, honest degradation) if the background doesn't look uniform enough
  to trust the heuristic.
- `warp.js` — the piecewise-affine mesh warp: closed-form 3-point affine solve per triangle,
  drawn via `ctx.clip()` + `ctx.setTransform()` + `ctx.drawImage()`.
- `app.js` — wires the above to the DOM: file pickers, the landmarks→destination-quad geometry,
  the adjustment sliders, and the download/reset actions.
- `index.html` — markup, styling, and a strict `Content-Security-Policy` meta tag
  (`connect-src 'self'`) that makes "nothing leaves this device" something the browser enforces,
  not just something the code tries to do.

## Run it locally

```
npx serve apps/silhouette-tryon
```

Or open `index.html` directly. The vendored model/wasm assets are same-origin relative paths, so
this also works fully offline after the first load (open once online, then disconnect — it still
runs, since the pose engine never re-fetches after its first load and nothing else calls out).

## Data & model provenance

`vendor/mediapipe/` — Google's `@mediapipe/tasks-vision` v1.0.1 (Apache-2.0) and the
`pose_landmarker_lite` model bundle (Apache-2.0, per the official BlazePose GHUM 3D model card),
vendored unmodified 2026-08-10. Full provenance and the telemetry-endpoint note in
`vendor/mediapipe/NOTICE.md`.

MIT licensed (this app's own code — the vendored MediaPipe files remain Apache-2.0, see
`vendor/mediapipe/LICENSE`).
