// T2: thermoforming simulation of a thermoplastic tape laminate, in cross-section. Four
// unidirectional tape plies (0°, 90°, 90°, 0°) are each meshed into their own row of elements;
// fibres along the section show as lines, fibre ends across it as dots. The hot laminate hangs
// from the grippers above the die until the punch forms it. Its fibres barely stretch, so each
// ply keeps its length and the plies slide against each other on the walls: the marker lines
// through the stack become stepped there, where a metal sheet would stretch instead. Colour shows
// temperature; the laminate cools where it touches the tools. Every run is added to the
// simulation data from which M2 learns. Runs differ in their settings, here the force of each
// gripper (constant within a run, drawn as arrows) and the starting temperature: where one gripper
// holds back more, it draws in less, the other more, and the laminate slides over the punch towards
// it, so each run ends in a different part. Parts never un-form: after a run the punch retracts and
// the part fades out before the next flat laminate appears.
import { clamp, easeInOut, label, lerp, mix, register } from './engine';
import { gripper } from './scene';
import { layer, steel, tool, ramp, colourBar, HEAT } from './materials';
import { drawLaminate, matchedTools, shape, slid, type Tools, type XY } from './laminate';

// Schematic settings of each run: starting temperature, the force of the left and right gripper,
// and how far the laminate slides over the punch as a result (a share of the even draw-in).
const SETTINGS = [
  { heat: 0.92, left: 1, right: 1, slide: 0, text: 'equal gripper forces' },
  { heat: 1, left: 1.5, right: 0.7, slide: 0.5, text: 'more gripper force on the left' },
  { heat: 0.84, left: 0.75, right: 1.35, slide: -0.4, text: 'more gripper force on the right, cooler laminate' },
];

const APPEAR = 0.4;
const APPROACH = 0.5; // the raised punch comes down until it touches the laminate
const FORM = 1.9;
const HOLD = 0.9;
const STORE = 0.9;
const FADE = 0.5;
const RUN = APPEAR + APPROACH + FORM + HOLD + STORE + FADE;
const RUNS = SETTINGS.length;
const CYCLE = RUN * RUNS;
const ELEMENTS = 64; // elements per ply on each side of the centre
const MARK = 8; // every 8th element edge is a marker line through the stack
const DENSE = 480; // samples of the mid-surface on each side of the centre
const COOL = 1.2; // seconds of tool contact that cool the touching ply most of the way

type S = {
  scale: number;
  sw: number; // width of the simulation scene; the data panel sits to its right
  panel: { x0: number; x1: number; y0: number; slot: number } | null;
  hardware: HTMLCanvasElement;
  metal: CanvasGradient;
  legend: CanvasGradient;
  heat: string[];
  g: Tools; // the laminate and tools as the shared laminate drawing needs them
  formed: XY[][]; // mid-surface of each run's finished part, for the data panel
  cx: number;
  top: number; // mid-surface level of a laminate lying on the die
  depth: number;
  wd: number; // die opening half-width
  wb: number; // punch half-width
  thick: number;
  clear: number; // mid-surface to tool surface
  hold: number; // the grippers hold the laminate this far above the die
  full: number; // punch travel from first contact to the bottom
  half: number; // half-length of the laminate
  touchTop: Float32Array[]; // per run: forming progress (0 to 1) of the first punch contact per sample, 2 if none
  touchBottom: Float32Array[]; // the same for the die
  cot: number; // slope of the matched tool walls (horizontal run per unit of height)
};

function timeline(t: number) {
  const u = ((t % CYCLE) + CYCLE) % CYCLE;
  const run = Math.min(RUNS - 1, Math.floor(u / RUN));
  const r = u - run * RUN;
  const at = (start: number, dur: number) => clamp((r - start) / dur);
  const done = APPEAR + APPROACH + FORM + HOLD;
  return {
    run,
    appear: at(0, APPEAR),
    approach: easeInOut(at(APPEAR, APPROACH)),
    form: easeInOut(at(APPEAR + APPROACH, FORM)),
    formTime: Math.max(0, r - APPEAR - APPROACH), // seconds since the punch first pressed
    store: at(done, STORE),
    lift: easeInOut(at(done, STORE + FADE)),
    fade: at(done + STORE, FADE),
  };
}

// The laminate of a run at a punch travel: the even draw-in the forming needs at that point,
// with the laminate slid towards the gripper that holds back more by the run's share of it.
function laminate(s: S, stroke: number, run: number, n: number) {
  const even = shape(s.g, stroke);
  const drawIn = s.g.half - even[even.length - 1].x;
  return slid(s.g, stroke, SETTINGS[run].slide * drawIn, n);
}

