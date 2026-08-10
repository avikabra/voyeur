import { loadPoseLandmarker, detectBodyLandmarks } from './pose.js';
import { cutoutGarment } from './garment.js';
import { warpQuadToQuad } from './warp.js';

const personInput = document.getElementById('personInput');
const garmentInput = document.getElementById('garmentInput');
const personThumb = document.getElementById('personThumb');
const garmentThumb = document.getElementById('garmentThumb');
const personStatus = document.getElementById('personStatus');
const garmentStatus = document.getElementById('garmentStatus');
const resultCard = document.getElementById('resultCard');
const resultCanvas = document.getElementById('resultCanvas');
const toggleOverlay = document.getElementById('toggleOverlay');
const opacitySlider = document.getElementById('opacitySlider');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');

const WIDEN_FACTOR = 1.14; // garments sit looser than the body — widen the target quad a bit
const state = {
  personImg: null,
  garmentImg: null,
  landmarks: null,
  garment: null, // { canvas, bbox }
};

// Kick off model loading as soon as the page opens, in the background, so
// it's likely ready by the time both photos are in. Failure here is
// reported lazily, the first time a photo actually needs the model.
loadPoseLandmarker().catch(() => {});

function setStatus(el, kind, message) {
  el.className = 'status show ' + kind;
  el.textContent = message;
}

function clearStatus(el) {
  el.className = 'status';
  el.textContent = '';
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      reject(new Error('not-an-image'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode-failed'));
    };
    img.src = url;
  });
}

function setThumb(thumbEl, img) {
  thumbEl.innerHTML = '';
  const preview = document.createElement('img');
  preview.src = img.src;
  preview.alt = '';
  thumbEl.appendChild(preview);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function widen(a, b, factor) {
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  return [
    { x: midX + (a.x - midX) * factor, y: midY + (a.y - midY) * factor },
    { x: midX + (b.x - midX) * factor, y: midY + (b.y - midY) * factor },
  ];
}

/** Builds the destination quad [topLeft, topRight, bottomRight, bottomLeft]
 * in image pixel space from body landmarks, widened slightly beyond the raw
 * shoulder/hip points so the overlay doesn't look painted directly on skin. */
function destQuadFromLandmarks(lm) {
  // MediaPipe's "left"/"right" are the subject's own left/right, which is
  // mirrored on screen in a front-facing photo — sort by actual x position
  // instead of trusting the label, so the quad always has a correct winding
  // order regardless of which physical side is which.
  const shoulders = [lm.leftShoulder, lm.rightShoulder].sort((a, b) => a.x - b.x);
  const hips = [lm.leftHip, lm.rightHip].sort((a, b) => a.x - b.x);
  const [shoulderL, shoulderR] = widen(shoulders[0], shoulders[1], WIDEN_FACTOR);
  const [hipL, hipR] = widen(hips[0], hips[1], WIDEN_FACTOR);
  return [shoulderL, shoulderR, hipR, hipL];
}

function srcQuadFromBbox(bbox) {
  return [
    { x: bbox.x, y: bbox.y },
    { x: bbox.x + bbox.width, y: bbox.y },
    { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
    { x: bbox.x, y: bbox.y + bbox.height },
  ];
}

function render() {
  if (!state.personImg || !state.landmarks || !state.garment) return;

  const w = state.personImg.naturalWidth;
  const h = state.personImg.naturalHeight;
  resultCanvas.width = w;
  resultCanvas.height = h;
  const ctx = resultCanvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(state.personImg, 0, 0, w, h);

  if (!toggleOverlay.checked) return;

  const dstQuad = destQuadFromLandmarks(state.landmarks);
  const srcQuad = srcQuadFromBbox(state.garment.bbox);
  const opacity = Number(opacitySlider.value) / 100;
  warpQuadToQuad(ctx, state.garment.canvas, srcQuad, dstQuad, opacity);

  // Outline the overlay region — a deliberate visual cue that this is a
  // schematic overlay, not an edited photo.
  ctx.save();
  ctx.globalAlpha = Math.min(1, opacity + 0.15);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(2, w * 0.003);
  ctx.setLineDash([w * 0.012, w * 0.012]);
  ctx.beginPath();
  ctx.moveTo(dstQuad[0].x, dstQuad[0].y);
  for (const p of dstQuad.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  resultCard.classList.add('show');
}

async function handlePersonFile(file) {
  clearStatus(personStatus);
  state.landmarks = null;
  resultCard.classList.remove('show');
  let img;
  try {
    img = await loadImageFile(file);
  } catch (err) {
    setStatus(personStatus, 'error', "Couldn't open that file as an image. Try a JPEG or PNG.");
    return;
  }
  state.personImg = img;
  setThumb(personThumb, img);
  setStatus(personStatus, 'busy', 'Looking for a person in this photo…');

  let landmarker;
  try {
    landmarker = await loadPoseLandmarker();
  } catch (err) {
    setStatus(
      personStatus,
      'error',
      "Your browser can't run the pose detection this tool needs. Try a recent version of Chrome, Safari, Firefox, or Edge."
    );
    return;
  }

  let landmarks;
  try {
    landmarks = await detectBodyLandmarks(img);
  } catch (err) {
    setStatus(personStatus, 'error', 'Something went wrong analyzing that photo. Try a different one.');
    return;
  }

  if (!landmarks) {
    setStatus(
      personStatus,
      'error',
      "Couldn't confidently find a person's shoulders and hips in that photo. Try a front-facing, well-lit photo with your head to hips in frame."
    );
    return;
  }

  state.landmarks = landmarks;
  setStatus(personStatus, 'ok', 'Got it — found your shoulders and hips.');
  render();
}

async function handleGarmentFile(file) {
  clearStatus(garmentStatus);
  state.garment = null;
  resultCard.classList.remove('show');
  let img;
  try {
    img = await loadImageFile(file);
  } catch (err) {
    setStatus(garmentStatus, 'error', "Couldn't open that file as an image. Try a JPEG or PNG.");
    return;
  }
  state.garmentImg = img;
  setThumb(garmentThumb, img);
  setStatus(garmentStatus, 'busy', 'Separating the garment from its background…');

  // Let the "busy" status paint before the (synchronous, CPU-bound) cutout runs.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const cutout = cutoutGarment(img);
  if (!cutout) {
    setStatus(
      garmentStatus,
      'error',
      "Couldn't separate the garment from its background. This works best with a product photo on a plain background."
    );
    return;
  }

  state.garment = cutout;
  setStatus(garmentStatus, 'ok', 'Got it — background removed.');
  render();
}

personInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) handlePersonFile(file);
});

garmentInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) handleGarmentFile(file);
});

toggleOverlay.addEventListener('change', render);
opacitySlider.addEventListener('input', render);

downloadBtn.addEventListener('click', () => {
  const a = document.createElement('a');
  a.download = 'silhouette-try-on.png';
  a.href = resultCanvas.toDataURL('image/png');
  a.click();
});

resetBtn.addEventListener('click', () => {
  state.personImg = null;
  state.garmentImg = null;
  state.landmarks = null;
  state.garment = null;
  personInput.value = '';
  garmentInput.value = '';
  clearStatus(personStatus);
  clearStatus(garmentStatus);
  personThumb.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="3.2"/><path d="M5 20c1.2-4 4-6 7-6s5.8 2 7 6"/></svg>';
  garmentThumb.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 4l2 2h4l2-2 4 4-3 3v9H7v-9L4 8z"/></svg>';
  resultCard.classList.remove('show');
});
