// Hero illustration of the Research Unit's aim: every new geometry or material
// starts as an immature process, and knowledge carried over from earlier
// variants lets each new one mature in fewer trials. Schematic, not data: the
// shapes and the two material looks are generic and name no real part or fibre.
// Each variant grows out of the one before, and after the last the first forms
// again, so the loop has no seam: nothing fades out, pops or jumps.
import { clamp, easeInOut, label, lerp, mix, register } from './engine';

const EXT = 1.3; // sheet half-size (model units)
const WALL = 0.14;
const WAVES = 14;
const A0 = 0.075;
const ROT = (-16 * Math.PI) / 180;
const Z_SCALE = 1.15;
const MATURE = 0.9;
const MORPH = 1.0;
const TRIAL = 0.28;
const HOLD = 1.0;

type Shape = { name: string; sd: (x: number, y: number) => number; depth: number; profile?: (x: number, y: number) => number };
type Variant = { change: string; shape: number; glass: number; tau: number };

const roundRect = (a: number, b: number, r: number) => (x: number, y: number) => {
  const qx = Math.abs(x) - a + r;
  const qy = Math.abs(y) - b + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};

// The double dome follows the ESAFORM forming benchmark: an elongated part with a
// stadium-shaped outline, steep walls and two domes along its long axis.
const dome = (cx: number) => (x: number, y: number) => Math.sqrt(clamp(1 - ((x - cx) / 0.56) ** 2 - (y / 0.44) ** 2));
const SHAPES: Shape[] = [
  { name: 'Box-shaped part', sd: roundRect(0.62, 0.46, 0.2), depth: 0.36 },
  { name: 'Double dome', sd: roundRect(0.98, 0.44, 0.44), depth: 0.4,
    profile: (x, y) => 0.6 + 0.4 * Math.max(dome(-0.46)(x, y), dome(0.46)(x, y)) },
];

// Three variants: a first process, a new geometry, then the same geometry in a new
// material. Kept short on purpose; the site names no real part, fibre or result.
// The trial counts express an aim schematically; they are not measured results.
const variant = (shape: number, glass: number, trials: number, change: string): Variant => ({
  change,
  shape,
  glass,
  tau: (trials - 0.4) / -Math.log(1 - MATURE),
});
const VARIANTS: Variant[] = [
  variant(0, 0, 8, 'First process'),
  variant(1, 0, 5, 'New geometry'),
  variant(1, 1, 3, 'New material'),
];
const trialsToMature = (tau: number) => Math.ceil(-tau * Math.log(1 - MATURE));
const quality = (n: number, tau: number) => 1 - Math.exp(-n / tau);
const N_MAX = Math.max(...VARIANTS.map((v) => trialsToMature(v.tau))) + 2;
const DUR = VARIANTS.map((v) => MORPH + trialsToMature(v.tau) * TRIAL + HOLD);
const CYCLE = DUR.reduce((a, b) => a + b, 0);

const smoothstep = (e0: number, e1: number, x: number) => {
  const u = clamp((x - e0) / (e1 - e0));
  return u * u * (3 - 2 * u);
};

function surface(v: Shape, x: number, y: number) {
  const d = v.sd(x, y);
  const z = -v.depth * (v.profile?.(x, y) ?? 1) * (1 - smoothstep(-WALL, WALL, d));
  const wr = Math.exp(-(((d - 0.17) / 0.13) ** 2)) * Math.sin(WAVES * Math.atan2(y, x));
  return { z, wr, d };
}

// A variant first morphs out of the previous one (after the last, the first forms
// again), then runs its trials and holds. Its wrinkles grow from what was left on the
// matured part while the shape changes, then shrink with every trial.
function state(t: number) {
  let u = ((t % CYCLE) + CYCLE) % CYCLE;
  let i = 0;
  while (i < VARIANTS.length - 1 && u >= DUR[i]) u -= DUR[i++];
  const prev = (i + VARIANTS.length - 1) % VARIANTS.length;
  const morph = easeInOut(clamp(u / MORPH));
  const n = clamp((u - MORPH) / TRIAL, 0, trialsToMature(VARIANTS[i].tau));
  const left = 1 - quality(trialsToMature(VARIANTS[prev].tau), VARIANTS[prev].tau);
  const wrinkle = u < MORPH ? lerp(left, 1, morph) : 1 - quality(n, VARIANTS[i].tau);
  return { i, prev, morph, n, wrinkle };
}

