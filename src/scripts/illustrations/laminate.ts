// Side view of a thermoplastic tape laminate between punch and die, shared by T2 and M4.
// Four unidirectional tape plies (0°, 90°, 90°, 0°) are each drawn as their own row of elements;
// fibres along the section show as lines, fibre ends across it as dots. The fibres barely stretch,
// so each ply keeps its length along its own path: where the stack bends around a tool, the plies
// slide against each other and the marker lines through the stack become stepped, where a metal
// sheet would stretch instead. The laminate hangs from the grippers above the die until the punch
// forms it.
import { clamp, lerp } from './engine';

export type XY = { x: number; y: number };
// tag: 0 free, 1 under the punch nose, 2 around the punch corner, 3 around the die shoulder, 4 along the wall
export type Pt = XY & { tag: number };
/** Tool geometry, all measured from the centre line cx. */
export type Tools = {
  cx: number;
  top: number; // mid-surface level of a laminate lying on the die
  clear: number; // mid-surface to tool surface
  hold: number; // the grippers hold the laminate this far above the die
  wb: number; // punch half-width
  wd: number; // die opening half-width
  half: number; // half-length of the laminate
};

export const PLIES = [0, 90, 90, 0]; // fibre angle of each ply, top to bottom

const rot = (x: number, y: number, a: number) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });

// Tangent point on a circle (centre o, radius r) of the line towards g. side 1 keeps the circle
// to the left of that direction (the laminate passes below it), -1 to the right (above it).
function tangent(o: XY, r: number, g: XY, side: number): XY {
  const vx = g.x - o.x, vy = g.y - o.y, d = Math.hypot(vx, vy);
  const u = rot(vx / d, vy / d, side * Math.acos(Math.min(1, r / d)));
  return { x: o.x + r * u.x, y: o.y + r * u.y };
}

type Shape = { wraps: boolean; G: XY; T1: XY; a1: number; length: number; U2?: XY; T3?: XY; a2?: number; a3?: number };

/**
 * Mid-surface for x >= 0 (relative to cx), from the centre to the gripper, for a punch travel
 * `stroke` below the gripper level. It runs flat under the punch, wraps the punch corner and spans
 * straight to the gripper; once that span reaches the die shoulder it wraps the shoulder too and
 * rises to the gripper. Without `xg` the laminate keeps its length, which sets where the gripper
 * has been drawn in to; with `xg` the gripper position is given.
 */
