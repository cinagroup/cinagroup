import type { APIContext } from 'astro';
import { getEmDashEntry, getMenuWithCacheHint, type CacheHint } from 'emdash';
import { getLangFromUrl } from '../i18n.ts';
import { createSitePresentationLoader } from './site-presentation-model.ts';
import { getFreshSiteSettingsWithCacheHint } from './fresh-site-settings.ts';
export type { SitePresentation, PresentationMenuItem } from './site-presentation-model.ts';

const load = createSitePresentationLoader({
  settings: getFreshSiteSettingsWithCacheHint,
  menu: (name, locale) => getMenuWithCacheHint(name, { locale, trailingSlash: 'always' }),
  profile: (locale) => getEmDashEntry('site_profile', 'site', { locale }),
});

export function loadSitePresentation(context: Pick<APIContext, 'locals' | 'url' | 'isPrerendered' | 'cache'>) {
  return load(context, getLangFromUrl(context.url), (hint) => {
    if (context.cache?.enabled) context.cache.set(hint as CacheHint);
  });
}
