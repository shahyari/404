# Contributing

Thanks for wanting to add to 404 Pages. Most contributions are new experiences: a 404 page built your way. You don't need to know how the rest of the site works to add one.

- [Add an experience](#add-an-experience)
- [Guidelines for experiences](#guidelines-for-experiences)
- [Improve the website](#improve-the-website)
- [Report a problem](#report-a-problem)

## Setup

You need [Node.js](https://nodejs.org) 20 or newer and Git.

```bash
git clone https://github.com/shahyari/404.git
cd 404
npm install
npm run dev
```

The site runs at http://localhost:5173.

## Add an experience

1. **Fork** the repository and create a branch, for example `experience/lost-in-space`.

2. **Copy the template.** The folder name becomes the URL: lowercase, words joined with hyphens.

   ```bash
   cp -r experiences/_template experiences/lost-in-space
   ```

3. **Build your page** in `index.html`, `style.css` and `script.js`. Add any other files you need: more scripts, images, fonts, sounds. Use relative paths (`assets/ship.png`, not `/assets/ship.png`).

4. **Fill in `meta.json`.** Every field is described in [docs/METADATA.md](docs/METADATA.md).

5. **Try it** at http://localhost:5173/lost-in-space/. This is how visitors will see it, with the site's top bar. Changes reload automatically.

6. **Check it:**

   ```bash
   npm run check
   ```

7. **Open a pull request.** The template asks a few questions. A reviewer will try your experience and reply.

### What your experience can do

It runs in an isolated, sandboxed frame. Inside it, almost everything works: HTML, CSS, JavaScript modules, Canvas, WebGL, Web Audio, keyboard, mouse and touch. It can't read the website, other experiences or the visitor's data.

If you need to save data between visits, go fullscreen, or use game controllers or tilt, ask for that permission in `meta.json`. [docs/PERMISSIONS.md](docs/PERMISSIONS.md) lists every permission, what it costs in security, and the known limitations of the sandbox. Read its [Known limitations](docs/PERMISSIONS.md#known-limitations) section before you start: they cover `import()`, Web Workers and `autofocus`.

### Examples

| Experience | Shows |
|---|---|
| [missing-zero](experiences/missing-zero/) | HTML and CSS, plus a few lines of JavaScript for a keyboard easter egg |
| [gathering-dust](experiences/gathering-dust/) | Canvas animation, pointer input, reduced motion |
| [packet-loss](experiences/packet-loss/) | A game split into ES modules, keyboard and touch input, saved high score, navigating from inside |

## Guidelines for experiences

Reviewers check these. Following them gets your pull request merged faster.

**It's a 404 page.** It should be clear the visitor reached a page that doesn't exist, and there should be a way out. A link home with `target="_top"` is enough.

**It's original.** Make your own idea, or your take on a genre. Don't recreate an existing game, website or brand, and don't use characters, logos or assets you don't have the rights to.

**It's self-contained.**
- Put libraries, fonts and assets in your folder. If you load something from a CDN, use an exact version and a well-known CDN.
- No analytics, trackers, ads, or requests that send visitor data anywhere.
- No backend. The site is static.
- Keep the folder under 2 MB if you can. Explain anything bigger in the pull request.

**It's accessible.**
- Keyboard users can reach everything that matters. Don't block the Tab key: visitors use it to get back to the site's navigation.
- Text has enough contrast (4.5:1 for body text).
- Add a heading or an `aria-label` that says "404" or what the page is, so screen reader users know where they are.
- Respect `prefers-reduced-motion`: calm down or stop heavy animation.
- No rapid flashing (more than three flashes a second).

**It's respectful of the visitor.**
- Start muted. Play sound only after a click or key press, and set `"sound": true` in `meta.json`.
- Stop expensive work when it isn't needed. `requestAnimationFrame` pauses in background tabs on its own; timers and audio don't.
- Works on phones and on desktop, in current Chrome, Firefox and Safari.
- Content suits a general audience.

**It's yours to give.** You license your experience under MIT unless you set `license` in `meta.json`. If you include third-party files, check their licenses allow it and credit them in a `CREDITS.md` in your folder.

## Improve the website

For changes to the site itself (layout, search, the shell, the build), open an issue first for anything bigger than a small fix, so we can agree on the approach.

### How the project is organized

```
experiences/          One folder per experience (_template is the starting point)
site/                 The website: pages, partials, styles, scripts, static files
  play.html           The experience page with the top bar (the "shell")
  partials/           Shared HTML (header, footer, icons) and card templates
  scripts/            Search, shuffle, shell behavior
  styles/             Design tokens, base styles, components, shell
build/
  registry.js         Reads and validates every meta.json; owns the permission model
  experiences.js      Vite plugin: HTML includes, cards, dev routing, build output
docs/                 Metadata and permission reference
site.config.js        Site name, links, categories
vercel.json           Hosting config and security headers
```

**Principles:**
- Plain HTML, CSS and JavaScript. Vite is the only dependency. Please don't add frameworks.
- Pages work without JavaScript wherever possible. Cards and links are rendered at build time.
- Every color, size and spacing comes from the tokens in `site/styles/tokens.css`.
- The sandbox is the security boundary. Changes to `build/registry.js`, the shell's message handling or the headers in `vercel.json` need a clear reason in the pull request. See [SECURITY.md](SECURITY.md).

Before opening a pull request, run:

```bash
npm run check
npm run build && npm run preview
```

and check your change at phone and desktop widths, in light and dark mode, and with the keyboard.

## Report a problem

- **Something broken in an experience:** use "Report a problem" in the experience's info panel. It opens an issue with the details filled in.
- **Anything else:** [open an issue](https://github.com/shahyari/404/issues/new/choose).
- **A way around the sandbox, or another security issue:** don't open a public issue. See [SECURITY.md](SECURITY.md).
