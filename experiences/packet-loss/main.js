/**
 * Packet Loss: route a lost packet through a maze to "200 OK" before its hop
 * limit runs out. Each level is bigger and leaves less room for wrong turns.
 *
 * Uses the shell's storage bridge for the best score, and the 404:navigate
 * message for the "Somewhere else" button (see docs/PERMISSIONS.md).
 */
import { DIRECTIONS, distances, generate, move } from './maze.js';
import { storage } from './storage.js';

const CELL = 10;
const SVG_NS = 'http://www.w3.org/2000/svg';
const KEYS = {
  ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left',
  w: 'up', d: 'right', s: 'down', a: 'left',
};

const $ = (selector) => document.querySelector(selector);
const board = $('[data-board]');
const overlay = $('[data-overlay]');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const game = {
  state: 'intro', // intro | playing | cleared | lost
  level: 1,
  hops: 0,
  best: 0,
  maze: null,
  position: 0,
  goal: 0,
  trail: [],
};

/* Levels ------------------------------------------------------------------ */

function startLevel(level) {
  const size = Math.min(5 + level, 15);
  const maze = generate(size, size);
  const dist = distances(maze, 0);
  // The exit is the cell farthest from the start.
  const goal = dist.indexOf(Math.max(...dist));
  // Spare hops shrink from 60% of the shortest route to 15%.
  const spare = Math.max(2, Math.round(dist[goal] * Math.max(0.15, 0.65 - level * 0.05)));

  Object.assign(game, {
    state: 'playing',
    level,
    hops: dist[goal] + spare,
    maze,
    position: 0,
    goal,
    trail: [0],
  });
  overlay.hidden = true;
  drawBoard();
  updateStats();
  announce(`Level ${level}. ${game.hops} hops to reach 200 OK.`);
}

function step(name) {
  if (game.state !== 'playing') return;

  const next = move(game.maze, game.position, DIRECTIONS[name]);
  if (next < 0) {
    // Walls are free to bump into. Only real hops count.
    board.classList.remove('bump');
    void board.getBoundingClientRect();
    board.classList.add('bump');
    return;
  }

  game.position = next;
  game.hops -= 1;
  game.trail.push(next);
  drawPacket();
  updateStats();

  if (next === game.goal) {
    game.state = 'cleared';
    announce(`200 OK. Level ${game.level} routed.`);
    setTimeout(() => startLevel(game.level + 1), reducedMotion.matches ? 0 : 600);
  } else if (game.hops === 0) {
    lose();
  }
}

function lose() {
  game.state = 'lost';
  const routed = game.level - 1;
  const record = routed > game.best;
  if (record) {
    game.best = routed;
    updateStats();
    storage.set('best', String(routed)).catch(() => {});
  }

  $('[data-overlay-title]').textContent = '404: Packet dropped';
  $('[data-overlay-text]').textContent = record
    ? `Out of hops on level ${game.level}. ${routed} routed, a new best.`
    : `Out of hops on level ${game.level}. You routed ${routed}. Best: ${game.best}.`;
  $('[data-start]').textContent = 'Try again';
  $('[data-elsewhere]').hidden = false;
  overlay.hidden = false;
  $('[data-start]').focus();
  announce($('[data-overlay-text]').textContent);
}

/* Drawing ----------------------------------------------------------------- */

const svg = (name, attributes = {}) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
};

const centre = (i) => [(i % game.maze.cols) * CELL + CELL / 2, Math.floor(i / game.maze.cols) * CELL + CELL / 2];

function drawBoard() {
  const { cols, rows, open } = game.maze;
  board.setAttribute('viewBox', `-1 -1 ${cols * CELL + 2} ${rows * CELL + 2}`);
  board.setAttribute('aria-label', `Maze, ${cols} by ${rows}. The packet starts top left.`);

  // One path for all walls: each cell draws its top and left side,
  // and the outer frame closes the right and bottom.
  let d = `M${cols * CELL} 0V${rows * CELL}H0`;
  for (let i = 0; i < open.length; i++) {
    const x = (i % cols) * CELL;
    const y = Math.floor(i / cols) * CELL;
    if (!(open[i] & DIRECTIONS.up.bit)) d += `M${x} ${y}h${CELL}`;
    if (!(open[i] & DIRECTIONS.left.bit)) d += `M${x} ${y}v${CELL}`;
  }

  const [gx, gy] = centre(game.goal);
  const goal = svg('g', { class: 'goal' });
  goal.append(
    svg('rect', { x: gx - 4, y: gy - 3, width: 8, height: 6, rx: 1 }),
    Object.assign(svg('text', { x: gx, y: gy + 0.2, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }), { textContent: '200' }),
  );

  board.replaceChildren(
    svg('path', { class: 'walls', d }),
    svg('polyline', { class: 'trail' }),
    goal,
    svg('rect', { class: 'packet', x: -2.5, y: -2.5, width: 5, height: 5, rx: 1 }),
  );
  drawPacket();
}

function drawPacket() {
  const [x, y] = centre(game.position);
  board.querySelector('.packet').style.transform = `translate(${x}px, ${y}px)`;
  board.querySelector('.trail').setAttribute('points', game.trail.map((i) => centre(i).join(',')).join(' '));
}

function updateStats() {
  $('[data-level]').textContent = game.level;
  $('[data-hops]').textContent = game.state === 'intro' ? '–' : game.hops;
  $('[data-best]').textContent = game.best;
  $('[data-hops-box]').classList.toggle('low', game.state === 'playing' && game.hops <= 5);
}

function announce(text) {
  $('[data-announce]').textContent = text;
}

/* Input ------------------------------------------------------------------- */

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const name = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
  if (!name || !overlay.hidden) return;
  event.preventDefault(); // keep arrow keys from scrolling
  step(name);
});

for (const button of document.querySelectorAll('[data-dir]')) {
  button.addEventListener('click', () => step(button.dataset.dir));
}

// Swipes on the board.
let swipe = null;
board.addEventListener('pointerdown', (event) => { swipe = { x: event.clientX, y: event.clientY }; });
board.addEventListener('pointerup', (event) => {
  if (!swipe) return;
  const dx = event.clientX - swipe.x;
  const dy = event.clientY - swipe.y;
  swipe = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  step(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
});

$('[data-start]').addEventListener('click', () => startLevel(1));

$('[data-elsewhere]').addEventListener('click', () => {
  if (window.parent !== window) {
    window.parent.postMessage({ type: '404:navigate', to: 'shuffle' }, '*');
  } else {
    location.assign('/explore/');
  }
});

// Browsers ignore `autofocus` in cross-origin frames, so when the shell hands
// focus to this frame, pass it on to the overlay's main button.
const focusOverlay = () => {
  if (!overlay.hidden && document.activeElement === document.body) $('[data-start]').focus();
};
addEventListener('focus', focusOverlay);
focusOverlay();

/* Start ------------------------------------------------------------------- */

game.maze = generate(6, 6);
game.goal = game.maze.cols * game.maze.rows - 1;
drawBoard();
updateStats();

storage.get('best')
  .then((value) => {
    game.best = Math.max(game.best, Number(value) || 0);
    updateStats();
  })
  .catch(() => { /* No saved score; start from 0. */ });
