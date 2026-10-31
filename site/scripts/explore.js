/**
 * Explore page: instant client-side search plus category and tag filters.
 *
 * Cards are rendered at build time; this script only shows, hides and
 * reorders them. Filter state lives in the URL (?q=&category=&tag=) so it
 * can be shared and survives back/forward navigation.
 */
import { experiences } from './registry.js';

const form = document.querySelector('[data-search-form]');
const input = document.getElementById('search');
const filters = document.querySelector('[data-filters]');
const tagChipTemplate = document.querySelector('[data-tag-chip]');
const results = document.getElementById('results');
const status = document.getElementById('results-status');
const empty = document.querySelector('[data-empty]');
const emptyMessage = document.querySelector('[data-empty-message]');

/* Search index ------------------------------------------------------------ */

const normalize = (text) =>
  String(text ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

// Higher weight = more relevant field. Matches at the start of a word count double.
const WEIGHTS = { title: 8, tags: 4, category: 4, author: 2, description: 1 };

const items = experiences
  .map((exp, index) => ({
    exp,
    index,
    el: results.querySelector(`[data-id="${CSS.escape(exp.id)}"]`),
    fields: {
      title: normalize(exp.title),
      tags: normalize(exp.tags.join(' ')),
      category: normalize(exp.category),
      author: normalize(exp.author?.name),
      description: normalize(exp.description),
    },
  }))
  .filter((item) => item.el);

/** Every query word must match some field; returns 0 when it doesn't. */
function score(item, words) {
  let total = 1;
  for (const word of words) {
    let best = 0;
    for (const [field, text] of Object.entries(item.fields)) {
      const at = text.indexOf(word);
      if (at === -1) continue;
      const wordStart = at === 0 || /[^a-z0-9]/.test(text[at - 1]);
      best = Math.max(best, WEIGHTS[field] * (wordStart ? 2 : 1));
    }
    if (!best) return 0;
    total += best;
  }
  return total;
}

/* State ------------------------------------------------------------------- */

const categories = [...new Set(experiences.map((e) => e.category))].sort();

function readState() {
  const params = new URLSearchParams(location.search);
  const category = params.get('category');
  return {
    q: params.get('q') ?? '',
    category: categories.includes(category) ? category : '',
    tag: normalize(params.get('tag')),
  };
}

let state = readState();

function setState(next, { push = false } = {}) {
  state = { ...state, ...next };
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.category) params.set('category', state.category);
  if (state.tag) params.set('tag', state.tag);
  const url = `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`;
  history[push ? 'pushState' : 'replaceState'](null, '', url);
  render();
}

/* Rendering --------------------------------------------------------------- */

const plural = (n) => `${n} experience${n === 1 ? '' : 's'}`;
let statusTimer;

function render() {
  const words = normalize(state.q).split(/\s+/).filter(Boolean);

  const matches = items
    .filter(({ exp }) =>
      (!state.category || exp.category === state.category) &&
      (!state.tag || exp.tags.includes(state.tag)))
    .map((item) => ({ item, score: score(item, words) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.item.index - b.item.index);

  for (const { el } of items) el.hidden = true;
  for (const { item } of matches) {
    item.el.hidden = false;
    results.append(item.el); // re-append in ranked order
  }

  empty.hidden = matches.length > 0;
  results.hidden = matches.length === 0;

  const filtersLabel = [
    state.q && `“${state.q.trim()}”`,
    state.category && `in ${state.category}`,
    state.tag && `tagged #${state.tag}`,
  ].filter(Boolean).join(' ');
  emptyMessage.textContent = filtersLabel ? `No experiences match ${filtersLabel}.` : '';

  // Debounced so screen readers aren't interrupted on every keystroke.
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    status.textContent = filtersLabel
      ? `${plural(matches.length)} matching ${filtersLabel}`
      : `Showing all ${plural(matches.length)}`;
  }, 250);

  renderFilters();
}

function renderFilters() {
  const counts = Object.fromEntries(categories.map((c) => [c, 0]));
  for (const { exp } of items) counts[exp.category] += 1;

  const chip = (label, value, count) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.dataset.category = value;
    button.setAttribute('aria-pressed', String(state.category === value));
    button.textContent = label;
    if (count !== undefined) {
      const small = document.createElement('span');
      small.className = 'chip-count';
      small.textContent = count;
      button.append(' ', small);
    }
    return button;
  };

  const focusedCategory = document.activeElement?.dataset?.category;
  filters.replaceChildren(
    chip('All', '', items.length),
    ...categories.map((c) => chip(c.charAt(0).toUpperCase() + c.slice(1), c, counts[c])),
  );

  if (state.tag) {
    const tagChip = tagChipTemplate.content.firstElementChild.cloneNode(true);
    tagChip.querySelector('[data-label]').textContent = `#${state.tag}`;
    tagChip.setAttribute('aria-label', `Remove tag filter #${state.tag}`);
    filters.append(tagChip);
  }

  // Re-rendering replaces the buttons; keep keyboard focus where it was.
  if (focusedCategory !== undefined) {
    filters.querySelector(`[data-category="${CSS.escape(focusedCategory)}"]`)?.focus();
  }
}

/* Events ------------------------------------------------------------------ */

input.addEventListener('input', () => setState({ q: input.value }));

input.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && input.value) {
    event.preventDefault();
    input.value = '';
    setState({ q: '' });
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    visibleLinks()[0]?.focus();
  }
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  visibleLinks()[0]?.focus();
});

filters.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-tag-chip-button')) {
    setState({ tag: '' }, { push: true });
    input.focus();
  } else {
    const value = button.dataset.category;
    setState({ category: state.category === value ? '' : value }, { push: true });
  }
});

// Tag links inside cards filter in place instead of reloading the page.
results.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-tag]');
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
  event.preventDefault();
  setState({ tag: link.dataset.tag }, { push: true });
  window.scrollTo({ top: 0 });
  input.focus({ preventScroll: true });
});

// Arrow keys move between visible results; ArrowUp from the first returns to search.
const visibleLinks = () => [...results.querySelectorAll('.card:not([hidden]) .card-link')];

results.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const links = visibleLinks();
  const index = links.indexOf(document.activeElement);
  if (index === -1) return;
  event.preventDefault();
  const next = index + (event.key === 'ArrowDown' ? 1 : -1);
  (next < 0 ? input : links[Math.min(next, links.length - 1)]).focus();
});

document.querySelector('[data-clear]').addEventListener('click', () => {
  input.value = '';
  setState({ q: '', category: '', tag: '' }, { push: true });
  input.focus();
});

window.addEventListener('popstate', () => {
  state = readState();
  input.value = state.q;
  render();
});

// The header's Search link points to /explore/#search.
const focusSearchFromHash = () => {
  if (location.hash === '#search') input.focus();
};
window.addEventListener('hashchange', focusSearchFromHash);
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-search-link]') && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    input.focus();
  }
});

/* Start ------------------------------------------------------------------- */

form.hidden = false;
filters.hidden = false;
input.value = state.q;
render();
focusSearchFromHash();
