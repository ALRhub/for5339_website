// Shared process elements, so that every illustration shows the same process:
// the laminate sheet held by eight grippers in the gripper frame (top view).
import type { Palette } from './engine';
import { layer, ramp, steel } from './materials';

export type Gripper = { u: number; v: number; x: number; y: number; rot: number };
export type Frame = {
  x: number;
  y: number;
  s: number; // outer size of the square frame
  sheet: { x: number; y: number; w: number; h: number };
  grippers: Gripper[];
  look: ReturnType<typeof frameLook>;
};

// two grippers per side, as positions along the frame (0..1)
const LAYOUT = [
  { u: 0.3, v: 0 }, { u: 0.7, v: 0 },
  { u: 1, v: 0.35 }, { u: 1, v: 0.7 },
  { u: 0.3, v: 1 }, { u: 0.7, v: 1 },
  { u: 0, v: 0.35 }, { u: 0, v: 0.7 },
];

/** Geometry of a gripper frame of outer size s at (x, y). Grippers sit between frame and sheet, jaws facing the sheet. */
export function frame(x: number, y: number, s: number, layout = LAYOUT): Frame {
  const inset = s * 0.16;
  const band = inset / 2;
  const grippers = layout.map(({ u, v }) => {
    let gx = x + u * s;
    let gy = y + v * s;
    let rot = 0;
    if (v === 0) gy = y + band;
    else if (v === 1) ((gy = y + s - band), (rot = 180));
    else if (u === 0) ((gx = x + band), (rot = 270));
    else ((gx = x + s - band), (rot = 90));
    return { u, v, x: gx, y: gy, rot };
  });
  return { x, y, s, sheet: { x: x + inset, y: y + inset, w: s - 2 * inset, h: s - 2 * inset }, grippers, look: frameLook(s) };
}

