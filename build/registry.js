/**
 * Experience registry.
 *
 * Discovers every `experiences/<id>/meta.json`, validates it, and turns it
 * into the list the website renders. The folder name is the experience ID.
 * Folders starting with `_` or `.` (like `_template`) are ignored.
 *
 * Also owns the permission model: which browser capabilities an experience
 * may request, and how each one maps to iframe `sandbox` / `allow` values.
 *
 * Run directly to validate all experiences:  npm run check
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../site.config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const EXPERIENCES_DIR = path.join(ROOT, 'experiences');

/* -------------------------------------------------------------------------- */
/* Permissions                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Granted to every experience. Enough for HTML, CSS, JS, Canvas, WebGL,
 * Web Audio, keyboard, mouse and touch. `allow-top-navigation-by-user-activation`
 * lets `<a href="/" target="_top">` work, but only after a real click.
 */
export const BASE_SANDBOX = ['allow-scripts', 'allow-top-navigation-by-user-activation'];

/**
 * Capabilities an experience can opt into via `"permissions": [...]` in meta.json.
 *   sandbox: tokens added to the iframe `sandbox` attribute
 *   allow:   features added to the iframe `allow` (Permissions Policy) attribute
 *   bridge:  provided by the shell over postMessage instead of a browser flag
 */
export const PERMISSIONS = {
  storage: { bridge: true, summary: 'Persistent key/value storage, scoped to this experience, provided by the shell.' },
  fullscreen: { allow: ['fullscreen'], summary: 'Request fullscreen with element.requestFullscreen().' },
  'pointer-lock': { sandbox: ['allow-pointer-lock'], summary: 'Lock and hide the mouse cursor (first-person controls).' },
  gamepad: { allow: ['gamepad'], summary: 'Read connected game controllers.' },
  motion: { allow: ['accelerometer', 'gyroscope'], summary: 'Device motion and orientation (tilt controls on phones).' },
  'clipboard-write': { allow: ['clipboard-write'], summary: 'Write text to the clipboard after a user action.' },
  popups: { sandbox: ['allow-popups', 'allow-popups-to-escape-sandbox'], summary: 'Open links in a new tab (target="_blank", window.open).' },
  modals: { sandbox: ['allow-modals'], summary: 'Use alert(), confirm() and prompt().' },
  forms: { sandbox: ['allow-forms'], summary: 'Submit <form> elements. Inputs work without this.' },
  downloads: { sandbox: ['allow-downloads'], summary: 'Trigger file downloads (e.g. "save your drawing").' },
};

/**
 * Requests that are refused, with the reason shown to the contributor.
 * Nothing here is ever granted, not even partially.
 */
export const REFUSED_PERMISSIONS = {
  'same-origin':
    'allow-same-origin combined with allow-scripts lets a frame remove its own sandbox and read the main site and every other experience. Use "storage" if you need to persist data.',
  'top-navigation':
    'Would let an experience redirect the whole site without a click. Links with target="_top" already work after a user click.',
  microphone:
    'Not available yet: microphone access inside sandboxed frames behaves inconsistently across browsers. Open an issue if your idea needs it.',
  camera:
    'Not available yet: camera access inside sandboxed frames behaves inconsistently across browsers. Open an issue if your idea needs it.',
  geolocation: 'Not available: a 404 page has no need for a visitor\'s location.',
};
for (const alias of ['allow-same-origin', 'localStorage', 'local-storage', 'cookies', 'indexeddb']) {
  REFUSED_PERMISSIONS[alias] = alias === 'allow-same-origin'
    ? REFUSED_PERMISSIONS['same-origin']
    : 'Use the "storage" permission instead.';
}

/**
 * Upper bound of sandbox tokens any experience can ever get. Served as a
 * `Content-Security-Policy: sandbox ...` header on /experiences/**, so even a
 * direct, top-level visit to an experience URL runs in an opaque origin.
 * Must match the header in vercel.json (checked by `npm run check`).
 */
