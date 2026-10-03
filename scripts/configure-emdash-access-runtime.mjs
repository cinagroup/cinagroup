import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { configureEmDashPreviewAccess } from './configure-emdash-access-preview.mjs';

const ACCOUNT_ID = '7ea8e46d8210bad342fa7595f7935fea';
const WORKER_NAME = 'cinagroup-emdash-preview';
const HOSTNAME = `${WORKER_NAME}.cinagroup.workers.dev`;
const DB_ID = '050ec919-1b18-4de8-86a8-62c16c28e59c';
const CONTACT_DB_ID = 'a24a999d-f784-4ee1-8dcd-888a7be43e7c';
const MEDIA_BUCKET = 'cinagroup-emdash-media-preview';
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const RUNTIME_NAMES = Object.freeze([
  'EMDASH_AUTH_MODE',
  'CF_ACCESS_TEAM_DOMAIN',
  'CF_ACCESS_AUDIENCE',
  'CF_ACCESS_CINA_AUTH_IDP_ID',
  'CF_ACCESS_CINA_AUTH_IDP_TYPE',
  'EMDASH_ACCESS_ADMIN_EMAIL',
]);

class SafeRuntimeConfigurationError extends Error {}
const fail = (message) => {
  throw new SafeRuntimeConfigurationError(message);
};
export function safeRuntimeConfigurationError(error) {
  return error instanceof SafeRuntimeConfigurationError
    ? error.message
    : 'Access runtime configuration failed; sensitive diagnostics suppressed';
}

function runtimeValues(env) {
  const patterns = {
    EMDASH_AUTH_MODE: /^cinaauth-access$/,
    CF_ACCESS_TEAM_DOMAIN: /^cinagroup\.cloudflareaccess\.com$/,
    CF_ACCESS_AUDIENCE: /^[a-f0-9]{64}$/,
    CF_ACCESS_CINA_AUTH_IDP_ID: /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i,
    CF_ACCESS_CINA_AUTH_IDP_TYPE: /^oidc$/,
    EMDASH_ACCESS_ADMIN_EMAIL: /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/,
  };
  const values = {};
  for (const name of RUNTIME_NAMES) {
    if (typeof env?.[name] !== 'string' || env[name].trim() !== env[name] || !patterns[name].test(env[name]))
      fail(`Required runtime binding ${name} is missing or invalid`);
    values[name] = env[name];
  }
  if (values.EMDASH_ACCESS_ADMIN_EMAIL.length > 254 || values.EMDASH_ACCESS_ADMIN_EMAIL.includes('..'))
    fail('Required administrator email binding is invalid');
  return values;
}

function validateLocalWorker(config) {
  const db = (name) => config?.d1_databases?.filter((item) => item.binding === name);
  const media = config?.r2_buckets?.filter((item) => item.binding === 'MEDIA');
  if (
    config?.name !== WORKER_NAME ||
    config.route ||
    config.routes?.length ||
    config.domains?.length ||
    config.workers_dev === false ||
    config.assets?.run_worker_first !== true ||
    !Array.isArray(config.d1_databases) ||
    config.d1_databases.length !== 2 ||
    db('DB')?.length !== 1 ||
    db('DB')[0].database_id !== DB_ID ||
    db('CONTACT_DB')?.length !== 1 ||
    db('CONTACT_DB')[0].database_id !== CONTACT_DB_ID ||
    !Array.isArray(config.r2_buckets) ||
    config.r2_buckets.length !== 1 ||
    media?.length !== 1 ||
    media[0].bucket_name !== MEDIA_BUCKET
  )
    fail('Local Wrangler configuration is not the isolated preview Worker');
}

function readLocalWorker() {
  try {
    return JSON.parse(
      readFileSync(resolve(SCRIPT_DIRECTORY, '../wrangler.jsonc'), 'utf8').replace(/,\s*([}\]])/g, '$1')
    );
  } catch {
    fail('Cannot read the isolated preview Wrangler configuration');
  }
}

