import { getRequestContext, MediaRepository, OptionsRepository } from 'emdash';
import type { CacheHint, Database, MediaItem, MediaReference, SiteSettings } from 'emdash';
import { getDb } from 'emdash/runtime';
import type { Kysely } from 'kysely';

export interface FreshSiteSettingsResult {
  data: Partial<SiteSettings>;
  cacheHint: CacheHint;
}
const requests = new WeakMap<object, Promise<FreshSiteSettingsResult>>();
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

/** Match the site's public file path contract; storage namespaces never become theme URLs. */
function publicMediaUrl(key: string): string | undefined {
  if (!key || !/^[\p{L}\p{M}\p{N}._~+ /-]+$/u.test(key)) return undefined;
  const segments = key.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return undefined;
  if (['backups', 'transfers'].includes(segments[0].trim().toLowerCase())) return undefined;
  // encodeURI agrees with the public media access guard, including Unicode,
  // spaces and literal plus signs. Percent/query/hash characters are excluded.
  return `/_emdash/api/media/file/${encodeURI(key)}`;
}
const positiveInteger = (value: number | null): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;

/** Read only native public fields. Never expose arbitrary site-prefixed options. */
export async function readFreshSiteSettingsWithDb(db: Kysely<Database>): Promise<FreshSiteSettingsResult> {
  const values = await new OptionsRepository(db).getByPrefix('site:');
  const settings: Partial<SiteSettings> = {};
  for (const key of ['title', 'tagline', 'url', 'dateFormat', 'timezone'] as const) {
    const value = values.get(`site:${key}`);
    if (typeof value === 'string') settings[key] = value;
  }
  const postsPerPage = values.get('site:postsPerPage');
  if (typeof postsPerPage === 'number' && Number.isInteger(postsPerPage) && postsPerPage >= 1 && postsPerPage <= 100)
    settings.postsPerPage = postsPerPage;
  const rawSocial = record(values.get('site:social'));
  if (rawSocial) {
    settings.social = {};
    for (const key of ['twitter', 'github', 'facebook', 'instagram', 'linkedin', 'youtube'] as const) {
      if (typeof rawSocial[key] === 'string') settings.social[key] = rawSocial[key];
    }
  }
  const rawSeo = record(values.get('site:seo'));
  if (rawSeo) {
    settings.seo = {};
    for (const key of ['titleSeparator', 'robotsTxt', 'googleVerification', 'bingVerification'] as const) {
      if (typeof rawSeo[key] === 'string') settings.seo[key] = rawSeo[key];
    }
  }
  const media = new MediaRepository(db);
  const lookups = new Map<string, Promise<MediaItem | null>>();
  const resolveMedia = async (value: unknown): Promise<MediaReference | undefined> => {
    const reference = record(value);
    if (!reference || typeof reference.mediaId !== 'string' || !reference.mediaId) return undefined;
    const id = reference.mediaId;
    try {
      let pending = lookups.get(id);
      if (!pending) {
        pending = media.findById(id);
        lookups.set(id, pending);
      }
      const item = await pending;
      if (!item || item.status !== 'ready' || !item.mimeType.startsWith('image/')) return undefined;
      const url = publicMediaUrl(item.storageKey);
      if (!url) return undefined;
      // MediaReference stores only mediaId/alt. URL, MIME and dimensions always
      // come from the current ready row, never stale snapshots in options.
      return {
        mediaId: id,
        ...(typeof reference.alt === 'string' ? { alt: reference.alt } : {}),
        url,
        contentType: item.mimeType,
        ...(positiveInteger(item.width) !== undefined ? { width: positiveInteger(item.width) } : {}),
        ...(positiveInteger(item.height) !== undefined ? { height: positiveInteger(item.height) } : {}),
      };
    } catch {
      return undefined;
    }
  };
  const [logo, favicon, defaultOgImage] = await Promise.all([
    resolveMedia(values.get('site:logo')),
    resolveMedia(values.get('site:favicon')),
    resolveMedia(rawSeo?.defaultOgImage),
  ]);
  if (logo) settings.logo = logo;
  if (favicon) settings.favicon = favicon;
  if (defaultOgImage && settings.seo) settings.seo.defaultOgImage = defaultOgImage;
  return { data: settings, cacheHint: { tags: ['emdash:settings'] } };
}

/** Fresh across requests, single-flight only inside the current native request. */
export function getFreshSiteSettingsWithCacheHint(): Promise<FreshSiteSettingsResult> {
  const owner = getRequestContext();
  const existing = owner && requests.get(owner);
  if (existing) return existing;
  const pending = getDb()
    .then(readFreshSiteSettingsWithDb)
    .catch((error) => {
      if (owner) requests.delete(owner);
      throw error;
    });
  if (owner) requests.set(owner, pending);
  return pending;
}