export const SANDBOX_HEADER = 'sandbox ' + [
  ...BASE_SANDBOX,
  ...Object.values(PERMISSIONS).flatMap((p) => p.sandbox ?? []),
].join(' ');

/** Headers for everything under /experiences/. Must match vercel.json (checked by `npm run check`). */
export const EXPERIENCE_HEADERS = {
  // Experiences run in an opaque origin, so their own files count as cross-origin
  // requests (ES modules, fonts, fetch).
  'Access-Control-Allow-Origin': '*',
  'Content-Security-Policy': SANDBOX_HEADER,
  // Search engines should list /<id>/ (with the site around it), not the raw files.
  'X-Robots-Tag': 'noindex',
};

/* -------------------------------------------------------------------------- */
/* Metadata schema                                                            */
/* -------------------------------------------------------------------------- */

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const INTERACTIONS = ['passive', 'keyboard', 'mouse', 'touch', 'scroll', 'motion'];
const KNOWN_KEYS = [
  'title', 'description', 'category', 'tags', 'interaction', 'author',
  'date', 'thumbnail', 'sound', 'license', 'permissions',
];

/** Validates one experience folder. Returns `{ experience }` or `{ errors }`. */
function loadExperience(id) {
  const dir = path.join(EXPERIENCES_DIR, id);
  const errors = [];
  const fail = (message) => errors.push(message);

  if (!ID_PATTERN.test(id)) fail('folder name must be lowercase kebab-case, e.g. "lost-in-space"');
  if (config.reservedIds.includes(id)) fail(`"${id}" is reserved by the website, pick another folder name`);
  if (!fs.existsSync(path.join(dir, 'index.html'))) fail('missing index.html');

  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  } catch (error) {
    fail(error.code === 'ENOENT' ? 'missing meta.json' : `meta.json is not valid JSON (${error.message})`);
    return { errors };
  }
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
    fail('meta.json must contain a JSON object');
    return { errors };
  }

  for (const key of Object.keys(meta)) {
    if (!KNOWN_KEYS.includes(key)) fail(`unknown field "${key}" (allowed: ${KNOWN_KEYS.join(', ')})`);
  }

  const text = (key, max, required = true) => {
    const value = meta[key];
    if (value === undefined && !required) return undefined;
    if (typeof value !== 'string' || !value.trim()) return fail(`"${key}" must be a non-empty string`);
    if (value.length > max) return fail(`"${key}" must be at most ${max} characters`);
    return value.trim();
  };
  const list = (key, required = true) => {
    const value = meta[key];
    if (value === undefined && !required) return [];
    if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' && v.trim())) {
      fail(`"${key}" must be an array of strings`);
      return [];
    }
    return [...new Set(value.map((v) => v.trim().toLowerCase()))];
  };

  const title = text('title', 60);
  const description = text('description', 200);

  const category = meta.category;
  if (!config.categories.includes(category)) {
    fail(`"category" must be one of: ${config.categories.join(', ')}`);
  }

  const tags = list('tags');
  if (tags.length > 8) fail('"tags" can have at most 8 entries');
  for (const tag of tags) if (!ID_PATTERN.test(tag)) fail(`tag "${tag}" must be lowercase kebab-case`);

  const interaction = list('interaction', false);
  for (const value of interaction) {
    if (!INTERACTIONS.includes(value)) fail(`"interaction" values must be among: ${INTERACTIONS.join(', ')}`);
  }

  let author = null;
  if (meta.author !== undefined) {
    const raw = typeof meta.author === 'string' ? { name: meta.author } : meta.author;
    if (typeof raw?.name !== 'string' || !raw.name.trim()) fail('"author" must be a name or { "name": "...", "url": "https://..." }');
    else if (raw.url !== undefined && !/^https:\/\//.test(raw.url)) fail('"author.url" must start with https://');
    else author = { name: raw.name.trim(), url: raw.url ?? null };
  }

  if (meta.date !== undefined && !(DATE_PATTERN.test(meta.date) && !Number.isNaN(Date.parse(meta.date)))) {
    fail('"date" must be a date formatted as YYYY-MM-DD');
  }

  let thumbnail = null;
  if (meta.thumbnail !== undefined) {
    const file = typeof meta.thumbnail === 'string' ? path.normalize(meta.thumbnail) : '';
    if (!file || file.startsWith('..') || path.isAbsolute(file)) fail('"thumbnail" must be a path inside the experience folder');
    else if (!fs.existsSync(path.join(dir, file))) fail(`thumbnail "${meta.thumbnail}" not found`);
    else thumbnail = `/experiences/${id}/${file.split(path.sep).join('/')}`;
  }

  if (meta.sound !== undefined && typeof meta.sound !== 'boolean') fail('"sound" must be true or false');
  const license = text('license', 40, false) ?? 'MIT';

  const permissions = list('permissions', false);
  for (const name of permissions) {
    if (REFUSED_PERMISSIONS[name]) fail(`permission "${name}" refused: ${REFUSED_PERMISSIONS[name]}`);
    else if (!PERMISSIONS[name]) fail(`unknown permission "${name}" (available: ${Object.keys(PERMISSIONS).join(', ')})`);
  }

  if (errors.length) return { errors };

  const granted = permissions.map((name) => PERMISSIONS[name]);
  return {
    experience: {
      id,
      title,
      description,
      category,
      tags,
      interaction,
      author,
      date: meta.date ?? null,
      thumbnail,
      sound: meta.sound ?? false,
      license,
      permissions,
      url: `/${id}/`,
      src: `/experiences/${id}/`,
      sandbox: [...BASE_SANDBOX, ...granted.flatMap((p) => p.sandbox ?? [])].join(' '),
      // `*` is required for features to reach an opaque-origin frame; the
      // shell's CSP (frame-src 'self') keeps the frame from navigating off-site.
      allow: granted.flatMap((p) => p.allow ?? []).map((f) => `${f} *`).join('; '),
    },
  };
}

