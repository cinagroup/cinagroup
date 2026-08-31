import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { load as parseYaml } from 'js-yaml';

import {
  POST_ORIGINS,
  POST_STATUSES,
  isAutomatedBriefing,
  isPublicPostStatus,
  isRoutablePostStatus,
  resolvePostStatus,
} from '../src/utils/blog-content.js';

const root = process.cwd();
const distDirectory = path.join(root, 'dist');
const sourceDirectories = [path.join(root, 'src', 'data', 'post'), path.join(root, 'src', 'content', 'blog')];
const archiveManifestPath = path.join(root, 'docs', 'briefing-archive-manifest.json');
const sourceOnly = process.argv.includes('--source-only');
const EXPECTED_ARCHIVE_COUNT = 346;
const failures = [];

const walk = async (directory, filter = () => true) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute, filter)));
    else if (filter(absolute)) files.push(absolute);
  }

  return files;
};

const parseFrontmatter = (source, filename) => {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`${filename}: missing YAML frontmatter`);
  return { data: parseYaml(match[1]) || {} };
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const normalizedSha256 = (value) => sha256(value.replace(/\r\n?/g, '\n'));
const relative = (absolute) => path.relative(root, absolute).replaceAll(path.sep, '/');
const artifactPatterns = [
  { label: 'DSML marker', pattern: /DSML/iu },
  { label: 'model control token', pattern: /<｜[^\n>]*｜>/u },
  { label: 'tool invocation markup', pattern: /<(?:[^>\n]*)(?:tool_calls?|invoke\s+name=|parameter\s+name=)/iu },
  { label: 'Unix home path', pattern: /\/(?:home|root)\/[A-Za-z0-9._/-]+/u },
  { label: 'Windows local path', pattern: /[A-Za-z]:\\(?:Users|cinagroup)\\[^\s<]*/iu },
];

const sourceFiles = (
  await Promise.all(
    sourceDirectories.map(async (directory) =>
      (await readdir(directory))
        .filter((filename) => /\.mdx?$/i.test(filename))
        .map((filename) => path.join(directory, filename))
    )
  )
).flat();

const sources = [];
for (const sourceFile of sourceFiles) {
  const sourcePath = relative(sourceFile);
  const slug = path.basename(sourceFile).replace(/\.mdx?$/i, '');
  const source = await readFile(sourceFile, 'utf8');
  let data;

  try {
    ({ data } = parseFrontmatter(source, sourcePath));
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    continue;
  }

  const automated = isAutomatedBriefing(slug);
  const status = resolvePostStatus(data, automated);

  if (!POST_STATUSES.includes(data.status)) failures.push(`${sourcePath}: explicit status is required`);
  if (!POST_ORIGINS.includes(data.origin)) failures.push(`${sourcePath}: explicit origin is required`);
  if (data.status !== status) failures.push(`${sourcePath}: declared status does not resolve to ${status}`);

  if (automated) {
    if (data.status !== 'archived_unverified') failures.push(`${sourcePath}: automated briefing must be archived`);
    if (data.origin !== 'automated_news_workflow') failures.push(`${sourcePath}: automated briefing origin is invalid`);
    if (data.verification?.status !== 'unverified') {
      failures.push(`${sourcePath}: automated briefing must carry unverified verification status`);
    }

    for (const { label, pattern } of artifactPatterns) {
      if (pattern.test(source)) failures.push(`${sourcePath}: contains leaked ${label}`);
    }
  }

  sources.push({ sourcePath, slug, data, status, automated, sourceSha256: normalizedSha256(source) });
}

if (resolvePostStatus({}, false) !== 'in_review' || resolvePostStatus({ published: true }, false) !== 'in_review') {
  failures.push('Legacy or missing publication flags must fail closed to in_review');
}
if (resolvePostStatus({ status: 'published' }, true) !== 'archived_unverified') {
  failures.push('Automated briefing filenames must fail closed to archived_unverified');
}

const publicSources = sources.filter((source) => isPublicPostStatus(source.status));
const archivedSources = sources.filter((source) => source.status === 'archived_unverified');
const nonRoutableSources = sources.filter((source) => !isRoutablePostStatus(source.status));

if (!archivedSources.length) failures.push('No archived briefing sources were found');
if (archivedSources.some((source) => !source.automated)) {
  failures.push('A non-automated source is archived; confirm its migration and audit expectations explicitly');
}

