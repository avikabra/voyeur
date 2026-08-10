// Person-segmentation module. Wraps MediaPipe Tasks Vision ImageSegmenter
// (the "selfie segmenter" model), vendored under ./vendor/mediapipe — the
// same runtime pose.js already loads, so this adds ~250KB of model weight
// to the existing ~18MB download, not a second WASM runtime.
//
// What this is for: the garment overlay is warped onto a quad derived from
// body *landmarks* (a few points), which says nothing about where the
// person's actual outline is in the photo. Without this, the garment can
// visibly extend past an arm, past the body's silhouette, onto furniture or
// background behind the subject — the single biggest thing that makes a
// warped shape read as "pasted on" rather than "on the person." This module
// gives a continuous per-pixel "how much is this a person" confidence mask
// so the render step can clip the garment to it.
//
// Interface:
//   initSegmenter() -> Promise<ImageSegmenter instance>
//     Same failure contract as pose.js's initPose(): throws Error with a
//     user-safe .message. Callers should treat this as optional, though —
//     see segmentPerson below.
//
//   segmentPerson(segmenter, imageElement) -> { data: Float32Array, width, height } | null
//     data[y*width+x] is person-confidence in [0, 1]. Returns null on any
//     failure — this is a realism enhancement, never a hard requirement,
//     so callers should render without clipping rather than block on it.

const VENDOR_BASE = './vendor/mediapipe';
const WASM_BASE = `${VENDOR_BASE}/wasm`;
const MODEL_PATH = `${VENDOR_BASE}/models/selfie_segmenter.tflite`;

let modulePromise = null;
function loadVisionModule() {
  if (!modulePromise) {
    modulePromise = import(`${VENDOR_BASE}/vision_bundle.mjs`);
  }
  return modulePromise;
}

export async function initSegmenter() {
  let mod;
  try {
    mod = await loadVisionModule();
  } catch (e) {
    throw new Error('Could not load the segmentation module.');
  }

  const { FilesetResolver, ImageSegmenter } = mod;

  let fileset;
  try {
    fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  } catch (e) {
    throw new Error('This browser could not start the segmentation engine.');
  }

  const options = {
    baseOptions: { modelAssetPath: MODEL_PATH },
    runningMode: 'IMAGE',
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  };

  try {
    return await ImageSegmenter.createFromOptions(fileset, { ...options, baseOptions: { ...options.baseOptions, delegate: 'GPU' } });
  } catch (gpuErr) {
    try {
      return await ImageSegmenter.createFromOptions(fileset, { ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' } });
    } catch (cpuErr) {
      throw new Error('Could not start segmentation on this device.');
    }
  }
}

export function segmentPerson(segmenter, imageElement) {
  if (!segmenter || !imageElement) return null;

  let result;
  try {
    result = segmenter.segment(imageElement);
  } catch (e) {
    return null;
  }

  const mask = result && result.confidenceMasks && result.confidenceMasks[0];
  if (!mask) return null;

  try {
    const data = mask.getAsFloat32Array();
    const { width, height } = mask;
    mask.close && mask.close(); // MPMask holds GPU/WASM memory; release explicitly once copied out
    if (!data || !width || !height) return null;
    return { data, width, height };
  } catch (e) {
    return null;
  }
}
