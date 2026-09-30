import type { createRemoteJWKSet, jwtVerify } from 'jose';
import type { RuntimeConfig } from './cinaauth-access-core';

interface JoseApi {
  createRemoteJWKSet: typeof createRemoteJWKSet;
  jwtVerify: typeof jwtVerify;
}

/** Only public verification keys are cached; no token or identity is shared. */
export function createAccessJwtVerifier(jose: JoseApi) {
  const keys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
  return async (jwt: string, config: RuntimeConfig) => {
    const issuer = `https://${config.teamDomain}`;
    let jwks = keys.get(issuer);
    if (!jwks) {
      jwks = jose.createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), { timeoutDuration: 8000 });
      keys.set(issuer, jwks);
    }
    const { payload } = await jose.jwtVerify(jwt, jwks, {
      issuer,
      audience: config.audience,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iss', 'aud', 'sub'],
      clockTolerance: 0,
    });
    return payload;
  };
}
