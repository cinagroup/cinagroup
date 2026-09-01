import { access, readFile, readdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { hasTopLevelMarkdownHeading } from './normalize-markdown-headings.mjs';

const root = process.cwd();
const execFileAsync = promisify(execFile);
const distDir = path.join(root, 'dist');
const automatedSourceDir = path.join(root, 'src', 'data', 'post');
const curatedSourceDir = path.join(root, 'src', 'content', 'blog');
const origin = 'https://cinagroup.com';
const turnstileScriptUrl = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
const contactRoutePattern = /^\/(?:(?:zh|ja|ko|ru|es|pt|fr)\/)?contact$/;
const failures = [];
const readOptionalDirectory = async (directory) => {
  try {
    return await readdir(directory);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
};
const maxCssFileBytes = 64 * 1024;
const requiredHeaderFragments = [
  "Content-Security-Policy: default-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self' mailto:",
  'Strict-Transport-Security: max-age=31536000',
  'Cross-Origin-Opener-Policy: same-origin',
  'X-Frame-Options: DENY',
  'X-Content-Type-Options: nosniff',
  'Cache-Control: public, max-age=31536000, immutable',
];

const attributeValue = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
};

const linkHref = (html, relName) => {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = attributeValue(match[0], 'rel')?.toLowerCase().split(/\s+/) || [];
    if (rel.includes(relName.toLowerCase())) return attributeValue(match[0], 'href');
  }
  return null;
};

const metaContent = (html, name) => {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (attributeValue(match[0], 'name')?.toLowerCase() === name.toLowerCase()) {
      return attributeValue(match[0], 'content');
    }
  }
  return null;
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

const exists = async (file) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

const routeFor = (file) => {
  const relative = path.relative(distDir, file).replaceAll(path.sep, '/');
  if (relative === 'index.html') return '/';
  return `/${relative.replace(/\/index\.html$/, '').replace(/\.html$/, '')}`;
};

const targetExists = async (pathname) => {
  const decoded = decodeURIComponent(pathname).replace(/^\/+/, '');
  const candidates = decoded
    ? [path.join(distDir, decoded), path.join(distDir, `${decoded}.html`), path.join(distDir, decoded, 'index.html')]
    : [path.join(distDir, 'index.html')];
  return (await Promise.all(candidates.map(exists))).some(Boolean);
};

const distFiles = await walk(distDir);
const htmlFiles = distFiles.filter((file) => file.endsWith('.html'));
const cssFiles = distFiles.filter((file) => file.endsWith('.css'));
const blogSourceFiles = (
  await Promise.all(
    [automatedSourceDir, curatedSourceDir].map(async (directory) =>
      (await readOptionalDirectory(directory))
        .filter((file) => /\.mdx?$/.test(file))
        .map((file) => path.join(directory, file))
    )
  )
).flat();
let archivedPages = 0;
let turnstileContactPages = 0;
const archivedCanonicals = new Set();
let checkedLinks = 0;
let totalCssBytes = 0;

for (const file of blogSourceFiles) {
  const source = await readFile(file, 'utf8');
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');

  if (hasTopLevelMarkdownHeading(body)) {
    failures.push(`${path.relative(root, file)}: blog post body must not contain an h1 heading`);
  }
}

const headersFile = await readFile(path.join(distDir, '_headers'), 'utf8');
for (const fragment of requiredHeaderFragments) {
  if (!headersFile.includes(fragment)) failures.push(`_headers: missing ${fragment}`);
}

for (const file of cssFiles) {
  const bytes = (await stat(file)).size;
  totalCssBytes += bytes;
  if (bytes > maxCssFileBytes) {
    failures.push(`${path.basename(file)}: ${bytes} CSS bytes exceeds ${maxCssFileBytes}-byte budget`);
  }
}