export function shape(g: Tools, stroke: number, xg?: number): Pt[] {
  const c = g.clear;
  const yg = g.top - g.hold;
  const P = { x: g.wb - c, y: yg - c + stroke }; // punch corner
  const D = { x: g.wd, y: g.top + c }; // die shoulder
  const ang = (q: XY, o: XY) => Math.atan2(q.y - o.y, q.x - o.x);
  const build = (x: number): Shape => {
    const G = { x, y: yg };
    const T1 = tangent(P, c, G, 1);
    const a1 = ang(T1, P);
    const dx = G.x - T1.x, dy = G.y - T1.y, span = Math.hypot(dx, dy);
    const clearance = ((D.x - T1.x) * -dy + (D.y - T1.y) * dx) / span; // how far the die corner lies below the span
    if (clearance >= c) return { wraps: false, G, T1, a1, length: P.x + c * (Math.PI / 2 - a1) + span };
    const L = Math.hypot(D.x - P.x, D.y - P.y);
    const dir = Math.atan2(D.y - P.y, D.x - P.x) - Math.asin(Math.min(1, (2 * c) / L));
    const U1 = { x: P.x - c * Math.sin(dir), y: P.y + c * Math.cos(dir) };
    const U2 = { x: D.x + c * Math.sin(dir), y: D.y - c * Math.cos(dir) };
    const T3 = tangent(D, c, G, -1);
    const a2 = dir - Math.PI / 2, a3 = ang(T3, D);
    const length = P.x - c * dir + Math.hypot(U2.x - U1.x, U2.y - U1.y) + c * Math.abs(a3 - a2) + Math.hypot(G.x - T3.x, G.y - T3.y);
    return { wraps: true, G, T1: U1, a1: Math.PI / 2 + dir, U2, T3, a2, a3, length };
  };
  let s: Shape;
  if (xg !== undefined) s = build(xg);
  else {
    let lo = g.wd + 2 * c, hi = g.half;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (build(mid).length > g.half) hi = mid;
      else lo = mid;
    }
    s = build((lo + hi) / 2);
  }
  const pts: Pt[] = [];
  const line = (a: XY, b: XY, n: number, tag: number) => {
    for (let i = 0; i < n; i++) pts.push({ x: lerp(a.x, b.x, i / n), y: lerp(a.y, b.y, i / n), tag });
  };
  const arc = (o: XY, a0: number, a1: number, tag: number) => {
    for (let i = 0; i < 16; i++) pts.push({ x: o.x + c * Math.cos(lerp(a0, a1, i / 16)), y: o.y + c * Math.sin(lerp(a0, a1, i / 16)), tag });
  };
  line({ x: 0, y: P.y + c }, { x: P.x, y: P.y + c }, 60, 1);
  arc(P, Math.PI / 2, s.a1, 2);
  if (!s.wraps) line(s.T1, s.G, 120, 0);
  else {
    line(s.T1, s.U2!, 80, 4);
    arc(D, s.a2!, s.a3!, 3);
    line(s.T3!, s.G, 60, 0);
  }
  pts.push({ ...s.G, tag: 0 });
  return pts;
}

/**
 * Matched tools: at full stroke the laminate's wall runs straight from the punch corner to the die
 * shoulder, so the die wall and the punch wall are drawn parallel to it, one mid-surface distance
 * away on either side, and the laminate is pressed between them. `depth` is the die cavity depth.
 * Returns the cotangent of the wall angle and the half-width of the die bottom.
 */
export function matchedTools(g: Tools, depth: number) {
  const c = g.clear;
  const P = { x: g.wb - c, y: g.top + depth - c }; // punch corner at full stroke
  const D = { x: g.wd, y: g.top + c }; // die shoulder
  const L = Math.hypot(D.x - P.x, D.y - P.y);
  const dir = Math.atan2(D.y - P.y, D.x - P.x) - Math.asin(Math.min(1, (2 * c) / L));
  const cot = Math.cos(dir) / -Math.sin(dir);
  return { cot, bottom: g.wd - depth * cot };
}

/**
 * The whole mid-surface, left end to right end, when the grippers hold back unequally: the laminate
 * slides over the punch by `shift` towards the left (negative: towards the right), so the part from
 * the punch centre to the left gripper is `shift` longer than half the laminate and the right part
 * as much shorter; the total length stays the same. Sampled at equal arc length into 2n pieces, so
 * index n is the middle of the laminate and each index the same piece of material.
 */
export function slid(g: Tools, stroke: number, shift: number, n: number): Pt[] {
  const left = shape({ ...g, half: g.half + shift }, stroke);
  const right = shape({ ...g, half: g.half - shift }, stroke);
  const whole = [...left.slice(1).reverse().map((q) => ({ ...q, x: g.cx - q.x })), ...right.map((q) => ({ ...q, x: g.cx + q.x }))];
  return resample(whole, 2 * n);
}

/** Points at equal arc length over the whole path, so each index is the same piece of material. */
export function resample(pts: Pt[], n: number): Pt[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const length = cum[cum.length - 1];
  const out: Pt[] = [];
  let j = 1;
  for (let i = 0; i <= n; i++) {
    const target = (i / n) * length;
    while (j < cum.length - 1 && cum[j] < target) j++;
    const q = clamp((target - cum[j - 1]) / Math.max(cum[j] - cum[j - 1], 1e-6));
    out.push({ x: lerp(pts[j - 1].x, pts[j].x, q), y: lerp(pts[j - 1].y, pts[j].y, q), tag: pts[j - 1].tag });
  }
  return out;
}

