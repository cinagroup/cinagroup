import type { PaginateFunction } from 'astro';
import { getCollection, render } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import type { Post } from '~/types';
import { APP_BLOG } from 'astrowind:config';
import {
  cleanSlug,
  trimSlash,
  BLOG_BASE,
  POST_PERMALINK_PATTERN,
  CATEGORY_BASE,
  TAG_BASE,
  getPermalink,
} from './permalinks';
import { defaultLang, getPath, supportedLocales, type Lang } from '~/i18n';
import {
  inferPostLanguage,
  isAutomatedBriefing,
  isBlogFeedPost,
  isPublicPostStatus,
  isRoutablePostStatus,
  normalizePostAuthorInfo,
  postLanguageToSiteLocale,
  resolvePostStatus,
  siteLocaleToPostLanguage,
} from './blog-content.js';

const generatePermalink = async ({
  id,
  slug,
  publishDate,
  category,
}: {
  id: string;
  slug: string;
  publishDate: Date;
  category: string | undefined;
}) => {
  const year = String(publishDate.getFullYear()).padStart(4, '0');
  const month = String(publishDate.getMonth() + 1).padStart(2, '0');
  const day = String(publishDate.getDate()).padStart(2, '0');
  const hour = String(publishDate.getHours()).padStart(2, '0');
  const minute = String(publishDate.getMinutes()).padStart(2, '0');
  const second = String(publishDate.getSeconds()).padStart(2, '0');

  const permalink = POST_PERMALINK_PATTERN.replace('%slug%', slug)
    .replace('%id%', id)
    .replace('%category%', category || '')
    .replace('%year%', year)
    .replace('%month%', month)
    .replace('%day%', day)
    .replace('%hour%', hour)
    .replace('%minute%', minute)
    .replace('%second%', second);

  return permalink
    .split('/')
    .map((el) => trimSlash(el))
    .filter((el) => !!el)
    .join('/');
};

const getNormalizedPost = async (post: CollectionEntry<'post'>): Promise<Post> => {
  const { id, data } = post;
  const { Content, remarkPluginFrontmatter } = await render(post);

  const {
    publishDate: rawPublishDate = new Date(),
    updateDate: rawUpdateDate,
    updated: rawUpdated,
    title,
    excerpt,
    description,
    image,
    tags: rawTags = [],
    category: rawCategory,
    author: rawAuthor,
    authorType: rawAuthorType,
    authorUrl: rawAuthorUrl,
    language: rawLanguage,
    translationKey: rawTranslationKey,
    status: rawStatus,
    origin,
    sources,
    verification,
    review,
    correction,
    reviewedBy,
    reviewedAt,
    correctionNote,
    aliases,
    draft = false,
    archive = false,
    archived: rawArchived = false,
    published: rawPublished,
    metadata = {},
  } = data;

  const slug = cleanSlug(id); // cleanSlug(rawSlug.split('/').pop());
  const publishDate = new Date(rawPublishDate);
  const rawLastUpdated = rawUpdateDate || rawUpdated;
  const updateDate = rawLastUpdated ? new Date(rawLastUpdated.valueOf()) : undefined;
  const body = 'body' in post && typeof post.body === 'string' ? post.body : '';
  const language = rawLanguage || inferPostLanguage([title, excerpt, description, body].filter(Boolean).join('\n'));
  const automatedBriefing = isAutomatedBriefing(slug);
  const author = normalizePostAuthorInfo(rawAuthor, rawAuthorType, automatedBriefing);
  const authorUrl = rawAuthorUrl || author.url;
  const status = resolvePostStatus(
    { status: rawStatus, draft, archive, archived: rawArchived, published: rawPublished },
    automatedBriefing
  );
  const archived = status === 'archived_unverified';

  const category = rawCategory
    ? {
        slug: cleanSlug(rawCategory),
        title: rawCategory,
      }
    : undefined;

  const tags = rawTags.map((tag: string) => ({
    slug: cleanSlug(tag),
    title: tag,
  }));

  return {
    id: id,
    slug: slug,
    permalink: await generatePermalink({ id, slug, publishDate, category: category?.slug }),

    publishDate: publishDate,
    updateDate: updateDate,

    title: title,
    excerpt: excerpt || description,
    image: image,

    category: category,
    tags: tags,
    author: author.name,
    authorType: author.type,
    authorUrl: authorUrl,
    language: language,
    translationKey: rawTranslationKey || slug,
    status,
    origin,
    sources,
    verification,
    review,
    correction,
    reviewedBy,
    reviewedAt,
    correctionNote,
    aliases,

    draft: draft,
    archived: archived,
    published: isPublicPostStatus(status),

    metadata,

    Content: Content,
    // or 'content' in case you consume from API

    readingTime: remarkPluginFrontmatter?.readingTime,
  };
};

