export type LegacyAssetFetcher = { fetch(request: Request): Promise<Response> };

const LEGACY_ARTICLE_ROUTE = /^\/(?:(?:zh|ja)\/)?blog\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/;

/** A prerendered legacy article lives at this trailing-slash public route. */
export function isPotentialLegacyArticleUrl(requestUrl: string): boolean {
  const url = new URL(requestUrl);
  return LEGACY_ARTICLE_ROUTE.test(url.pathname);
}

/** Serve existing articles before Astro matches the new CMS slug route. */
export async function fetchLegacyArticleAsset(
  request: Request,
  assets: LegacyAssetFetcher
): Promise<Response | undefined> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return undefined;
  if (!isPotentialLegacyArticleUrl(request.url)) return undefined;

  // ASSETS applies Cloudflare's auto-trailing-slash HTML handling. The Worker
  // returns the binding response directly, before Astro's dynamic slug route.
  const response = await assets.fetch(request);
  if (response.status !== 404) return response;
  await response.body?.cancel();
  return undefined;
}
