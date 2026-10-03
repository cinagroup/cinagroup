import {
  isPublicPostLocale,
  isPublicPostSlug,
  publicPostFromEntry,
  publicPostPath,
  type PublicPost,
  type PublicPostLocale,
} from './public-post.ts';

type CmsEntry = { data: Record<string, unknown> };
type CmsPage = { entries: CmsEntry[]; nextCursor?: string; error?: Error };
type Assets = { fetch(request: Request): Promise<Response> };
type LoadPage = (cursor?: string) => Promise<CmsPage>;

const MAX_PAGES = 500;
const MAX_SITEMAP_URLS = 50_000;
const CMS_ONLY_BLOG_INDEX_LOCALES = ['ko', 'ru', 'es', 'pt', 'fr'] as const;

/** These indexes become discoverable only when approved CMS content makes them indexable. */
export function isCmsOnlyBlogIndexPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '');
  return CMS_ONLY_BLOG_INDEX_LOCALES.some((locale) => normalized === `/${locale}/blog`);
}

// This is the live cinagroup.com response observed before the Worker cutover.
// The checked-in Pages asset is older and lacks its sitemap declaration.
export const PRODUCTION_ROBOTS_BODY = 'User-agent: *\nDisallow:\n\nSitemap: https://cinagroup.com/sitemap-index.xml';

/** Enumerate only independently approved, exact-locale public routes. */
export async function listDiscoverableCmsPosts(
  locale: PublicPostLocale,
  requestUrl: string,
  assets: Assets,
  loadPage: LoadPage,
  maxSelected = Number.POSITIVE_INFINITY
): Promise<PublicPost[]> {
  if (!isPublicPostLocale(locale)) throw new Error('Unsupported public post locale');

  const selected: PublicPost[] = [];
  const seenPaths = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
    const page = await loadPage(cursor);
    if (page.error) throw page.error;

    for (const entry of page.entries) {
      const slug = typeof entry.data.slug === 'string' ? entry.data.slug : '';
      const post = publicPostFromEntry(entry, locale, slug, { isPreview: false });
      if (!post || post.seo?.noIndex) continue;

      const path = publicPostPath(post.locale, post.slug);
      if (seenPaths.has(path)) continue;
      seenPaths.add(path);

      // The public article route gives a prerendered legacy path precedence.
      const legacyResponse = await assets.fetch(new Request(new URL(path, requestUrl)));
      const hasLegacyAsset = legacyResponse.status !== 404;
      await legacyResponse.body?.cancel();
      if (hasLegacyAsset) continue;

      selected.push(post);
      if (selected.length >= maxSelected) return selected;
    }

    if (!page.nextCursor) return selected;
    if (page.entries.length === 0 || seenCursors.has(page.nextCursor)) {
      throw new Error('EmDash published-post pagination did not advance');
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  throw new Error('EmDash published-post pagination exceeded the safe page limit');
}

export function cmsPostsToRssItems(posts: PublicPost[]) {
  return posts.map((post) => ({
    link: publicPostPath(post.locale, post.slug),
    title: post.title,
    description: post.excerpt,
    ...(post.publishDate ? { pubDate: post.publishDate } : {}),
  }));
}

function escapeXml(value: string): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

export function cmsSitemapXml(posts: PublicPost[], site: string): string {
  // The caller supplies the same approved, exact-locale, collision-free inventory
  // as the public index. Empty/noindex native indexes never enter the static map.
  const indexPaths = CMS_ONLY_BLOG_INDEX_LOCALES.filter((locale) => posts.some((post) => post.locale === locale)).map(
    (locale) => `/${locale}/blog/`
  );
  if (posts.length + indexPaths.length > MAX_SITEMAP_URLS) {
    throw new Error('EmDash sitemap exceeds the 50,000 URL limit');
  }
  const base = new URL(site);
  if (base.protocol !== 'https:') throw new Error('Public sitemap requires an HTTPS site URL');
  const uniquePaths = new Set<string>();
  const urls = posts.map((post) => {
    if (!isPublicPostLocale(post.locale)) throw new Error('Unsupported sitemap post locale');
    if (typeof post.slug !== 'string' || !isPublicPostSlug(post.slug)) throw new Error('Invalid sitemap post slug');
    const path = publicPostPath(post.locale, post.slug);
    if (uniquePaths.has(path)) throw new Error(`Duplicate public sitemap path: ${path}`);
    uniquePaths.add(path);
    const loc = escapeXml(new URL(path, base).href);
    return `<url><loc>${loc}</loc></url>`;
  });
  for (const path of indexPaths) {
    const loc = escapeXml(new URL(path, base).href);
    urls.push(`<url><loc>${loc}</loc></url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;
}

export function robotsBody(hasPublishedCmsPosts: boolean, site: string): string {
  const base = new URL(site);
  if (base.protocol !== 'https:') throw new Error('Public robots requires an HTTPS site URL');
  const productionBody = `User-agent: *\nDisallow:\n\nSitemap: ${new URL('/sitemap-index.xml', base).href}`;
  if (!hasPublishedCmsPosts) return productionBody;
  return `${productionBody}\nSitemap: ${new URL('/sitemap-emdash.xml', base).href}`;
}
