/**
 * Behavior shared by every page of the main website.
 * Pages work without it: Shuffle links fall back to /explore/.
 */
import { pickRandom } from './registry.js';

const isModifiedClick = (event) =>
  event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

// Shuffle: any [data-shuffle] link goes to a random experience.
document.addEventListener('click', (event) => {
  const link = event.target.closest('[data-shuffle]');
  if (!link || event.defaultPrevented || isModifiedClick(event)) return;
  const next = pickRandom(document.body.dataset.experience);
  if (!next) return;
  event.preventDefault();
  location.assign(next.url);
});

// "/" focuses search from anywhere on the site, unless the user is typing.
document.addEventListener('keydown', (event) => {
  if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target;
  if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
  event.preventDefault();
  const search = document.getElementById('search');
  if (search) search.focus();
  else location.assign('/explore/#search');
});

// Keep the copyright year current even on a long-cached page.
for (const el of document.querySelectorAll('[data-year]')) {
  el.textContent = String(new Date().getFullYear());
}
