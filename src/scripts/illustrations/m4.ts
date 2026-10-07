// M4: feedback control of the grippers during forming. The tape laminate (drawn as in T2)
// hangs from the grippers; the punch comes down onto it and forms it, and the grippers feed
// material in. A friction change half-way lets the laminate go slack. Without control the
// flanges wrinkle; with sampling-based predictive control, the grippers hold back and keep the
// tension in band.
import { clamp, easeInOut, label, lerp, mix, register } from './engine';
import { gripper } from './scene';
import { layer, steel, tool, ramp, softDot, dot } from './materials';
import { drawLaminate, matchedTools, mirror, shape, type Pt, type Tools } from './laminate';

const N = 40; // control steps over one forming stroke
const H = 5; // prediction horizon (steps)
const CANDIDATES = [-0.05, -0.03, -0.015, 0, 0.015, 0.03, 0.05];
const TARGET = 0.5;
const BAND = [0.4, 0.6] as const;
const WRINKLE_BELOW = 0.36;
const APPROACH = 0.8; // the raised punch comes down until it touches the sheet
const FORM = 3.8;
const HOLD_A = 1.1;
const HOLD_B = 1.8;
const RESET = 0.7;
const PASS_A = APPROACH + FORM + HOLD_A + RESET;
const CYCLE = PASS_A + APPROACH + FORM + HOLD_B + RESET;

// a friction change half-way through the stroke lets material slip in from then on
const disturbance = (s: number) => {
  const u = clamp((s - 0.42) / 0.2);
  return 0.3 * u * u * (3 - 2 * u);
};

type Fan = { lines: number[][]; best: number };
type Sim = { open: number[]; closed: number[]; hold: number[]; fans: Fan[] };

function simulate(): Sim {
  const sAt = (k: number) => k / N;
  const open = Array.from({ length: N + 1 }, (_, k) => TARGET - disturbance(sAt(k)) + 0.012 * Math.sin(9 * sAt(k)));
  const closed = [TARGET];
  const hold = [0]; // cumulative corrective action of the grippers
  const fans: Fan[] = [];
  let est = 0; // estimated disturbance rate from the last measurement
  for (let k = 0; k < N; k++) {
    const tau = closed[k];
    const lines = CANDIDATES.map((u) => Array.from({ length: H + 1 }, (_, j) => tau + j * (u - est)));
    const costs = lines.map((l, i) => l.reduce((acc, v) => acc + (v - TARGET) ** 2, 0) + 0.3 * CANDIDATES[i] ** 2);
    const best = costs.indexOf(Math.min(...costs));
    fans.push({ lines, best });
    const dd = disturbance(sAt(k + 1)) - disturbance(sAt(k));
    closed.push(tau + CANDIDATES[best] - dd);
    hold.push(hold[k] + CANDIDATES[best]);
    est = dd;
  }
  return { open, closed, hold, fans };
}

type S = {
  sim: Sim;
  unit: number;
  hardware: HTMLCanvasElement;
  metal: CanvasGradient;
  band: CanvasGradient;
  halo: HTMLCanvasElement;
  scene: { x0: number; x1: number; top: number; D: number; wd: number; wb: number; flange: number };
  tools: Tools; // the laminate and tools as the shared laminate drawing needs them
  thick: number;
  full: number; // punch travel from first contact to the bottom
  cot: number; // slope of the matched tool walls (horizontal run per unit of height)
  plot: { x0: number; x1: number; y0: number; y1: number } | null;
};

function phase(t: number) {
  let u = ((t % CYCLE) + CYCLE) % CYCLE;
  const controlled = u >= PASS_A;
  if (controlled) u -= PASS_A;
  const hold = controlled ? HOLD_B : HOLD_A;
  return {
    controlled,
    approach: easeInOut(clamp(u / APPROACH)),
    s: easeInOut(clamp((u - APPROACH) / FORM)),
    reset: clamp((u - APPROACH - FORM - hold) / RESET),
    appear: clamp(u / 0.35),
  };
}

const at = (arr: number[], s: number) => {
  const q = s * N;
  const i = Math.min(Math.floor(q), N - 1);
  return lerp(arr[i], arr[i + 1], q - i);
};

