import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { load as parseYaml } from 'js-yaml';

const root = process.cwd();
const postsDirectory = path.join(root, 'src', 'data', 'post');
const shouldWrite = process.argv.includes('--write');
const expectedStatus = 'archived_unverified';
const expectedOrigin = 'automated_news_workflow';
const governanceBlock = [
  `status: ${expectedStatus}`,
  `origin: ${expectedOrigin}`,
  'verification:',
  '  status: unverified',
  '  note: "Preserved from a retired automated workflow; claims were not independently source-checked."',
].join('\n');

const parseFrontmatter = (source, filename) => {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`${filename}: missing YAML frontmatter`);

  return { match, data: parseYaml(match[1]) || {} };
};

const artifactMarkers = [/<｜end▁of▁thinking｜>/u, /<｜｜DSML｜｜/u, /<\|{1,2}DSML\|{1,2}/iu];
const residualArtifactPatterns = [
  { label: 'DSML marker', pattern: /DSML/iu },
  { label: 'model control token', pattern: /<｜[^\n>]*｜>/u },
  { label: 'tool invocation markup', pattern: /<(?:[^>\n]*)(?:tool_calls?|invoke\s+name=|parameter\s+name=)/iu },
  { label: 'Unix home path', pattern: /\/(?:home|root)\/[A-Za-z0-9._/-]+/u },
  { label: 'Windows local path', pattern: /[A-Za-z]:\\(?:Users|cinagroup)\\[^\s<]*/iu },
];

const filenames = (await readdir(postsDirectory))
  .filter((filename) => /^ai-news-briefing-.*\.mdx?$/i.test(filename))
  .sort();

let changedCount = 0;
let redactedCount = 0;
const failures = [];

for (const filename of filenames) {
  const absolute = path.join(postsDirectory, filename);
  const original = await readFile(absolute, 'utf8');
  let source = original;
  let artifactIndex = -1;

  for (const marker of artifactMarkers) {
    const index = source.search(marker);
    if (index >= 0 && (artifactIndex < 0 || index < artifactIndex)) artifactIndex = index;
  }

  if (artifactIndex >= 0) {
    source = `${source.slice(0, artifactIndex).trimEnd()}\n`;
    redactedCount += 1;
  }

  let frontmatter;
  try {
    frontmatter = parseFrontmatter(source, filename);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    continue;
  }

  const { data, match } = frontmatter;
  if (data.status && data.status !== expectedStatus) {
    failures.push(`${filename}: refusing to replace status ${String(data.status)}`);
    continue;
  }
  if (data.origin && data.origin !== expectedOrigin) {
    failures.push(`${filename}: refusing to replace origin ${String(data.origin)}`);
    continue;
  }
  if (data.verification?.status && data.verification.status !== 'unverified') {
    failures.push(`${filename}: refusing to replace verification status ${String(data.verification.status)}`);
    continue;
  }

  if (!data.status && !data.origin && !data.verification) {
    source = source.replace(/^---\r?\n/, `---\n${governanceBlock}\n`);
  } else if (data.status !== expectedStatus || data.origin !== expectedOrigin || !data.verification) {
    failures.push(`${filename}: governance metadata is incomplete; update it explicitly`);
    continue;
  }

  for (const { label, pattern } of residualArtifactPatterns) {
    if (pattern.test(source)) failures.push(`${filename}: contains ${label}`);
  }

  if (source !== original) {
    changedCount += 1;
    if (shouldWrite) await writeFile(absolute, source, 'utf8');
  }
}

if (failures.length) {
  console.error(`Briefing governance migration stopped with ${failures.length} issue(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `${shouldWrite ? 'Migrated' : 'Would migrate'} ${changedCount} of ${filenames.length} automated briefings; redacted ${redactedCount} tool-transcript artifact(s).`
);
if (!shouldWrite) console.log('Re-run with --write after reviewing the dry-run result.');
