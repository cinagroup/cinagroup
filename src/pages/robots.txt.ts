import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getEmDashCollection } from 'emdash';

import { SITE } from 'astrowind:config';
import { listDiscoverableCmsPosts, robotsBody } from '~/emdash/public-discovery';
import { PUBLIC_POST_LOCALES } from '~/emdash/public-post';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  let hasPublishedCmsPosts = false;
  try {
    const assets = (env as CloudflareEnv & { ASSETS: Fetcher }).ASSETS;
    for (const locale of PUBLIC_POST_LOCALES) {
      const posts = await listDiscoverableCmsPosts(
        locale,
        request.url,
        assets,
        (cursor) =>
          getEmDashCollection('posts', {
            locale,
            status: 'published',
            orderBy: { published_at: 'desc' },
            limit: 100,
            cursor,
          }),
        1
      );
      if (posts.length > 0) {
        hasPublishedCmsPosts = true;
        break;
      }
    }
  } catch (error) {
    // Preserve the existing crawl rules when the CMS cannot be read.
    console.error('Unable to inspect published EmDash posts for robots.txt', error);
  }

  return new Response(robotsBody(hasPublishedCmsPosts, SITE.site), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
};