let archiveManifest;
try {
  archiveManifest = JSON.parse(await readFile(archiveManifestPath, 'utf8'));
} catch (error) {
  failures.push(`Archive manifest is missing or invalid: ${error instanceof Error ? error.message : String(error)}`);
}

if (archiveManifest) {
  const records = Array.isArray(archiveManifest.records) ? archiveManifest.records : [];
  const manifestBySlug = new Map();
  const automatedSources = sources.filter((source) => source.automated);

  if (archiveManifest.policy !== 'immutable_historical_archive') {
    failures.push('Archive manifest policy must remain immutable_historical_archive');
  }
  if (archiveManifest.count !== EXPECTED_ARCHIVE_COUNT || records.length !== EXPECTED_ARCHIVE_COUNT) {
    failures.push(
      `Archive manifest must contain exactly ${EXPECTED_ARCHIVE_COUNT} records; found ${records.length}`
    );
  }

  for (const record of records) {
    if (!record?.slug || manifestBySlug.has(record.slug)) {
      failures.push(`Archive manifest contains a missing or duplicate slug: ${String(record?.slug)}`);
      continue;
    }
    manifestBySlug.set(record.slug, record);
  }

  if (automatedSources.length !== EXPECTED_ARCHIVE_COUNT) {
    failures.push(
      `Expected exactly ${EXPECTED_ARCHIVE_COUNT} automated archive sources; found ${automatedSources.length}`
    );
  }

  for (const source of automatedSources) {
    const record = manifestBySlug.get(source.slug);
    if (!record) {
      failures.push(`${source.sourcePath}: missing from immutable archive manifest`);
      continue;
    }
    if (record.sourcePath !== source.sourcePath) failures.push(`${source.sourcePath}: manifest source path is stale`);
    if (record.sha256 !== source.sourceSha256) failures.push(`${source.sourcePath}: manifest source hash is stale`);
  }

  for (const record of records) {
    if (!automatedSources.some((source) => source.slug === record.slug)) {
      failures.push(`${record.sourcePath || record.slug}: immutable archive source is missing`);
    }
  }
}

const repositoryMutation = /\bgit\s+(?:add|commit|push|pull|fetch|clone)\b/iu;
const fabricationPrompt =
  /fresh\s*,?\s*plausible|could have been relevant|make each briefing unique|TOPICS_POOL|openclaw\s+infer/iu;
const retiredAutomation = [
  'scripts/news-briefing-auto-publish.sh',
  'scripts/news-briefing-regenerate-all.sh',
  'scripts/fix-template-briefings.py',
];

for (const filename of retiredAutomation) {
  const source = await readFile(path.join(root, filename), 'utf8');
  if (!/retired|disabled/iu.test(source)) failures.push(`${filename}: retirement must be explicit`);
  if (repositoryMutation.test(source)) failures.push(`${filename}: contains repository mutation`);
  if (fabricationPrompt.test(source)) failures.push(`${filename}: contains an unsourced fabrication template`);
}

for (const filename of ['scripts/backup-cron-jobs.sh', 'scripts/backup-memory.sh', 'scripts/memory-backup.sh']) {
  const source = await readFile(path.join(root, filename), 'utf8');
  if (repositoryMutation.test(source)) failures.push(`${filename}: backup job contains repository mutation`);
}

const mappingPath = path.join(root, 'docs', 'legacy-blog-mapping.json');
const mapping = JSON.parse(await readFile(mappingPath, 'utf8'));
const legacyFiles = (await walk(path.join(root, 'blog'), (filename) => /\.mdx?$/i.test(filename))).sort();
const mappedPaths = new Set(mapping.records?.map((record) => record.legacyPath));

if (mapping.policy !== 'read_only_inventory') failures.push('Legacy mapping policy must remain read_only_inventory');
if (mapping.summary?.total !== legacyFiles.length) failures.push('Legacy mapping total is stale');
if (mappedPaths.size !== legacyFiles.length) failures.push('Legacy mapping paths are incomplete or duplicated');

