import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import partytown from '@astrojs/partytown';
import icon from 'astro-icon';
import emdash from 'emdash/astro';
import { d1, r2 } from '@emdash-cms/cloudflare';
import type { AstroIntegration } from 'astro';

import astrowind from './vendor/integration';
import { editorialPolicyPlugin } from './src/emdash/editorial-policy';

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

    if (!existsSync(directory)) return [];

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

const siteLocales = ['en', 'zh', 'ja', 'ko', 'ru', 'es', 'pt', 'fr'];

/** Maps a localized pathname such as `/zh/blog/<slug>` back to `/blog/<slug>`. */
const stripLocalePrefix = (pathname: string): string => {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 1 && siteLocales.includes(segments[0])) segments.shift();
  return `/${segments.join('/')}`;
};

const shouldIncludeInSitemap = (page: string) => {
  const pathname = stripLocalePrefix(new URL(page).pathname.replace(/\/+$/, '') || '/');

  return (
    !/^\/tag(?:\/|$)/.test(pathname) &&
    !archivedBlogPaths.has(pathname) &&
    !/^\/category\/ai-news(?:\/|$)/.test(pathname)
  );
};

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  trailingSlash: 'always',

  i18n: {
    locales: ['en', 'zh', 'ja', 'ko', 'ru', 'es', 'pt', 'fr'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },

  integrations: [
    react(),
    emdash({
      database: d1({ binding: 'DB' }),
      storage: r2({ binding: 'MEDIA' }),
      plugins: [editorialPolicyPlugin()],
    }),
    sitemap({
      filter: shouldIncludeInSitemap,
      i18n: {
        defaultLocale: 'en',
        locales: {
          en: 'en-US',
          zh: 'zh-CN',
          ja: 'ja-JP',
          ko: 'ko-KR',
          ru: 'ru-RU',
          es: 'es-ES',
          pt: 'pt-BR',
          fr: 'fr-FR',
        },
      },
    }),
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
