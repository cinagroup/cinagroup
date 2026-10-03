import type { EnglishPageSlug } from '../data/site/english-page-defaults.ts';

export type EnglishTextCopy<T extends Record<string, string>> = { [K in keyof T]: string };
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

/** Text is always rendered through Astro escaping, and markup is not an editing format. */
function plainText(value: unknown, maximum = 6000): string | undefined {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[<>]/.test(value)) return undefined;
  if (
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
    })
  )
    return undefined;
  return value;
}

/** Rows bind only to existing text locations; labels, URLs and arbitrary keys never become page props. */
export function mapEnglishPageText<T extends Record<string, string>>(
  dataValue: unknown,
  defaults: T
): EnglishTextCopy<T> {
  const copy: Record<string, string> = { ...defaults };
  const data = record(dataValue);
  if (!data) return copy as EnglishTextCopy<T>;
  if (Object.hasOwn(defaults, 'metadata_title')) {
    const title = plainText(data.title, 240);
    if (title !== undefined) copy.metadata_title = title;
  }
  if (!Array.isArray(data.texts)) return copy as EnglishTextCopy<T>;
  const rows = new Map<string, string>();
  const duplicates = new Set<string>();
  for (const value of data.texts) {
    const row = record(value);
    const key = typeof row?.key === 'string' ? row.key : undefined;
    if (!key || key === 'metadata_title' || !Object.hasOwn(defaults, key)) continue;
    if (rows.has(key)) duplicates.add(key);
    const text = plainText(row?.value);
    if (text !== undefined) rows.set(key, text);
  }
  for (const [key, text] of rows) if (!duplicates.has(key)) copy[key] = text;
  return copy as EnglishTextCopy<T>;
}

export function englishPageTextFromEntry<T extends Record<string, string>>(
  resultValue: unknown,
  slug: EnglishPageSlug,
  defaults: T
): EnglishTextCopy<T> | undefined {
  const result = record(resultValue);
  const data = record(record(result?.entry)?.data);
  if (
    !result ||
    result.error ||
    result.fallbackLocale ||
    !data ||
    (data.status !== 'published' && !(result.isPreview === true && data.status === 'draft')) ||
    data.locale !== 'en' ||
    data.slug !== slug
  )
    return undefined;
  return mapEnglishPageText(data, defaults);
}

export interface EnglishTextContext {
  url: URL;
  locals: object;
  isPrerendered?: boolean;
  response?: { headers: Headers };
}
export type EnglishTextReader = (slug: EnglishPageSlug, context: EnglishTextContext) => Promise<unknown>;

/** Only EmDash-verified preview/edit context enables drafts; URL parameters alone never do. */
export function createEnglishPageTextLoader(read: EnglishTextReader) {
  const requests = new WeakMap<object, Map<EnglishPageSlug, Promise<Record<string, string>>>>();
  return <T extends Record<string, string>>(
    context: EnglishTextContext,
    slug: EnglishPageSlug,
    defaults: T,
    registerHint?: (hint: unknown) => void
  ): Promise<EnglishTextCopy<T>> => {
    if (context.isPrerendered || context.url.pathname.replace(/\/+$/, '') !== `/${slug}`)
      return Promise.resolve({ ...defaults });
    let pages = requests.get(context.locals);
    if (!pages) {
      pages = new Map();
      requests.set(context.locals, pages);
    }
    const existing = pages.get(slug);
    if (existing) return existing as Promise<EnglishTextCopy<T>>;
    const promise = (async () => {
      try {
        const resultValue = await read(slug, context);
        const result = record(resultValue);
        if (result?.isPreview) {
          context.response?.headers.set('X-Robots-Tag', 'noindex, nofollow');
          context.response?.headers.set('Cache-Control', 'private, no-store');
        }
        const copy = englishPageTextFromEntry(resultValue, slug, defaults);
        if (copy && result?.cacheHint) registerHint?.(result.cacheHint);
        return copy ?? { ...defaults };
      } catch {
        return { ...defaults };
      }
    })();
    pages.set(slug, promise);
    return promise;
  };
}
