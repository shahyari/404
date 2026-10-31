/**
 * Experience shell behavior.
 *
 * The page already works without this script: the frame, title and
 * previous/next links are filled in at build time. This adds the info panel,
 * the collapsible bar, a slow-load notice, the 404 mode, and the optional
 * postMessage API experiences can use (see docs/PERMISSIONS.md).
 */
import { experiences, markSeen, neighbours, pickRandom } from './registry.js';

const root = document.documentElement;
const body = document.body;
const frame = document.getElementById('experience-frame');
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

/** Show the "taking a while" notice if the frame hasn't loaded by then. */
const SLOW_AFTER_MS = 10_000;
/** Per-experience quota for the storage bridge. */
const STORAGE_LIMITS = { keyLength: 100, valueLength: 64 * 1024, keys: 100 };

const isNotFound = body.dataset.mode === 'not-found';
const experience = isNotFound
  ? pickRandom()
  : experiences.find((e) => e.id === body.dataset.experience);

/* 404 mode: load a random experience into the shell ------------------------ */

function load(exp) {
  const { prev, next } = neighbours(exp.id);
  body.dataset.experience = exp.id;
  $('[data-title]').textContent = exp.title;
  $('[data-byline]').textContent = exp.author ? `by ${exp.author.name}` : '';
  $('[data-prev]').href = prev.url;
  $('[data-prev]').setAttribute('aria-label', `Previous: ${prev.title}`);
  $('[data-next]').href = next.url;
  $('[data-next]').setAttribute('aria-label', `Next: ${next.title}`);

  // Permissions must be in place before the frame navigates.
  frame.title = exp.title;
  frame.setAttribute('sandbox', exp.sandbox);
  frame.setAttribute('allow', exp.allow);
  delete frame.dataset.loaded;
  frame.src = exp.src;
}

if (isNotFound) {
  $('[data-missing-path]').textContent = location.pathname;
  $('[data-not-found-banner]').hidden = false;
  $('[data-banner-close]').addEventListener('click', () => {
    $('[data-not-found-banner]').hidden = true;
  });
  if (experience) load(experience);
}

if (experience) {
  markSeen(experience.id);
  setUpInfo(experience);
  setUpLoading(experience);
  setUpMessages(experience);
}
setUpBar();

/* Info panel -------------------------------------------------------------- */

function setUpInfo(exp) {
  const toggle = $('[data-info-toggle]');
  const panel = $('#shell-info');
  const repo = body.dataset.repo;

  $('[data-info-title]').textContent = exp.title;
  $('[data-info-description]').textContent = exp.description;
  const byline = $('[data-info-byline]');
  if (exp.author) {
    byline.textContent = 'by ';
    const name = document.createElement(exp.author.url ? 'a' : 'span');
    name.textContent = exp.author.name;
    if (exp.author.url) Object.assign(name, { href: exp.author.url, rel: 'noopener', target: '_blank' });
    byline.append(name);
  }

  const facts = [
    ['Category', exp.category],
    ['Tags', exp.tags.map((tag) => {
      const link = document.createElement('a');
      link.href = `/explore/?tag=${encodeURIComponent(tag)}`;
      link.textContent = `#${tag}`;
      return link;
    })],
    ['Interaction', exp.interaction.join(', ') || null],
    ['Sound', exp.sound ? 'Yes, after you interact' : null],
    ['Permissions', exp.permissions.length ? exp.permissions.join(', ') : 'None (fully sandboxed)'],
    ['Added', exp.date],
    ['License', exp.license],
  ];
  for (const [label, value] of facts) {
    if (!value || (Array.isArray(value) && !value.length)) continue;
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    if (Array.isArray(value)) value.forEach((node, i) => dd.append(...(i ? [' ', node] : [node])));
    else dd.textContent = value;
    $('[data-info-facts]').append(dt, dd);
  }

  for (const link of $$('[data-info-standalone]')) link.href = exp.src;
  $('[data-info-source]').href = `${repo}/tree/main/experiences/${exp.id}`;
  $('[data-info-report]').href = `${repo}/issues/new?${new URLSearchParams({
    title: `[${exp.id}] `,
    body: `Experience: ${location.origin}${exp.url}\nBrowser / device: \n\nWhat happened?\n`,
  })}`;

  const setOpen = (open, { returnFocus = false } = {}) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) panel.querySelector('h2').focus({ preventScroll: true });
    else if (returnFocus) toggle.focus();
  };
  panel.querySelector('h2').tabIndex = -1;

  toggle.hidden = false;
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) setOpen(false, { returnFocus: true });
  });
  // Focus moving into the experience (a click or tap on it) closes the panel.
  window.addEventListener('blur', () => {
    if (document.activeElement === frame) setOpen(false);
  });
}