for (const legacyFile of legacyFiles) {
  const legacyPath = relative(legacyFile);
  const record = mapping.records?.find((candidate) => candidate.legacyPath === legacyPath);
  if (!record) {
    failures.push(`${legacyPath}: missing from legacy mapping`);
    continue;
  }

  const legacySource = await readFile(legacyFile, 'utf8');
  if (record.legacySha256 !== normalizedSha256(legacySource)) failures.push(`${legacyPath}: legacy hash is stale`);
  if (record.collectionPath) {
    const collectionSource = await readFile(path.join(root, record.collectionPath), 'utf8');
    if (record.collectionSha256 !== normalizedSha256(collectionSource)) {
      failures.push(`${legacyPath}: collection counterpart hash is stale`);
    }
  }
}

if (!sourceOnly) {
  try {
    const distStats = await stat(distDirectory);
    if (!distStats.isDirectory()) throw new Error('not a directory');
  } catch {
    failures.push('dist/ is missing; build the site before running the full governance audit');
  }

  if (!failures.some((failure) => failure.startsWith('dist/ is missing'))) {
    const archivedDetailPaths = new Set(
      archivedSources.map((source) => `blog/${source.slug}/index.html`.replaceAll('/', path.sep))
    );

    for (const source of sources) {
      const relativeDetail = `blog/${source.slug}/index.html`.replaceAll('/', path.sep);
      const detailPath = path.join(distDirectory, relativeDetail);
      let html;

      try {
        html = await readFile(detailPath, 'utf8');
      } catch (error) {
        if (isRoutablePostStatus(source.status)) failures.push(`${source.sourcePath}: expected detail route is missing`);
        continue;
      }

      if (!isRoutablePostStatus(source.status)) {
        failures.push(`${source.sourcePath}: non-routable status emitted a detail route`);
        continue;
      }

      if (source.status === 'archived_unverified') {
        if (!/data-content-status=["']archived_unverified["']/i.test(html)) {
          failures.push(`${source.sourcePath}: archive status marker is missing from detail page`);
        }
        if (!/Unverified historical archive/i.test(html)) {
          failures.push(`${source.sourcePath}: archive warning is missing from detail page`);
        }

        const robotsTag = [...html.matchAll(/<meta\b[^>]*>/gi)].find((match) =>
          /\bname=["']robots["']/i.test(match[0])
        )?.[0];
        const robotsContent = robotsTag?.match(/\bcontent=["']([^"']*)["']/i)?.[1]?.toLowerCase() || '';
        if (!robotsContent.includes('noindex') || !robotsContent.includes('follow')) {
          failures.push(`${source.sourcePath}: archive route must be noindex,follow`);
        }
        if (/"@type"\s*:\s*"BlogPosting"/i.test(html)) {
          failures.push(`${source.sourcePath}: unverified archive emits BlogPosting structured data`);
        }
      }
    }

    const publicSurfaceFiles = (await walk(distDirectory, (filename) => /\.(?:html|xml)$/i.test(filename))).filter(
      (filename) => !archivedDetailPaths.has(path.relative(distDirectory, filename))
    );
    const archivedSlugPattern = /ai-news-briefing-[a-z0-9-]+/gi;
    const archivedSlugs = new Set(archivedSources.map((source) => source.slug));

    for (const filename of publicSurfaceFiles) {
      const builtSource = await readFile(filename, 'utf8');
      const leakedSlugs = new Set(
        [...builtSource.matchAll(archivedSlugPattern)].map((match) => match[0].toLowerCase()).filter((slug) => archivedSlugs.has(slug))
      );
      if (leakedSlugs.size) {
        failures.push(`${relative(filename)}: exposes archived briefing link(s): ${[...leakedSlugs].slice(0, 3).join(', ')}`);
      }
    }
  }
}

if (failures.length) {
  console.error(`Content governance audit failed with ${failures.length} issue(s):`);
  failures.slice(0, 100).forEach((failure) => console.error(`- ${failure}`));
  if (failures.length > 100) console.error(`- ...and ${failures.length - 100} more`);
  process.exit(1);
}

const statusSummary = POST_STATUSES.map(
  (status) => `${status}=${sources.filter((source) => source.status === status).length}`
).join(', ');

console.log(
  `Content governance ${sourceOnly ? 'source ' : ''}audit passed: ${sources.length} sources; ${statusSummary}; ${mapping.summary.total} legacy records (${mapping.summary.counterpartPresent} counterparts, ${mapping.summary.uniqueLegacy} unique).`
);
