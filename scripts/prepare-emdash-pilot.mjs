import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizePortableTextTable } from '@emdash-cms/admin/portable-text-table';
import yaml from 'js-yaml';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import { validateSeed } from 'emdash/seed';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BLOG_DIR = resolve(ROOT, 'src/content/blog');
const MODEL_PATH = resolve(ROOT, 'seed/seed.json');
const SITE_ORIGIN = 'https://cinagroup.com';
const PILOT_FILES = [
  'src/content/blog/news-briefing-2026-06-15-06-zh.md',
  'src/content/blog/news-briefing-2026-03-20-zh.md',
  'src/content/blog/news-briefing-2026-03-20-ja.md',
];
const STATUS_VALUES = new Set([
  'draft',
  'in_review',
  'approved',
  'scheduled',
  'published',
  'archived_unverified',
  'withdrawn',
]);
const ORIGIN_VALUES = new Set([
  'editorial',
  'automated_news_workflow',
  'imported_legacy',
  'partner',
  'press_release',
]);
const VERIFICATION_VALUES = new Set(['unverified', 'source_reviewed', 'fact_checked', 'primary_source_confirmed']);
const REVIEW_VALUES = new Set(['pending', 'changes_requested', 'approved']);
const SOURCE_KIND_VALUES = new Set(['primary', 'secondary', 'press_release', 'dataset', 'other']);
const LANGUAGE_TO_LOCALE = {
  en: 'en',
  'zh-CN': 'zh',
  ja: 'ja',
  ko: 'ko',
  ru: 'ru',
  es: 'es',
  'pt-BR': 'pt',
  fr: 'fr',
};
const FRONTMATTER_FIELDS = new Set([
  'status',
  'origin',
  'language',
  'translationKey',
  'title',
  'excerpt',
  'description',
  'publishDate',
  'updateDate',
  'updated',
  'author',
  'authorType',
  'authorUrl',
  'image',
  'sources',
  'verification',
  'review',
  'reviewedBy',
  'reviewedAt',
  'correction',
  'correctionNote',
  'aliases',
  'metadata',
]);

export class PilotError extends Error {}

function fail(source, message, node) {
  const line = node?.position?.start?.line;
  throw new PilotError(`${source}${line ? `:${line}` : ''}: ${message}`);
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertFields(value, allowed, source, label) {
  if (!record(value)) fail(source, `${label} must be an object`);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) fail(source, `unsupported ${label} fields: ${unknown.join(', ')}`);
}

function iso(value, source, label) {
  if (value === undefined || value === null) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) fail(source, `${label} must be a valid date`);
  return date.toISOString();
}

function text(value, source, label, required = false) {
  if (value === undefined || value === null) {
    if (required) fail(source, `${label} is required`);
    return undefined;
  }
  if (typeof value !== 'string' || (required && !value.trim())) {
    fail(source, `${label} must be a non-empty string`);
  }
  return value;
}

function webUrl(value, source, label) {
  const input = text(value, source, label, true);
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return input;
  } catch {
    fail(source, `${label} must be an absolute HTTP(S) URL without credentials`);
  }
}

function parseMarkdownSource(source, path) {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!match) fail(path, 'missing or malformed YAML frontmatter');
  let frontmatter;
  try {
    frontmatter = yaml.load(match[1]);
  } catch (error) {
    fail(path, `invalid YAML: ${error.message}`);
  }
  assertFields(frontmatter, FRONTMATTER_FIELDS, path, 'frontmatter');
  const body = source.slice(match[0].length);
  if (!body.trim()) fail(path, 'empty Markdown body');
  return { frontmatter, body, hash: createHash('sha256').update(source).digest('hex') };
}

function createKeys(source) {
  let sequence = 0;
  return () => createHash('sha256').update(`${source}:${sequence++}`).digest('hex').slice(0, 16);
}

