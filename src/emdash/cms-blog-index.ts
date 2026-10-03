import { listDiscoverableCmsPosts } from './public-discovery.ts';
import {
  cmsBlogDisplaySettings,
  paginateCmsBlogPosts,
  type CmsBlogDisplaySettings,
  type CmsBlogPagination,
} from './cms-blog-display.ts';
import type { AssetFetcher, PublicPost, PublicPostLocale } from './public-post.ts';

type CmsPage = { entries: { data: Record<string, unknown> }[]; nextCursor?: string; error?: Error };
type LoadPage = (cursor?: string) => Promise<CmsPage>;

export interface CmsBlogIndex {
  status: 200 | 503;
  posts: PublicPost[];
  indexable: boolean;
  error?: unknown;
  displaySettings?: CmsBlogDisplaySettings;
  pagination?: CmsBlogPagination;
}

/** Native indexes share the exact publication, locale and legacy-path rules of RSS and sitemap. */
export async function loadCmsBlogIndex(
  locale: PublicPostLocale,
  requestUrl: string,
  assets: AssetFetcher,
  loadPage: LoadPage,
  nativeSettings?: unknown | Promise<unknown>
): Promise<CmsBlogIndex> {
  try {
    const [posts, rawSettings] = await Promise.all([
      listDiscoverableCmsPosts(locale, requestUrl, assets, loadPage),
      Promise.resolve(nativeSettings).catch(() => undefined),
    ]);
    const displaySettings = cmsBlogDisplaySettings(rawSettings);
    return {
      status: 200,
      ...paginateCmsBlogPosts(posts, locale, requestUrl, displaySettings),
      displaySettings,
      indexable: posts.length > 0,
    };
  } catch (error) {
    // A partial list could conceal an unavailable or invalid cursor page.
    return { status: 503, posts: [], indexable: false, error };
  }
}

/** GET and HEAD expose the same caching and empty/error-page indexing policy. */
export function cmsBlogIndexHeaders(result: Pick<CmsBlogIndex, 'indexable'>): Headers {
  const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  if (!result.indexable) headers.set('X-Robots-Tag', 'noindex, follow');
  return headers;
}

/** HEAD reflects the same loaded publication state and status as GET, without a body. */
export function cmsBlogIndexHeadResponse(result: Pick<CmsBlogIndex, 'status' | 'indexable'>): Response {
  return new Response(null, {
    status: result.status,
    headers: cmsBlogIndexHeaders(result),
  });
}
