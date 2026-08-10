// Pose detection module. Wraps MediaPipe Tasks Vision PoseLandmarker,
// vendored under ./vendor/mediapipe (see vendor/mediapipe/NOTICE.md).
//
// Interface:
//   initPose() -> Promise<PoseLandmarker instance>
//     Loads the wasm runtime + model from same-origin vendored assets only.
//     Throws Error with a user-safe .message on any failure (missing WASM
//     support, failed fetch, etc.) — callers should catch and show it.
//
//   detectPose(landmarker, imageElement) -> { landmarks } | null
//     imageElement: HTMLImageElement (already loaded, naturalWidth/Height set).
//     Returns null if no person was detected with reasonable confidence.
//     landmarks: array of 33 { x, y, z, visibility }, x/y normalized [0,1]
//     relative to the image, in MediaPipe's standard BlazePose order.
//
//   LANDMARK: named indices into the 33-point array, for the points this
//     app actually uses (shoulders/hips/elbows). Standard MediaPipe/BlazePose
//     ordering — see https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker.

export const LANDMARK = Object.freeze({
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
});

const VENDOR_BASE = './vendor/mediapipe';
const WASM_BASE = `${VENDOR_BASE}/wasm`;
const MODEL_PATH = `${VENDOR_BASE}/models/pose_landmarker_lite.task`;

// Minimum confidence, for both shoulders and both hips, before we trust the
// landmarks enough to drive a garment warp. Below this we tell the user we
// couldn't find a clear pose rather than warping onto a guess.
export const MIN_TORSO_VISIBILITY = 0.5;

let modulePromise = null;
function loadVisionModule() {
  if (!modulePromise) {
    // Dynamic import of the vendored ES module bundle. No CDN, same origin.
    modulePromise = import(`${VENDOR_BASE}/vision_bundle.mjs`);
  }
  return modulePromise;
}

export async function initPose() {
  let mod;
  try {
    mod = await loadVisionModule();
  } catch (e) {
    throw new Error('Could not load the pose-detection module. Try reloading the page.');
  }

  const { FilesetResolver, PoseLandmarker } = mod;

  let fileset;
  try {
    fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  } catch (e) {
    throw new Error(
      'This browser could not start the pose-detection engine (WebAssembly may be unsupported or disabled).'
    );
  }

  try {
    const landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: MODEL_PATH,
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
    });
    return landmarker;
  } catch (gpuErr) {
    // GPU delegate can fail on some devices/browsers; CPU is slower but
    // universally supported. Fall back rather than block the whole app.
    try {
      return await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_PATH,
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
      });
    } catch (cpuErr) {
      throw new Error('Could not start pose detection on this device.');
    }
  }
}

export function detectPose(landmarker, imageElement) {
  if (!landmarker || !imageElement) return null;

  let result;
  try {
    result = landmarker.detect(imageElement);
  } catch (e) {
    return null;
  }

  if (!result || !result.landmarks || result.landmarks.length === 0) {
    return null;
  }

  const landmarks = result.landmarks[0];
  const need = [
    LANDMARK.LEFT_SHOULDER,
    LANDMARK.RIGHT_SHOULDER,
    LANDMARK.LEFT_HIP,
    LANDMARK.RIGHT_HIP,
  ];
  const confident = need.every(
    (i) => landmarks[i] && landmarks[i].visibility >= MIN_TORSO_VISIBILITY
  );
  if (!confident) return null;

  return { landmarks };
}
