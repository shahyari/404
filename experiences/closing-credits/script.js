/**
 * Closing Credits: the 404 plays out like the end of a film. A title card,
 * the director's card, then the credits roll from the bottom of the screen to
 * the top and stop on a last card with the way home.
 *
 * Hold the pointer, Space or the down arrow to fast-forward the roll. With
 * reduced motion, nothing rolls: the credits fade in as a page to
 * scroll.
 *
 * The score (music.js) is synthesized and starts muted. "Sound" turns it on.
 */

import * as music from './music.js';

const root = document.documentElement;
const scenes = {
  title: document.querySelector('[data-scene="title"]'),
  director: document.querySelector('[data-scene="director"]'),
  roll: document.querySelector('[data-scene="roll"]'),
};
const roll = document.querySelector('[data-roll]');
const finale = document.querySelector('[data-finale]');
const replayButton = document.querySelector('[data-replay]');
const soundButton = document.querySelector('[data-sound]');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** Seconds the roll takes to travel one screen height. */
const SCREEN_SECONDS = 14;
const FAST_FORWARD = 8;

/* Timing --------------------------------------------------------------------- */

/**
 * Waits `ms` of visible time: frames stop in background tabs, so the film
 * pauses there instead of playing to an empty room.
 */
const sleep = (ms) => new Promise((resolve) => {
  let last = performance.now();
  const tick = (now) => {
    ms -= Math.min(now - last, 100);
    last = now;
    if (ms <= 0) resolve();
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

/** Each play gets a number; a newer play cancels the older one. */
let take = 0;
const cancelled = Symbol('cancelled');

function setPhase(phase) {
  root.dataset.phase = phase;
  music.setSection(phase);
}

function setScene(name, state) {
  if (state) scenes[name].dataset.state = state;
  else delete scenes[name].dataset.state;
}

/** Puts every scene back to black, without transitions. */
function reset() {
  root.classList.add('no-transition');
  for (const name of Object.keys(scenes)) setScene(name, null);
  scenes.roll.scrollTop = 0;
  rollY = innerHeight;
  rolling = false;
  roll.style.transform = '';
  void root.offsetWidth; // apply the reset before transitions come back
  root.classList.remove('no-transition');
}

async function play() {
  const current = ++take;
  const step = async (ms) => {
    await sleep(ms);
    if (current !== take) throw cancelled;
  };

  reset();
  setPhase('intro');
  try {
    await document.fonts.ready;
    await step(900);

    setScene('title', 'on');
    music.cue();
    await step(2800);
    setScene('title', 'gone');
    await step(1500);

    setScene('director', 'on');
    await step(4400);
    setScene('director', 'gone');
    await step(1400);

    setScene('roll', 'on');
    if (reducedMotion.matches) {
      setPhase('end');
    } else {
      setPhase('roll');
      startRoll();
    }
  } catch (error) {
    if (error !== cancelled) throw error;
  }
}

/* The roll ------------------------------------------------------------------- */

let rollY = innerHeight;
let rolling = false;
let fast = false;

/** How far the roll travels before the last card sits in the middle of the screen. */
const stopOffset = () => finale.offsetTop + finale.offsetHeight / 2 - innerHeight / 2;

function startRoll() {
  rollY = innerHeight;
  rolling = true;
  let last = performance.now();
  const frame = (now) => {
    if (!rolling) return;
    const seconds = Math.min(now - last, 100) / 1000;
    last = now;
    const speed = Math.max(innerHeight, 480) / SCREEN_SECONDS;
    rollY -= speed * seconds * (fast ? FAST_FORWARD : 1);
    const end = -stopOffset();
    if (rollY <= end) {
      rollY = end;
      rolling = false;
      setPhase('end');
    }
    roll.style.transform = `translateY(${rollY}px)`;
    if (rolling) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  if (root.dataset.phase === 'end' && !reducedMotion.matches) {
    rollY = -stopOffset();
    roll.style.transform = `translateY(${rollY}px)`;
  }
});

/* Input ---------------------------------------------------------------------- */

const isControl = (target) => target instanceof Element && target.closest('a, button');

addEventListener('pointerdown', (event) => {
  if (!isControl(event.target)) fast = true;
});
for (const type of ['pointerup', 'pointercancel', 'blur']) {
  addEventListener(type, () => { fast = false; });
}

addEventListener('keydown', (event) => {
  if ((event.key === ' ' || event.key === 'ArrowDown') && !isControl(event.target)) {
    event.preventDefault();
    fast = true;
  }
});
addEventListener('keyup', (event) => {
  if (event.key === ' ' || event.key === 'ArrowDown') fast = false;
});

soundButton.addEventListener('click', () => {
  const on = soundButton.getAttribute('aria-pressed') !== 'true';
  soundButton.setAttribute('aria-pressed', String(on));
  music.setEnabled(on);
});
replayButton.addEventListener('click', () => {
  play();
  // The finale's buttons hide as the film starts over; keep focus on screen.
  soundButton.focus({ preventScroll: true });
});

play();
