# Third-party assets

The project's own code is under the [MIT License](LICENSE). It includes the following third-party assets, each under its own license.

| Asset | Used for | License | License file |
|---|---|---|---|
| [Geist Mono](https://github.com/vercel/geist-font) (variable WOFF2, from the `geist` npm package 1.9.0) | The website's typeface | SIL Open Font License 1.1. Copyright (c) 2023 Vercel, in collaboration with basement.studio. | [site/public/fonts/GeistMono-OFL.txt](site/public/fonts/GeistMono-OFL.txt) |
| [Phosphor Icons](https://phosphoricons.com) (regular weight, from `@phosphor-icons/core` 2.1.1) | Icons in the website interface | MIT. Copyright (c) 2023 Phosphor Icons. | [site/partials/icons/LICENSE](site/partials/icons/LICENSE) |

The font is served from this site, never from a third-party server, and its license is published with it at `/fonts/GeistMono-OFL.txt`. The icons are inlined into the HTML at build time.

## Experiences

Each experience in [experiences/](experiences/) is licensed by its author, as given in the `license` field of its `meta.json`. If that field is missing, it's MIT. An experience that bundles third-party code, fonts, images or sounds lists them in its own `README.md` or `CREDITS.md` file.