const load = async function (): Promise<Array<Post>> {
  const posts = await getCollection('post');
  const normalizedPosts = posts.map(async (post) => await getNormalizedPost(post));

  const results = (await Promise.all(normalizedPosts)).sort(
    (a, b) => b.publishDate.valueOf() - a.publishDate.valueOf()
  );

  return results;
};

let _allPosts: Array<Post>;
const _feedCacheByLocale = new Map<Lang, Array<Post>>();

/** */
export const isBlogEnabled = APP_BLOG.isEnabled;
export const isRelatedPostsEnabled = APP_BLOG.isRelatedPostsEnabled;
export const isBlogListRouteEnabled = APP_BLOG.list.isEnabled;
export const isBlogPostRouteEnabled = APP_BLOG.post.isEnabled;
export const isBlogCategoryRouteEnabled = APP_BLOG.category.isEnabled;
export const isBlogTagRouteEnabled = APP_BLOG.tag.isEnabled;

export const blogListRobots = APP_BLOG.list.robots;
export const blogPostRobots = APP_BLOG.post.robots;
export const blogCategoryRobots = APP_BLOG.category.robots;
export const blogTagRobots = APP_BLOG.tag.robots;

export const blogPostsPerPage = APP_BLOG?.postsPerPage;

/** */
export const fetchPosts = async (): Promise<Array<Post>> => fetchPostsByLocale(defaultLang);

/**
 * Posts visible on a locale's blog index: published posts written in that
 * locale's language, plus (on the default locale only) the English automated
 * archive. Locales without any visible post get an empty feed and no index.
 */
export const fetchPostsByLocale = async (lang: Lang): Promise<Array<Post>> => {
  if (!_feedCacheByLocale.has(lang)) {
    _feedCacheByLocale.set(
      lang,
      (await fetchAllPosts()).filter((post) => isBlogFeedPost(post.status, post.language, lang))
    );
  }

  return _feedCacheByLocale.get(lang) ?? [];
};

/** Editorially published posts only; excludes visible unverified archives. */
const fetchPublishedPosts = async (): Promise<Array<Post>> =>
  (await fetchAllPosts()).filter((post) => isPublicPostStatus(post.status));

/** All governed sources, including entries that must not appear in public indexes. */
export const fetchAllPosts = async (): Promise<Array<Post>> => {
  if (!_allPosts) _allPosts = await load();
  return _allPosts;
};

/** */
export const findPostsBySlugs = async (slugs: Array<string>): Promise<Array<Post>> => {
  if (!Array.isArray(slugs)) return [];

  const posts = await fetchPosts();

  return slugs.reduce(function (r: Array<Post>, slug: string) {
    posts.some(function (post: Post) {
      return slug === post.slug && r.push(post);
    });
    return r;
  }, []);
};

/** */
export const findPostsByIds = async (ids: Array<string>): Promise<Array<Post>> => {
  if (!Array.isArray(ids)) return [];

  const posts = await fetchPosts();

  return ids.reduce(function (r: Array<Post>, id: string) {
    posts.some(function (post: Post) {
      return id === post.id && r.push(post);
    });
    return r;
  }, []);
};

/** */
export const findLatestPosts = async ({ count }: { count?: number }): Promise<Array<Post>> => {
  const _count = count || 4;
  const posts = await fetchPosts();

  return posts ? posts.slice(0, _count) : [];
};

