// T1: the over-instrumented gripper frame streams force, position and angle
// data to its digital twin, which mirrors the physical process.
import { clamp, label, lerp, register } from './engine';
import { drawFrame, frame, type Frame } from './scene';
import { softDot, dot } from './materials';

type S = { phys: Frame; twin: Frame; halo: HTMLCanvasElement; unit: number };

register<S>('t1', {
  still: 1.3,
  setup(w, h) {
    const size = Math.min(h * 0.66, w * 0.3);
    const y = (h - size) / 2 - 6;
    return { phys: frame(w * 0.06, y, size), twin: frame(w * 0.94 - size, y, size), halo: softDot(), unit: clamp(size / 360, 0.35, 1.15) };
  },
  draw(ctx, _w, _h, t, s, p) {
    drawFrame(ctx, s.phys, p);
    drawFrame(ctx, s.twin, p, { twin: true });

    // sensors on the physical grippers pulse as they sample
    s.phys.grippers.forEach((g, i) => {
      const pulse = (Math.sin(t * 3 - i * 0.8) + 1) / 2;
      ctx.globalAlpha = 0.5 + 0.5 * pulse;
      dot(ctx, s.halo, g.x, g.y, (2.4 + pulse * 1.6) * s.unit, p.accent);
      ctx.globalAlpha = 1;
    });

    // three data streams between the process and its twin
    const x0 = s.phys.x + s.phys.s + 14 * s.unit;
    const x1 = s.twin.x - 14 * s.unit;
    ['Force', 'Position', 'Angle'].forEach((name, li) => {
      const y = s.phys.y + (0.3 + li * 0.2) * s.phys.s;
      ctx.strokeStyle = p.faint;
      ctx.lineWidth = s.unit;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.beginPath();
      for (let k = 0; k <= 80; k++) {
        const q = k / 80;
        const ph = q * 9 - t * 2.2 + li * 1.7;
        const amp = 7 * s.unit * Math.sin(Math.PI * q);
        const yy = y - amp * (0.6 * Math.sin(ph) + 0.4 * Math.sin(2.3 * ph + li));
        k ? ctx.lineTo(lerp(x0, x1, q), yy) : ctx.moveTo(lerp(x0, x1, q), yy);
      }
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 1.1 * s.unit;
      ctx.stroke();
      // data packets leave the frame and arrive at the twin: they fade in and out at the ends
      for (let j = 0; j < 3; j++) {
        const q = ((t * 0.32 + li * 0.18 + j / 3) % 1 + 1) % 1;
        const ph = q * 9 - t * 2.2 + li * 1.7;
        const yy = y - 7 * s.unit * Math.sin(Math.PI * q) * (0.6 * Math.sin(ph) + 0.4 * Math.sin(2.3 * ph + li));
        ctx.globalAlpha = clamp(Math.min(q, 1 - q) / 0.1);
        dot(ctx, s.halo, lerp(x0, x1, q), yy, 2.1 * s.unit, p.accent);
        ctx.globalAlpha = 1;
      }
      label(ctx, name, (x0 + x1) / 2, y - 12, p, { align: 'center', size: 11, color: p.ink2 });
    });

    label(ctx, 'Gripper frame with sensors', s.phys.x + s.phys.s / 2, s.phys.y + s.phys.s + 24, p, { align: 'center', size: 12, color: p.ink2 });
    label(ctx, 'Digital twin', s.twin.x + s.twin.s / 2, s.twin.y + s.twin.s + 24, p, { align: 'center', size: 12, color: p.ink2 });
  },
});
