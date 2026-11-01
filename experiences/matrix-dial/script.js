/**
 * Matrix Dial: a combination lock made of rows of symbols. A band of rows hides
 * "404", each row turned to a random position. The code's symbols look like all
 * the others: they only light up while their row lines up, or for a moment when
 * one of them changes. Drag rows
 * left and right (or use the arrow keys) to line the digits up. Every notch
 * ticks, and a row that lines up with the row above or below it ticks
 * differently. Where the 404 ends up doesn't matter: once every row lines up,
 * the lock opens and the way home appears.
 *
 * A hint is written into the bottom rows by switching some symbols on. It
 * scrambles away once a row is touched, and comes back after a minute idle.
 * The sound switch is written into the second row, top right. Code, hint and
 * switch share one typography; only their colors differ.
 */
import * as sound from './sound.js';

const root = document.documentElement;
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const home = document.querySelector('[data-home]');
const muteButton = document.querySelector('[data-mute]');
const announcer = document.querySelector('[data-announce]');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Safari (and every browser on iOS) can run module scripts before the
// stylesheet applies. The code below reads colors from CSS, so wait.
while (!getComputedStyle(root).getPropertyValue('--code').trim()) {
  await new Promise(requestAnimationFrame);
}

const css = (name) => getComputedStyle(root).getPropertyValue(name).trim();
const COLORS = {
  bg: css('--bg'), dim: css('--dim'), code: css('--code'),
  inPlace: css('--code-in-place'), solved: css('--solved'), selected: css('--selected'),
};
const FONT = css('--font');
const SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?/~\\§¶†‡¤±×÷«»¿¡°';

/** "404" on a 5 × 5 grid per digit, with a 2-column gap between digits. */
const DIGITS = {
  4: ['X..X.', 'X..X.', 'XXXXX', '...X.', '...X.'],
  0: ['.XXX.', 'X...X', 'X...X', 'X...X', '.XXX.'],
};
const BITMAP = DIGITS[4].map((_, y) => [DIGITS[4][y], DIGITS[0][y], DIGITS[4][y]].join('..'));

const FLICKER_MS = 120;
/** With reduced motion, symbols still change (the only glimpse of the code), just less often. */
const FLICKER_REDUCED_MS = 600;
/** How long a code symbol lights up when it changes. */
const CODE_GLIMPSE_MS = 250;
const HINT = 'Drag the rows left and right to crack the code.';
const HINT_IDLE_MS = 10_000;
/** Hint symbols switch on or off one by one over this long, each scrambling briefly. */
const HINT_STAGGER_MS = 400;
const HINT_SCRAMBLE_MS = 140;

const randomSymbol = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
const mod = (n, m) => ((n % m) + m) % m;

/* Layout and puzzle ------------------------------------------------------- */

let cell = { w: 0, h: 0 };
let cols = 0;
let rows = []; // every screen row: { chars, pattern, offset, band }
let band = []; // the rows that hide the 404, top to bottom
let bandTop = 0; // screen row where the band starts
let bandHeight = Math.random(); // where the band sits vertically, 0 (highest) to 1 (lowest)
/** Empty rows always kept above and below the 404. */
const BAND_MARGIN = 3;
let origin = { x: 0, y: 0 }; // top-left of the grid in CSS pixels
let selected = 0; // row highlighted for keyboard control
let solved = false;

const newRow = () => ({ chars: Array.from({ length: cols }, randomSymbol), pattern: null, offset: 0, band: -1 });

/** Builds the puzzle for the current number of columns: scrambled, or already open once solved. */
function newPuzzle(rowCount) {
  // Scale the bitmap so the 404 is big but fits: about square pixels, at most 85%
  // of the width and 45% of the height.
  const bitmapW = BITMAP[0].length;
  let scaleY = Math.max(1, Math.min(2, Math.floor((rowCount * 0.45) / BITMAP.length)));
  let scaleX = Math.round((scaleY * cell.h) / cell.w);
  const maxScaleX = Math.floor((cols * 0.85) / bitmapW);
  if (scaleX > maxScaleX) {
    scaleX = Math.max(1, maxScaleX);
    scaleY = Math.max(1, Math.min(scaleY, Math.round((scaleX * cell.w) / cell.h)));
  }

  const left = Math.floor((cols - bitmapW * scaleX) / 2);
  if (!solved) bandHeight = Math.random();
  band = [];
  for (let y = 0; y < BITMAP.length * scaleY; y++) {
    const row = newRow();
    row.pattern = new Uint8Array(cols);
    row.litUntil = new Float64Array(cols); // when each code symbol's glimpse ends
    const line = BITMAP[Math.floor(y / scaleY)];
    for (let x = 0; x < line.length * scaleX; x++) {
      if (line[Math.floor(x / scaleX)] === 'X') row.pattern[left + x] = 1;
    }
    // Turned somewhere random, at least 3 notches away from lining up with the row above.
    if (!solved) {
      const above = band.at(-1);
      do row.offset = Math.floor(Math.random() * cols);
      while (above && Math.min(mod(row.offset - above.offset, cols), mod(above.offset - row.offset, cols)) < 3);
    }
    row.band = band.length;
    band.push(row);
  }
}

