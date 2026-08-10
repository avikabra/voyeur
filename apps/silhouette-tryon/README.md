# Silhouette Try-On

**See roughly how a garment would sit on you, before you buy it.**

No account, no upload, no per-use cost. Both photos are processed entirely in your browser.

---

## What it does

Upload a photo of yourself and a photo of a garment (a product shot, a screenshot from a shop). The app finds your shoulders and hips, cuts the garment out of its background, and warps it onto your torso as a semi-transparent, dashed-outline overlay — showing roughly where the garment sits and how wide it is against your body.

It is deliberately **not photorealistic**. Every try-on tool that looks photoreal today is either an app-store download, needs an account, or metes out paid credits per generation — because photoreal garment transfer needs a GPU model that costs real money per use. That's incompatible with a tool that has to run free forever for anyone who opens it. This app sidesteps the problem instead of pretending to solve it: it shows a schematic overlay, honestly labeled as one, that costs nothing to generate because nothing is generated remotely at all.

## What it can't do

See `manifest.json`'s `limitations` for the full list — the short version: it only covers the torso region (not sleeves, necklines, or hems), it needs a clear front-facing photo with your shoulders and hips visible, and it needs a garment photo on a fairly plain background. It says nothing about fit or sizing, only position and rough width.

## How it works

Three independent, from-scratch pieces, wired together in `app.js`:

- **`pose.js`** — wraps MediaPipe Tasks Vision's `PoseLandmarker` (`pose_landmarker_lite`, Apache-2.0, vendored under `vendor/mediapipe/` — no CDN, no network call at runtime). Returns pixel-space shoulder and hip coordinates, or `null` if the model isn't confident both are visible.
- **`garment.js`** — a from-scratch background remover. Flood-fills inward from the image's corners and edge midpoints, testing each pixel against its *seed's fixed color* (not a chained neighbor color — an early version compared to the neighbor that reached each pixel, and it turned out an anti-aliased edge is a smooth enough gradient that the fill would walk straight through it into the garment; a fixed per-seed reference stops that). Feathers the cutout edge and returns the tight bounding box of what's left.
- **`warp.js`** — a from-scratch piecewise-affine quad warp. Splits the garment's bounding box and the destination torso quad into two triangles each, solves the exact 2×3 affine matrix for each triangle from its three point correspondences, and uses `ctx.clip()` + `ctx.transform()` + `ctx.drawImage()` to paint it. No libraries, no WebGL — the affine-solve math is unit-verified against known transforms (identity, translation, rotation) as plain arithmetic, independent of the DOM.

`app.js` builds the destination quad from the landmarks (widened slightly beyond the raw shoulder/hip points, since garments sit looser than skin) and renders the result with an opacity slider and a show/hide toggle.

### Privacy, enforced by the browser, not just by promise

`index.html` ships a `Content-Security-Policy` meta tag with `connect-src 'self'`. Every asset — the pose model, the WASM runtime — is vendored and served same-origin, so the browser itself refuses any network request the app didn't already ship with. This matters because `@mediapipe/tasks-vision` (as of this writing, v1.0.1) contains an internal telemetry call that tries to reach a Google endpoint regardless of self-hosting (open upstream issues, unresolved) — the CSP is what actually stops it, not the vendoring alone. See `vendor/mediapipe/NOTICE.md`.

## Run it locally

```
npx serve apps/silhouette-tryon
```

Open the page, turn your network off, and it still works after the first load — that's the honesty check: nothing your photos touch ever needs a live connection.

## License

MIT for everything in this directory except `vendor/mediapipe/`, which is Google's MediaPipe Tasks Vision runtime and the BlazePose GHUM pose model, both Apache License 2.0 (see `vendor/mediapipe/LICENSE` and `NOTICE.md`).