function inline(nodes, source, key) {
  const children = [];
  const markDefs = [];

  function visit(node, marks = []) {
    switch (node.type) {
      case 'text':
      case 'inlineCode':
      case 'break': {
        const content = node.type === 'break' ? '\n' : node.value;
        if (typeof content !== 'string') fail(source, `invalid ${node.type} content`, node);
        children.push({ _type: 'span', _key: key(), text: content, marks: [...marks, ...(node.type === 'inlineCode' ? ['code'] : [])] });
        return;
      }
      case 'strong':
      case 'emphasis':
      case 'delete': {
        const mark = node.type === 'strong' ? 'strong' : node.type === 'emphasis' ? 'em' : 'strike-through';
        node.children.forEach((child) => visit(child, [...marks, mark]));
        return;
      }
      case 'link': {
        if (node.title) fail(source, 'titled Markdown links need a manual conversion', node);
        const href = node.url;
        if (typeof href !== 'string' || !(href.startsWith('/') && !href.startsWith('//') || href.startsWith('#') || /^https?:\/\//i.test(href))) {
          fail(source, `unsafe or unsupported link URL: ${href}`, node);
        }
        if (/^https?:\/\//i.test(href)) webUrl(href, source, 'Markdown link');
        const mark = key();
        markDefs.push({ _type: 'link', _key: mark, href });
        node.children.forEach((child) => visit(child, [...marks, mark]));
        return;
      }
      default:
        fail(source, `unsupported inline Markdown construct: ${node.type}`, node);
    }
  }

  nodes.forEach((node) => visit(node));
  if (!children.length) children.push({ _type: 'span', _key: key(), text: '', marks: [] });
  return { children, markDefs };
}

export function markdownToPortableText(body, source = '<markdown>') {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body);
  const key = createKeys(source);
  const blocks = [];

  function textBlock(node, style = 'normal', list = {}) {
    const { children, markDefs } = inline(node.children, source, key);
    blocks.push({ _type: 'block', _key: key(), style, ...list, children, markDefs });
  }

  function visit(node) {
    switch (node.type) {
      case 'paragraph':
        textBlock(node);
        return;
      case 'heading':
        if (!Number.isInteger(node.depth) || node.depth < 1 || node.depth > 6) {
          fail(source, 'unsupported heading depth', node);
        }
        textBlock(node, `h${node.depth}`);
        return;
      case 'blockquote':
        if (!node.children.every((child) => child.type === 'paragraph')) {
          fail(source, 'blockquote contains unsupported nested blocks', node);
        }
        node.children.forEach((child) => textBlock(child, 'blockquote'));
        return;
      case 'thematicBreak':
        blocks.push({ _type: 'break', _key: key(), style: 'lineBreak' });
        return;
      case 'code':
        if (node.meta) fail(source, 'code-fence metadata needs manual conversion', node);
        blocks.push({ _type: 'code', _key: key(), code: node.value, ...(node.lang ? { language: node.lang } : {}) });
        return;
      case 'list':
        list(node, 1);
        return;
      case 'table':
        table(node);
        return;
      default:
        fail(source, `unsupported block Markdown construct: ${node.type}`, node);
    }
  }

  function list(node, level) {
    if (!node.children.length) fail(source, 'empty list needs manual conversion', node);
    const listItem = node.ordered ? 'number' : 'bullet';
    node.children.forEach((item, index) => {
      if (item.checked !== null && item.checked !== undefined) fail(source, 'task-list checkboxes need manual conversion', item);
      const paragraphs = item.children.filter((child) => child.type === 'paragraph');
      if (paragraphs.length !== 1 || item.children.some((child) => child.type !== 'paragraph' && child.type !== 'list')) {
        fail(source, 'multi-paragraph or non-text list item needs manual conversion', item);
      }
      textBlock(paragraphs[0], 'normal', {
        listItem,
        level,
        ...(index === 0 && node.ordered && node.start && node.start !== 1 ? { listStart: node.start } : {}),
      });
      item.children.filter((child) => child.type === 'list').forEach((child) => list(child, level + 1));
    });
  }

  function table(node) {
    const width = node.children[0]?.children.length;
    if (!width || node.children.some((row) => row.children.length !== width)) {
      fail(source, 'ragged or empty Markdown table needs manual conversion', node);
    }
    const rows = node.children.map((row, rowIndex) => ({
      _type: 'tableRow',
      _key: key(),
      cells: row.children.map((cell, column) => {
        const { children, markDefs } = inline(cell.children, source, key);
        return {
          _type: 'tableCell',
          _key: key(),
          content: children,
          markDefs,
          ...(rowIndex === 0 ? { isHeader: true } : {}),
          ...(node.align[column] ? { textAlign: node.align[column] } : {}),
        };
      }),
    }));
    const candidate = { _type: 'table', _key: key(), rows, hasHeaderRow: true };
    const normalized = normalizePortableTextTable(candidate, { path: source, createKey: key });
    if (!normalized.ok) fail(source, `EmDash rejected Markdown table: ${normalized.reason}`, node);
    blocks.push(normalized.table);
  }

  tree.children.forEach(visit);
  if (!blocks.length) fail(source, 'Markdown body produced no Portable Text');
  return blocks;
}

function sourceRows(value, source) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(source, 'sources must be an array');
  return value.map((item, index) => {
    const label = `sources[${index}]`;
    if (typeof item === 'string') {
      const url = webUrl(item, source, label);
      return { title: new URL(url).hostname, url };
    }
    assertFields(item, new Set(['title', 'url', 'kind', 'publisher', 'publishedAt', 'accessedAt']), source, label);
    if (item.kind !== undefined && !SOURCE_KIND_VALUES.has(item.kind)) {
      fail(source, `unsupported ${label}.kind: ${item.kind}`);
    }
    return {
      title: text(item.title, source, `${label}.title`, true),
      url: webUrl(item.url, source, `${label}.url`),
      ...(item.kind ? { kind: text(item.kind, source, `${label}.kind`) } : {}),
      ...(item.publisher ? { publisher: text(item.publisher, source, `${label}.publisher`) } : {}),
      ...(item.publishedAt ? { published_at: iso(item.publishedAt, source, `${label}.publishedAt`) } : {}),
      ...(item.accessedAt ? { accessed_at: iso(item.accessedAt, source, `${label}.accessedAt`) } : {}),
    };
  });
}

