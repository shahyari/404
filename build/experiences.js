/**
 * Vite plugin that connects the experiences folder to the website.
 *
 *  - Exposes the registry to site scripts:  import experiences from 'virtual:experiences'
 *  - Expands HTML directives in site pages:
 *      <!-- @include header -->   site/partials/header.html
 *      <!-- @icon shuffle -->     site/partials/icons/shuffle.svg (decorative, aria-hidden)
 *      <!-- @cards -->            all experience cards (optionally "@cards 3 h3")
 *      <!-- @credits -->          contributors list
 *      {{tokenName}}              values from site.config.js plus {{count}}, {{countLabel}}, {{year}}
 *  - Shell pages: site/play.html becomes /<id>/ for every experience and /404.html.
 *  - Dev/preview: serves experiences/ untouched, with the same headers as production.
 *  - Build: copies valid experiences verbatim into dist/experiences/ and emits
 *    dist/experiences.json. Any invalid experience fails the build.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../site.config.js';
import { EXPERIENCES_DIR, EXPERIENCE_HEADERS, formatProblems, loadRegistry } from './registry.js';
import * as templates from '../site/partials/templates.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_DIR = path.join(ROOT, 'site');
const PARTIALS_DIR = path.join(SITE_DIR, 'partials');
const VIRTUAL_ID = 'virtual:experiences';

/**
 * Vercel Web Analytics (cookieless page view counts). Added to built pages
 * only: the script is served by Vercel at /_vercel/insights/ and doesn't
 * exist in dev or preview. Experiences never get it.
 */
const ANALYTICS = `<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };</script>
<script defer src="/_vercel/insights/script.js"></script>`;
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.wasm': 'application/wasm',
  '.glsl': 'text/plain; charset=utf-8', '.obj': 'text/plain; charset=utf-8', '.glb': 'model/gltf-binary',
};

