import { PUBLIC_POST_LOCALES, publicPostFromEntry, publicPostPath, type PublicPost } from './public-post.ts';

export const ACTIVE_BLOG_INDEX_LOCALES = PUBLIC_POST_LOCALES;
export type ActiveBlogIndexLocale = (typeof ACTIVE_BLOG_INDEX_LOCALES)[number];

type CmsEntry = { data: Record<string, unknown> };
type Assets = { fetch(request: Request): Promise<Response> };
type CmsResult = { entries: CmsEntry[]; error?: Error };

const LEGACY_LIST_SELECTOR = 'section[data-blog-collection="index"] ul.cg-blog-list';
const CMS_LIMIT = 20;

const sectionTitles: Record<ActiveBlogIndexLocale, string> = {
  en: 'Latest editorial posts',
  zh: '最新编辑文章',
  ja: '新着記事',
  ko: '최신 편집 기사',
  ru: 'Новые редакционные статьи',
  es: 'Últimos artículos editoriales',
  pt: 'Artigos editoriais recentes',
  fr: 'Derniers articles de la rédaction',
};

export function isActiveBlogIndexLocale(value: string): value is ActiveBlogIndexLocale {
  return ACTIVE_BLOG_INDEX_LOCALES.some((locale) => locale === value);
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

/** A CMS item may be listed only when its public URL does not belong to a legacy asset. */
export async function selectPublicCmsPosts(
  entries: CmsEntry[],
  locale: ActiveBlogIndexLocale,
  requestUrl: string,
  assets: Assets
): Promise<PublicPost[]> {
  const selected: PublicPost[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (selected.length >= CMS_LIMIT) break;
    const slug = typeof entry.data.slug === 'string' ? entry.data.slug : '';
    const post = publicPostFromEntry(entry, locale, slug, { isPreview: false });
    if (!post || seen.has(slug)) continue;
    seen.add(slug);

    const path = publicPostPath(locale, slug);
    const legacyResponse = await assets.fetch(new Request(new URL(path, requestUrl)));
    const hasLegacyAsset = legacyResponse.status !== 404;
    await legacyResponse.body?.cancel();
    if (!hasLegacyAsset) selected.push(post);
  }

  return selected;
}

/** Render only validated post fields, with all CMS text escaped for HTML insertion. */
export function renderPublicCmsSection(posts: PublicPost[], locale: ActiveBlogIndexLocale): string {
  if (posts.length === 0) return '';
  const items = posts
    .map((post) => {
      const path = publicPostPath(post.locale, post.slug);
      const date = post.publishDate;
      const dateMarkup = date
        ? `<time datetime="${date.toISOString()}">${escapeHtml(date.toLocaleDateString(locale))}</time>`
        : '';
      return `<li><article class="cg-blog-item" data-content-kind="editorial-summary" data-content-status="published" data-content-source="emdash"><div class="cg-blog-item-copy"><header><div class="cg-blog-meta">${dateMarkup}</div><h2><a class="cg-blog-title-link" href="${path}">${escapeHtml(post.title)}</a></h2></header>${post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : ''}</div></article></li>`;
    })
    .join('');
  return `<section class="cg-emdash-posts" data-blog-source="emdash" aria-label="${escapeHtml(sectionTitles[locale])}"><h2>${escapeHtml(sectionTitles[locale])}</h2><ul class="cg-blog-list">${items}</ul></section>`;
}

/** Pass through the original asset byte-for-byte until public CMS content exists. */
export async function respondWithPublicBlogIndex(
  request: Request,
  locale: ActiveBlogIndexLocale,
  assets: Assets,
  loadEntries: () => Promise<CmsResult>,
  createRewriter: () => HTMLRewriter = () => new HTMLRewriter()
): Promise<Response> {
  const original = await assets.fetch(request);
  if (original.status !== 200 && original.status !== 304) return original;

  try {
    const result = await loadEntries();
    if (result.error) throw result.error;
    const posts = await selectPublicCmsPosts(result.entries, locale, request.url, assets);
    if (posts.length === 0) return original;

    // A cached static 304 has no HTML body to rewrite. Only a visible CMS post
    // warrants a second, unconditional asset fetch; empty CMS keeps the 304.
    let base = original;
    if (original.status === 304) {
      const unconditional = new Request(request);
      unconditional.headers.delete('If-None-Match');
      unconditional.headers.delete('If-Modified-Since');
      base = await assets.fetch(unconditional);
      if (base.status !== 200) return original;
    }

    const section = renderPublicCmsSection(posts, locale);
    const transformed = createRewriter()
      .on(LEGACY_LIST_SELECTOR, {
        element(element) {
          element.before(section, { html: true });
        },
      })
      .transform(base);
    for (const name of ['Content-Length', 'ETag', 'Last-Modified']) transformed.headers.delete(name);
    transformed.headers.set('Cache-Control', 'no-store');
    return transformed;
  } catch (error) {
    console.error('Unable to add published EmDash posts to the blog index', error);
    return original;
  }
}
