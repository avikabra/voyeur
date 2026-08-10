// Piecewise-affine quad-to-quad image warp, implemented from scratch with
// plain 2D canvas transforms — no libraries, no WebGL. This is classical
// texture-mapping: split each quad into two triangles, solve the unique 2x3
// affine matrix that maps each source triangle onto its destination
// triangle exactly (3 point correspondences fully determine an affine map),
// then use ctx.clip() + ctx.transform() + ctx.drawImage() to paint the
// source pixels through that mapping, one triangle at a time.
//
// An affine map cannot reproduce true perspective (a quad warp is only
// exact at the 4 corners; the interior is a bilinear-ish approximation split
// along the diagonal) and it cannot simulate fabric drape or occlusion by
// the body. That's a known, accepted limitation of this whole app — see
// manifest.limitations — not a bug in this module.

/**
 * Solves the 2x3 affine matrix [a,b,c,d,e,f] (canvas ctx.transform order)
 * mapping src[0..2] -> dst[0..2] exactly.
 * x' = a*x + c*y + e
 * y' = b*x + d*y + f
 *
 * @param {[{x,y},{x,y},{x,y}]} src
 * @param {[{x,y},{x,y},{x,y}]} dst
 * @returns {[number,number,number,number,number,number] | null} null if src
 *   is degenerate (collinear / zero area — no unique affine map exists).
 */
export function solveAffine(src, dst) {
  const [p0, p1, p2] = src;
  const [q0, q1, q2] = dst;

  const denom = p0.x * (p1.y - p2.y) + p1.x * (p2.y - p0.y) + p2.x * (p0.y - p1.y);
  if (Math.abs(denom) < 1e-9) return null;

  const a = (q0.x * (p1.y - p2.y) + q1.x * (p2.y - p0.y) + q2.x * (p0.y - p1.y)) / denom;
  const b = (q0.y * (p1.y - p2.y) + q1.y * (p2.y - p0.y) + q2.y * (p0.y - p1.y)) / denom;
  const c = (q0.x * (p2.x - p1.x) + q1.x * (p0.x - p2.x) + q2.x * (p1.x - p0.x)) / denom;
  const d = (q0.y * (p2.x - p1.x) + q1.y * (p0.x - p2.x) + q2.y * (p1.x - p0.x)) / denom;
  const e =
    (q0.x * (p1.x * p2.y - p2.x * p1.y) +
      q1.x * (p2.x * p0.y - p0.x * p2.y) +
      q2.x * (p0.x * p1.y - p1.x * p0.y)) /
    denom;
  const f =
    (q0.y * (p1.x * p2.y - p2.x * p1.y) +
      q1.y * (p2.x * p0.y - p0.x * p2.y) +
      q2.y * (p0.x * p1.y - p1.x * p0.y)) /
    denom;

  return [a, b, c, d, e, f];
}

function clipTriangle(ctx, tri) {
  ctx.beginPath();
  ctx.moveTo(tri[0].x, tri[0].y);
  ctx.lineTo(tri[1].x, tri[1].y);
  ctx.lineTo(tri[2].x, tri[2].y);
  ctx.closePath();
  ctx.clip();
}

/**
 * Warps one source triangle onto a destination triangle and draws it.
 * @param {CanvasRenderingContext2D} ctx destination context
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {[{x,y},{x,y},{x,y}]} srcTri
 * @param {[{x,y},{x,y},{x,y}]} dstTri
 */
export function warpTriangle(ctx, sourceCanvas, srcTri, dstTri) {
  const m = solveAffine(srcTri, dstTri);
  if (!m) return;
  ctx.save();
  clipTriangle(ctx, dstTri);
  ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
  ctx.drawImage(sourceCanvas, 0, 0);
  ctx.restore();
}

/**
 * Warps a full quad (source -> destination) by splitting it into two
 * triangles along the 0-2 diagonal and warping each independently.
 *
 * @param {CanvasRenderingContext2D} ctx destination context to draw into
 * @param {HTMLCanvasElement} sourceCanvas the image being warped (its own
 *   pixel space is the coordinate space srcQuad is expressed in)
 * @param {[{x,y},{x,y},{x,y},{x,y}]} srcQuad corners in source-canvas pixel
 *   space, in order [topLeft, topRight, bottomRight, bottomLeft]
 * @param {[{x,y},{x,y},{x,y},{x,y}]} dstQuad corresponding corners in
 *   destination-canvas pixel space, same winding order
 * @param {number} [opacity=1] global alpha applied to the whole warped quad
 */
export function warpQuadToQuad(ctx, sourceCanvas, srcQuad, dstQuad, opacity = 1) {
  ctx.save();
  ctx.globalAlpha = opacity;
  warpTriangle(ctx, sourceCanvas, [srcQuad[0], srcQuad[1], srcQuad[2]], [dstQuad[0], dstQuad[1], dstQuad[2]]);
  warpTriangle(ctx, sourceCanvas, [srcQuad[0], srcQuad[2], srcQuad[3]], [dstQuad[0], dstQuad[2], dstQuad[3]]);
  ctx.restore();
}
