// Garment cutout module. Classical (non-ML) background removal for product
// photos shot on a plain/near-uniform backdrop (the overwhelmingly common
// case for shop screenshots and catalog images), plus a bounding box of the
// remaining content for use as default warp anchors.
//
// Technique: sample the four image corners to estimate the background
// color, then make pixels close to that color transparent, with a feathered
// (smoothly interpolated) alpha ramp at the boundary so edges aren't jagged.
// No model, no dependency. Runs synchronously on canvas ImageData.
//
// Interface:
//   extractGarment(imageElement, opts?) -> { canvas, bbox, bgRemoved }
//   anchorsFromBBox(bbox) -> { topLeft, topRight, bottomLeft, bottomRight }
//
// This module must never throw: it's called on whatever photo the user
// picks, including non-garment photos, screenshots with UI chrome, dark
// backgrounds, flat color swatches, and thumbnails. When the background
// heuristic isn't confident, it falls back to returning the image unmodified
// rather than producing a mangled cutout.

// Fraction of an image's shorter side used for each corner sample block,
// clamped to a sane pixel range. Mirrors the "5x5 to 10x10 px" guidance in
// the spec while staying proportionate for both thumbnails and large photos.
const MIN_CORNER_BLOCK = 1;
const MAX_CORNER_BLOCK = 10;
const CORNER_BLOCK_FRACTION = 0.08;

// Redmean-distance scale (see distance() below): 0 = identical color,
// ~765 = opposite corners of RGB space (pure white vs pure black).
const DEFAULT_THRESHOLD = 28; // below this: treated as background
const DEFAULT_FEATHER = 28; // width of the transparent -> opaque ramp

// If the four corner color samples disagree with each other by more than
// this (in the same redmean-distance units), the background likely isn't
// actually uniform -- bail out rather than guess.
const CORNER_UNIFORMITY_LIMIT = 42;

// Corner samples whose own pixels are mostly already-transparent (alpha
// premultiplied out) are treated specially -- see the "pre-existing alpha"
// branch below, case (d) in the module's self-verification notes.
const CORNER_ALREADY_TRANSPARENT_LIMIT = 0.1;

// Alpha (0..1) above which a pixel counts as "visible content" for bbox and
// plausibility purposes.
const VISIBILITY_ALPHA = 0.15;

// Post-hoc plausibility bounds on how much of the image ended up visible.
// Too little visible content means the heuristic ate the whole photo
// (e.g. a flat color swatch matches its own corners perfectly -- case (b)).
// Too much / nothing removed means it found no real background to strip.
const MIN_FOREGROUND_FRACTION = 0.02;
const MIN_REMOVED_FRACTION = 0.01;

// Default inset used for the fallback bbox (full image minus a small margin)
// so callers get a plausible garment area even when we didn't touch pixels.
const FALLBACK_INSET_FRACTION = 0.05;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// "Redmean" weighted RGB distance -- a cheap, dependency-free approximation
// of perceptual color difference (better than plain Euclidean, still O(1)).
// https://en.wikipedia.org/wiki/Color_difference#sRGB
function colorDistance(r1, g1, b1, r2, g2, b2) {
  const rmean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  const weightR = 2 + rmean / 256;
  const weightG = 4;
  const weightB = 2 + (255 - rmean) / 256;
  return Math.sqrt(weightR * dr * dr + weightG * dg * dg + weightB * db * db);
}

function smoothstep(t) {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

// Builds a fully-opaque-image fallback result: unmodified pixels, a full
// bbox inset by a small margin as a reasonable default garment area.
function fallbackResult(width, height, sourceCanvas) {
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const insetX = Math.round(w * FALLBACK_INSET_FRACTION);
  const insetY = Math.round(h * FALLBACK_INSET_FRACTION);
  const bboxW = Math.max(1, w - insetX * 2);
  const bboxH = Math.max(1, h - insetY * 2);
  return {
    canvas: sourceCanvas,
    bbox: { x: insetX, y: insetY, w: bboxW, h: bboxH },
    bgRemoved: false,
  };
}

/**
 * @param {HTMLImageElement} imageElement - already loaded, naturalWidth/naturalHeight set
 * @param {{threshold?: number, feather?: number}} [opts]
 * @returns {{ canvas: HTMLCanvasElement, bbox: {x:number, y:number, w:number, h:number}, bgRemoved: boolean }}
 */
export function extractGarment(imageElement, opts) {
  const threshold =
    opts && Number.isFinite(opts.threshold) ? opts.threshold : DEFAULT_THRESHOLD;
  const feather =
    opts && Number.isFinite(opts.feather) && opts.feather > 0
      ? opts.feather
      : DEFAULT_FEATHER;

  // Defensive: never throw, whatever we're handed. Fall back to a 1x1
  // transparent-free canvas if the image is somehow unusable -- this
  // shouldn't happen given the documented contract, but the module must be
  // safe to call on anything.
  let width = 0;
  let height = 0;
  try {
    width = imageElement && imageElement.naturalWidth ? imageElement.naturalWidth : 0;
    height = imageElement && imageElement.naturalHeight ? imageElement.naturalHeight : 0;
  } catch (e) {
    width = 0;
    height = 0;
  }

  if (!width || !height || width <= 0 || height <= 0) {
    const emptyCanvas = document.createElement('canvas');
    emptyCanvas.width = 1;
    emptyCanvas.height = 1;
    return fallbackResult(1, 1, emptyCanvas);
  }

  try {
    return extractGarmentInner(imageElement, width, height, threshold, feather);
  } catch (e) {
    // Absolute last resort: draw the original image untouched.
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    try {
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imageElement, 0, 0, width, height);
    } catch (drawErr) {
      // Even drawImage failed; return an empty opaque canvas rather than throw.
    }
    return fallbackResult(width, height, canvas);
  }
}

