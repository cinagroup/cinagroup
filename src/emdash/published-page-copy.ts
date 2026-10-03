import type { CacheHint } from 'emdash';
import type { MetaData } from '../types';
import { publicPostSeo, type PublicPostSeo } from './post-seo.ts';
import { INNER_PAGE_COLLECTIONS, pageCopyFromEntry, type InnerPageCollection } from './page-copy-model.ts';

interface PageCopyContext {
  url: URL;
  locals?: object;
  isPrerendered?: boolean;
  cache?: { enabled?: boolean; set: (hint: CacheHint) => void };
  response?: { headers: Headers };
}
export interface PageCopyQueryResult {
  entry: unknown;
  isPreview: boolean;
  fallbackLocale?: string;
  cacheHint?: CacheHint;
  error?: Error;
}
type PageCopyReader = (collection: InnerPageCollection, slug: string, locale: string) => Promise<PageCopyQueryResult>;
const LOCALES = new Set(['en', 'zh', 'ja', 'ko', 'ru', 'es', 'pt', 'fr']);
const pageSeo = new WeakMap<object, PublicPostSeo>();
const owner = (context: PageCopyContext): object => context.locals ?? context;
function seoValue(entry: unknown): unknown {
  if (!entry || typeof entry !== 'object' || !('data' in entry)) return undefined;
  const data = entry.data;
  return data && typeof data === 'object' && 'seo' in data ? data.seo : undefined;
}

/** SEO edits change head metadata only; hero headings and controlled copy stay independent. */
export async function getPageCopyMetadata(
  context: PageCopyContext,
  defaults: MetaData,
  resolveImage?: (seo: PublicPostSeo) => Promise<string | undefined>
): Promise<MetaData> {
  const seo = pageSeo.get(owner(context));
  if (!seo) return { ...defaults };
  let image = seo.image;
  if (seo.imageMediaId) {
    const resolve =
      resolveImage ??
      (async (value: PublicPostSeo) => {
        const { resolvePostSeoImage } = await import('./post-seo-runtime.ts');
        return resolvePostSeoImage(value);
      });
    image = await resolve(seo);
  }
  return {
    ...defaults,
    ...(seo.title ? { title: seo.title } : {}),
    ...(seo.description ? { description: seo.description } : {}),
    ...(seo.canonical ? { canonical: seo.canonical } : {}),
    ...(image ? { openGraph: { ...defaults.openGraph, images: [{ url: image }] } } : {}),
    ...(seo.noIndex ? { robots: { ...defaults.robots, index: false, follow: false } } : {}),
  };
}

async function query(collection: InnerPageCollection, slug: string, locale: string): Promise<PageCopyQueryResult> {
  const { getEmDashEntry } = await import('emdash');
  return getEmDashEntry(collection, slug, { locale });
}

/** Request-time exact-locale content only; prerendered archives never open a build-time DB. */
export async function getPublishedPageCopy<T extends object>(
  context: PageCopyContext,
  collection: InnerPageCollection,
  slug: string,
  defaults: T,
  read: PageCopyReader = query
): Promise<T> {
  pageSeo.delete(owner(context));
  if (!INNER_PAGE_COLLECTIONS.includes(collection) || context.isPrerendered) return structuredClone(defaults);
  const segment = context.url.pathname.split('/').filter(Boolean)[0];
  const locale = LOCALES.has(segment) ? segment : 'en';
  try {
    const result = await read(collection, slug, locale);
    const copy = result.error ? undefined : pageCopyFromEntry(result.entry, locale, collection, slug, defaults, result);
    if (copy) {
      const seo = publicPostSeo(seoValue(result.entry));
      if (seo || result.isPreview) {
        pageSeo.set(owner(context), { ...seo, noIndex: result.isPreview === true || seo?.noIndex === true });
      }
    }
    if (context.cache?.enabled && result.cacheHint) context.cache.set(result.cacheHint);
    if (result.isPreview === true || pageSeo.get(owner(context))?.noIndex) {
      context.response?.headers.set('X-Robots-Tag', 'noindex, nofollow');
    }
    if (result.isPreview === true) {
      context.response?.headers.set('Cache-Control', 'private, no-store');
    }
    return copy ?? structuredClone(defaults);
  } catch {
    return structuredClone(defaults);
  }
}
