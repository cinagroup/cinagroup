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
import { isCmsOnlyBlogIndexPath } from './src/emdash/public-discovery';

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

/** Astrowind configures trailingSlash from SITE; run after it so native EmDash routes accept their bare URLs. */
const emdashNativeRouteCompatibility = (): AstroIntegration => ({
  name: 'emdash-native-route-compatibility',
  hooks: {
    'astro:config:setup': ({ updateConfig }) => {
      updateConfig({ trailingSlash: 'ignore' });
    },
    'astro:config:done': ({ config }) => {
      if (config.trailingSlash !== 'ignore' || config.build.format !== 'directory') {
        throw new Error('EmDash native routes require trailingSlash: ignore and directory-format static assets');
      }
    },
  },
});

/** Maps a localized pathname such as `/zh/blog/<slug>` back to `/blog/<slug>`. */
const stripLocalePrefix = (pathname: string): string => {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 1 && siteLocales.includes(segments[0])) segments.shift();
  return `/${segments.join('/')}`;
};

const shouldIncludeInSitemap = (page: string) => {
  const originalPathname = new URL(page).pathname.replace(/\/+$/, '') || '/';
  if (isCmsOnlyBlogIndexPath(originalPathname)) return false;
  const pathname = stripLocalePrefix(originalPathname);

  return (
    !/^\/(?:cms-preview|_emdash)(?:\/|$)/.test(pathname) &&
    !/^\/tag(?:\/|$)/.test(pathname) &&
    !archivedBlogPaths.has(pathname) &&
    !/^\/category\/ai-news(?:\/|$)/.test(pathname)
  );
};

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  trailingSlash: 'ignore',
  build: { format: 'directory' },

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
      siteUrl: 'https://cinagroup-emdash-preview.cinagroup.workers.dev',
      database: d1({ binding: 'DB' }),
      storage: r2({ binding: 'MEDIA' }),
      auth: {
        type: 'cloudflare-access',
        entrypoint: fileURLToPath(new URL('./src/emdash/cinaauth-access.ts', import.meta.url)).replaceAll('\\', '/'),
        config: { autoProvision: true, syncRoles: true },
      },
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
    emdashNativeRouteCompatibility(),
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
