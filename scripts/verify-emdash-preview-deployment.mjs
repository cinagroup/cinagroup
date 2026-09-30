import { appendFileSync } from 'node:fs';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const workerName = 'cinagroup-emdash-preview';

if (!/^[a-f0-9]{32}$/i.test(accountId ?? '') || !token) {
  throw new Error('GitHub Cloudflare account ID or API token is missing');
}

async function cloudflareGet(path, label) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${label}: Cloudflare returned HTTP ${response.status} without JSON`);
  }
  if (!response.ok || body.success !== true) {
    const codes = Array.isArray(body.errors) ? body.errors.map((error) => error.code).join(',') : 'unknown';
    throw new Error(`${label}: Cloudflare HTTP ${response.status}, error code(s) ${codes}`);
  }
  return body.result;
}

const [scripts, domains, scriptSubdomain, accountSubdomain] = await Promise.all([
  cloudflareGet('/workers/scripts', 'Worker inventory'),
  cloudflareGet(`/workers/domains?service=${workerName}`, 'Worker custom domains'),
  cloudflareGet(`/workers/scripts/${workerName}/subdomain`, 'Worker workers.dev status'),
  cloudflareGet('/workers/subdomain', 'Account workers.dev subdomain'),
]);
if (!Array.isArray(scripts) || !Array.isArray(domains)) throw new Error('Unexpected Worker inventory format');
const worker = scripts.find((item) => item.id === workerName);
if (!worker) throw new Error('Deployed preview Worker is missing from account inventory');
if (worker.routes !== null && !Array.isArray(worker.routes)) {
  throw new Error('Preview Worker route inventory is unavailable');
}
if (worker.routes?.length) throw new Error('Preview Worker has an unexpected zone route');
if (domains.some((item) => item.service === workerName)) {
  throw new Error('Preview Worker has an unexpected custom domain');
}
if (scriptSubdomain?.enabled !== true) throw new Error('Preview Worker workers.dev route is disabled');
const subdomain = accountSubdomain?.subdomain;
if (subdomain !== 'cinagroup') throw new Error('Unexpected account workers.dev subdomain');
const origin = `https://${workerName}.${subdomain}.workers.dev`;

async function checkPath(path, expectedStatuses) {
  let lastStatus;
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
    lastStatus = response.status;
    if (expectedStatuses.includes(lastStatus)) {
      if (!response.headers.get('X-Robots-Tag')?.includes('noindex')) {
        throw new Error(`Preview ${path}: missing Worker-level noindex header`);
      }
      if (path.startsWith('/_emdash') && response.headers.get('Cache-Control') !== 'no-store') {
        throw new Error('Preview admin guard did not disable caching');
      }
      if (lastStatus === 401 && !response.headers.get('WWW-Authenticate')?.startsWith('Basic ')) {
        throw new Error('Preview admin guard did not challenge with HTTP Basic');
      }
      return lastStatus;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`Preview ${path}: expected HTTP ${expectedStatuses.join(' or ')}, received ${lastStatus}`);
}

await checkPath('/', [200]);
await checkPath('/zh/', [200]);
await checkPath('/favicon.svg', [200]);
await checkPath('/blog/', [200]);
await checkPath('/zh/blog/', [200]);
await checkPath('/ja/blog/', [200]);
for (const locale of ['ko', 'ru', 'es', 'pt', 'fr']) await checkPath(`/${locale}/blog/`, [200]);
const legacyArticlePath = '/zh/blog/news-briefing-2026-06-15-06-zh/';
await checkPath(legacyArticlePath, [200]);
const legacyArticle = await fetch(`${origin}${legacyArticlePath}`);
const legacyHtml = await legacyArticle.text();
if (
  legacyArticle.status !== 200 ||
  !legacyArticle.headers.get('Content-Type')?.includes('text/html') ||
  !legacyArticle.headers.get('X-Robots-Tag')?.includes('noindex') ||
  legacyHtml.length < 1000 ||
  !legacyHtml.includes('<article')
) {
  throw new Error('Preview legacy article did not return its prerendered HTML through the trailing-slash route');
}
await checkPath('/rss.xml', [200]);
await checkPath('/robots.txt', [200]);
await checkPath('/sitemap-emdash.xml', [200]);
await checkPath('/blog/ai-news-briefing-2026-09-29-18/', [200]);
await checkPath('/blog/ai-news-briefing-2026-09-30-06/', [200]);
for (const path of ['/', '/zh/', '/ja/', '/contact/', '/zh/contact/', '/not-a-preview-route/']) {
  const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
  await response.body?.cancel();
  if (
    !response.headers.get('Content-Security-Policy')?.includes('frame-ancestors') ||
    response.headers.get('Strict-Transport-Security') !== 'max-age=31536000' ||
    response.headers.get('X-Frame-Options') !== 'DENY'
  )
    throw new Error(`Preview ${path}: production public security headers are missing`);
}
for (const [path, location, status] of [
  ['/zh', '/zh/', 308],
  ['/homes/saas', '/', 301],
  ['/homes/saas/x/', '/', 301],
  ['/index-new/', '/', 301],
  ['/decapcms/', '/', 301],
  ['/blog/ai-news-briefing-2026-05-03-06', '/zh/blog/ai-news-briefing-2026-05-03-06', 301],
  ['/zh/blog/ai-news-briefing-2026-05-03-06', '/zh/blog/ai-news-briefing-2026-05-03-06/', 308],
]) {
  const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
  await response.body?.cancel();
  const destination = response.headers.get('Location');
  if (response.status !== status || !destination || new URL(destination, origin).href !== `${origin}${location}`) {
    throw new Error(`Preview ${path}: expected legacy redirect was not preserved`);
  }
}
const publicMedia = await fetch(`${origin}/_emdash/api/media/file/deploy-smoke-missing.png`);
await publicMedia.body?.cancel();
if (publicMedia.status !== 404 || !publicMedia.headers.get('X-Robots-Tag')?.includes('noindex')) {
  throw new Error('Public missing media must reach EmDash and return 404 without the admin gate');
}
const sitemap = await fetch(`${origin}/sitemap-0.xml`);
const staticSitemap = await sitemap.text();
if (staticSitemap.includes('/cms-preview/'))
  throw new Error('Internal signed preview route leaked into public sitemap');
if (/<loc>https:\/\/cinagroup\.com\/(?:ko|ru|es|pt|fr)\/blog\/<\/loc>/.test(staticSitemap)) {
  throw new Error('CMS-only indexes must be discovered dynamically only after approved content exists');
}
const adminStatus = await checkPath('/_emdash/admin/setup', [401, 503]);

const lines = [
  '',
  '### Preview Worker deployed and verified',
  '',
  `- URL: ${origin}`,
  '- Routes/custom domains: none',
  '- Public homepages and a static asset: HTTP 200 with noindex',
  '- All eight blog indexes, legacy/fresh articles, RSS, robots, and CMS sitemap: HTTP 200 with noindex',
  '- Public security headers and legacy redirects verified; signed preview excluded from sitemap',
  '- Anonymous public media reaches EmDash; missing file returns 404',
  `- EmDash admin setup: HTTP ${adminStatus} (${adminStatus === 401 ? 'outer Basic gate enabled' : 'closed until preview-only password is set'})`,
];
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
console.log(`Verified isolated preview Worker at ${origin}`);
