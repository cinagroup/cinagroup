export const languages = {
  en: 'English',
  zh: '简体中文',
  ja: '日本語',
  ko: '한국어',
  ru: 'Русский',
  es: 'Español',
  pt: 'Português',
  fr: 'Français',
} as const;

export type Lang = keyof typeof languages;

export const defaultLang: Lang = 'en';
export const supportedLocales = Object.keys(languages) as Lang[];

const everyLocale = [...supportedLocales] as const;

/**
 * Public, indexable route equivalents. Add a locale only after its source page
 * exists. Dynamic blog detail, category, and tag routes are intentionally not
 * treated as translated equivalents.
 */
export const routeMatrix = {
  '/': everyLocale,
  '/cinaseek': everyLocale,
  '/cinaclaw': everyLocale,
  '/cinatoken': everyLocale,
  '/cinaskill': everyLocale,
  '/cinachain': everyLocale,
  '/contact': everyLocale,
  '/pricing': everyLocale,
  '/services': everyLocale,
  '/about': everyLocale,
  '/privacy': everyLocale,
  '/terms': everyLocale,
  '/blog': ['en'],
  '/work': ['en'],
} as const satisfies Record<string, readonly Lang[]>;

export type RouteKey = keyof typeof routeMatrix;

const supportedLocaleSet = new Set<string>(supportedLocales);

const splitSuffix = (value: string): [string, string] => {
  const index = value.search(/[?#]/);
  return index === -1 ? [value, ''] : [value.slice(0, index), value.slice(index)];
};

/** Returns an unprefixed, slash-normalized route such as `/about`. */
export function getBaseRoute(pathname: string): string {
  const [rawPath] = splitSuffix(pathname);
  const parts = rawPath.split('/').filter(Boolean);
  if (supportedLocaleSet.has(parts[0])) parts.shift();
  return parts.length ? `/${parts.join('/')}` : '/';
}

export function isKnownRoute(pathname: string): boolean {
  return getBaseRoute(pathname) in routeMatrix;
}

export function getRouteLocales(pathname: string): readonly Lang[] {
  const route = getBaseRoute(pathname);
  return isKnownRoute(route) ? routeMatrix[route as RouteKey] : [];
}

export function isRouteAvailable(pathname: string, lang: Lang): boolean {
  return getRouteLocales(pathname).includes(lang);
}

export function getLocalizedRoutePath(pathname: string, lang: Lang): string {
  const route = getBaseRoute(pathname);
  if (route === '/') return lang === defaultLang ? '/' : `/${lang}/`;
  return lang === defaultLang ? `${route}/` : `/${lang}${route}/`;
}

/**
 * Localizes a site link when that equivalent exists. Otherwise it keeps the
 * canonical English route. Query strings and fragments are preserved.
 */
export function localizeInternalHref(href: string | undefined, lang: Lang): string | undefined {
  if (!href || !href.startsWith('/') || href.startsWith('//')) return href;
  const [pathname, suffix] = splitSuffix(href);
  const route = getBaseRoute(pathname);
  if (!isKnownRoute(route)) return `${pathname}${suffix}`;
  const targetLang = isRouteAvailable(route, lang) ? lang : defaultLang;
  return `${getLocalizedRoutePath(route, targetLang)}${suffix}`;
}

export function getLangFromUrl(url: URL): Lang {
  const [, lang] = url.pathname.split('/');
  return supportedLocaleSet.has(lang) ? (lang as Lang) : defaultLang;
}

/** Switches locale, falling back to the target locale's homepage when absent. */
export function changeLangPath(url: URL, newLang: Lang): string {
  const route = getBaseRoute(url.pathname);
  const targetRoute = isRouteAvailable(route, newLang) ? route : '/';
  return `${getLocalizedRoutePath(targetRoute, newLang)}${url.search}${url.hash}`;
}

export function getPath(path: string, lang: string = defaultLang): string {
  return lang === defaultLang ? path : `/${lang}${path}`;
}

export interface LanguageAlternate {
  hreflang: Lang | 'x-default';
  href: string;
}

/** Builds a complete reciprocal alternate set for a known route. */
export function getLanguageAlternates(pathname: string, origin: string | URL): LanguageAlternate[] {
  const route = getBaseRoute(pathname);
  const locales = getRouteLocales(route);
  if (locales.length === 0 || !locales.includes(defaultLang)) return [];

  const makeHref = (lang: Lang) => new URL(getLocalizedRoutePath(route, lang), origin).toString();
  const alternates: LanguageAlternate[] = locales.map((lang) => ({ hreflang: lang, href: makeHref(lang) }));
  alternates.push({ hreflang: 'x-default', href: makeHref(defaultLang) });
  return alternates;
}
