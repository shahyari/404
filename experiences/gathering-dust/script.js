/**
 * Thousands of dust particles settle into "404", hold for a while, then a gust
 * scatters them and they drift back. Moving the pointer stirs them up.
 *
 * With reduced motion, the dust is drawn once, already settled.
 */

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const DUST = getComputedStyle(document.documentElement).getPropertyValue('--dust').trim();
const BG = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
const MAX_PARTICLES = 2400;
const SETTLE_MS = 7000;
const GUST_MS = 1600;
const STIR_RADIUS = 90;

let width = 0;
let height = 0;
let particles = [];
let frame = 0;
let cycleStart = performance.now();
let lastGust = -1;
const pointer = { x: -1e4, y: -1e4 };

/** Points inside the glyphs of "404", sampled from an offscreen render. */
function samplePoints() {
  const off = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement('canvas'), { width, height });
  const g = off.getContext('2d');
  const size = Math.min(width * 0.34, height * 0.5);
  g.font = `800 ${size}px ui-monospace, Menlo, Consolas, monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('404', width / 2, height * 0.44);

  const { data } = g.getImageData(0, 0, width, height);
  const points = [];
  const step = Math.max(2, Math.round(size / 70));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (data[(y * width + x) * 4 + 3] > 128) points.push([x, y]);
    }
  }
  // Thin out evenly if there are too many.
  const keep = Math.min(1, MAX_PARTICLES / points.length);
  return points.filter(() => Math.random() < keep);
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  width = innerWidth;
  height = innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const points = samplePoints();
  particles = points.map(([hx, hy], i) => {
    const p = particles[i] ?? {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: 0,
      vy: 0,
      phase: Math.random() * Math.PI * 2,
      size: 0.8 + Math.random() * 1.2,
    };
    return Object.assign(p, { hx, hy });
  });
  draw(1);
}

function step(now) {
  const cycle = Math.floor((now - cycleStart) / (SETTLE_MS + GUST_MS));
  const t = (now - cycleStart) % (SETTLE_MS + GUST_MS);
  const gusting = t > SETTLE_MS;
  // Start of a gust: one push to the right with some lift.
  const gustStarts = gusting && cycle !== lastGust;
  if (gustStarts) lastGust = cycle;
  const pull = gusting ? 0 : Math.min(1, t / 2500) * 0.012;

  for (const p of particles) {
    if (gustStarts) {
      p.vx += 6 + Math.random() * 18;
      p.vy += (Math.random() - 0.7) * 9;
    }
    // Spring towards home, a gentle wobble, and drag.
    p.vx += (p.hx - p.x) * pull + Math.sin(now / 900 + p.phase) * 0.03;
    p.vy += (p.hy - p.y) * pull + Math.cos(now / 1100 + p.phase) * 0.03;

    const dx = p.x - pointer.x;
    const dy = p.y - pointer.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < STIR_RADIUS * STIR_RADIUS) {
      const force = (1 - Math.sqrt(d2) / STIR_RADIUS) * 1.2;
      const angle = Math.atan2(dy, dx);
      p.vx += Math.cos(angle) * force;
      p.vy += Math.sin(angle) * force;
    }

    p.vx *= 0.92;
    p.vy *= 0.92;
    p.x += p.vx;
    p.y += p.vy;

    // Dust blown off one edge drifts back in from the other.
    if (p.x > width + 20) p.x = -20;
    if (p.x < -20) p.x = width + 20;
  }
}

/** Fades the previous frame instead of clearing it, which leaves short trails. */
function draw(fade) {
  ctx.globalAlpha = fade;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = DUST;
  ctx.beginPath();
  for (const p of particles) ctx.rect(p.x, p.y, p.size, p.size);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function loop(now) {
  step(now);
  draw(0.35);
  frame = requestAnimationFrame(loop);
}

function start() {
  cancelAnimationFrame(frame);
  if (reducedMotion.matches) {
    for (const p of particles) Object.assign(p, { x: p.hx, y: p.hy, vx: 0, vy: 0 });
    draw(1);
  } else {
    cycleStart = performance.now();
    lastGust = -1;
    frame = requestAnimationFrame(loop);
  }
}

addEventListener('pointermove', (event) => Object.assign(pointer, { x: event.clientX, y: event.clientY }));
addEventListener('pointerleave', () => Object.assign(pointer, { x: -1e4, y: -1e4 }));
document.addEventListener('pointerout', (event) => {
  if (!event.relatedTarget) Object.assign(pointer, { x: -1e4, y: -1e4 });
});

let resizeTimer;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resize();
    if (reducedMotion.matches) start();
  }, 100);
});
reducedMotion.addEventListener('change', start);

resize();
start();
