import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Last observed production source revision; reconfirm the active version before release.
export const REVIEW_BASELINE = 'a95006c11c74d1dee64643ae3149f95f16a99cb1';
const prefix = 'src/data/post/';
const filename = /^ai-news-briefing-\d{4}-\d{2}-\d{2}-(?:06|18)\.md$/;

export function verifyBriefingRelease(paths, queue, read = readFileSync) {
  const rows = new Map();
  for (const line of queue.split('\n')) {
    const match = /^\| \[(ai-news-briefing-\d{4}-\d{2}-\d{2}-(?:06|18)\.md)\]\([^)]*\)\s*\|[^|]*\|\s*(.*?)\s*\|\s*$/.exec(line);
    if (!match) continue;
    if (rows.has(match[1])) throw new Error(`Duplicate review entry: ${match[1]}`);
    rows.set(match[1], match[2]);
  }
  for (const path of paths) {
    if (!path.startsWith(prefix) || !filename.test(path.slice(prefix.length)))
      throw new Error(`Unexpected briefing path: ${path}`);
    const name = path.slice(prefix.length);
    const row = rows.get(name);
    const approval = /^approved; sha256=([a-f0-9]{64}); reviewer=([A-Za-z0-9][A-Za-z0-9._-]*); reviewed=(\d{4}-\d{2}-\d{2})$/.exec(row ?? '');
    if (!approval) throw new Error(`Missing complete review approval: ${name}`);
    const hash = createHash('sha256').update(read(path)).digest('hex');
    if (hash !== approval[1]) throw new Error(`Review approval does not match current content: ${name}`);
  }
  return paths.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = readFileSync(0, 'utf8');
  const paths = output.split('\n').filter(Boolean);
  const count = verifyBriefingRelease(paths, readFileSync('docs/briefing-review-queue.md', 'utf8'));
  console.log(`Reviewed changed briefing files: ${count}; confirm the active production baseline before releasing.`);
}
