import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { before, test } from 'node:test';

import {
  CinaAuthAccessError,
  createCinaAuthAccessAuthenticate,
  createCinaAuthAccessAuthorizer,
} from '../src/emdash/cinaauth-access-core.ts';
import { createAccessJwtVerifier } from '../src/emdash/cinaauth-access-jose.ts';

const projectRoot = process.env.EMDASH_AUTH_TEST_PROJECT_ROOT;
const requireFromProject = createRequire(
  projectRoot ? path.join(projectRoot, 'package.json') : new URL('../package.json', import.meta.url)
);
const jose = await import(pathToFileURL(requireFromProject.resolve('jose')).href);
const ADMIN_EMAIL = 'admin@example.test';
const AUDIENCE = 'a'.repeat(64);
const TEAM_DOMAIN = 'offline-test.cloudflareaccess.com';
const IDP_ID = 'cinaauth-test-idp';
const bindings = () => ({
  EMDASH_AUTH_MODE: 'cinaauth-access',
  CF_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
  CF_ACCESS_AUDIENCE: AUDIENCE,
  CF_ACCESS_CINA_AUTH_IDP_ID: IDP_ID,
  CF_ACCESS_CINA_AUTH_IDP_TYPE: 'oidc',
  EMDASH_ACCESS_ADMIN_EMAIL: ADMIN_EMAIL,
});
const identity = () => ({
  email: ADMIN_EMAIL,
  name: 'Test administrator',
  idp: { id: IDP_ID, type: 'oidc' },
  oidc_fields: { email_verified: true },
  groups: [{ name: 'Ignored admin group' }],
});
let privateKey;
let publicJwk;
before(async () => {
  const pair = await jose.generateKeyPair('RS256');
  privateKey = pair.privateKey;
  publicJwk = { ...(await jose.exportJWK(pair.publicKey)), kid: 'offline-key', alg: 'RS256', use: 'sig' };
});

async function token(overrides = {}, key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: `https://${TEAM_DOMAIN}`,
    aud: [AUDIENCE],
    sub: 'access-test-subject',
    exp: now + 300,
    iat: now,
    type: 'app',
    email: ADMIN_EMAIL,
    ...overrides,
  };
  for (const [name, value] of Object.entries(claims)) if (value === undefined) delete claims[name];
  return new jose.SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'offline-key' }).sign(key);
}

function fixture(options = {}) {
  const runtimeBindings = options.bindings ?? bindings();
  const calls = { jwks: 0, identity: 0 };
  const verifyAccessJwt = createAccessJwtVerifier({
    jwtVerify: jose.jwtVerify,
    createRemoteJWKSet(url, init) {
      assert.equal(url.href, `https://${TEAM_DOMAIN}/cdn-cgi/access/certs`);
      return jose.createRemoteJWKSet(url, {
        ...init,
        [jose.customFetch]: async (input) => {
          assert.equal(String(input), `https://${TEAM_DOMAIN}/cdn-cgi/access/certs`);
          calls.jwks++;
          return Response.json({ keys: [publicJwk] });
        },
      });
    },
  });
  const authorize = createCinaAuthAccessAuthorizer({
    runtimeBindings: () => runtimeBindings,
    verifyAccessJwt,
    fetchIdentity: async (input, init) => {
      calls.identity++;
      assert.equal(String(input), `https://${TEAM_DOMAIN}/cdn-cgi/access/get-identity`);
      assert.equal(init.method, 'GET');
      assert.equal(init.redirect, 'error');
      assert.match(new Headers(init.headers).get('Cookie'), /^CF_Authorization=[A-Za-z0-9_.-]+$/);
      return options.response ? options.response() : Response.json(options.identity ?? identity());
    },
  });
  return { authorize, authenticate: createCinaAuthAccessAuthenticate(authorize), calls, runtimeBindings };
}

