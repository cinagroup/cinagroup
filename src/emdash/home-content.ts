import type { CacheHint, ImageValue } from 'emdash';
import type { SitePresentation } from './site-presentation-model.ts';
import { publicPostSeo, type PublicPostSeo } from './post-seo.ts';
import { isRetiredProductLink, isRetiredProductName } from './retired-products.ts';
import {
  DEFAULT_HOME_COPY,
  DEFAULT_HOME_IMAGES,
  HOME_LOCALES,
  type HomeCopy,
  type HomeLocale,
} from '../data/site/home-defaults.ts';

export interface HomeContent extends HomeCopy {
  heroImage: ImageValue | string;
  aboutImage: ImageValue | string;
  exploreHref: string;
  contactHref: string;
  aboutHref: string;
  noIndex: boolean;
  seo?: PublicPostSeo;
}

type TextKey = Exclude<keyof HomeCopy, 'products' | 'methods'>;

/** Database field names remain explicit so each section is editable in the admin. */
export const HOME_TEXT_FIELDS = {
  title: 'title',
  description: 'description',
  eyebrow: 'hero_eyebrow',
  heroTitle: 'hero_title',
  heroLead: 'hero_lead',
  explore: 'explore_label',
  contact: 'contact_label',
  productsEyebrow: 'products_eyebrow',
  productsTitle: 'products_title',
  productsLead: 'products_lead',
  learn: 'learn_label',
  methodEyebrow: 'method_eyebrow',
  methodTitle: 'method_title',
  methodLead: 'method_lead',
  nextEyebrow: 'next_eyebrow',
  nextTitle: 'next_title',
  nextLead: 'next_lead',
} as const satisfies Record<TextKey, string>;

const TEXT_LIMITS: Record<TextKey, number> = {
  title: 240,
  description: 1000,
  eyebrow: 160,
  heroTitle: 400,
  heroLead: 2000,
  explore: 100,
  contact: 100,
  productsEyebrow: 160,
  productsTitle: 400,
  productsLead: 2000,
  learn: 100,
  methodEyebrow: 160,
  methodTitle: 400,
  methodLead: 2000,
  nextEyebrow: 160,
  nextTitle: 400,
  nextLead: 2000,
};

const FORMER_PRODUCT_HEADINGS: Record<HomeLocale, string> = {
  en: 'Five products. A clear starting point for each task.',
  zh: '五款产品，各自从一项明确任务出发。',
  ja: '一つの明確な仕事から始める五つの製品。',
  ko: '하나의 명확한 업무에서 시작하는 다섯 제품.',
  ru: 'Пять продуктов, каждый начинается с одной ясной задачи.',
  es: 'Cinco productos que empiezan por un trabajo claro.',
  pt: 'Cinco produtos que começam por um trabalho claro.',
  fr: 'Cinq produits qui commencent par un travail clair.',
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximum) return undefined;
  if (
    Array.from(trimmed).some((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
    })
  )
    return undefined;
  return trimmed;
}