function governanceData(front, source) {
  const verification = front.verification ?? {};
  const review = front.review ?? {};
  const correction = front.correction ?? {};
  assertFields(verification, new Set(['status', 'verifiedBy', 'verifiedAt', 'note']), source, 'verification');
  assertFields(review, new Set(['status', 'reviewedBy', 'reviewedAt', 'note']), source, 'review');
  assertFields(correction, new Set(['note', 'correctedAt']), source, 'correction');
  if (verification.status !== undefined && !VERIFICATION_VALUES.has(verification.status)) {
    fail(source, `unsupported verification status: ${verification.status}`);
  }
  if (review.status !== undefined && !REVIEW_VALUES.has(review.status)) {
    fail(source, `unsupported review status: ${review.status}`);
  }

  if (front.reviewedBy && review.reviewedBy && front.reviewedBy !== review.reviewedBy) {
    fail(source, 'conflicting reviewer fields');
  }
  if (front.reviewedAt && review.reviewedAt && iso(front.reviewedAt, source, 'reviewedAt') !== iso(review.reviewedAt, source, 'review.reviewedAt')) {
    fail(source, 'conflicting review dates');
  }
  if (front.correctionNote && correction.note && front.correctionNote !== correction.note) {
    fail(source, 'conflicting correction notes');
  }

  const originalStatus = text(front.status, source, 'status', true);
  if (!STATUS_VALUES.has(originalStatus)) fail(source, `unsupported status: ${originalStatus}`);
  const origin = text(front.origin, source, 'origin', true);
  if (!ORIGIN_VALUES.has(origin)) fail(source, `unsupported origin: ${origin}`);
  const editorialStatus = ['archived_unverified', 'withdrawn'].includes(originalStatus)
    ? originalStatus
    : ['published', 'scheduled', 'approved'].includes(originalStatus)
      ? 'in_review'
      : originalStatus;

  return {
    editorial_status: editorialStatus,
    legacy_status: originalStatus,
    origin,
    sources: sourceRows(front.sources, source),
    verification_status: verification.status ?? 'unverified',
    ...(verification.verifiedBy ? { verified_by: text(verification.verifiedBy, source, 'verification.verifiedBy') } : {}),
    ...(verification.verifiedAt ? { verified_at: iso(verification.verifiedAt, source, 'verification.verifiedAt') } : {}),
    ...(verification.note ? { verification_note: text(verification.note, source, 'verification.note') } : {}),
    review_status: review.status ?? 'pending',
    ...((review.reviewedBy ?? front.reviewedBy) ? { reviewed_by: text(review.reviewedBy ?? front.reviewedBy, source, 'reviewedBy') } : {}),
    ...((review.reviewedAt ?? front.reviewedAt) ? { reviewed_at: iso(review.reviewedAt ?? front.reviewedAt, source, 'reviewedAt') } : {}),
    ...(review.note ? { review_note: text(review.note, source, 'review.note') } : {}),
    ...((correction.note ?? front.correctionNote) ? { correction_note: text(correction.note ?? front.correctionNote, source, 'correction.note') } : {}),
    ...(correction.correctedAt ? { corrected_at: iso(correction.correctedAt, source, 'correction.correctedAt') } : {}),
    ...(front.aliases ? { aliases: front.aliases.map((path) => ({ path: text(path, source, 'alias', true) })) } : {}),
  };
}