export default function experiencesPlugin() {
  let registry = loadRegistry();
  let isBuild = false;
  let logger = console;

  const reportProblems = () => {
    if (!registry.problems.length) return;
    const message = `Invalid experiences (left out of the site):\n${formatProblems(registry.problems)}`;
    if (isBuild) throw new Error(message);
    logger.warn(`\n⚠ ${message}\n`);
  };

  /* ---------------------------------------------------------------- HTML -- */

  const tokens = () => {
    const count = registry.experiences.length;
    return {
      ...Object.fromEntries(Object.entries(config).filter(([, v]) => typeof v === 'string')),
      count: String(count),
      countLabel: `${count} experience${count === 1 ? '' : 's'}`,
      year: String(new Date().getFullYear()),
    };
  };

  const readPartial = (name, depth) => {
    const file = path.resolve(PARTIALS_DIR, path.extname(name) ? name : `${name}.html`);
    if (!file.startsWith(PARTIALS_DIR + path.sep) || !fs.existsSync(file)) {
      throw new Error(`@include: partial "${name}" not found in site/partials/`);
    }
    if (depth > 5) throw new Error(`@include: partials nested too deeply at "${name}"`);
    return expandIncludes(fs.readFileSync(file, 'utf8'), depth + 1);
  };

  const readIcon = (name) => {
    const file = path.join(PARTIALS_DIR, 'icons', `${name}.svg`);
    if (!fs.existsSync(file)) throw new Error(`@icon: "${name}.svg" not found in site/partials/icons/`);
    return fs.readFileSync(file, 'utf8').trim()
      .replace('<svg ', '<svg class="icon" aria-hidden="true" focusable="false" ');
  };

  const expandIncludes = (html, depth = 0) => html
    .replace(/<!--\s*@include\s+([\w./-]+)\s*-->/g, (_, name) => readPartial(name, depth))
    .replace(/<!--\s*@icon\s+([\w-]+)\s*-->/g, (_, name) => readIcon(name));

  const expandTokens = (html) => {
    const values = tokens();
    return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
      if (key.startsWith('experience')) return match; // filled per experience by fillShell()
      if (!(key in values)) throw new Error(`Unknown token ${match}. Available: ${Object.keys(values).join(', ')}`);
      return templates.escape(values[key]);
    });
  };

  /** Marks the header link for the current page with aria-current="page". */
  const markCurrentPage = (html, pagePath) => {
    const href = pagePath.replace(/index\.html$/, '');
    return html.replace(
      new RegExp(`(<a\\s[^>]*href="${href.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"[^>]*?)\\sdata-nav`, 'g'),
      '$1 data-nav aria-current="page"',
    );
  };

  /** Site pages and every experience page, with the date it was added. */
  const sitemap = (experiences) => {
    const pages = [
      { url: '/' },
      { url: '/explore/' },
      { url: '/about/' },
      ...experiences.map((exp) => ({ url: exp.url, date: exp.date })),
    ];
    const entries = pages.map(({ url, date }) =>
      `  <url><loc>${templates.escape(config.siteUrl + url)}</loc>${date ? `<lastmod>${date}</lastmod>` : ''}</url>`);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
  };

  /* -------------------------------------------------------- Shell pages -- */

  /**
   * Fills the {{experience…}} tokens of the shell (site/play.html) for one
   * experience, or for the 404 page when `exp` is null.
   */
  const fillShell = (html, exp) => {
    const list = registry.experiences;
    const index = list.indexOf(exp);
    const at = (offset) => (exp ? list[(index + offset + list.length) % list.length] : null);
    const prev = at(-1);
    const next = at(1);
    const values = {
      experienceMode: exp ? 'play' : 'not-found',
      experienceRobots: exp ? 'index, follow' : 'noindex',
      experienceId: exp?.id ?? '',
      experienceTitle: exp?.title ?? 'Page not found',
      experienceDescription: exp?.description ?? 'This page doesn’t exist. Here’s a different 404 instead.',
      experienceUrl: `${config.siteUrl}${exp?.url ?? '/'}`,
      experienceImage: `${config.siteUrl}${exp?.thumbnail ?? '/og.png'}`,
      experienceByline: exp?.author ? `by ${exp.author.name}` : '',
      experienceSrc: exp?.src ?? 'about:blank',
      experienceSandbox: exp?.sandbox ?? '',
      experienceAllow: exp?.allow ?? '',
      experiencePrevUrl: prev?.url ?? '/explore/',
      experiencePrevTitle: prev?.title ?? 'Explore',
      experienceNextUrl: next?.url ?? '/explore/',
      experienceNextTitle: next?.title ?? 'Explore',
    };
    return html.replace(/\{\{\s*(experience\w+)\s*\}\}/g, (match, key) => {
      if (!(key in values)) throw new Error(`Unknown shell token ${match}. Available: ${Object.keys(values).join(', ')}`);
      return templates.escape(values[key]);
    });
  };

  /* ---------------------------------------------------------- Dev server -- */

  const isSitePage = (pathname) => fs.existsSync(path.join(SITE_DIR, pathname, 'index.html'));

  /** Serves experiences/ as plain static files, bypassing Vite's transforms. */
  const serveExperienceFile = (pathname, res) => {
    let file = path.join(EXPERIENCES_DIR, decodeURIComponent(pathname.slice('/experiences/'.length)));
    if (!file.startsWith(EXPERIENCES_DIR + path.sep)) {
      res.statusCode = 403;
      return res.end('Forbidden');
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!pathname.endsWith('/')) {
        res.writeHead(308, { Location: pathname + '/' });
        return res.end();
      }
      file = path.join(file, 'index.html');
    }
    if (!fs.existsSync(file)) {
      res.statusCode = 404;
      return res.end('Not found');
    }

    for (const [key, value] of Object.entries(EXPERIENCE_HEADERS)) res.setHeader(key, value);
    res.setHeader('Content-Type', MIME_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(file).pipe(res);
  };

  /**
   * Dev routing that mirrors production:
   *   /experiences/**   raw files with production headers
   *   /<id>/            shell for that experience
   *   /explore → /explore/ (trailing slash, like Vercel's trailingSlash: true)
   *   anything else     the 404 shell, with status 404
   */
  const devRouter = (server) => async (req, res, next) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');

      if (pathname === '/experiences.json') {
        res.setHeader('Content-Type', MIME_TYPES['.json']);
        return res.end(JSON.stringify(registry.experiences, null, 2));
      }
      if (pathname.startsWith('/experiences/')) return serveExperienceFile(pathname, res);

      // Files and Vite internals (/@vite/client, /node_modules/…) are Vite's job.
      if (path.extname(pathname) || /^\/(@|__|node_modules\/)/.test(pathname)) return next();

      const segments = pathname.split('/').filter(Boolean);
      const exp = segments.length === 1 ? registry.experiences.find((e) => e.id === segments[0]) : null;

      if (!pathname.endsWith('/') && (exp || isSitePage(pathname))) {
        res.writeHead(308, { Location: pathname + '/' });
        return res.end();
      }
      if (!exp && isSitePage(pathname)) return next();

      const template = fs.readFileSync(path.join(SITE_DIR, 'play.html'), 'utf8');
      const html = fillShell(await server.transformIndexHtml(req.url, template, req.originalUrl), exp);
      res.statusCode = exp ? 200 : 404;
      res.setHeader('Content-Type', MIME_TYPES['.html']);
      res.end(html);
    } catch (error) {
      next(error);
    }
  };

  // Second pass for build-time content (cards, credits). Runs after Vite has
  // processed the HTML so experience URLs inside cards are left untouched.
  const content = {
    name: '404-experiences-content',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => (isBuild ? html.replace('</head>', `${ANALYTICS}\n</head>`) : html)
        .replace(/<!--\s*@cards(?:\s+(\d+))?(?:\s+h([1-6]))?\s*-->/g, (_, limit, level) =>
          templates.cards(registry.experiences, { limit: Number(limit) || undefined, headingLevel: Number(level) || 2 }))
        .replace(/<!--\s*@credits\s*-->/g, () => templates.credits(registry.experiences)),
    },
  };

  const main = {
    name: '404-experiences',

    configResolved(resolved) {
      isBuild = resolved.command === 'build';
      logger = resolved.logger;
      if (Object.values(config).some((v) => typeof v === 'string' && v.includes('TODO'))) {
        logger.warn('⚠ site.config.js still contains TODO placeholders.');
      }
    },

    buildStart() {
      registry = loadRegistry();
      reportProblems();
    },

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_ID) return `export default ${JSON.stringify(registry.experiences)};`;
    },

    transformIndexHtml: {
      // "pre" so stylesheets and scripts from partials are bundled by Vite.
      order: 'pre',
      handler(html, ctx) {
        return markCurrentPage(expandTokens(expandIncludes(html)), ctx.path);
      },
    },

    configureServer(server) {
      server.middlewares.use(devRouter(server));
      server.watcher.add([EXPERIENCES_DIR, PARTIALS_DIR]);
      server.watcher.on('all', (_event, file) => {
        if (!file.startsWith(EXPERIENCES_DIR) && !file.startsWith(PARTIALS_DIR)) return;
        registry = loadRegistry();
        reportProblems();
        const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      });
    },

    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url.startsWith('/experiences/')) {
          for (const [key, value] of Object.entries(EXPERIENCE_HEADERS)) res.setHeader(key, value);
        }
        next();
      });
      // Like Vercel: add the trailing slash to pages, answer unknown URLs with 404.html.
      const outDir = path.resolve(server.config.root, server.config.build.outDir);
      return () => {
        server.middlewares.use((req, res, next) => {
          const { pathname } = new URL(req.url, 'http://localhost');
          const file = path.join(outDir, decodeURIComponent(pathname));
          if (!pathname.endsWith('/') && fs.existsSync(path.join(file, 'index.html'))) {
            res.writeHead(308, { Location: pathname + '/' });
            return res.end();
          }
          const exists = [file, path.join(file, 'index.html'), `${file}.html`].some((f) => fs.existsSync(f));
          if (exists || !file.startsWith(outDir)) return next();
          res.statusCode = 404;
          res.setHeader('Content-Type', MIME_TYPES['.html']);
          res.end(fs.readFileSync(path.join(outDir, '404.html')));
        });
      };
    },

    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'experiences.json',
        source: JSON.stringify(registry.experiences, null, 2),
      });
    },

    writeBundle(options) {
      for (const { id } of registry.experiences) {
        fs.cpSync(path.join(EXPERIENCES_DIR, id), path.join(options.dir, 'experiences', id), { recursive: true });
      }

      // One static shell page per experience, plus the site's own 404 page.
      const shellFile = path.join(options.dir, 'play.html');
      const shell = fs.readFileSync(shellFile, 'utf8');
      for (const exp of registry.experiences) {
        fs.mkdirSync(path.join(options.dir, exp.id), { recursive: true });
        fs.writeFileSync(path.join(options.dir, exp.id, 'index.html'), fillShell(shell, exp));
      }
      fs.writeFileSync(path.join(options.dir, '404.html'), fillShell(shell, null));
      fs.rmSync(shellFile);

      fs.writeFileSync(path.join(options.dir, 'sitemap.xml'), sitemap(registry.experiences));
      fs.writeFileSync(path.join(options.dir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
    },
  };

  return [main, content];
}
