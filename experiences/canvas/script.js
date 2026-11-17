/**
 * Canvas: a pencil sketch of a 404 to paint over. Brush, pattern brush, emoji
 * stickers and an eraser; pick colors from the hue bar; download the result.
 *
 * Every stroke and sticker is kept as an operation in artboard units, so the
 * painting redraws sharply at any size, undo just replays one less, and the
 * download is drawn again at double resolution.
 *
 * Layers, bottom to top: paper, paint and the sketch (both multiplied, so the
 * paper shows through the paint and pencil lines through both), stickers.
 */

import { drawPaper } from './paper.js';
import { drawSketch } from './sketch.js';

const root = document.documentElement;
const desk = document.querySelector('[data-desk]');
const board = document.querySelector('[data-board]');
const cursor = document.querySelector('[data-cursor]');
const canvases = {
  paper: board.querySelector('[data-layer="paper"]'),
  paint: board.querySelector('[data-layer="paint"]'),
  sketch: board.querySelector('[data-layer="sketch"]'),
  stickers: board.querySelector('[data-layer="stickers"]'),
};
const live = {
  paper: canvases.paper.getContext('2d'),
  paint: canvases.paint.getContext('2d'),
  sketch: canvases.sketch.getContext('2d'),
  stickers: canvases.stickers.getContext('2d'),
};
const toolButtons = [...document.querySelectorAll('[data-tool]')];
const sizeInput = document.querySelector('[data-size]');
const hueBar = document.querySelector('[data-hue]');
const hueThumb = document.querySelector('[data-hue-thumb]');
const patternOptions = document.querySelector('[data-options="pattern"]');
const stickerOptions = document.querySelector('[data-options="sticker"]');
const undoButton = document.querySelector('[data-undo]');
const clearButton = document.querySelector('[data-clear]');
const saveButton = document.querySelector('[data-save]');

// Safari (and every browser on iOS) can run module scripts before the
// stylesheet applies, and the layout below measures the page. Wait for it.
while (!getComputedStyle(root).getPropertyValue('--paper').trim()) {
  await new Promise(requestAnimationFrame);
}

/** The sheet, in artboard units: landscape, or portrait on tall screens. */
const ART = innerHeight > innerWidth * 1.1 ? { w: 800, h: 1100 } : { w: 1200, h: 800 };
const SEED = (Math.random() * 2 ** 32) >>> 0;
const PAPER = getComputedStyle(root).getPropertyValue('--paper').trim();
const EXPORT_SCALE = 2;

const PATTERNS = { stripes: 'Stripes', dots: 'Dots', checks: 'Checks', zigzag: 'Zigzag', hearts: 'Hearts' };
const STICKERS = {
  '⭐': 'Star', '❤️': 'Heart', '🌈': 'Rainbow', '✨': 'Sparkles', '👻': 'Ghost', '🛸': 'Flying saucer',
  '🚀': 'Rocket', '🔍': 'Magnifying glass', '🧭': 'Compass', '🐱': 'Cat', '🍕': 'Pizza', '🎈': 'Balloon',
};
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

const state = {
  tool: 'brush',
  hue: Math.floor(Math.random() * 360),
  size: Number(sizeInput.value),
  pattern: 'stripes',
  sticker: '⭐',
};

/** Everything painted so far, oldest first. */
const ops = [];
let stroke = null; // the operation being drawn right now
let scale = 1; // canvas pixels per artboard unit
let cssScale = 1; // CSS pixels per artboard unit

const color = (hue) => `hsl(${hue}, 85%, 58%)`;

/* Patterns -------------------------------------------------------------------- */

const TILE = 28; // pattern tile size, in artboard units
const tiles = new Map();