register<S>('t2', {
  still: RUN + APPEAR + APPROACH + FORM + HOLD * 0.7,
  setup(w, h) {
    const panel = w >= 560;
    const sw = panel ? w * 0.74 : w;
    const scale = Math.min(sw / 640, h / 360);
    const thick = Math.max(6, 14 * scale);
    const geometry = {
      scale,
      sw,
      cx: sw / 2,
      top: h * 0.47,
      depth: 92 * scale,
      wd: 150 * scale,
      wb: 96 * scale,
      thick,
      clear: thick / 2 + 1,
      hold: 0.9 * thick,
      half: Math.min(sw * 0.46, 300 * scale),
    };
    const { canvas: hardware, ctx } = layer(w, h);
    const s0 = geometry;
    // punch and die are matched: their walls run parallel to the formed laminate's wall
    const matched = matchedTools(s0, s0.depth);
    const die = new Path2D();
    die.moveTo(8, s0.top + s0.clear);
    die.lineTo(s0.cx - s0.wd, s0.top + s0.clear);
    die.lineTo(s0.cx - matched.bottom, s0.top + s0.depth + s0.clear);
    die.lineTo(s0.cx + matched.bottom, s0.top + s0.depth + s0.clear);
    die.lineTo(s0.cx + s0.wd, s0.top + s0.clear);
    die.lineTo(sw - 8, s0.top + s0.clear);
    die.lineTo(sw - 8, h - 30);
    die.lineTo(8, h - 30);
    die.closePath();
    tool(ctx, die, steel(ctx, s0.top, h - s0.top - 30), Math.min(1.2, scale));
    const heat = Array.from({ length: 65 }, (_, i) => (i < 32 ? mix(HEAT[0], HEAT[1], i / 32) : mix(HEAT[1], HEAT[2], (i - 32) / 32)));
    const s: S = {
      ...geometry,
      full: geometry.depth + geometry.hold,
      panel: panel ? { x0: sw + 28, x1: w - 18, y0: h * 0.3, slot: Math.min(56, h * 0.13) } : null,
      hardware,
      metal: steel(ctx, 6, h * 0.6),
      legend: ramp(ctx, 12, 0, 112, 0, HEAT),
      heat,
      g: geometry,
      formed: [],
      touchTop: SETTINGS.map(() => new Float32Array(2 * DENSE + 1).fill(2)),
      touchBottom: SETTINGS.map(() => new Float32Array(2 * DENSE + 1).fill(2)),
      cot: matched.cot,
    };
    s.formed = SETTINGS.map((_, run) => laminate(s, s.full, run, 40));
    // when each piece of the laminate first touches the punch (top face) or the die (bottom face)
    SETTINGS.forEach((_, run) => {
      for (let k = 0; k <= 100; k++) {
        const u = k / 100;
        laminate(s, easeInOut(u) * s.full, run, DENSE).forEach((q, i) => {
          const top = q.tag === 1 || q.tag === 2;
          const bottom = q.tag === 3 || ((q.tag === 4 || q.tag === 1) && u >= 0.985);
          if (top && s.touchTop[run][i] > 1) s.touchTop[run][i] = u;
          if (bottom && s.touchBottom[run][i] > 1) s.touchBottom[run][i] = u;
        });
      }
    });
    return s;
  },

  draw(ctx, w, h, t, s, p) {
    const tl = timeline(t);
    const stroke = tl.form * s.full;
    const alpha = tl.appear * (1 - tl.fade);

    ctx.drawImage(s.hardware, 0, 0, w, h);

    // punch: comes down onto the laminate, forms it, and goes back up once the run is finished
    const raise = 40 * s.scale;
    const py = s.top - s.hold - s.clear + stroke - (1 - tl.approach) * raise - tl.lift * (s.full + raise);
    const punch = new Path2D();
    const nose = s.wb - s.clear, rise = s.depth - s.clear, side = nose + rise * s.cot;
    punch.moveTo(s.cx - nose, py);
    punch.lineTo(s.cx + nose, py);
    punch.lineTo(s.cx + side, py - rise);
    punch.lineTo(s.cx + side, 6);
    punch.lineTo(s.cx - side, 6);
    punch.lineTo(s.cx - side, py - rise);
    punch.closePath();
    tool(ctx, punch, s.metal, Math.min(1.2, s.scale));

    // ---- the laminate, ply by ply, coloured by temperature: hot from the oven, cooling where a
    // face has touched a tool; the touching ply cools most
    const run = SETTINGS[tl.run];
    const M = laminate(s, stroke, tl.run, DENSE);
    const cooling = (touch: Float32Array, i: number) => (touch[i] <= 1 ? clamp((tl.formTime - touch[i] * FORM) / COOL) : 0);
    const fill = (f: number, p: number) => {
      const i = Math.min(2 * DENSE, Math.max(0, Math.round(f)));
      const depth = p / 3;
      const cool = Math.max(cooling(s.touchTop[tl.run], i) * lerp(1, 0.35, depth), cooling(s.touchBottom[tl.run], i) * lerp(0.35, 1, depth));
      return s.heat[Math.round(clamp(run.heat * (1 - 0.6 * cool)) * 64)];
    };
    ctx.globalAlpha = alpha;
    drawLaminate(ctx, M, DENSE, { thick: s.thick, scale: s.scale, elements: ELEMENTS, mark: MARK, fill });

    // grippers hold both ends of the laminate and follow the draw-in
    const gs = Math.max(12, 2.2 * s.thick);
    const first = M[0];
    const last = M[M.length - 1];
    gripper(ctx, first.x - gs * 0.3, first.y, gs, 270, p.ink2);
    gripper(ctx, last.x + gs * 0.3, last.y, gs, 90, p.ink2);
    // each gripper holds the laminate back with the run's constant force, drawn as an arrow
    // pointing outwards whose length grows with the force
    const ay = first.y - gs * 0.62;
    ctx.strokeStyle = p.ink2; ctx.fillStyle = p.ink2;
    ctx.lineWidth = Math.max(1.2, 1.6 * Math.min(1.2, s.scale)); ctx.lineCap = 'round';
    const head = Math.max(4, 6 * Math.min(1.2, s.scale));
    for (const [x, dir, force] of [[first.x - gs * 0.4, -1, run.left], [last.x + gs * 0.4, 1, run.right]]) {
      const len = 26 * s.scale * force;
      ctx.beginPath(); ctx.moveTo(x - dir * len, ay); ctx.lineTo(x - dir * head * 0.6, ay); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, ay); ctx.lineTo(x - dir * head, ay - head * 0.55); ctx.lineTo(x - dir * head, ay + head * 0.55); ctx.closePath(); ctx.fill();
    }
    label(ctx, 'Gripper force', first.x - gs * 0.4, ay - 9, p, { size: 11, color: p.ink3 });
    ctx.globalAlpha = 1;

    // every finished run joins the simulation data for M2
    if (s.panel) {
      const pn = s.panel;
      const keep = tl.run === RUNS - 1 ? 1 - tl.fade : 1;
      label(ctx, 'Simulation data for M2', pn.x0, pn.y0 - 18, p, { size: 12, color: p.ink2 });
      // one scale for all runs, aligned on the punch centre, so their different draw-in shows
      const all = s.formed.flat();
      const bx0 = Math.min(...all.map((q) => q.x));
      const bx1 = Math.max(...all.map((q) => q.x));
      const by0 = Math.min(...all.map((q) => q.y));
      const by1 = Math.max(...all.map((q) => q.y));
      const k = Math.min((pn.x1 - pn.x0) / (bx1 - bx0), (pn.slot * 0.62) / Math.max(1, by1 - by0));
      for (let n = 0; n < RUNS; n++) {
        const shown = n < tl.run ? 1 : n === tl.run ? tl.store : 0;
        if (shown <= 0) continue;
        const y = pn.y0 + n * pn.slot;
        const mini = new Path2D();
        s.formed[n].forEach((q, i) => mini[i ? 'lineTo' : 'moveTo'](pn.x0 + (q.x - bx0) * k, y + (q.y - by0) * k));
        // the newest run is green; the one before turns grey while the next laminate appears
        const recent = n === tl.run ? 1 : n === tl.run - 1 ? 1 - tl.appear : 0;
        ctx.globalAlpha = shown * keep;
        ctx.strokeStyle = mix(p.ink3, p.accent, recent);
        ctx.lineWidth = lerp(1.4, 2, recent);
        ctx.lineJoin = 'round';
        ctx.stroke(mini);
        label(ctx, `Run ${n + 1}`, pn.x1, y + 4, p, { size: 11, align: 'right', color: p.ink2 });
      }
      ctx.globalAlpha = 1;
    }

    label(ctx, 'Punch', s.cx, 24, p, { align: 'center', size: 12, color: p.ink2 });
    label(ctx, 'Die', s.cx, h - 40, p, { align: 'center', size: 12, color: p.ink2 });
    label(ctx, 'Forming simulation of a hot tape laminate', 12, 20, p, { size: 12, color: p.ink2 });
    label(ctx, 'Four plies with fibres at 0°, 90°, 90°, 0°', 12, 37, p, { size: 11, color: p.ink3 });
    colourBar(ctx, s.legend, 12, 70, 100, 'Temperature', p);
    const text = tl.store > 0 ? `Run ${tl.run + 1}: added to the simulation data` : `Run ${tl.run + 1}: ${run.text}`;
    label(ctx, text, s.sw / 2, h - 12, p, { align: 'center', size: 12, color: p.ink2 });
  },
});
