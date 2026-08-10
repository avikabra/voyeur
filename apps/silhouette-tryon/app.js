// Integration glue: wires pose.js + cutout.js + warp.js to the DOM in
// index.html. Owns no algorithm of its own beyond the landmarks->quad
// geometry (which is UI-shaped, not a generic reusable module).
import { initPose, detectPose, LANDMARK } from './pose.js';
import { initSegmenter, segmentPerson } from './segment.js';
import { extractGarment, anchorsFromBBox } from './cutout.js';
import { drawWarpedQuad } from './warp.js';

// Progressive enhancement: this is deliberately the first statement in this
// module script (not a separate inline <script>, which the page's own CSP
// blocks). If this script fails to load or throws before reaching this
// line, the class is never added and the .nojs message stays visible
// instead of a broken/hidden UI — same pattern as vinted-size-decoder.
document.documentElement.classList.add('js');

const MAX_IMAGE_DIM = 1280; // cap decode/processing cost regardless of input size
const MAX_FILE_BYTES = 30 * 1024 * 1024; // 30MB — friendly reject, not a silent hang
const MAX_MEGAPIXELS = 40; // post-decode backstop against a small file with huge declared dimensions
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
let segmenter = null; // optional: null if unavailable/failed to load, never blocks rendering
let selfieImg = null;
let selfieLandmarks = null;
let selfiePersonMaskCanvas = null; // person-confidence mask, built once per selfie, at render resolution
let garmentCutout = null; // { canvas, bbox, bgRemoved }
let garmentAnchors = null;

