# 404 Pages

An open-source playground of creative 404 pages. Each one is a small, self-contained world: typographic, animated, interactive or playable.

**[404.shahyari.com](https://404.shahyari.com)**

- **Shuffle** through experiences, or browse and search them all.
- **Every experience is isolated** in a sandboxed frame, so contributors can use any technique without breaking the site or each other.
- **Reuse them:** experiences are MIT-licensed unless they say otherwise.
- **No tracking, no backend, no framework.** Plain HTML, CSS and JavaScript, built with Vite, hosted as static files.

## Add your own

Copy the template, build a 404 page your way, and open a pull request.

```bash
git clone https://github.com/shahyari/404.git
cd 404
npm install
cp -r experiences/_template experiences/your-idea
npm run dev   # then open http://localhost:5173/your-idea/
```

Read **[CONTRIBUTING.md](CONTRIBUTING.md)** for the full guide and guidelines.

| Guide | What's in it |
|---|---|
| [CONTRIBUTING.md](CONTRIBUTING.md) | Adding an experience, guidelines, working on the site |
| [docs/METADATA.md](docs/METADATA.md) | Every `meta.json` field |
| [docs/PERMISSIONS.md](docs/PERMISSIONS.md) | What experiences can do, optional permissions, saving data, sandbox limitations |
| [SECURITY.md](SECURITY.md) | Reporting a way around the sandbox |

## How it works

```
experiences/<id>/          index.html + meta.json (+ any other files)
        │
        ▼  npm run build
build/registry.js          validates every meta.json → list of experiences
build/experiences.js       renders cards, writes one page per experience, copies files
        │
        ▼
dist/
  index.html, explore/     home and searchable directory (cards rendered at build time)
  <id>/index.html          the shell: top bar + sandboxed <iframe>
  experiences/<id>/        the experience's own files, served with a sandbox header
  404.html                 shows a random experience for any unknown URL
  experiences.json         the registry, for anyone who wants it
  sitemap.xml, robots.txt  for search engines
```

- **Registry.** The folder name is the ID and the URL. There's no central list to edit: adding a folder with a valid `meta.json` adds the experience everywhere.
- **Shell.** `/<id>/` shows the experience in a full-size frame under a thin bar with Previous, Next, Shuffle and Info. The bar can be hidden.
- **Isolation.** Frames run with `sandbox` and without `allow-same-origin`, so each experience gets an opaque origin. Files under `/experiences/` are also served with a `Content-Security-Policy: sandbox` header, so they are isolated even when opened directly. Extra capabilities are opt-in per experience and checked at build time. Details: [docs/PERMISSIONS.md](docs/PERMISSIONS.md#how-isolation-works).

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Development server with live reload at http://localhost:5173 |
| `npm run check` | Validates every experience and the security headers |
| `npm run build` | Builds the site into `dist/` |
| `npm run preview` | Serves `dist/` locally, with the same experience headers, redirects and 404 page as production |

Requires Node.js 20 or newer.

## Configuration

Site name, links and categories are in [site.config.js](site.config.js). Hosting settings and security headers are in [vercel.json](vercel.json).

## License

- Website code: [MIT](LICENSE)
- Experiences: each one's `license` field in `meta.json`, MIT by default
- [Geist Mono](https://github.com/vercel/geist-font) font: SIL Open Font License 1.1
- [Phosphor](https://phosphoricons.com) icons: MIT

See [THIRD_PARTY.md](THIRD_PARTY.md) for details.
