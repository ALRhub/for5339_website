// M2: a graph network simulator of the forming process. The sheet in its
// gripper frame is a mesh; information from the grippers spreads over it by
// message passing, round by round, and the network then predicts how the
// sheet draws in. Repeating this gives a fast rollout of the process.
import { clamp, easeInOut, label, lerp, mix, register, rng } from './engine';
import { drawFrame, frame, frameGripper, type Frame } from './scene';
import { colourField, colourBar, INFORMATION, layer, ramp, softDot, dot } from './materials';

const ROUNDS = 3;
const ROUND_T = 0.75;
const PREDICT_T = 1.0;
const STEPS = 4;
const STEP_T = ROUNDS * ROUND_T + PREDICT_T;
const HOLD = 1.2;
const CYCLE = STEPS * STEP_T + HOLD;

type Node = { u: number; v: number; hop: number };
type S = { f: Frame; nodes: Node[]; edges: [number, number][]; held: number[]; boundary: number[]; field: HTMLCanvasElement; material: CanvasGradient; legend: CanvasGradient; halo: HTMLCanvasElement; unit: number };

// draw-in towards the cavity: edges move inwards, most in their middle
function displace(u: number, v: number, k: number) {
  return {
    du: -(u - 0.5) * 0.16 * (1 - (2 * v - 1) ** 2) * k,
    dv: -(v - 0.5) * 0.16 * (1 - (2 * u - 1) ** 2) * k,
  };
}

