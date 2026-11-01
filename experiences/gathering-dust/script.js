/**
 * Thousands of dust particles drift in and settle into "404". Moving the
 * pointer through them stirs them gently; shaking it (or a fast flick) blows
 * them apart, and they drift back and settle again.
 *
 * With reduced motion, the dust is drawn once, already settled.
 */

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Safari (and every browser on iOS) can run module scripts before the
// stylesheet applies. The code below reads colors and sizes from CSS, so wait.
while (!getComputedStyle(document.documentElement).getPropertyValue('--dust').trim()) {
  await new Promise(requestAnimationFrame);
}

const DUST = getComputedStyle(document.documentElement).getPropertyValue('--dust').trim();
const BG = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
const MAX_PARTICLES = 2400;
const STIR_RADIUS = 90;
/** How long it takes the pull towards "404" to reach full strength. */
const SETTLE_RAMP_MS = 2500;
/** How long scattered dust flies free before it starts drifting back. */
const SCATTER_MS = 2000;
/** Pointer movement within this window decides whether it was a shake. */
const SHAKE_WINDOW_MS = 400;
const SHAKE_COOLDOWN_MS = 900;

let width = 0;
let height = 0;
let particles = [];
let frame = 0;
let settleStart = performance.now();
let scatter = null; // { x, y } where a shake happened, until the next frame
let lastScatter = -Infinity;
const pointer = { x: -1e4, y: -1e4 };
const moves = []; // recent pointer positions: { x, y, t }

/** Points inside the glyphs of "404", sampled from an offscreen render. */
function samplePoints() {
  const off = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement('canvas'), { width, height });
  const g = off.getContext('2d');
  const font = (px) => `800 ${px}px ui-monospace, Menlo, Consolas, monospace`;

  // Size the drawn digits themselves (not the font's line box, which differs
  // between fonts): up to 70% of the width and 36% of the height, and small
  // enough on short screens to stay centred without touching the caption.
  g.font = font(100);
  const ref = g.measureText('404');
  const refWidth = ref.actualBoundingBoxLeft + ref.actualBoundingBoxRight;
  const refHeight = ref.actualBoundingBoxAscent + ref.actualBoundingBoxDescent;
  const caption = document.querySelector('main').offsetHeight;
  const maxHeight = Math.max(48, Math.min(height * 0.36, height - 2 * (caption + 16)));
  const size = 100 * Math.min((width * 0.7) / refWidth, maxHeight / refHeight);

  // Centre the ink box of the digits in the viewport.
  g.font = font(size);
  const m = g.measureText('404');
  const inkWidth = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  const inkHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  g.fillText('404', (width - inkWidth) / 2 + m.actualBoundingBoxLeft, (height - inkHeight) / 2 + m.actualBoundingBoxAscent);

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

/**
 * True when the pointer was shaken or flicked: it covered a lot of ground in
 * the last moment, or changed direction several times while moving fast.
 * Distances are relative to the screen so it feels the same on any size.
 */
function isShake(now) {
  while (moves.length && now - moves[0].t > SHAKE_WINDOW_MS) moves.shift();
  let distance = 0;
  let turns = 0;
  for (let i = 1; i < moves.length; i++) {
    const dx = moves[i].x - moves[i - 1].x;
    const dy = moves[i].y - moves[i - 1].y;
    distance += Math.hypot(dx, dy);
    if (i > 1) {
      const pdx = moves[i - 1].x - moves[i - 2].x;
      const pdy = moves[i - 1].y - moves[i - 2].y;
      if (dx * pdx + dy * pdy < 0) turns += 1; // moving back the way it came
    }
  }
  const scale = Math.min(width, height);
  return distance > scale * 1.2 || (distance > scale * 0.6 && turns >= 2);
}

function step(now) {
  const scattering = now - lastScatter < SCATTER_MS;
  const pull = scattering ? 0 : Math.min(1, (now - settleStart) / SETTLE_RAMP_MS) * 0.012;

  for (const p of particles) {
    if (scatter) {
      // Blown apart: mostly away from the pointer, with plenty of randomness.
      const angle = Math.atan2(p.y - scatter.y, p.x - scatter.x) + (Math.random() - 0.5) * 2.4;
      const speed = 8 + Math.random() * 20;
      p.vx += Math.cos(angle) * speed;
      p.vy += Math.sin(angle) * speed;
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
  scatter = null;
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
    settleStart = performance.now();
    lastScatter = -Infinity;
    frame = requestAnimationFrame(loop);
  }
}

addEventListener('pointermove', (event) => {
  Object.assign(pointer, { x: event.clientX, y: event.clientY });
  if (reducedMotion.matches) return;

  const now = performance.now();
  moves.push({ x: event.clientX, y: event.clientY, t: now });
  if (now - lastScatter > SHAKE_COOLDOWN_MS && isShake(now)) {
    scatter = { x: event.clientX, y: event.clientY };
    lastScatter = now;
    settleStart = now + SCATTER_MS;
    moves.length = 0;
  }
});
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
