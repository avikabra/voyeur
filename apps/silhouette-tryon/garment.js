// Classical (non-ML) background removal for garment product photos. Works
// by flood-filling inward from the image edges, treating pixels as
// "background" while they stay close in color to their already-accepted
// neighbor (an adaptive threshold, not a single fixed reference color, so it
// tolerates the soft lighting gradients real product photography has).
//
// This is a deliberately simple technique that fits its target input: an
// e-commerce/product photo shot on a plain or near-white background. It is
// not a general-purpose segmentation model and will not cleanly cut out a
// garment from a busy or textured background — see manifest.limitations.

const MAX_DIM = 1100; // cap working resolution; this is a UI overlay, not a print
const DEFAULT_THRESHOLD = 38; // per-step RGB distance tolerance, 0-441 scale
const FEATHER_RADIUS = 2; // px, box-blur radius applied to the cutout edge

function idx(x, y, w) {
  return y * w + x;
}

function sampleAvgColor(data, w, h, cx, cy, r) {
  let rs = 0, gs = 0, bs = 0, n = 0;
  for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++) {
      const i = idx(x, y, w) * 4;
      rs += data[i]; gs += data[i + 1]; bs += data[i + 2];
      n++;
    }
  }
  return n ? [rs / n, gs / n, bs / n] : [255, 255, 255];
}

/**
 * Flood fill from a set of seed points, each tested against its own *fixed*
 * seed color (not the color of whichever neighbor reached it). That fixed
 * reference is the load-bearing choice: comparing against a chained
 * neighbor color lets the fill "walk" through a gradient one small step at
 * a time — exactly what a canvas's anti-aliased edge is — and leak straight
 * through the garment's outline into its interior. A fixed reference can
 * only match pixels genuinely close to the original background color, so a
 * sharp edge stops it even if that edge is anti-aliased over a few pixels.
 */
function floodFillBackground(data, w, h, seeds, threshold, isBackground, visited) {
  const stack = [];
  for (const [sx, sy] of seeds) {
    const si = idx(sx, sy, w);
    if (visited[si]) continue;
    const [r0, g0, b0] = sampleAvgColor(data, w, h, sx, sy, 2);
    visited[si] = 1;
    stack.push(sx, sy);

    while (stack.length) {
      const y = stack.pop();
      const x = stack.pop();
      const i = idx(x, y, w);
      const di = i * 4;
      const dr = data[di] - r0;
      const dg = data[di + 1] - g0;
      const db = data[di + 2] - b0;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist > threshold) continue;

      isBackground[i] = 1;
      if (x + 1 < w) { const ni = idx(x + 1, y, w); if (!visited[ni]) { visited[ni] = 1; stack.push(x + 1, y); } }
      if (x - 1 >= 0) { const ni = idx(x - 1, y, w); if (!visited[ni]) { visited[ni] = 1; stack.push(x - 1, y); } }
      if (y + 1 < h) { const ni = idx(x, y + 1, w); if (!visited[ni]) { visited[ni] = 1; stack.push(x, y + 1); } }
      if (y - 1 >= 0) { const ni = idx(x, y - 1, w); if (!visited[ni]) { visited[ni] = 1; stack.push(x, y - 1); } }
    }
  }
}

/** Separable box blur applied only to the alpha channel, to soften the cutout edge. */
function featherAlpha(alpha, w, h, radius) {
  if (radius <= 0) return alpha;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  // horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const sx = x + dx;
        if (sx < 0 || sx >= w) continue;
        sum += alpha[idx(sx, y, w)];
        n++;
      }
      tmp[idx(x, y, w)] = sum / n;
    }
  }
  // vertical pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const sy = y + dy;
        if (sy < 0 || sy >= h) continue;
        sum += tmp[idx(x, sy, w)];
        n++;
      }
      out[idx(x, y, w)] = sum / n;
    }
  }
  return out;
}

/**
 * Removes a plain/near-uniform background from a garment photo.
 *
 * @param {HTMLImageElement | HTMLCanvasElement} imageSource
 * @param {{threshold?: number}} [options]
 * @returns {{canvas: HTMLCanvasElement, bbox: {x:number,y:number,width:number,height:number}} | null}
 *   null if the source has no usable dimensions, or if the result is
 *   implausible (near-nothing or near-everything left opaque) — callers
 *   should treat that as "couldn't separate the garment from its background".
 */
export function cutoutGarment(imageSource, options = {}) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const naturalW = imageSource.naturalWidth || imageSource.width;
  const naturalH = imageSource.naturalHeight || imageSource.height;
  if (!naturalW || !naturalH) return null;

  const scale = Math.min(1, MAX_DIM / Math.max(naturalW, naturalH));
  const w = Math.max(1, Math.round(naturalW * scale));
  const h = Math.max(1, Math.round(naturalH * scale));

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = w;
  srcCanvas.height = h;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  srcCtx.drawImage(imageSource, 0, 0, w, h);

  const imgData = srcCtx.getImageData(0, 0, w, h);
  const data = imgData.data;

  const isBackground = new Uint8Array(w * h);
  const visited = new Uint8Array(w * h);
  const midX = Math.floor(w / 2);
  const midY = Math.floor(h / 2);
  const seeds = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
    [midX, 0], [midX, h - 1], [0, midY], [w - 1, midY],
  ];
  floodFillBackground(data, w, h, seeds, threshold, isBackground, visited);

  const rawAlpha = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) rawAlpha[i] = isBackground[i] ? 0 : 255;
  const alpha = featherAlpha(rawAlpha, w, h, FEATHER_RADIUS);

  let minX = w, minY = h, maxX = -1, maxY = -1;
  let opaqueCount = 0;
  const OPAQUE_CUTOFF = 24; // alpha below this counts as "removed" for the bbox/sanity check
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y, w);
      const a = alpha[i];
      data[i * 4 + 3] = Math.round(Math.max(0, Math.min(255, a)));
      if (a > OPAQUE_CUTOFF) {
        opaqueCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const totalPixels = w * h;
  const opaqueFraction = opaqueCount / totalPixels;
  // Nothing plausible left (background wasn't removed) or nothing plausible
  // remains (background removal ate the whole photo) — both mean "this
  // didn't work", not "here's an empty garment".
  if (opaqueFraction > 0.97 || opaqueFraction < 0.015 || maxX < minX || maxY < minY) {
    return null;
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  outCanvas.getContext('2d').putImageData(imgData, 0, 0);

  return {
    canvas: outCanvas,
    bbox: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}
