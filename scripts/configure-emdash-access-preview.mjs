import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const API_ORIGIN = 'https://api.cloudflare.com';
const ACCOUNT_ID = '7ea8e46d8210bad342fa7595f7935fea';
const TEAM_DOMAIN = 'cinagroup.cloudflareaccess.com';
const WORKER_NAME = 'cinagroup-emdash-preview';
const PREVIEW_HOST = 'cinagroup-emdash-preview.cinagroup.workers.dev';
const IDP_ENDPOINTS = Object.freeze({
  auth_url: 'https://auth.cinaseek.si/api/auth/oauth2/authorize',
  token_url: 'https://auth.cinaseek.si/api/auth/oauth2/token',
  certs_url: 'https://auth.cinaseek.si/api/auth/jwks/cloudflare-access',
});
const ADMIN_PATH = '/_emdash';
const MEDIA_PATH = '/_emdash/api/media/file/*';
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

const APPS = Object.freeze([
  { role: 'admin', name: 'CinaGroup EmDash preview admin', path: ADMIN_PATH },
  { role: 'publicMedia', name: 'CinaGroup EmDash preview public file media', path: MEDIA_PATH },
]);

class SafeConfigurationError extends Error {}
const fail = (message) => {
  throw new SafeConfigurationError(message);
};

function isId(value) {
  return typeof value === 'string' && /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(value);
}

function safeAud(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;
}

function normalizedEmail(value) {
  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    value.length > 254 ||
    !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(value)
  ) {
    fail('EMDASH_ACCESS_ADMIN_EMAIL is missing or invalid');
  }
  return value.toLowerCase();
}

function isExpectedTeamDomain(value) {
  return value === TEAM_DOMAIN || value === `https://${TEAM_DOMAIN}` || value === `https://${TEAM_DOMAIN}/`;
}