/** Fits the grid to the window, keeping the puzzle if the number of columns hasn't changed. */
function layout() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const size = innerWidth < 600 ? 13 : 18;
  ctx.font = `600 ${size}px ${FONT}`;
  cell = { w: Math.ceil(ctx.measureText('M').width), h: Math.round(size * 1.25) };
  const newCols = Math.floor(innerWidth / cell.w);
  const rowCount = Math.floor(innerHeight / cell.h);

  if (newCols !== cols) {
    cols = newCols;
    newPuzzle(rowCount);
  }
  origin = { x: Math.floor((innerWidth - cols * cell.w) / 2), y: Math.floor((innerHeight - rowCount * cell.h) / 2) };

  // Filler rows above and below the band; the band sits in the middle.
  // At a random height, with at least BAND_MARGIN rows above and below (centred if there's no room).
  const room = rowCount - band.length - 2 * BAND_MARGIN;
  bandTop = room >= 0 ? BAND_MARGIN + Math.round(bandHeight * room) : Math.floor((rowCount - band.length) / 2);
  rows = Array.from({ length: rowCount }, (_, r) => band[r - bandTop] ?? newRow());
  selected = bandTop;
  placeHint(rowCount);

  // The way home appears just under the 404, or above it when the 404 sits too low.
  const buttonHeight = 56;
  const below = origin.y + (bandTop + band.length) * cell.h + cell.h;
  const fitsBelow = below + buttonHeight <= origin.y + (rowCount - 3) * cell.h;
  home.style.top = `${fitsBelow ? below : origin.y + bandTop * cell.h - cell.h - buttonHeight}px`;
  draw();
}

/* Turning rows ------------------------------------------------------------ */

/** Two rows line up when they're turned by the same amount, wherever that is. */
const linedUp = (a, b) => Boolean(a && b) && mod(a.offset - b.offset, cols) === 0;
/** A band row is in place when it lines up with the band row directly above or below it. */
const inPlace = (row) => row.band >= 0 && (linedUp(row, band[row.band - 1]) || linedUp(row, band[row.band + 1]));

/** Turns a screen row by `steps` notches, with a tick for each one. */
function turn(r, steps) {
  if (solved || !steps) return;
  interacted();
  const row = rows[r];
  const direction = Math.sign(steps);
  for (let i = 0; i < Math.abs(steps); i++) {
    row.offset += direction;
    if (inPlace(row)) sound.inPlace();
    else if (i < 4) sound.tick(); // a fast flick ticks a few times, not dozens
  }
  if (inPlace(row)) {
    const done = band.filter(inPlace).length;
    announce(`Row ${row.band + 1} of ${band.length} lines up. ${done} of ${band.length} rows lined up.`);
  }
  if (band.every((other) => linedUp(other, band[0]))) unlock();
  draw();
}

function unlock() {
  solved = true;
  setHint(false);
  sound.unlock();
  home.hidden = false;
  home.focus({ preventScroll: true });
  announce('Unlocked. The way home is open.');
}

let announceTimer;
function announce(text) {
  // Cleared first so repeating the same message is read again.
  announcer.textContent = '';
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { announcer.textContent = text; }, 50);
}

function firstInteraction() {
  sound.start();
  interacted();
}

const rowAt = (y) => Math.max(0, Math.min(rows.length - 1, Math.floor((y - origin.y) / cell.h)));

// Dragging: the row moves one whole symbol at a time, like the notches of a dial.
let drag = null;
canvas.addEventListener('pointerdown', (event) => {
  firstInteraction();
  canvas.setPointerCapture(event.pointerId);
  const r = rowAt(event.clientY);
  selected = r;
  drag = { r, x: event.clientX, startOffset: rows[r].offset };
  draw();
});
canvas.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const target = drag.startOffset + Math.round((event.clientX - drag.x) / cell.w);
  turn(drag.r, target - rows[drag.r].offset);
});
const endDrag = () => { drag = null; };
// Touch screens only allow audio to start on pointerup, not pointerdown.
canvas.addEventListener('pointerup', () => {
  sound.start();
  endDrag();
});
canvas.addEventListener('pointercancel', endDrag);

