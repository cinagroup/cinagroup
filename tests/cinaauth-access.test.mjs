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
  const denials = [];
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
      assert.equal(init.redirect, 'manual');
      assert.match(new Headers(init.headers).get('Cookie'), /^CF_Authorization=[A-Za-z0-9_.-]+$/);
      return options.response ? options.response() : Response.json(options.identity ?? identity());
    },
    onDenied: (diagnostic) => {
      denials.push(diagnostic);
      options.onDenied?.(diagnostic);
    },
  });
  return { authorize, authenticate: createCinaAuthAccessAuthenticate(authorize), calls, runtimeBindings, denials };
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

for (const [stage, options, buildRequest] of [
  ['runtime_configuration', { bindings: {} }, request],
  [
    'request_protocol',
    {},
    async () =>
      new Request('http://preview.example.test/_emdash/admin/', {
        headers: { 'Cf-Access-Jwt-Assertion': await token() },
      }),
  ],
  [
    'assertion_missing',
    {},
    async () =>
      new Request('https://preview.example.test/_emdash/admin/', {
        headers: { Cookie: 'CF_Authorization=untrusted-cookie; session=sensitive-session' },
      }),
  ],
  [
    'assertion_shape',
    {},
    async () =>
      new Request('https://preview.example.test/_emdash/admin/', {
        headers: { 'Cf-Access-Jwt-Assertion': 'sensitive-invalid-assertion' },
      }),
  ],
  ['jwt_verification', {}, async () => request({ aud: ['b'.repeat(64)] })],
  ['jwt_claims', {}, async () => request({ email: 'other@example.test' })],
  [
    'identity_fetch',
    {
      response: () => {
        throw new Error('upstream-sensitive-error');
      },
    },
    request,
  ],
  ['identity_http', { response: () => new Response('upstream-sensitive-error', { status: 502 }) }, request],
  [
    'identity_content_type',
    {
      response: () =>
        new Response('upstream-sensitive-error', {
          headers: { 'Content-Type': 'text/html' },
        }),
    },
    request,
  ],
  [
    'identity_body_limit',
    {
      response: () =>
        new Response('upstream-sensitive-error', {
          headers: { 'Content-Type': 'application/json', 'Content-Length': '65537' },
        }),
    },
    request,
  ],
  [
    'identity_body_missing',
    {
      response: () =>
        new Response(null, {
          headers: { 'Content-Type': 'application/json' },
        }),
    },
    request,
  ],
  [
    'identity_body_read',
    {
      response: () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error('sensitive-stream-error'));
            },
          }),
          { headers: { 'Content-Type': 'application/json' } }
        ),
    },
    request,
  ],
  [
    'identity_json',
    {
      response: () =>
        new Response('upstream-sensitive-error', {
          headers: { 'Content-Type': 'application/json' },
        }),
    },
    request,
  ],
  ['identity_email', { identity: { ...identity(), email: 'other@example.test' } }, request],
  ['identity_idp', { identity: { ...identity(), idp: { id: 'other-sensitive-idp', type: 'oidc' } } }, request],
  ['identity_oidc_fields', { identity: { ...identity(), oidc_fields: undefined } }, request],
  ['identity_email_verified', { identity: { ...identity(), oidc_fields: { email_verified: 'true' } } }, request],
  ['identity_service', { identity: { ...identity(), service_token_status: true } }, request],
]) {
  test(`denial diagnostic projects only fixed stage ${stage} and optional HTTP status`, async () => {
    const f = fixture(options);
    await assert.rejects(f.authorize(await buildRequest()), stage === 'runtime_configuration' ? unavailable : denied);
    assert.deepEqual(f.denials, [{ stage, ...(stage === 'identity_http' ? { identityHttpStatus: 502 } : {}) }]);
    const serialized = JSON.stringify(f.denials);
    for (const sensitive of [ADMIN_EMAIL, 'other@example.test', 'sensitive', 'CF_Authorization', 'https://']) {
      assert.equal(serialized.includes(sensitive), false);
    }
  });
}

test('successful authorization emits no denial diagnostic', async () => {
  const f = fixture();
  assert.equal((await f.authorize(await request())).role, 50);
  assert.deepEqual(f.denials, []);
});

test('throwing diagnostic sink cannot change rejection or expose its error', async () => {
  const f = fixture({
    onDenied: () => {
      throw new Error('sink-sensitive-error', { cause: 'sensitive-cause' });
    },
  });
  await assert.rejects(f.authorize(await request({ aud: ['b'.repeat(64)] })), denied);
  assert.deepEqual(f.denials, [{ stage: 'jwt_verification' }]);
  assert.deepEqual(f.calls, { jwks: 1, identity: 0 });
});

test('throwing diagnostic sink preserves unavailable status and cannot authorize', async () => {
  const f = fixture({
    bindings: {},
    onDenied: () => {
      throw new Error('sink-sensitive-error');
    },
  });
  await assert.rejects(f.authorize(await request()), unavailable);
  assert.deepEqual(f.denials, [{ stage: 'runtime_configuration' }]);
  assert.deepEqual(f.calls, { jwks: 0, identity: 0 });
});

