import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_ORIGIN = 'https://api.cloudflare.com';
const API_PREFIX = '/client/v4/accounts/';
const PREVIEW_HOSTNAME = 'cinagroup-emdash-preview.cinagroup.workers.dev';
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const RESOURCES = Object.freeze({
  organization: '/access/organizations',
  identityProviders: '/access/identity_providers',
  applications: '/access/apps',
});

class SafeAuditError extends Error {}

function safeName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name && name.length <= 120 && !name.includes('@') && ![...name].some((char) => char.codePointAt(0) < 32)
    ? name
    : '[redacted]';
}

function safeId(value) {
  return typeof value === 'string' && /^[a-f0-9-]{32,36}$/i.test(value) ? value : null;
}

function safeAud(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;
}

function safeTeamDomain(value) {
  if (typeof value !== 'string' || !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i.test(value)) return null;
  return `https://${value.toLowerCase()}`;
}

function configuredHttpsEndpoint(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function hostPatternMatches(pattern, hostname) {
  if (pattern === hostname) return true;
  if (!pattern.includes('*') || !/^[a-z0-9.*-]+$/i.test(pattern)) return false;
  const patternParts = pattern.split('.');
  const hostParts = hostname.split('.');
  if (patternParts.length !== hostParts.length) return false;
  return patternParts.every((part, index) => {
    if (!part.includes('*')) return part === hostParts[index];
    if (part.indexOf('*') !== part.lastIndexOf('*')) return false;
    const [prefix, suffix] = part.split('*');
    return hostParts[index].startsWith(prefix) && hostParts[index].endsWith(suffix);
  });
}

function matchingPublicPath(value) {
  if (typeof value !== 'string' || /[?#@\r\n]/.test(value)) return null;
  const withoutScheme = value.replace(/^https:\/\//i, '');
  const slash = withoutScheme.indexOf('/');
  const hostname = (slash === -1 ? withoutScheme : withoutScheme.slice(0, slash)).toLowerCase();
  if (!hostPatternMatches(hostname, PREVIEW_HOSTNAME)) return null;
  const path = slash === -1 ? '/' : withoutScheme.slice(slash);
  if (!/^\/[A-Za-z0-9_.*~/%+-]*$/.test(path) || path.length > 512) return null;
  return { hostname, path };
}

function safeOverridePaths(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item?.behavior === 'public' && typeof item.path_pattern === 'string')
    .map((item) => item.path_pattern)
    .filter((path) => /^\/[A-Za-z0-9_.*~/%+-]{1,511}$/.test(path));
}

function summarizeIdentityProviders(value) {
  if (!Array.isArray(value)) return { state: 'invalid_response', items: [] };
  return {
    state: 'ok',
    items: value.map((provider) => {
      const type = provider?.type === 'oidc' ? 'oidc' : safeName(provider?.type);
      const name = safeName(provider?.name);
      const candidate = type === 'oidc' && /cinaauth/i.test(name ?? '');
      const summary = { id: safeId(provider?.id), name, type, cinaAuthCandidate: candidate };
      if (!candidate) return summary;
      const config = provider?.config && typeof provider.config === 'object' ? provider.config : {};
      const readiness = {
        authUrl: configuredHttpsEndpoint(config.auth_url),
        tokenUrl: configuredHttpsEndpoint(config.token_url),
        jwksUrl: configuredHttpsEndpoint(config.certs_url),
        clientIdPresentInResponse: typeof config.client_id === 'string' && config.client_id.length > 0,
        clientSecretPresentInResponse: typeof config.client_secret === 'string' && config.client_secret.length > 0,
        emailVerifiedClaimListed: Array.isArray(config.claims) && config.claims.includes('email_verified'),
      };
      return { ...summary, readiness, requiresLoginVerification: true };
    }),
  };
}

function summarizeApplications(value) {
  if (!Array.isArray(value)) return { state: 'invalid_response', items: [], broadWorkerDestinationPresent: false };
  const items = [];
  let broadWorkerDestinationPresent = false;
  for (const app of value) {
    const destinations = Array.isArray(app?.destinations) ? app.destinations : [];
    if (destinations.some((item) => ['worker', 'preview_worker', 'all_workers', 'all_preview_workers'].includes(item?.type))) {
      broadWorkerDestinationPresent = true;
    }
    const matches = [
      { uri: app?.domain, overrides: [] },
      ...destinations.filter((item) => item?.type === 'public').map((item) => ({ uri: item.uri, overrides: item.overrides })),
    ]
      .map(({ uri, overrides }) => {
        const target = matchingPublicPath(uri);
        return target ? { ...target, publicOverrides: safeOverridePaths(overrides) } : null;
      })
      .filter(Boolean);
    if (matches.length === 0) continue;
    items.push({
      id: safeId(app.id),
      name: safeName(app.name),
      type: safeName(app.type),
      aud: safeAud(app.aud),
      paths: matches,
      allowedIdps: Array.isArray(app.allowed_idps) ? app.allowed_idps.map(safeId).filter(Boolean) : [],
    });
  }
  return { state: 'ok', items, broadWorkerDestinationPresent };
}

function apiUrl(accountId, resource, page) {
  const url = new URL(`${API_PREFIX}${accountId}${RESOURCES[resource]}`, API_ORIGIN);
  if (page !== undefined) {
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(PAGE_SIZE));
  }
  return url.href;
}

/** Read-only, fixed-endpoint Access inventory for the isolated EmDash preview host. */
export async function auditEmDashPreviewAccess({ operation = 'audit', accountId, token, fetchImpl = fetch } = {}) {
  if (operation !== 'audit') throw new SafeAuditError('Only the read-only audit operation is supported');
  if (typeof accountId !== 'string' || !/^[a-f0-9]{32}$/i.test(accountId)) {
    throw new SafeAuditError('CLOUDFLARE_ACCOUNT_ID must be a 32-character hexadecimal account ID');
  }
  if (typeof token !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(token)) {
    throw new SafeAuditError('CLOUDFLARE_API_TOKEN is missing or invalid');
  }

  async function read(resource, page) {
    let response;
    try {
      response = await fetchImpl(apiUrl(accountId, resource, page), {
        method: 'GET',
        redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return { state: 'request_failed' };
    }
    if (response.status === 403) return { state: 'permission_limited' };
    if (response.status === 401) return { state: 'authentication_failed' };
    if (response.status === 404 && resource === 'organization') return { state: 'not_configured' };
    if (!response.ok) return { state: 'http_error', status: Number(response.status) || null };
    let body;
    try {
      body = await response.json();
    } catch {
      return { state: 'invalid_response' };
    }
    if (body?.success !== true) return { state: 'api_rejected' };
    return { state: 'ok', result: body.result, resultInfo: body.result_info };
  }

  async function list(resource) {
    const items = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const response = await read(resource, page);
      if (response.state !== 'ok') return { state: response.state, items: [] };
      if (!Array.isArray(response.result)) return { state: 'invalid_response', items: [] };
      items.push(...response.result);
      const totalPages = response.resultInfo?.total_pages;
      if (Number.isSafeInteger(totalPages) && totalPages >= 1) {
        if (page >= totalPages) return { state: 'ok', items };
      } else if (response.result.length < PAGE_SIZE) {
        return { state: 'ok', items };
      }
    }
    return { state: 'pagination_limit', items: [] };
  }

  const organization = await read('organization');
  const identityProviders = await list('identityProviders');
  const applications = await list('applications');
  return {
    operation: 'audit',
    previewHostname: PREVIEW_HOSTNAME,
    organization: {
      state: organization.state,
      teamDomain: organization.state === 'ok' ? safeTeamDomain(organization.result?.auth_domain) : null,
    },
    identityProviders:
      identityProviders.state === 'ok'
        ? summarizeIdentityProviders(identityProviders.items)
        : { state: identityProviders.state, items: [] },
    applications:
      applications.state === 'ok'
        ? summarizeApplications(applications.items)
        : { state: applications.state, items: [], broadWorkerDestinationPresent: false },
  };
}

function cliOperation(args) {
  if (args.length === 0 || (args.length === 1 && ['audit', '--operation=audit'].includes(args[0]))) return 'audit';
  throw new SafeAuditError('Only the read-only audit operation is supported');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const operation = cliOperation(process.argv.slice(2));
    const report = await auditEmDashPreviewAccess({
      operation,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      token: process.env.CLOUDFLARE_API_TOKEN,
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if ([report.organization, report.identityProviders, report.applications].some((section) => section.state !== 'ok')) {
      throw new SafeAuditError('Access audit incomplete; inspect the sanitized state report');
    }
  } catch (error) {
    const message = error instanceof SafeAuditError ? error.message : 'Access audit failed; diagnostics suppressed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
