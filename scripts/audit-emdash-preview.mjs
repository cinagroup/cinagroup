import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const workerName = 'cinagroup-emdash-preview';
const emdashDatabaseName = 'cinagroup-emdash-preview';
const contactDatabaseName = 'cinagroup-contact-submissions-preview';
const contactDatabaseId = 'a24a999d-f784-4ee1-8dcd-888a7be43e7c';
const mediaBucketName = 'cinagroup-emdash-media-preview';
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const operation = process.argv[2] ?? 'audit';

if (!['audit', 'provision', 'deploy'].includes(operation)) throw new Error('Unknown preview operation');
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
  return body;
}

async function contactSchema() {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${contactDatabaseId}/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sql: "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name IN ('contact_submissions', 'd1_migrations')",
      }),
    }
  );
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Contact D1 schema: Cloudflare returned HTTP ${response.status} without JSON`);
  }
  if (!response.ok || body.success !== true) {
    const codes = Array.isArray(body.errors) ? body.errors.map((error) => error.code).join(',') : 'unknown';
    throw new Error(`Contact D1 schema: Cloudflare HTTP ${response.status}, error code(s) ${codes}`);
  }
  const first = body.result?.[0];
  if (first?.success !== true || !Array.isArray(first.results)) {
    throw new Error('Contact D1 schema query failed or returned an unexpected result');
  }
  const table = first.results.find((item) => item.name === 'contact_submissions');
  const localeSupportsZh = /locale\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*locale\s+IN\s*\([^)]*'zh'/i.test(
    table?.sql ?? ''
  );
  return {
    state: !table ? 'missing' : localeSupportsZh ? 'zh-ready' : 'legacy locale constraint',
    localeSupportsZh,
    migrationTableExists: first.results.some((item) => item.name === 'd1_migrations'),
  };
}

async function database(name) {
  const response = await cloudflareGet(`/d1/database?name=${encodeURIComponent(name)}&per_page=10000`, `D1 ${name}`);
  if (!Array.isArray(response.result)) throw new Error(`D1 ${name}: unexpected result format`);
  const matches = response.result.filter((item) => item.name === name);
  if (matches.length > 1) throw new Error(`D1 ${name}: duplicate exact names`);
  return matches[0] ?? null;
}

async function bucket(name) {
  let cursor;
  do {
    const query = new URLSearchParams({ name_contains: name, per_page: '100' });
    if (cursor) query.set('cursor', cursor);
    const response = await cloudflareGet(`/r2/buckets?${query}`, `R2 ${name}`);
    if (!Array.isArray(response.result?.buckets)) throw new Error(`R2 ${name}: unexpected result format`);
    const match = response.result.buckets.find((item) => item.name === name && (!item.jurisdiction || item.jurisdiction === 'default'));
    if (match) return match;
    cursor = response.result_info?.cursor;
  } while (cursor);
  return null;
}

const [emdashDatabase, contactDatabase, mediaBucket, scripts] = await Promise.all([
  database(emdashDatabaseName),
  database(contactDatabaseName),
  bucket(mediaBucketName),
  cloudflareGet('/workers/scripts', 'Worker inventory'),
]);
if (!Array.isArray(scripts.result)) throw new Error('Worker inventory: unexpected result format');
const matchingWorkers = scripts.result.filter((item) => item.id === workerName);
if (matchingWorkers.length > 1) throw new Error('Duplicate preview Worker names');
const existingWorker = matchingWorkers[0] ?? null;

const lines = [
  '### Isolated EmDash preview account audit',
  '',
  `- EmDash D1: ${emdashDatabase ? `present (${emdashDatabase.uuid})` : 'missing'}`,
  `- Contact D1: ${contactDatabase ? `present (${contactDatabase.uuid})` : 'missing'}`,
  `- R2 media bucket: ${mediaBucket ? 'present' : 'missing'}`,
  `- Preview Worker: ${existingWorker ? 'already exists; deployment halted pending route inspection' : 'absent'}`,
];
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}
console.log(lines.slice(2).join('\n'));

if (contactDatabase && contactDatabase.uuid !== contactDatabaseId) {
  throw new Error('Contact D1 name resolves to an unexpected database ID');
}
if (contactDatabase) {
  const exactContact = await cloudflareGet(`/d1/database/${contactDatabaseId}`, 'Contact D1 by ID');
  if (exactContact.result?.name !== contactDatabaseName || exactContact.result?.uuid !== contactDatabaseId) {
    throw new Error('Contact D1 ID does not resolve to the expected preview name');
  }
}
const schema = contactDatabase ? await contactSchema() : null;
const schemaLine = `- Contact schema: ${schema?.state ?? 'unavailable'}; migration history table: ${schema?.migrationTableExists ? 'present' : 'absent'}`;
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${schemaLine}\n`);
console.log(schemaLine);
if (operation === 'deploy') {
  if (!emdashDatabase || !contactDatabase || !mediaBucket) {
    throw new Error('Required isolated preview D1/R2 resources are missing');
  }
  if (existingWorker) throw new Error('Preview Worker already exists; inspect its routes before any update');
  if (!schema?.localeSupportsZh) throw new Error('Preview contact D1 needs the tracked Chinese-locale migration');

  const pointerPath = resolve('.wrangler/deploy/config.json');
  const pointer = JSON.parse(readFileSync(pointerPath, 'utf8'));
  const config = JSON.parse(readFileSync(resolve(dirname(pointerPath), pointer.configPath), 'utf8'));
  const databaseBinding = config.d1_databases?.find((item) => item.binding === 'DB');
  if (databaseBinding?.database_id !== emdashDatabase.uuid) {
    throw new Error('Generated EmDash D1 binding does not match the audited preview database ID');
  }
}
