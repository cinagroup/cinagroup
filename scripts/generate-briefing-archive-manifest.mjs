import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const postsDirectory = path.join(root, 'src', 'data', 'post');
const manifestPath = path.join(root, 'docs', 'briefing-archive-manifest.json');
const shouldWrite = process.argv.includes('--write');

const filenames = (await readdir(postsDirectory))
  .filter((filename) => /^ai-news-briefing-.*\.mdx?$/i.test(filename))
  .sort();

// Refuse to bake a lossy/incomplete archive into the manifest: the briefing series is
// derived from the actual files (it grows by two editions per day), so instead of a
// hardcoded count we guard against duplicates and date-series gaps.
const seen = new Set();
for (const filename of filenames) {
  if (seen.has(filename)) {
    throw new Error(`Refusing to generate archive manifest: duplicate briefing ${filename}`);
  }
  seen.add(filename);
}
const editionPattern = /^ai-news-briefing-(\d{4}-\d{2}-\d{2})-(06|18)\.mdx?$/;
const datedSeries = filenames
  .map((filename) => filename.match(editionPattern))
  .filter(Boolean)
  .map((match) => ({ date: match[1], edition: match[2] }))
  .sort((a, b) => (a.date === b.date ? a.edition.localeCompare(b.edition) : a.date.localeCompare(b.date)));
if (datedSeries.length >= 2) {
  const editionsByDate = new Map();
  for (const { date, edition } of datedSeries) {
    const editions = editionsByDate.get(date) || new Set();
    editions.add(edition);
    editionsByDate.set(date, editions);
  }
  // Check contiguity only over the trailing 14 calendar days of the series. Older gaps
  // are legitimate history (editions were skipped during outages), so a full-series
  // exact count would only produce false alarms; the recent window still catches
  // accidental deletions or pipeline regressions before they get baked into the archive.
  const allDates = [...editionsByDate.keys()].sort();
  const windowStart = allDates[Math.max(0, allDates.length - 14)];
  const lastDate = allDates[allDates.length - 1];
  const cursor = new Date(`${windowStart}T00:00:00Z`);
  const end = new Date(`${lastDate}T00:00:00Z`);
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    const editions = editionsByDate.get(date) || new Set();
    if (date === lastDate) {
      if (!editions.has('06')) {
        throw new Error(`Refusing to generate archive manifest: missing ${date} 06:00 edition`);
      }
    } else if (!editions.has('06') || !editions.has('18')) {
      throw new Error(`Refusing to generate archive manifest: missing ${date} edition(s)`);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

const records = await Promise.all(
  filenames.map(async (filename) => {
    const sourcePath = `src/data/post/${filename}`;
    const source = (await readFile(path.join(postsDirectory, filename), 'utf8')).replace(/\r\n?/g, '\n');
    return {
      slug: filename.replace(/\.mdx?$/i, ''),
      sourcePath,
      sha256: createHash('sha256').update(source).digest('hex'),
    };
  })
);

const manifest = `${JSON.stringify(
  {
    version: 1,
    policy: 'immutable_historical_archive',
    count: records.length,
    records,
  },
  null,
  2
)}\n`;

if (shouldWrite) {
  await writeFile(manifestPath, manifest, 'utf8');
  console.log(`Wrote ${records.length} immutable archive records to ${path.relative(root, manifestPath)}.`);
} else {
  let current = '';
  try {
    current = await readFile(manifestPath, 'utf8');
  } catch {
    // Missing manifests are reported as a dry-run difference below.
  }
  console.log(
    current === manifest
      ? `Archive manifest is current (${records.length} records).`
      : `Archive manifest would change (${records.length} records); re-run with --write after review.`
  );
}
