// F: the Virtual Process Dossier. Every forming run is recorded as linked
// nodes (material, machines, part, measurement); models learn from the
// collected evidence, and a maturity estimate rises as knowledge accumulates.
import { clamp, easeInOut, label, lerp, register } from './engine';
import { layer, ramp, steel, softDot } from './materials';

type Kind = 'material' | 'machine' | 'run' | 'part' | 'measure' | 'model';
type N = { id: string; kind: Kind; x: number; y: number; text?: string; at: number };
type E = { a: string; b: string; at: number };

const STEP = 1.9;
const CYCLE = 5 * STEP + 2.6;

// layout in unit coordinates; `at` is the step at which the node appears
const NODES: N[] = [
  { id: 'tape', kind: 'material', x: 0.08, y: 0.5, text: 'UD tape', at: 0 },
  { id: 'oven', kind: 'machine', x: 0.3, y: 0.12, text: 'IR oven', at: 0 },
  { id: 'press', kind: 'machine', x: 0.3, y: 0.88, text: 'Press', at: 0 },
  { id: 'r1', kind: 'run', x: 0.42, y: 0.34, text: 'Run 1', at: 1 },
  { id: 'p1', kind: 'part', x: 0.6, y: 0.2, at: 1 },
  { id: 's1', kind: 'measure', x: 0.78, y: 0.14, text: '3D scan', at: 1 },
  { id: 'r2', kind: 'run', x: 0.46, y: 0.56, text: 'Run 2', at: 2 },
  { id: 'p2', kind: 'part', x: 0.63, y: 0.5, at: 2 },
  { id: 's2', kind: 'measure', x: 0.8, y: 0.42, at: 2 },
  { id: 'r3', kind: 'run', x: 0.44, y: 0.76, text: 'Run 3', at: 3 },
  { id: 'p3', kind: 'part', x: 0.62, y: 0.8, at: 3 },
  { id: 's3', kind: 'measure', x: 0.8, y: 0.72, at: 3 },
  { id: 'model', kind: 'model', x: 0.95, y: 0.44, text: 'Model', at: 4 },
];
const EDGES: E[] = [
  { a: 'tape', b: 'r1', at: 1 }, { a: 'oven', b: 'r1', at: 1 }, { a: 'press', b: 'r1', at: 1 },
  { a: 'r1', b: 'p1', at: 1 }, { a: 'p1', b: 's1', at: 1 },
  { a: 'tape', b: 'r2', at: 2 }, { a: 'oven', b: 'r2', at: 2 }, { a: 'press', b: 'r2', at: 2 },
  { a: 'r2', b: 'p2', at: 2 }, { a: 'p2', b: 's2', at: 2 },
  { a: 'tape', b: 'r3', at: 3 }, { a: 'oven', b: 'r3', at: 3 }, { a: 'press', b: 'r3', at: 3 },
  { a: 'r3', b: 'p3', at: 3 }, { a: 'p3', b: 's3', at: 3 },
  { a: 's1', b: 'model', at: 4 }, { a: 's2', b: 'model', at: 4 }, { a: 's3', b: 'model', at: 4 },
];
const MATURITY = [0.05, 0.22, 0.38, 0.52, 0.78, 0.78];

function shape(ctx: CanvasRenderingContext2D, kind: Kind, x: number, y: number, r: number) {
  ctx.beginPath();
  if (kind === 'material') ctx.rect(x - r, y - r, 2 * r, 2 * r);
  else if (kind === 'machine') {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      i ? ctx.lineTo(x + r * 1.1 * Math.cos(a), y + r * 1.1 * Math.sin(a)) : ctx.moveTo(x + r * 1.1 * Math.cos(a), y + r * 1.1 * Math.sin(a));
    }
    ctx.closePath();
  } else if (kind === 'part') {
    ctx.moveTo(x, y - r * 1.15);
    ctx.lineTo(x + r * 1.15, y);
    ctx.lineTo(x, y + r * 1.15);
    ctx.lineTo(x - r * 1.15, y);
    ctx.closePath();
  } else if (kind === 'measure') {
    ctx.moveTo(x, y - r * 1.2);
    ctx.lineTo(x + r * 1.1, y + r * 0.8);
    ctx.lineTo(x - r * 1.1, y + r * 0.8);
    ctx.closePath();
  } else if (kind === 'model') ctx.roundRect(x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4, 4);
  else ctx.arc(x, y, r, 0, Math.PI * 2);
}