async function request(overrides = {}) {
  return new Request('https://preview.example.test/_emdash/admin/', {
    headers: { 'Cf-Access-Jwt-Assertion': await token(overrides) },
  });
}
const denied = (error) =>
  error instanceof CinaAuthAccessError &&
  error.status === 401 &&
  error.message === 'CinaAuth Access authentication denied' &&
  error.cause === undefined;
const unavailable = (error) => error instanceof CinaAuthAccessError && error.status === 503;

test('verified allowlisted CinaAuth identity produces native admin AuthResult, without provisioning in adapter', async () => {
  const f = fixture();
  const result = await f.authenticate(await request(), { autoProvision: true, syncRoles: true });
  assert.equal(result.email, ADMIN_EMAIL);
  assert.equal(result.role, 50);
  assert.equal(result.subject, 'access-test-subject');
  assert.deepEqual(result.metadata, { idp: { id: IDP_ID, type: 'oidc' }, email_verified: true });
  assert.equal(f.calls.identity, 1);
});

for (const [label, claims] of [
  ['wrong audience', { aud: ['b'.repeat(64)] }],
  ['missing audience', { aud: undefined }],
  ['wrong issuer', { iss: 'https://auth.example.test' }],
  ['missing issuer', { iss: undefined }],
  ['expired token', { exp: 1 }],
  ['missing expiry', { exp: undefined }],
  ['missing subject', { sub: undefined }],
  ['service-token empty subject', { sub: '' }],
  ['non-application token', { type: 'org' }],
  ['unallowlisted JWT email', { email: 'other@example.test' }],
  ['JWT without email', { email: undefined }],
]) {
  test(`real JOSE and adapter reject ${label} before identity fetch`, async () => {
    const f = fixture();
    await assert.rejects(f.authorize(await request(claims)), denied);
    assert.equal(f.calls.identity, 0);
  });
}

test('real JOSE rejects a JWT signed with an unrelated private key', async () => {
  const unrelated = await jose.generateKeyPair('RS256');
  const f = fixture();
  const r = new Request('https://preview.example.test/_emdash/admin/', {
    headers: { 'Cf-Access-Jwt-Assertion': await token({}, unrelated.privateKey) },
  });
  await assert.rejects(f.authorize(r), denied);
  assert.equal(f.calls.identity, 0);
});

test('real JOSE restricts application tokens to RS256', async () => {
  const key = await jose.generateKeyPair('RS512');
  const signed = await new jose.SignJWT({
    iss: `https://${TEAM_DOMAIN}`,
    aud: [AUDIENCE],
    sub: 'access-test-subject',
    exp: Math.floor(Date.now() / 1000) + 300,
    type: 'app',
    email: ADMIN_EMAIL,
  })
    .setProtectedHeader({ alg: 'RS512', kid: 'offline-key' })
    .sign(key.privateKey);
  const f = fixture();
  await assert.rejects(
    f.authorize(
      new Request('https://preview.example.test/_emdash/admin/', {
        headers: { 'Cf-Access-Jwt-Assertion': signed },
      })
    ),
    denied
  );
  assert.deepEqual(f.calls, { jwks: 0, identity: 0 });
});

for (const [label, changed] of [
  ['false verified email', { oidc_fields: { email_verified: false } }],
  ['missing verified email', { oidc_fields: {} }],
  ['string verified email', { oidc_fields: { email_verified: 'true' } }],
  ['missing OIDC fields', { oidc_fields: undefined }],
  ['verified email at wrong location', { oidc_fields: undefined, email_verified: true }],
  ['wrong IdP', { idp: { id: 'different-idp', type: 'oidc' } }],
  ['wrong IdP type', { idp: { id: IDP_ID, type: 'onetimepin' } }],
  ['missing IdP', { idp: undefined }],
  ['unallowlisted identity email', { email: 'other@example.test' }],
  ['service identity', { service_token_status: true }],
]) {
  test(`identity authorization rejects ${label}`, async () => {
    const f = fixture({ identity: { ...identity(), ...changed } });
    await assert.rejects(f.authorize(await request()), denied);
    assert.equal(f.calls.identity, 1);
  });
}

