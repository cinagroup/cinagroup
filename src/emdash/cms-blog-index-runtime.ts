import { env } from 'cloudflare:workers';
import { getEmDashCollection } from 'emdash';

import { loadCmsBlogIndex } from './cms-blog-index.ts';
import type { AssetFetcher, PublicPostLocale } from './public-post.ts';

/** Load before the Astro page starts rendering so it can set status and headers. */
export async function loadCmsBlogIndexFromRuntime(locale: PublicPostLocale, requestUrl: string) {
  const result = await loadCmsBlogIndex(
    locale,
    requestUrl,
    (env as unknown as { ASSETS: AssetFetcher }).ASSETS,
    (cursor) =>
      getEmDashCollection('posts', {
        locale,
        status: 'published',
        orderBy: { published_at: 'desc' },
        limit: 100,
        cursor,
      })
  );
  if (result.error) console.error('Unable to load the published EmDash blog index', result.error);
  return result;
}