function assertCanonical(front, locale, slug, source) {
  const expectedPath = `${locale === 'en' ? '' : `/${locale}`}/blog/${slug}/`;
  const canonical = front.metadata?.canonical;
  if (canonical === undefined) return `${SITE_ORIGIN}${expectedPath}`;
  assertFields(front.metadata, new Set(['canonical']), source, 'metadata');
  const url = new URL(webUrl(canonical, source, 'metadata.canonical'));
  if (url.origin !== SITE_ORIGIN || url.pathname !== expectedPath || url.search || url.hash) {
    fail(source, `canonical conflicts with slug/locale route; expected ${SITE_ORIGIN}${expectedPath}`);
  }
  return url.href;
}

export function prepareMarkdownSource(source, rel) {
  const { frontmatter: front, body, hash } = parseMarkdownSource(source, rel);
  const slug = basename(rel, extname(rel));
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail(rel, `unsupported slug: ${slug}`);
  if (slug.startsWith('ai-news-briefing-')) fail(rel, 'automated English briefing slugs are immutable archives');
  const language = text(front.language, rel, 'language', true);
  const locale = LANGUAGE_TO_LOCALE[language];
  if (!locale) fail(rel, `unsupported language: ${language}`);
  const suffix = /-(en|zh|ja|ko|ru|es|pt|fr)$/.exec(slug)?.[1];
  if (suffix && suffix !== locale) fail(rel, `slug suffix ${suffix} conflicts with language ${language}`);
  const canonical = assertCanonical(front, locale, slug, rel);
  if (front.metadata !== undefined && (!record(front.metadata) || !front.metadata.canonical)) {
    fail(rel, 'metadata contains unsupported fields');
  }
  if (front.updated && front.updateDate && iso(front.updated, rel, 'updated') !== iso(front.updateDate, rel, 'updateDate')) {
    fail(rel, 'conflicting update dates');
  }
  if (front.image !== undefined) fail(rel, 'image frontmatter needs an explicit media mapping before import');
  if (front.aliases !== undefined && (!Array.isArray(front.aliases) || !front.aliases.every((alias) => typeof alias === 'string'))) {
    fail(rel, 'aliases must be an array of paths');
  }
  if (front.authorType !== undefined && !['Organization', 'Person'].includes(front.authorType)) {
    fail(rel, `unsupported authorType: ${front.authorType}`);
  }

  const data = {
    title: text(front.title, rel, 'title', true),
    ...(front.excerpt ? { excerpt: text(front.excerpt, rel, 'excerpt') } : {}),
    ...(front.description ? { description: text(front.description, rel, 'description') } : {}),
    content: markdownToPortableText(body, rel),
    ...governanceData(front, rel),
    publish_date: iso(front.publishDate, rel, 'publishDate'),
    ...((front.updateDate ?? front.updated) ? { update_date: iso(front.updateDate ?? front.updated, rel, 'updateDate') } : {}),
    translation_key: text(front.translationKey ?? slug, rel, 'translationKey', true),
    ...(front.author ? { author_name: text(front.author, rel, 'author') } : {}),
    ...(front.authorType ? { author_type: text(front.authorType, rel, 'authorType') } : {}),
    ...(front.authorUrl ? { author_url: webUrl(front.authorUrl, rel, 'authorUrl') } : {}),
    legacy_source_path: rel,
    legacy_source_hash: hash,
  };
  if (!data.publish_date) fail(rel, 'publishDate is required');
  return {
    entry: { id: `pilot-${slug}`, slug, status: 'draft', locale, data },
    report: { source: rel, slug, locale, canonical, originalStatus: front.status, sourceCount: data.sources.length },
  };
}

