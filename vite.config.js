import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import experiences from './build/experiences.js';

const page = (file) => resolve(import.meta.dirname, 'site', file);

export default defineConfig({
  root: 'site',
  appType: 'mpa',
  plugins: [experiences()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: page('index.html'),
        explore: page('explore/index.html'),
        about: page('about/index.html'),
        // Shell template: copied to /<id>/ and /404.html by the experiences plugin.
        play: page('play.html'),
      },
    },
  },
});