function nodeIcon(kind: Kind, id: string) {
  const { canvas, ctx } = layer(58, 58, 2);
  ctx.translate(29, 29);
  shape(ctx, kind, 0, 0, 20);
  ctx.save(); ctx.translate(1.2, 1.7);
  ctx.fillStyle = kind === 'model' ? '#00735f' : '#a4b0b7';
  ctx.fill(); ctx.restore();
  ctx.fillStyle = kind === 'model' ? ramp(ctx, -15, -20, 15, 20, ['#b9e3da', '#009682']) : steel(ctx, -20, 40);
  ctx.fill(); ctx.strokeStyle = kind === 'model' ? '#00735f' : '#8a939b'; ctx.lineWidth = 1.25; ctx.stroke();
  ctx.strokeStyle = '#4f555b'; ctx.fillStyle = '#4f555b'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  if (kind === 'material') {
    ctx.fillStyle = '#2e3236'; ctx.fillRect(-12, -10, 24, 20);
    ctx.strokeStyle = '#a3a9af'; ctx.lineWidth = 0.8;
    for (let i = -7; i <= 9; i += 4) { ctx.moveTo(-12, i); ctx.lineTo(12, i); }
  } else if (kind === 'machine') {
    if (id === 'oven') {
      ctx.rect(-12, -10, 24, 4); ctx.rect(-12, 6, 24, 4);
      for (let i = -8; i <= 8; i += 8) { ctx.moveTo(i, -3); ctx.lineTo(i, 3); }
    } else { ctx.rect(-12, 6, 24, 5); ctx.moveTo(-8, -11); ctx.lineTo(-5, -2); ctx.lineTo(5, -2); ctx.lineTo(8, -11); ctx.closePath(); }
  } else if (kind === 'part') {
    ctx.moveTo(-13, -5); ctx.lineTo(-8, -5); ctx.lineTo(-5, 5); ctx.lineTo(5, 5); ctx.lineTo(8, -5); ctx.lineTo(13, -5);
  } else if (kind === 'measure') {
    for (let i = -7; i <= 7; i += 4) { ctx.moveTo(i, -5); ctx.lineTo(i + 4, 8); }
    ctx.moveTo(-9, 1); ctx.lineTo(9, 1); ctx.moveTo(-6, 5); ctx.lineTo(10, 5);
  } else if (kind === 'model') {
    ctx.strokeStyle = '#ffffff';
    ctx.moveTo(-11, 8); ctx.lineTo(-5, -8); ctx.lineTo(10, -2); ctx.lineTo(-11, 8); ctx.lineTo(10, 11); ctx.lineTo(10, -2);
  } else { ctx.arc(0, 0, 9, -Math.PI * 0.6, Math.PI * 1.15); ctx.moveTo(-10, -1); ctx.lineTo(-8, -8); ctx.lineTo(-2, -5); }
  ctx.stroke();
  return canvas;
}

type S = { box: { x: number; y: number; w: number; h: number }; gauge: { x: number; y0: number; y1: number }; icons: Map<string, HTMLCanvasElement>; halo: HTMLCanvasElement; gaugeFill: CanvasGradient; unit: number };

