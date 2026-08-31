import { getBaseRoute, getLangFromUrl, getLocalizedRoutePath, type Lang } from './routing';

export function getLocalizedPath(path: string, lang: Lang): string {
  return getLocalizedRoutePath(path, lang);
}

export function removeLangPrefix(path: string): string {
  return getBaseRoute(path);
}

export function getLangFromPath(path: string): Lang {
  return getLangFromUrl(new URL(path, 'https://cinagroup.com'));
}