register<S>('m2', {
  still: STEP_T + ROUNDS * ROUND_T * 0.8,
  setup(w, h) {
    const cols = w < 400 ? 8 : 12, rows = cols;
    const size = Math.min(h - 56, w * 0.56);
    const f = frame((w - size) / 2, 14 + (h - 56 - size) / 2, size);
    const r = rng(11);
    const nodes: Node[] = [];
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const edge = i === 0 || j === 0 || i === cols - 1 || j === rows - 1;
        const jit = edge ? 0 : 0.3;
        nodes.push({ u: (i + (r() - 0.5) * jit) / (cols - 1), v: (j + (r() - 0.5) * jit) / (rows - 1), hop: Infinity });
      }
    const id = (i: number, j: number) => j * cols + i;
    const edges: [number, number][] = [];
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        if (i < cols - 1) edges.push([id(i, j), id(i + 1, j)]);
        if (j < rows - 1) edges.push([id(i, j), id(i, j + 1)]);
        if (i < cols - 1 && j < rows - 1) edges.push((i + j) % 2 ? [id(i, j), id(i + 1, j + 1)] : [id(i + 1, j), id(i, j + 1)]);
      }
    // the mesh nodes each gripper holds are where information enters
    const sh = f.sheet;
    const held = f.grippers.map((g) => {
      let best = 0;
      let bd = Infinity;
      nodes.forEach((n, k) => {
        const d = (sh.x + n.u * sh.w - g.x) ** 2 + (sh.y + n.v * sh.h - g.y) ** 2;
        if (d < bd) ((bd = d), (best = k));
      });
      return best;
    });
    const adj: number[][] = nodes.map(() => []);
    edges.forEach(([a, b]) => (adj[a].push(b), adj[b].push(a)));
    let frontier = [...new Set(held)];
    frontier.forEach((k) => (nodes[k].hop = 0));
    for (let d = 1; frontier.length; d++) {
      const next: number[] = [];
      for (const a of frontier) for (const b of adj[a]) if (nodes[b].hop === Infinity) ((nodes[b].hop = d), next.push(b));
      frontier = next;
    }
    const boundary: number[] = [];
    for (let i = 0; i < cols; i++) boundary.push(id(i, 0));
    for (let j = 1; j < rows; j++) boundary.push(id(cols - 1, j));
    for (let i = cols - 2; i >= 0; i--) boundary.push(id(i, rows - 1));
    for (let j = rows - 2; j > 0; j--) boundary.push(id(0, j));
    const field = colourField(INFORMATION);
    field.update((u, v) => { const d = displace(u, v, 1); return clamp(Math.hypot(d.du, d.dv) / 0.08); });
    const { ctx } = layer(1, 1);
    return { f, nodes, edges, held, boundary, field: field.canvas, halo: softDot(), unit: clamp(size / 440, 0.35, 1.15),
      material: ramp(ctx, sh.x, sh.y, sh.x + sh.w * 0.7, sh.y + sh.h, ['#f8faf9', '#d2dfdc', '#a7b9b4']),
      legend: ramp(ctx, f.x + f.s + 25, 0, f.x + f.s + 125, 0, INFORMATION) };
  },

  draw(ctx, w, h, t, s, p) {
    const u = ((t % CYCLE) + CYCLE) % CYCLE;
    const step = Math.min(Math.floor(u / STEP_T), STEPS - 1);
    const within = u - step * STEP_T;
    const inHold = u >= STEPS * STEP_T;
    const passing = !inHold && within < ROUNDS * ROUND_T;
    const round = passing ? within / ROUND_T : ROUNDS;
    const predict = inHold ? 1 : passing ? 0 : easeInOut((within - ROUNDS * ROUND_T) / PREDICT_T);
    const k = (inHold ? STEPS : step + predict) / STEPS;
    // fade out after the rollout and fade the flat sheet back in, so the loop never jumps
    const fade = inHold ? 1 - clamp((u - STEPS * STEP_T - HOLD + 0.5) / 0.5) : clamp(u / 0.4);
    const { f } = s;
    const sh = f.sheet;

    drawFrame(ctx, f, p, { sheet: false, grippers: false });

    const pos = s.nodes.map((n) => {
      const d = displace(n.u, n.v, k);
      return [sh.x + (n.u + d.du) * sh.w, sh.y + (n.v + d.dv) * sh.h] as const;
    });
    // what the nodes know: it spreads one hop per round, and what the previous step spread
    // fades while the next step's messages go out
    const carry = step > 0 && !inHold ? 1 - clamp(within / 0.5) : 0;
    const informed = (n: Node) => Math.max(clamp(round - n.hop + 1), carry * clamp(ROUNDS - n.hop + 1));
    // messages and their edges fade in and out within a round, so rounds never switch abruptly
    const env = clamp(Math.min(round % 1, 1 - (round % 1)) / 0.2);

    const boundary = new Path2D();
    s.boundary.forEach((i, j) => boundary[j ? 'lineTo' : 'moveTo'](pos[i][0], pos[i][1])); boundary.closePath();
    ctx.save(); ctx.globalAlpha = fade;
    ctx.shadowColor = 'rgba(30,48,48,0.15)'; ctx.shadowBlur = 5 * s.unit; ctx.shadowOffsetY = 2 * s.unit;
    ctx.fillStyle = s.material; ctx.fill(boundary); ctx.restore();
    ctx.save(); ctx.clip(boundary); ctx.globalAlpha = fade * 0.65;
    ctx.drawImage(f.look.physical.laminate, sh.x, sh.y, sh.w, sh.h); ctx.restore();
    ctx.globalAlpha = fade;
    ctx.save(); ctx.clip(boundary); ctx.globalAlpha = fade * k * 0.9;
    ctx.drawImage(s.field, sh.x, sh.y, sh.w, sh.h); ctx.restore();
    ctx.strokeStyle = '#83978f'; ctx.lineWidth = s.unit; ctx.stroke(boundary);
    const mesh = new Path2D(), activeEdges = new Path2D();
    const messages: [number, number][] = [];
    for (const [a, b] of s.edges) {
      const na = s.nodes[a], nb = s.nodes[b], lo = Math.min(na.hop, nb.hop);
      const active = passing && Math.abs(na.hop - nb.hop) === 1 && round > lo && round < lo + 1;
      mesh.moveTo(pos[a][0], pos[a][1]); mesh.lineTo(pos[b][0], pos[b][1]);
      if (active) {
        activeEdges.moveTo(pos[a][0], pos[a][1]); activeEdges.lineTo(pos[b][0], pos[b][1]);
        const from = na.hop < nb.hop ? pos[a] : pos[b], to = na.hop < nb.hop ? pos[b] : pos[a];
        messages.push([lerp(from[0], to[0], round - lo), lerp(from[1], to[1], round - lo)]);
      }
    }
    ctx.strokeStyle = 'rgba(79,85,91,0.28)'; ctx.lineWidth = 0.8 * s.unit; ctx.stroke(mesh);
    ctx.globalAlpha = fade * env;
    ctx.strokeStyle = 'rgba(0,150,130,0.7)'; ctx.lineWidth = 1.1 * s.unit; ctx.stroke(activeEdges);
    for (const [x, y] of messages) dot(ctx, s.halo, x, y, 1.8 * s.unit, p.accent);
    ctx.globalAlpha = fade;
    s.nodes.forEach((n, i) => {
      const a = informed(n);
      ctx.beginPath();
      ctx.arc(pos[i][0], pos[i][1], (n.hop === 0 ? 3.4 : 1.8) * s.unit, 0, Math.PI * 2);
      ctx.fillStyle = n.hop === 0 ? p.ink : mix('#ffffff', '#009682', a);
      ctx.fill();
      ctx.strokeStyle = n.hop === 0 ? p.ink : mix('#b6bcc1', '#00735f', a);
      ctx.lineWidth = 0.7 * s.unit;
      ctx.stroke();
    });
    // grippers follow the nodes they hold
    f.grippers.forEach((g, i) => {
      const n = s.nodes[s.held[i]];
      const d = displace(n.u, n.v, k);
      frameGripper(ctx, g.x + d.du * sh.w, g.y + d.dv * sh.h, f.s * 0.1, g.rot, p.ink2);
    });
    ctx.globalAlpha = 1;

    if (w > 800) colourBar(ctx, s.legend, f.x + f.s + 25, f.y + f.s * 0.5, 100, 'Predicted draw-in', p);
    const text = inHold
      ? `Rollout of ${STEPS} predicted forming steps`
      : passing
        ? `Step ${step + 1}: messages from the grippers, round ${Math.min(ROUNDS, Math.floor(round) + 1)} of ${ROUNDS}`
        : `Step ${step + 1}: predict how the sheet draws in`;
    label(ctx, text, w / 2, h - 14, p, { align: 'center', size: 12, color: p.ink2 });
  },
});