register<S>('f', {
  still: 4.6 * STEP,
  setup(w, h) {
    const unit = clamp(w / 950, 0.55, 1.25), gw = 70 * unit;
    const box = { x: 22 * unit, y: 30, w: w - gw - 70 * unit, h: h - 70 };
    const gauge = { x: w - gw / 2 - 10 * unit, y0: 36, y1: h - 40 };
    const icons = new Map(NODES.map(n => [n.id, nodeIcon(n.kind, n.id)]));
    const { ctx } = layer(1, 1);
    return { box, gauge, icons, unit, halo: softDot(), gaugeFill: ramp(ctx, 0, gauge.y0, 0, gauge.y1, ['#009682', '#b9e3da']) };
  },
  draw(ctx, w, h, t, s, p) {
    const u = ((t % CYCLE) + CYCLE) % CYCLE;
    const stepF = u / STEP;
    const fade = 1 - clamp((u - (CYCLE - 0.6)) / 0.6);
    const byId = new Map(NODES.map((n) => [n.id, n]));
    const P = (n: N) => [s.box.x + n.x * s.box.w, s.box.y + n.y * s.box.h] as const;
    const appear = (at: number) => clamp((stepF - at) * 2.2);

    ctx.globalAlpha = fade;
    for (const e of EDGES) {
      const a = appear(e.at);
      if (a <= 0) continue;
      const [x0, y0] = P(byId.get(e.a)!);
      const [x1, y1] = P(byId.get(e.b)!);
      ctx.strokeStyle = e.b === 'model' ? p.accent : '#b9bfc5';
      ctx.lineWidth = e.b === 'model' ? 1.4 : 1;
      ctx.globalAlpha = fade * easeInOut(a);
      ctx.beginPath(); ctx.moveTo(x0, y0);
      const bend = (x1 - x0) * 0.45;
      ctx.bezierCurveTo(x0 + bend, y0, x1 - bend, y1, x1, y1);
      ctx.lineWidth *= s.unit; ctx.stroke();
      ctx.globalAlpha = fade;
    }
    for (const n of NODES) {
      const a = appear(n.at);
      if (a <= 0) continue;
      const [x, y] = P(n);
      const fresh = n.at > 0 && stepF - n.at < 0.6;
      const R = 15 * s.unit;
      const r = R * easeInOut(a);
      if (n.kind === 'model') {
        ctx.globalAlpha = fade * easeInOut(a) * (0.65 + 0.15 * Math.sin(t * 2));
        ctx.drawImage(s.halo, x - 3 * R, y - 3 * R, 6 * R, 6 * R);
        ctx.globalAlpha = fade;
      }
      ctx.drawImage(s.icons.get(n.id)!, x - 1.45 * r, y - 1.45 * r, 2.9 * r, 2.9 * r);
      if (fresh) {
        ctx.globalAlpha = fade * (1 - clamp((stepF - n.at - 0.4) / 0.2));
        shape(ctx, n.kind, x, y, r); ctx.strokeStyle = p.accent; ctx.lineWidth = 1.3 * s.unit; ctx.stroke();
        ctx.globalAlpha = fade;
      }
      const shown = clamp((a - 0.45) / 0.35);
      if (n.text && shown > 0) {
        const below = n.kind !== 'machine' || n.y > 0.5;
        const fs = w > 800 ? 13 : 11;
        ctx.globalAlpha = fade * shown;
        label(ctx, n.text, x, below ? y + R * 2 + fs : y - R * 1.6 - 4, p, { align: 'center', size: fs, color: p.ink2 });
        ctx.globalAlpha = fade;
      }
    }

    // maturity gauge: it stays, and drains back to its start level while the dossier clears
    ctx.globalAlpha = 1;
    const g = s.gauge;
    const rise = lerp(MATURITY[Math.min(Math.floor(stepF), 5)], MATURITY[Math.min(Math.floor(stepF) + 1, 5)], easeInOut(stepF % 1));
    const level = lerp(MATURITY[0], rise, easeInOut(fade));
    ctx.fillStyle = '#eef0f2';
    ctx.beginPath();
    ctx.roundRect(g.x - 7 * s.unit, g.y0, 14 * s.unit, g.y1 - g.y0, 7);
    ctx.fill();
    ctx.fillStyle = s.gaugeFill;
    ctx.beginPath();
    const top = lerp(g.y1, g.y0, level);
    ctx.roundRect(g.x - 7 * s.unit, top, 14 * s.unit, g.y1 - top, 7);
    ctx.fill();
    ctx.strokeStyle = '#8a939b'; ctx.lineWidth = Math.max(0.5, s.unit * 0.7);
    for (let i = 0; i <= 4; i++) {
      const y = lerp(g.y0, g.y1, i / 4);
      ctx.beginPath(); ctx.moveTo(g.x + 10 * s.unit, y); ctx.lineTo(g.x + 14 * s.unit, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    label(ctx, 'Maturity', g.x, g.y1 + 18, p, { align: 'center', size: 12, color: p.ink2 });
    label(ctx, 'Each run is recorded with its provenance', s.box.x, h - 12, p, { size: 12, color: p.ink2 });
  },
});
