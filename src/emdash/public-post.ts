import { validatePostPublication } from './editorial-policy.ts';

// The pilot has public blog indexes only in these locales. Extend this list
// together with index routes before publishing CMS content in other languages.
export const PUBLIC_POST_LOCALES = ['en', 'zh', 'ja'] as const;

export type PublicPostLocale = (typeof PUBLIC_POST_LOCALES)[number];

export interface PublicPost {
  slug: string;
  locale: PublicPostLocale;
  title: string;
  excerpt: string;
  content: unknown[];
  author?: string;
  publishDate?: Date;
}

const POST_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isPublicPostLocale(value: string): value is PublicPostLocale {
  return PUBLIC_POST_LOCALES.some((locale) => locale === value);
}

export function isPublicPostSlug(value: string): boolean {
  return POST_SLUG.test(value);
}

export function publicPostPath(locale: PublicPostLocale, slug: string): string {
  return `${locale === 'en' ? '' : `/${locale}`}/blog/${slug}/`;
}

/** Worker-first routing must defer to a prerendered legacy article when it exists. */
export async function findLegacyArticle(
  request: Request,
  assets: { fetch(request: Request): Promise<Response> }
): Promise<Response | undefined> {
  const response = await assets.fetch(request);
  return response.status === 404 ? undefined : response;
}

function optionalText(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

function validDate(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.valueOf()) ? undefined : value;
  if (typeof value !== 'string' || !value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

/** Only the exact published locale and slug may become a public route. */
export function publicPostFromEntry(
  entry: { data: Record<string, unknown> } | null,
  locale: string,
  slug: string,
  options: { isPreview: boolean; fallbackLocale?: string }
): PublicPost | undefined {
  if (
    !entry ||
    !isPublicPostLocale(locale) ||
    !isPublicPostSlug(slug) ||
    options.isPreview ||
    options.fallbackLocale ||
    entry.data.status !== 'published' ||
    entry.data.slug !== slug ||
    entry.data.locale !== locale ||
    validatePostPublication(entry) !== undefined
  ) {
    return undefined;
  }

  const title = optionalText(entry.data.title);
  if (!title) return undefined;

  return {
    slug,
    locale,
    title,
    excerpt: optionalText(entry.data.excerpt) ?? optionalText(entry.data.description) ?? '',
    content: Array.isArray(entry.data.content) ? entry.data.content : [],
    author: optionalText(entry.data.author_name),
    publishDate: validDate(entry.data.publish_date) ?? validDate(entry.data.publishedAt),
  };
}