// -------------------------------------------------------------- utilities
// variant: undefined (neutral/success), 'err' (blocked, nothing to show),
// or 'warn' (soft — proceeded anyway with a caveat, e.g. background removal
// fell back). Kept visually distinct so success and failure never look
// identical, which a first-time-user test found genuinely confusing.
function setStatus(el, text, busy, variant) {
  el.textContent = text || '';
  el.classList.toggle('busy', !!busy);
  el.classList.toggle('err', variant === 'err');
  el.classList.toggle('warn', variant === 'warn');
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

// Cheap pre-decode guard against a small file declaring huge pixel
// dimensions (a "decompression bomb" — a tiny PNG that would expand to
// gigabytes of raw pixels on decode). Only PNG is peeked directly (its
// IHDR chunk holds width/height at a fixed offset, byte 16); other formats
// fall through to the post-decode megapixel check below, which catches the
// same problem after the fact for a real photo that's merely enormous.
async function peekPngIsTooLarge(file) {
  if (file.size < 24) return false;
  const head = new Uint8Array(await file.slice(0, 24).arrayBuffer());
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  if (!isPng) return false;
  const view = new DataView(head.buffer);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  return width * height > MAX_MEGAPIXELS * 1e6;
}

// Decodes and downscales any input photo to a bounded working size, so a
// huge camera photo can't hang decoding or blow up canvas memory on a phone.
// Returns a fresh HTMLImageElement backed by the downscaled bitmap.
async function loadCappedImage(file, maxDim) {
  if (!file) throw new Error('No file chosen.');
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('That photo is larger than 30MB — try a smaller one.');
  }
  if (await peekPngIsTooLarge(file)) {
    throw new Error("That image's dimensions are too large to process safely — try a smaller photo.");
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
  if (w * h > MAX_MEGAPIXELS * 1e6) {
    if (bitmap && bitmap.close) bitmap.close();
    throw new Error("That image's dimensions are too large to process safely — try a smaller photo.");
  }

  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  const work = document.createElement('canvas');
  work.width = cw;
  work.height = ch;
  const wctx = work.getContext('2d');
  wctx.drawImage(drawSource, 0, 0, cw, ch);
  if (bitmap && bitmap.close) bitmap.close();

  let blob;
  try {
    blob = await new Promise((resolve, reject) => {
      work.toBlob((b) => (b ? resolve(b) : reject(new Error('empty blob'))), 'image/png');
    });
  } catch (e) {
    // Canvas can throw SecurityError ("tainted canvas") for certain crafted
    // SVGs with external references, even though the browser never actually
    // fetched them (confirmed: no network request occurs). Surface the same
    // friendly message as any other unreadable file rather than a raw
    // browser exception.
    throw new Error('Could not process that image. Try a JPEG or PNG.');
  }
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
  // Shoulders and hips are derived INDEPENDENTLY (not one flag reused for
  // both): a rotated or weight-on-one-hip pose can have the hips twisted
  // relative to the shoulders, and reusing the shoulder flag for hips would
  // silently cross the destination quad into a twisted overlay instead of
  // an honest "couldn't find a clear pose" message.
  const shoulderAnatLeftIsImgLeft = ls.x <= rs.x;
  const hipAnatLeftIsImgLeft = lh.x <= rh.x;
  const topL = shoulderAnatLeftIsImgLeft ? ls : rs;
  const topR = shoulderAnatLeftIsImgLeft ? rs : ls;
  const botL = hipAnatLeftIsImgLeft ? lh : rh;
  const botR = hipAnatLeftIsImgLeft ? rh : lh;

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

// ---------------------------------------------------- compositing realism
// Two cheap, model-free techniques that do most of the work of not looking
// like a sticker pasted on a photo: matching the garment's brightness to
// the light it's supposedly sitting in, and grounding it with a soft
// shadow. Both are plain Canvas 2D (ctx.filter), no new dependencies.

// Average perceptual luma (0..255) over an axis-aligned region, sampled on
// a stride rather than every pixel — the regions here are at most a few
// hundred px per side, so this stays cheap without needing to be exact.
// alphaWeighted: when true (reading the *garment* cutout, which carries
// real transparency), fully/mostly-transparent pixels don't pull the
// average toward whatever color they happen to hold.
const LUMA_SAMPLE_STRIDE = 3;
function regionLuma(ctxSource, x, y, w, h, alphaWeighted) {
  const ix = Math.max(0, Math.round(x));
  const iy = Math.max(0, Math.round(y));
  const iw = Math.max(1, Math.min(Math.round(w), ctxSource.canvas.width - ix));
  const ih = Math.max(1, Math.min(Math.round(h), ctxSource.canvas.height - iy));
  if (iw <= 0 || ih <= 0) return null;

  let data;
  try {
    data = ctxSource.getImageData(ix, iy, iw, ih).data;
  } catch (e) {
    return null; // tainted canvas or other read failure -- just skip harmonization
  }

  let sum = 0;
  let weight = 0;
  for (let py = 0; py < ih; py += LUMA_SAMPLE_STRIDE) {
    for (let px = 0; px < iw; px += LUMA_SAMPLE_STRIDE) {
      const o = (py * iw + px) * 4;
      const a = data[o + 3] / 255;
      if (alphaWeighted && a < 0.2) continue; // skip near-transparent garment pixels
      const luma = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
      sum += luma * a;
      weight += a;
    }
  }
  return weight > 0 ? sum / weight : null;
}

// How strongly the garment's brightness chases the selfie region's — 1 is
// a full match, 0 is no correction. Partial on purpose: a full match can
// make a genuinely dark or bright garment photo look wrong/washed out, and
// this is a preview, not a colorimetric claim.
const HARMONIZE_STRENGTH = 0.55;
const HARMONIZE_MIN = 0.6;
const HARMONIZE_MAX = 1.5;

function garmentBrightnessFilter(selfieLuma, garmentLuma) {
  if (selfieLuma === null || garmentLuma === null || garmentLuma < 1) return 'none';
  const fullRatio = selfieLuma / garmentLuma;
  const ratio = 1 + (fullRatio - 1) * HARMONIZE_STRENGTH;
  const clamped = Math.max(HARMONIZE_MIN, Math.min(HARMONIZE_MAX, ratio));
  return `brightness(${clamped.toFixed(3)}) saturate(0.92)`;
}

// Bounding box of an arbitrary (possibly tilted) quad — used for the luma
// sample regions, where an approximate box is plenty.
function quadBBox(quad) {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
}

// Composites the warped garment onto the main canvas as its own layer, so a
// drop-shadow filter reads the garment's *true* silhouette (the union of
// both warp triangles) instead of being applied per-triangle, which would
// draw a visible seam along the two triangles' shared diagonal — that
// internal edge is a hard clip boundary, not a real edge of the garment,
// and a shadow computed on the clipped shape alone would show it as one.
//
// personMaskCanvas (optional): a per-pixel person-confidence mask built by
// buildPersonMaskCanvas, same (cw, ch) as this layer. When present, the
// garment is clipped to it — the single biggest fix for the overlay
// visibly extending past an arm or off the body onto the background, since
// the warp quad is derived from a handful of landmark points and knows
// nothing about the person's actual outline. Optional and best-effort: a
// missing/failed mask just means no clipping, never a blocked render.
function renderGarmentLayer(cw, ch, garmentSource, srcQuad, dstQuad, opacity, personMaskCanvas) {
  const layer = document.createElement('canvas');
  layer.width = cw;
  layer.height = ch;
  const lctx = layer.getContext('2d');

  const selfieBox = quadBBox(dstQuad);
  const selfieLuma = regionLuma(ctx, selfieBox.x, selfieBox.y, selfieBox.w, selfieBox.h, false);
  const garmentBox = quadBBox(srcQuad);
  const garmentCtx = garmentSource.getContext ? garmentSource.getContext('2d') : null;
  const garmentLuma = garmentCtx
    ? regionLuma(garmentCtx, garmentBox.x, garmentBox.y, garmentBox.w, garmentBox.h, true)
    : null;

  lctx.filter = garmentBrightnessFilter(selfieLuma, garmentLuma);
  drawWarpedQuad(lctx, garmentSource, srcQuad, dstQuad, { opacity });
  lctx.filter = 'none';

  // Cheap fake-3D: darken the outer edges of the garment (multiply, black,
  // partial alpha — never lightens, so there's no blend-mode ambiguity)
  // so it reads as curving away toward the side seams instead of sitting
  // perfectly flat. Clipped to the destination quad as a belt-and-suspenders
  // bound even though multiply-over-transparent is already a no-op by spec.
  try {
    lctx.save();
    lctx.beginPath();
    lctx.moveTo(dstQuad[0].x, dstQuad[0].y);
    lctx.lineTo(dstQuad[1].x, dstQuad[1].y);
    lctx.lineTo(dstQuad[3].x, dstQuad[3].y);
    lctx.lineTo(dstQuad[2].x, dstQuad[2].y);
    lctx.closePath();
    lctx.clip();
    const wrap = lctx.createLinearGradient(dstQuad[0].x, dstQuad[0].y, dstQuad[1].x, dstQuad[1].y);
    wrap.addColorStop(0, 'rgba(0,0,0,.35)');
    wrap.addColorStop(0.22, 'rgba(0,0,0,0)');
    wrap.addColorStop(0.78, 'rgba(0,0,0,0)');
    wrap.addColorStop(1, 'rgba(0,0,0,.35)');
    lctx.globalCompositeOperation = 'multiply';
    lctx.fillStyle = wrap;
    lctx.fillRect(0, 0, cw, ch);
    lctx.restore();
  } catch (e) {
    // Purely cosmetic — skip on any failure rather than risk the render.
  }

  if (personMaskCanvas) {
    try {
      lctx.globalCompositeOperation = 'destination-in';
      lctx.drawImage(personMaskCanvas, 0, 0, cw, ch);
      lctx.globalCompositeOperation = 'source-over';
    } catch (e) {
      // Skip clipping rather than risk the render — an un-clipped overlay
      // is exactly today's behavior, not a new failure mode.
    }
  }

  // A soft, low, warm-neutral shadow — grounds the garment in the scene
  // instead of it reading as a flat shape floating on top of the photo.
  // Falls back to a plain (unshadowed) composite on any browser where
  // ctx.filter/drop-shadow isn't supported; the CSS filter API has been a
  // baseline feature for years, but this must never be the thing that
  // breaks the preview on an older device.
  try {
    ctx.save();
    ctx.filter = 'drop-shadow(0 6px 10px rgba(15,16,25,.32)) drop-shadow(0 1px 2px rgba(15,16,25,.22))';
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  } catch (e) {
    ctx.drawImage(layer, 0, 0);
  }
}

// Builds a smooth (cw, ch)-sized grayscale-alpha canvas from a raw person-
// confidence mask (segment.js's output resolution, e.g. 256x256) — drawn at
// native mask resolution first, then a single drawImage upscale lets the
// canvas's own bilinear filtering do the smoothing, which is both cheaper
// and smoother than a hand-rolled per-output-pixel interpolation loop.
function buildPersonMaskCanvas(maskResult, cw, ch) {
  if (!maskResult || !maskResult.data || !maskResult.width || !maskResult.height) return null;
  const { data, width, height } = maskResult;

  const small = document.createElement('canvas');
  small.width = width;
  small.height = height;
  const sctx = small.getContext('2d');
  const imgData = sctx.createImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    const a = Math.max(0, Math.min(255, Math.round(data[i] * 255)));
    imgData.data[i * 4 + 3] = a; // RGB channels are irrelevant, only alpha is read (destination-in)
  }
  sctx.putImageData(imgData, 0, 0);

  const full = document.createElement('canvas');
  full.width = cw;
  full.height = ch;
  const fctx = full.getContext('2d');
  fctx.imageSmoothingEnabled = true;
  fctx.imageSmoothingQuality = 'high';
  fctx.drawImage(small, 0, 0, cw, ch);
  return full;
}

// ------------------------------------------------------------- rendering
// Everything in here is wrapped: a canvas/geometry failure on some
// unanticipated input should leave the user with a clear message and a
// working "start over" path, never a silently stuck UI (the modules this
// calls — pose.js/cutout.js/warp.js — all guarantee they won't throw, but
// the geometry glue in this file is app-specific and didn't have the same
// guarantee until this pass).
// The processing/display resolution for a given source image — shared
// between renderPreview (drawing the canvas) and handleSelfieFile (building
// the person-mask canvas at a matching size) so the two never drift apart.
function canvasSizeFor(img) {
  const scale = Math.min(1, CANVAS_MAX_W / img.naturalWidth);
  return { cw: Math.round(img.naturalWidth * scale), ch: Math.round(img.naturalHeight * scale) };
}

function renderPreview() {
  if (!selfieImg || !selfieLandmarks || !garmentCutout) return;

  try {
    const { cw, ch } = canvasSizeFor(selfieImg);
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
      renderGarmentLayer(cw, ch, garmentCutout.canvas, srcQuad, dstQuad, opacity, selfiePersonMaskCanvas);
    } catch (e) {
      // A warp/compositing failure shouldn't blank the whole preview — the
      // selfie stays visible and the user can retry with different photos.
    }

    ctlLengthVal.textContent = lengthFactor.toFixed(2) + '×';
    ctlWidthVal.textContent = widthFactor.toFixed(2) + '×';
    ctlOpacityVal.textContent = Math.round(opacity * 100) + '%';

    const wasHidden = stepResult.hidden;
    stepResult.hidden = false;
    if (wasHidden) revealStep(stepResult);
  } catch (e) {
    stepResult.hidden = true;
    setStatus(
      garmentStatus,
      'Could not build a preview from these two photos — try a different garment photo.',
      false,
      'err'
    );
  }
}

