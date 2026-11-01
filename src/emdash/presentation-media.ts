import type { MediaItem } from 'emdash';
import { presentationMedia, presentationText, type PresentationMedia } from './site-presentation-model.ts';
import { siteImageFromMedia } from './site-image.ts';

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
const dimension = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 32768 ? value : undefined;

async function readMedia(id: string): Promise<MediaItem | null> {
  const [{ MediaRepository }, { getDb }] = await Promise.all([import('emdash'), import('emdash/runtime')]);
  return new MediaRepository(await getDb()).findById(id);
}

/** Native editor ImageValues identify media by id; their URL/metadata snapshots are not authoritative. */
export function createPresentationMediaResolver(read: (id: string) => Promise<MediaItem | null> = readMedia) {
  return async (value: unknown): Promise<PresentationMedia | undefined> => {
    const image = record(value);
    if (!image || (image.provider !== undefined && image.provider !== 'local')) return undefined;
    // Keep older authored root URLs compatible, but never use them to bypass a failed native lookup.
    if (!('id' in image)) return presentationMedia(value);
    if (typeof image.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(image.id)) return undefined;
    try {
      const media = await read(image.id);
      const resolved = siteImageFromMedia({ id: image.id, provider: 'local' }, media);
      if (!resolved || !media) return undefined;
      return {
        url: resolved.src,
        alt: presentationText(image.alt) ?? presentationText(media.alt),
        width: dimension(media.width),
        height: dimension(media.height),
        contentType: media.mimeType,
      };
    } catch {
      return undefined;
    }
  };
}

/** Read afresh for each request so publishing a media edit never keeps an isolate's old metadata. */
export const resolvePresentationMedia = createPresentationMediaResolver();