/* Loading ----------------------------------------------------------------- */

function setUpLoading(exp) {
  const notice = $('[data-slow-notice]');
  let timer;

  const onLoaded = () => {
    clearTimeout(timer);
    notice.hidden = true;
    // Send keyboard input straight to the experience unless the visitor
    // has already moved focus somewhere in the shell.
    if (document.activeElement === body) frame.focus();
  };
  const watch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { notice.hidden = false; }, SLOW_AFTER_MS);
  };

  frame.addEventListener('load', onLoaded);
  // The frame may have finished before this module ran (see onload in play.html).
  if ('loaded' in frame.dataset) onLoaded();
  else watch();

  $('[data-retry]').addEventListener('click', () => {
    notice.hidden = true;
    frame.src = exp.src;
    watch();
  });
}

/* Collapsible bar --------------------------------------------------------- */

function setUpBar() {
  const hide = $('[data-bar-hide]');
  const show = $('[data-bar-show]');

  const setHidden = (hidden) => {
    root.dataset.bar = hidden ? 'hidden' : 'visible';
    try {
      localStorage.setItem('404:bar', hidden ? 'hidden' : 'visible');
    } catch {
      /* Not persisted; still works for this page. */
    }
    (hidden ? show : hide).focus();
  };

  hide.hidden = false;
  hide.addEventListener('click', () => setHidden(true));
  show.addEventListener('click', () => setHidden(false));
}

/* Messages from the experience --------------------------------------------
 *
 * Experiences run in an opaque origin, so messages arrive with origin "null".
 * They are trusted only if they come from this page's own frame.
 */

function setUpMessages(exp) {
  window.addEventListener('message', (event) => {
    if (event.source !== frame.contentWindow) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === '404:storage') handleStorage(exp, event.source, data);
    if (data.type === '404:navigate') handleNavigate(exp, data.to);
  });
}

function handleNavigate(exp, to) {
  // Only follow navigation requests that come right after a click or key press,
  // so an experience cannot bounce visitors around on its own. Browsers that
  // can't tell (no navigator.userActivation) never follow them.
  if (!navigator.userActivation?.isActive) return;
  const { prev, next } = neighbours(exp.id);
  const targets = {
    home: '/',
    explore: '/explore/',
    prev: prev.url,
    next: next.url,
    shuffle: () => pickRandom(exp.id)?.url,
  };
  const target = typeof targets[to] === 'function' ? targets[to]() : targets[to];
  if (target) location.assign(target);
}

function handleStorage(exp, source, { id, op, key, value }) {
  const reply = (ok, payload = {}) => source.postMessage({ type: '404:storage', id, ok, ...payload }, '*');
  // Each experience gets its own namespace in the site's localStorage.
  const prefix = `404:exp:${exp.id}:`;
  const ownKeys = () => Object.keys(localStorage)
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length));

  try {
    if (!exp.permissions.includes('storage')) {
      throw new Error('Storage is not enabled. Add "storage" to "permissions" in meta.json.');
    }
    if (op === 'keys') return reply(true, { value: ownKeys() });
    if (op === 'clear') {
      for (const k of ownKeys()) localStorage.removeItem(prefix + k);
      return reply(true);
    }
    if (typeof key !== 'string' || !key || key.length > STORAGE_LIMITS.keyLength) {
      throw new Error(`Keys must be strings of 1–${STORAGE_LIMITS.keyLength} characters.`);
    }
    if (op === 'get') return reply(true, { value: localStorage.getItem(prefix + key) });
    if (op === 'remove') {
      localStorage.removeItem(prefix + key);
      return reply(true);
    }
    if (op === 'set') {
      if (typeof value !== 'string') throw new Error('Values must be strings. Use JSON.stringify for objects.');
      if (value.length > STORAGE_LIMITS.valueLength) throw new Error('Value is larger than 64 KB.');
      if (localStorage.getItem(prefix + key) === null && ownKeys().length >= STORAGE_LIMITS.keys) {
        throw new Error(`An experience can store at most ${STORAGE_LIMITS.keys} keys.`);
      }
      localStorage.setItem(prefix + key, value);
      return reply(true);
    }
    throw new Error(`Unknown storage operation "${op}".`);
  } catch (error) {
    reply(false, { error: error.message });
  }
}
