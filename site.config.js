/**
 * Central site configuration. Values here are available in every page and
 * partial as {{tokens}}, e.g. {{repoUrl}} (see build/experiences.js).
 *
 * Values marked TODO are placeholders. The build prints a warning while they
 * are still in place.
 */
export default {
  siteName: '404 Pages',
  siteDescription: 'A playground of creative and experimental "page not found" experiences.',
  siteUrl: 'https://404.shahyari.com',

  repoUrl: 'https://github.com/shahyari/404',

  creatorName: 'Hossein Shahyari',
  creatorUrl: 'https://shahyari.com',

  /** The only categories an experience can use. Tags are free-form. */
  categories: ['minimal', 'typographic', 'animated', 'interactive', 'game', 'generative', 'experimental'],

  /** Top-level paths owned by the website; experience folders cannot use these names. */
  reservedIds: ['404', 'about', 'assets', 'explore', 'experiences', 'fonts', 'play', 'search'],
};
