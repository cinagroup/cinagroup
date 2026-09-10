import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { load as parseYaml } from 'js-yaml';

import { factChecks, isFactCheckComplete } from '../src/data/fact-checks.ts';
import {
  inferPostLanguage,
  isRoutablePostStatus,
  postLanguageToSiteLocale,
  resolvePostStatus,
} from '../src/utils/blog-content.js';

const root = process.cwd();
const translationDirectory = path.join(root, 'src', 'content', 'blog');
const archiveDirectory = path.join(root, 'src', 'data', 'post');
const distDirectory = path.join(root, 'dist');
const sourceOnly = process.argv.includes('--source-only');
const failures = [];

const relative = (filename) => path.relative(root, filename).replaceAll(path.sep, '/');
const parseFrontmatter = (source, filename) => {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`${filename}: missing YAML frontmatter`);
  return parseYaml(match[1]) || {};
};
const isHttpUrl = (value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const recordsByKey = new Map();
for (const record of factChecks) {
  if (!record.translationKey || recordsByKey.has(record.translationKey)) {
    failures.push(`Fact-check ledger has a missing or duplicate translationKey: ${String(record.translationKey)}`);
    continue;
  }
  recordsByKey.set(record.translationKey, record);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.checkedAt) || Number.isNaN(Date.parse(`${record.checkedAt}T00:00:00Z`))) {
    failures.push(`${record.translationKey}: checkedAt must be a valid YYYY-MM-DD date`);
  }
  if (!record.checkedBy.trim()) failures.push(`${record.translationKey}: checkedBy is required`);
  if (!record.summary.trim()) failures.push(`${record.translationKey}: summary is required`);
  if (!record.claims.length) failures.push(`${record.translationKey}: at least one reviewed claim is required`);

  for (const [claimIndex, claim] of record.claims.entries()) {
    const prefix = `${record.translationKey}: claim ${claimIndex + 1}`;
    if (!claim.claim.trim()) failures.push(`${prefix} text is required`);
    if (!claim.note.trim()) failures.push(`${prefix} note is required`);
    if (!Array.isArray(claim.sources)) failures.push(`${prefix} sources must be an array`);
    for (const source of claim.sources || []) {
      if (!isHttpUrl(source)) failures.push(`${prefix} has an invalid public source URL: ${String(source)}`);
    }
  }
}

const translationNames = (await readdir(translationDirectory)).filter((name) => /\.mdx?$/i.test(name));
const translations = [];
const routablePairs = new Map();

const registerRoutablePair = ({ translationKey, language, status, sourcePath }) => {
  if (!isRoutablePostStatus(status)) return;
  const locale = postLanguageToSiteLocale(language);
  if (!locale) {
    failures.push(`${sourcePath}: cannot map language ${String(language)} to a site locale`);
    return;
  }
  const pair = `${translationKey}\u0000${locale}`;
  const existing = routablePairs.get(pair);
  if (existing) failures.push(`${sourcePath}: duplicates routable translation locale from ${existing}`);
  else routablePairs.set(pair, sourcePath);
};

for (const name of translationNames) {
  const absolute = path.join(translationDirectory, name);
  const sourcePath = relative(absolute);
  const source = await readFile(absolute, 'utf8');
  let data;
  try {
    data = parseFrontmatter(source, sourcePath);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    continue;
  }

  const slug = name.replace(/\.mdx?$/i, '');
  const record = recordsByKey.get(data.translationKey);
  const complete = record ? isFactCheckComplete(record) : false;
  const status = resolvePostStatus(data, false);
  const language = data.language || inferPostLanguage(source);
  translations.push({ sourcePath, slug, data, record, complete, status, language });

  if (!data.translationKey) failures.push(`${sourcePath}: translationKey is required`);
  if (!record) failures.push(`${sourcePath}: fact-check ledger record is missing`);
  try {
    await access(path.join(archiveDirectory, `${data.translationKey}.md`));
  } catch {
    failures.push(`${sourcePath}: archive original ${String(data.translationKey)} is missing`);
  }

  if (status === 'published') {
    if (!complete) failures.push(`${sourcePath}: published translation has an incomplete fact-check record`);
    if (data.verification?.status !== 'fact_checked') {
      failures.push(`${sourcePath}: published translation must declare verification.status: fact_checked`);
    }
  } else if (!complete && status !== 'in_review') {
    failures.push(`${sourcePath}: incomplete fact-check must keep its translation at status: in_review`);
  }

  registerRoutablePair({ translationKey: data.translationKey, language, status, sourcePath });
}

for (const name of (await readdir(archiveDirectory)).filter((entry) => /\.mdx?$/i.test(entry))) {
  const absolute = path.join(archiveDirectory, name);
  const sourcePath = relative(absolute);
  const source = await readFile(absolute, 'utf8');
  let data;
  try {
    data = parseFrontmatter(source, sourcePath);
  } catch {
    continue;
  }
  const translationKey = name.replace(/\.mdx?$/i, '');
  const status = resolvePostStatus(data, true);
  const language = data.language || inferPostLanguage(source);
  registerRoutablePair({ translationKey, language, status, sourcePath });
}

for (const key of recordsByKey.keys()) {
  if (!translations.some((translation) => translation.data.translationKey === key)) {
    failures.push(`${key}: fact-check record has no translation source`);
  }
}

if (!sourceOnly) {
  for (const translation of translations) {
    const locale = postLanguageToSiteLocale(translation.language);
    if (!locale) continue;
    const detailPath = path.join(distDirectory, locale, 'blog', translation.slug, 'index.html');

    if (translation.status !== 'published') {
      try {
        await access(detailPath);
        failures.push(`${translation.sourcePath}: non-public translation emitted a detail route`);
      } catch {
        // Expected: in-review translations do not produce public output.
      }
      continue;
    }

    if (!translation.record) continue;

    let html;
    try {
      html = await readFile(detailPath, 'utf8');
    } catch {
      failures.push(`${translation.sourcePath}: published fact-checked detail route is missing`);
      continue;
    }

    const expectedSources = translation.record.claims.reduce((count, claim) => count + claim.sources.length, 0);
    const renderedSources = html.match(/\bdata-fact-check-source(?:=""|(?=[\s>]))/g)?.length ?? 0;
    if (!html.includes('data-fact-check-complete="true"')) {
      failures.push(`${translation.sourcePath}: complete fact-check panel is missing from built page`);
    }
    if (renderedSources !== expectedSources) {
      failures.push(
        `${translation.sourcePath}: built page renders ${renderedSources} fact-check sources; expected ${expectedSources}`
      );
    }
  }
}

const publishedCount = translations.filter((translation) => translation.status === 'published').length;
const inReviewCount = translations.filter((translation) => translation.status === 'in_review').length;
const completeRecordCount = factChecks.filter(isFactCheckComplete).length;

if (failures.length) {
  console.error(`Fact-check audit failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Fact-check ${sourceOnly ? 'source ' : ''}audit passed: ${factChecks.length} records (${completeRecordCount} complete); ${publishedCount} published and ${inReviewCount} in-review translations.`
  );
}