test('concurrent request cache retains the actual sanitized denial stage', async () => {
  const f = fixture({ identity: { ...identity(), oidc_fields: { email_verified: false } } });
  const r = await request();
  await Promise.all([
    assert.rejects(f.authorize(r), denied),
    assert.rejects(f.authenticate(r, { autoProvision: true, syncRoles: true }), denied),
  ]);
  assert.equal(f.calls.identity, 1);
  assert.deepEqual(f.denials, [{ stage: 'identity_email_verified' }, { stage: 'identity_email_verified' }]);
});

for (const status of [301, 302, 303, 307, 308]) {
  test(`identity redirect ${status} is denied without following or trusting its JSON body`, async () => {
    const f = fixture({
      response: () =>
        Response.json(identity(), {
          status,
          headers: { Location: 'https://untrusted.example.test/captured' },
        }),
    });
    await assert.rejects(f.authorize(await request()), denied);
    assert.equal(f.calls.identity, 1);
    assert.deepEqual(f.denials, [{ stage: 'identity_http', identityHttpStatus: status }]);
  });
}

test(
  'workerd authorizer accepts fixed-origin identity and never follows credential redirects',
  {
    skip:
      process.platform === 'win32'
        ? 'Windows workerd has a startup access violation; Linux CI runs this runtime regression'
        : false,
    timeout: 40000,
  },
  async () => {
    const { readFile } = await import('node:fs/promises');
    const esbuild = await import(pathToFileURL(requireFromProject.resolve('esbuild')).href);
    const runtime = await import(pathToFileURL(requireFromProject.resolve('miniflare')).href);
    const productionCore = await readFile(new URL('../src/emdash/cinaauth-access-core.ts', import.meta.url), 'utf8');
    const { code } = await esbuild.transform(productionCore, { loader: 'ts', format: 'esm', target: 'es2022' });
    const testBindings = bindings();
    const testIdentity = identity();
    let identityStatus = 200;
    const calls = { identity: 0, redirectTarget: 0, unexpected: 0 };
    const options = {
      modules: true,
      compatibilityDate: '2026-03-18',
      compatibilityFlags: ['nodejs_compat'],
      cf: false,
      log: new runtime.Log(runtime.LogLevel.NONE),
      script:
        code +
        `
      export default { async fetch() {
        const denials = [];
        const authorize = createCinaAuthAccessAuthorizer({
          runtimeBindings: () => ${JSON.stringify(testBindings)},
          verifyAccessJwt: async () => ({
            type: 'app', email: ${JSON.stringify(ADMIN_EMAIL)}, sub: 'offline-runtime-subject',
            exp: Math.floor(Date.now() / 1000) + 300,
          }),
          fetchIdentity: (input, init) => fetch(input, init),
          onDenied: (diagnostic) => denials.push(diagnostic),
        });
        try {
          const result = await authorize(new Request('https://preview.example.test/_emdash/admin/', {
            headers: { 'Cf-Access-Jwt-Assertion': 'offline.fixture.assertion' },
          }));
          return Response.json({ allowed: true, role: result.role, denials });
        } catch (error) {
          return Response.json({ allowed: false, status: error.status, denials });
        }
      } };
    `,
      outboundService: (upstreamRequest) => {
        const url = new URL(upstreamRequest.url);
        if (url.origin === `https://${TEAM_DOMAIN}` && url.pathname === '/cdn-cgi/access/get-identity') {
          assert.equal(url.href, `https://${TEAM_DOMAIN}/cdn-cgi/access/get-identity`);
          assert.equal(upstreamRequest.method, 'GET');
          assert.equal(upstreamRequest.headers.get('Cookie'), 'CF_Authorization=offline.fixture.assertion');
          assert.equal(upstreamRequest.headers.get('Accept'), 'application/json');
          calls.identity++;
          return runtime.Response.json(testIdentity, {
            status: identityStatus,
            ...(identityStatus === 200
              ? {}
              : {
                  headers: { Location: 'https://untrusted.example.test/captured' },
                }),
          });
        }
        if (url.origin === 'https://untrusted.example.test') calls.redirectTarget++;
        else calls.unexpected++;
        return new runtime.Response('offline fixture refuses unexpected request', { status: 500 });
      },
    };
    const mf = new runtime.Miniflare(
      runtime.convertV4MiniflareOptions ? runtime.convertV4MiniflareOptions(options) : options
    );
    try {
      const allowed = await mf.dispatchFetch('http://runtime-fixture.example.test/');
      assert.deepEqual(await allowed.json(), { allowed: true, role: 50, denials: [] });
      for (const status of [301, 302, 303, 307, 308]) {
        identityStatus = status;
        const redirected = await mf.dispatchFetch('http://runtime-fixture.example.test/');
        assert.deepEqual(await redirected.json(), {
          allowed: false,
          status: 401,
          denials: [{ stage: 'identity_http', identityHttpStatus: status }],
        });
      }
      assert.deepEqual(calls, { identity: 6, redirectTarget: 0, unexpected: 0 });
    } finally {
      await mf.dispose();
    }
  }
);
