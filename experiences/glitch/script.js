/**
 * A corrupted 404 that glitches on its own every few seconds. Moving the
 * pointer (or a finger) fast makes it glitch harder. The pointer is also a
 * light: layers of colored shadows fall away from it, longer as it gets closer.
 * It also burns the screen: pixels under it randomly get stuck on red, green
 * or blue, until the next glitch repairs them.
 *
 * With reduced motion there are no glitches or burned pixels; the shadows
 * still follow the light.
 */

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const root = document.documentElement;

// Safari (and every browser on iOS) can run module scripts before the
// stylesheet applies. The code below reads colors and sizes from CSS, so wait.
while (!getComputedStyle(root).getPropertyValue('--fg').trim()) {
  await new Promise(requestAnimationFrame);
}
const stage = document.querySelector('.stage');
const word = stage.querySelector('.word');
const slices = [...stage.querySelectorAll('.slice')];
const caption = document.querySelector('[data-corrupt]');

const TEXT = '404';
const CAPTION = caption.textContent;
const SHADOW_LAYERS = 8;
const color = (name) => getComputedStyle(root).getPropertyValue(name).trim();
/** Shadow colors, nearest layer first. Mostly magenta and cyan, with some yellow and green. */
const SHADOW_COLORS = ['--magenta', '--cyan', '--yellow', '--magenta', '--cyan', '--green'].map(color);

/** Look-alike characters swapped in when the word is corrupted. */
const LOOKALIKES = { 4: ['Ч', 'A', '4', '$', 'ﾑ', '£'], 0: ['Ø', 'O', 'Θ', '#', '@', 'D'] };
const NOISE = '▓▒░█#%&@$*/\\<>_|';

/** Pointer speed (relative to screen size) where movement starts to glitch, and where it's at full strength. */
const SPEED_START = 1.5;
const SPEED_FULL = 5;
/** Glitch frames are stepped, not smooth: a new random frame every 800–1300 ms. */
const TICK_MS = [800, 1300];
/** Automatic bursts: how long they last and how far apart they are. */
const BURST_MS = [120, 420];
const BURST_GAP_MS = [1500, 5000];

const random = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Shadow layers: solid colors in their own group behind the word. They mix
// only where they overlap each other (see .shadows in style.css).
const shadowGroup = document.createElement('span');
shadowGroup.className = 'shadows';
stage.prepend(shadowGroup);
const shadows = [];
for (let i = 1; i <= SHADOW_LAYERS; i++) {
  const layer = document.createElement('span');
  layer.className = 'shadow';
  layer.textContent = TEXT;
  layer.style.color = SHADOW_COLORS[(i - 1) % SHADOW_COLORS.length];
  shadowGroup.prepend(layer);
  shadows[i - 1] = { el: layer, jitterX: 0, jitterY: 0 };
}

/* Light and shadows ------------------------------------------------------- */

const pointer = { x: null, y: null };
const light = { x: 0, y: 0 };
const step = { x: 0, y: 0 }; // shadow offset per layer
let centre = { x: 0, y: 0 };

const defaultLight = () => ({ x: innerWidth * 0.3, y: innerHeight * 0.2 });

function measure() {
  const rect = word.getBoundingClientRect();
  centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function updateLight(dt) {
  const target = pointer.x === null ? defaultLight() : pointer;
  const ease = 1 - Math.pow(0.85, dt / 16.7);
  light.x += (target.x - light.x) * ease;
  light.y += (target.y - light.y) * ease;

  // Shadows point away from the light. They tuck in close as the light nears
  // the word and fan out as it moves away, up to a maximum length.
  const dx = centre.x - light.x;
  const dy = centre.y - light.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const scale = Math.min(innerWidth, innerHeight) / 800;
  const length = clamp(distance * 0.12, 3 * scale, 75 * scale);
  step.x = (dx / distance) * (length / SHADOW_LAYERS);
  step.y = (dy / distance) * (length / SHADOW_LAYERS);

  shadows.forEach(({ el, jitterX, jitterY }, index) => {
    const n = index + 1;
    el.style.transform = `translate(${step.x * n + jitterX}px, ${step.y * n + jitterY}px)`;
  });
}

/* Glitches ---------------------------------------------------------------- */

const corruptWord = (amount) => [...TEXT]
  .map((char) => (Math.random() < amount ? pick(LOOKALIKES[char]) : char))
  .join('');

const corruptCaption = (amount) => [...CAPTION]
  .map((char) => (char !== ' ' && Math.random() < amount ? pick(NOISE) : char))
  .join('');

/** One random glitch frame. `intensity` is 0–1. */
function glitchFrame(intensity) {
  const em = parseFloat(getComputedStyle(stage).fontSize);
  stage.classList.add('glitching');

  // Torn horizontal strips of the word, pushed sideways in cyan and magenta.
  for (const slice of slices) {
    const top = random(0, 90);
    const height = random(2, 6 + 10 * intensity);
    slice.style.clipPath = `inset(${top}% 0 ${Math.max(0, 100 - top - height)}% 0)`;
    slice.style.transform = `translateX(${random(-1, 1) * em * (0.03 + 0.12 * intensity)}px)`;
    slice.textContent = Math.random() < 0.3 ? corruptWord(0.5) : TEXT;
  }

  // The word itself jolts, sometimes skews, and sometimes loses a character.
  const skew = Math.random() < 0.3 ? random(-8, 8) * intensity : 0;
  word.style.transform = `translate(${random(-1, 1) * em * 0.03 * intensity}px, ${random(-1, 1) * em * 0.01}px) skewX(${skew}deg)`;
  word.textContent = Math.random() < 0.15 + 0.35 * intensity ? corruptWord(0.25 + 0.3 * intensity) : TEXT;

  for (const shadow of shadows) {
    shadow.jitterX = Math.random() < 0.4 ? random(-1, 1) * em * 0.06 * intensity : 0;
    shadow.jitterY = Math.random() < 0.2 ? random(-1, 1) * em * 0.02 * intensity : 0;
  }

  caption.textContent = corruptCaption(0.1 + 0.4 * intensity);
  repairBurnedPixels();
}

function clearGlitch() {
  stage.classList.remove('glitching');
  word.style.transform = '';
  word.textContent = TEXT;
  caption.textContent = CAPTION;
  for (const shadow of shadows) shadow.jitterX = shadow.jitterY = 0;
}

/* Burned pixels --------------------------------------------------------- */

const canvas = document.querySelector('.pixels');
const ctx = canvas.getContext('2d');
/** Stuck pixels: one pure subpixel color, 1 CSS pixel square. */
const BURN_COLORS = ['#ff0000', '#00ff00', '#0000ff'];
/** Average pixels burned per second while the pointer is on the page. */
const BURNS_PER_SECOND = 6;
const MAX_BURNED = 2000;
const burned = new Map(); // "x,y" → { x, y, color }
let burning = null; // where the pointer is burning, or null when it isn't on the page
let canvasDirty = false;

function resizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  canvasDirty = true;
}

