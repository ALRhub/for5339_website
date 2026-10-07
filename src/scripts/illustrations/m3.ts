// M3: Bayesian optimisation of the forming process, computed live. The
// setting is the position of one gripper on the frame. A Gaussian process
// models part quality from a few trials; expected improvement picks where the
// gripper should hold the sheet in the next trial.
import { clamp, easeInOut, label, lerp, mix, register, rng } from './engine';
import { drawFrame, frame, frameGripper, type Frame } from './scene';
import { layer, ramp, softDot, dot } from './materials';

const G = 180; // grid resolution
const ELL = 0.09; // kernel length scale
const NOISE = 1e-6;
const ITER = 7;
const STEP = 1.9; // seconds per new trial
const HOLD = 2.6;
const START = 1.2;
const CYCLE = START + ITER * STEP + HOLD;
const TUNED = 0; // index of the gripper whose position is optimised

const grid = Array.from({ length: G }, (_, i) => i / (G - 1));
// Schematic part quality over the position x of the tuned gripper on its track. Wrinkles form in
// two zones of the top flange, badly in the first and mildly in the second; holding the sheet near
// a zone smooths it. So the best position holds the first zone, and the second is a local optimum.
const ZONES = [
  { x: 0.72, w: 0.11, weight: 0.7 },
  { x: 0.18, w: 0.13, weight: 0.3 },
];
const remaining = (z: (typeof ZONES)[number], x: number) => 1 - Math.exp(-((x - z.x) ** 2) / (2 * z.w ** 2));
const f = (x: number) => 3 * (1 - ZONES.reduce((sum, z) => sum + z.weight * remaining(z, x), 0)) - 1.1;
const truth = grid.map(f);
const k = (a: number, b: number) => Math.exp(-((a - b) ** 2) / (2 * ELL * ELL));

function posterior(xs: number[], ys: number[]) {
  const n = xs.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = k(xs[i], xs[j]) + (i === j ? NOISE : 0);
      for (let q = 0; q < j; q++) sum -= L[i][q] * L[j][q];
      L[i][j] = i === j ? Math.sqrt(Math.max(sum, 1e-12)) : sum / L[j][j];
    }
  }
  const solveL = (b: number[]) => {
    const x = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = b[i];
      for (let q = 0; q < i; q++) s -= L[i][q] * x[q];
      x[i] = s / L[i][i];
    }
    return x;
  };
  const solveLT = (b: number[]) => {
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      for (let q = i + 1; q < n; q++) s -= L[q][i] * x[q];
      x[i] = s / L[i][i];
    }
    return x;
  };
  const alpha = solveLT(solveL(ys));
  const mu: number[] = [];
  const sd: number[] = [];
  for (const x of grid) {
    const ks = xs.map((xi) => k(x, xi));
    mu.push(ks.reduce((acc, v, i) => acc + v * alpha[i], 0));
    const v = solveL(ks);
    sd.push(Math.sqrt(Math.max(1 - v.reduce((acc, vi) => acc + vi * vi, 0), 1e-9)));
  }
  return { mu, sd };
}

const phi = (z: number) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
const Phi = (z: number) => {
  // Abramowitz-Stegun approximation of the normal CDF
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-0.5 * z * z);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
};

type Step = { xs: number[]; mu: number[]; sd: number[]; ei: number[]; next: number };

function run(seed: number): Step[] {
  const r = rng(seed);
  const xs = [0.05 + 0.3 * r(), 0.4 + 0.25 * r()];
  const steps: Step[] = [];
  for (let it = 0; it <= ITER; it++) {
    const ys = xs.map(f);
    const { mu, sd } = posterior(xs, ys);
    const best = Math.max(...ys);
    const ei = mu.map((m, i) => {
      const s = sd[i];
      const z = (m - best - 0.01) / s;
      return (m - best - 0.01) * Phi(z) + s * phi(z);
    });
    let arg = 0;
    ei.forEach((v, i) => (v > ei[arg] ? (arg = i) : 0));
    steps.push({ xs: [...xs], mu, sd, ei, next: grid[arg] });
    xs.push(grid[arg]);
  }
  return steps;
}

