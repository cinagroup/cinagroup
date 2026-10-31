export interface ArchiveVisit {
  postPath: string;
  archiveHref: string;
}

const MAX_URL_LENGTH = 4096;
const ARCHIVE_PATH = /^\/blog(?:\/[1-9]\d*)?\/?$/;
const ARCHIVE_POST_PATH = /^\/blog\/ai-news-briefing-[a-z0-9]+(?:-[a-z0-9]+)*\/?$/;

function sameOriginUrl(value: string | URL, origin: string): URL | undefined {
  const source = String(value);
  if (
    source.length > MAX_URL_LENGTH ||
    [...source].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || character === '\\'
    )
  )
    return undefined;
  try {
    const base = new URL(origin);
    const url = new URL(source, base.origin);
    if (
      !['http:', 'https:'].includes(base.protocol) ||
      base.username ||
      base.password ||
      url.origin !== base.origin ||
      url.protocol !== base.protocol ||
      url.username ||
      url.password
    )
      return undefined;
    return url;
  } catch {
    return undefined;
  }
}

/** Retain only a bounded English archive state, never an arbitrary return URL. */
export function blogArchiveReturnHref(value: string | URL, origin: string): string | undefined {
  const url = sameOriginUrl(value, origin);
  if (!url || !ARCHIVE_PATH.test(url.pathname)) return undefined;
  const query = url.searchParams.get('q')?.trim() ?? '';
  const month = url.searchParams.get('month') ?? '';
  const page = url.searchParams.get('archivePage') ?? '';
  const sort = url.searchParams.get('sort') ?? '';
  if (
    query.length > 300 ||
    (month && !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) ||
    (page && (!/^[1-9]\d*$/.test(page) || !Number.isSafeInteger(Number(page)))) ||
    (sort && sort !== 'newest' && sort !== 'oldest')
  )
    return undefined;

  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (month) params.set('month', month);
  if (page && Number(page) > 1) params.set('archivePage', page);
  if (sort === 'oldest') params.set('sort', sort);
  const path = url.pathname.replace(/\/?$/, '/');
  const search = params.toString();
  const hash = url.hash === '#archive-search-heading' ? url.hash : '';
  return `${path}${search ? `?${search}` : ''}${hash}`;
}

function archivePostPath(value: string | URL, origin: string): string | undefined {
  const url = sameOriginUrl(value, origin);
  if (!url || !ARCHIVE_POST_PATH.test(url.pathname)) return undefined;
  return url.pathname.replace(/\/?$/, '/');
}

/** Store only the selected article and its archive state; no article text is needed. */
export function createArchiveVisit(
  postUrl: string | URL,
  archiveUrl: string | URL,
  origin: string
): ArchiveVisit | undefined {
  const postPath = archivePostPath(postUrl, origin);
  const archiveHref = blogArchiveReturnHref(archiveUrl, origin);
  return postPath && archiveHref ? { postPath, archiveHref } : undefined;
}

/** Revalidate browser storage and bind the return link to the selected article. */
export function resolveArchiveVisit(value: unknown, currentPostUrl: string | URL, origin: string): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.postPath !== 'string' || typeof record.archiveHref !== 'string') return undefined;
  const visit = createArchiveVisit(record.postPath, record.archiveHref, origin);
  const currentPost = archivePostPath(currentPostUrl, origin);
  return visit && currentPost === visit.postPath ? visit.archiveHref : undefined;
}
