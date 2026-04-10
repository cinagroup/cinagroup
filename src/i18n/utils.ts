import { defaultLang, type Lang } from './i18n';

export function getLocalizedPath(path: string, lang: Lang): string {
  if (lang === defaultLang) {
    return path;
  }
  return `/${lang}${path}`;
}

export function removeLangPrefix(path: string): string {
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'zh' || parts[0] === 'en') {
    return '/' + parts.slice(1).join('/');
  }
  return path;
}

export function getLangFromPath(path: string): Lang {
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'zh') return 'zh';
  return defaultLang;
}