/** The whole mid-surface from a half path (x >= 0 relative to cx): left end to right end, index n is the centre. */
export function mirror(halfPath: Pt[], cx: number, n: number): Pt[] {
  const half = resample(halfPath, n).map((q) => ({ ...q, x: cx + q.x }));
  return [...half.slice(1).reverse().map((q) => ({ ...q, x: 2 * cx - q.x })), ...half];
}

/**
 * Draw the laminate along the mid-surface M (left to right, centre at index n). `fill(f, p)` gives
 * the colour of the element around sample f in ply p. Element edges and fibre symbols are left out
 * when the plies are too thin to show them.
 */
export function drawLaminate(
  ctx: CanvasRenderingContext2D,
  M: Pt[],
  n: number,
  o: { thick: number; scale: number; elements: number; mark: number; fill: (f: number, p: number) => string },
) {
  const N = M.map((_, i) => {
    const a = M[Math.max(i - 1, 0)], b = M[Math.min(i + 1, M.length - 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  });
  const h1 = o.thick / PLIES.length;
  const zOf = (p: number) => (p - (PLIES.length - 1) / 2) * h1; // offset of a ply's centre, top ply first
  const pos = (f: number, z: number): XY => {
    const i = Math.min(Math.floor(f), M.length - 2), q = f - i;
    const nx = lerp(N[i].x, N[i + 1].x, q), ny = lerp(N[i].y, N[i + 1].y, q), nl = Math.hypot(nx, ny) || 1;
    return { x: lerp(M[i].x, M[i + 1].x, q) + (nx / nl) * z, y: lerp(M[i].y, M[i + 1].y, q) + (ny / nl) * z };
  };
  // Each ply keeps its length along its own path, measured from the centre (symmetry). Where the
  // plies bend around a tool at different distances from the mid-surface, they slide against each
  // other; the small remainder at the ends is spread out so the plies meet in the grippers.
  const mid = new Float32Array(M.length);
  for (let i = n + 1; i < M.length; i++) mid[i] = mid[i - 1] + Math.hypot(M[i].x - M[i - 1].x, M[i].y - M[i - 1].y);
  for (let i = n - 1; i >= 0; i--) mid[i] = mid[i + 1] - Math.hypot(M[i].x - M[i + 1].x, M[i].y - M[i + 1].y);
  const halfR = mid[M.length - 1], halfL = -mid[0];
  const plyLength = PLIES.map((_, p) => {
    const z = zOf(p), L = new Float32Array(M.length);
    const q = (i: number) => ({ x: M[i].x + N[i].x * z, y: M[i].y + N[i].y * z });
    for (let i = n + 1; i < M.length; i++) { const a = q(i - 1), b = q(i); L[i] = L[i - 1] + Math.hypot(b.x - a.x, b.y - a.y); }
    for (let i = n - 1; i >= 0; i--) { const a = q(i + 1), b = q(i); L[i] = L[i + 1] - Math.hypot(b.x - a.x, b.y - a.y); }
    const kr = halfR / L[M.length - 1], kl = halfL / -L[0];
    for (let i = 0; i < M.length; i++) L[i] *= i >= n ? kr : kl;
    return L;
  });
  // fractional sample index where ply p holds the material at signed distance m from the centre
  const where = (p: number, m: number) => {
    const L = plyLength[p];
    let lo = 0, hi = L.length - 1;
    if (m <= L[lo]) return lo;
    if (m >= L[hi]) return hi;
    while (hi - lo > 1) { const c = (lo + hi) >> 1; if (L[c] <= m) lo = c; else hi = c; }
    return lo + (m - L[lo]) / Math.max(L[hi] - L[lo], 1e-6);
  };

  const fills = new Map<string, Path2D>();
  const edges = new Path2D(), markers = new Path2D(), fibres = new Path2D(), ends = new Path2D();
  const detail = h1 >= 2.6;
  for (let p = 0; p < PLIES.length; p++) {
    const z = zOf(p);
    const f = Array.from({ length: 2 * o.elements + 1 }, (_, k) => where(p, lerp(-halfL, halfR, k / (2 * o.elements))));
    for (let k = 0; k < 2 * o.elements; k++) {
      // one element: along the ply's upper edge, then back along its lower edge
      const a = f[k], b = f[k + 1];
      const steps = [a];
      for (let v = Math.floor(a) + 1; v < b; v++) steps.push(v);
      steps.push(b);
      const poly = new Path2D();
      steps.forEach((v, j) => { const q = pos(v, z - h1 / 2); poly[j ? 'lineTo' : 'moveTo'](q.x, q.y); });
      for (let j = steps.length - 1; j >= 0; j--) { const q = pos(steps[j], z + h1 / 2); poly.lineTo(q.x, q.y); }
      poly.closePath();
      const colour = o.fill((a + b) / 2, p);
      let bucket = fills.get(colour);
      if (!bucket) fills.set(colour, (bucket = new Path2D()));
      bucket.addPath(poly);
    }
    for (let k = 0; k <= 2 * o.elements; k++) {
      const target = k % o.mark === 0 ? markers : detail ? edges : null;
      if (!target) continue;
      const q0 = pos(f[k], z - h1 / 2), q1 = pos(f[k], z + h1 / 2);
      target.moveTo(q0.x, q0.y); target.lineTo(q1.x, q1.y);
    }
    if (!detail) continue;
    if (PLIES[p] === 0) {
      // fibres along the section: lines inside the ply
      for (const zz of [z - h1 / 5, z + h1 / 5]) M.forEach((_, i) => { const q = pos(i, zz); fibres[i ? 'lineTo' : 'moveTo'](q.x, q.y); });
    } else {
      // fibres across the section: their cut ends, carried with the ply
      const gap = h1 * 1.25;
      for (let m = -halfL + gap / 2; m < halfR; m += gap) {
        const q = pos(where(p, m), z);
        ends.moveTo(q.x + h1 * 0.2, q.y); ends.arc(q.x, q.y, h1 * 0.2, 0, Math.PI * 2);
      }
    }
  }

  const u = Math.min(1.2, o.scale);
  for (const [colour, path] of fills) { ctx.fillStyle = colour; ctx.fill(path); }
  ctx.lineWidth = Math.max(0.35, 0.45 * u);
  ctx.strokeStyle = 'rgba(40,44,48,0.28)'; ctx.stroke(fibres);
  ctx.fillStyle = 'rgba(40,44,48,0.42)'; ctx.fill(ends);
  ctx.strokeStyle = 'rgba(55,61,66,0.32)'; ctx.stroke(edges);
  // ply interfaces (left out where the plies are too thin to show between them) and the outer faces
  const along = (z: number) => { const l = new Path2D(); M.forEach((_, i) => { const q = pos(i, z); l[i ? 'lineTo' : 'moveTo'](q.x, q.y); }); return l; };
  ctx.strokeStyle = 'rgba(55,61,66,0.55)'; ctx.lineWidth = Math.max(0.45, 0.6 * u);
  if (h1 >= 1.2) for (let p = 1; p < PLIES.length; p++) ctx.stroke(along(zOf(p) - h1 / 2));
  ctx.strokeStyle = '#4f585e'; ctx.lineWidth = Math.max(0.7, u);
  ctx.stroke(along(-o.thick / 2)); ctx.stroke(along(o.thick / 2));
  ctx.strokeStyle = 'rgba(33,37,41,0.85)'; ctx.lineWidth = Math.max(0.8, 1.1 * u); ctx.stroke(markers);
}
