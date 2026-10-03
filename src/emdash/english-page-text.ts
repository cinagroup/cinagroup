import type { APIContext } from 'astro';
import type { CacheHint } from 'emdash';
import { getPublishedPageCopy } from './published-page-copy.ts';
import type { EnglishPageSlug } from '../data/site/english-page-defaults.ts';
import { createEnglishPageTextLoader, type EnglishTextContext } from './english-page-text-model.ts';

const load = createEnglishPageTextLoader(async (slug, context) => {
  const { getEmDashEntry } = await import('emdash');
  const result = await getEmDashEntry('page_english', slug, { locale: 'en' });
  // Reuse the same read to register native SEO and preview cache boundaries.
  // The English text repeater itself is mapped by the stricter text-only model.
  await getPublishedPageCopy(context, 'page_english', slug, {}, async () => result);
  return result;
});

export function loadEnglishPageText<T extends Record<string, string>>(
  context: Pick<APIContext, 'url' | 'locals' | 'isPrerendered' | 'cache'> & Pick<EnglishTextContext, 'response'>,
  slug: EnglishPageSlug,
  defaults: T
) {
  return load(context, slug, defaults, (hint) => {
    if (context.cache?.enabled) context.cache.set(hint as CacheHint);
  });
}
