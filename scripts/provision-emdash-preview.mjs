import { appendFileSync } from 'node:fs';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const emdashDatabaseName = 'cinagroup-emdash-preview';
const contactDatabaseName = 'cinagroup-contact-submissions-preview';
const contactDatabaseId = 'a24a999d-f784-4ee1-8dcd-888a7be43e7c';
const mediaBucketName = 'cinagroup-emdash-media-preview';
const workerName = 'cinagroup-emdash-preview';

if (!/^[a-f0-9]{32}$/i.test(accountId ?? '') || !token) {
  throw new Error('GitHub Cloudflare account ID or API token is missing');
}

async function request(path, label, method = 'GET', payload) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
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

async function database(name) {
  const response = await request(`/d1/database?name=${encodeURIComponent(name)}&per_page=10000`, `D1 ${name}`);
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
    const response = await request(`/r2/buckets?${query}`, `R2 ${name}`);
    if (!Array.isArray(response.result?.buckets)) throw new Error(`R2 ${name}: unexpected result format`);
    const match = response.result.buckets.find((item) => item.name === name && (!item.jurisdiction || item.jurisdiction === 'default'));
    if (match) return match;
    cursor = response.result_info?.cursor;
  } while (cursor);
  return null;
}

const [contactDatabase, scripts] = await Promise.all([
  database(contactDatabaseName),
  request('/workers/scripts', 'Worker inventory'),
]);
if (contactDatabase?.uuid !== contactDatabaseId) {
  throw new Error('Contact D1 name does not resolve to the expected preview database ID');
}
const exactContact = await request(`/d1/database/${contactDatabaseId}`, 'Contact D1 by ID');
if (exactContact.result?.name !== contactDatabaseName || exactContact.result?.uuid !== contactDatabaseId) {
  throw new Error('Contact D1 ID does not resolve to the expected preview name');
}
if (!Array.isArray(scripts.result)) throw new Error('Worker inventory: unexpected result format');
if (scripts.result.some((item) => item.id === workerName)) {
  throw new Error('A same-named Worker already exists; inspect its routes before provisioning');
}

let emdashDatabase = await database(emdashDatabaseName);
if (!emdashDatabase) {
  const created = await request('/d1/database', `Create D1 ${emdashDatabaseName}`, 'POST', {
    name: emdashDatabaseName,
    primary_location_hint: 'apac',
  });
  emdashDatabase = await database(emdashDatabaseName);
  if (!created.result?.uuid || emdashDatabase?.uuid !== created.result.uuid) {
    throw new Error('New EmDash D1 database did not verify by exact name and ID');
  }
}
if (!emdashDatabase.uuid) throw new Error('EmDash D1 database is missing its ID');

let mediaBucket = await bucket(mediaBucketName);
if (!mediaBucket) {
  const created = await request('/r2/buckets', `Create R2 ${mediaBucketName}`, 'POST', {
    name: mediaBucketName,
    locationHint: 'apac',
  });
  mediaBucket = await bucket(mediaBucketName);
  if (created.result?.name !== mediaBucketName || mediaBucket?.name !== mediaBucketName) {
    throw new Error('New R2 media bucket did not verify by exact name');
  }
}

const lines = [
  '',
  '### Preview resources ready',
  '',
  `- EmDash D1 ID to pin in wrangler.jsonc: ${emdashDatabase.uuid}`,
  `- R2 bucket: ${mediaBucketName}`,
  `- Contact D1 remains: ${contactDatabaseId}`,
  '- No Worker was deployed.',
];
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
console.log(`EmDash D1 ID: ${emdashDatabase.uuid}`);
console.log(`R2 bucket ready: ${mediaBucketName}`);
