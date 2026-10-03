import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, domainToASCII } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const ACCOUNT = '7ea8e46d8210bad342fa7595f7935fea';
export const WORKER = 'cinagroup-emdash-production';
export const STAGING_HOST = `${WORKER}.cinagroup.workers.dev`;
export const DATABASE = '88da0e99-bbf0-45f6-82f6-74922e1ba2f7';
export const CONTACT = '0cfb1da1-2079-411b-bb21-f5a04fed292b';
export const SESSION = '4cd278d6330c47d6a82537393650e405';
export const IDP = '4b05ed38-1315-4d88-b25c-ee1c2b0f37f5';
export const ADMIN_APP = '8c83711b-9ecc-4059-9897-f60f790c9767';
export const ADMIN_AUD = '4b6dc6f6abc12241ac7da21915a0424f524e652c699377f50586d20efd9eb59d';
export const MEDIA_APP = '007b6231-3a0b-408e-8804-2570ffa90c4c';
export const ROUTES = [
  { zone: '8f2b43a0fb38060c48a84439de5a914f', host: 'cinagroup.com' },
  { zone: '8d451bb2a57510b85592f5901ff8294e', host: 'xn--v6qq4kq7wvy1b.xn--fiqs8s' },
];
const SECRETS = [
  'EMDASH_AUTH_MODE',
  'CF_ACCESS_TEAM_DOMAIN',
  'CF_ACCESS_AUDIENCE',
  'CF_ACCESS_CINA_AUTH_IDP_ID',
  'CF_ACCESS_CINA_AUTH_IDP_TYPE',
  'EMDASH_ACCESS_ADMIN_EMAIL',
  'EMDASH_ENCRYPTION_KEY',
  'TURNSTILE_SECRET_KEY',
];

