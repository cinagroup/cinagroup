import handler, { createScheduledHandler, PluginBridge } from '@emdash-cms/cloudflare/worker';
import {
  fetchWithPreviewAdminAccess,
  isAstroPrerenderRequest,
  isIsolatedPreviewHostname,
} from './emdash-preview-access';
import { fetchLegacyArticleAsset, type LegacyAssetFetcher } from './emdash/legacy-article-asset';
import { createPublicResponseParity, fetchPublicCanonicalRedirect } from './emdash/public-response-parity';
import publicRedirects from '../public/_redirects?raw';
import publicHeaders from '../public/_headers?raw';

export { PluginBridge };

const astroFetch = handler.fetch;
const publicParity = createPublicResponseParity(publicRedirects, publicHeaders);

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
        if (isAstroPrerenderRequest(forwarded.url)) return astroFetch(forwarded as typeof request, env, ctx);
        const assets = (env as unknown as { ASSETS: LegacyAssetFetcher }).ASSETS;
        const redirect = publicParity.redirect(forwarded) ?? (await fetchPublicCanonicalRedirect(forwarded, assets));
        if (redirect) return redirect;
        const legacyArticle = await fetchLegacyArticleAsset(forwarded, assets);
        return legacyArticle ?? astroFetch(forwarded as typeof request, env, ctx);
      }
    );
    const result = publicParity.applyHeaders(request, new Response(response.body, response));
    const existingRobots = result.headers.get('X-Robots-Tag');
    result.headers.set('X-Robots-Tag', existingRobots ? existingRobots + ', noindex, nofollow' : 'noindex, nofollow');
    return result;
  },
  scheduled: createScheduledHandler(),
} satisfies ExportedHandler<CloudflareEnv>;
