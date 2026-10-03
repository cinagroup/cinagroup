import { format } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { enUS, zhCN, ja, ko, ru, es, ptBR, fr } from 'date-fns/locale';
import type { PublicPostLocale } from './public-post.ts';

export interface CmsBlogDisplaySettings {
  postsPerPage: number;
  dateFormat: string;
  timezone: string;
}
export interface CmsBlogPagination {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  canonicalHref: string;
  previousHref?: string;
  nextHref?: string;
}
const locales = { en: enUS, zh: zhCN, ja, ko, ru, es, pt: ptBR, fr };
const DEFAULTS: CmsBlogDisplaySettings = { postsPerPage: 6, dateFormat: 'MMMM d, yyyy', timezone: 'Asia/Singapore' };

/** Native settings are untyped persisted input; malformed display preferences never hide articles. */
export function cmsBlogDisplaySettings(value: unknown): CmsBlogDisplaySettings {
  const settings =
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const result = { ...DEFAULTS };
  if (
    typeof settings.postsPerPage === 'number' &&
    Number.isInteger(settings.postsPerPage) &&
    settings.postsPerPage >= 1 &&
    settings.postsPerPage <= 100
  )
    result.postsPerPage = settings.postsPerPage;
  if (
    typeof settings.dateFormat === 'string' &&
    settings.dateFormat.trim() &&
    settings.dateFormat.length <= 80 &&
    ![...settings.dateFormat].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    try {
      format(new Date('2026-01-23T00:00:00Z'), settings.dateFormat);
      result.dateFormat = settings.dateFormat;
    } catch {
      /* Unsupported tokens retain the existing safe format. */
    }
  }
  if (typeof settings.timezone === 'string' && settings.timezone.length <= 100) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: settings.timezone }).format(0);
      result.timezone = settings.timezone;
    } catch {
      /* Invalid time zones retain the configured local default. */
    }
  }
  return result;
}

export function formatCmsBlogDate(date: Date, locale: PublicPostLocale, settings: CmsBlogDisplaySettings): string {
  if (!Number.isFinite(date.getTime())) return '';
  try {
    return format(new TZDate(date.getTime(), settings.timezone), settings.dateFormat, { locale: locales[locale] });
  } catch {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: DEFAULTS.timezone,
    }).format(date);
  }
}

/** Query pagination applies only to the CMS list after publication/locale/collision filtering. */
export function paginateCmsBlogPosts<T>(
  posts: T[],
  locale: PublicPostLocale,
  requestUrl: string,
  settings: CmsBlogDisplaySettings
): { posts: T[]; pagination: CmsBlogPagination } {
  const path = locale === 'en' ? '/blog/' : `/${locale}/blog/`;
  const rawPage = new URL(requestUrl).searchParams.get('page');
  const requestedPage = rawPage && /^[1-9]\d{0,6}$/.test(rawPage) ? Number(rawPage) : 1;
  const totalPages = Math.max(1, Math.ceil(posts.length / settings.postsPerPage));
  const page = Math.min(requestedPage, totalPages);
  const href = (number: number) => `${path}${number > 1 ? `?page=${number}` : ''}`;
  return {
    posts: posts.slice((page - 1) * settings.postsPerPage, page * settings.postsPerPage),
    pagination: {
      page,
      totalPages,
      total: posts.length,
      pageSize: settings.postsPerPage,
      canonicalHref: href(page),
      previousHref: page > 1 ? href(page - 1) : undefined,
      nextHref: page < totalPages ? href(page + 1) : undefined,
    },
  };
}