function extractGarmentInner(imageElement, width, height, threshold, feather) {
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  sourceCtx.drawImage(imageElement, 0, 0, width, height);

  const sourceImageData = sourceCtx.getImageData(0, 0, width, height);
  const src = sourceImageData.data;

  // --- 1. Sample the four corners to estimate background color. ---
  const blockSize = clamp(
    Math.floor(Math.min(width, height) * CORNER_BLOCK_FRACTION),
    MIN_CORNER_BLOCK,
    Math.min(MAX_CORNER_BLOCK, Math.floor(Math.min(width, height) / 2) || 1)
  );

  const corners = [
    { x0: 0, y0: 0 }, // top-left
    { x0: width - blockSize, y0: 0 }, // top-right
    { x0: 0, y0: height - blockSize }, // bottom-left
    { x0: width - blockSize, y0: height - blockSize }, // bottom-right
  ];

  const cornerSamples = corners.map(({ x0, y0 }) => sampleBlock(src, width, x0, y0, blockSize));

  // Case (d): image already carries real transparency (a PNG with alpha)
  // and its corners are themselves mostly transparent. There's no opaque
  // background color to sample there, so don't try to invent one -- just
  // respect the existing alpha channel as-is. This is "don't double process
  // weirdly": we neither corrupt real alpha nor pretend we found a bg color.
  const avgCornerAlpha =
    cornerSamples.reduce((sum, s) => sum + s.alphaNorm, 0) / cornerSamples.length;

  if (avgCornerAlpha < CORNER_ALREADY_TRANSPARENT_LIMIT) {
    return respectExistingAlpha(sourceImageData, width, height, sourceCanvas);
  }

  // --- 2. Confidence check: do the corners agree with each other? ---
  // Weight corner colors by their own alpha so a corner that happens to be
  // partly transparent doesn't skew the centroid on bogus color data.
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumW = 0;
  for (const s of cornerSamples) {
    const w = Math.max(s.alphaNorm, 0.0001);
    sumR += s.r * w;
    sumG += s.g * w;
    sumB += s.b * w;
    sumW += w;
  }
  const bgR = sumR / sumW;
  const bgG = sumG / sumW;
  const bgB = sumB / sumW;

  let maxCornerDeviation = 0;
  for (const s of cornerSamples) {
    const d = colorDistance(s.r, s.g, s.b, bgR, bgG, bgB);
    if (d > maxCornerDeviation) maxCornerDeviation = d;
  }

  if (maxCornerDeviation > CORNER_UNIFORMITY_LIMIT) {
    // Corners disagree too much: background probably isn't uniform (photo
    // on a textured/busy surface, or not a product photo at all). Bail.
    return fallbackResult(width, height, sourceCanvas);
  }

  // --- 3. Per-pixel distance from estimated bg color, feathered alpha. ---
  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const outCtx = outCanvas.getContext('2d');
  const outImageData = outCtx.createImageData(width, height);
  const out = outImageData.data;

  const total = width * height;
  let removedCount = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const r = src[o];
    const g = src[o + 1];
    const b = src[o + 2];
    const a = src[o + 3];

    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;

    if (a === 0) {
      // Already-transparent pixel in a partially-alpha source image: leave
      // it transparent, don't let it participate as "visible" content.
      out[o + 3] = 0;
      removedCount++;
      continue;
    }

    const d = colorDistance(r, g, b, bgR, bgG, bgB);
    // d <= threshold: fully background -> alpha 0.
    // d >= threshold + feather: fully foreground -> alpha 1.
    // in between: smoothstep ramp, avoiding a hard/aliased edge.
    const t = (d - threshold) / feather;
    const alphaBg = smoothstep(t);
    const finalAlphaNorm = alphaBg * (a / 255);
    const finalAlpha = Math.round(finalAlphaNorm * 255);
    out[o + 3] = finalAlpha;

    if (finalAlphaNorm > VISIBILITY_ALPHA) {
      const x = i % width;
      const y = (i / width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    } else {
      removedCount++;
    }
  }

  const foregroundCount = total - removedCount;
  const foregroundFraction = foregroundCount / total;
  const removedFraction = removedCount / total;

  // --- 4. Plausibility check on the result. ---
  // Case (b), a flat single-color swatch: corners agree perfectly with the
  // rest of the image (low corner deviation, passes check above), but then
  // *every* pixel matches the "background" color -> foregroundFraction ends
  // up ~0 here, which trips this guard and we fall back safely instead of
  // returning an empty/degenerate cutout.
  if (foregroundFraction < MIN_FOREGROUND_FRACTION || maxX < minX || maxY < minY) {
    return fallbackResult(width, height, sourceCanvas);
  }
  // Nothing was removed at all -> the heuristic didn't find real background
  // to strip (e.g. a busy/non-product photo that happened to pass the
  // corner-uniformity check by coincidence). Don't claim success.
  if (removedFraction < MIN_REMOVED_FRACTION) {
    return fallbackResult(width, height, sourceCanvas);
  }

  outCtx.putImageData(outImageData, 0, 0);

  const bbox = {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  };

  return { canvas: outCanvas, bbox, bgRemoved: true };
}

