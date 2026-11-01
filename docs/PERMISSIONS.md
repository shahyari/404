# Permissions

Every experience runs in a **sandboxed iframe with an opaque origin**. It can do almost anything a web page can do, but it can't touch the main website, other experiences, or the visitor's data on this domain.

When your experience needs more than the default, ask for it in `meta.json`:

```json
{
  "permissions": ["storage", "fullscreen"]
}
```

Request only what you use. Reviewers will ask about every permission in a pull request.

## Available without asking

- HTML, CSS, JavaScript (classic scripts and ES modules)
- Canvas 2D, WebGL, Web Audio (after a click or key press, per browser autoplay rules)
- Keyboard, mouse, pointer, touch and scroll input
- Your own fonts, images, video, audio and data files, loaded with relative paths
- `fetch()` for files inside your own folder
- External libraries and fonts from CDNs (prefer copying them into your folder)
- Links that leave the frame after a click: `<a href="/" target="_top">`

## Permissions you can request

| Permission | What it enables | Implemented as |
|---|---|---|
| `storage` | Saving data between visits (high scores, settings, drawings) | Storage bridge provided by the shell (see below) |
| `fullscreen` | `element.requestFullscreen()` | `allow="fullscreen"` |
| `pointer-lock` | Hidden, locked cursor for first-person controls | `sandbox="allow-pointer-lock"` |
| `gamepad` | Game controllers through the Gamepad API | `allow="gamepad"` |
| `motion` | Device motion and orientation (tilt on phones) | `allow="accelerometer; gyroscope"` |
| `clipboard-write` | `navigator.clipboard.writeText()` after a user action | `allow="clipboard-write"` |
| `popups` | `target="_blank"` links and `window.open()`. New tabs open unsandboxed. | `sandbox="allow-popups allow-popups-to-escape-sandbox"` |
| `modals` | `alert()`, `confirm()`, `prompt()` | `sandbox="allow-modals"` |
| `forms` | Submitting a `<form>`. Inputs and buttons work without it. | `sandbox="allow-forms"` |
| `downloads` | Downloading files, e.g. "save your drawing as PNG" | `sandbox="allow-downloads"` |

On iOS, motion sensors also need `DeviceMotionEvent.requestPermission()` to be called from a tap inside your experience.

## Refused permissions

These requests fail the build with an explanation. They are never granted, not even partially.

| Request | Why |
|---|---|
| `same-origin`, `allow-same-origin` | Combined with `allow-scripts`, it lets a frame remove its own sandbox and read the main website and every other experience. Use `storage` instead. |
| `localStorage`, `local-storage`, `cookies`, `indexeddb` | Use `storage` instead. |
| `top-navigation` | Would let an experience redirect the whole site without a click. `target="_top"` links already work after a click. |
| `camera`, `microphone` | Not available yet: support inside sandboxed frames is inconsistent across browsers. Open an issue if your idea needs it. |
| `geolocation` | A 404 page has no need for a visitor's location. |

## How isolation works

- **Opaque origin.** The iframe has no `allow-same-origin`. Your experience can't read the site's DOM, cookies or storage, or another experience's data. `localStorage`, `sessionStorage`, `indexedDB` and `document.cookie` throw a `SecurityError`.
- **Sandbox header.** Everything under `/experiences/` is also served with `Content-Security-Policy: sandbox …`. Opening an experience URL directly gives it the same isolation as inside the frame.
- **No off-site frames.** The shell only allows frames from this site (`frame-src 'self'`), so an experience can't navigate its frame to another website.
- **CORS.** Your files are served with `Access-Control-Allow-Origin: *`, so ES modules, web fonts and `fetch()` work from the opaque origin.
- **Separate documents.** Your CSS resets, global variables and keyboard handlers stay inside your experience. When your experience has focus, key presses go only to it.

### Known limitations

**`import()` from a classic script** fails in an opaque origin. Load your code with `<script type="module" src="script.js">` instead. Static and dynamic imports both work inside module scripts.

