import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const automatedSourceDir = path.join(root, 'src', 'data', 'post');
const origin = 'https://cinagroup.com';
const failures = [];
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
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'));
  return match?.[1] ?? null;
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
const automatedSources = (await readdir(automatedSourceDir)).filter((file) => /\.mdx?$/.test(file));
let automatedPages = 0;
let checkedLinks = 0;
let totalCssBytes = 0;

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
    failures.push(`${route}: unexpected external resource ${match[1]}`);
  }

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = attributeValue(match[0], 'rel')?.toLowerCase() ?? '';
    const href = attributeValue(match[0], 'href') ?? '';
    if (/\b(stylesheet|preload|prefetch|modulepreload|icon|manifest)\b/.test(rel) && /^https?:\/\//i.test(href)) {
      failures.push(`${route}: unexpected external link resource ${href}`);
    }
  }

  if (route.startsWith('/blog/ai-news-briefing-')) {
    automatedPages += 1;
    if (metaContent(html, 'robots') !== 'noindex,follow') {
      failures.push(`${route}: automated briefing is not noindex,follow`);
    }
    if (!html.includes('Automated briefing archive.')) failures.push(`${route}: missing automated briefing disclosure`);
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

if (automatedPages !== automatedSources.length) {
  failures.push(`automated archive: expected ${automatedSources.length} pages, found ${automatedPages}`);
}

const blogIndex = await readFile(path.join(distDir, 'blog', 'index.html'), 'utf8');
if (!blogIndex.includes('restored archive of automated briefings')) failures.push('/blog: archive disclosure missing');
if (!blogIndex.includes('Automated briefing')) failures.push('/blog: automated briefing badges missing');

const categoryIndex = await readFile(path.join(distDir, 'category', 'ai-news', 'index.html'), 'utf8');
if (metaContent(categoryIndex, 'robots') !== 'noindex,follow') {
  failures.push('/category/ai-news: automated category is not noindex,follow');
}

const sitemapFiles = (await walk(distDir)).filter((file) => /sitemap.*\.xml$/.test(file));
for (const sitemapFile of sitemapFiles) {
  const sitemap = await readFile(sitemapFile, 'utf8');
  if (sitemap.includes('/blog/ai-news-briefing-')) {
    failures.push(`${path.basename(sitemapFile)}: automated briefings must not appear in the sitemap`);
  }
}

if (failures.length) {
  console.error(`Build audit failed with ${failures.length} issue(s):`);
  failures.slice(0, 100).forEach((failure) => console.error(`- ${failure}`));
  if (failures.length > 100) console.error(`- ...and ${failures.length - 100} more`);
  process.exit(1);
}

console.log(
  `Build audit passed: ${htmlFiles.length} HTML pages, ${automatedPages} automated briefings, ${checkedLinks} internal links, ${cssFiles.length} CSS files (${totalCssBytes} bytes).`
);