// Scroll a newly-revealed step into view and move focus to its heading, so
// a phone-sized viewport doesn't leave the next step invisible with no cue
// (steps 2/3 sit well below the fold on a typical phone). Respects
// prefers-reduced-motion. Mirrors the vinted-size-decoder app's
// don't-yank-a-page-already-in-view logic.
function revealStep(stepEl) {
  const heading = stepEl.querySelector('.step-title');
  let reduce = false;
  try {
    reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) {
    reduce = false;
  }
  try {
    stepEl.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  } catch (e) {
    stepEl.scrollIntoView();
  }
  if (heading) {
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
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
    return;
  }

  // Best-effort: the person-segmentation model is an optional realism
  // enhancement (clips the garment to the person's actual outline), not a
  // required part of the pipeline. Its failure must never block the pose
  // engine, which just succeeded, from being usable.
  try {
    segmenter = await initSegmenter();
  } catch (e) {
    segmenter = null;
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

    setStatus(selfieStatus, 'Finding your pose — this can take a few seconds and the page may pause…', true);
    // Yield a frame so the "busy" status actually paints before the
    // (synchronous, CPU-bound) detection call blocks the main thread. This
    // does not make detection itself faster or non-blocking — it only
    // guarantees the status text above is visible first, so the pause that
    // follows reads as "working" rather than "broken."
    await new Promise((r) => setTimeout(r, 30));

    const result = detectPose(landmarker, img);
    if (!result) {
      selfieImg = null;
      selfieLandmarks = null;
      stepGarment.hidden = true;
      stepResult.hidden = true;
      setStatus(
        selfieStatus,
        "Couldn't find a clear pose in that photo. Try a front-facing photo with good light, torso visible, one person in frame.",
        false,
        'err'
      );
      return;
    }

    selfieImg = img;
    selfieLandmarks = result.landmarks;

    // Best-effort, and deliberately not awaited-with-a-status-message: if
    // this fails or the segmenter never loaded, the render just proceeds
    // without clipping (today's behavior), never blocking on it.
    selfiePersonMaskCanvas = null;
    try {
      const maskResult = segmentPerson(segmenter, img);
      const { cw, ch } = canvasSizeFor(img);
      selfiePersonMaskCanvas = buildPersonMaskCanvas(maskResult, cw, ch);
    } catch (e) {
      selfiePersonMaskCanvas = null;
    }

    setStatus(selfieStatus, 'Pose found.');
    const wasHidden = stepGarment.hidden;
    stepGarment.hidden = false;
    if (wasHidden) revealStep(stepGarment);
    if (garmentCutout) queueRender();
  } catch (e) {
    setStatus(selfieStatus, e && e.message ? e.message : 'Could not use that photo.', false, 'err');
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
        : "Couldn't cleanly separate the garment from its background — using the full photo. The width/length sliders can help.",
      false,
      cutout.bgRemoved ? undefined : 'warn'
    );

    if (selfieImg && selfieLandmarks) queueRender();
  } catch (e) {
    garmentCutout = null;
    garmentAnchors = null;
    setStatus(garmentStatus, e && e.message ? e.message : 'Could not use that photo.', false, 'err');
  }
}

function resetAll() {
  selfieImg = null;
  selfieLandmarks = null;
  selfiePersonMaskCanvas = null;
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