for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const route = routeFor(file);
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  const titleCount = (html.match(/<title\b/gi) || []).length;
  const themeToggleCount = (html.match(/<button\b[^>]*data-aw-toggle-color-scheme/gi) || []).length;

  if (h1Count !== 1) failures.push(`${route}: expected one h1, found ${h1Count}`);
  if (titleCount !== 1) failures.push(`${route}: expected one title, found ${titleCount}`);
  if (!metaContent(html, 'description')) failures.push(`${route}: missing description`);
  if (!/<html\b[^>]*\blang="[^"]+"/i.test(html)) failures.push(`${route}: missing html lang`);
  if (themeToggleCount !== 1) failures.push(`${route}: expected one theme toggle, found ${themeToggleCount}`);
  if (/[�]|â€”|â€™|â€œ|â€|Ã./.test(html)) failures.push(`${route}: possible mojibake`);

  if (/googletagmanager\.com|G-QYXR6DT2F0|type="text\/partytown"/i.test(html)) {
    failures.push(`${route}: contains disabled analytics markup`);
  }

  for (const match of html.matchAll(/\s(?:src|srcset|action|poster)="(https?:\/\/[^\"]+)"/gi)) {
    if (match[1] === turnstileScriptUrl && contactRoutePattern.test(route)) {
      turnstileContactPages += 1;
      continue;
    }
    failures.push(`${route}: unexpected external resource ${match[1]}`);
  }

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = attributeValue(match[0], 'rel')?.toLowerCase() ?? '';
    const href = attributeValue(match[0], 'href') ?? '';
    if (/\b(stylesheet|preload|prefetch|modulepreload|icon|manifest)\b/.test(rel) && /^https?:\/\//i.test(href)) {
      failures.push(`${route}: unexpected external link resource ${href}`);
    }
  }

  const isArchivedArticle = /data-content-kind=(?:["']historical-archive["']|historical-archive(?:\s|>))/i.test(html);
  const hasArchivedSummaries = /data-content-kind=(?:["']historical-archive-summary["']|historical-archive-summary(?:\s|>))/i.test(html);

  if (isArchivedArticle) {
    archivedPages += 1;
    if (metaContent(html, 'robots') !== 'noindex,follow') {
      failures.push(`${route}: historical archive is not noindex,follow`);
    }
    if (!/\bclass=["'][^"']*\bcg-briefing-notice\b/i.test(html)) {
      failures.push(`${route}: missing historical archive disclosure`);
    }

    const canonical = linkHref(html, 'canonical');
    if (canonical) archivedCanonicals.add(canonical);
    else failures.push(`${route}: historical archive canonical is missing`);
  }

  const isTaxonomyPage = /data-blog-collection=(?:["'](?:category|tag)["']|(?:category|tag)(?:\s|>))/i.test(html);
  if (isTaxonomyPage && hasArchivedSummaries && metaContent(html, 'robots') !== 'noindex,follow') {
    failures.push(`${route}: taxonomy containing historical archives is not noindex,follow`);
  }

  for (const match of html.matchAll(/\shref="([^"]+)"/gi)) {
    const href = match[1];
    if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:|data:)/i.test(href)) continue;

    let target;
    try {
      target = new URL(href, `${origin}${route}`);
    } catch {
      failures.push(`${route}: invalid href ${href}`);
      continue;
    }

    if (target.origin !== origin) continue;
    checkedLinks += 1;
    if (!(await targetExists(target.pathname))) failures.push(`${route}: broken internal link ${target.pathname}`);
  }
}

if (turnstileContactPages !== 8) {
  failures.push(`expected Turnstile only on 8 localized contact pages, found ${turnstileContactPages}`);
}

const sitemapFiles = (await walk(distDir)).filter((file) => /sitemap.*\.xml$/.test(file));
for (const sitemapFile of sitemapFiles) {
  const sitemap = await readFile(sitemapFile, 'utf8');
  for (const canonical of archivedCanonicals) {
    if (sitemap.includes(canonical)) {
      failures.push(`${path.basename(sitemapFile)}: historical archive ${canonical} must not appear in the sitemap`);
    }
  }
}

let blogStructuredDataSummary = '';
try {
  const { stdout } = await execFileAsync(process.execPath, [path.join(root, 'scripts', 'audit-blog-structured-data.mjs')], {
    cwd: root,
  });
  blogStructuredDataSummary = stdout.trim();
} catch (error) {
  const detail = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr).trim() : String(error);
  failures.push(`blog structured data audit: ${detail}`);
}

if (failures.length) {
  console.error(`Build audit failed with ${failures.length} issue(s):`);
  failures.slice(0, 100).forEach((failure) => console.error(`- ${failure}`));
  if (failures.length > 100) console.error(`- ...and ${failures.length - 100} more`);
  process.exit(1);
}

console.log(
  `Build audit passed: ${htmlFiles.length} HTML pages, ${archivedPages} historical archives, ${checkedLinks} internal links, ${cssFiles.length} CSS files (${totalCssBytes} bytes).`
);
if (blogStructuredDataSummary) console.log(blogStructuredDataSummary);
