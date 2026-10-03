import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { extractLegacyArticleShell } from '../src/emdash/legacy-article-shell.ts';

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
};
const exists = async (file) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};
const assets = path.resolve(option('--assets') ?? ((await exists('dist/client')) ? 'dist/client' : 'dist'));
const rendered = args.includes('--assets-only') ? undefined : path.resolve(option('--rendered') ?? 'dist/audit');
if (!(await exists(assets))) throw new Error('Compiled assets are required before verifying the legacy shell');
if (rendered && !(await exists(rendered)))
  throw new Error('Compiled Worker audit mirror is required; run render-production-audit first');
const walk = async (directory) => {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Legacy audit must not follow symlinks');
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(target)));
    else if (entry.isFile() && entry.name === 'index.html') result.push(target);
  }
  return result;
};
let checked = 0;
let archived = 0;
for (const file of await walk(assets)) {
  const relative = path.relative(assets, file).split(path.sep).join('/');
  if (!/^(?:(?:zh|ja|ko|ru|es|pt|fr)\/)?blog\/[a-z0-9]+(?:-[a-z0-9]+)*\/index\.html$/.test(relative)) continue;
  const original = await readFile(file, 'utf8');
  if (
    !/<article\b(?=[^>]*\bdata-content-status=)(?=[^>]*\bclass=["'](?:[^"']*\s)?cg-blog-post(?:\s|["']))[^>]*>/i.test(
      original
    )
  )
    continue;
  const route = '/' + relative.slice(0, -'index.html'.length);
  const url = 'https://cinagroup.com' + route;
  const article = extractLegacyArticleShell(original, url);
  assert.ok(article, route + ': controlled compiled article was rejected');
  checked++;
  if (article.archived) archived++;
  if (!rendered) continue;
  const current = await readFile(path.join(rendered, relative), 'utf8');
  assert.ok(current.includes('data-legacy-article-shell'), route + ': Worker returned the old static shell');
  const shell = extractLegacyArticleShell(current, url);
  assert.ok(shell, route + ': dynamic shell changed the controlled document shape');
  assert.equal(shell.mainHtml, article.mainHtml, route + ': immutable archive body or governance changed');
  assert.equal(shell.canonical, article.canonical, route + ': canonical changed');
  assert.equal(shell.archived, article.archived, route + ': archival status changed');
  assert.equal(shell.noIndex, article.noIndex, route + ': archival robots changed');
  assert.equal(shell.language, article.language, route + ': document language changed');
  assert.deepEqual(
    shell.languageAlternates,
    article.languageAlternates,
    route + ': language switcher destinations changed'
  );
  // Metadata and original article styles are retained as one literal fragment;
  // native favicon, theme and navigation scripts are emitted separately once.
  assert.ok(current.includes(article.headHtml), route + ': original head metadata/styles/JSON-LD changed');
  if (article.bodyScriptsHtml)
    assert.ok(current.includes(article.bodyScriptsHtml), route + ': legacy article interaction scripts disappeared');
  assert.equal((current.match(/<main(?:\s|>)/g) ?? []).length, 1, route + ': duplicate main');
  assert.equal((current.match(/<title(?:\s|>)/g) ?? []).length, 1, route + ': duplicate title');
  assert.equal(
    (current.match(/<script\b[^>]*src=["'][^"']*ClientRouter\./g) ?? []).length,
    1,
    route + ': duplicate/missing client router'
  );
}
assert.ok(checked > 0, 'No controlled compiled articles were checked');
console.log(
  'Legacy article shell verification passed: ' +
    checked +
    ' compiled articles (' +
    archived +
    ' archives), ' +
    (rendered ? 'immutable bodies and heads match Worker responses.' : 'compiled extraction shapes verified.')
);
