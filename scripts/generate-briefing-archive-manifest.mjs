import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const postsDirectory = path.join(root, 'src', 'data', 'post');
const manifestPath = path.join(root, 'docs', 'briefing-archive-manifest.json');
const shouldWrite = process.argv.includes('--write');
const EXPECTED_ARCHIVE_COUNT = 346;

const filenames = (await readdir(postsDirectory))
  .filter((filename) => /^ai-news-briefing-.*\.mdx?$/i.test(filename))
  .sort();

if (filenames.length !== EXPECTED_ARCHIVE_COUNT) {
  throw new Error(
    `Refusing to generate archive manifest: expected ${EXPECTED_ARCHIVE_COUNT} briefings, found ${filenames.length}`
  );
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