// Trackpads and mice with horizontal scrolling turn the row under the pointer.
let wheelRemainder = 0;
canvas.addEventListener('wheel', (event) => {
  const delta = event.deltaX || (event.shiftKey ? event.deltaY : 0);
  if (!delta) return;
  event.preventDefault();
  wheelRemainder += delta;
  const steps = Math.trunc(wheelRemainder / 30);
  if (!steps) return;
  wheelRemainder -= steps * 30;
  selected = rowAt(event.clientY);
  turn(selected, -steps);
}, { passive: false });

// Keyboard: up and down pick a row, left and right turn it.
canvas.addEventListener('keydown', (event) => {
  const moves = { ArrowUp: -1, ArrowDown: 1 };
  const turns = { ArrowLeft: -1, ArrowRight: 1 };
  if (!(event.key in moves) && !(event.key in turns)) return;
  event.preventDefault();
  firstInteraction();
  if (event.key in moves) {
    // Only the rows that hide the code: the others are just noise.
    const inBand = selected - bandTop;
    selected = bandTop + mod((inBand >= 0 && inBand < band.length ? inBand : -1) + moves[event.key], band.length);
    draw();
  } else {
    turn(selected, turns[event.key]);
  }
});
canvas.addEventListener('focus', draw);
canvas.addEventListener('blur', draw);

// The sound switch is drawn into the grid; a real, invisible button sits on top
// of those symbols so it can be clicked, focused and read by screen readers.
/** Two columns kept free to the right of the sound switch. */
const SOUND_RIGHT_MARGIN = 2;
const soundText = (muted) => (muted ? 'sound=off' : 'sound=on');
let soundLabel = { r: 1, start: 0, text: soundText(false) };
let muteHighlighted = false;

function placeMuteButton() {
  Object.assign(muteButton.style, {
    left: `${origin.x + soundLabel.start * cell.w}px`,
    top: `${origin.y + soundLabel.r * cell.h}px`,
    width: `${soundLabel.text.length * cell.w}px`,
    height: `${cell.h}px`,
  });
}

muteButton.addEventListener('click', () => {
  const muted = muteButton.getAttribute('aria-pressed') !== 'true';
  muteButton.setAttribute('aria-pressed', String(muted));
  muteButton.textContent = muted ? 'Sound off' : 'Sound on';
  soundLabel.text = soundText(muted);
  soundLabel.start = cols - SOUND_RIGHT_MARGIN - soundLabel.text.length;
  placeMuteButton();
  sound.setMuted(muted);
  draw();
});
for (const [type, on] of [['pointerenter', true], ['pointerleave', false], ['focus', true], ['blur', false]]) {
  muteButton.addEventListener(type, () => {
    muteHighlighted = on;
    draw();
  });
}

/* Hint -------------------------------------------------------------------- */

let hintLines = []; // [{ r, start, text, delays }]: where the hint is written on screen
let hintOn = true;
let hintChangedAt = -Infinity;
let lastInteraction = performance.now();
let hintFrame = 0;

