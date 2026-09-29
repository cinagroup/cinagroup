import { getRssString } from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getEmDashCollection } from 'emdash';

import { SITE, APP_BLOG } from 'astrowind:config';
import { cmsPostsToRssItems, listDiscoverableCmsPosts } from '~/emdash/public-discovery';
import { isPublicPostLocale } from '~/emdash/public-post';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const locale = params.lang;
  if (!APP_BLOG.isEnabled || !locale || locale === 'en' || !isPublicPostLocale(locale)) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const posts = await listDiscoverableCmsPosts(
      locale,
      request.url,
      (env as CloudflareEnv & { ASSETS: Fetcher }).ASSETS,
      (cursor) =>
        getEmDashCollection('posts', {
          locale,
          status: 'published',
          orderBy: { published_at: 'desc' },
          limit: 100,
          cursor,
        }),
      100
    );
    if (posts.length === 0) return new Response('Not found', { status: 404 });

    const rss = await getRssString({
      title: `${SITE.name} editorial posts (${locale})`,
      description: `Published ${locale} editorial posts from ${SITE.name}.`,
      site: import.meta.env.SITE,
      items: cmsPostsToRssItems(posts),
      customData: `<language>${locale}</language>`,
      trailingSlash: SITE.trailingSlash,
    });
    return new Response(rss, { headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(`Unable to load the ${locale} EmDash RSS feed`, error);
    return new Response('Content unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