/** A tile of the pattern in one color, drawn at the canvas resolution. */
function patternTile(name, fill, s) {
  const key = `${name}|${fill}|${s}`;
  if (tiles.has(key)) return tiles.get(key);
  const tile = document.createElement('canvas');
  tile.width = tile.height = Math.max(2, Math.round(TILE * s));
  const t = tile.getContext('2d');
  t.scale(tile.width / TILE, tile.width / TILE);
  t.fillStyle = t.strokeStyle = fill;
  t.lineCap = 'round';
  t.lineJoin = 'round';
  if (name === 'stripes') {
    t.lineWidth = 6;
    t.lineCap = 'square';
    for (const k of [-TILE, 0, TILE]) {
      t.beginPath();
      t.moveTo(k, TILE);
      t.lineTo(k + TILE, 0);
      t.stroke();
    }
  } else if (name === 'dots') {
    for (const [x, y] of [[7, 7], [21, 21]]) {
      t.beginPath();
      t.arc(x, y, 4.5, 0, Math.PI * 2);
      t.fill();
    }
  } else if (name === 'checks') {
    t.fillRect(0, 0, TILE / 2, TILE / 2);
    t.fillRect(TILE / 2, TILE / 2, TILE / 2, TILE / 2);
  } else if (name === 'zigzag') {
    t.lineWidth = 3.5;
    for (const y of [10, 24]) {
      t.beginPath();
      t.moveTo(-7, y);
      for (let x = 0; x <= TILE + 7; x += 7) t.lineTo(x, x % 14 ? y - 6 : y);
      t.stroke();
    }
  } else if (name === 'hearts') {
    t.translate(TILE / 2, TILE / 2 + 1);
    t.beginPath();
    t.moveTo(0, 7);
    t.bezierCurveTo(-11, -1, -6, -10, 0, -4);
    t.bezierCurveTo(6, -10, 11, -1, 0, 7);
    t.fill();
  }
  tiles.set(key, tile);
  return tile;
}

/* Drawing operations ----------------------------------------------------------- */

const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** The curve piece that ends halfway past point i (needs point i + 1). */
const segment = (points, i) => [i === 1 ? points[0] : mid(points[i - 1], points[i]), points[i], mid(points[i], points[i + 1])];

/** The last piece of a finished stroke, up to its final point. */
function tail(points) {
  const n = points.length;
  const end = points[n - 1];
  return [n === 2 ? points[0] : mid(points[n - 2], end), end, end];
}

function strokeContexts(op, layers) {
  return op.tool === 'eraser' ? [layers.paint, layers.stickers] : [layers.paint];
}

function applyStyle(ctx, op, s) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = op.size * s;
  if (op.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = ctx.fillStyle = '#000';
    return;
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = ctx.fillStyle = op.tool === 'pattern'
    ? ctx.createPattern(patternTile(op.pattern, color(op.hue), s), 'repeat')
    : color(op.hue);
}

