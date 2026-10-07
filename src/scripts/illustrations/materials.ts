// Shared Canvas 2D materials. Callers cache static tool shapes during setup.
import { clamp, lerp, type Palette, label } from './engine';

export function layer(w: number, h: number, dpr = Math.min(window.devicePixelRatio || 1, 2)) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w * dpr));
  canvas.height = Math.max(1, Math.ceil(h * dpr));
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return { canvas, ctx };
}

export function ramp(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, colours: string[]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  colours.forEach((c, i) => g.addColorStop(i / (colours.length - 1), c));
  return g;
}

export function steel(ctx: CanvasRenderingContext2D, y: number, height: number) {
  const g = ctx.createLinearGradient(0, y, 0, y + height);
  g.addColorStop(0, '#f9fbfb'); g.addColorStop(0.09, '#e6ecee');
  g.addColorStop(0.31, '#b3c0c6'); g.addColorStop(0.48, '#edf2f3');
  g.addColorStop(0.72, '#bfccd1'); g.addColorStop(1, '#8d9fa7');
  return g;
}

export function tool(ctx: CanvasRenderingContext2D, path: Path2D, fill: CanvasGradient, unit = 1) {
  // A narrow underside and a lit lip give the tool body thickness in side view.
  ctx.save(); ctx.translate(2.8 * unit, 3.6 * unit);
  ctx.fillStyle = '#819198'; ctx.fill(path); ctx.restore();
  ctx.fillStyle = fill; ctx.fill(path);
  // Fine horizontal machining marks, clipped to the tool face.
  ctx.save(); ctx.clip(path);
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = Math.max(0.45, 0.6 * unit);
  ctx.beginPath();
  for (let y = 0; y < ctx.canvas.height / Math.min(window.devicePixelRatio || 1, 2); y += 9 * unit) { ctx.moveTo(0, y); ctx.lineTo(ctx.canvas.width / Math.min(window.devicePixelRatio || 1, 2), y); }
  ctx.stroke(); ctx.restore();
  ctx.save(); ctx.clip(path); ctx.translate(0, -3 * unit);
  ctx.strokeStyle = 'rgba(63,79,86,0.34)'; ctx.lineWidth = 5 * unit; ctx.stroke(path); ctx.restore();
  ctx.save(); ctx.clip(path); ctx.translate(0.8 * unit, 1.1 * unit);
  ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 2 * unit; ctx.stroke(path); ctx.restore();
  ctx.strokeStyle = '#7d898f'; ctx.lineWidth = Math.max(0.6, unit); ctx.stroke(path);
}

/** A small reusable radial field for sensor/data points or contact shadows. */
export function softDot(rgb = '0,150,130') {
  const { canvas, ctx } = layer(64, 64, 1);
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  g.addColorStop(0, `rgba(${rgb},0.34)`); g.addColorStop(0.3, `rgba(${rgb},0.17)`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return canvas;
}

export function dot(ctx: CanvasRenderingContext2D, halo: HTMLCanvasElement, x: number, y: number, radius: number, colour: string) {
  ctx.drawImage(halo, x - radius * 3, y - radius * 3, radius * 6, radius * 6);
  ctx.fillStyle = colour; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
}

export const INFORMATION = ['#f5f6f7', '#b9e3da', '#009682'];
export const STRAIN = ['#e9ecef', '#f4b183', '#e4572e', '#b3361a'];
// temperature, cool to hot, as in the heated sheet of the process line
export const HEAT = ['#8f969c', '#f2c14e', '#e4572e'];

/** Low-resolution colour field. Only this small texture ever uses ImageData. */
export function colourField(colours: string[], width = 64, height = 64) {
  const { canvas, ctx } = layer(width, height, 1);
  const data = ctx.createImageData(width, height);
  const rgb = colours.map(c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)));
  const update = (value: (u: number, v: number) => number) => {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const t = clamp(value(x / (width - 1), y / (height - 1))) * (rgb.length - 1);
      const i = Math.min(rgb.length - 2, Math.floor(t));
      const at = (y * width + x) * 4;
      for (let ch = 0; ch < 3; ch++) data.data[at + ch] = Math.round(lerp(rgb[i][ch], rgb[i + 1][ch], t - i));
      data.data[at + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
  };
  return { canvas, update };
}

export function colourBar(ctx: CanvasRenderingContext2D, field: CanvasGradient, x: number, y: number, w: number, title: string, p: Palette) {
  if (ctx.canvas.clientWidth < 400) return;
  ctx.fillStyle = field; ctx.fillRect(x, y, w, 6);
  ctx.strokeStyle = '#8a939b'; ctx.lineWidth = 0.6; ctx.strokeRect(x, y, w, 6);
  label(ctx, title, x, y - 7, p, { size: 11, color: p.ink2 });
  label(ctx, 'low', x, y + 20, p, { size: 10, color: p.ink2 });
  label(ctx, 'high', x + w, y + 20, p, { size: 10, align: 'right', color: p.ink2 });
}
