import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const legacyDirectory = path.join(root, 'blog');
const collectionDirectory = path.join(root, 'src', 'data', 'post');
const outputFile = path.join(root, 'docs', 'legacy-blog-mapping.json');
const shouldWrite = process.argv.includes('--write');

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else if (/\.mdx?$/i.test(entry.name)) files.push(absolute);
  }

  return files;
};

const sha256 = (value) => createHash('sha256').update(value.replace(/\r\n?/g, '\n')).digest('hex');

const records = [];
for (const legacyFile of (await walk(legacyDirectory)).sort()) {
  const filename = path.basename(legacyFile);
  const slug = filename.replace(/\.mdx?$/i, '');
  const counterpart = path.join(collectionDirectory, filename);
  const legacySource = await readFile(legacyFile, 'utf8');
  let collectionSource;

  try {
    collectionSource = await readFile(counterpart, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const hasCounterpart = typeof collectionSource === 'string';
  records.push({
    legacyPath: path.relative(root, legacyFile).replaceAll(path.sep, '/'),
    legacySha256: sha256(legacySource),
    slug,
    candidateHistoricalUrl: `/blog/${slug}/`,
    collectionPath: hasCounterpart ? path.relative(root, counterpart).replaceAll(path.sep, '/') : null,
    collectionSha256: hasCounterpart ? sha256(collectionSource) : null,
    relationship: hasCounterpart ? 'counterpart_present_content_variant' : 'no_collection_counterpart',
    recommendedAction: hasCounterpart
      ? 'Keep the legacy file outside the build; review provenance before declaring an alias or deleting either copy.'
      : 'Preserve for provenance review; do not import or publish until sources and ownership are verified.',
  });
}

const mapping = {
  schemaVersion: 1,
  policy: 'read_only_inventory',
  legacyRoot: 'blog/',
  collectionRoot: 'src/data/post/',
  summary: {
    total: records.length,
    counterpartPresent: records.filter((record) => record.collectionPath).length,
    uniqueLegacy: records.filter((record) => !record.collectionPath).length,
  },
  records,
};

const serialized = `${JSON.stringify(mapping, null, 2)}\n`;
if (shouldWrite) {
  await writeFile(outputFile, serialized, 'utf8');
  console.log(`Wrote ${path.relative(root, outputFile)} with ${records.length} review records.`);
} else {
  console.log(serialized);
}
