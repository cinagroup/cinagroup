import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getEmDashCollection } from 'emdash';

import { SITE } from 'astrowind:config';
import { cmsSitemapXml, listDiscoverableCmsPosts } from '~/emdash/public-discovery';
import { PUBLIC_POST_LOCALES } from '~/emdash/public-post';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    const assets = (env as CloudflareEnv & { ASSETS: Fetcher }).ASSETS;
    const byLocale = await Promise.all(
      PUBLIC_POST_LOCALES.map((locale) =>
        listDiscoverableCmsPosts(locale, request.url, assets, (cursor) =>
          getEmDashCollection('posts', {
            locale,
            status: 'published',
            orderBy: { published_at: 'desc' },
            limit: 100,
            cursor,
          })
        )
      )
    );

    return new Response(cmsSitemapXml(byLocale.flat(), SITE.site), {
      headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Unable to build the published EmDash sitemap', error);
    return new Response('Content unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