for (const key of Object.keys(bindings())) {
  test(`missing runtime ${key} fails closed instead of enabling password auth`, async () => {
    const env = bindings();
    delete env[key];
    const f = fixture({ bindings: env });
    await assert.rejects(f.authorize(await request()), unavailable);
    assert.deepEqual(f.calls, { jwks: 0, identity: 0 });
  });

  test(`runtime ${key} rejects trailing whitespace before any JWKS or identity request`, async () => {
    for (const suffix of ['\n', '\r\n', ' ']) {
      const env = bindings();
      env[key] += suffix;
      const f = fixture({ bindings: env });
      await assert.rejects(f.authorize(await request()), unavailable);
      assert.deepEqual(f.calls, { jwks: 0, identity: 0 });
    }
  });
}

test('request cache only reuses the same request, JWT and runtime configuration', async () => {
  const f = fixture();
  const r = await request();
  await Promise.all([f.authorize(r), f.authenticate(r, { autoProvision: true, syncRoles: true })]);
  assert.equal(f.calls.identity, 1);
  await f.authorize(await request());
  assert.equal(f.calls.identity, 2);
  f.runtimeBindings.EMDASH_ACCESS_ADMIN_EMAIL = 'other@example.test';
  await assert.rejects(f.authorize(r), denied);
  assert.equal(f.calls.identity, 2);
  f.runtimeBindings.EMDASH_ACCESS_ADMIN_EMAIL = ADMIN_EMAIL;
  r.headers.set('Cf-Access-Jwt-Assertion', await token({ aud: ['b'.repeat(64)] }));
  await assert.rejects(f.authorize(r), denied);
});

test('failed identity authorization is not cached across retry', async () => {
  const data = identity();
  data.oidc_fields.email_verified = false;
  const f = fixture({ identity: data });
  const r = await request();
  await assert.rejects(f.authorize(r), denied);
  data.oidc_fields.email_verified = true;
  assert.equal((await f.authorize(r)).role, 50);
  assert.equal(f.calls.identity, 2);
});

test('spoofed email headers, preview password and native cookies cannot replace an Access JWT', async () => {
  const f = fixture();
  const r = new Request('https://preview.example.test/_emdash/admin/', {
    headers: {
      'Cf-Access-Authenticated-User-Email': ADMIN_EMAIL,
      Authorization: 'Basic dGVzdDpwYXNz',
      Cookie: 'CF_Authorization=not.a.token; emdash_preview_access=old; session=old',
    },
  });
  await assert.rejects(f.authorize(r), denied);
  assert.deepEqual(f.calls, { jwks: 0, identity: 0 });
});

for (const [label, response] of [
  ['HTTP failure', () => new Response('upstream-sensitive-error', { status: 502 })],
  ['redirect', () => new Response(null, { status: 302, headers: { Location: 'https://untrusted.example.test' } })],
  ['malformed JSON', () => new Response('token-or-secret', { headers: { 'Content-Type': 'application/json' } })],
  ['oversized body', () => new Response('x'.repeat(65537), { headers: { 'Content-Type': 'application/json' } })],
  [
    'unknown upstream exception',
    () => {
      throw new Error('JWT=secret-value; email=private@example.test', { cause: 'client-secret-value' });
    },
  ],
]) {
  test(`identity ${label} returns a sanitized error`, async () => {
    const f = fixture({ response });
    await assert.rejects(f.authorize(await request()), denied);
  });
}

test('native descriptor must explicitly permit controlled provisioning and role sync', async () => {
  const f = fixture();
  await assert.rejects(f.authenticate(await request(), {}), unavailable);
  await assert.rejects(f.authenticate(await request(), { autoProvision: true, syncRoles: false }), unavailable);
  assert.deepEqual(f.calls, { jwks: 0, identity: 0 });
});
