// M1: over-instrumentation of the forming process. Candidate sensors sit on
// the sheet and on the grippers; an estimate of how much each would reveal
// selects the useful ones, and once the process matures some are removed.
import { clamp, label, register } from './engine';
import { drawFrame, frame, type Frame } from './scene';
import { colourField, colourBar, INFORMATION, layer, ramp, softDot, dot } from './materials';

const PICK = 6;
const MAP_T = 1.4;
const PICK_T = 0.55;
const HOLD = 1.2;
const DROP_T = 1.6;
const END = 1.4;
const CYCLE = MAP_T + PICK * PICK_T + HOLD + DROP_T + END;
const DROPPED = [2, 5]; // picks (by order) that are removed later

// where measurements are informative: the flanges where wrinkles form, and one corner
const BLOBS: [number, number, number, number, number][] = [
  [0.08, 0.5, 0.2, 0.34, 1],
  [0.92, 0.45, 0.2, 0.3, 0.9],
  [0.78, 0.12, 0.2, 0.16, 0.55],
];
const info = (u: number, v: number) =>
  BLOBS.reduce((acc, [cu, cv, su, sv, a]) => acc + a * Math.exp(-(((u - cu) / su) ** 2 + ((v - cv) / sv) ** 2)), 0);

type Cand = { x: number; y: number; value: number; onGripper: boolean };
type S = { f: Frame; cands: Cand[]; order: number[]; field: HTMLCanvasElement; legend: CanvasGradient; halo: HTMLCanvasElement; unit: number };

register<S>('m1', {
  still: MAP_T + PICK * PICK_T + 0.5,
  setup(w, h) {
    const size = Math.min(h - 56, w * 0.56);
    const f = frame((w - size) / 2, 14 + (h - 56 - size) / 2, size);
    const sh = f.sheet;
    const cands: Cand[] = [];
    for (let j = 0; j < 5; j++)
      for (let i = 0; i < 5; i++) {
        const u = (i + 0.5) / 5;
        const v = (j + 0.5) / 5;
        cands.push({ x: sh.x + u * sh.w, y: sh.y + v * sh.h, value: info(u, v), onGripper: false });
      }
    for (const g of f.grippers) {
      const u = (g.x - sh.x) / sh.w;
      const v = (g.y - sh.y) / sh.h;
      cands.push({ x: g.x, y: g.y, value: info(Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v))) * 1.05, onGripper: true });
    }
    // greedy selection with a minimum spacing, so sensors do not cluster
    const order: number[] = [];
    const sorted = cands.map((_, i) => i).sort((a, b) => cands[b].value - cands[a].value);
    for (const i of sorted) {
      if (order.length === PICK) break;
      if (order.every((o) => Math.hypot(cands[o].x - cands[i].x, cands[o].y - cands[i].y) > size * 0.22)) order.push(i);
    }
    const field = colourField(INFORMATION);
    field.update((u, v) => clamp(info(u, v) * 0.8));
    const { ctx } = layer(1, 1);
    return { f, cands, order, field: field.canvas, halo: softDot(), unit: clamp(size / 440, 0.35, 1.15),
      legend: ramp(ctx, f.x + f.s + 25, 0, f.x + f.s + 125, 0, INFORMATION) };
  },
  draw(ctx, w, h, t, s, p) {
    const u = ((t % CYCLE) + CYCLE) % CYCLE;
    const map = clamp(u / MAP_T);
    const picked = clamp((u - MAP_T) / PICK_T, 0, PICK);
    const dropStart = MAP_T + PICK * PICK_T + HOLD;
    const drop = clamp((u - dropStart) / DROP_T);
    const endFade = clamp((u - (CYCLE - 0.5)) / 0.5);
    const sh = s.f.sheet;

    drawFrame(ctx, s.f, p);

    // The information field is evaluated once; time only controls its visibility.
    ctx.globalAlpha = map * (1 - endFade) * 0.82;
    ctx.drawImage(s.field, sh.x, sh.y, sh.w, sh.h);
    ctx.globalAlpha = 1;
    if (w > 800) colourBar(ctx, s.legend, s.f.x + s.f.s + 25, s.f.y + s.f.s * 0.5, 100, 'Information', p);

    // candidates and chosen sensors. Unused candidates dim once all sensors are placed; a removed
    // sensor shrinks away while its crossed-out mark fades in; at the end of the loop all marks
    // fade and the candidates return to how the next round starts.
    const dim = clamp((u - (MAP_T + PICK * PICK_T)) / 0.4) * (1 - endFade);
    const ring = (c: Cand, colour: string, alpha: number, crossed: boolean) => {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = colour;
      ctx.fillStyle = p.bg;
      ctx.lineWidth = 1.1 * s.unit;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 3.6 * s.unit, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (crossed) {
        ctx.beginPath();
        ctx.moveTo(c.x - 4.5 * s.unit, c.y - 4.5 * s.unit);
        ctx.lineTo(c.x + 4.5 * s.unit, c.y + 4.5 * s.unit);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    s.cands.forEach((c, i) => {
      const rank = s.order.indexOf(i);
      const chosen = rank >= 0 && rank < picked;
      const dropIdx = DROPPED.indexOf(rank);
      const gone = chosen && dropIdx >= 0 ? clamp((drop - (0.3 + 0.35 * dropIdx)) / 0.12) : 0;
      if (!chosen) {
        ring(c, c.onGripper ? p.ink3 : p.grey, 1 - 0.6 * dim, false);
        return;
      }
      // the candidate ring gives way to the growing sensor, and returns at the end of the loop
      const pop = clamp((picked - rank) * 3);
      const plain = Math.max(endFade, gone === 0 ? 1 - pop : 0);
      if (plain > 0) ring(c, c.onGripper ? p.ink3 : p.grey, plain, false);
      if (gone > 0) ring(c, p.alert, gone * (1 - 0.6 * drop) * (1 - endFade), true);
      if (gone < 1) {
        ctx.globalAlpha = 1 - endFade;
        dot(ctx, s.halo, c.x, c.y, 5.5 * pop * (1 - gone) * s.unit, p.accent);
        ctx.globalAlpha = 1;
        if (pop < 1 && gone === 0) {
          ctx.strokeStyle = `rgba(0,150,130,${1 - pop})`;
          ctx.lineWidth = 1.2 * s.unit;
          ctx.beginPath();
          ctx.arc(c.x, c.y, (6 + 14 * pop) * s.unit, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    });

    const text =
      u < MAP_T
        ? 'Estimate where a measurement would reveal most'
        : u < dropStart
          ? `Place sensors where they matter: ${Math.min(PICK, Math.ceil(picked))} of ${s.cands.length} candidates`
          : 'As the process matures, fewer sensors are needed';
    label(ctx, text, w / 2, h - 14, p, { align: 'center', size: 12, color: p.ink2 });
  },
});
