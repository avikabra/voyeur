// Integration glue: wires pose.js + cutout.js + warp.js to the DOM in
// index.html. Owns no algorithm of its own beyond the landmarks->quad
// geometry (which is UI-shaped, not a generic reusable module).
import { initPose, detectPose, LANDMARK } from './pose.js';
import { extractGarment, anchorsFromBBox } from './cutout.js';
import { drawWarpedQuad } from './warp.js';

const MAX_IMAGE_DIM = 1280; // cap decode/processing cost regardless of input size
const MAX_FILE_BYTES = 30 * 1024 * 1024; // 30MB — friendly reject, not a silent hang
const CANVAS_MAX_W = 720; // render/display resolution cap

// ---------------------------------------------------------------- DOM refs
const $ = (id) => document.getElementById(id);

const loadStatus = $('load-status');
const loadStatusText = $('load-status-text');
const loadError = $('load-error');
const loadErrorText = $('load-error-text');
const retryLoadBtn = $('retry-load');

const stepSelfie = $('step-selfie');
const selfiePicker = $('selfie-picker');
const selfieInput = $('selfie-input');
const selfieLoaded = $('selfie-loaded');
const selfieThumb = $('selfie-thumb');
const selfieName = $('selfie-name');
const selfieChange = $('selfie-change');
const selfieStatus = $('selfie-status');

const stepGarment = $('step-garment');
const garmentPicker = $('garment-picker');
const garmentInput = $('garment-input');
const garmentLoaded = $('garment-loaded');
const garmentThumb = $('garment-thumb');
const garmentName = $('garment-name');
const garmentChange = $('garment-change');
const garmentStatus = $('garment-status');

const stepResult = $('step-result');
const canvas = $('canvas');
const ctx = canvas.getContext('2d');

const ctlLength = $('ctl-length');
const ctlLengthVal = $('ctl-length-val');
const ctlWidth = $('ctl-width');
const ctlWidthVal = $('ctl-width-val');
const ctlOpacity = $('ctl-opacity');
const ctlOpacityVal = $('ctl-opacity-val');
const ctlMirror = $('ctl-mirror');

const downloadBtn = $('download-btn');
const resetBtn = $('reset-btn');

// ------------------------------------------------------------------- state
let landmarker = null;
let selfieImg = null;
let selfieLandmarks = null;
let garmentCutout = null; // { canvas, bbox, bgRemoved }
let garmentAnchors = null;

// -------------------------------------------------------------- utilities
function setStatus(el, text, busy) {
  el.textContent = text || '';
  el.classList.toggle('busy', !!busy);
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that as an image. Try a JPEG or PNG.'));
    img.src = url;
  });
}

// Decodes and downscales any input photo to a bounded working size, so a
// huge camera photo can't hang decoding or blow up canvas memory on a phone.
// Returns a fresh HTMLImageElement backed by the downscaled bitmap.
async function loadCappedImage(file, maxDim) {
  if (!file) throw new Error('No file chosen.');
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('That photo is larger than 30MB — try a smaller one.');
  }

  let w, h, drawSource, bitmap = null;
  try {
    bitmap = await createImageBitmap(file);
    w = bitmap.width;
    h = bitmap.height;
    drawSource = bitmap;
  } catch (e) {
    // Fallback path for formats/browsers createImageBitmap rejects.
    const img = await loadImageFromFile(file);
    w = img.naturalWidth;
    h = img.naturalHeight;
    drawSource = img;
  }

  if (!w || !h) throw new Error('Could not read that as an image.');

  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  const work = document.createElement('canvas');
  work.width = cw;
  work.height = ch;
  const wctx = work.getContext('2d');
  wctx.drawImage(drawSource, 0, 0, cw, ch);
  if (bitmap && bitmap.close) bitmap.close();

  const blob = await new Promise((resolve, reject) => {
    work.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process that image.'))), 'image/png');
  });
  return loadImageFromFile(blob);
}

