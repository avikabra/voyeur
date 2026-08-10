// Piecewise-affine mesh warp: maps a source quadrilateral region of an
// image onto an arbitrary destination quadrilateral on a canvas, by
// splitting both quads into two triangles (same split pattern on each,
// so triangle N of the source corresponds to triangle N of the
// destination) and solving a per-triangle affine transform for each pair.
//
// This is the standard piecewise-affine warp technique used to map a
// roughly-rectangular image (e.g. a garment cutout) onto a quad whose
// corners come from body landmarks and therefore aren't axis-aligned or
// even a parallelogram (shoulders wider than hips, a slight camera tilt,
// etc). No dependencies, Canvas 2D API only.
//
// Interface:
//   drawWarpedQuad(ctx, sourceImage, srcQuad, dstQuad, opts) -> void
//     See the JSDoc on drawWarpedQuad below for the exact contract.
//     Pure side effect: draws pixels onto ctx. Restores ctx state (including
//     transform, clip path, and globalAlpha) to what it was on entry, so
//     it's safe to call repeatedly per frame or interleaved with other
//     canvas drawing.

// Diagonal split shared by both quads: quad = [topLeft, topRight,
// bottomLeft, bottomRight]. Triangle A = [TL, TR, BL], Triangle B =
// [TR, BR, BL]. Using the same index pattern on src and dst is what makes
// the two triangles correspond to each other.
const TRIANGLE_A_INDICES = [0, 1, 2]; // topLeft, topRight, bottomLeft
const TRIANGLE_B_INDICES = [1, 3, 2]; // topRight, bottomRight, bottomLeft

// Below this, the source triangle's area is close enough to zero that the
// closed-form solve would divide by (near) zero, producing NaN/Infinity
// coefficients that would corrupt the whole canvas via a broken clip +
// transform. Skip the triangle instead.
const MIN_TRIANGLE_DETERMINANT = 1e-6;

/**
 * Solve the unique 2D affine transform (x' = a*x + b*y + c,
 * y' = d*x + e*y + f) that maps a source triangle's 3 vertices exactly
 * onto a destination triangle's 3 vertices.
 *
 * Closed form via change of basis: let v1 = src[1]-src[0], v2 = src[2]-src[0]
 * be the source triangle's edge vectors from its first vertex, and
 * w1 = dst[1]-dst[0], w2 = dst[2]-dst[0] the destination's. The linear part
 * L of the affine map must satisfy L*v1 = w1 and L*v2 = w2, i.e.
 * L * [v1 v2] = [w1 w2] as 2x2 matrices (columns v1,v2 / w1,w2). So
 * L = [w1 w2] * [v1 v2]^-1, computed directly via the 2x2 inverse formula.
 * The translation is then whatever maps src[0] to dst[0] under L.
 *
 * @param {[{x,y},{x,y},{x,y}]} srcTri
 * @param {[{x,y},{x,y},{x,y}]} dstTri
 * @returns {{a:number,b:number,c:number,d:number,e:number,f:number}|null}
 *   null if the source triangle is degenerate (near-zero area).
 */
function solveTriangleAffine(srcTri, dstTri) {
  const [s0, s1, s2] = srcTri;
  const [d0, d1, d2] = dstTri;

  const v1x = s1.x - s0.x;
  const v1y = s1.y - s0.y;
  const v2x = s2.x - s0.x;
  const v2y = s2.y - s0.y;

  // det([v1 v2]) = twice the signed area of the source triangle.
  const det = v1x * v2y - v2x * v1y;
  if (!Number.isFinite(det) || Math.abs(det) < MIN_TRIANGLE_DETERMINANT) {
    return null;
  }

  const w1x = d1.x - d0.x;
  const w1y = d1.y - d0.y;
  const w2x = d2.x - d0.x;
  const w2y = d2.y - d0.y;

  // L = [w1 w2] * [v1 v2]^-1, where [v1 v2]^-1 = (1/det) * [ v2y -v2x; -v1y v1x ]
  const a = (w1x * v2y - w2x * v1y) / det;
  const b = (w2x * v1x - w1x * v2x) / det;
  const d = (w1y * v2y - w2y * v1y) / det;
  const e = (w2y * v1x - w1y * v2x) / det;

  // Translation: T(s0) = d0, i.e. c,f such that a*s0.x + b*s0.y + c = d0.x
  const c = d0.x - (a * s0.x + b * s0.y);
  const f = d0.y - (d * s0.x + e * s0.y);

  if (![a, b, c, d, e, f].every(Number.isFinite)) return null;

  return { a, b, c, d, e, f };
}