**`autofocus`** is ignored in cross-origin frames, which includes every experience. When the site hands focus to your frame, nothing inside it is focused yet. To focus a button or input, do it yourself when the frame gets focus:

```js
const focusStart = () => {
  if (document.activeElement === document.body) startButton.focus();
};
addEventListener('focus', focusStart);
focusStart(); // for when the experience is opened on its own
```

Key presses already reach `document` without this, so games listening on `document` or `window` don't need it.

**Web Workers** created from a file (`new Worker('worker.js')`) fail in an opaque origin. Create them from a Blob instead:

```js
const code = await (await fetch('worker.js')).text();
const worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
```

**Reading CSS from a script at startup.** Safari, and every browser on iOS, can run your module script before `style.css` has applied. Values read with `getComputedStyle` at that moment are empty or wrong: CSS variables come back as `""`, and sizes are unstyled. If your script reads colors or measures layout as it starts, wait for the stylesheet first:

```js
while (!getComputedStyle(document.documentElement).getPropertyValue('--my-color').trim()) {
  await new Promise(requestAnimationFrame);
}
```

Use a custom property your stylesheet defines. Setting colors as `element.style.color = 'var(--my-color)'` also avoids the problem, because the browser resolves it once the CSS arrives.

## The storage bridge

With the `storage` permission, the shell stores data for you in its own `localStorage`. It's namespaced to your experience, so no other experience can read it.

**Limits:**

| Item | Limit |
|---|---|
| Keys | 1–100 characters each |
| Values | Strings only, up to 64 KB each (use `JSON.stringify`) |
| Number of keys | 100 per experience |

Copy this helper into your `script.js`:

```js
// Storage for 404 Pages experiences (requires "storage" in meta.json).
// Inside the site, data is kept by the shell. Opened standalone, it's kept
// in memory for the current visit.
const storage = (() => {
  const framed = window.parent !== window;
  const memory = new Map();
  const pending = new Map();
  let nextId = 0;

  addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window.parent || data?.type !== '404:storage' || !pending.has(data.id)) return;
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    data.ok ? resolve(data.value ?? null) : reject(new Error(data.error));
  });

  const call = (op, key, value) => new Promise((resolve, reject) => {
    if (!framed) {
      if (op === 'get') return resolve(memory.get(key) ?? null);
      if (op === 'set') return resolve(void memory.set(key, String(value)));
      if (op === 'remove') return resolve(void memory.delete(key));
      if (op === 'keys') return resolve([...memory.keys()]);
      if (op === 'clear') return resolve(memory.clear());
    }
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    window.parent.postMessage({ type: '404:storage', id, op, key, value }, '*');
    setTimeout(() => pending.delete(id) && reject(new Error('Storage timed out')), 3000);
  });

  return {
    get: (key) => call('get', key),
    set: (key, value) => call('set', key, value),
    remove: (key) => call('remove', key),
    keys: () => call('keys'),
    clear: () => call('clear'),
  };
})();

// Usage
const best = Number(await storage.get('best-score') ?? 0);
await storage.set('best-score', String(Math.max(best, score)));
```

All calls are asynchronous and can fail (storage full, private browsing), so handle errors where it matters.

## Navigating from inside your experience

Plain links are the simplest option:

```html
<a href="/" target="_top">Go home</a>
<a href="/explore/" target="_top">See all 404 pages</a>
```

For actions that aren't links, like a game's exit door, send a message to the shell:

```js
window.parent.postMessage({ type: '404:navigate', to: 'shuffle' }, '*');
// to: "home" | "explore" | "prev" | "next" | "shuffle"
```

The shell only follows these right after the visitor clicks, taps or presses a key, so an experience can't redirect people on its own. Browsers too old to report this ignore the messages. Outside the site there's no shell, so nothing happens either. Plain links work everywhere, so use them where you can.

## House rules

- **Don't block Tab.** Visitors use it to reach the site navigation from inside your experience.
- **Start muted.** Play sound only after a click or key press, and give people a way to turn it off.
- **Respect `prefers-reduced-motion`.** Calm down or stop heavy animation for visitors who ask for it.
