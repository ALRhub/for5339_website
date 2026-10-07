// Small engine for the animated concept illustrations.
//
// Each <figure class="illo" data-illo="name" data-mode="auto|hover"> holds a
// <canvas>. The engine sizes the canvas for the device pixel ratio, runs the
// drawer only while it is visible (auto) or hovered (hover), freezes it when
// paused, and renders a single static frame when reduced motion is requested.

export interface Palette {
  ink: string;
  ink2: string;
  ink3: string;
  grey: string;
  faint: string;
  line: string;
  bg: string;
  bg2: string;
  accent: string;
  link: string;
  alert: string;
  font: string;
}

export interface Drawer<S = unknown> {
  /** Called on mount and on every resize, with the CSS pixel size. */
  setup(w: number, h: number): S;
  /** Draw the frame at time t (seconds). The context is already scaled to CSS pixels. */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, s: S, p: Palette): void;
  /** Time of the frame shown when motion is off or before the first play. */
  still: number;
}

const registry = new Map<string, Drawer<any>>();

export function register<S>(name: string, drawer: Drawer<S>) {
  registry.set(name, drawer);
}

function palette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    ink: v('--ink', '#141414'),
    ink2: v('--ink-2', '#4f555b'),
    ink3: v('--ink-3', '#686e74'),
    grey: '#a3a9af',
    faint: '#d9dde1',
    line: v('--line', '#e4e6e9'),
    bg: v('--bg', '#ffffff'),
    bg2: v('--bg-2', '#f5f6f7'),
    accent: v('--accent', '#009682'),
    link: v('--link', '#00735f'),
    alert: v('--alert', '#e4572e'),
    font: "'IBM Plex Sans Variable', 'IBM Plex Sans', system-ui, sans-serif",
  };
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function mountOne(fig: HTMLElement, pal: Palette) {
  const drawer = registry.get(fig.dataset.illo ?? '');
  const canvas = fig.querySelector('canvas');
  if (!drawer || !canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const mode = fig.dataset.mode === 'hover' ? 'hover' : 'auto';
  const toggle = fig.querySelector<HTMLButtonElement>('.illo-toggle');
  let w = 0;
  let h = 0;
  let state: unknown;
  let t = drawer.still;
  let playing = false;
  let visible = false;
  let hovered = false;
  let userPaused = reduceMotion();
  let last = 0;
  let raf = 0;

  const render = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dpr = canvas.width / Math.max(w, 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawer.draw(ctx, w, h, t, state, pal);
  };

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = r.width;
    h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    state = drawer.setup(w, h);
    render();
  };

  const frame = (now: number) => {
    if (!playing) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    t += dt;
    render();
    raf = requestAnimationFrame(frame);
  };

  const update = () => {
    const should = !userPaused && (mode === 'auto' ? visible : hovered);
    if (should && !playing) {
      playing = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!should && playing) {
      playing = false;
      cancelAnimationFrame(raf);
    }
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(!userPaused));
      toggle.setAttribute('aria-label', userPaused ? 'Play animation' : 'Pause animation');
      toggle.dataset.state = userPaused ? 'paused' : 'playing';
    }
  };

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(
    (entries) => {
      visible = entries.some((e) => e.isIntersecting);
      update();
    },
    { threshold: 0.2 },
  ).observe(fig);

  if (mode === 'hover') {
    const host = fig.closest<HTMLElement>('[data-illo-host]') ?? fig;
    host.addEventListener('pointerenter', () => ((hovered = true), update()));
    host.addEventListener('pointerleave', () => ((hovered = false), update()));
    host.addEventListener('focusin', () => ((hovered = true), update()));
    host.addEventListener('focusout', () => ((hovered = false), update()));
  }

  toggle?.addEventListener('click', () => {
    userPaused = !userPaused;
    update();
  });

  resize();
  update();
}

export function mount() {
  const run = () => {
    const pal = palette();
    document.querySelectorAll<HTMLElement>('figure.illo[data-illo]').forEach((fig) => {
      if (fig.dataset.mounted) return;
      fig.dataset.mounted = '1';
      mountOne(fig, pal);
    });
  };
  // Canvas text needs the web font; draw once it is ready.
  if (document.fonts?.ready) document.fonts.ready.then(run);
  else run();
}

// ---------------------------------------------------------------------------
// Shared helpers for drawers
// ---------------------------------------------------------------------------

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (x: number) => {
  const u = clamp(x);
  return u * u * (3 - 2 * u);
};
export const easeInOut = (x: number) => {
  const u = clamp(x);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
};

/** Deterministic pseudo-random numbers (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mix two #rrggbb colours. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const c = (s: number) => Math.round(lerp(ch(pa, s), ch(pb, s), clamp(t)));
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

/** Canvases narrower than this are drawn without explanatory labels (e.g. small tiles). */
export const COMPACT = 400;

export function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  p: Palette,
  opts: { size?: number; weight?: number; color?: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline; always?: boolean } = {},
) {
  if (!opts.always && ctx.canvas.clientWidth < COMPACT) return;
  ctx.font = `${opts.weight ?? 500} ${opts.size ?? 12}px ${p.font}`;
  ctx.fillStyle = opts.color ?? p.ink3;
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = opts.baseline ?? 'alphabetic';
  ctx.fillText(text, x, y);
}