register<S>('m4', {
  still: PASS_A + APPROACH + FORM * 0.62,
  setup(w, h) {
    const wide = w >= 520;
    const sx1 = wide ? w * 0.5 : w;
    const sceneW = sx1 - 16;
    const state = {
      sim: simulate(),
      scene: {
        x0: 8,
        x1: sx1 - 8,
        top: h * (wide ? 0.52 : 0.5),
        D: h * 0.18,
        wd: sceneW * 0.2,
        wb: sceneW * 0.12,
        flange: sceneW * 0.24,
      },
      plot: wide ? { x0: w * 0.56, x1: w - 16, y0: 34, y1: h - 40 } : null,
    };
    const unit = clamp(sceneW / 580, 0.45, 1.2);
    const { canvas: hardware, ctx } = layer(w, h);
    const sc = state.scene, cx = (sc.x0 + sc.x1) / 2, top = sc.top;
    const metal = steel(ctx, top - sc.D, sc.D * 2.4);
    const thick = Math.max(6, 13 * unit);
    const clear = thick / 2 + 1;
    const tools: Tools = { cx, top: top - clear, clear, hold: 0.9 * thick, wb: sc.wb, wd: sc.wd, half: sc.wd + sc.flange };
    // punch and die are matched: their walls run parallel to the formed laminate's wall
    const matched = matchedTools(tools, sc.D);
    const die = new Path2D();
    die.moveTo(sc.x0 + 10, top); die.lineTo(cx - sc.wd, top);
    die.lineTo(cx - matched.bottom, top + sc.D); die.lineTo(cx + matched.bottom, top + sc.D);
    die.lineTo(cx + sc.wd, top); die.lineTo(sc.x1 - 10, top);
    die.lineTo(sc.x1 - 10, top + sc.D + 26 * unit); die.lineTo(sc.x0 + 10, top + sc.D + 26 * unit); die.closePath();
    tool(ctx, die, steel(ctx, top, sc.D + 26 * unit), unit);
    const pl = state.plot;
    const band = ramp(ctx, 0, pl ? pl.y0 : 0, 0, pl ? pl.y1 : h, ['rgba(0,150,130,0.16)', 'rgba(0,150,130,0.04)']);
    return { ...state, unit, hardware, metal, band, halo: softDot(), tools, thick, full: sc.D + tools.hold, cot: matched.cot };
  },
  draw(ctx, w, h, t, st, p) {
    const ph = phase(t);
    const { sim, scene: sc } = st;
    const cx = (sc.x0 + sc.x1) / 2;
    // the formed part keeps its shape and fades out while the punch retracts; the next pass fades in flat
    const s = ph.s;
    const tau = ph.controlled ? at(sim.closed, ph.s) : at(sim.open, ph.s);
    const holdBack = ph.controlled ? at(sim.hold, ph.s) : 0;
    const visible = Math.min(ph.appear, 1 - ph.reset);

    // ---- scene: die, punch, laminate, grippers
    const top = sc.top;
    const g = st.tools;
    ctx.drawImage(st.hardware, 0, 0, w, h);
    // the laminate deforms only under the punch: the punch comes down until its nose touches the
    // laminate, then presses it into the die with the nose on it; after the hold it retracts
    const stroke = st.full * s;
    const depth = sc.D * s;
    const raised = top - h * 0.2;
    const touch = g.top - g.hold - g.clear;
    const pb = ph.reset > 0 ? lerp(touch + st.full, raised, easeInOut(ph.reset)) : lerp(raised, touch, ph.approach) + stroke;
    const nose = sc.wb - g.clear, rise = sc.D - g.clear, side = nose + rise * st.cot;
    const punch = new Path2D();
    punch.moveTo(cx - nose, pb);
    punch.lineTo(cx + nose, pb);
    punch.lineTo(cx + side, pb - rise);
    punch.lineTo(cx + side, pb - sc.D - h * 0.12);
    punch.lineTo(cx - side, pb - sc.D - h * 0.12);
    punch.lineTo(cx - side, pb - rise);
    punch.closePath();
    tool(ctx, punch, st.metal, st.unit);

    // where the grippers are: the draw-in the forming needs, plus what the grippers feed in when the
    // laminate goes slack, less what the controller holds back; the extra length waves in the flanges
    const natural = shape(g, stroke);
    const xNat = natural[natural.length - 1].x;
    const excess = (g.half - xNat) * 0.5 * (TARGET - tau) - holdBack * sc.flange * 0.25;
    const wrinkle = Math.max(0, WRINKLE_BELOW - tau) * 3.2 * clamp(depth / (sc.D * 0.3));
    const pts: Pt[] = shape(g, stroke, xNat - excess);
    let i0 = pts.length - 1;
    while (i0 > 0 && pts[i0 - 1].tag === 0) i0--;
    const a0 = pts[i0], a1 = pts[pts.length - 1];
    const len = Math.hypot(a1.x - a0.x, a1.y - a0.y) || 1;
    const nx = -(a1.y - a0.y) / len, ny = (a1.x - a0.x) / len;
    for (let i = i0; i < pts.length; i++) {
      const q = (i - i0) / Math.max(1, pts.length - 1 - i0);
      // long waves, so that the bends stay wider than the laminate is thick
      const lift = -wrinkle * 7 * st.unit * Math.sin(Math.PI * q) * Math.sin(q * Math.PI * 5);
      pts[i] = { ...pts[i], x: pts[i].x + nx * lift, y: pts[i].y + ny * lift };
    }
    const DENSE = 360;
    const M = mirror(pts, cx, DENSE);
    const tint = Math.round(clamp(wrinkle * 1.6) * 16) / 16;
    const fill = (f: number, p: number) => {
      const base = p === 1 || p === 2 ? '#c6d6d1' : '#d6e2df';
      return M[Math.round(f)].tag === 0 && tint > 0 ? mix(base, '#e4572e', tint) : base;
    };
    ctx.globalAlpha = visible;
    drawLaminate(ctx, M, DENSE, { thick: st.thick, scale: st.unit, elements: 48, mark: 8, fill });
    // grippers hold the laminate ends and move with the draw-in
    const gs = Math.min(34, (sc.x1 - sc.x0) * 0.08);
    const first = M[0], last = M[M.length - 1];
    gripper(ctx, first.x - gs * 0.28, first.y, gs, 270, ph.controlled ? p.accent : p.ink2);
    gripper(ctx, last.x + gs * 0.28, last.y, gs, 90, ph.controlled ? p.accent : p.ink2);
    ctx.globalAlpha = 1;

    label(ctx, ph.controlled ? 'With predictive control' : 'Without control', sc.x0 + 10, top + sc.D + 26 * st.unit + 24, p, {
      size: 13,
      weight: 600,
      color: ph.controlled ? p.link : p.ink,
    });
    if (wrinkle > 0.05) {
      ctx.globalAlpha = visible;
      label(ctx, 'slack sheet wrinkles', sc.x0 + 10, g.top - g.hold - st.thick - 16, p, { size: 12, color: '#b3361a' });
      ctx.globalAlpha = 1;
    }

    // ---- plot: sheet tension over the forming stroke
    const pl = st.plot;
    if (!pl) return;
    const X = (sv: number) => lerp(pl.x0, pl.x1, sv);
    const Y = (v: number) => lerp(pl.y1, pl.y0, v / 0.85);
    ctx.fillStyle = st.band;
    ctx.fillRect(pl.x0, Y(BAND[1]), pl.x1 - pl.x0, Y(BAND[0]) - Y(BAND[1]));
    ctx.strokeStyle = p.faint;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pl.x0, pl.y0);
    ctx.lineTo(pl.x0, pl.y1);
    ctx.lineTo(pl.x1, pl.y1);
    ctx.stroke();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(228,87,46,0.6)';
    ctx.beginPath();
    ctx.moveTo(pl.x0, Y(WRINKLE_BELOW));
    ctx.lineTo(pl.x1, Y(WRINKLE_BELOW));
    ctx.stroke();
    ctx.setLineDash([]);

    const trace = (arr: number[], upTo: number, color: string, width: number, dash: number[] = []) => {
      ctx.beginPath();
      const n = Math.max(1, Math.round(upTo * N * 4));
      for (let i = 0; i <= n; i++) {
        const sv = (i / n) * upTo;
        ctx[i ? 'lineTo' : 'moveTo'](X(sv), Y(at(arr, sv)));
      }
      ctx.setLineDash(dash);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
      ctx.setLineDash([]);
    };
    const upTo = ph.reset > 0 ? 1 : ph.s;
    // between passes the traces fade: the uncontrolled trace becomes the dashed reference,
    // and both fade out before the next uncontrolled pass
    if (!ph.controlled) {
      if (ph.reset > 0) {
        ctx.globalAlpha = ph.reset;
        trace(sim.open, 1, p.grey, 1.2, [3, 4]);
      }
      ctx.globalAlpha = 1 - ph.reset;
      trace(sim.open, upTo, p.ink, 2);
    } else {
      ctx.globalAlpha = 1 - ph.reset;
      trace(sim.open, 1, p.grey, 1.2, [3, 4]);
      trace(sim.closed, upTo, p.accent, 2);
      // the fan of predicted futures at the current control step, best in green; it fades in
      // once the punch presses and out at the end of the stroke
      // the fan glides from one control step to the next; the applied line's highlight crossfades
      const q = ph.s * N;
      const k = Math.min(N - 1, Math.floor(q));
      const fq = Math.min(1, q - k);
      const fanAlpha = clamp(ph.s / 0.03) * clamp((1 - ph.s) / 0.04);
      if (fanAlpha > 0) {
        ctx.globalAlpha = fanAlpha;
        const fanA = sim.fans[k];
        const fanB = sim.fans[Math.min(N - 1, k + 1)];
        const lines = fanA.lines.map((l, i) => l.map((v, j) => lerp(v, fanB.lines[i][j], fq)));
        ctx.save();
        ctx.beginPath();
        ctx.rect(pl.x0, pl.y0, pl.x1 - pl.x0, pl.y1 - pl.y0);
        ctx.clip();
        const costs = lines.map(line => line.reduce((sum, value) => sum + (value - TARGET) ** 2, 0));
        const worst = Math.max(...costs, 1e-6);
        lines.forEach((l, i) => {
          ctx.beginPath();
          l.forEach((v, j) => ctx[j ? 'lineTo' : 'moveTo'](X(Math.min(1, (k + fq + j) / N)), Y(clamp(v, 0, 0.85))));
          ctx.strokeStyle = `rgba(104,110,116,${0.15 + 0.45 * (1 - costs[i] / worst)})`;
          ctx.lineWidth = 1;
          ctx.stroke();
          const applied = lerp(i === fanA.best ? 1 : 0, i === fanB.best ? 1 : 0, fq);
          if (applied > 0) {
            ctx.globalAlpha = fanAlpha * applied;
            ctx.strokeStyle = p.accent;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.globalAlpha = fanAlpha;
          }
        });
        ctx.restore();
        // uncertainty of the state estimate at the current point
        ctx.fillStyle = 'rgba(104,110,116,0.15)';
        ctx.fillRect(X(ph.s) - 3, Y(tau + 0.05), 6, Y(tau - 0.05) - Y(tau + 0.05));
      }
    }
    ctx.globalAlpha = visible;
    dot(ctx, st.halo, X(upTo), Y(tau), 3.5, ph.controlled ? p.accent : p.ink);
    ctx.globalAlpha = 1;

    label(ctx, 'Sheet tension', pl.x0, pl.y0 - 12, p, { size: 12, color: p.ink2 });
    label(ctx, 'target band', pl.x1, Y(BAND[1]) - 6, p, { size: 11, align: 'right', color: p.link });
    label(ctx, 'wrinkles below', pl.x1, Y(WRINKLE_BELOW) + 14, p, { size: 11, align: 'right', color: '#b3361a' });
    label(ctx, 'Forming progress', pl.x1, pl.y1 + 18, p, { size: 12, align: 'right', color: p.ink2 });
  },
});