type S = { cache: Map<number, Step[]>; fr: Frame | null; plotX0: number; band: CanvasGradient; area: CanvasGradient; halo: HTMLCanvasElement; unit: number };

// where the tuned gripper sits on the top edge for setting x: its track spans the open part of
// the edge over the sheet, clear of the fixed gripper at 0.7
const edgeU = (x: number) => lerp(0.2, 0.58, x);
// the same place across the sheet, which spans 0.16 to 0.84 of the frame
const sheetU = (x: number) => (edgeU(x) - 0.16) / 0.68;

register<S>('m3', {
  still: START + 4 * STEP + 1.5,
  setup(w, h) {
    const { ctx } = layer(1, 1);
    const look = { halo: softDot(), unit: clamp(w / 1000, 0.55, 1.2),
      band: ramp(ctx, 0, 30, 0, h * 0.6, ['rgba(104,110,116,0.04)', 'rgba(104,110,116,0.17)', 'rgba(104,110,116,0.04)']),
      area: ramp(ctx, 0, h * 0.72, 0, h - 26, ['rgba(0,150,130,0.26)', 'rgba(0,150,130,0.02)']) };
    if (w < 480) return { ...look, cache: new Map(), fr: null, plotX0: 14 };
    const panel = Math.min(w * 0.34, h * 1.0);
    const size = Math.min(panel - 24, h - 70);
    return { ...look, cache: new Map(), fr: frame(14 + (panel - 24 - size) / 2, (h - size) / 2 - 10, size), plotX0: panel + 30 };
  },
  draw(ctx, w, h, t, s, p) {
    const cycle = Math.floor(t / CYCLE);
    if (!s.cache.has(cycle)) {
      s.cache.clear();
      s.cache.set(cycle, run(cycle * 7 + 3));
    }
    const steps = s.cache.get(cycle)!;
    const u = t - cycle * CYCLE;
    const raw = (u - START) / STEP;
    const idx = clamp(Math.floor(raw), 0, ITER);
    const ph = u < START ? 0 : raw >= ITER ? 1 : raw - Math.floor(raw);
    const cur = steps[Math.min(idx, ITER)];
    const nxt = steps[Math.min(idx + 1, ITER)];
    const done = raw >= ITER;
    // after the last trial the gripper moves to the best position found (dp: 0 to 1)
    const dp = done ? clamp((u - START - ITER * STEP) / 0.9) : 0;
    const ys = cur.xs.map(f);
    const bestI = ys.indexOf(Math.max(...ys));

    // ---- the process: where the tuned gripper holds the sheet, and the result
    if (s.fr) {
      const fr = s.fr;
      const last = cur.xs[cur.xs.length - 1];
      let x = last;
      let shown = last;
      let resultAlpha = 1;
      if (done) {
        const best = cur.xs[bestI];
        const move = easeInOut(clamp(dp / 0.55));
        x = lerp(last, best, move);
        shown = move < 1 ? last : best;
        resultAlpha = best === last ? 1 : move < 1 ? 1 - move : clamp((dp - 0.55) / 0.45);
      } else if (ph > 0.25) {
        const move = easeInOut(clamp((ph - 0.25) / 0.17));
        x = lerp(last, cur.next, move);
        resultAlpha = ph < 0.42 ? 1 - move : clamp((ph - 0.42) / 0.3);
        shown = ph < 0.42 ? last : cur.next;
      }
      drawFrame(ctx, fr, p, { gripperColor: (i) => (i === TUNED ? 'rgba(0,0,0,0)' : p.ink2) });
      // wrinkles in the two zones of the top flange: folds running in from the edge, and a soft
      // vermilion patch; each zone smooths out when the gripper holds the sheet near it
      const sh = fr.sheet;
      ctx.save();
      ctx.beginPath(); ctx.rect(sh.x, sh.y, sh.w, sh.h); ctx.clip();
      for (const z of ZONES) {
        const amount = remaining(z, shown) * (z.weight / ZONES[0].weight) * resultAlpha;
        if (amount < 0.01) continue;
        const cx = sh.x + sheetU(z.x) * sh.w;
        const r = sh.w * 0.14;
        const patch = ctx.createRadialGradient(cx, sh.y, 0, cx, sh.y, r * 1.5);
        patch.addColorStop(0, `rgba(228,87,46,${0.4 * amount})`);
        patch.addColorStop(1, 'rgba(228,87,46,0)');
        ctx.fillStyle = patch;
        ctx.fillRect(cx - r * 1.5, sh.y, r * 3, r * 1.5);
        const folds = new Path2D();
        for (let i = -2; i <= 2; i++) {
          const x0 = cx + i * sh.w * 0.034;
          const len = sh.h * (0.24 - 0.03 * Math.abs(i));
          for (let j = 0; j <= 24; j++) {
            const q = j / 24;
            const x = x0 + Math.sin(q * Math.PI * 5 + i) * Math.sin(q * Math.PI) * amount * sh.w * 0.012;
            folds[j ? 'lineTo' : 'moveTo'](x, sh.y + q * len);
          }
        }
        ctx.globalAlpha = 0.55 * amount; ctx.strokeStyle = '#b3361a'; ctx.lineWidth = 0.9 * s.unit; ctx.stroke(folds);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      // The physical track makes the optimised setting legible.
      ctx.strokeStyle = '#8a939b'; ctx.lineWidth = 5 * s.unit;
      ctx.beginPath(); ctx.moveTo(fr.x + edgeU(0) * fr.s, fr.y); ctx.lineTo(fr.x + edgeU(1) * fr.s, fr.y); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = s.unit; ctx.stroke();
      // tried positions along the top edge
      const found = clamp((dp - 0.55) / 0.45);
      cur.xs.forEach((xi, i) => {
        const hi = i === bestI ? found : 0;
        ctx.fillStyle = mix(p.grey, p.accent, hi);
        ctx.beginPath();
        ctx.arc(fr.x + edgeU(xi) * fr.s, fr.y, lerp(2.6, 4, hi) * s.unit, 0, Math.PI * 2);
        ctx.fill();
      });
      const g0 = fr.grippers[TUNED];
      frameGripper(ctx, fr.x + edgeU(x) * fr.s, g0.y, fr.s * 0.1, g0.rot, p.accent);
      label(ctx, done ? 'Best gripper position found' : 'Gripper position under test', fr.x + fr.s / 2, fr.y + fr.s + 22, p, {
        align: 'center',
        size: 12,
        color: p.ink2,
      });
    }

    // ---- the model: quality over gripper position, and where to try next
    const padR = 14;
    const X = (x: number) => lerp(s.plotX0, w - padR, x);
    const top = { y0: 30, y1: h * 0.6 };
    const bot = { y0: h * 0.72, y1: h - 26 };
    const Y = (v: number) => lerp(top.y1, top.y0, (v + 1.35) / 2.7);
    const blend = done ? 0 : easeInOut(clamp((ph - 0.72) / 0.28));
    const mu = cur.mu.map((m, i) => lerp(m, nxt.mu[i], blend));
    const sd = cur.sd.map((v, i) => lerp(v, nxt.sd[i], blend));

    ctx.save(); ctx.beginPath(); ctx.rect(X(0), top.y0, X(1) - X(0), top.y1 - top.y0); ctx.clip();
    ctx.beginPath();
    grid.forEach((x, i) => (i ? ctx.lineTo(X(x), Y(mu[i] + 2 * sd[i])) : ctx.moveTo(X(x), Y(mu[i] + 2 * sd[i]))));
    for (let i = G - 1; i >= 0; i--) ctx.lineTo(X(grid[i]), Y(mu[i] - 2 * sd[i]));
    ctx.closePath();
    ctx.fillStyle = s.band;
    ctx.fill();

    ctx.beginPath();
    grid.forEach((x, i) => (i ? ctx.lineTo(X(x), Y(truth[i])) : ctx.moveTo(X(x), Y(truth[i]))));
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = p.grey;
    ctx.lineWidth = 1.2 * s.unit;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    grid.forEach((x, i) => (i ? ctx.lineTo(X(x), Y(mu[i])) : ctx.moveTo(X(x), Y(mu[i]))));
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.6 * s.unit;
    ctx.stroke();

    ctx.restore();
    // expected improvement, normalised; it turns into the next one while the model updates
    const eiMax = Math.max(...cur.ei, 1e-9);
    const eiMaxNext = Math.max(...nxt.ei, 1e-9);
    const ei = cur.ei.map((v, i) => lerp(v / eiMax, nxt.ei[i] / eiMaxNext, blend));
    const show = done ? lerp(1, 0.35, easeInOut(dp)) : clamp((u - START) / 0.45);
    ctx.beginPath();
    ctx.moveTo(X(0), bot.y1);
    grid.forEach((x, i) => ctx.lineTo(X(x), lerp(bot.y1, bot.y0, ei[i] * show)));
    ctx.lineTo(X(1), bot.y1);
    ctx.closePath();
    ctx.fillStyle = s.area;
    ctx.fill();
    ctx.beginPath();
    grid.forEach((x, i) => {
      const yy = lerp(bot.y1, bot.y0, ei[i] * show);
      i ? ctx.lineTo(X(x), yy) : ctx.moveTo(X(x), yy);
    });
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 1.4 * s.unit;
    ctx.stroke();
    ctx.strokeStyle = p.faint;
    ctx.lineWidth = 1 * s.unit;
    ctx.beginPath();
    ctx.moveTo(X(0), bot.y1 + 0.5);
    ctx.lineTo(X(1), bot.y1 + 0.5);
    ctx.stroke();

    // the next trial: a guide at the chosen position, then its result drops in and becomes a data point
    if (!done && ph > 0.25) {
      const xn = cur.next;
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = p.accent;
      ctx.globalAlpha = clamp((ph - 0.25) / 0.15) * (1 - blend);
      ctx.beginPath();
      ctx.moveTo(X(xn), bot.y1);
      ctx.lineTo(X(xn), top.y0);
      ctx.stroke();
      ctx.setLineDash([]);
      if (ph > 0.42) {
        const yn = lerp(top.y0, Y(f(xn)), easeInOut(clamp((ph - 0.42) / 0.3)));
        ctx.globalAlpha = clamp((ph - 0.42) / 0.08) * (1 - blend);
        dot(ctx, s.halo, X(xn), yn, 4.5 * s.unit, p.accent);
        ctx.globalAlpha = blend;
        ctx.fillStyle = p.ink;
        ctx.beginPath(); ctx.arc(X(xn), yn, 3.6 * s.unit, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    cur.xs.forEach((x, i) => {
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.arc(X(x), Y(ys[i]), 3.6 * s.unit, 0, Math.PI * 2);
      ctx.fill();
    });
    if (done) {
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 2 * s.unit;
      ctx.globalAlpha = clamp((u - START - ITER * STEP) / 0.5);
      ctx.beginPath();
      ctx.arc(X(cur.xs[bestI]), Y(ys[bestI]), 9 * s.unit, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    label(ctx, 'Part quality over gripper position', s.plotX0, 16, p, { size: 12, color: p.ink2 });
    label(ctx, `${cur.xs.length} trials`, w - padR, 16, p, { align: 'right', size: 12, color: p.ink2 });
    label(ctx, 'Where to try next (expected improvement)', s.plotX0, bot.y0 - 8, p, { size: 12, color: p.ink2 });

    // dissolve into the stage at the loop boundary, so a new optimisation run never jumps in
    const edge = Math.min(clamp(u / 0.4), clamp((CYCLE - u) / 0.4));
    if (edge < 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1 - edge;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  },
});
