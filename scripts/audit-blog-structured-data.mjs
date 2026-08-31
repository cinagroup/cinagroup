import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { load as parseYaml } from 'js-yaml';

import {
  POST_LANGUAGES,
  inferPostLanguage,
  isAutomatedBriefing,
  isBlogFeedPost,
  isPublicPostStatus,
  normalizePostAuthorInfo,
  resolvePostStatus,
} from '../src/utils/blog-content.js';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const automatedSourceDir = path.join(root, 'src', 'data', 'post');
const curatedSourceDir = path.join(root, 'src', 'content', 'blog');
const sourceDirectories = [automatedSourceDir, curatedSourceDir];
const validLanguages = new Set(POST_LANGUAGES);
const sourceOnly = process.argv.includes('--source-only');
const failures = [];
const languageCounts = new Map();
const readOptionalDirectory = async (directory) => {
  try {
    return await readdir(directory);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
};
const openGraphLocales = {
  en: 'en_US',
  'zh-CN': 'zh_CN',
  ja: 'ja_JP',
  ko: 'ko_KR',
  ru: 'ru_RU',
  es: 'es_ES',
  'pt-BR': 'pt_BR',
  fr: 'fr_FR',
};
let explicitLanguageCount = 0;
let inferredLanguageCount = 0;

const parseFrontmatter = (source, filename) => {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`${filename}: missing YAML frontmatter`);

  return {
    data: parseYaml(match[1]) || {},
    body: source.slice(match[0].length),
  };
};

const decodeHtml = (value = '') =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");

const attributeValue = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  const value = match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
  return value === null ? null : decodeHtml(value);
};

const linkHref = (html, relName) => {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = attributeValue(match[0], 'rel')?.toLowerCase().split(/\s+/) || [];
    if (rel.includes(relName.toLowerCase())) return attributeValue(match[0], 'href');
  }
  return null;
};

const metaPropertyContent = (html, propertyName) => {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (attributeValue(match[0], 'property')?.toLowerCase() === propertyName.toLowerCase()) {
      return attributeValue(match[0], 'content');
    }
  }
  return null;
};