/** Paints the start of a stroke: a dot, so a single tap leaves a mark. */
function paintDot(op, layers, s) {
  const [x, y] = op.points[0];
  for (const ctx of strokeContexts(op, layers)) {
    ctx.save();
    applyStyle(ctx, op, s);
    ctx.beginPath();
    ctx.arc(x * s, y * s, (op.size * s) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function paintSegments(op, layers, s, segments) {
  if (!segments.length) return;
  for (const ctx of strokeContexts(op, layers)) {
    ctx.save();
    applyStyle(ctx, op, s);
    ctx.beginPath();
    for (const [a, c, b] of segments) {
      ctx.moveTo(a[0] * s, a[1] * s);
      ctx.quadraticCurveTo(c[0] * s, c[1] * s, b[0] * s, b[1] * s);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function paintSticker(op, ctx, s) {
  ctx.save();
  ctx.translate(op.x * s, op.y * s);
  ctx.rotate(op.angle);
  ctx.font = `${op.size * s}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(op.emoji, 0, 0);
  ctx.restore();
}

function clearLayers(layers) {
  for (const ctx of [layers.paint, layers.stickers]) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/** Draws every operation from scratch into the paint and sticker layers. */
function replay(layers, s) {
  clearLayers(layers);
  for (const op of ops) {
    if (op.type === 'clear') {
      clearLayers(layers);
    } else if (op.type === 'sticker') {
      paintSticker(op, layers.stickers, s);
    } else {
      paintDot(op, layers, s);
      const { points } = op;
      if (points.length < 2) continue;
      const pieces = [];
      for (let i = 1; i < points.length - 1; i++) pieces.push(segment(points, i));
      pieces.push(tail(points));
      paintSegments(op, layers, s, pieces);
    }
  }
}

/** True when something has been painted since the last clear. */
function painted() {
  for (let i = ops.length - 1; i >= 0; i--) {
    if (ops[i].type === 'clear') return false;
    return true;
  }
  return false;
}

function updateButtons() {
  undoButton.disabled = ops.length === 0;
  clearButton.disabled = !painted();
}

function commit(op) {
  ops.push(op);
  updateButtons();
}

/* Layout ----------------------------------------------------------------------- */

function fit() {
  const style = getComputedStyle(desk);
  const width = desk.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const height = desk.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const k = Math.max(0.05, Math.min(width / ART.w, height / ART.h));
  const cssWidth = Math.floor(ART.w * k);
  const cssHeight = Math.floor(ART.h * k);
  board.style.width = `${cssWidth}px`;
  board.style.height = `${cssHeight}px`;

  const dpr = Math.min(devicePixelRatio || 1, 2);
  for (const canvas of Object.values(canvases)) {
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
  }
  scale = canvases.paint.width / ART.w;
  cssScale = cssWidth / ART.w;

  drawPaper(live.paper, ART, scale, SEED, PAPER);
  drawSketch(live.sketch, ART, scale, SEED);
  replay(live, scale);
}

new ResizeObserver(fit).observe(desk);

/* Painting with the pointer ---------------------------------------------------- */

function toArt(event) {
  const rect = board.getBoundingClientRect();
  return [(event.clientX - rect.left) / cssScale, (event.clientY - rect.top) / cssScale];
}

board.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || stroke) return;
  const point = toArt(event);

  if (state.tool === 'sticker') {
    const op = {
      type: 'sticker',
      emoji: state.sticker,
      x: point[0],
      y: point[1],
      size: 24 + state.size * 2.4,
      angle: (Math.random() - 0.5) * 0.5,
    };
    paintSticker(op, live.stickers, scale);
    commit(op);
    return;
  }

  board.setPointerCapture(event.pointerId);
  stroke = { type: 'stroke', tool: state.tool, hue: state.hue, pattern: state.pattern, size: state.size, points: [point] };
  paintDot(stroke, live, scale);
});

board.addEventListener('pointermove', (event) => {
  moveCursor(event);
  if (!stroke) return;
  const events = event.getCoalescedEvents?.() ?? [event];
  for (const e of events.length ? events : [event]) {
    const point = toArt(e);
    const last = stroke.points[stroke.points.length - 1];
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 1.5) continue;
    stroke.points.push(point);
    const n = stroke.points.length;
    if (n >= 3) paintSegments(stroke, live, scale, [segment(stroke.points, n - 2)]);
  }
});

function endStroke() {
  if (!stroke) return;
  if (stroke.points.length >= 2) paintSegments(stroke, live, scale, [tail(stroke.points)]);
  commit(stroke);
  stroke = null;
}
board.addEventListener('pointerup', endStroke);
board.addEventListener('pointercancel', endStroke);

/* The cursor: a ring the size of the brush, or a preview of the sticker. */
function moveCursor(event) {
  if (event.pointerType === 'touch') return;
  const rect = board.getBoundingClientRect();
  const sticker = state.tool === 'sticker';
  const size = (sticker ? 24 + state.size * 2.4 : state.size) * cssScale;
  cursor.classList.add('visible');
  cursor.classList.toggle('sticker', sticker);
  cursor.textContent = sticker ? state.sticker : '';
  cursor.style.width = cursor.style.height = `${Math.max(size, 6)}px`;
  cursor.style.fontSize = `${size}px`;
  cursor.style.borderColor = state.tool === 'eraser' ? 'rgb(30 26 24 / 0.8)' : color(state.hue);
  cursor.style.transform = `translate(${event.clientX - rect.left - size / 2}px, ${event.clientY - rect.top - size / 2}px)`;
}
board.addEventListener('pointerleave', () => cursor.classList.remove('visible'));
board.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch') cursor.classList.remove('visible');
});

/* Toolbar ---------------------------------------------------------------------- */

function setTool(tool) {
  state.tool = tool;
  for (const button of toolButtons) button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
  patternOptions.hidden = tool !== 'pattern';
  stickerOptions.hidden = tool !== 'sticker';
  hueBar.classList.toggle('inactive', tool === 'eraser' || tool === 'sticker');
}
for (const button of toolButtons) button.addEventListener('click', () => setTool(button.dataset.tool));

/** Fills the size track up to the thumb. */
function showSize() {
  const { min, max, value } = sizeInput;
  sizeInput.style.setProperty('--fill', `${((value - min) / (max - min)) * 100}%`);
}
sizeInput.addEventListener('input', () => {
  state.size = Number(sizeInput.value);
  showSize();
});
showSize();

/* Pattern swatches, drawn in the current color. */
const patternButtons = Object.entries(PATTERNS).map(([name, label]) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', String(name === state.pattern));
  button.dataset.pattern = name;
  button.append(document.createElement('canvas'));
  button.addEventListener('click', () => {
    state.pattern = name;
    for (const other of patternButtons) other.setAttribute('aria-pressed', String(other === button));
  });
  patternOptions.append(button);
  return button;
});

function drawSwatches() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  for (const button of patternButtons) {
    const canvas = button.querySelector('canvas');
    canvas.width = canvas.height = Math.round(36 * dpr);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = ctx.createPattern(patternTile(button.dataset.pattern, color(state.hue), (dpr * 36) / 56), 'repeat');
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

const stickerButtons = Object.entries(STICKERS).map(([emoji, label]) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = emoji;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', String(emoji === state.sticker));
  button.addEventListener('click', () => {
    state.sticker = emoji;
    for (const other of stickerButtons) other.setAttribute('aria-pressed', String(other === button));
  });
  stickerOptions.append(button);
  return button;
});

/* The hue bar. */
const HUE_NAMES = [[15, 'red'], [40, 'orange'], [65, 'yellow'], [95, 'lime'], [150, 'green'], [185, 'teal'],
  [205, 'sky blue'], [250, 'blue'], [285, 'purple'], [330, 'pink'], [360, 'red']];

function setHue(hue) {
  state.hue = Math.round(Math.min(359, Math.max(0, hue)));
  hueThumb.style.left = `${(state.hue / 359) * 100}%`;
  hueThumb.style.background = color(state.hue);
  hueBar.setAttribute('aria-valuenow', String(state.hue));
  hueBar.setAttribute('aria-valuetext', HUE_NAMES.find(([limit]) => state.hue < limit)[1]);
  drawSwatches();
}

function hueFromPointer(event) {
  const rect = hueBar.getBoundingClientRect();
  setHue(((event.clientX - rect.left) / rect.width) * 359);
}
hueBar.addEventListener('pointerdown', (event) => {
  hueBar.setPointerCapture(event.pointerId);
  hueFromPointer(event);
});
hueBar.addEventListener('pointermove', (event) => {
  if (hueBar.hasPointerCapture(event.pointerId)) hueFromPointer(event);
});
hueBar.addEventListener('keydown', (event) => {
  const steps = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -30, PageUp: 30 };
  if (event.key in steps) setHue(state.hue + steps[event.key]);
  else if (event.key === 'Home') setHue(0);
  else if (event.key === 'End') setHue(359);
  else return;
  event.preventDefault();
});

/* Undo, clear, download. */
function undo() {
  if (stroke || !ops.length) return;
  ops.pop();
  replay(live, scale);
  updateButtons();
}
undoButton.addEventListener('click', undo);
addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    undo();
  }
});

clearButton.addEventListener('click', () => {
  commit({ type: 'clear' });
  replay(live, scale);
  updateButtons();
});

saveButton.addEventListener('click', () => {
  const s = EXPORT_SCALE;
  const layer = () => {
    const canvas = document.createElement('canvas');
    canvas.width = ART.w * s;
    canvas.height = ART.h * s;
    return canvas.getContext('2d');
  };
  const out = layer();
  const layers = { paint: layer(), sketch: layer(), stickers: layer() };
  drawPaper(out, ART, s, SEED, PAPER);
  drawSketch(layers.sketch, ART, s, SEED);
  replay(layers, s);

  out.globalCompositeOperation = 'multiply';
  out.drawImage(layers.paint.canvas, 0, 0);
  out.drawImage(layers.sketch.canvas, 0, 0);
  out.globalCompositeOperation = 'source-over';
  out.drawImage(layers.stickers.canvas, 0, 0);

  out.canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'my-404.png';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, 'image/png');
});

setTool(state.tool);
setHue(state.hue);
updateButtons();
fit();
