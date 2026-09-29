import handler, { createScheduledHandler, PluginBridge } from '@emdash-cms/cloudflare/worker';
import {
  fetchWithPreviewAdminAccess,
  isAstroPrerenderRequest,
  isIsolatedPreviewHostname,
} from './emdash-preview-access';
import { fetchLegacyArticleAsset, type LegacyAssetFetcher } from './emdash/legacy-article-asset';

export { PluginBridge };

const astroFetch = handler.fetch;

if (!astroFetch) {
  throw new Error('EmDash Worker fetch handler is missing');
}

export default {
  ...handler,
  async fetch(request, env, ctx) {
    if (!isIsolatedPreviewHostname(request.url) && !isAstroPrerenderRequest(request.url)) {
      return new Response('Preview Worker hostname mismatch', {
        status: 421,
        headers: {
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      });
    }
    const previewEnv = env as CloudflareEnv & { EMDASH_PREVIEW_ADMIN_PASSWORD?: string };
    const response = await fetchWithPreviewAdminAccess(
      request,
      previewEnv.EMDASH_PREVIEW_ADMIN_PASSWORD,
      async (forwarded) => {
        const assets = (env as unknown as { ASSETS: LegacyAssetFetcher }).ASSETS;
        const legacyArticle = await fetchLegacyArticleAsset(forwarded, assets);
        return legacyArticle ?? astroFetch(forwarded as typeof request, env, ctx);
      }
    );
    const headers = new Headers(response.headers);
    const existingRobots = headers.get('X-Robots-Tag');
    headers.set('X-Robots-Tag', existingRobots ? `${existingRobots}, noindex, nofollow` : 'noindex, nofollow');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
  scheduled: createScheduledHandler(),
} satisfies ExportedHandler<CloudflareEnv>;