/**
 * Loads every experience. Invalid ones are left out and reported in `problems`
 * so a single broken folder never takes the rest of the site down in dev.
 */
export function loadRegistry() {
  const experiences = [];
  const problems = [];

  const folders = fs.existsSync(EXPERIENCES_DIR)
    ? fs.readdirSync(EXPERIENCES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !/^[_.]/.test(entry.name))
        .map((entry) => entry.name)
    : [];

  for (const id of folders) {
    const result = loadExperience(id);
    if (result.experience) experiences.push(result.experience);
    else problems.push({ id, errors: result.errors });
  }

  // Newest first, undated last, then alphabetical. This order drives the
  // directory and previous/next navigation.
  experiences.sort((a, b) =>
    (b.date ?? '').localeCompare(a.date ?? '') || a.title.localeCompare(b.title));

  return { experiences, problems };
}

export function formatProblems(problems) {
  return problems
    .map(({ id, errors }) => `experiences/${id}/\n${errors.map((e) => `  - ${e}`).join('\n')}`)
    .join('\n');
}

/* -------------------------------------------------------------------------- */
/* CLI: npm run check                                                         */
/* -------------------------------------------------------------------------- */

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { experiences, problems } = loadRegistry();
  let failed = problems.length > 0;

  if (problems.length) console.error(`\n✗ ${problems.length} invalid experience(s):\n\n${formatProblems(problems)}\n`);

  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const rule = vercel.headers?.find((r) => r.source === '/experiences/(.*)');
  for (const [key, expected] of Object.entries(EXPERIENCE_HEADERS)) {
    const actual = rule?.headers.find((h) => h.key === key)?.value;
    if (actual !== expected) {
      failed = true;
      console.error(`✗ vercel.json: header "${key}" for /experiences/(.*) is out of date. Expected:\n  ${expected}\n`);
    }
  }

  if (failed) process.exit(1);
  console.log(`✓ ${experiences.length} experience(s) valid: ${experiences.map((e) => e.id).join(', ')}`);
}