/** Homepage links are same-site paths or simple section anchors, never executable or off-site URLs. */
export function safeHomeHref(value: unknown): string | undefined {
  const href = text(value, 2048);
  if (!href || /[\s\\<>]/.test(href) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(href)) return undefined;
  if (/^#[A-Za-z][A-Za-z0-9_-]*$/.test(href)) return href;
  if (!/^\/(?!\/)/.test(href) && !/^https:\/\/cinagroup\.com(?:[/?#]|$)/i.test(href)) return undefined;
  try {
    const url = new URL(href, 'https://cinagroup.com');
    if (url.origin !== 'https://cinagroup.com' || url.username || url.password) return undefined;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return undefined;
  }
}

/** Accept only local EmDash media references and same-site URLs; discard arbitrary provider metadata. */
export function homeImageFromValue(value: unknown): ImageValue | undefined {
  if (!record(value) || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value.id)) return undefined;
  if (value.provider !== undefined && value.provider !== 'local') return undefined;
  const src = value.src === undefined ? undefined : safeHomeHref(value.src);
  if (value.src !== undefined && (!src || !src.startsWith('/'))) return undefined;
  const image: ImageValue = { id: value.id };
  if (src) image.src = src;
  const alt = text(value.alt, 500);
  if (alt) image.alt = alt;
  for (const key of ['width', 'height'] as const) {
    const dimension = value[key];
    if (typeof dimension === 'number' && Number.isInteger(dimension) && dimension > 0 && dimension <= 32768)
      image[key] = dimension;
  }
  for (const key of ['focalX', 'focalY'] as const) {
    const position = value[key];
    if (typeof position === 'number' && Number.isFinite(position) && position >= 0 && position <= 1)
      image[key] = position;
  }
  if (
    record(value.meta) &&
    typeof value.meta.storageKey === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,499}$/.test(value.meta.storageKey) &&
    !value.meta.storageKey.split('/').some((segment) => segment === '..' || segment === '.')
  ) {
    image.meta = { storageKey: value.meta.storageKey };
  }
  return image;
}

export function defaultHomeContent(locale: HomeLocale): HomeContent {
  const prefix = locale === 'en' ? '' : `/${locale}`;
  return {
    ...structuredClone(DEFAULT_HOME_COPY[locale]),
    heroImage: DEFAULT_HOME_IMAGES.hero,
    aboutImage: DEFAULT_HOME_IMAGES.about,
    exploreHref: '#products',
    contactHref: `${prefix}/contact/`,
    aboutHref: `${prefix}/about/`,
    noIndex: false,
  };
}

function productsFromValue(value: unknown): HomeCopy['products'] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) return undefined;
  const products: HomeCopy['products'] = [];
  for (const item of value) {
    if (!record(item)) return undefined;
    if (
      (typeof item.name === 'string' && isRetiredProductName(item.name)) ||
      (typeof item.href === 'string' && isRetiredProductLink(item.href))
    )
      continue;
    const name = text(item.name, 120);
    const role = text(item.role, 300);
    const description = text(item.description, 2000);
    const href = safeHomeHref(item.href);
    if (!name || !role || !description || !href || !href.startsWith('/')) return undefined;
    products.push({ name, role, description, href });
  }
  return products;
}

function methodsFromValue(value: unknown): HomeCopy['methods'] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) return undefined;
  const methods: HomeCopy['methods'] = [];
  for (const item of value) {
    if (!record(item)) return undefined;
    const title = text(item.title, 300);
    const description = text(item.description, 2000);
    if (!title || !description) return undefined;
    methods.push({ title, description });
  }
  return methods;
}

/** A signed, item-scoped EmDash preview is the only way to render a draft homepage. */
export function homeContentFromEntry(
  entry: unknown,
  locale: HomeLocale,
  options: { isPreview: boolean; fallbackLocale?: string }
): HomeContent | undefined {
  if (!HOME_LOCALES.includes(locale) || !record(entry) || !record(entry.data) || options.fallbackLocale)
    return undefined;
  const data = entry.data;
  if (data.slug !== 'home' || data.locale !== locale) return undefined;
  if (data.status !== 'published' && !(options.isPreview === true && data.status === 'draft')) return undefined;
  const content = defaultHomeContent(locale);
  for (const key of Object.keys(HOME_TEXT_FIELDS) as TextKey[]) {
    content[key] = text(data[HOME_TEXT_FIELDS[key]], TEXT_LIMITS[key]) ?? content[key];
  }
  content.products = productsFromValue(data.products) ?? content.products;
  // Previously published CMS content must not restore a withdrawn product or
  // its old five-product heading after the static defaults have been updated.
  const defaults = DEFAULT_HOME_COPY[locale];
  const hadRetiredProduct =
    Array.isArray(data.products) &&
    data.products.some(
      (item) =>
        record(item) &&
        ((typeof item.name === 'string' && isRetiredProductName(item.name)) ||
          (typeof item.href === 'string' && isRetiredProductLink(item.href)))
    );
  if (hadRetiredProduct && content.productsTitle === FORMER_PRODUCT_HEADINGS[locale])
    content.productsTitle = defaults.productsTitle;
  content.products = content.products.map((product) => {
    const path = new URL(product.href, 'https://cinagroup.com').pathname.replace(/\/+$/, '');
    const current = defaults.products.find((item) => item.href.replace(/\/+$/, '') === path);
    return current
      ? {
          ...product,
          role: /cinaclaw/i.test(product.role) ? current.role : product.role,
          description: /cinaclaw/i.test(product.description) ? current.description : product.description,
        }
      : product;
  });
  content.methods = methodsFromValue(data.methods) ?? content.methods;
  content.heroImage = homeImageFromValue(data.hero_image) ?? content.heroImage;
  content.aboutImage = homeImageFromValue(data.about_image) ?? content.aboutImage;
  content.exploreHref = safeHomeHref(data.explore_url) ?? content.exploreHref;
  content.contactHref = safeHomeHref(data.contact_url) ?? content.contactHref;
  content.aboutHref = safeHomeHref(data.about_url) ?? content.aboutHref;
  if (record(data.seo)) {
    content.seo = publicPostSeo(data.seo);
    content.title = text(data.seo.title, TEXT_LIMITS.title) ?? content.title;
    content.description = text(data.seo.description, TEXT_LIMITS.description) ?? content.description;
    content.noIndex = data.seo.noIndex === true;
  }
  if (/cinaclaw/i.test(content.description)) content.description = defaults.description;
  if (content.seo?.description && /cinaclaw/i.test(content.seo.description))
    content.seo.description = content.description;
  return content;
}

