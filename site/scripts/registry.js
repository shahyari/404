/**
 * Client-side access to the experience registry (generated at build time
 * from experiences/<id>/meta.json by build/experiences.js).
 */
import experiences from 'virtual:experiences';

export { experiences };

const SEEN_KEY = '404:seen';

const readSeen = () => {
  try {
    return JSON.parse(sessionStorage.getItem(SEEN_KEY)) ?? [];
  } catch {
    return [];
  }
};

const writeSeen = (ids) => {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  } catch {
    /* Storage unavailable (private mode, blocked): shuffle still works, just with repeats. */
  }
};

/** Records an experience as seen so Shuffle avoids it until everything has been shown. */
export function markSeen(id) {
  const seen = readSeen();
  if (!seen.includes(id)) writeSeen([...seen, id]);
}

/** Previous and next experience in directory order, wrapping around at both ends. */
export function neighbours(id) {
  const index = experiences.findIndex((e) => e.id === id);
  const at = (offset) => experiences[(index + offset + experiences.length) % experiences.length];
  return { prev: at(-1), next: at(1) };
}

/**
 * Picks a random experience, never the current one when another exists, and
 * without repeats until every experience has been seen in this session.
 */
export function pickRandom(currentId) {
  if (!experiences.length) return null;
  const ids = experiences.map((e) => e.id);
  let seen = readSeen().filter((id) => ids.includes(id));

  let pool = ids.filter((id) => id !== currentId && !seen.includes(id));
  if (!pool.length) {
    seen = currentId ? [currentId] : [];
    pool = ids.filter((id) => id !== currentId);
  }
  if (!pool.length) pool = ids; // only one experience exists

  const id = pool[Math.floor(Math.random() * pool.length)];
  writeSeen([...seen, id]);
  return experiences.find((e) => e.id === id);
}
