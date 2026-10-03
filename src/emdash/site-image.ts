import type { ImageValue, MediaItem } from 'emdash';
import { safeHomeHref } from './home-content.ts';

export interface SiteImage {
  src: string;
  width: number;
  height: number;
  objectPosition?: string;
}

function dimension(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 32768 ? value : fallback;
}

function focal(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : undefined;
}

/** Local ImageValue metadata is cached: resolve its current ready media record before rendering. */
export function siteImageFromMedia(image: ImageValue, media: MediaItem | null): SiteImage | undefined {
  if (
    !media ||
    media.id !== image.id ||
    media.status !== 'ready' ||
    !['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml'].includes(media.mimeType)
  )
    return undefined;
  const key = media.storageKey;
  if (!key || !/^[\p{L}\p{M}\p{N}._~+ /-]+$/u.test(key)) return undefined;
  const segments = key.split('/');
  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..') ||
    ['backups', 'transfers'].includes(segments[0].toLowerCase())
  )
    return undefined;
  const x = focal(media.focalX) ?? focal(image.focalX);
  const y = focal(media.focalY) ?? focal(image.focalY);
  return {
    src: `/_emdash/api/media/file/${encodeURI(key)}`,
    width: dimension(media.width, 1536),
    height: dimension(media.height, 1024),
    ...((x !== undefined || y !== undefined) && { objectPosition: `${(x ?? 0.5) * 100}% ${(y ?? 0.5) * 100}%` }),
  };
}

async function readMedia(id: string): Promise<MediaItem | null> {
  const [{ MediaRepository }, { getDb }] = await Promise.all([import('emdash'), import('emdash/runtime')]);
  return new MediaRepository(await getDb()).findById(id);
}

/** No isolate-level cache: an admin media/focal-point edit is visible on the next request. */
export function createSiteImageResolver(read: (id: string) => Promise<MediaItem | null> = readMedia) {
  const requests = new WeakMap<object, Map<string, Promise<MediaItem | null>>>();
  return async (image: ImageValue | string, fallback: string, request?: object): Promise<SiteImage> => {
    const original: SiteImage = {
      src: safeHomeHref(fallback) ?? '/images/flexina/city-workspace.webp',
      width: 1536,
      height: 1024,
    };
    if (typeof image === 'string') return { ...original, src: safeHomeHref(image) ?? original.src };
    if ((image.provider !== undefined && image.provider !== 'local') || !/^[A-Za-z0-9_-]{1,100}$/.test(image.id))
      return original;
    try {
      let media: Promise<MediaItem | null>;
      if (request) {
        let cache = requests.get(request);
        if (!cache) {
          cache = new Map();
          requests.set(request, cache);
        }
        media = cache.get(image.id) ?? read(image.id);
        cache.set(image.id, media);
      } else media = read(image.id);
      return siteImageFromMedia(image, await media) ?? original;
    } catch {
      return original;
    }
  };
}

export const resolveSiteImage = createSiteImageResolver();
