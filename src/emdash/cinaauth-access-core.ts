import type { AuthResult } from 'emdash';
import type { JWTPayload } from 'jose';

const ROLE_ADMIN = 50;
const IDENTITY_BODY_LIMIT = 64 * 1024;
const DENIED_MESSAGE = 'CinaAuth Access authentication denied';

export interface RuntimeConfig {
  teamDomain: string;
  audience: string;
  idpId: string;
  idpType: string;
  adminEmail: string;
}

export interface AccessDependencies {
  runtimeBindings: () => unknown;
  verifyAccessJwt: (jwt: string, config: RuntimeConfig) => Promise<JWTPayload>;
  fetchIdentity: typeof fetch;
}

export class CinaAuthAccessError extends Error {
  readonly status: 401 | 503;

  constructor(status: 401 | 503) {
    super(status === 503 ? 'CinaAuth Access authentication unavailable' : DENIED_MESSAGE);
    this.name = 'CinaAuthAccessError';
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(bindings: Record<string, unknown>, key: string, pattern: RegExp): string {
  const value = bindings[key];
  // JavaScript's $ anchor also matches immediately before a final line break.
  // Reject surrounding whitespace instead of silently trimming configuration.
  if (typeof value !== 'string' || value.trim() !== value || !pattern.test(value)) {
    throw new CinaAuthAccessError(503);
  }
  return value;
}

/** Read at request time. Missing deployment configuration never enables a fallback. */
export function getCinaAuthAccessConfig(bindings: unknown): RuntimeConfig {
  if (!isRecord(bindings)) throw new CinaAuthAccessError(503);
  requiredString(bindings, 'EMDASH_AUTH_MODE', /^cinaauth-access$/);
  const adminEmail = requiredString(
    bindings,
    'EMDASH_ACCESS_ADMIN_EMAIL',
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/
  );
  if (adminEmail.length > 254 || adminEmail.includes('..')) throw new CinaAuthAccessError(503);
  return {
    teamDomain: requiredString(
      bindings,
      'CF_ACCESS_TEAM_DOMAIN',
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/
    ),
    audience: requiredString(bindings, 'CF_ACCESS_AUDIENCE', /^[a-f0-9]{64}$/),
    idpId: requiredString(bindings, 'CF_ACCESS_CINA_AUTH_IDP_ID', /^[A-Za-z0-9_-]{1,128}$/),
    idpType: requiredString(bindings, 'CF_ACCESS_CINA_AUTH_IDP_TYPE', /^oidc$/),
    adminEmail,
  };
}

function matchesIdp(value: unknown, config: RuntimeConfig): boolean {
  return isRecord(value) && value.id === config.idpId && value.type === config.idpType;
}

async function readIdentity(response: Response): Promise<unknown> {
  if (response.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('Content-Type') ?? '')) {
    throw new Error(DENIED_MESSAGE);
  }
  const length = response.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > IDENTITY_BODY_LIMIT)) {
    throw new Error(DENIED_MESSAGE);
  }
  if (!response.body) throw new Error(DENIED_MESSAGE);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > IDENTITY_BODY_LIMIT) throw new Error(DENIED_MESSAGE);
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    throw new Error(DENIED_MESSAGE);
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

/**
 * JOSE validates the Access JWT before any identity claim is trusted. Full OIDC
 * fields come from one fixed-origin identity read using that exact token.
 * Public JWKS caching belongs to the verifier; identities are request-scoped.
 */
export function createCinaAuthAccessAuthorizer(dependencies: AccessDependencies) {
  const requests = new WeakMap<
    Request,
    { configKey: string; jwt: string; expiresAt: number; pending: Promise<AuthResult> }
  >();
  return async (request: Request): Promise<AuthResult> => {
    try {
      const config = getCinaAuthAccessConfig(dependencies.runtimeBindings());
      // Access injects this header on requests to the origin. Do not authorize
      // from an unverified email header or a native EmDash/preview cookie.
      const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
      if (
        new URL(request.url).protocol !== 'https:' ||
        !jwt ||
        jwt.length > 16_384 ||
        !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt)
      ) {
        throw new Error(DENIED_MESSAGE);
      }
      const configKey = [config.teamDomain, config.audience, config.idpId, config.idpType, config.adminEmail].join(
        '\0'
      );
      const cached = requests.get(request);
      if (cached && cached.configKey === configKey && cached.jwt === jwt && cached.expiresAt > Date.now()) {
        return await cached.pending;
      }
      let expiresAt = Number.POSITIVE_INFINITY;
      const pending = (async (): Promise<AuthResult> => {
        const verified = await dependencies.verifyAccessJwt(jwt, config);
        if (
          verified.type !== 'app' ||
          verified.email !== config.adminEmail ||
          typeof verified.sub !== 'string' ||
          !verified.sub ||
          verified.sub.length > 128 ||
          typeof verified.exp !== 'number' ||
          !Number.isFinite(verified.exp) ||
          verified.exp * 1000 <= Date.now()
        ) {
          throw new Error(DENIED_MESSAGE);
        }
        expiresAt = verified.exp * 1000;
        const response = await dependencies.fetchIdentity(`https://${config.teamDomain}/cdn-cgi/access/get-identity`, {
          method: 'GET',
          headers: { Cookie: `CF_Authorization=${jwt}`, Accept: 'application/json' },
          redirect: 'error',
          signal: AbortSignal.timeout(8000),
        });
        const identity = await readIdentity(response);
        if (
          !isRecord(identity) ||
          identity.email !== verified.email ||
          !matchesIdp(identity.idp, config) ||
          !isRecord(identity.oidc_fields) ||
          identity.oidc_fields.email_verified !== true ||
          identity.service_token_status === true ||
          expiresAt <= Date.now()
        ) {
          throw new Error(DENIED_MESSAGE);
        }
        const name =
          typeof identity.name === 'string' && identity.name.length > 0 && identity.name.length <= 256
            ? identity.name
            : config.adminEmail.split('@')[0];
        return {
          email: config.adminEmail,
          name,
          role: ROLE_ADMIN,
          subject: verified.sub,
          metadata: { idp: { id: config.idpId, type: config.idpType }, email_verified: true },
        };
      })();
      const state = {
        configKey,
        jwt,
        get expiresAt() {
          return expiresAt;
        },
        pending,
      };
      requests.set(request, state);
      try {
        return await state.pending;
      } catch {
        if (requests.get(request) === state) requests.delete(request);
        throw new Error(DENIED_MESSAGE);
      }
    } catch (error) {
      // EmDash logs provider errors. Do not propagate tokens, identity data,
      // fetch URLs with credentials, upstream response bodies, or error causes.
      throw new CinaAuthAccessError(error instanceof CinaAuthAccessError && error.status === 503 ? 503 : 401);
    }
  };
}

export function createCinaAuthAccessAuthenticate(authorize: (request: Request) => Promise<AuthResult>) {
  return async (request: Request, descriptorConfig: unknown): Promise<AuthResult> => {
    if (!isRecord(descriptorConfig) || descriptorConfig.autoProvision !== true || descriptorConfig.syncRoles !== true) {
      throw new CinaAuthAccessError(503);
    }
    return authorize(request);
  };
}
