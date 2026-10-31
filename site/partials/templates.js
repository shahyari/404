/**
 * HTML rendered at build time from the registry. Used by the page directives
 * `<!-- @cards -->`, `<!-- @cards 3 -->` and `<!-- @credits -->`.
 *
 * Rendering cards into the HTML (instead of in the browser) means the
 * directory works without JavaScript and every experience is a crawlable link.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

const label = (word) => word.charAt(0).toUpperCase() + word.slice(1);

export function card(exp, { headingLevel = 2 } = {}) {
  const h = `h${headingLevel}`;
  const media = exp.thumbnail
    ? `<img src="${escape(exp.thumbnail)}" alt="" width="640" height="400" loading="lazy" decoding="async">`
    : `<span class="card-tile">/${escape(exp.id)}</span>`;
  const details = [
    label(exp.category),
    exp.interaction.length ? exp.interaction.join(', ') : null,
    exp.sound ? 'sound' : null,
    exp.author ? `by ${escape(exp.author.name)}` : null,
  ].filter(Boolean);
  const tags = exp.tags
    .map((tag) => `<li><a href="/explore/?tag=${escape(tag)}" data-tag="${escape(tag)}">#${escape(tag)}</a></li>`)
    .join('');

  return `<li class="card" data-id="${escape(exp.id)}">
  <div class="card-media" aria-hidden="true">${media}</div>
  <${h} class="card-title"><a class="card-link" href="${escape(exp.url)}">${escape(exp.title)}</a></${h}>
  <p class="card-description">${escape(exp.description)}</p>
  <p class="card-details">${details.join(' · ')}</p>
  ${tags ? `<ul class="card-tags" aria-label="Tags">${tags}</ul>` : ''}
</li>`;
}

export function cards(experiences, { limit, headingLevel } = {}) {
  const list = limit ? experiences.slice(0, limit) : experiences;
  return list.map((exp) => card(exp, { headingLevel })).join('\n');
}

/** Contributors, grouped by author, each with links to their experiences. */
export function credits(experiences) {
  const byAuthor = new Map();
  for (const exp of experiences) {
    if (!exp.author) continue;
    const entry = byAuthor.get(exp.author.name) ?? { author: exp.author, items: [] };
    entry.items.push(exp);
    byAuthor.set(exp.author.name, entry);
  }
  if (!byAuthor.size) return '<li>No credited contributors yet. Be the first.</li>';

  return [...byAuthor.values()]
    .sort((a, b) => a.author.name.localeCompare(b.author.name))
    .map(({ author, items }) => {
      const name = author.url
        ? `<a href="${escape(author.url)}" rel="noopener">${escape(author.name)}</a>`
        : escape(author.name);
      const works = items.map((e) => `<a href="${escape(e.url)}">${escape(e.title)}</a>`).join(', ');
      return `<li><span class="credit-name">${name}</span> <span class="credit-works">${works}</span></li>`;
    })
    .join('\n');
}
