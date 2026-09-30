import handler, { createScheduledHandler, PluginBridge } from '@emdash-cms/cloudflare/worker';
import { isAstroPrerenderRequest, isIsolatedPreviewHostname } from './emdash-preview-access';
import { fetchWithCinaAuthAccess } from './emdash/cinaauth-access';
import { fetchLegacyArticleAsset, type LegacyAssetFetcher } from './emdash/legacy-article-asset';
import {
  canonicalizeCmsBlogResponse,
  createPublicResponseParity,
  fetchGeneratedSitemapAsset,
  fetchPublicCanonicalRedirect,
} from './emdash/public-response-parity';
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
    // Astro invokes these exact loopback endpoints only while prerendering.
    // They must remain ahead of runtime identity configuration and JWT checks.
    if (isAstroPrerenderRequest(request.url)) return astroFetch(request, env, ctx);
    if (!isIsolatedPreviewHostname(request.url)) {
      return new Response('Preview Worker hostname mismatch', {
        status: 421,
        headers: {
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      });
    }
    const response = await fetchWithCinaAuthAccess(request, async (forwarded) => {
      const assets = (env as unknown as { ASSETS: LegacyAssetFetcher }).ASSETS;
      const redirect = publicParity.redirect(forwarded) ?? (await fetchPublicCanonicalRedirect(forwarded, assets));
      if (redirect) return redirect;
      const staticSitemap = await fetchGeneratedSitemapAsset(forwarded, assets);
      if (staticSitemap) return staticSitemap;
      const legacyArticle = await fetchLegacyArticleAsset(forwarded, assets);
      if (legacyArticle) return legacyArticle;
      const rendered = await astroFetch(forwarded as typeof request, env, ctx);
      return canonicalizeCmsBlogResponse(forwarded, rendered);
    });
    const result = publicParity.applyHeaders(request, new Response(response.body, response));
    const existingRobots = result.headers.get('X-Robots-Tag');
    result.headers.set('X-Robots-Tag', existingRobots ? existingRobots + ', noindex, nofollow' : 'noindex, nofollow');
    return result;
  },
  scheduled: createScheduledHandler(),
} satisfies ExportedHandler<CloudflareEnv>;
