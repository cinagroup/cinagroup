import { defaultLang, type Lang } from './i18n';

export function getLocalizedPath(path: string, lang: Lang): string {
  if (lang === defaultLang) {
    return path;
  }
  return `/${lang}${path}`;
}

export function removeLangPrefix(path: string): string {
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'en') {
    return '/' + parts.slice(1).join('/');
  }
  return path;
}

export function getLangFromPath(path: string): Lang {
  const parts = path.split('/').filter(Boolean);
  if (parts[0] !== defaultLang && parts[0] in { en: 1, ja: 1, ko: 1, ru: 1, es: 1, pt: 1, fr: 1 }) {
    return parts[0] as Lang;
  }
  return defaultLang;
}