const jsonLdBlocks = (html, label) => {
  const blocks = [];
  for (const match of html.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      blocks.push(JSON.parse(match[1].trim()));
    } catch (error) {
      failures.push(`${label}: invalid JSON-LD: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return blocks;
};

const hasType = (value, type) => {
  const schemaType = value?.['@type'];
  return schemaType === type || (Array.isArray(schemaType) && schemaType.includes(type));
};

const isCanonicalIsoDate = (value) => {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
};

const isAbsoluteHttpUrl = (value) => {
  if (typeof value !== 'string') return false;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else files.push(absolute);
  }
  return files;
};

const routeFor = (file) => {
  const relative = path.relative(distDir, file).replaceAll(path.sep, '/');
  if (relative === 'index.html') return '/';
  return `/${relative.replace(/\/index\.html$/, '/').replace(/\.html$/, '/')}`;
};

const visibleByline = (html) => {
  for (const match of html.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)) {
    const classNames = attributeValue(`<p${match[1]}>`, 'class')?.split(/\s+/) || [];
    if (!classNames.includes('cg-blog-meta')) continue;

    return decodeHtml(match[2].replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
};

const isPublishedSource = (data, automated) => isPublicPostStatus(resolvePostStatus(data, automated));

const sourceFiles = (
  await Promise.all(
    sourceDirectories.map(async (directory) =>
      (await readOptionalDirectory(directory))
        .filter((filename) => /\.mdx?$/i.test(filename))
        .map((filename) => path.join(directory, filename))
    )
  )
).flat();

const sources = [];
for (const sourceFile of sourceFiles) {
  const relativeSource = path.relative(root, sourceFile);
  const identifier = path.basename(sourceFile).replace(/\.mdx?$/i, '');
  const source = await readFile(sourceFile, 'utf8');

  let data;
  let body;
  try {
    ({ data, body } = parseFrontmatter(source, relativeSource));
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    continue;
  }

  const explicitLanguage = typeof data.language === 'string' ? data.language : undefined;
  const inferredLanguage = inferPostLanguage([data.title, data.excerpt, data.description, body].filter(Boolean).join('\n'));
  const language = explicitLanguage || inferredLanguage;
  const automated = isAutomatedBriefing(identifier);
  const author = normalizePostAuthorInfo(data.author, data.authorType, automated);
  const authorUrl = data.authorUrl || author.url;
  const publishedDate = new Date(data.publishDate);
  const modifiedDate = new Date(data.updateDate || data.updated || data.publishDate);
  const expectedPublished = Number.isNaN(publishedDate.valueOf()) ? undefined : publishedDate.toISOString();
  const expectedModified = Number.isNaN(modifiedDate.valueOf()) ? undefined : modifiedDate.toISOString();
  const curated = sourceFile.startsWith(`${curatedSourceDir}${path.sep}`);
  const status = resolvePostStatus(data, automated);
  const published = isPublishedSource(data, automated);
  const listed = isBlogFeedPost(status, language);

  if (explicitLanguage) explicitLanguageCount += 1;
  else inferredLanguageCount += 1;
  languageCounts.set(language, (languageCounts.get(language) || 0) + 1);

  if (curated && !explicitLanguage) failures.push(`${relativeSource}: curated posts must declare language explicitly`);
  if (!validLanguages.has(language)) failures.push(`${relativeSource}: unsupported language ${String(language)}`);
  if (!expectedPublished) failures.push(`${relativeSource}: publishDate is invalid`);
  if (!expectedModified) failures.push(`${relativeSource}: updateDate/updated is invalid`);
  if (expectedPublished && expectedModified && expectedModified < expectedPublished) {
    failures.push(`${relativeSource}: updateDate/updated precedes publishDate`);
  }

  sources.push({
    identifier,
    relativeSource,
    data,
    language,
    author,
    authorUrl,
    expectedPublished,
    expectedModified,
    published,
    listed,
  });
}

const publishedCount = sources.filter((source) => source.published).length;
const unpublishedCount = sources.length - publishedCount;
const listedCount = sources.filter((source) => source.listed).length;

if (listedCount !== 345) failures.push(`expected exactly 345 entries in the blog feed; found ${listedCount}`);

if (!sourceOnly) {
  const articlePages = new Map();
  const htmlFiles = (await walk(distDir)).filter((file) => file.endsWith('.html'));

  for (const htmlFile of htmlFiles) {
    const route = routeFor(htmlFile);
    const html = await readFile(htmlFile, 'utf8');
    const article = jsonLdBlocks(html, route).find((schema) => hasType(schema, 'BlogPosting'));
    if (!article) continue;

    if (typeof article.identifier !== 'string' || !article.identifier) {
      failures.push(`${route}: article JSON-LD identifier is missing`);
      continue;
    }
    if (articlePages.has(article.identifier)) {
      failures.push(`${route}: duplicate article identifier ${article.identifier}`);
      continue;
    }
    articlePages.set(article.identifier, { route, html, article });
  }

  const sourceIdentifiers = new Set(sources.map((source) => source.identifier));
  for (const [identifier, page] of articlePages) {
    if (!sourceIdentifiers.has(identifier)) failures.push(`${page.route}: no source exists for article ${identifier}`);
  }

  for (const source of sources) {
    const page = articlePages.get(source.identifier);
    if (!source.published) {
      if (page) failures.push(`${source.relativeSource}: unpublished source emitted at ${page.route}`);
      continue;
    }
    if (!page) {
      failures.push(`${source.relativeSource}: published article has no built HTML`);
      continue;
    }

    const { route, html, article } = page;
    const canonical = linkHref(html, 'canonical');
    const openGraphUrl = metaPropertyContent(html, 'og:url');
    const openGraphLocale = metaPropertyContent(html, 'og:locale');
    const htmlLanguage = attributeValue(html.match(/<html\b[^>]*>/i)?.[0] || '', 'lang');

    if (!isAbsoluteHttpUrl(canonical)) failures.push(`${route}: HTML canonical URL is missing or invalid`);
    if (openGraphUrl !== canonical) failures.push(`${route}: og:url does not match HTML canonical`);
    if (openGraphLocale !== openGraphLocales[source.language]) {
      failures.push(`${route}: og:locale ${String(openGraphLocale)} does not match ${openGraphLocales[source.language]}`);
    }
    if (htmlLanguage !== source.language) {
      failures.push(`${route}: html lang ${String(htmlLanguage)} does not match ${source.language}`);
    }

    if (article['@context'] !== 'https://schema.org') failures.push(`${route}: invalid schema context`);
    if (article.identifier !== source.identifier) failures.push(`${route}: JSON-LD identifier does not match source`);
    if (article.headline !== source.data.title) failures.push(`${route}: JSON-LD headline does not match frontmatter`);
    if (typeof article.description !== 'string' || !article.description.trim()) {
      failures.push(`${route}: JSON-LD description is missing`);
    }
    if (!isCanonicalIsoDate(article.datePublished) || article.datePublished !== source.expectedPublished) {
      failures.push(`${route}: datePublished is not the canonical source ISO date`);
    }
    if (!isCanonicalIsoDate(article.dateModified) || article.dateModified !== source.expectedModified) {
      failures.push(`${route}: dateModified is not the canonical source ISO date`);
    }
    if (article.inLanguage !== source.language || !validLanguages.has(article.inLanguage)) {
      failures.push(`${route}: invalid inLanguage ${String(article.inLanguage)}`);
    }
    if (article.author?.['@type'] !== source.author.type || article.author?.name !== source.author.name) {
      failures.push(`${route}: author identity does not match ${source.author.type} ${source.author.name}`);
    }
    if (source.authorUrl && article.author?.url !== source.authorUrl) {
      failures.push(`${route}: author URL does not match ${source.authorUrl}`);
    }
    if (article.author?.url && !isAbsoluteHttpUrl(article.author.url)) failures.push(`${route}: author URL is invalid`);
    if (article.publisher?.['@type'] !== 'Organization' || article.publisher?.name !== 'CinaGroup') {
      failures.push(`${route}: publisher organization is missing`);
    }
    if (!isAbsoluteHttpUrl(article.publisher?.logo?.url)) failures.push(`${route}: publisher logo URL is invalid`);

    let expectedArticleId = null;
    if (isAbsoluteHttpUrl(canonical)) {
      const articleId = new URL(canonical);
      articleId.hash = 'article';
      expectedArticleId = articleId.toString();
    }
    if (article.url !== canonical) failures.push(`${route}: JSON-LD url does not match HTML canonical`);
    if (article['@id'] !== expectedArticleId) failures.push(`${route}: JSON-LD @id does not match HTML canonical`);
    if (article.mainEntityOfPage?.['@id'] !== canonical) {
      failures.push(`${route}: mainEntityOfPage does not match HTML canonical`);
    }

    const datetimes = [...html.matchAll(/<time\b[^>]*\bdatetime=["']([^"']+)["'][^>]*>/gi)].map(
      (match) => match[1]
    );
    if (!datetimes.length || datetimes.some((value) => !isCanonicalIsoDate(value))) {
      failures.push(`${route}: visible date labels must use canonical ISO datetime values`);
    }
    if (!datetimes.includes(article.datePublished)) failures.push(`${route}: visible publish date does not match JSON-LD`);

    const byline = visibleByline(html);
    if (!byline || !byline.includes(source.author.name)) {
      failures.push(`${route}: visible article byline does not contain ${source.author.name}`);
    }
  }
}

if (failures.length) {
  console.error(`Blog ${sourceOnly ? 'source' : 'structured-data'} audit failed with ${failures.length} issue(s):`);
  failures.slice(0, 100).forEach((failure) => console.error(`- ${failure}`));
  if (failures.length > 100) console.error(`- ...and ${failures.length - 100} more`);
  process.exit(1);
}

const languageSummary = [...languageCounts.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([language, count]) => `${language}=${count}`)
  .join(', ');

console.log(
  `${sourceOnly ? 'Blog source audit' : 'Blog structured-data audit'} passed: ${sources.length} sources (${publishedCount} editorially published, ${listedCount} listed archives, ${unpublishedCount} unverified); languages ${languageSummary}; ${explicitLanguageCount} explicit and ${inferredLanguageCount} inferred.`
);
