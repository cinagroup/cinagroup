import type { Lang } from '../i18n/routing.ts';

/** Retired product pages keep a local destination for existing bookmarks. */
export function retiredProductRedirect(pathname: string): string | undefined {
  let path: string;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  const match = /^\/(?:(en|zh|ja|ko|ru|es|pt|fr)\/)?cinaclaw(?:\/|$)/i.exec(path);
  if (!match) return undefined;
  const locale = match[1]?.toLowerCase();
  return locale && locale !== 'en' ? `/${locale}/` : '/';
}

export function isRetiredProductLink(href: string): boolean {
  try {
    const url = new URL(href, 'https://cinagroup.com');
    return url.origin === 'https://cinagroup.com' && retiredProductRedirect(url.pathname) !== undefined;
  } catch {
    return false;
  }
}

export const isRetiredProductName = (name: string): boolean => /^cinaclaw(?:\s|$|[—–-])/i.test(name.trim());

const skillLabels: Record<Lang, string> = {
  en: 'CinaSkill — SKILL.md Capability Format',
  zh: 'CinaSkill — SKILL.md 能力格式',
  ja: 'CinaSkill — SKILL.md 機能形式',
  ko: 'CinaSkill — SKILL.md 기능 형식',
  ru: 'CinaSkill — формат возможностей SKILL.md',
  es: 'CinaSkill — formato de capacidades SKILL.md',
  pt: 'CinaSkill — formato de capacidades SKILL.md',
  fr: 'CinaSkill — format de capacités SKILL.md',
};

/** Existing CMS menus may still contain the former dependency-oriented label. */
export function publicProductMenuLabel(label: string, locale: Lang, href: string): string {
  const url = new URL(href, 'https://cinagroup.com');
  const skillPage =
    url.origin === 'https://cinagroup.com' && /^\/(?:(?:en|zh|ja|ko|ru|es|pt|fr)\/)?cinaskill\/?$/.test(url.pathname);
  return skillPage && /cinaskill/i.test(label) && /cinaclaw/i.test(label) ? skillLabels[locale] : label;
}
