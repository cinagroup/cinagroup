import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getEmDashCollection } from 'emdash';

import { isActiveBlogIndexLocale, respondWithPublicBlogIndex } from '~/emdash/public-blog-index';

export const prerender = false;

export const HEAD: APIRoute = ({ request, params }) => {
  if (!params.lang || params.lang === 'en' || !isActiveBlogIndexLocale(params.lang)) {
    return new Response(null, { status: 404 });
  }
  return (env as CloudflareEnv & { ASSETS: Fetcher }).ASSETS.fetch(request);
};

export const GET: APIRoute = ({ request, params }) => {
  const locale = params.lang;
  if (!locale || locale === 'en' || !isActiveBlogIndexLocale(locale)) {
    return new Response('Not found', { status: 404 });
  }

  return respondWithPublicBlogIndex(request, locale, (env as CloudflareEnv & { ASSETS: Fetcher }).ASSETS, () =>
    getEmDashCollection('posts', {
      locale,
      status: 'published',
      orderBy: { published_at: 'desc' },
      limit: 100,
    })
  );
};
