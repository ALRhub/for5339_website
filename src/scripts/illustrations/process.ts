// The demonstrator process in side view: a carriage on a linear axis carries
// the tape laminate in its gripper frame from pick-up to the infrared oven, the
// press and optical inspection. The press forms it as in T2 and M4: the laminate
// hangs from the grippers above the die, keeps its length while the punch forms
// it, so the grippers slide inwards (draw-in), and it cools where it touches the
// tools. Colour shows the laminate temperature.
import { clamp, easeInOut, label, lerp, mix, register } from './engine';
import { gripper } from './scene';
import { steel, HEAT } from './materials';
import { drawLaminate, matchedTools, mirror, resample, shape, type Pt, type Tools } from './laminate';

const K = {
  appear: 0.6,
  toOven: 1.0,
  heat: 1.6,
  toPress: 0.55,
  approach: 0.4,
  press: 0.6,
  hold: 0.5,
  lift: 0.5,
  toScan: 1.0,
  scan: 1.5,
  rest: 0.9,
  fade: 0.6,
};
const CYCLE = Object.values(K).reduce((a, b) => a + b, 0);
const STATIONS = [0.12, 0.38, 0.63, 0.87];
const NAMES = ['Pick up', 'Heat', 'Form', 'Inspect'];
const DENSE = 120; // samples of the mid-surface on each side of the centre
const ELEMENTS = 20; // elements per ply on each side of the centre
const MARK = 10; // marker lines through the stack at the centre and half-way out (on the walls once formed)
const COOL = 0.5; // seconds of tool contact that cool the touching ply most of the way

type S = {
  U: number; rail: number; level: number; hw: number;
  g: Tools; // the laminate and tools, measured from the centre of the laminate
  thick: number; depth: number; full: number; // die depth; punch travel from first contact to the bottom
  touchTop: Float32Array; touchBottom: Float32Array; // forming progress of the first punch (die) contact per sample, 2 if none
  hardware: HTMLCanvasElement; punch: HTMLCanvasElement;
  glow: HTMLCanvasElement; shadow: HTMLCanvasElement;
  steel: CanvasGradient; scan: CanvasGradient; heatColours: string[];
};