/** */
export const getStaticPathsBlogList = async ({
  paginate,
  lang = defaultLang,
}: {
  paginate: PaginateFunction;
  lang?: Lang;
}) => {
  if (!isBlogEnabled || !isBlogListRouteEnabled) return [];
  const posts = await fetchPostsByLocale(lang);
  if (posts.length === 0) return [];
  return paginate(posts, {
    params: { blog: BLOG_BASE || undefined, ...(lang !== defaultLang ? { lang } : {}) },
    pageSize: blogPostsPerPage,
  });
};

/** */
export const getStaticPathsBlogPost = async ({ lang = defaultLang }: { lang?: Lang } = {}) => {
  if (!isBlogEnabled || !isBlogPostRouteEnabled) return [];
  const expectedLanguage = siteLocaleToPostLanguage(lang);
  if (!expectedLanguage) return [];
  return (await fetchAllPosts())
    .filter((post) => isRoutablePostStatus(post.status) && post.language === expectedLanguage)
    .flatMap((post) => ({
      params: {
        blog: post.permalink,
        ...(lang !== defaultLang ? { lang } : {}),
      },
      props: { post },
    }));
};

export interface PostTranslation {
  post: Post;
  /** Site locale whose blog section serves this translation. */
  locale: Lang;
}

/** */
export const getPostLocalePermalink = (translation: PostTranslation): string => {
  const permalink = getPermalink(translation.post.permalink, 'post');
  return translation.locale === defaultLang ? permalink : getPath(permalink, translation.locale);
};

/** Routable translations of a post (including itself), grouped by translationKey and locale. */
export const findPostTranslations = async (post: Post): Promise<Array<PostTranslation>> => {
  const translationsByLocale = new Map<Lang, PostTranslation>();

  for (const candidate of await fetchAllPosts()) {
    if (!isRoutablePostStatus(candidate.status) || candidate.translationKey !== post.translationKey) continue;
    const locale = postLanguageToSiteLocale(candidate.language) as Lang | undefined;
    if (!locale) continue;

    const existing = translationsByLocale.get(locale);
    if (!existing || (isPublicPostStatus(candidate.status) && !isPublicPostStatus(existing.post.status))) {
      translationsByLocale.set(locale, { post: candidate, locale });
    }
  }

  return supportedLocales.flatMap((locale) => {
    const translation = translationsByLocale.get(locale);
    return translation ? [translation] : [];
  });
};

export interface PostLanguageAlternate {
  hreflang: Lang | 'x-default';
  href: string;
}

/**
 * Reciprocal SEO alternates across indexable translations. Noindex archive
 * sources are deliberately excluded from hreflang sets.
 */
export const getPostLanguageAlternates = async (
  post: Post,
  origin: string | URL
): Promise<Array<PostLanguageAlternate>> => {
  const translations = (await findPostTranslations(post)).filter((translation) =>
    isPublicPostStatus(translation.post.status)
  );
  if (translations.length < 2) return [];

  const makeHref = (translation: PostTranslation) => new URL(getPostLocalePermalink(translation), origin).toString();
  const alternates: Array<PostLanguageAlternate> = translations.map((translation) => ({
    hreflang: translation.locale,
    href: makeHref(translation),
  }));
  const defaultTranslation = translations.find((translation) => translation.locale === defaultLang);
  if (defaultTranslation) alternates.push({ hreflang: 'x-default', href: makeHref(defaultTranslation) });
  return alternates;
};

/**
 * Direct links used by the on-page language switcher. Unlike SEO alternates,
 * these may include the noindex historical original for reader provenance.
 */
export const getPostLanguageSwitcherAlternates = async (
  post: Post,
  origin: string | URL
): Promise<Array<PostLanguageAlternate>> => {
  const translations = await findPostTranslations(post);
  const makeHref = (translation: PostTranslation) => new URL(getPostLocalePermalink(translation), origin).toString();
  return translations.map((translation) => ({ hreflang: translation.locale, href: makeHref(translation) }));
};

