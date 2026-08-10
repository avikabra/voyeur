// Wraps MediaPipe Tasks Vision PoseLandmarker (vendored, Apache-2.0 — see
// vendor/mediapipe/NOTICE.md). Single-image (IMAGE mode) pose detection only.
// Every asset is loaded from a same-origin relative path; no CDN, no network
// call leaves this app (also enforced at the browser level by the CSP meta
// tag in index.html).

import { FilesetResolver, PoseLandmarker } from './vendor/mediapipe/vision_bundle.mjs';

// BlazePose landmark indices used by this app. Full topology has 33 points;
// we only need the four that define the torso quad, plus the nose to sanity
// check the subject is facing roughly forward.
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const NOSE = 0;

const MIN_VISIBILITY = 0.5;

let landmarkerPromise = null;

/**
 * Lazily creates a single shared PoseLandmarker instance. Safe to call
 * repeatedly; the underlying WASM module and model file are only fetched
 * once. Rejects if WASM/the model can't load (e.g. a browser too old to
 * support the WASM feature set MediaPipe needs) — callers should catch this
 * and show a plain-language "your browser can't run this" message rather
 * than letting it surface as an unhandled error.
 */
export function loadPoseLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks('./vendor/mediapipe/wasm');
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: './vendor/mediapipe/pose_landmarker_lite.task',
        },
        runningMode: 'IMAGE',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
      });
    })().catch((err) => {
      // Don't leave the module permanently poisoned on a transient failure —
      // let the next call retry from scratch.
      landmarkerPromise = null;
      throw err;
    });
  }
  return landmarkerPromise;
}

/**
 * Detects a single person's shoulder/hip landmarks in an already-loaded
 * <img> or <canvas>. Returns pixel coordinates in the image's *natural*
 * (unscaled) space, or null if no person was found or the key landmarks
 * weren't confidently visible (e.g. a cropped photo, a side-on pose, an
 * occluded torso). Never throws for "no person found" — only for a genuine
 * failure to run the model (caller should have already awaited
 * loadPoseLandmarker() once to surface load errors separately).
 *
 * @param {HTMLImageElement | HTMLCanvasElement} imageSource
 * @returns {Promise<{
 *   leftShoulder: {x:number,y:number}, rightShoulder: {x:number,y:number},
 *   leftHip: {x:number,y:number}, rightHip: {x:number,y:number},
 *   nose: {x:number,y:number} | null,
 *   width: number, height: number
 * } | null>}
 */
export async function detectBodyLandmarks(imageSource) {
  const landmarker = await loadPoseLandmarker();
  const width = imageSource.naturalWidth || imageSource.width;
  const height = imageSource.naturalHeight || imageSource.height;
  const result = landmarker.detect(imageSource);

  const people = result && result.landmarks ? result.landmarks : [];
  if (people.length === 0) return null;
  const lm = people[0];

  const visible = (i) => {
    const v = lm[i] && lm[i].visibility;
    return typeof v !== 'number' || v >= MIN_VISIBILITY;
  };
  if (![LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP].every(visible)) {
    return null;
  }

  const toPx = (i) => ({ x: lm[i].x * width, y: lm[i].y * height });
  const nose = visible(NOSE) ? toPx(NOSE) : null;

  return {
    leftShoulder: toPx(LEFT_SHOULDER),
    rightShoulder: toPx(RIGHT_SHOULDER),
    leftHip: toPx(LEFT_HIP),
    rightHip: toPx(RIGHT_HIP),
    nose,
    width,
    height,
  };
}