/** Wraps the hint to the screen width and places it on the bottom rows; puts the sound switch top right. */
function placeHint(rowCount) {
  const width = cols - 4;
  const lines = [];
  for (const word of HINT.split(' ')) {
    const last = lines.at(-1);
    if (last && last.length + 1 + word.length <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  const firstRow = rowCount - 1 - lines.length;
  hintLines = lines.map((text, i) => ({
    r: firstRow + i,
    start: Math.floor((cols - text.length) / 2),
    text,
    delays: Array.from(text, () => Math.random() * HINT_STAGGER_MS),
  }));

  soundLabel.r = 1; // the second row from the top
  soundLabel.start = cols - SOUND_RIGHT_MARGIN - soundLabel.text.length;
  placeMuteButton();
}

/** Switches the hint's symbols on or off, one by one. */
function setHint(on) {
  if (hintOn === on) return;
  hintOn = on;
  hintChangedAt = reducedMotion.matches ? -Infinity : performance.now();
  for (const line of hintLines) line.delays = line.delays.map(() => Math.random() * HINT_STAGGER_MS);
  // Redraw every frame until the change has finished.
  cancelAnimationFrame(hintFrame);
  const animate = () => {
    draw();
    if (performance.now() - hintChangedAt < HINT_STAGGER_MS + HINT_SCRAMBLE_MS) hintFrame = requestAnimationFrame(animate);
  };
  animate();
}

function interacted() {
  lastInteraction = performance.now();
  setHint(false);
}

/**
 * What a hint cell shows right now: the hint letter ("on"), a scrambling
 * symbol mid-change, or nothing special ("off").
 */
function hintCell(line, i, now) {
  if (line.text[i] === ' ') return 'off'; // spaces show the row's own symbol, switched off
  const elapsed = now - hintChangedAt - line.delays[i];
  if (elapsed < 0) return hintOn ? 'off' : 'on';
  if (elapsed < HINT_SCRAMBLE_MS) return 'scramble';
  return hintOn ? 'on' : 'off';
}

/* Drawing ----------------------------------------------------------------- */

function draw() {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, innerWidth, innerHeight);
  ctx.textBaseline = 'middle';

  // Show which row the keyboard (or the last drag) controls.
  if (!solved && (document.activeElement === canvas || drag)) {
    ctx.fillStyle = COLORS.selected;
    ctx.fillRect(0, origin.y + selected * cell.h, innerWidth, cell.h);
  }

  const now = performance.now();
  rows.forEach((row, r) => {
    const y = origin.y + r * cell.h + cell.h / 2;
    const rowInPlace = inPlace(row);

    // Text written into this row: hint lines and the sound switch. Cells that are
    // switched on (or scrambling) are drawn by the text, not the row.
    const overlays = [
      ...hintLines.filter((l) => l.r === r).map((l) => ({ ...l, state: (i) => hintCell(l, i, now) })),
      ...(soundLabel.r === r ? [{ ...soundLabel, state: () => 'on', lit: muteHighlighted }] : []),
    ];
    const hintState = (c) => {
      const o = overlays.find((t) => c >= t.start && c < t.start + t.text.length);
      return o ? o.state(c - o.start) : 'off';
    };

    // The code's symbols are switched off like the rest, and only light up when the
    // row lines up, the lock is open, or for a moment as one of them changes.
    const lit = (i) => Boolean(row.pattern?.[i]) && (solved || rowInPlace || row.litUntil[i] > now);

    // Two passes per row: the dim symbols, then the lit code on top.
    for (const codePass of [false, true]) {
      if (codePass && !row.pattern) break;
      ctx.fillStyle = !codePass ? COLORS.dim : solved ? COLORS.solved : rowInPlace ? COLORS.inPlace : COLORS.code;
      for (let c = 0; c < cols; c++) {
        const i = mod(c - row.offset, cols);
        if (lit(i) !== codePass || hintState(c) !== 'off') continue;
        ctx.fillText(row.chars[i], origin.x + c * cell.w, y);
      }
    }

    // Switched-on text uses the same color as the code (brighter when the sound switch is hovered or focused).
    for (const o of overlays) {
      ctx.fillStyle = o.lit ? COLORS.inPlace : COLORS.code;
      for (let i = 0; i < o.text.length; i++) {
        const state = o.state(i);
        const char = state === 'scramble' ? randomSymbol() : state === 'on' ? o.text[i] : null;
        if (char) ctx.fillText(char, origin.x + (o.start + i) * cell.w, y);
      }
    }
  });
}

/**
 * Symbols change now and then, so the screen feels alive. A code symbol that
 * changes lights up for a moment: the only glimpse of where the code is.
 */
function flicker() {
  const now = performance.now();
  // After a minute without touching the lock, the hint comes back.
  if (!solved && !hintOn && now - lastInteraction > HINT_IDLE_MS) setHint(true);
  if (rows.length) {
    for (let n = 0; n < Math.ceil(rows.length * cols * 0.01); n++) {
      const row = rows[Math.floor(Math.random() * rows.length)];
      const i = Math.floor(Math.random() * cols);
      row.chars[i] = randomSymbol();
      if (row.pattern?.[i]) row.litUntil[i] = now + CODE_GLIMPSE_MS;
    }
    draw();
  }
  setTimeout(flicker, reducedMotion.matches ? FLICKER_REDUCED_MS : FLICKER_MS);
}

// Browsers ignore `autofocus` in cross-origin frames, so when the site hands
// focus to this frame, pass it on to the lock so the arrow keys work at once.
const focusLock = () => {
  if (document.activeElement === document.body) canvas.focus({ preventScroll: true });
};
addEventListener('focus', focusLock);

addEventListener('resize', layout);
layout();
flicker();