/** All preflight reads finish before one six-binding write; existing targets are never intentionally overwritten. */
export async function configureEmDashAccessRuntime({
  operation = 'audit',
  environment = process.env,
  fetchImpl = fetch,
  workerConfig,
  accessPreflight = configureEmDashPreviewAccess,
} = {}) {
  if (!['audit', 'configure'].includes(operation)) fail('Unsupported Access runtime configuration operation');
  const values = runtimeValues(environment);
  const accountId = environment.CLOUDFLARE_ACCOUNT_ID;
  const token = environment.CLOUDFLARE_API_TOKEN;
  if (
    accountId !== ACCOUNT_ID ||
    typeof token !== 'string' ||
    token.trim() !== token ||
    !/^[\x21-\x7e]{1,4096}$/.test(token)
  )
    fail('Cloudflare preview credentials are missing or invalid');
  validateLocalWorker(workerConfig ?? readLocalWorker());
  const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}`;

  async function api(path, method = 'GET', body) {
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      fail(
        method === 'GET'
          ? 'Cloudflare runtime configuration preflight failed'
          : 'Runtime configuration write outcome is unknown; audit before retrying'
      );
    }
    let envelope;
    try {
      envelope = await response.json();
    } catch {
      fail(
        method === 'GET'
          ? 'Cloudflare runtime configuration returned invalid JSON; diagnostics suppressed'
          : 'Runtime configuration write outcome is unknown; audit before retrying'
      );
    }
    if (!response.ok || envelope?.success !== true)
      fail(
        method === 'GET'
          ? 'Cloudflare runtime configuration preflight rejected'
          : 'Runtime configuration write was rejected; audit before retrying'
      );
    return envelope;
  }

  async function list(path) {
    const items = [];
    for (let page = 1; page <= 20; page++) {
      const envelope = await api(`${path}${path.includes('?') ? '&' : '?'}page=${page}&per_page=100`);
      if (!Array.isArray(envelope.result)) fail('Cloudflare runtime configuration inventory is invalid');
      items.push(...envelope.result);
      const pages = envelope.result_info?.total_pages;
      if (Number.isSafeInteger(pages) && pages >= 1 ? page >= pages : envelope.result.length < 100) return items;
    }
    fail('Cloudflare runtime configuration pagination limit reached');
  }

  async function boundary() {
    const [settings, scripts, domains, subdomain, account] = await Promise.all([
      api(`/workers/scripts/${WORKER_NAME}/settings`).then((r) => r.result),
      list('/workers/scripts'),
      list(`/workers/domains?service=${WORKER_NAME}`),
      api(`/workers/scripts/${WORKER_NAME}/subdomain`).then((r) => r.result),
      api('/workers/subdomain').then((r) => r.result),
    ]);
    if (!Array.isArray(settings?.bindings)) fail('Preview Worker binding inventory is invalid');
    const binding = (name) => settings.bindings.filter((item) => item.name === name);
    const db = binding('DB'),
      contact = binding('CONTACT_DB'),
      media = binding('MEDIA');
    const workers = scripts.filter((item) => item.id === WORKER_NAME);
    if (
      db.length !== 1 ||
      db[0].type !== 'd1' ||
      db[0].database_id !== DB_ID ||
      contact.length !== 1 ||
      contact[0].type !== 'd1' ||
      contact[0].database_id !== CONTACT_DB_ID ||
      media.length !== 1 ||
      media[0].type !== 'r2_bucket' ||
      media[0].bucket_name !== MEDIA_BUCKET ||
      settings.bindings.filter((item) => item.type === 'd1').length !== 2 ||
      settings.bindings.filter((item) => item.type === 'r2_bucket').length !== 1 ||
      workers.length !== 1 ||
      !(workers[0].routes === null || (Array.isArray(workers[0].routes) && workers[0].routes.length === 0)) ||
      domains.length !== 0 ||
      subdomain?.enabled !== true ||
      account?.subdomain !== 'cinagroup'
    )
      fail('Preview Worker is not isolated to its exact workers.dev, D1 and R2 boundaries');
    return settings.bindings;
  }

  async function secrets() {
    const result = (await api(`/workers/scripts/${WORKER_NAME}/secrets`)).result;
    if (
      !Array.isArray(result) ||
      result.some((item) => typeof item.name !== 'string' || !['secret_text', 'secret_key'].includes(item.type)) ||
      new Set(result.map((item) => item.name)).size !== result.length
    )
      fail('Preview Worker secret-name inventory is invalid');
    return new Set(result.map((item) => item.name));
  }

  async function access() {
    let report;
    try {
      report = await accessPreflight({
        operation: 'plan',
        accountId,
        token,
        adminEmail: values.EMDASH_ACCESS_ADMIN_EMAIL,
        idpId: values.CF_ACCESS_CINA_AUTH_IDP_ID,
        fetchImpl,
      });
    } catch {
      fail('Dedicated preview Access application or email/login-method policy preflight failed');
    }
    const admin = report?.applications?.filter((item) => item.role === 'admin');
    const media = report?.applications?.filter((item) => item.role === 'publicMedia');
    if (
      report?.previewHostname !== HOSTNAME ||
      admin?.length !== 1 ||
      media?.length !== 1 ||
      admin[0].state !== 'existing' ||
      media[0].state !== 'existing' ||
      admin[0].aud !== values.CF_ACCESS_AUDIENCE
    )
      fail('Preview Access application is missing or its AUD does not match the runtime input');
    const provider = (await api(`/access/identity_providers/${values.CF_ACCESS_CINA_AUTH_IDP_ID}`)).result;
    const config = provider?.config;
    if (
      provider?.id !== values.CF_ACCESS_CINA_AUTH_IDP_ID ||
      provider?.type !== 'oidc' ||
      config?.auth_url !== 'https://auth.cinaseek.si/api/auth/oauth2/authorize' ||
      config?.token_url !== 'https://auth.cinaseek.si/api/auth/oauth2/token' ||
      config?.certs_url !== 'https://auth.cinaseek.si/api/auth/jwks/cloudflare-access' ||
      !Array.isArray(config?.claims) ||
      !config.claims.includes('email_verified')
    )
      fail(
        'The dedicated CinaAuth preview identity provider does not match its issuer/JWKS/verified-email configuration'
      );
  }

  async function inspect() {
    const bindings = await boundary();
    const names = await secrets();
    await access();
    const targetBindings = bindings.filter((binding) => RUNTIME_NAMES.includes(binding.name));
    if (
      targetBindings.some((binding) => binding.type !== 'secret_text') ||
      new Set(targetBindings.map((binding) => binding.name)).size !== targetBindings.length ||
      targetBindings.some((binding) => !names.has(binding.name)) ||
      RUNTIME_NAMES.some((name) => names.has(name) && !targetBindings.some((binding) => binding.name === name))
    )
      fail('Existing runtime binding metadata cannot be safely reconciled with secret names');
    return { names, targetCount: RUNTIME_NAMES.filter((name) => names.has(name)).length };
  }

  const before = await inspect();
  const report = {
    operation,
    workerName: WORKER_NAME,
    previewHostname: HOSTNAME,
    accessAndWorkerBoundaryVerified: true,
    existingSecretValuesRead: false,
    existingConfigurationUnverifiable: before.targetCount > 0,
    existingRuntimeBindingCount: before.targetCount,
    createdBindingCount: 0,
    state: before.targetCount > 0 ? 'existing-unverifiable' : 'ready-to-create',
  };
  if (operation === 'audit') return report;
  if (before.targetCount > 0)
    fail('Existing runtime binding values are masked; refusing to skip, replace or complete a partial configuration');
  // Repeat every boundary/policy/absence check immediately before the batch.
  const rechecked = await inspect();
  if (rechecked.targetCount > 0 || [...before.names].some((name) => !rechecked.names.has(name)))
    fail('Preview secrets changed during preflight; refusing the runtime write');
  const secretBody = {
    secrets: Object.fromEntries(RUNTIME_NAMES.map((name) => [name, { name, type: 'secret_text', text: values[name] }])),
  };
  await api(`/workers/scripts/${WORKER_NAME}/secrets-bulk`, 'PATCH', secretBody);
  let after;
  try {
    after = await inspect();
  } catch {
    fail('Runtime write completed but verification failed; audit before retrying');
  }
  if (after.targetCount !== RUNTIME_NAMES.length || [...rechecked.names].some((name) => !after.names.has(name)))
    fail(
      'Runtime upload did not retain every existing secret and create every requested binding; audit before retrying'
    );
  return {
    ...report,
    state: 'created',
    createdBindingCount: RUNTIME_NAMES.length,
    existingSecretNamesPreserved: true,
    valuesVerifiedByReadback: false,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && !['audit', 'configure'].includes(args[0])))
      fail('Unsupported Access runtime configuration operation');
    const report = await configureEmDashAccessRuntime({ operation: args[0] ?? 'audit' });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.existingConfigurationUnverifiable) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${safeRuntimeConfigurationError(error)}\n`);
    process.exitCode = 1;
  }
}