/** Now and then, burns the pixel under the pointer. */
function burnPixel(dt) {
  if (!burning || reducedMotion.matches) return;
  if (Math.random() >= (BURNS_PER_SECOND * dt) / 1000) return;
  const x = Math.floor(burning.x);
  const y = Math.floor(burning.y);
  const key = `${x},${y}`;
  burned.delete(key); // re-burning moves it to the newest end
  burned.set(key, { x, y, color: pick(BURN_COLORS) });
  if (burned.size > MAX_BURNED) burned.delete(burned.keys().next().value);
  canvasDirty = true;
}

/** A glitch resets the screen and repairs every burned pixel. */
function repairBurnedPixels() {
  if (!burned.size) return;
  burned.clear();
  canvasDirty = true;
}

function drawBurnedPixels() {
  if (!canvasDirty) return;
  canvasDirty = false;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (const { x, y, color } of burned.values()) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  }
}

/* Pointer speed ----------------------------------------------------------- */

let energy = 0; // recent pointer speed, relative to screen size
let lastMove = null;

addEventListener('pointermove', (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  burning = { x: event.clientX, y: event.clientY };
  const now = event.timeStamp;
  if (lastMove && now > lastMove.t) {
    const distance = Math.hypot(event.clientX - lastMove.x, event.clientY - lastMove.y);
    const speed = distance / (now - lastMove.t) / (Math.min(innerWidth, innerHeight) / 1000);
    energy = Math.max(energy, speed);
  }
  lastMove = { x: event.clientX, y: event.clientY, t: now };
});

// Mouse leaving the page: the light drifts back to its resting place.
document.addEventListener('pointerout', (event) => {
  if (!event.relatedTarget && event.pointerType === 'mouse') {
    pointer.x = pointer.y = null;
    lastMove = null;
    burning = null;
  }
});

// A finger only burns while it's touching the screen.
const stopTouchBurn = (event) => {
  if (event.pointerType !== 'mouse') burning = null;
};
addEventListener('pointerup', stopTouchBurn);
addEventListener('pointercancel', stopTouchBurn);

/* Loop -------------------------------------------------------------------- */

let previous = performance.now();
let nextTick = 0;
let burstEnd = 0;
let burstStrength = 0;
let nextBurst = previous + random(800, 2000);

function frame(now) {
  const dt = Math.min(100, now - previous);
  previous = now;
  energy *= Math.pow(0.5, dt / 180); // fades by half every 180 ms

  if (!reducedMotion.matches) {
    if (now >= nextBurst) {
      burstEnd = now + random(...BURST_MS);
      burstStrength = random(0.3, 1);
      nextBurst = burstEnd + random(...BURST_GAP_MS);
    }
    if (now >= nextTick) {
      nextTick = now + random(...TICK_MS);
      const fromMovement = clamp((energy - SPEED_START) / (SPEED_FULL - SPEED_START), 0, 1);
      const intensity = Math.max(now < burstEnd ? burstStrength : 0, fromMovement);
      if (intensity > 0 && Math.random() < 0.4 + 0.6 * intensity) glitchFrame(intensity);
      else clearGlitch();
    }
  }

  updateLight(dt);
  burnPixel(dt);
  drawBurnedPixels();
  requestAnimationFrame(frame);
}

reducedMotion.addEventListener('change', () => {
  clearGlitch();
  repairBurnedPixels();
});
addEventListener('resize', () => {
  measure();
  resizeCanvas();
});
document.fonts?.ready.then(measure);

measure();
resizeCanvas();
Object.assign(light, defaultLight());
requestAnimationFrame(frame);