function layer(w: number, h: number) {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.ceil(w * dpr); canvas.height = Math.ceil(h * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return { canvas, ctx };
}

function body(ctx: CanvasRenderingContext2D, path: Path2D, fill: CanvasGradient, unit: number) {
  ctx.save(); ctx.translate(unit * 0.055, unit * 0.07);
  ctx.fillStyle = '#84939a'; ctx.fill(path); ctx.restore();
  ctx.fillStyle = fill; ctx.fill(path);
  ctx.save(); ctx.clip(path);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = Math.max(0.45, unit * 0.012);
  ctx.beginPath();
  for (let y = 0; y < ctx.canvas.height / Math.min(window.devicePixelRatio || 1, 2); y += unit * 0.14) { ctx.moveTo(0, y); ctx.lineTo(ctx.canvas.width / Math.min(window.devicePixelRatio || 1, 2), y); }
  ctx.stroke(); ctx.restore();
  ctx.save(); ctx.clip(path); ctx.translate(0, -unit * 0.055);
  ctx.strokeStyle = 'rgba(63,79,86,0.28)'; ctx.lineWidth = unit * 0.09; ctx.stroke(path); ctx.restore();
  ctx.strokeStyle = '#728189'; ctx.lineWidth = Math.max(0.6, unit * 0.018); ctx.stroke(path);
}

function box(x: number, y: number, w: number, h: number, r = 0) {
  const path = new Path2D(); path.roundRect(x, y, w, h, r); return path;
}

function screw(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = '#aeb6bc';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#707a82'; ctx.lineWidth = Math.max(0.5, r * 0.15); ctx.stroke();
  ctx.strokeStyle = '#687177'; ctx.lineWidth = Math.max(0.5, r * 0.18);
  ctx.beginPath(); ctx.moveTo(x - r * 0.45, y + r * 0.15); ctx.lineTo(x + r * 0.45, y - r * 0.15); ctx.stroke();
}

// The punch comes down until it touches the laminate (approach), then presses it into the die
// (formed), and after the hold goes back up (lift); the part keeps its shape. `pressed` counts the
// seconds since the punch began to press, for the cooling where the laminate touches the tools.
function phase(t: number) {
  let u = ((t % CYCLE) + CYCLE) % CYCLE;
  const out = { pos: 0, heat: 0, approach: 0, formed: 0, lift: 0, scan: -1, alpha: 1, pressed: -1 };
  const seq: [keyof typeof K, (q: number) => void][] = [
    ['appear', (q) => (out.alpha = q)],
    ['toOven', (q) => (out.pos = easeInOut(q))],
    ['heat', (q) => ((out.pos = 1), (out.heat = q))],
    ['toPress', (q) => ((out.pos = 1 + easeInOut(q)), (out.heat = 1 - 0.1 * q))],
    ['approach', (q) => ((out.pos = 2), (out.heat = 0.9 - 0.1 * q), (out.approach = easeInOut(q)))],
    ['press', (q) => ((out.pos = 2), (out.heat = 0.8 - 0.2 * q), (out.approach = 1), (out.formed = easeInOut(q)))],
    ['hold', (q) => ((out.pos = 2), (out.heat = 0.6 - 0.3 * q), (out.approach = 1), (out.formed = 1))],
    ['lift', (q) => ((out.pos = 2), (out.heat = 0.3 - 0.1 * q), (out.formed = 1), (out.lift = easeInOut(q)))],
    ['toScan', (q) => ((out.pos = 2 + easeInOut(q)), (out.heat = 0.2 * (1 - q)), (out.formed = 1), (out.lift = 1))],
    ['scan', (q) => ((out.pos = 3), (out.formed = 1), (out.lift = 1), (out.scan = q))],
    ['rest', () => ((out.pos = 3), (out.formed = 1), (out.lift = 1), (out.scan = 1))],
    ['fade', (q) => ((out.pos = 3), (out.formed = 1), (out.lift = 1), (out.scan = 1), (out.alpha = 1 - q))],
  ];
  let since = -K.appear - K.toOven - K.heat - K.toPress - K.approach;
  for (const [key, fn] of seq) {
    if (u < K[key]) {
      fn(u / K[key]);
      out.pressed = since + u;
      return out;
    }
    u -= K[key];
    since += K[key];
  }
  return out;
}

register<S>('process', {
  still: K.appear + K.toOven + K.heat * 0.8,
  setup(w, h) {
    const U = Math.min((h - 24) / 7.2, w / 15);
    const offset = Math.max(0, (h - 24 - 7.2 * U) / 2);
    const level = offset + 12 + 3.3 * U;
    const rail = level + 2.3 * U;
    const hw = Math.min(1.5 * U, w * 0.07);
    // The laminate (as long as the blanks) hangs from the grippers at `level`, a little above the
    // die; punch and die are matched to the formed laminate as in T2 and M4.
    const thick = Math.max(3, 0.13 * U), clear = thick / 2 + Math.max(0.5, 0.02 * U), hold = 0.9 * thick;
    const g: Tools = { cx: 0, top: level + hold, clear, hold, wb: 0.38 * hw, wd: 0.58 * hw, half: hw };
    const depth = 0.37 * hw, full = depth + hold;
    const matched = matchedTools(g, depth);
    const { canvas: hardware, ctx } = layer(w, h);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // Soft contact shadows are restricted to the station bases and carriage.
    const { canvas: shadow, ctx: sh } = layer(4 * U, 0.6 * U);
    sh.translate(2 * U, 0.3 * U); sh.scale(1, 0.15);
    const shade = sh.createRadialGradient(0, 0, 0, 0, 0, 2 * U);
    shade.addColorStop(0, 'rgba(20,24,28,0.15)'); shade.addColorStop(1, 'rgba(20,24,28,0)');
    sh.fillStyle = shade; sh.fillRect(-2 * U, -2 * U, 4 * U, 4 * U);
    for (const i of [0, 2]) ctx.drawImage(shadow, STATIONS[i] * w - 2 * U, rail - 0.5 * U, 4 * U, 0.6 * U);

    const railFill = steel(ctx, rail, 0.18 * U);
    body(ctx, box(w * 0.03, rail, w * 0.94, U * 0.18, U * 0.025), railFill, U);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(0.5, 0.016 * U);
    ctx.beginPath(); ctx.moveTo(w * 0.03, rail + 0.035 * U); ctx.lineTo(w * 0.97, rail + 0.035 * U); ctx.stroke();

    // The rail has a recessed running channel and bolted mounting points.
    ctx.fillStyle = '#b8c0c6';
    ctx.fillRect(w * 0.03, rail + 0.16 * U, w * 0.94, 0.11 * U);
    ctx.fillStyle = '#8e989f';
    ctx.fillRect(w * 0.03, rail + 0.2 * U, w * 0.94, 0.022 * U);
    ctx.fillStyle = '#f7f8f9';
    ctx.fillRect(w * 0.03, rail + 0.24 * U, w * 0.94, 0.016 * U);
    if (U > 30) for (let i = 0; i < 17; i++) {
      const bx = w * (0.045 + i * 0.056);
      ctx.fillStyle = '#707a82';
      ctx.fillRect(bx, rail + 0.07 * U, 0.1 * U, 0.025 * U);
    }

    // Pick-up table and a stack of three cold laminate blanks, drawn once at the current size.
    const px0 = STATIONS[0] * w;
    const tableFill = steel(ctx, level + 0.72 * U, 1.3 * U);
    for (const side of [-1, 1]) body(ctx, box(px0 + side * hw * 0.8 - U * 0.055, level + 0.8 * U, U * 0.11, rail - level - U), tableFill, U);
    body(ctx, box(px0 - hw - 0.08 * U, level + 0.72 * U, 2 * hw + 0.16 * U, 0.13 * U, 0.025 * U), tableFill, U);
    for (let i = 0; i < 3; i++) {
      const by = level + 0.72 * U - thick / 2 - i * (thick + 0.03 * U);
      const flat: Pt[] = Array.from({ length: 2 * DENSE + 1 }, (_, k) => ({ x: px0 + ((k - DENSE) / DENSE) * hw, y: by, tag: 0 }));
      drawLaminate(ctx, flat, DENSE, { thick, scale: U / 55, elements: ELEMENTS, mark: MARK, fill: () => HEAT[0] });
    }

    // Steel infrared housings; the inward faces carry the emitter strips.
    const ox = STATIONS[1] * w;
    for (const y of [level - 1.15 * U, level + 0.85 * U]) {
      body(ctx, box(ox - hw - 0.15 * U, y, 2 * hw + 0.3 * U, 0.3 * U, 0.05 * U), steel(ctx, y, 0.3 * U), U);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(0.5, 0.015 * U);
      ctx.beginPath(); ctx.moveTo(ox - hw - 0.1 * U, y + 0.035 * U); ctx.lineTo(ox + hw + 0.1 * U, y + 0.035 * U); ctx.stroke();
    }

    // Reflective oven interiors and side uprights give the two emitters a housing.
    for (const side of [-1, 1]) {
      const sx = ox + side * (hw + 0.24 * U);
      body(ctx, box(sx - 0.06 * U, level - 0.9 * U, 0.12 * U, 1.95 * U, 0.025 * U),
        steel(ctx, level - 0.9 * U, 1.95 * U), U);
      screw(ctx, sx, level - 0.69 * U, 0.045 * U);
      screw(ctx, sx, level + 0.67 * U, 0.045 * U);
    }
    for (const y of [level - 0.85 * U, level + 0.85 * U]) {
      const inside = y < level ? y + 0.01 * U : y - 0.075 * U;
      ctx.fillStyle = '#9ea8ae';
      ctx.fillRect(ox - hw * 0.92, inside, 1.84 * hw, 0.055 * U);
      ctx.fillStyle = '#f8f9fa';
      ctx.fillRect(ox - hw * 0.88, inside, 1.76 * hw, 0.016 * U);
    }

    const px = STATIONS[2] * w, top = g.top + clear, d = depth;

    // Two guide columns and a head beam anchor the moving punch to the press.
    for (const side of [-1, 1]) {
      const sx = px + side * (hw + 0.38 * U);
      body(ctx, box(sx - 0.085 * U, level - 3.1 * U, 0.17 * U, 4.01 * U, 0.022 * U),
        steel(ctx, level - 3.1 * U, 4.01 * U), U);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx - 0.058 * U, level - 3.07 * U, 0.022 * U, 3.91 * U);
      body(ctx, box(sx - 0.16 * U, level + 0.76 * U, 0.32 * U, 0.18 * U, 0.02 * U),
        steel(ctx, level + 0.76 * U, 0.18 * U), U);
    }
    body(ctx, box(px - hw - 0.53 * U, level - 3.35 * U, 2 * hw + 1.06 * U, 0.28 * U, 0.035 * U),
      steel(ctx, level - 3.35 * U, 0.28 * U), U);
    for (const side of [-1, 1]) screw(ctx, px + side * (hw + 0.35 * U), level - 3.21 * U, 0.045 * U);
    const die = new Path2D();
    die.moveTo(px - hw - 0.1 * U, top); die.lineTo(px - g.wd, top);
    die.lineTo(px - matched.bottom, top + d); die.lineTo(px + matched.bottom, top + d);
    die.lineTo(px + g.wd, top); die.lineTo(px + hw + 0.1 * U, top);
    die.lineTo(px + hw + 0.1 * U, top + d + 0.55 * U);
    die.lineTo(px - hw - 0.1 * U, top + d + 0.55 * U); die.closePath();
    body(ctx, die, steel(ctx, top, d + 0.55 * U), U);

    ctx.save(); ctx.translate(0.08 * U, 0.08 * U);
    ctx.fillStyle = '#a7b0b6'; ctx.fill(die); ctx.restore();
    body(ctx, die, steel(ctx, top, d + 0.55 * U), U);
    ctx.strokeStyle = '#a1aab0'; ctx.lineWidth = Math.max(0.6, 0.018 * U);
    ctx.beginPath(); ctx.moveTo(px - hw * 0.93, top + d + 0.41 * U);
    ctx.lineTo(px + hw * 0.93, top + d + 0.41 * U); ctx.stroke();
    for (const side of [-1, 1]) screw(ctx, px + side * hw * 0.8, top + d + 0.27 * U, 0.055 * U);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(0.7, U * 0.025);
    ctx.beginPath(); ctx.moveTo(px - hw + 0.02 * U, top + 0.03 * U);
    ctx.lineTo(px - g.wd - 0.02 * hw, top + 0.03 * U);
    ctx.moveTo(px + g.wd + 0.02 * hw, top + 0.03 * U); ctx.lineTo(px + hw - 0.02 * U, top + 0.03 * U); ctx.stroke();
    body(ctx, box(px - hw * 0.86, top + d + 0.57 * U, 1.72 * hw, 0.13 * U, 0.02 * U), tableFill, U);

    // Punch sprite, nose at 1.35 U: its walls run parallel to the die walls, one laminate apart.
    // Its vertical lighting moves with the body.
    const { canvas: punch, ctx: pc } = layer(2 * hw, 2 * U);
    const nose = g.wb - clear, rise = depth - clear, side = nose + rise * matched.cot, shoulder = 1.35 * U - rise;
    const punchPath = new Path2D();
    punchPath.moveTo(hw - side, shoulder); punchPath.lineTo(hw - nose, 1.35 * U);
    punchPath.lineTo(hw + nose, 1.35 * U); punchPath.lineTo(hw + side, shoulder);
    punchPath.lineTo(hw + side, 0.04 * U); punchPath.lineTo(hw - side, 0.04 * U); punchPath.closePath();
    body(pc, punchPath, steel(pc, 0, 1.35 * U), U);
    pc.strokeStyle = '#ffffff'; pc.lineWidth = Math.max(0.7, U * 0.025);
    pc.beginPath(); pc.moveTo(hw - side + 0.02 * hw, 0.075 * U); pc.lineTo(hw + side - 0.02 * hw, 0.075 * U); pc.stroke();

    // A narrow facet suggests a machined tool face rather than a flat icon.
    const facet = 0.19 * side;
    pc.fillStyle = 'rgba(135,146,154,0.14)';
    pc.beginPath(); pc.moveTo(hw + side - facet, 0.08 * U); pc.lineTo(hw + side - 0.03 * U, 0.08 * U);
    pc.lineTo(hw + side - 0.03 * U, shoulder); pc.lineTo(hw + nose - 0.03 * U, 1.31 * U);
    pc.lineTo(hw + nose - facet * 0.4, 1.31 * U); pc.lineTo(hw + side - facet, shoulder); pc.closePath(); pc.fill();
    pc.strokeStyle = '#aab3b9'; pc.lineWidth = Math.max(0.5, 0.014 * U);
    pc.beginPath(); pc.moveTo(hw - side + 0.04 * hw, 0.23 * U); pc.lineTo(hw + side - 0.04 * hw, 0.23 * U); pc.stroke();
    for (const dir of [-1, 1]) screw(pc, hw + dir * (side - 0.14 * U), 0.15 * U, 0.038 * U);

    // Inspection camera: housing, lens and a short mounting stem.
    const ix = STATIONS[3] * w, cam = level - 2.1 * U;
    body(ctx, box(ix - U * 0.055, cam - 0.7 * U, U * 0.11, 0.7 * U), steel(ctx, cam - 0.7 * U, U), U);
    body(ctx, box(ix - 0.4 * U, cam, 0.8 * U, 0.4 * U, 0.06 * U), steel(ctx, cam, U * 0.4), U);
    ctx.fillStyle = '#4f555b'; ctx.fillRect(ix - U * 0.17, cam + 0.4 * U, U * 0.34, U * 0.2);
    ctx.fillStyle = '#8a939b'; ctx.fillRect(ix - U * 0.13, cam + 0.57 * U, U * 0.26, U * 0.035);

    ctx.fillStyle = '#dce2e5';
    ctx.beginPath(); ctx.arc(ix, cam + 0.49 * U, 0.12 * U, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3f4b50';
    ctx.beginPath(); ctx.arc(ix, cam + 0.49 * U, 0.079 * U, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8da49e';
    ctx.beginPath(); ctx.arc(ix - 0.02 * U, cam + 0.465 * U, 0.025 * U, 0, Math.PI * 2); ctx.fill();
    for (const side of [-1, 1]) screw(ctx, ix + side * 0.3 * U, cam + 0.16 * U, 0.028 * U);
    const scan = ctx.createLinearGradient(0, cam + 0.6 * U, 0, level + full);
    scan.addColorStop(0, 'rgba(0,150,130,0.015)'); scan.addColorStop(1, 'rgba(0,150,130,0.2)');

    // One cached heat field, reused for both emitters and the hot sheet.
    const { canvas: glow, ctx: gc } = layer(hw * 2.6, U * 1.4);
    gc.translate(hw * 1.3, U * 0.7); gc.scale(hw * 1.3, U * 0.7);
    const heat = gc.createRadialGradient(0, 0, 0, 0, 0, 1);
    heat.addColorStop(0, 'rgba(242,193,78,0.4)'); heat.addColorStop(0.45, 'rgba(228,87,46,0.12)'); heat.addColorStop(1, 'rgba(228,87,46,0)');
    gc.fillStyle = heat; gc.fillRect(-1, -1, 2, 2);
    const heatColours = Array.from({ length: 65 }, (_, i) => i < 32 ? mix(HEAT[0], HEAT[1], i / 32) : mix(HEAT[1], HEAT[2], (i - 32) / 32));
    // when each piece of the laminate first touches the punch (top face) or the die (bottom face)
    const touchTop = new Float32Array(DENSE + 1).fill(2), touchBottom = new Float32Array(DENSE + 1).fill(2);
    for (let k = 0; k <= 60; k++) {
      const u = k / 60;
      resample(shape(g, easeInOut(u) * full), DENSE).forEach((q, i) => {
        const onTop = q.tag === 1 || q.tag === 2;
        const onBottom = q.tag === 3 || ((q.tag === 4 || q.tag === 1) && u >= 0.985);
        if (onTop && touchTop[i] > 1) touchTop[i] = u;
        if (onBottom && touchBottom[i] > 1) touchBottom[i] = u;
      });
    }
    return {
      U, rail, level, hw, g, thick, depth, full, touchTop, touchBottom,
      hardware, punch, glow, shadow, scan, steel: steel(ctx, level - 0.3 * U, rail - level + 0.3 * U), heatColours,
    };
  },
  draw(ctx, w, h, t, s, p) {
    const ph = phase(t);
    const { U, rail, level, hw } = s;
    const X = (i: number) => STATIONS[i] * w;
    const i0 = Math.floor(ph.pos);
    const x = lerp(X(i0), X(Math.min(i0 + 1, 3)), ph.pos - i0);
    const arm = hw + 0.42 * U;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.drawImage(s.hardware, 0, 0, w, h);

    // the emitters glow while the sheet heats and fade as the carriage leaves the oven
    const glow = ph.heat * clamp(1 - Math.max(0, Math.abs(ph.pos - 1) - 0.02) / 0.3);
    ctx.globalAlpha = glow;
    for (const y of [level - 0.72 * U, level + 0.72 * U]) ctx.drawImage(s.glow, X(1) - hw * 1.3, y - 0.7 * U, hw * 2.6, U * 1.4);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = s.heatColours[Math.round(glow * 64)]; ctx.lineWidth = 0.065 * U;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ex = X(1) - hw + ((i + 0.5) * 2 * hw) / 6;
      for (const y of [level - 0.72 * U, level + 0.72 * U]) { ctx.moveTo(ex - 0.14 * U, y); ctx.lineTo(ex + 0.14 * U, y); }
    }
    ctx.stroke();

    // punch nose: raised, then on the hanging laminate, then pressing it into the die
    const raised = level - 1.75 * U;
    const touch = level - s.g.clear;
    const pb = ph.lift > 0 ? lerp(touch + s.full, raised, ph.lift) : lerp(raised, touch, ph.approach) + s.full * ph.formed;
    const rodTop = level - 3.07 * U;
    const punchTop = pb - 1.31 * U;
    ctx.fillStyle = '#98a2aa';
    ctx.fillRect(X(2) - 0.085 * U, rodTop, 0.17 * U, Math.max(0, punchTop - rodTop));
    ctx.fillStyle = '#f5f6f7';
    ctx.fillRect(X(2) - 0.065 * U, rodTop, 0.035 * U, Math.max(0, punchTop - rodTop));
    ctx.drawImage(s.punch, X(2) - hw, pb - 1.35 * U, 2 * hw, 2 * U);

    // The laminate's mid-surface: flat until the punch presses, then formed with the grippers drawn
    // in; it keeps its length throughout.
    const M = mirror(shape(s.g, s.full * ph.formed), x, DENSE);
    const first = M[0], last = M[M.length - 1];

    // the scanned area (above the part's top face) fades with the part; the scan line fades in and out
    if (ph.scan >= 0 && Math.abs(ph.pos - 3) < 0.05) {
      const cam = level - 1.5 * U;
      const sx = lerp(first.x, last.x, clamp(ph.scan));
      const face = (q: Pt) => q.y - s.thick / 2;
      let j = 1;
      while (j < M.length - 1 && M[j].x < sx) j++;
      const sy = lerp(face(M[j - 1]), face(M[j]), clamp((sx - M[j - 1].x) / Math.max(1e-6, M[j].x - M[j - 1].x)));
      ctx.globalAlpha = ph.alpha;
      ctx.fillStyle = s.scan;
      ctx.beginPath(); ctx.moveTo(X(3), cam);
      for (let i = 0; i < j; i++) ctx.lineTo(M[i].x, face(M[i]));
      ctx.lineTo(sx, sy); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = ph.alpha * clamp(Math.min(ph.scan, 1 - ph.scan) / 0.08);
      ctx.strokeStyle = p.accent; ctx.lineWidth = Math.max(0.8, U * 0.025);
      ctx.beginPath(); ctx.moveTo(X(3), cam); ctx.lineTo(sx, sy); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = ph.alpha;
    ctx.drawImage(s.shadow, x - arm - 0.75 * U, rail - 0.1 * U, 1.5 * U, U * 0.3);
    // A solid carriage and upright support the rear rail of the gripper frame.
    body(ctx, box(x - arm - 0.36 * U, rail - 0.31 * U, 0.72 * U, 0.3 * U, 0.045 * U), s.steel, U);
    for (const side of [-1, 1]) {
      const wx = x - arm + side * 0.22 * U;
      ctx.fillStyle = '#505b62';
      ctx.beginPath(); ctx.arc(wx, rail - 0.08 * U, 0.105 * U, 0, Math.PI * 2); ctx.fill();
      screw(ctx, wx, rail - 0.08 * U, 0.045 * U);
    }
    body(ctx, box(x - arm - 0.055 * U, level - 0.24 * U, 0.11 * U, rail - level - 0.1 * U), s.steel, U);
    body(ctx, box(x - arm, level - 0.24 * U, 2 * arm, 0.13 * U, 0.02 * U), s.steel, U);
    ctx.strokeStyle = '#f9fafb'; ctx.lineWidth = Math.max(0.5, U * 0.015);
    ctx.beginPath(); ctx.moveTo(x - arm + 0.04 * U, level - 0.21 * U);
    ctx.lineTo(x + arm - 0.04 * U, level - 0.21 * U); ctx.stroke();
    // the gripper mounts slide along the frame as the grippers follow the laminate's ends
    for (const ax of [first.x - 0.2 * U, last.x + 0.2 * U]) {
      body(ctx, box(ax - 0.06 * U, level - 0.24 * U, 0.12 * U, 0.3 * U), s.steel, U);
      screw(ctx, ax, level - 0.14 * U, 0.04 * U);
    }

    ctx.globalAlpha = ph.alpha * ph.heat * 0.6;
    ctx.drawImage(s.glow, x - hw * 1.3, level + (s.full * ph.formed) / 2 - U * 0.35, hw * 2.6, U * 0.7);
    ctx.globalAlpha = ph.alpha;
    // Four tape plies, as in T2: hot from the oven, cooling where a face has touched a tool; the
    // touching ply cools most.
    const cooling = (touch: Float32Array, i: number) => (touch[i] <= 1 ? clamp((ph.pressed - touch[i] * K.press) / COOL) : 0);
    const fill = (f: number, ply: number) => {
      const i = Math.min(DENSE, Math.round(Math.abs(f - DENSE)));
      const depth = ply / 3;
      const cool = Math.max(cooling(s.touchTop, i) * lerp(1, 0.35, depth), cooling(s.touchBottom, i) * lerp(0.35, 1, depth));
      return s.heatColours[Math.round(clamp(ph.heat * (1 - 0.6 * cool)) * 64)];
    };
    drawLaminate(ctx, M, DENSE, { thick: s.thick, scale: U / 55, elements: ELEMENTS, mark: MARK, fill });
    const gs = U * 0.48;
    gripper(ctx, first.x - gs * 0.28, first.y, gs, 270, p.ink2);
    gripper(ctx, last.x + gs * 0.28, last.y, gs, 90, p.ink2);
    ctx.globalAlpha = 1;

    STATIONS.forEach((q, i) => {
      const active = Math.abs(ph.pos - i) < 0.05;
      label(ctx, NAMES[i], q * w, rail + 1.1 * U, p, {
        align: 'center', size: Math.round(Math.min(15, Math.max(12, U * 0.3))),
        weight: active ? 600 : 500, color: active ? p.ink : p.ink2,
      });
    });
  },
});