/**
 * Draw the full sourceImage through the affine transform that maps srcTri
 * onto dstTri, clipped to dstTri so only the correct triangle ends up
 * visible. Composes with whatever transform is already active on ctx
 * (rather than resetting to identity), so this behaves correctly even if
 * the caller has e.g. a device-pixel-ratio scale set up already. Fully
 * scoped in its own save/restore.
 */
function drawTriangle(ctx, sourceImage, srcTri, dstTri) {
  const t = solveTriangleAffine(srcTri, dstTri);
  if (!t) return; // degenerate source triangle: skip, don't touch ctx state

  ctx.save();

  ctx.beginPath();
  ctx.moveTo(dstTri[0].x, dstTri[0].y);
  ctx.lineTo(dstTri[1].x, dstTri[1].y);
  ctx.lineTo(dstTri[2].x, dstTri[2].y);
  ctx.closePath();
  ctx.clip();

  // Compose the solved transform with ctx's current transform, so
  // setTransform below produces (existing CTM) ∘ (our triangle transform)
  // rather than clobbering any transform the caller already had set up.
  // Canvas's matrix convention: x' = a*x + c*y + e, y' = b*x + d*y + f
  // (i.e. setTransform(a, b, c, d, e, f) — note b/c are swapped relative
  // to our a..f naming above, which follows the "x' = a*x+b*y+c" convention
  // stated in this module's own math instead).
  const base = ctx.getTransform();
  const combined = {
    a: base.a * t.a + base.c * t.d,
    b: base.b * t.a + base.d * t.d,
    c: base.a * t.b + base.c * t.e,
    d: base.b * t.b + base.d * t.e,
    e: base.a * t.c + base.c * t.f + base.e,
    f: base.b * t.c + base.d * t.f + base.f,
  };
  ctx.setTransform(combined.a, combined.b, combined.c, combined.d, combined.e, combined.f);

  ctx.drawImage(sourceImage, 0, 0);

  ctx.restore();
}

/**
 * Warp `sourceImage`'s src quad onto ctx's canvas at dst quad, via a
 * 2-triangle piecewise-affine warp.
 *
 * @param {CanvasRenderingContext2D} ctx - target context to draw onto
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} sourceImage
 * @param {[{x,y},{x,y},{x,y},{x,y}]} srcQuad - [topLeft, topRight, bottomLeft, bottomRight],
 *   in sourceImage's own pixel coordinate space (0,0 = image's top-left)
 * @param {[{x,y},{x,y},{x,y},{x,y}]} dstQuad - [topLeft, topRight, bottomLeft, bottomRight],
 *   in ctx's canvas pixel coordinate space
 * @param {{opacity?: number}} [opts] - opacity 0..1, default 1
 * @returns {void}
 */
export function drawWarpedQuad(ctx, sourceImage, srcQuad, dstQuad, opts = {}) {
  if (!ctx || !sourceImage || !srcQuad || !dstQuad) return;
  if (srcQuad.length !== 4 || dstQuad.length !== 4) return;

  const rawOpacity = opts && opts.opacity !== undefined ? opts.opacity : 1;
  const opacity = Number.isFinite(rawOpacity) ? Math.max(0, Math.min(1, rawOpacity)) : 1;

  const srcA = TRIANGLE_A_INDICES.map((i) => srcQuad[i]);
  const dstA = TRIANGLE_A_INDICES.map((i) => dstQuad[i]);
  const srcB = TRIANGLE_B_INDICES.map((i) => srcQuad[i]);
  const dstB = TRIANGLE_B_INDICES.map((i) => dstQuad[i]);

  ctx.save();
  ctx.globalAlpha = opacity;

  drawTriangle(ctx, sourceImage, srcA, dstA);
  drawTriangle(ctx, sourceImage, srcB, dstB);

  ctx.restore();
}