export function preparePost(filePath) {
  const absolute = resolve(ROOT, filePath);
  const rel = relative(ROOT, absolute).split(sep).join('/');
  if (!absolute.startsWith(`${BLOG_DIR}${sep}`) || !/\.md$/i.test(absolute)) {
    fail(rel, 'pilot accepts only src/content/blog/*.md; immutable archives and MDX need separate review');
  }
  if (!existsSync(absolute)) fail(rel, 'file does not exist');
  return prepareMarkdownSource(readFileSync(absolute, 'utf8'), rel);
}

export function preparePilot(paths = PILOT_FILES) {
  if (!Array.isArray(paths) || !paths.length) throw new PilotError('select at least one Markdown file');
  const prepared = paths.map(preparePost);
  const byRoute = new Map();
  const byTranslation = new Map();

  for (const { entry, report } of prepared) {
    const route = `${entry.locale}:${entry.slug}`;
    if (byRoute.has(route)) fail(report.source, `duplicate slug/locale ${route} also in ${byRoute.get(route)}`);
    byRoute.set(route, report.source);
    const translation = `${entry.locale}:${entry.data.translation_key}`;
    if (byTranslation.has(translation)) fail(report.source, `duplicate translationKey/locale ${translation} also in ${byTranslation.get(translation)}`);
    byTranslation.set(translation, report.source);
  }

  const grouped = new Map();
  for (const { entry } of prepared) {
    const previous = grouped.get(entry.data.translation_key);
    if (previous) entry.translationOf = previous;
    else grouped.set(entry.data.translation_key, entry.id);
  }

  const model = JSON.parse(readFileSync(MODEL_PATH, 'utf8'));
  if (Object.values(model.content ?? {}).some((entries) => entries.length)) {
    throw new PilotError('seed/seed.json unexpectedly contains content; refusing to mix pilot entries');
  }
  const postFields = new Map(model.collections?.find((collection) => collection.slug === 'posts')?.fields?.map((field) => [field.slug, field]));
  if (!postFields.size) throw new PilotError('seed/seed.json has no posts content model');
  for (const { entry, report } of prepared) {
    for (const [name, value] of Object.entries(entry.data)) {
      const field = postFields.get(name);
      if (!field) fail(report.source, `pilot field ${name} is missing from the EmDash content model`);
      if (field.type === 'select' && !field.validation?.options?.includes(value)) {
        fail(report.source, `pilot value ${name}=${value} is outside the EmDash content model`);
      }
    }
  }
  const seed = {
    ...model,
    meta: { ...model.meta, name: 'CinaGroup Pilot Drafts', description: 'Local dry-run conversion. All entries are drafts and require fresh editorial approval.' },
    content: { posts: prepared.map(({ entry }) => entry) },
  };
  const validation = validateSeed(seed);
  if (!validation.valid) throw new PilotError(`EmDash seed validation failed: ${validation.errors.join('; ')}`);
  return { seed, report: prepared.map(({ report }) => report), warnings: validation.warnings };
}

function main(args) {
  let out;
  const paths = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) paths.push(args[++i]);
    else if (args[i] === '--out' && args[i + 1]) out = args[++i];
    else if (args[i] === '--help') {
      console.log('Usage: node scripts/prepare-emdash-pilot.mjs [--file src/content/blog/name.md ...] [--out draft-seed.json]');
      return;
    } else throw new PilotError(`unknown or incomplete argument: ${args[i]}`);
  }
  const { seed, report, warnings } = preparePilot(paths.length ? paths : PILOT_FILES);
  const json = `${JSON.stringify(seed, null, 2)}\n`;
  if (out) {
    const absolute = resolve(out);
    if (absolute === MODEL_PATH || absolute === resolve(ROOT, '.emdash/seed.json')) {
      throw new PilotError('refusing to overwrite the site model seed');
    }
    writeFileSync(absolute, json, { flag: 'wx' });
  } else process.stdout.write(json);
  console.error(JSON.stringify({ draftCount: report.length, entries: report, warnings, remoteCollisionCheck: 'not performed; compare against CMS before any manual import' }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
