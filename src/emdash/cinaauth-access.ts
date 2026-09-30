import { env } from 'cloudflare:workers';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { createCinaAuthAccessAuthenticate, createCinaAuthAccessAuthorizer } from './cinaauth-access-core';
import { createAccessJwtVerifier } from './cinaauth-access-jose';
import { createCinaAuthAccessGuard } from './cinaauth-access-guard';

export const authorizeCinaAuthAccess = createCinaAuthAccessAuthorizer({
  runtimeBindings: () => env,
  verifyAccessJwt: createAccessJwtVerifier({ createRemoteJWKSet, jwtVerify }),
  fetchIdentity: (input, init) => fetch(input, init),
});

export const authenticate = createCinaAuthAccessAuthenticate(authorizeCinaAuthAccess);

export const fetchWithCinaAuthAccess = createCinaAuthAccessGuard({
  runtimeBindings: () => env,
  authorize: authorizeCinaAuthAccess,
});