function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function widenAround(p, center, factor) {
  return { x: center.x + (p.x - center.x) * factor, y: center.y + (p.y - center.y) * factor };
}
function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// Body landmarks -> destination quad for the garment warp. Widths/lengths
// are derived from the detected shoulders/hips, then adjusted by the
// width/length sliders — pose detection gives a reasonable starting point,
// the sliders are how a user corrects for a garment that runs looser/
// longer than a snug jersey top.
function quadFromPose(landmarks, canvasW, canvasH, lengthFactor, widthFactor) {
  const P = (i) => ({ x: landmarks[i].x * canvasW, y: landmarks[i].y * canvasH });
  const ls = P(LANDMARK.LEFT_SHOULDER);
  const rs = P(LANDMARK.RIGHT_SHOULDER);
  const lh = P(LANDMARK.LEFT_HIP);
  const rh = P(LANDMARK.RIGHT_HIP);

  // "left"/"right" in the landmark names are anatomical (the subject's own
  // left/right), which doesn't reliably match image-left/image-right once
  // you account for camera angle — re-derive image-left/right from x.
  const anatLeftIsImgLeft = ls.x <= rs.x;
  const topL = anatLeftIsImgLeft ? ls : rs;
  const topR = anatLeftIsImgLeft ? rs : ls;
  const botL = anatLeftIsImgLeft ? lh : rh;
  const botR = anatLeftIsImgLeft ? rh : lh;

  const shoulderMid = mid(topL, topR);
  const hipMid = mid(botL, botR);

  const topLeft = widenAround(topL, shoulderMid, widthFactor);
  const topRight = widenAround(topR, shoulderMid, widthFactor);
  const hipLeftW = widenAround(botL, hipMid, widthFactor);
  const hipRightW = widenAround(botR, hipMid, widthFactor);

  // Hem: extend past the (widened) hip line by lengthFactor along the
  // shoulder->hip direction on each side independently, so a slightly
  // rotated pose still gets a plausible, non-parallel hem.
  const bottomLeft = lerp(topLeft, hipLeftW, lengthFactor);
  const bottomRight = lerp(topRight, hipRightW, lengthFactor);

  return [topLeft, topRight, bottomLeft, bottomRight];
}

function garmentSrcQuad(anchors, mirror) {
  const { topLeft, topRight, bottomLeft, bottomRight } = anchors;
  return mirror ? [topRight, topLeft, bottomRight, bottomLeft] : [topLeft, topRight, bottomLeft, bottomRight];
}

// ------------------------------------------------------------- rendering
function renderPreview() {
  if (!selfieImg || !selfieLandmarks || !garmentCutout) return;

  const scale = Math.min(1, CANVAS_MAX_W / selfieImg.naturalWidth);
  const cw = Math.round(selfieImg.naturalWidth * scale);
  const ch = Math.round(selfieImg.naturalHeight * scale);
  canvas.width = cw;
  canvas.height = ch;

  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(selfieImg, 0, 0, cw, ch);

  const lengthFactor = parseFloat(ctlLength.value);
  const widthFactor = parseFloat(ctlWidth.value);
  const opacity = parseFloat(ctlOpacity.value);
  const mirror = ctlMirror.checked;

  const dstQuad = quadFromPose(selfieLandmarks, cw, ch, lengthFactor, widthFactor);
  const srcQuad = garmentSrcQuad(garmentAnchors, mirror);

  try {
    drawWarpedQuad(ctx, garmentCutout.canvas, srcQuad, dstQuad, { opacity });
  } catch (e) {
    // A warp failure shouldn't blank the whole preview — the selfie stays
    // visible and the user can retry with different photos.
  }

  // Honest framing: outline the overlay quad so it reads as a sketch, not
  // an attempt to pass as a real photo of the garment on the body.
  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.beginPath();
  ctx.moveTo(dstQuad[0].x, dstQuad[0].y);
  ctx.lineTo(dstQuad[1].x, dstQuad[1].y);
  ctx.lineTo(dstQuad[3].x, dstQuad[3].y);
  ctx.lineTo(dstQuad[2].x, dstQuad[2].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  ctlLengthVal.textContent = lengthFactor.toFixed(2) + '×';
  ctlWidthVal.textContent = widthFactor.toFixed(2) + '×';
  ctlOpacityVal.textContent = Math.round(opacity * 100) + '%';

  stepResult.hidden = false;
}

let renderQueued = false;
function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderPreview();
  });
}

