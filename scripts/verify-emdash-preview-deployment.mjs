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
if (!/^[a-z0-9-]+$/i.test(subdomain ?? '')) throw new Error('Invalid account workers.dev subdomain');
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
const adminStatus = await checkPath('/_emdash/admin/setup', [401, 503]);

const lines = [
  '',
  '### Preview Worker deployed and verified',
  '',
  `- URL: ${origin}`,
  '- Routes/custom domains: none',
  '- Public homepages and a static asset: HTTP 200 with noindex',
  `- EmDash admin setup: HTTP ${adminStatus} (${adminStatus === 401 ? 'outer Basic gate enabled' : 'closed until preview-only password is set'})`,
];
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
console.log(`Verified isolated preview Worker at ${origin}`);