export interface HomeQueryResult {
  entry: unknown;
  isPreview: boolean;
  fallbackLocale?: string;
  cacheHint?: CacheHint;
  error?: Error;
}

export interface HomeContentResult {
  content: HomeContent;
  source: 'emdash' | 'fallback';
  isPreview: boolean;
  cacheHint: CacheHint;
  error?: Error;
}

/** Pure seed data lets initialization scripts create the exact existing eight homepage translations. */
export function homeDefaultFields(locale: HomeLocale): Record<string, unknown> {
  const content = defaultHomeContent(locale);
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(HOME_TEXT_FIELDS) as TextKey[]) data[HOME_TEXT_FIELDS[key]] = content[key];
  return {
    ...data,
    products: content.products,
    methods: content.methods,
    explore_url: content.exploreHref,
    contact_url: content.contactHref,
    about_url: content.aboutHref,
    hero_image: null,
    about_image: null,
  };
}

async function queryHome(locale: HomeLocale): Promise<HomeQueryResult> {
  // Preview authentication and draft revision selection belong to EmDash middleware/query APIs.
  const { getEmDashEntry } = await import('emdash');
  return getEmDashEntry('site_pages', 'home', { locale });
}

export async function loadHomeContent(
  locale: HomeLocale,
  read: (locale: HomeLocale) => Promise<HomeQueryResult> = queryHome
): Promise<HomeContentResult> {
  try {
    const result = await read(locale);
    const content = result.error ? undefined : homeContentFromEntry(result.entry, locale, result);
    const cacheHint: CacheHint = {
      ...result.cacheHint,
      tags: [...new Set(['site_pages', ...(result.cacheHint?.tags ?? [])])],
    };
    return {
      content: content ?? defaultHomeContent(locale),
      source: content ? 'emdash' : 'fallback',
      isPreview: result.isPreview === true,
      cacheHint,
      error: result.error,
    };
  } catch (error) {
    return {
      content: defaultHomeContent(locale),
      source: 'fallback',
      isPreview: false,
      cacheHint: { tags: ['site_pages'] },
      error: error instanceof Error ? error : new Error('Unable to load homepage content'),
    };
  }
}

/** Organization identity follows native public settings while its canonical site remains fixed. */
export function homeOrganizationStructuredData(presentation: SitePresentation) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: presentation.siteName ?? 'CinaGroup',
    url: 'https://cinagroup.com',
    logo: new URL(presentation.logo?.url ?? '/logo.png', 'https://cinagroup.com').href,
    sameAs:
      presentation.socialLinks === undefined
        ? ['https://github.com/cinagroup', 'https://x.com/cinagroup']
        : presentation.socialLinks.map((link) => link.href).filter((href) => /^https?:\/\//i.test(href)),
  };
}