const SHADES = 24;
const GLASS_STEPS = 100; // fine steps, so the change of material look does not flicker
const BANDS = 16;
type Sample = { z: number; wr: number; d: number; dx: number; dy: number; wx: number; wy: number; curvature: number };
type Vertex = { x: number; y: number; samples: Sample[]; X: number; Y: number; d: number; shade: number; defect: number; visible: boolean };
type Triangle = { a: number; b: number; c: number; band: number };
type S = {
  project: (x: number, y: number, z: number) => [number, number];
  plot: { x0: number; x1: number; y0: number; y1: number };
  vertices: Vertex[];
  triangles: Triangle[];
  fibres: { a: number; b: number; band: number; axis: number }[];
  edge: number[];
  colours: string[][];
  shadow: HTMLCanvasElement;
  sheen: CanvasGradient;
  area: CanvasGradient;
  halo: HTMLCanvasElement;
  unit: number;
  gridN: number;
  view: [number, number, number];
};

// Precompute surface derivatives and wrinkle curvature on a modest model-space mesh.
function sample(v: Shape, x: number, y: number): Sample {
  const e = 0.008;
  const c = surface(v, x, y);
  const l = surface(v, x - e, y), r = surface(v, x + e, y);
  const u = surface(v, x, y - e), d = surface(v, x, y + e);
  return { ...c, dx: (r.z - l.z) / (2 * e), dy: (d.z - u.z) / (2 * e),
    wx: (r.wr - l.wr) / (2 * e), wy: (d.wr - u.wr) / (2 * e),
    curvature: clamp(Math.abs(l.wr + r.wr + u.wr + d.wr - 4 * c.wr) / (e * e * 850)),
  };
}

function rgb(hex: string) { return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); }
function blend(a: number[], b: number[], t: number) { return a.map((v, i) => lerp(v, b[i], t)); }
function material(shade: number, glass: number) {
  const ramp = (a: string, b: string, c: string) => shade < 0.72
    ? blend(rgb(a), rgb(b), shade / 0.72) : blend(rgb(b), rgb(c), (shade - 0.72) / 0.28);
  return blend(ramp('#151a1d', '#3d494e', '#abb9bb'), ramp('#607a73', '#bbd1c9', '#f5fcf8'), glass);
}