function parsePublicDestination(value) {
  if (typeof value !== 'string' || /[?#@\r\n]/.test(value)) return null;
  const raw = value.replace(/^https:\/\//i, '');
  const slash = raw.indexOf('/');
  const hostname = (slash === -1 ? raw : raw.slice(0, slash)).toLowerCase();
  const path = slash === -1 ? '/' : raw.slice(slash);
  if (!/^[a-z0-9*.-]+$/.test(hostname) || !/^\/[A-Za-z0-9_.*~/%+-]*$/.test(path)) return null;
  return { hostname, path };
}

function hostPatternMatches(pattern) {
  if (pattern === PREVIEW_HOST) return true;
  const patternParts = pattern.split('.');
  const hostParts = PREVIEW_HOST.split('.');
  if (patternParts.length !== hostParts.length) return false;
  return patternParts.every((part, index) => {
    if (!part.includes('*')) return part === hostParts[index];
    if (part.indexOf('*') !== part.lastIndexOf('*')) return false;
    const [prefix, suffix] = part.split('*');
    return hostParts[index].startsWith(prefix) && hostParts[index].endsWith(suffix);
  });
}

function appTargetsPreviewHost(app) {
  const destinations = Array.isArray(app?.destinations) ? app.destinations : [];
  const legacyDomains = destinations.length === 0 && Array.isArray(app?.self_hosted_domains) ? app.self_hosted_domains : [];
  const candidates = [app?.domain, ...destinations.filter((item) => item?.type === 'public').map((item) => item.uri), ...legacyDomains];
  return candidates.some((candidate) => {
    const parsed = parsePublicDestination(candidate);
    return parsed ? hostPatternMatches(parsed.hostname) : typeof candidate === 'string' && candidate.includes(PREVIEW_HOST);
  });
}

function hasBroadWorkerDestination(app, previewWorkerId) {
  return (
    Array.isArray(app?.destinations) &&
    app.destinations.some(
      (item) =>
        ['all_workers', 'all_preview_workers'].includes(item?.type) ||
        (['worker', 'preview_worker'].includes(item?.type) && item.worker_id === previewWorkerId)
    )
  );
}

function appBody(spec, email, idpId) {
  const body = {
    type: 'self_hosted',
    name: spec.name,
    domain: `${PREVIEW_HOST}${spec.path}`,
    destinations: [{ type: 'public', uri: `${PREVIEW_HOST}${spec.path}` }],
    app_launcher_visible: false,
  };
  if (spec.role === 'admin') {
    return {
      ...body,
      allowed_idps: [idpId],
      auto_redirect_to_identity: true,
      allow_authenticate_via_warp: false,
      policies: [
        {
          name: 'Verified CinaAuth preview administrator',
          decision: 'allow',
          include: [{ email: { email } }],
          require: [{ oidc: { claim_name: 'email_verified', claim_value: 'true', identity_provider_id: idpId } }],
        },
      ],
    };
  }
  return {
    ...body,
    policies: [{ name: 'Public preview file media', decision: 'bypass', include: [{ everyone: {} }] }],
  };
}

function sameRules(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  return actual.every((rule, index) => isDeepStrictEqual(rule, expected[index]));
}

function samePolicy(actual, expected) {
  return (
    actual?.name === expected.name &&
    actual?.decision === expected.decision &&
    sameRules(actual.include, expected.include) &&
    sameRules(actual.require ?? [], expected.require ?? []) &&
    (!Array.isArray(actual.exclude) || actual.exclude.length === 0)
  );
}

function verifyExistingApp(app, policies, spec, email, idpId) {
  const expected = appBody(spec, email, idpId);
  const destination = app?.destinations;
  const actualDomain = parsePublicDestination(app?.domain);
  const actualDestination = Array.isArray(destination) && destination.length === 1 ? destination[0] : null;
  const publicUri = parsePublicDestination(actualDestination?.uri);
  if (
    !isId(app?.id) ||
    app.name !== spec.name ||
    app.type !== 'self_hosted' ||
    actualDomain?.hostname !== PREVIEW_HOST ||
    actualDomain.path !== spec.path ||
    actualDestination?.type !== 'public' ||
    publicUri?.hostname !== PREVIEW_HOST ||
    publicUri.path !== spec.path ||
    (Array.isArray(actualDestination.overrides) && actualDestination.overrides.length > 0) ||
    !Array.isArray(policies) ||
    policies.length !== 1 ||
    !samePolicy(policies[0], expected.policies[0])
  ) {
    fail('An existing preview Access application differs from the expected configuration');
  }
  if (spec.role === 'admin') {
    if (
      !Array.isArray(app.allowed_idps) ||
      app.allowed_idps.length !== 1 ||
      app.allowed_idps[0] !== idpId ||
      app.auto_redirect_to_identity !== true ||
      app.allow_authenticate_via_warp !== false
    ) {
      fail('The existing preview admin Access application has incompatible identity settings');
    }
  }
  return { role: spec.role, name: spec.name, path: spec.path, id: app.id, aud: safeAud(app.aud) };
}

function validateIdp(provider, idpId) {
  const config = provider?.config;
  if (
    provider?.id !== idpId ||
    provider?.type !== 'oidc' ||
    typeof provider.name !== 'string' ||
    !/cinaauth/i.test(provider.name) ||
    !/preview/i.test(provider.name) ||
    config?.auth_url !== IDP_ENDPOINTS.auth_url ||
    config?.token_url !== IDP_ENDPOINTS.token_url ||
    config?.certs_url !== IDP_ENDPOINTS.certs_url ||
    config?.pkce_enabled !== true ||
    typeof config?.client_id !== 'string' ||
    !config.client_id ||
    !Array.isArray(config.claims) ||
    !config.claims.includes('email_verified')
  ) {
    fail('The selected preview CinaAuth OIDC identity provider is incomplete or not isolated');
  }
}

/** Preflight all Access state; only `configure` can create the two fixed preview applications. */
export async function configureEmDashPreviewAccess({ operation = 'plan', accountId, token, adminEmail, idpId, fetchImpl = fetch } = {}) {
  if (!['plan', 'configure'].includes(operation)) fail('Unsupported preview Access operation');
  if (accountId !== ACCOUNT_ID) fail('CLOUDFLARE_ACCOUNT_ID is not the isolated preview account');
  if (typeof token !== 'string' || token !== token.trim() || !/^[\x21-\x7e]{1,4096}$/.test(token))
    fail('CLOUDFLARE_API_TOKEN is missing or invalid');
  const email = normalizedEmail(adminEmail);
  if (!isId(idpId)) fail('CF_ACCESS_CINA_AUTH_IDP_ID is missing or invalid');
  const prefix = `/client/v4/accounts/${ACCOUNT_ID}`;

  async function request(path, method = 'GET', body) {
    let response;
    try {
      response = await fetchImpl(new URL(`${prefix}${path}`, API_ORIGIN).href, {
        method,
        redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      fail(method === 'POST' ? 'Access create outcome unknown; run read-only audit before retrying' : 'Access preflight request failed');
    }
    if (method === 'POST' && !response.ok) fail('Access create outcome unknown; run read-only audit before retrying');
    if (response.status === 403) fail('Cloudflare Access permission_limited');
    if (response.status === 401) fail('Cloudflare Access authentication failed');
    if (!response.ok) fail('Access preflight HTTP error');
    let result;
    try {
      result = await response.json();
    } catch {
      fail(method === 'POST' ? 'Access create outcome unknown; run read-only audit before retrying' : 'Cloudflare Access returned an invalid response');
    }
    if (result?.success !== true)
      fail(method === 'POST' ? 'Access create outcome unknown; run read-only audit before retrying' : 'Cloudflare Access rejected the request');
    return result;
  }

  async function list(path) {
    const items = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const response = await request(`${path}?page=${page}&per_page=${PAGE_SIZE}`);
      if (!Array.isArray(response.result)) fail('Cloudflare Access list response is invalid');
      items.push(...response.result);
      const totalPages = response.result_info?.total_pages;
      if (Number.isSafeInteger(totalPages) && totalPages >= 1) {
        if (page >= totalPages) return items;
      } else if (response.result.length < PAGE_SIZE) {
        return items;
      }
    }
    fail('Cloudflare Access list pagination limit reached');
  }

  const organization = (await request('/access/organizations')).result;
  if (!isExpectedTeamDomain(organization?.auth_domain)) fail('Cloudflare Access team domain does not match the isolated preview account');
  const providers = await list('/access/identity_providers');
  const selectedProvider = providers.find((provider) => provider?.id === idpId);
  validateIdp(selectedProvider, idpId);
  const workers = (await request('/workers/scripts')).result;
  if (!Array.isArray(workers)) fail('Preview Worker inventory is invalid');
  const matchingWorkers = workers.filter((worker) => worker?.id === WORKER_NAME);
  if (matchingWorkers.length !== 1 || !isId(matchingWorkers[0]?.tag)) fail('Isolated preview Worker ID is unavailable');
  const previewWorkerId = matchingWorkers[0].tag;
  const applications = await list('/access/apps');
  const owned = new Map();
  for (const app of applications) {
    const spec = APPS.find((item) => item.name === app?.name);
    if (hasBroadWorkerDestination(app, previewWorkerId)) fail('An existing Access application covers the preview Worker');
    if (!spec && appTargetsPreviewHost(app)) fail('Another Access application targets the isolated preview hostname');
    if (!spec) continue;
    if (!isId(app.id) || owned.has(spec.role)) fail('Duplicate or invalid preview Access application');
    owned.set(spec.role, app.id);
  }

  const result = [];
  for (const spec of APPS) {
    const id = owned.get(spec.role);
    if (!id) continue;
    const full = (await request(`/access/apps/${id}`)).result;
    const policies = (await request(`/access/apps/${id}/policies`)).result;
    result.push({ ...verifyExistingApp(full, policies, spec, email, idpId), state: 'existing' });
  }

  for (const spec of APPS) {
    if (owned.has(spec.role)) continue;
    if (operation === 'plan') {
      result.push({ role: spec.role, name: spec.name, path: spec.path, id: null, aud: null, state: 'would_create' });
      continue;
    }
    const created = (await request('/access/apps', 'POST', appBody(spec, email, idpId))).result;
    if (!isId(created?.id)) fail('Access create outcome unknown; run read-only audit before retrying');
    const full = (await request(`/access/apps/${created.id}`)).result;
    const policies = (await request(`/access/apps/${created.id}/policies`)).result;
    result.push({ ...verifyExistingApp(full, policies, spec, email, idpId), state: 'created' });
  }

  return {
    operation,
    previewHostname: PREVIEW_HOST,
    applications: APPS.map((spec) => result.find((item) => item.role === spec.role)),
  };
}

function cliOperation(args) {
  if (args.length === 0 || (args.length === 1 && ['plan', '--operation=plan'].includes(args[0]))) return 'plan';
  if (args.length === 1 && ['configure', '--operation=configure'].includes(args[0])) return 'configure';
  fail('Unsupported preview Access operation');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await configureEmDashPreviewAccess({
      operation: cliOperation(process.argv.slice(2)),
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      token: process.env.CLOUDFLARE_API_TOKEN,
      adminEmail: process.env.EMDASH_ACCESS_ADMIN_EMAIL,
      idpId: process.env.CF_ACCESS_CINA_AUTH_IDP_ID,
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof SafeConfigurationError ? error.message : 'Access configuration failed; diagnostics suppressed'}\n`);
    process.exitCode = 1;
  }
}