// ------------------------------------------------------------------ steps
async function initEngine() {
  loadError.hidden = true;
  loadStatus.hidden = false;
  setStatus(loadStatusText, 'Loading the pose-detection engine (~18MB, once — cached after) …', true);
  try {
    landmarker = await initPose();
    loadStatus.hidden = true;
    stepSelfie.hidden = false;
  } catch (e) {
    loadStatus.hidden = true;
    loadError.hidden = false;
    loadErrorText.textContent = e && e.message ? e.message : 'Something went wrong loading the pose engine.';
  }
}

async function handleSelfieFile(file) {
  setStatus(selfieStatus, 'Reading your photo…', true);
  selfieLoaded.hidden = true;
  try {
    const img = await loadCappedImage(file, MAX_IMAGE_DIM);
    selfieThumb.src = img.src;
    selfieName.textContent = file.name || 'photo';
    selfiePicker.hidden = true;
    selfieLoaded.hidden = false;

    setStatus(selfieStatus, 'Finding your pose…', true);
    // Yield a frame so the "busy" status actually paints before the
    // (synchronous, CPU-bound) detection call blocks the main thread.
    await new Promise((r) => setTimeout(r, 30));

    const result = detectPose(landmarker, img);
    if (!result) {
      selfieImg = null;
      selfieLandmarks = null;
      stepGarment.hidden = true;
      stepResult.hidden = true;
      setStatus(
        selfieStatus,
        "Couldn't find a clear pose in that photo. Try a front-facing photo with good light, torso visible, one person in frame."
      );
      return;
    }

    selfieImg = img;
    selfieLandmarks = result.landmarks;
    setStatus(selfieStatus, 'Pose found.');
    stepGarment.hidden = false;
    if (garmentCutout) queueRender();
  } catch (e) {
    setStatus(selfieStatus, e && e.message ? e.message : 'Could not use that photo.');
  }
}

async function handleGarmentFile(file) {
  setStatus(garmentStatus, 'Reading the garment photo…', true);
  garmentLoaded.hidden = true;
  try {
    const img = await loadCappedImage(file, MAX_IMAGE_DIM);
    garmentThumb.src = img.src;
    garmentName.textContent = file.name || 'garment';
    garmentPicker.hidden = true;
    garmentLoaded.hidden = false;

    const cutout = extractGarment(img);
    garmentCutout = cutout;
    garmentAnchors = anchorsFromBBox(cutout.bbox);

    setStatus(
      garmentStatus,
      cutout.bgRemoved
        ? 'Background removed.'
        : "Couldn't cleanly separate the garment from its background — using the full photo. The width/length sliders can help."
    );

    if (selfieImg && selfieLandmarks) queueRender();
  } catch (e) {
    garmentCutout = null;
    garmentAnchors = null;
    setStatus(garmentStatus, e && e.message ? e.message : 'Could not use that photo.');
  }
}

function resetAll() {
  selfieImg = null;
  selfieLandmarks = null;
  garmentCutout = null;
  garmentAnchors = null;

  selfieInput.value = '';
  garmentInput.value = '';
  selfiePicker.hidden = false;
  selfieLoaded.hidden = true;
  garmentPicker.hidden = false;
  garmentLoaded.hidden = true;
  setStatus(selfieStatus, '');
  setStatus(garmentStatus, '');

  stepGarment.hidden = true;
  stepResult.hidden = true;

  stepSelfie.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// -------------------------------------------------------------- wire up
retryLoadBtn.addEventListener('click', initEngine);

selfieInput.addEventListener('change', () => {
  const file = selfieInput.files && selfieInput.files[0];
  if (file) handleSelfieFile(file);
});
selfieChange.addEventListener('click', () => {
  selfiePicker.hidden = false;
  selfieLoaded.hidden = true;
  selfieInput.value = '';
  setStatus(selfieStatus, '');
});

garmentInput.addEventListener('change', () => {
  const file = garmentInput.files && garmentInput.files[0];
  if (file) handleGarmentFile(file);
});
garmentChange.addEventListener('click', () => {
  garmentPicker.hidden = false;
  garmentLoaded.hidden = true;
  garmentInput.value = '';
  setStatus(garmentStatus, '');
});

[ctlLength, ctlWidth, ctlOpacity, ctlMirror].forEach((el) => {
  el.addEventListener('input', queueRender);
});

downloadBtn.addEventListener('click', () => {
  let url;
  try {
    url = canvas.toDataURL('image/png');
  } catch (e) {
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = 'silhouette-try-on.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
});

resetBtn.addEventListener('click', resetAll);

initEngine();
