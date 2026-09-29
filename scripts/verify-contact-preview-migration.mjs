import { readFileSync, readdirSync } from 'node:fs';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const contactDatabaseName = 'cinagroup-contact-submissions-preview';
const contactDatabaseId = 'a24a999d-f784-4ee1-8dcd-888a7be43e7c';
const migrationFiles = ['0001_contact_submissions.sql', '0002_contact_zh_locale.sql'];

if (!/^[a-f0-9]{32}$/i.test(accountId ?? '') || !token) {
  throw new Error('GitHub Cloudflare account ID or API token is missing');
}

const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/,\s*([}\]])/g, '$1'));
const contactBinding = config.d1_databases?.find((item) => item.binding === 'CONTACT_DB');
if (contactBinding?.database_name !== contactDatabaseName || contactBinding?.database_id !== contactDatabaseId) {
  throw new Error('Wrangler CONTACT_DB binding does not target the exact preview D1 database');
}
const actualMigrations = readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort();
if (JSON.stringify(actualMigrations) !== JSON.stringify(migrationFiles)) {
  throw new Error('Contact migration directory contains unexpected SQL files');
}

async function cloudflare(path, label, payload) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
    method: payload ? 'POST' : 'GET',
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
  return body.result;
}

async function query(sql, label) {
  const results = await cloudflare(`/d1/database/${contactDatabaseId}/query`, label, { sql });
  if (!Array.isArray(results) || results[0]?.success !== true || !Array.isArray(results[0].results)) {
    throw new Error(`${label}: unexpected query result`);
  }
  return results[0].results;
}

const details = await cloudflare(`/d1/database/${contactDatabaseId}`, 'Contact D1 by ID');
if (details?.uuid !== contactDatabaseId || details?.name !== contactDatabaseName) {
  throw new Error('Contact D1 ID does not resolve to the exact preview database name');
}

const objects = await query(
  "SELECT type, name, sql FROM sqlite_master WHERE name = 'contact_submissions' OR name = 'd1_migrations' OR (tbl_name = 'contact_submissions' AND type = 'index')",
  'Contact D1 schema'
);
const table = objects.find((item) => item.type === 'table' && item.name === 'contact_submissions');
const history = objects.find((item) => item.type === 'table' && item.name === 'd1_migrations');
if (!table || !history) throw new Error('Preview contact table or migration history is missing');

const normalize = (sql) =>
  sql
    .replace(/\bIF NOT EXISTS\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const originalMigration = readFileSync(`migrations/${migrationFiles[0]}`, 'utf8');
const expectedTable = originalMigration.slice(0, originalMigration.indexOf(';'));
if (normalize(table.sql) !== normalize(expectedTable)) {
  throw new Error('Preview contact table differs from the tracked 0001 schema; migration halted');
}

const indexes = objects
  .filter((item) => item.type === 'index' && !item.name.startsWith('sqlite_autoindex_'))
  .map((item) => item.name)
  .sort();
const expectedIndexes = [
  'idx_contact_submissions_created_at',
  'idx_contact_submissions_notification',
  'idx_contact_submissions_retention',
];
if (JSON.stringify(indexes) !== JSON.stringify(expectedIndexes)) {
  throw new Error('Preview contact indexes differ from the tracked 0001 schema; migration halted');
}

const applied = (await query('SELECT name FROM d1_migrations ORDER BY id', 'Contact migration history')).map(
  (item) => item.name
);
if (JSON.stringify(applied) !== JSON.stringify([migrationFiles[0]])) {
  throw new Error('Preview contact migration history is not exactly 0001; migration halted');
}

console.log('Preview contact D1, legacy schema, indexes, and 0001 migration history verified');