register<S>('transfer', {
  still: DUR.reduce((a, b) => a + b, 0) - 0.4,
  setup(w, h) {
    const cos = Math.cos(ROT);
    const sin = Math.sin(ROT);
    const iso = (x: number, y: number, z: number): [number, number] => {
      const xr = x * cos - y * sin;
      const yr = x * sin + y * cos;
      return [(xr - yr) * Math.cos(Math.PI / 6), (xr + yr) * 0.5 - z * Z_SCALE];
    };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of [[-EXT, -EXT], [EXT, -EXT], [EXT, EXT], [-EXT, EXT]])
      for (const z of [0.08, -0.46]) {
        const [X, Y] = iso(x, y, z);
        minX = Math.min(minX, X); maxX = Math.max(maxX, X); minY = Math.min(minY, Y); maxY = Math.max(maxY, Y);
      }
    const regionH = h * 0.66;
    const pad = 8;
    const scale = Math.min((w - 2 * pad) / (maxX - minX), (regionH - 2 * pad - 20) / (maxY - minY));
    const ox = w / 2 - ((minX + maxX) / 2) * scale;
    const oy = 20 + pad + (regionH - 2 * pad - 20) / 2 - ((minY + maxY) / 2) * scale;
    const project = (x: number, y: number, z: number): [number, number] => {
      const [X, Y] = iso(x, y, z);
      return [ox + X * scale, oy + Y * scale];
    };
    const n = w < 420 ? 40 : 60;
    const vertices: Vertex[] = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const x = lerp(-EXT, EXT, i / n), y = lerp(-EXT, EXT, j / n);
      vertices.push({ x, y, samples: SHAPES.map((shape) => sample(shape, x, y)), X: 0, Y: 0, d: 0, shade: 0, defect: 0, visible: true });
    }
    const depth = (i: number) => vertices[i].x * (cos + sin) + vertices[i].y * (cos - sin);
    const extent = EXT * 2 * cos;
    const band = (indices: number[]) => Math.min(BANDS - 1, Math.floor(clamp((indices.reduce((sum, i) => sum + depth(i), 0) / indices.length + extent) / (2 * extent)) * BANDS));
    const triangles: Triangle[] = [];
    const fibres: S['fibres'] = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      triangles.push({ a, b, c, band: band([a, b, c]) }, { a: b, b: d, c, band: band([b, d, c]) });
      // strands along the fibres of the top tape ply, with a lighter strand between them
      fibres.push({ a, b, band: band([a, b]), axis: j % 2 });
    }
    const edge: number[] = [];
    for (let i = 0; i < n; i++) edge.push(i);
    for (let j = 0; j < n; j++) edge.push(j * (n + 1) + n);
    for (let i = n; i > 0; i--) edge.push(n * (n + 1) + i);
    for (let j = n; j > 0; j--) edge.push(j * (n + 1));
    const colours = Array.from({ length: GLASS_STEPS + 1 }, (_, m) => Array.from({ length: SHADES + 8 }, (_, k) => {
      const colour = k < SHADES ? material(k / (SHADES - 1), m / GLASS_STEPS)
        : rgb('#e4572e');
      return `rgb(${colour.map(Math.round).join(',')})`;
    }));
    const shadow = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    shadow.width = Math.ceil(w * dpr); shadow.height = Math.ceil(h * dpr);
    const sc = shadow.getContext('2d')!;
    sc.scale(dpr, dpr);
    sc.filter = `blur(${w * 0.022}px)`;
    sc.fillStyle = 'rgba(20,24,28,0.24)';
    sc.beginPath();
    for (const [i, [x, y]] of [[-EXT, -EXT], [EXT, -EXT], [EXT, EXT], [-EXT, EXT]].entries()) {
      const [X, Y] = project(x * 0.9, y * 0.9, -0.13);
      sc[i ? 'lineTo' : 'moveTo'](X + w * 0.008, Y + w * 0.015);
    }
    sc.closePath(); sc.fill();
    const sheen = sc.createLinearGradient(0, 0, w, regionH);
    sheen.addColorStop(0, 'rgba(255,255,255,0.23)');
    sheen.addColorStop(0.48, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(25,38,41,0.18)');
    const plot = { x0: w < 400 ? 22 : 48, x1: w - 20, y0: h * 0.73, y1: h - 28 };
    const area = sc.createLinearGradient(0, plot.y0, 0, plot.y1);
    area.addColorStop(0, 'rgba(0,150,130,0.15)'); area.addColorStop(1, 'rgba(0,150,130,0)');
    const halo = document.createElement('canvas'); halo.width = halo.height = 64;
    const hc = halo.getContext('2d')!;
    const light = hc.createRadialGradient(32, 32, 2, 32, 32, 32);
    light.addColorStop(0, 'rgba(0,150,130,0.24)'); light.addColorStop(1, 'rgba(0,150,130,0)');
    hc.fillStyle = light; hc.fillRect(0, 0, 64, 64);
    return { project, plot, vertices, triangles, fibres, edge, colours, shadow, sheen, area, halo,
      unit: clamp(w / 580, 0.6, 1.2), gridN: n, view: [Z_SCALE * (cos - sin), Z_SCALE * (cos + sin), 1] };
  },

  draw(ctx, w, h, t, s, p) {
    const st = state(t);
    const v = VARIANTS[st.i];
    const prev = VARIANTS[st.prev];
    const amp = A0 * st.wrinkle;
    const glass = lerp(prev.glass, v.glass, st.morph);

    // Lambert lighting and a restrained specular highlight, both from the top left.
    for (const pt of s.vertices) {
      const a = pt.samples[prev.shape], b = pt.samples[v.shape];
      const z = lerp(a.z, b.z, st.morph) + amp * lerp(a.wr, b.wr, st.morph);
      const nx = -(lerp(a.dx, b.dx, st.morph) + amp * lerp(a.wx, b.wx, st.morph));
      const ny = -(lerp(a.dy, b.dy, st.morph) + amp * lerp(a.wy, b.wy, st.morph));
      pt.visible = s.view[0] * nx + s.view[1] * ny + s.view[2] > 0;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const diffuse = Math.max(0, (-0.6 * nx - 0.25 * ny + 0.76) * inv);
      const specular = Math.pow(Math.max(0, (-0.31 * nx - 0.13 * ny + 0.942) * inv), 32);
      pt.d = lerp(a.d, b.d, st.morph);
      const cavity = clamp(-z / 0.46) * Math.exp(-(((pt.d + 0.08) / 0.16) ** 2));
      pt.shade = clamp(0.09 + 0.70 * diffuse + 0.25 * specular - 0.16 * cavity);
      pt.defect = lerp(a.curvature, b.curvature, st.morph) * st.wrinkle;
      [pt.X, pt.Y] = s.project(pt.x, pt.y, z);
    }
    // Depth bands keep the near wall in front; back-facing triangles are hidden.
    // Each band batches the mesh into 24 neutral shades and 8 wrinkle tints.
    const paths = Array.from({ length: BANDS }, () => new Map<number, Path2D>());
    for (const tri of s.triangles) {
      const a = s.vertices[tri.a], b = s.vertices[tri.b], c = s.vertices[tri.c];
      if ((b.X - a.X) * (c.Y - a.Y) - (b.Y - a.Y) * (c.X - a.X) <= 0) continue;
      const defect = (a.defect + b.defect + c.defect) / 3;
      const shade = Math.round((a.shade + b.shade + c.shade) / 3 * (SHADES - 1));
      const keys = defect > 0.04 ? [shade, SHADES + Math.min(7, Math.floor(defect * 8))] : [shade];
      for (const k of keys) {
        let path = paths[tri.band].get(k);
        if (!path) { path = new Path2D(); paths[tri.band].set(k, path); }
        path.moveTo(a.X, a.Y); path.lineTo(b.X, b.Y); path.lineTo(c.X, c.Y); path.closePath();
      }
    }
    const fibrePaths = Array.from({ length: BANDS }, () => [new Path2D(), new Path2D()]);
    for (const edge of s.fibres) {
      const a = s.vertices[edge.a], b = s.vertices[edge.b];
      if (!a.visible || !b.visible) continue;
      fibrePaths[edge.band][edge.axis].moveTo(a.X, a.Y); fibrePaths[edge.band][edge.axis].lineTo(b.X, b.Y);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(s.shadow, 0, 0, w, h);
    const outline = new Path2D();
    s.edge.forEach((i, j) => { const pt = s.vertices[i]; outline[j ? 'lineTo' : 'moveTo'](pt.X, pt.Y); });
    outline.closePath();
    ctx.save(); ctx.translate(0, 4.5 * s.unit);
    ctx.fillStyle = mix('#101619', '#687f77', glass); ctx.fill(outline); ctx.restore();
    const colours = s.colours[Math.round(glass * GLASS_STEPS)];
    for (let band = 0; band < BANDS; band++) {
      ctx.globalAlpha = 1;
      ctx.lineWidth = 0.6;
      for (let k = 0; k < SHADES + 8; k++) {
        const path = paths[band].get(k);
        if (!path) continue;
        ctx.globalAlpha = k < SHADES ? 1 : 0.045 + 0.075 * (k - SHADES);
        ctx.fillStyle = ctx.strokeStyle = colours[k]; ctx.fill(path);
        if (k < SHADES) ctx.stroke(path);
      }
      // Strands follow the formed surface along the fibre direction.
      ctx.globalAlpha = lerp(0.18, 0.12, glass);
      ctx.lineWidth = 0.85 * s.unit;
      ctx.strokeStyle = mix('#11191c', '#506b63', glass);
      ctx.stroke(fibrePaths[band][0]);
      ctx.globalAlpha = lerp(0.29, 0.17, glass);
      ctx.lineWidth = 0.58 * s.unit;
      ctx.strokeStyle = mix('#bac9c9', '#f7fffa', glass);
      ctx.stroke(fibrePaths[band][1]);
    }
    ctx.save(); ctx.globalAlpha = 1; ctx.clip(outline);
    ctx.fillStyle = s.sheen; ctx.fillRect(0, 0, w, h * 0.7); ctx.restore();
    // A restrained line at the bend makes the formed geometry legible without a mesh outline.
    const rim = new Path2D();
    const cross = (a: Vertex, b: Vertex): [number, number] | null => {
      if ((a.d < 0) === (b.d < 0)) return null;
      const u = a.d / (a.d - b.d);
      return [lerp(a.X, b.X, u), lerp(a.Y, b.Y, u)];
    };
    for (let j = 0; j < s.gridN; j++) for (let i = 0; i < s.gridN; i++) {
      const a = s.vertices[j * (s.gridN + 1) + i];
      const b = s.vertices[j * (s.gridN + 1) + i + 1];
      const c = s.vertices[(j + 1) * (s.gridN + 1) + i];
      const d = s.vertices[(j + 1) * (s.gridN + 1) + i + 1];
      const points = [cross(a, b), cross(b, d), cross(d, c), cross(c, a)].filter((p): p is [number, number] => p !== null);
      for (let k = 0; k + 1 < points.length; k += 2) {
        rim.moveTo(points[k][0], points[k][1]); rim.lineTo(points[k + 1][0], points[k + 1][1]);
      }
    }
    ctx.globalAlpha = lerp(0.42, 0.52, glass);
    ctx.strokeStyle = mix('#c4ced0', '#738984', glass); ctx.lineWidth = 1.05 * s.unit; ctx.stroke(rim);
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = mix('#22272b', '#718781', glass); ctx.lineWidth = 0.8 * s.unit; ctx.stroke(outline);
    ctx.globalAlpha = 1;

    label(ctx, v.change, 16, 22, p, { size: 14, weight: 600, color: p.ink, always: true });
    label(ctx, `Variant ${st.i + 1} of ${VARIANTS.length}`, 16, 40, p, { size: 12, color: p.ink2, always: true });

    // ---- learning curves: quality over trials, one per variant
    const pl = s.plot;
    const X = (n: number) => lerp(pl.x0, pl.x1, n / N_MAX);
    const Y = (qq: number) => lerp(pl.y1, pl.y0, qq);
    ctx.strokeStyle = p.faint;
    ctx.lineWidth = s.unit;
    ctx.beginPath();
    ctx.moveTo(pl.x0, pl.y0 - 4);
    ctx.lineTo(pl.x0, pl.y1);
    ctx.lineTo(pl.x1, pl.y1);
    ctx.stroke();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = p.grey;
    ctx.beginPath();
    ctx.moveTo(pl.x0, Y(MATURE));
    ctx.lineTo(pl.x1, Y(MATURE));
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, 'mature', pl.x1, Y(MATURE) - 6, p, { size: 11, align: 'right', color: p.ink2 });
    label(ctx, 'Quality', pl.x0 - 8, pl.y0 + 4, p, { size: 11, align: 'right', color: p.ink2 });
    label(ctx, 'Trials', pl.x1, pl.y1 + 16, p, { size: 11, align: 'right', color: p.ink2 });

    // One learning curve up to trial nEnd: dark with its trials for the current variant, grey for
    // variants matured before. The mark where a variant reached maturity moves left from one to the next.
    const curve = (vv: Variant, nEnd: number, current: boolean, mark = true) => {
      const line = () => {
        ctx.beginPath();
        for (let k = 0; k <= 60; k++) {
          const n = (k / 60) * nEnd;
          ctx[k ? 'lineTo' : 'moveTo'](X(n), Y(quality(n, vv.tau)));
        }
      };
      if (current && nEnd > 0) {
        line();
        ctx.lineTo(X(nEnd), pl.y1); ctx.lineTo(pl.x0, pl.y1); ctx.closePath();
        ctx.fillStyle = s.area; ctx.fill();
      }
      line();
      ctx.strokeStyle = current ? p.ink : '#b9bfc5';
      ctx.lineWidth = (current ? 2 : 1) * s.unit;
      ctx.stroke();
      if (current) {
        ctx.fillStyle = p.ink;
        for (let n = 1; n <= Math.floor(nEnd); n++) {
          ctx.beginPath(); ctx.arc(X(n), Y(quality(n, vv.tau)), 2.6 * s.unit, 0, Math.PI * 2); ctx.fill();
        }
      }
      const nm = trialsToMature(vv.tau);
      if (mark && nEnd >= nm) {
        const r = 13 * s.unit;
        ctx.drawImage(s.halo, X(nm) - r, Y(MATURE) - r, 2 * r, 2 * r);
        ctx.fillStyle = p.accent;
        ctx.beginPath(); ctx.arc(X(nm), Y(MATURE), 3.7 * s.unit, 0, Math.PI * 2); ctx.fill();
      }
    };
    // While a variant forms, the curve of the one that just matured turns from dark to grey; when
    // the first variant forms again, the curves of the previous round fade out.
    VARIANTS.forEach((vv, i) => {
      const round = i < st.i ? 1 : st.i === 0 ? 1 - st.morph : 0;
      if (round <= 0) return;
      ctx.globalAlpha = round;
      curve(vv, trialsToMature(vv.tau), false);
    });
    if (st.morph < 1) {
      ctx.globalAlpha = 1 - st.morph;
      curve(prev, trialsToMature(prev.tau), true, false);
    }
    ctx.globalAlpha = 1;
    curve(v, st.n, true);
  },
});