/** The gripper glyph used across the site: arm, bar and two jaws. */
export function gripper(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(size / 100, size / 100);
  ctx.fillStyle = color;
  ctx.fillRect(-5.8, -45, 11.6, 21);
  ctx.fillRect(-33, -26, 66, 11);
  ctx.beginPath();
  ctx.roundRect(-29.8, -17, 14.2, 54, 7.1);
  ctx.roundRect(15.6, -17, 14.2, 54, 7.1);
  ctx.fill();
  if (color !== 'rgba(0,0,0,0)') {
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.fillRect(-3.2, -43, 2.2, 18);
    ctx.fillRect(-29, -24.5, 58, 2);
    ctx.fillRect(-29, -12, 2.5, 41);
    ctx.fillRect(15.6, -12, 2.5, 41);
    ctx.fillStyle = 'rgba(12,22,24,0.48)';
    ctx.fillRect(-27, 29, 9, 5); ctx.fillRect(18, 29, 9, 5);
    ctx.fillStyle = 'rgba(20,30,34,0.34)';
    for (const xx of [-23, 23]) {
      ctx.beginPath(); ctx.arc(xx, -13, 3.2, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

/** Top-view jaws bridge the gap from the frame rail to the laminate edge. */
export function frameGripper(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number, color: string) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot * Math.PI / 180); ctx.scale(size / 100, size / 100);
  ctx.fillStyle = color;
  ctx.fillRect(-5.8, -67.5, 11.6, 24);
  ctx.beginPath(); ctx.roundRect(-29.8, 24, 14.2, 56, 5); ctx.roundRect(15.6, 24, 14.2, 56, 5); ctx.fill(); ctx.restore();
  gripper(ctx, x, y, size, rot, color);
}

/** Cache the steel frame and laminate at the current CSS size. */
function frameLook(size: number) {
  const unit = Math.max(0.35, size / 400), pad = 8 * unit;
  const build = (twin: boolean) => {
    const { canvas, ctx } = layer(size + 2 * pad, size + 2 * pad);
    ctx.translate(pad, pad);
    const shell = new Path2D();
    shell.roundRect(0, 0, size, size, size * 0.022);
    shell.roundRect(size * 0.025, size * 0.025, size * 0.95, size * 0.95, size * 0.014);
    if (!twin) {
      ctx.save(); ctx.filter = `blur(${3.2 * unit}px)`; ctx.translate(2.2 * unit, 4.5 * unit);
      ctx.fillStyle = 'rgba(20,24,28,0.22)'; ctx.fill(shell, 'evenodd'); ctx.restore();
    }
    if (!twin) {
      ctx.save(); ctx.translate(0, 2.7 * unit);
      ctx.fillStyle = '#82939a'; ctx.fill(shell, 'evenodd'); ctx.restore();
    }
    ctx.fillStyle = twin ? ramp(ctx, 0, 0, size, size, ['rgba(185,227,218,0.5)', 'rgba(0,150,130,0.16)']) : steel(ctx, 0, size);
    ctx.fill(shell, 'evenodd');
    ctx.lineWidth = unit; ctx.strokeStyle = twin ? 'rgba(0,115,95,0.7)' : '#8a939b'; ctx.stroke(shell);
    if (!twin) {
      const highlight = new Path2D(); highlight.moveTo(2 * unit, size - 4 * unit); highlight.lineTo(2 * unit, 3 * unit); highlight.lineTo(size - 4 * unit, 3 * unit);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = unit; ctx.stroke(highlight);
      // Four recessed fasteners tie the steel rails together.
      for (const fx of [size * 0.0125, size * 0.9875]) for (const fy of [size * 0.0125, size * 0.9875]) {
        ctx.fillStyle = '#828e94'; ctx.beginPath(); ctx.arc(fx, fy, 1.6 * unit, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#e7ecee'; ctx.lineWidth = 0.55 * unit; ctx.stroke();
      }
    }
    const sheetSize = size * 0.68;
    const { canvas: laminate, ctx: lc } = layer(sheetSize, sheetSize);
    lc.fillStyle = ramp(lc, 0, 0, sheetSize * 0.65, sheetSize, twin
      ? ['rgba(245,246,247,0.4)', 'rgba(185,227,218,0.3)', 'rgba(0,150,130,0.09)']
      : ['#fbfdfc', '#bdd0ca', '#819d94']);
    lc.fillRect(0, 0, sheetSize, sheetSize);
    if (!twin) {
      // Unidirectional tapes laid side by side: fine fibre strands in one direction, a faint seam
      // between tapes and a slight change of tone from tape to tape.
      const tape = sheetSize / 7;
      for (let y = 0, i = 0; y < sheetSize; y += tape, i++) {
        lc.fillStyle = i % 2 ? 'rgba(255,255,255,0.08)' : 'rgba(31,59,52,0.05)';
        lc.fillRect(0, y, sheetSize, tape);
        lc.fillStyle = 'rgba(35,65,57,0.24)';
        lc.fillRect(0, y, sheetSize, Math.max(0.6, 0.8 * unit));
      }
      const pitch = Math.max(2.2, 3 * unit);
      for (let y = 0; y < sheetSize; y += pitch) {
        lc.fillStyle = 'rgba(35,65,57,0.10)'; lc.fillRect(0, y, sheetSize, Math.max(0.5, 0.6 * unit));
        lc.fillStyle = 'rgba(255,255,255,0.16)'; lc.fillRect(0, y + pitch * 0.5, sheetSize, Math.max(0.4, 0.5 * unit));
      }
      const glint = lc.createLinearGradient(0, 0, sheetSize, sheetSize * 0.65);
      glint.addColorStop(0, 'rgba(255,255,255,0.19)');
      glint.addColorStop(0.42, 'rgba(255,255,255,0)');
      glint.addColorStop(1, 'rgba(25,48,42,0.13)');
      lc.fillStyle = glint; lc.fillRect(0, 0, sheetSize, sheetSize);
    }
    return { canvas, laminate };
  };
  const fibres = new Path2D(), inset = size * 0.16, end = size - inset;
  const count = size < 220 ? 10 : 17;
  for (let i = 1; i < count; i++) {
    const v = inset + (end - inset) * i / count;
    fibres.moveTo(inset, v); fibres.lineTo(end, v); // along the fibres of the top tape ply
  }
  return { physical: build(false), twin: build(true), fibres, pad, unit };
}

/** Solid frame and laminate; the digital twin uses the same geometry as a green ghost. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  f: Frame,
  p: Palette,
  opts: { twin?: boolean; sheet?: boolean; fibres?: boolean; grippers?: boolean; gripperColor?: (i: number) => string } = {},
) {
  const { twin = false, sheet = true, fibres = true, grippers = true } = opts;
  const { look } = f, style = twin ? look.twin : look.physical;
  ctx.drawImage(style.canvas, f.x - look.pad, f.y - look.pad, f.s + 2 * look.pad, f.s + 2 * look.pad);
  if (sheet) {
    ctx.save(); ctx.translate(f.x, f.y);
    const inset = f.s * 0.16, size = f.s * 0.68;
    if (!twin) {
      ctx.fillStyle = 'rgba(26,47,45,0.20)';
      ctx.fillRect(inset + 3.3 * look.unit, inset + 4.3 * look.unit, size, size);
    }
    ctx.drawImage(style.laminate, inset, inset, size, size);
    ctx.strokeStyle = twin ? 'rgba(0,115,95,0.6)' : '#83978f'; ctx.lineWidth = look.unit; ctx.strokeRect(inset, inset, size, size);
    if (!twin) {
      ctx.strokeStyle = '#647f77'; ctx.lineWidth = 2.6 * look.unit;
      ctx.beginPath(); ctx.moveTo(inset, inset + size); ctx.lineTo(inset + size, inset + size); ctx.lineTo(inset + size, inset); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.7 * look.unit;
      ctx.beginPath(); ctx.moveTo(inset, inset + size); ctx.lineTo(inset, inset); ctx.lineTo(inset + size, inset); ctx.stroke();
    }
    if (fibres) {
      ctx.strokeStyle = twin ? 'rgba(0,150,130,0.15)' : 'rgba(44,77,68,0.12)';
      ctx.lineWidth = 0.6 * look.unit; ctx.stroke(look.fibres);
    }
    ctx.restore();
  }
  if (grippers) f.grippers.forEach((g, i) => {
    frameGripper(ctx, g.x, g.y, f.s * 0.1, g.rot, opts.gripperColor?.(i) ?? (twin ? p.accent : p.ink2));
  });
}