/** Locales that have a blog index page: the default locale plus every locale with at least one feed post. */
export const getBlogListLocales = async (): Promise<Array<Lang>> => {
  const locales: Array<Lang> = [];
  for (const lang of supportedLocales) {
    if (lang === defaultLang || (await fetchPostsByLocale(lang)).length > 0) locales.push(lang);
  }
  return locales;
};

/** hreflang alternates for the blog index pages across locales. */
export const getBlogListLanguageAlternates = async (origin: string | URL): Promise<Array<PostLanguageAlternate>> => {
  const locales = await getBlogListLocales();
  if (!locales.includes(defaultLang)) return [];

  const makeHref = (lang: Lang) =>
    new URL(
      lang === defaultLang ? getPermalink(BLOG_BASE, 'blog') : getPath(getPermalink(BLOG_BASE, 'blog'), lang),
      origin
    ).toString();
  const alternates: Array<PostLanguageAlternate> = locales.map((lang) => ({ hreflang: lang, href: makeHref(lang) }));
  alternates.push({ hreflang: 'x-default', href: makeHref(defaultLang) });
  return alternates;
};

/** */
export const getStaticPathsBlogCategory = async ({ paginate }: { paginate: PaginateFunction }) => {
  if (!isBlogEnabled || !isBlogCategoryRouteEnabled) return [];
  const defaultLanguage = siteLocaleToPostLanguage(defaultLang);
  const posts = (await fetchPublishedPosts()).filter((post) => post.language === defaultLanguage);
  const categories = {};
  posts.map((post) => {
    if (post.category?.slug) {
      categories[post.category?.slug] = post.category;
    }
  });

  return Array.from(Object.keys(categories)).flatMap((categorySlug) =>
    paginate(
      posts.filter((post) => post.category?.slug && categorySlug === post.category?.slug),
      {
        params: { category: categorySlug, blog: CATEGORY_BASE || undefined },
        pageSize: blogPostsPerPage,
        props: { category: categories[categorySlug] },
      }
    )
  );
};

/** */
export const getStaticPathsBlogTag = async ({ paginate }: { paginate: PaginateFunction }) => {
  if (!isBlogEnabled || !isBlogTagRouteEnabled) return [];
  const defaultLanguage = siteLocaleToPostLanguage(defaultLang);
  const posts = (await fetchPublishedPosts()).filter((post) => post.language === defaultLanguage);
  const tags = {};
  posts.map((post) => {
    if (Array.isArray(post.tags)) {
      post.tags.map((tag) => {
        tags[tag?.slug] = tag;
      });
    }
  });

  return Array.from(Object.keys(tags)).flatMap((tagSlug) =>
    paginate(
      posts.filter((post) => Array.isArray(post.tags) && post.tags.find((elem) => elem.slug === tagSlug)),
      {
        params: { tag: tagSlug, blog: TAG_BASE || undefined },
        pageSize: blogPostsPerPage,
        props: { tag: tags[tagSlug] },
      }
    )
  );
};

/** */
export async function getRelatedPosts(originalPost: Post, maxResults: number = 4): Promise<Post[]> {
  const allPosts = (await fetchPublishedPosts()).filter(
    (iteratedPost) => iteratedPost.language === originalPost.language
  );
  const originalTagsSet = new Set(originalPost.tags ? originalPost.tags.map((tag) => tag.slug) : []);

  const postsWithScores = allPosts.reduce((acc: { post: Post; score: number }[], iteratedPost: Post) => {
    if (iteratedPost.slug === originalPost.slug) return acc;

    let score = 0;
    if (iteratedPost.category && originalPost.category && iteratedPost.category.slug === originalPost.category.slug) {
      score += 5;
    }

    if (iteratedPost.tags) {
      iteratedPost.tags.forEach((tag) => {
        if (originalTagsSet.has(tag.slug)) {
          score += 1;
        }
      });
    }

    acc.push({ post: iteratedPost, score });
    return acc;
  }, []);

  postsWithScores.sort((a, b) => b.score - a.score);

  const selectedPosts: Post[] = [];
  let i = 0;
  while (selectedPosts.length < maxResults && i < postsWithScores.length) {
    selectedPosts.push(postsWithScores[i].post);
    i++;
  }

  return selectedPosts;
}
