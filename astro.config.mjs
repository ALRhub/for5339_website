import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// `site` is the public origin. Change it (and `base`, if the site is served
// from a sub-path) before deploying elsewhere.
export default defineConfig({
  site: 'https://mature-ai.de',
  trailingSlash: 'ignore',
  // HTML-aware whitespace handling, so inline elements keep their spaces.
  compressHTML: true,
  build: { format: 'directory' },
  integrations: [sitemap()],
});
