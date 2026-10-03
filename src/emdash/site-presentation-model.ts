import type { Lang } from '../i18n/routing.ts';

export interface PresentationMenuItem {
  label: string;
  url: string;
  target?: '_blank';
  children: PresentationMenuItem[];
}
export interface PresentationMedia {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  contentType?: string;
}
export interface PresentationSocial {
  ariaLabel: string;
  href: string;
  icon: string;
}
export interface SitePresentation {
  siteName?: string;
  tagline?: string;
  logo?: PresentationMedia;
  darkLogo?: PresentationMedia;
  favicon?: PresentationMedia;
  defaultOgImage?: PresentationMedia;
  titleSeparator?: string;
  googleVerification?: string;
  bingVerification?: string;
  contactEmail?: string;
  footerDescription?: string;
  headerCtaLabel?: string;
  headerCtaHref?: string;
  socialLinks?: PresentationSocial[];
  menus: Partial<Record<'primary' | 'footer' | 'footer-legal', PresentationMenuItem[]>>;
  profile?: Record<string, unknown>;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
export const presentationText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

/** Navigation permits only root paths, fragment links and explicit web/contact protocols. */
export function safePresentationHref(value: unknown): string | undefined {
  const href = presentationText(value);
  if (
    !href ||
    href.startsWith('//') ||
    [...href].some(
      (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127 || character === '\\'
    )
  )
    return undefined;
  if (href.startsWith('/') || href.startsWith('#')) return href;
  try {
    const url = new URL(href);
    if (!['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol)) return undefined;
    if (url.username || url.password) return undefined;
    return href;
  } catch {
    return undefined;
  }
}

/** Uploaded theme/head media must stay on the site; remote resources are not enabled by a setting. */
export function presentationMedia(value: unknown): PresentationMedia | undefined {
  const media = record(value);
  const url = safePresentationHref(media?.url ?? media?.src);
  if (!media || !url || !url.startsWith('/')) return undefined;
  const dimension = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
  return {
    url,
    alt: presentationText(media.alt),
    width: dimension(media.width),
    height: dimension(media.height),
    contentType: presentationText(media.contentType),
  };
}

export function presentationMenu(value: unknown, locale: Lang): PresentationMenuItem[] | undefined {
  const menu = record(value);
  if (!menu || menu.locale !== locale || !Array.isArray(menu.items)) return undefined;
  const mapItems = (items: unknown[], depth: number): PresentationMenuItem[] =>
    depth > 4
      ? []
      : items.flatMap((item) => {
          const row = record(item);
          const label = presentationText(row?.label);
          const children = Array.isArray(row?.children) ? mapItems(row.children, depth + 1) : [];
          const url = safePresentationHref(row?.url);
          if (!label || (!url && !children.length)) return [];
          return [
            { label, url: url ?? '#', target: row?.target === '_blank' ? ('_blank' as const) : undefined, children },
          ];
        });
  return mapItems(menu.items, 0);
}

export function flattenPresentationMenu(items: PresentationMenuItem[]): PresentationMenuItem[] {
  return items.flatMap((item) => [item, ...flattenPresentationMenu(item.children)]);
}

export function publishedSiteProfile(result: unknown, locale: Lang): Record<string, unknown> | undefined {
  const response = record(result);
  const data = record(record(response?.entry)?.data);
  if (
    !response ||
    response.error ||
    response.isPreview ||
    response.fallbackLocale ||
    !data ||
    data.status !== 'published' ||
    data.locale !== locale ||
    data.slug !== 'site'
  )
    return undefined;
  return data;
}

export function mapSitePresentation(
  settingsValue: unknown,
  menuValues: Record<string, unknown>,
  profile: Record<string, unknown> | undefined,
  locale: Lang
): SitePresentation {
  const settings = record(settingsValue) ?? {};
  const seo = record(settings.seo);
  const contactEmail = presentationText(profile?.contact_email);
  const social = record(settings.social);
  const socialIcons: Record<string, string> = {
    twitter: 'tabler:brand-x',
    github: 'tabler:brand-github',
    facebook: 'tabler:brand-facebook',
    instagram: 'tabler:brand-instagram',
    linkedin: 'tabler:brand-linkedin',
    youtube: 'tabler:brand-youtube',
  };
  const nativeSocial = social
    ? Object.entries(social).flatMap(([key, value]) => {
        const href = safePresentationHref(value);
        return href && /^https?:/.test(href) && socialIcons[key]
          ? [{ ariaLabel: key === 'twitter' ? 'X' : key, href, icon: socialIcons[key] }]
          : [];
      })
    : [];
  const hasExtras = Array.isArray(profile?.extra_social_links);
  const extraSocial = hasExtras
    ? (profile?.extra_social_links as unknown[]).flatMap((value) => {
        const link = record(value);
        const href = safePresentationHref(link?.url);
        const label = presentationText(link?.label);
        const icon = link?.icon === 'tiktok' ? 'tabler:brand-tiktok' : link?.icon === 'rss' ? 'tabler:rss' : undefined;
        return href && label && icon ? [{ ariaLabel: label, href, icon }] : [];
      })
    : [];
  return {
    siteName: presentationText(settings.title) ?? presentationText(profile?.site_name),
    tagline: presentationText(settings.tagline) ?? presentationText(profile?.tagline),
    logo: presentationMedia(settings.logo),
    darkLogo: presentationMedia(profile?.logo_dark),
    favicon: presentationMedia(settings.favicon),
    defaultOgImage: presentationMedia(seo?.defaultOgImage),
    titleSeparator: presentationText(seo?.titleSeparator),
    googleVerification: presentationText(seo?.googleVerification),
    bingVerification: presentationText(seo?.bingVerification),
    contactEmail:
      contactEmail && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contactEmail) && !/[?&#]/.test(contactEmail)
        ? contactEmail
        : undefined,
    footerDescription:
      presentationText(profile?.footer_description) ??
      presentationText(profile?.tagline) ??
      presentationText(settings.tagline),
    headerCtaLabel: presentationText(profile?.header_cta_label),
    headerCtaHref: safePresentationHref(profile?.header_cta_href),
    socialLinks: social || hasExtras ? [...nativeSocial, ...extraSocial] : undefined,
    menus: {
      primary: presentationMenu(menuValues.primary, locale),
      footer: presentationMenu(menuValues.footer, locale),
      'footer-legal': presentationMenu(menuValues['footer-legal'], locale),
    },
    profile,
  };
}

interface ReadResult {
  data: unknown;
  cacheHint?: unknown;
}
export interface PresentationReaders {
  settings(): Promise<ReadResult>;
  menu(name: string, locale: Lang): Promise<ReadResult>;
  profile(locale: Lang): Promise<unknown>;
}
interface PresentationRequest {
  locals: object;
  url: URL;
  isPrerendered?: boolean;
}

/** Each request owns its promise. Failed CMS reads never poison another request or locale. */
export function createSitePresentationLoader(readers: PresentationReaders) {
  const requests = new WeakMap<object, Map<Lang, Promise<SitePresentation>>>();
  return (
    context: PresentationRequest,
    locale: Lang,
    registerHint?: (hint: unknown) => void
  ): Promise<SitePresentation> => {
    if (context.isPrerendered) return Promise.resolve({ menus: {} });
    let locales = requests.get(context.locals);
    if (!locales) {
      locales = new Map();
      requests.set(context.locals, locales);
    }
    const existing = locales.get(locale);
    if (existing) return existing;
    const promise = (async () => {
      const results = await Promise.allSettled([
        readers.settings(),
        readers.menu('primary', locale),
        readers.menu('footer', locale),
        readers.menu('footer-legal', locale),
        readers.profile(locale),
      ]);
      const read = (index: number): unknown => {
        const result = results[index];
        if (result.status !== 'fulfilled') return undefined;
        const data = record(result.value);
        if (data?.cacheHint) registerHint?.(data.cacheHint);
        return index === 4 ? result.value : data?.data;
      };
      const settings = read(0);
      const menus = { primary: read(1), footer: read(2), 'footer-legal': read(3) };
      const profile = publishedSiteProfile(read(4), locale);
      return mapSitePresentation(settings, menus, profile, locale);
    })();
    locales.set(locale, promise);
    return promise;
  };
}