// Averages a block of pixels, weighting the color by each pixel's own alpha
// so partially/fully transparent samples don't distort the color estimate.
// Returns alphaNorm (mean alpha, 0..1) alongside the weighted color.
function sampleBlock(data, width, x0, y0, size) {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumA = 0;
  let count = 0;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const x = x0 + dx;
      const y = y0 + dy;
      const o = (y * width + x) * 4;
      const a = data[o + 3];
      sumR += data[o] * a;
      sumG += data[o + 1] * a;
      sumB += data[o + 2] * a;
      sumA += a;
      count++;
    }
  }
  const alphaNorm = count > 0 ? sumA / (count * 255) : 0;
  if (sumA > 0) {
    return { r: sumR / sumA, g: sumG / sumA, b: sumB / sumA, alphaNorm };
  }
  // Every sampled pixel in this corner was fully transparent: no color info.
  return { r: 0, g: 0, b: 0, alphaNorm };
}

// Case (d) branch: the source already has a meaningful alpha channel and its
// corners are themselves already (mostly) transparent, so there's no opaque
// backdrop color to detect. Pass the existing alpha straight through and
// compute the bbox from it, rather than guessing a background color from
// noise. If that leaves nothing visible (a fully-transparent image) or
// everything visible in a way we can't trust, fall back honestly instead of
// fabricating a result.
function respectExistingAlpha(sourceImageData, width, height, sourceCanvas) {
  const src = sourceImageData.data;
  const total = width * height;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let visibleCount = 0;

  for (let i = 0; i < total; i++) {
    const a = src[i * 4 + 3];
    if (a / 255 > VISIBILITY_ALPHA) {
      visibleCount++;
      const x = i % width;
      const y = (i / width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (visibleCount === 0 || visibleCount / total < MIN_FOREGROUND_FRACTION) {
    // Effectively a blank/fully-transparent image -- nothing sensible to
    // return as a garment. Fall back rather than emit a zero-size bbox.
    return fallbackResult(width, height, sourceCanvas);
  }

  return {
    canvas: sourceCanvas,
    bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    bgRemoved: true,
  };
}

/**
 * @param {{x:number,y:number,w:number,h:number}} bbox
 * @returns {{ topLeft:{x:number,y:number}, topRight:{x:number,y:number}, bottomLeft:{x:number,y:number}, bottomRight:{x:number,y:number} }}
 */
export function anchorsFromBBox(bbox) {
  const x = bbox && Number.isFinite(bbox.x) ? bbox.x : 0;
  const y = bbox && Number.isFinite(bbox.y) ? bbox.y : 0;
  const w = bbox && Number.isFinite(bbox.w) ? bbox.w : 0;
  const h = bbox && Number.isFinite(bbox.h) ? bbox.h : 0;

  return {
    topLeft: { x, y },
    topRight: { x: x + w, y },
    bottomLeft: { x, y: y + h },
    bottomRight: { x: x + w, y: y + h },
  };
}
