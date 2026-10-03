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

export type AccessDenialStage =
  | 'runtime_configuration'
  | 'request_protocol'
  | 'assertion_missing'
  | 'assertion_shape'
  | 'jwt_verification'
  | 'jwt_claims'
  | 'identity_fetch'
  | 'identity_http'
  | 'identity_content_type'
  | 'identity_body_limit'
  | 'identity_body_missing'
  | 'identity_body_read'
  | 'identity_json'
  | 'identity_email'
  | 'identity_idp'
  | 'identity_oidc_fields'
  | 'identity_email_verified'
  | 'identity_service'
  | 'identity_expired'
  | 'authorization_unexpected';

/** Fixed categories only: never attach claims, credentials, upstream bodies or causes. */
export interface AccessDenialDiagnostic {
  stage: AccessDenialStage;
  identityHttpStatus?: number;
}

export interface AccessDependencies {
  runtimeBindings: () => unknown;
  verifyAccessJwt: (jwt: string, config: RuntimeConfig) => Promise<JWTPayload>;
  fetchIdentity: typeof fetch;
  onDenied?: (diagnostic: AccessDenialDiagnostic) => void;
}

export class CinaAuthAccessError extends Error {
  readonly status: 401 | 503;

  constructor(status: 401 | 503) {
    super(status === 503 ? 'CinaAuth Access authentication unavailable' : DENIED_MESSAGE);
    this.name = 'CinaAuthAccessError';
    this.status = status;
  }
}

/** Internal sentinel; the public error remains the existing sanitized 401/503. */
class AccessDiagnosticError extends Error {
  readonly diagnostic: AccessDenialDiagnostic;

  constructor(stage: AccessDenialStage, identityHttpStatus?: number) {
    super(DENIED_MESSAGE);
    this.diagnostic = identityHttpStatus === undefined ? { stage } : { stage, identityHttpStatus };
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
  if (response.status !== 200) throw new AccessDiagnosticError('identity_http', response.status);
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('Content-Type') ?? '')) {
    throw new AccessDiagnosticError('identity_content_type');
  }
  const length = response.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > IDENTITY_BODY_LIMIT)) {
    throw new AccessDiagnosticError('identity_body_limit');
  }
  if (!response.body) throw new AccessDiagnosticError('identity_body_missing');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > IDENTITY_BODY_LIMIT) throw new AccessDiagnosticError('identity_body_limit');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error instanceof AccessDiagnosticError ? error : new AccessDiagnosticError('identity_body_read');
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new AccessDiagnosticError('identity_json');
  }
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
      if (new URL(request.url).protocol !== 'https:') throw new AccessDiagnosticError('request_protocol');
      if (!jwt) throw new AccessDiagnosticError('assertion_missing');
      if (jwt.length > 16_384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt)) {
        throw new AccessDiagnosticError('assertion_shape');
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
        let verified: JWTPayload;
        try {
          verified = await dependencies.verifyAccessJwt(jwt, config);
        } catch {
          throw new AccessDiagnosticError('jwt_verification');
        }
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
          throw new AccessDiagnosticError('jwt_claims');
        }
        expiresAt = verified.exp * 1000;
        let response: Response;
        try {
          response = await dependencies.fetchIdentity(`https://${config.teamDomain}/cdn-cgi/access/get-identity`, {
            method: 'GET',
            headers: { Cookie: `CF_Authorization=${jwt}`, Accept: 'application/json' },
            // Workers supports follow/manual only. Never forward the credential through a redirect.
            redirect: 'manual',
            signal: AbortSignal.timeout(8000),
          });
        } catch {
          throw new AccessDiagnosticError('identity_fetch');
        }
        const identity = await readIdentity(response);
        if (!isRecord(identity) || identity.email !== verified.email) throw new AccessDiagnosticError('identity_email');
        if (!matchesIdp(identity.idp, config)) throw new AccessDiagnosticError('identity_idp');
        if (!isRecord(identity.oidc_fields)) throw new AccessDiagnosticError('identity_oidc_fields');
        if (identity.oidc_fields.email_verified !== true) throw new AccessDiagnosticError('identity_email_verified');
        if (identity.service_token_status === true) throw new AccessDiagnosticError('identity_service');
        if (expiresAt <= Date.now()) throw new AccessDiagnosticError('identity_expired');
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
      } catch (error) {
        if (requests.get(request) === state) requests.delete(request);
        throw error;
      }
    } catch (error) {
      // EmDash logs provider errors. Do not propagate tokens, identity data,
      // fetch URLs with credentials, upstream response bodies, or error causes.
      const status = error instanceof CinaAuthAccessError && error.status === 503 ? 503 : 401;
      const diagnostic: AccessDenialDiagnostic =
        error instanceof AccessDiagnosticError
          ? error.diagnostic
          : { stage: status === 503 ? 'runtime_configuration' : 'authorization_unexpected' };
      try {
        dependencies.onDenied?.(diagnostic);
      } catch {
        // Diagnostics are best-effort; a broken sink must never affect authorization.
      }
      throw new CinaAuthAccessError(status);
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
