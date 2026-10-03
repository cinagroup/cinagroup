import { MediaRepository } from 'emdash';
import { getDb } from 'emdash/runtime';
import type { PublicPostSeo } from './post-seo.ts';

/** SEO selections store a media database ID; public files use its actual storage key. */
export async function resolvePostSeoImage(seo: PublicPostSeo | undefined): Promise<string | undefined> {
  if (seo?.image) return seo.image;
  if (!seo?.imageMediaId) return undefined;
  try {
    const media = await new MediaRepository(await getDb()).findById(seo.imageMediaId);
    const key = media?.storageKey;
    if (!media || media.status !== 'ready' || !key || !/^[\p{L}\p{M}\p{N}._~+ /-]+$/u.test(key)) return undefined;
    const segments = key.split('/');
    if (
      segments.some((part) => !part || part === '.' || part === '..') ||
      ['backups', 'transfers'].includes(segments[0].toLowerCase())
    )
      return undefined;
    return `https://cinagroup.com/_emdash/api/media/file/${encodeURI(key)}`;
  } catch {
    return undefined;
  }
}
