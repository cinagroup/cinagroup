import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getEmDashCollection } from 'emdash';

import { respondWithPublicBlogIndex } from '~/emdash/public-blog-index';

export const prerender = false;

// Astro otherwise maps HEAD to GET, which would query the CMS for a bodyless asset response.
export const HEAD: APIRoute = ({ request }) => (env as CloudflareEnv & { ASSETS: Fetcher }).ASSETS.fetch(request);

export const GET: APIRoute = ({ request }) =>
  respondWithPublicBlogIndex(request, 'en', (env as CloudflareEnv & { ASSETS: Fetcher }).ASSETS, () =>
    getEmDashCollection('posts', {
      locale: 'en',
      status: 'published',
      orderBy: { published_at: 'desc' },
      limit: 100,
    })
  );
