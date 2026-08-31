import slugify from 'limax';

import { SITE, APP_BLOG } from 'astrowind:config';

import { trim } from '~/utils/utils';

export const trimSlash = (s: string) => trim(trim(s, '/'));
const createPath = (...params: string[]) => {
  const paths = params
    .map((el) => trimSlash(el))
    .filter((el) => !!el)
    .join('/');
  return '/' + paths + (SITE.trailingSlash && paths ? '/' : '');
};

const BASE_PATHNAME = SITE.base || '/';

const splitPathSuffix = (value: string): [string, string] => {
  const suffixIndex = value.search(/[?#]/);
  return suffixIndex === -1 ? [value, ''] : [value.slice(0, suffixIndex), value.slice(suffixIndex)];
};

export const cleanSlug = (text = '') =>
  trimSlash(text)
    .split('/')
    .map((slug) => slugify(slug))
    .join('/');

export const BLOG_BASE = cleanSlug(APP_BLOG?.list?.pathname);
export const CATEGORY_BASE = cleanSlug(APP_BLOG?.category?.pathname);
export const TAG_BASE = cleanSlug(APP_BLOG?.tag?.pathname) || 'tag';

export const POST_PERMALINK_PATTERN = trimSlash(APP_BLOG?.post?.permalink || `${BLOG_BASE}/%slug%`);

/** */
export const getCanonical = (path = ''): string | URL => {
  const url = new URL(path, SITE.site);
  if (SITE.trailingSlash === false && path && url.pathname !== '/') {
    url.pathname = url.pathname.replace(/\/+$/, '');
  } else if (SITE.trailingSlash === true && path && !url.pathname.endsWith('/')) {
    url.pathname += '/';
  }
  return String(url);
};

/** */
export const getPermalink = (slug = '', type = 'page'): string => {
  let permalink: string;

  if (slug.startsWith('//') || slug.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(slug)) {
    return slug;
  }

  const [pathname, suffix] = splitPathSuffix(slug);

  switch (type) {
    case 'home':
      permalink = getHomePermalink();
      break;

    case 'blog':
      permalink = getBlogPermalink();
      break;

    case 'asset':
      return getAsset(pathname) + suffix;

    case 'category':
      permalink = createPath(CATEGORY_BASE, trimSlash(pathname));
      break;

    case 'tag':
      permalink = createPath(TAG_BASE, trimSlash(pathname));
      break;

    case 'post':
      permalink = createPath(trimSlash(pathname));
      break;

    case 'page':
    default:
      permalink = createPath(pathname);
      break;
  }

  return definitivePermalink(permalink) + suffix;
};

/** */
export const getHomePermalink = (): string => getPermalink('/');

/** */
export const getBlogPermalink = (): string => getPermalink(BLOG_BASE);

/** */
export const getAsset = (path: string): string =>
  '/' +
  [BASE_PATHNAME, path]
    .map((el) => trimSlash(el))
    .filter((el) => !!el)
    .join('/');

/** */
const definitivePermalink = (permalink: string): string => createPath(BASE_PATHNAME, permalink);

/** */
export const applyGetPermalinks = (menu: object = {}) => {
  if (Array.isArray(menu)) {
    return menu.map((item) => applyGetPermalinks(item));
  } else if (typeof menu === 'object' && menu !== null) {
    const obj = {};
    for (const key in menu) {
      if (key === 'href') {
        if (typeof menu[key] === 'string') {
          obj[key] = getPermalink(menu[key]);
        } else if (typeof menu[key] === 'object') {
          if (menu[key].type === 'home') {
            obj[key] = getHomePermalink();
          } else if (menu[key].type === 'blog') {
            obj[key] = getBlogPermalink();
          } else if (menu[key].type === 'asset') {
            obj[key] = getAsset(menu[key].url);
          } else if (menu[key].url) {
            obj[key] = getPermalink(menu[key].url, menu[key].type);
          }
        }
      } else {
        obj[key] = applyGetPermalinks(menu[key]);
      }
    }
    return obj;
  }
  return menu;
};