export function verifyProductionConfig(config) {
  const db = (name) => config.d1_databases?.find((b) => b.binding === name);
  if (
    config.name !== WORKER ||
    config.vars?.EMDASH_DEPLOYMENT_TARGET !== 'production' ||
    config.assets?.run_worker_first !== true ||
    config.route ||
    config.routes?.length ||
    config.domains?.length ||
    config.workers_dev !== true ||
    config.preview_urls !== false ||
    db('DB')?.database_id !== DATABASE ||
    db('DB')?.database_name !== WORKER ||
    db('CONTACT_DB')?.database_id !== CONTACT ||
    db('CONTACT_DB')?.database_name !== 'cinagroup-contact-submissions' ||
    config.r2_buckets?.find((b) => b.binding === 'MEDIA')?.bucket_name !== 'cinagroup-emdash-media-production' ||
    config.kv_namespaces?.find((b) => b.binding === 'SESSION')?.id !== SESSION
  )
    throw new Error('Production deploy target or resource binding mismatch');
}
export function verifyRouteOwnership(routes, spec) {
  const hostPattern = (route) => route.pattern.replace(/^https?:\/\//, '').split('/')[0];
  const matches = (pattern) =>
    new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*') + '$', 'i').test(spec.host);
  for (const route of routes)
    if (
      matches(hostPattern(route)) &&
      (route.pattern !== spec.host + '/*' || route.script !== WORKER || route.request_limit_fail_open !== false)
    )
      throw new Error('Conflicting production route; no route will be overwritten');
  return routes.find((r) => r.pattern === spec.host + '/*') ?? null;
}
export function verifyAdminPolicy(policies, email) {
  if (
    !email ||
    policies.length !== 1 ||
    policies[0].decision !== 'allow' ||
    !isDeepStrictEqual(policies[0].include, [{ email: { email } }]) ||
    !isDeepStrictEqual(policies[0].require, [{ login_method: { id: IDP } }]) ||
    policies[0].exclude?.length
  )
    throw new Error('Production administrator policy mismatch');
}
export async function productionApi(path, method = 'GET', body) {
  if (process.env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT || !process.env.CLOUDFLARE_API_TOKEN)
    throw new Error('Production account or deployment credential unavailable');
  const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  const envelope = await response.json();
  if (!response.ok || envelope.success !== true)
    throw new Error(`Cloudflare ${response.status} codes ${(envelope.errors ?? []).map((e) => e.code).join(',')}`);
  return envelope.result;
}
const ap = '/accounts/' + ACCOUNT;
const query = async (sql, params = []) => {
  const results = await productionApi(`${ap}/d1/database/${CONTACT}/query`, 'POST', { sql, params });
  if (results.some((r) => r.success !== true)) throw new Error('Production contact schema query failed');
  return results[0].results;
};
export async function auditProduction() {
  verifyProductionConfig(JSON.parse(readFileSync('wrangler.production.jsonc', 'utf8').replace(/,\s*([}\]])/g, '$1')));
  const [settings, database, contact, app, media, policies, pages, domains] = await Promise.all([
    productionApi(`${ap}/workers/scripts/${WORKER}/settings`),
    productionApi(`${ap}/d1/database/${DATABASE}`),
    productionApi(`${ap}/d1/database/${CONTACT}`),
    productionApi(`${ap}/access/apps/${ADMIN_APP}`),
    productionApi(`${ap}/access/apps/${MEDIA_APP}`),
    productionApi(`${ap}/access/apps/${ADMIN_APP}/policies`),
    productionApi(`${ap}/pages/projects/cinagroup`),
    productionApi(`${ap}/workers/domains?service=${WORKER}`),
  ]);
  const binding = (name) => settings.bindings?.find((b) => b.name === name);
  if (
    database.name !== WORKER ||
    contact.name !== 'cinagroup-contact-submissions' ||
    binding('DB')?.database_id !== DATABASE ||
    binding('CONTACT_DB')?.database_id !== CONTACT ||
    binding('MEDIA')?.bucket_name !== 'cinagroup-emdash-media-production' ||
    binding('SESSION')?.namespace_id !== SESSION ||
    binding('EMDASH_DEPLOYMENT_TARGET')?.text !== 'production' ||
    SECRETS.some((name) => binding(name)?.type !== 'secret_text') ||
    domains.length ||
    !pages.domains.includes('cinagroup.com') ||
    !pages.canonical_deployment?.id ||
    pages.source?.type
  )
    throw new Error('Production boundary or Pages rollback target differs');
  const destinations = (path) => ['cinagroup.com', STAGING_HOST].map((host) => ({ type: 'public', uri: host + path }));
  if (
    app.aud !== ADMIN_AUD ||
    app.domain !== 'cinagroup.com/_emdash' ||
    !isDeepStrictEqual(app.allowed_idps, [IDP]) ||
    app.auto_redirect_to_identity !== true ||
    !isDeepStrictEqual(app.destinations, destinations('/_emdash')) ||
    !isDeepStrictEqual(media.destinations, destinations('/_emdash/api/media/file/*'))
  )
    throw new Error('Production Access application boundary mismatch');
  verifyAdminPolicy(policies, process.env.EMDASH_ACCESS_ADMIN_EMAIL);
  const mediaPolicies = await productionApi(`${ap}/access/apps/${MEDIA_APP}/policies`);
  if (
    mediaPolicies.length !== 1 ||
    mediaPolicies[0].decision !== 'bypass' ||
    !isDeepStrictEqual(mediaPolicies[0].include, [{ everyone: {} }]) ||
    mediaPolicies[0].require?.length ||
    mediaPolicies[0].exclude?.length
  )
    throw new Error('Public media Access policy mismatch');
  for (const spec of ROUTES) {
    const [zone, dns, routes] = await Promise.all([
      productionApi('/zones/' + spec.zone),
      productionApi('/zones/' + spec.zone + '/dns_records?per_page=100'),
      productionApi('/zones/' + spec.zone + '/workers/routes'),
    ]);
    const cname = dns.filter((d) => domainToASCII(d.name) === spec.host && d.type === 'CNAME');
    if (
      zone.account?.id !== ACCOUNT ||
      zone.status !== 'active' ||
      domainToASCII(zone.name) !== spec.host ||
      cname.length !== 1 ||
      cname[0].proxied !== true ||
      cname[0].content !== 'homepage-cj7.pages.dev'
    )
      throw new Error('Production DNS baseline changed; no DNS record will be overwritten');
    verifyRouteOwnership(routes, spec);
  }
  console.log('Production D1/R2/KV, secrets, Access, exact DNS and Pages rollback boundaries verified');
}
export async function verifyContact(stage) {
  const objects = await query(
    "SELECT type,name,sql FROM sqlite_master WHERE name='contact_submissions' OR name='d1_migrations' OR (tbl_name='contact_submissions' AND type='index')"
  );
  const table = objects.find((o) => o.type === 'table' && o.name === 'contact_submissions');
  const history = (await query('SELECT name FROM d1_migrations ORDER BY id')).map((r) => r.name);
  const old = ['0001_contact_submissions.sql'];
  const current = [...old, '0002_contact_zh_locale.sql'];
  const zh = /'zh'/.test(table?.sql ?? '');
  if (stage === 'before' && isDeepStrictEqual(history, current) && zh) return;
  const normalize = (sql) =>
    sql
      .replace(/\bIF NOT EXISTS\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  if (stage === 'before') {
    const migration = readFileSync('migrations/0001_contact_submissions.sql', 'utf8');
    if (
      !isDeepStrictEqual(history, old) ||
      normalize(table?.sql ?? '') !== normalize(migration.slice(0, migration.indexOf(';')))
    )
      throw new Error('Production contact schema is not exact tracked 0001');
  } else if (!isDeepStrictEqual(history, current) || !zh)
    throw new Error('Production contact Chinese locale migration was not applied');
  const indexes = objects
    .filter((o) => o.type === 'index' && !o.name.startsWith('sqlite_autoindex_'))
    .map((o) => o.name)
    .sort();
  if (
    !isDeepStrictEqual(indexes, [
      'idx_contact_submissions_created_at',
      'idx_contact_submissions_notification',
      'idx_contact_submissions_retention',
    ])
  )
    throw new Error('Production contact indexes differ');
  console.log('Production contact schema and migration history verified: ' + stage);
}
export async function setProductionRoutes(operation) {
  if (!['cutover', 'rollback'].includes(operation)) throw new Error('Unknown route operation');
  if (operation === 'cutover') await auditProduction();
  const planned = [];
  for (const spec of ROUTES) {
    const routes = await productionApi('/zones/' + spec.zone + '/workers/routes');
    planned.push({ spec, existing: verifyRouteOwnership(routes, spec) });
  }
  const created = [];
  try {
    for (const { spec, existing } of planned) {
      const current = verifyRouteOwnership(await productionApi('/zones/' + spec.zone + '/workers/routes'), spec);
      if ((current?.id ?? null) !== (existing?.id ?? null)) throw new Error('Production route changed before mutation');
      if (operation === 'cutover' && !existing) {
        const route = await productionApi('/zones/' + spec.zone + '/workers/routes', 'POST', {
          pattern: spec.host + '/*',
          script: WORKER,
          request_limit_fail_open: false,
        });
        created.push({ spec, id: route.id });
      }
      if (operation === 'rollback' && existing)
        await productionApi('/zones/' + spec.zone + '/workers/routes/' + existing.id, 'DELETE');
    }
  } catch (error) {
    for (const { spec, id } of created.reverse()) {
      const own = verifyRouteOwnership(await productionApi('/zones/' + spec.zone + '/workers/routes'), spec);
      if (own?.id === id) await productionApi('/zones/' + spec.zone + '/workers/routes/' + id, 'DELETE');
    }
    throw error;
  }
  console.log(
    operation === 'cutover'
      ? 'Production routes attached; Pages and DNS retained for rollback'
      : 'Owned production routes removed; retained Pages resumes serving the domains'
  );
}
async function main() {
  const operation = process.argv[2];
  if (operation === 'verify-build') {
    const pointer = resolve('.wrangler/deploy/config.json');
    const configPath = JSON.parse(readFileSync(pointer, 'utf8')).configPath;
    if (typeof configPath !== 'string') throw new Error('Missing generated deployment config');
    verifyProductionConfig(JSON.parse(readFileSync(resolve(dirname(pointer), configPath), 'utf8')));
    console.log('Generated production Worker target verified');
  } else if (operation === 'audit') await auditProduction();
  else if (operation === 'contact-before' || operation === 'contact-after')
    await verifyContact(operation.split('-')[1]);
  else await setProductionRoutes(operation);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
