import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, readdirSync } from 'node:fs';

import { defineConfig } from 'astro/config';

import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';
import partytown from '@astrojs/partytown';
import icon from 'astro-icon';
import compress from 'astro-compress';
import type { AstroIntegration } from 'astro';

import astrowind from './vendor/integration';

import {
  blogPostHeadingsRemarkPlugin,
  readingTimeRemarkPlugin,
  responsiveTablesRehypePlugin,
  lazyImagesRehypePlugin,
} from './src/utils/frontmatter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const archivedBlogPaths = new Set(
  ['src/data/post', 'src/content/blog'].flatMap((relativeDirectory) => {
    const directory = path.join(__dirname, relativeDirectory);

    return readdirSync(directory)
      .filter((filename) => /\.mdx?$/i.test(filename))
      .flatMap((filename) => {
        const slug = filename.replace(/\.mdx?$/i, '');
        const source = readFileSync(path.join(directory, filename), 'utf8');
        const archived =
          slug.startsWith('ai-news-briefing-') ||
          /^status:\s*['"]?archived_unverified['"]?\s*$/m.test(source) ||
          /^(?:archive|archived):\s*true\s*$/m.test(source);

        return archived ? [`/blog/${slug}`] : [];
      });
  })
);

const hasExternalScripts = false;
const whenExternalScripts = (items: (() => AstroIntegration) | (() => AstroIntegration)[] = []) =>
  hasExternalScripts ? (Array.isArray(items) ? items.map((item) => item()) : [items()]) : [];

const shouldIncludeInSitemap = (page: string) => {
  const pathname = new URL(page).pathname.replace(/\/+$/, '') || '/';

  return (
    !/^\/tag(?:\/|$)/.test(pathname) &&
    !archivedBlogPaths.has(pathname) &&
    !/^\/category\/ai-news(?:\/|$)/.test(pathname)
  );
};

export default defineConfig({
  output: 'static',
  trailingSlash: 'always',

  i18n: {
    locales: ['en', 'ja', 'ko', 'ru', 'es', 'pt', 'fr'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },

  integrations: [
    tailwind({
      applyBaseStyles: false,
    }),
    sitemap({
      filter: shouldIncludeInSitemap,
      i18n: {
        defaultLocale: 'en',
        locales: {
          en: 'en-US',
          ja: 'ja-JP',
          ko: 'ko-KR',
          ru: 'ru-RU',
          es: 'es-ES',
          pt: 'pt-BR',
          fr: 'fr-FR',
        },
      },
    }),
    mdx(),
    icon({
      include: {
        tabler: ['*'],
        'flat-color-icons': [
          'template',
          'gallery',
          'approval',
          'document',
          'advertising',
          'currency-exchange',
          'voice-presentation',
          'business-contact',
          'database',
        ],
      },
    }),

    ...whenExternalScripts(() =>
      partytown({
        config: { forward: ['dataLayer.push'] },
      })
    ),

    compress({
      CSS: true,
      HTML: {
        'html-minifier-terser': {
          removeAttributeQuotes: false,
        },
      },
      Image: false,
      JavaScript: true,
      SVG: false,
      Logger: 1,
    }),

    astrowind({
      config: './src/config.yaml',
    }),
  ],

  image: {
    domains: ['cdn.pixabay.com'],
  },

  markdown: {
    remarkPlugins: [readingTimeRemarkPlugin, blogPostHeadingsRemarkPlugin],
    rehypePlugins: [responsiveTablesRehypePlugin, lazyImagesRehypePlugin],
  },

  vite: {
    resolve: {
      alias: {
        '~': path.resolve(__dirname, './src'),
      },
    },
  },
});
