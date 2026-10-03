import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { STAGING_HOST, ADMIN_AUD, ROUTES } from './emdash-production.mjs';

const staging = process.argv.includes('--staging');
const host = staging ? STAGING_HOST : 'cinagroup.com';
const origin = 'https://' + host;
async function get(path, method = 'GET', requireWorker = false) {
  for (let n = 0; n < 4; n++) {
    const r = await fetch(origin + path, { method, redirect: 'manual', signal: AbortSignal.timeout(20000) });
    if (
      n === 3 ||
      (r.status < 500 && (!requireWorker || r.headers.get('X-CinaGroup-Deployment') === 'emdash-production'))
    )
      return r;
    await r.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
async function publicPath(path, { status = 200, html = false, indexable = false, method = 'GET' } = {}) {
  const r = await get(path, method, true);
  if (r.status !== status || r.headers.get('X-CinaGroup-Deployment') !== 'emdash-production')
    throw new Error(`Production ${method} ${path}: unexpected status or Worker marker (${r.status})`);
  if (staging && !r.headers.get('X-Robots-Tag')?.includes('noindex'))
    throw new Error('Staging response is missing noindex');
  if (!staging && indexable && r.headers.get('X-Robots-Tag')?.includes('noindex'))
    throw new Error('Production canonical homepage has a blanket noindex');
  if (
    html &&
    (!r.headers.get('Content-Type')?.includes('text/html') ||
      !r.headers.get('Content-Security-Policy')?.includes('frame-ancestors') ||
      r.headers.get('Strict-Transport-Security') !== 'max-age=31536000')
  )
    throw new Error(`Production ${path}: HTML or security headers missing`);
  const body = await r.text();
  if (method === 'HEAD' && body) throw new Error('HEAD contains a response body');
  if (html && method === 'GET' && !/<html(?:\s|>)/i.test(body)) throw new Error('Incomplete production HTML');
  return body;
}
for (const path of ['/', '/zh/', '/ja/', '/contact/', '/zh/contact/']) {
  await publicPath(path, { html: true, indexable: true });
  await publicPath(path, { html: true, indexable: true, method: 'HEAD' });
}
for (const locale of ['', 'zh/', 'ja/', 'ko/', 'ru/', 'es/', 'pt/', 'fr/']) {
  await publicPath('/' + locale + 'blog/', { html: true });
  await publicPath('/' + locale + 'blog/', { html: true, method: 'HEAD' });
}
await publicPath('/favicon.svg');
await publicPath('/zh/blog/news-briefing-2026-06-15-06-zh/', { html: true });
await publicPath('/blog/ai-news-briefing-2026-09-30-06/', { html: true });
const rss = await publicPath('/rss.xml');
const sitemap = await publicPath('/sitemap-0.xml');
const robots = await publicPath('/robots.txt');
await publicPath('/sitemap-index.xml');
await publicPath('/sitemap-emdash.xml');
if (/\/cms-preview\/|\/_emdash\//.test(sitemap) || !robots.includes('sitemap-index.xml'))
  throw new Error('Discovery routes changed their public/private boundary');
if (staging) {
  for (const [path, candidate] of [
    ['/rss.xml', rss],
    ['/sitemap-0.xml', sitemap],
  ]) {
    let matched = false;
    let diagnostic;
    for (let attempt = 0; attempt < 4; attempt++) {
      const baseline = await fetch('https://cinagroup.com' + path, { signal: AbortSignal.timeout(20000) });
      const baselineBody = await baseline.text();
      const stagedBody = attempt === 0 ? candidate : await publicPath(path);
      if (baseline.status === 200 && baselineBody === stagedBody) {
        matched = true;
        break;
      }
      const digest = (body) => createHash('sha256').update(body).digest('hex');
      diagnostic = {
        path,
        baselineStatus: baseline.status,
        baselineType: baseline.headers.get('Content-Type'),
        bytes: [Buffer.byteLength(baselineBody), Buffer.byteLength(stagedBody)],
        hashes: [digest(baselineBody), digest(stagedBody)],
      };
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    if (!matched) throw new Error('Staging differs from current production: ' + JSON.stringify(diagnostic));
  }
}
const fresh = /<item>[\s\S]*?<link>([^<]+)<\/link>/.exec(rss)?.[1];
if (fresh) {
  const url = new URL(fresh);
  if (url.origin !== 'https://cinagroup.com' || !/\/(?:blog|zh\/blog|ja\/blog)\//.test(url.pathname))
    throw new Error('Unexpected RSS article URL');
  await publicPath(url.pathname, { html: true });
}
for (const [path, destination, status] of [
  ['/zh', '/zh/', 308],
  ['/ja', '/ja/', 308],
  ['/homes/saas', '/', 301],
  ['/decapcms/', '/', 301],
]) {
  const r = await get(path);
  await r.body?.cancel();
  if (r.status !== status || new URL(r.headers.get('Location'), origin).href !== origin + destination)
    throw new Error('Legacy redirect changed: ' + path);
}
await publicPath('/_emdash/api/media/file/deploy-smoke-missing.png', { status: 404 });
for (const path of [
  '/_emdash/admin/',
  '/_emdash/admin/setup',
  '/_emdash/api/setup/status',
  '/_emdash/api/media/upload',
]) {
  const r = await get(path);
  await r.body?.cancel();
  if (r.status !== 302) throw new Error('Production management route lacks Access challenge: ' + path);
  const login = new URL(r.headers.get('Location'));
  const returnTo = new URL(login.searchParams.get('redirect_url'), origin);
  if (
    login.origin !== 'https://cinagroup.cloudflareaccess.com' ||
    login.pathname !== '/cdn-cgi/access/login/' + host ||
    login.searchParams.get('kid') !== ADMIN_AUD ||
    returnTo.href !== origin + path
  )
    throw new Error('Production Access challenge points to an unexpected application');
}
const privateMedia = await get('/_emdash/api/media/file/backups/private.txt');
await privateMedia.body?.cancel();
if (
  privateMedia.status !== 401 ||
  !privateMedia.headers.get('X-Robots-Tag')?.includes('noindex') ||
  !privateMedia.headers.get('Cache-Control')?.includes('no-store')
)
  throw new Error('Private media bypassed the Worker identity guard');
if (!staging) {
  for (const path of ['/', '/zh/contact/?migration-check=20261003']) {
    const r = await fetch('https://' + ROUTES[1].host + path, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    });
    await r.body?.cancel();
    if (r.status !== 308 || r.headers.get('Location') !== 'https://cinagroup.com' + path)
      throw new Error('Production Chinese alias lost its fixed canonical redirect');
  }
}
const summary = `Verified ${staging ? 'staging' : 'production'} Worker: public GET/HEAD, eight locale indexes, archives, discovery, indexing/security headers, redirects, canonical media and anonymous Access boundaries. RSS items: ${(rss.match(/<item>/g) ?? []).length}; sitemap URLs: ${(sitemap.match(/<loc>/g) ?? []).length}.`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '\n' + summary + '\n');
