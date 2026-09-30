import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  configureEmDashAccessRuntime,
  safeRuntimeConfigurationError,
} from '../scripts/configure-emdash-access-runtime.mjs';

const ACCOUNT = '7ea8e46d8210bad342fa7595f7935fea';
const WORKER = 'cinagroup-emdash-preview';
const HOST = `${WORKER}.cinagroup.workers.dev`;
const IDP = '4b05ed38-1315-4d88-b25c-ee1c2b0f37f5';
const AUD = 'a'.repeat(64);
const ADMIN_APP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const MEDIA_APP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';
const EMAIL = 'editor@preview.example';
const TOKEN = 'TOKEN-NEVER-PRINT';
const VALUES = Object.freeze({
  EMDASH_AUTH_MODE: 'cinaauth-access',
  CF_ACCESS_TEAM_DOMAIN: 'cinagroup.cloudflareaccess.com',
  CF_ACCESS_AUDIENCE: AUD,
  CF_ACCESS_CINA_AUTH_IDP_ID: IDP,
  CF_ACCESS_CINA_AUTH_IDP_TYPE: 'oidc',
  EMDASH_ACCESS_ADMIN_EMAIL: EMAIL,
});
const ENV = Object.freeze({ ...VALUES, CLOUDFLARE_ACCOUNT_ID: ACCOUNT, CLOUDFLARE_API_TOKEN: TOKEN });
const LOCAL = Object.freeze({
  name: WORKER,
  assets: { run_worker_first: true },
  d1_databases: [
    { binding: 'DB', database_id: '050ec919-1b18-4de8-86a8-62c16c28e59c' },
    { binding: 'CONTACT_DB', database_id: 'a24a999d-f784-4ee1-8dcd-888a7be43e7c' },
  ],
  r2_buckets: [{ binding: 'MEDIA', bucket_name: 'cinagroup-emdash-media-preview' }],
});
const CLONE = (value) => structuredClone(value);
const ok = (result, info) => Response.json({ success: true, result, ...(info ? { result_info: info } : {}) });

function fixture({ onRequest } = {}) {
  const state = {
    settingsReads: 0,
    secretsReads: 0,
    bindings: [
      { name: 'DB', type: 'd1', database_id: LOCAL.d1_databases[0].database_id },
      { name: 'CONTACT_DB', type: 'd1', database_id: LOCAL.d1_databases[1].database_id },
      { name: 'MEDIA', type: 'r2_bucket', bucket_name: LOCAL.r2_buckets[0].bucket_name },
      { name: 'EMDASH_ENCRYPTION_KEY', type: 'secret_text' },
      { name: 'EMDASH_PREVIEW_ADMIN_PASSWORD', type: 'secret_text' },
      { name: 'TURNSTILE_SECRET_KEY', type: 'secret_text' },
      { name: 'PUBLIC_TURNSTILE_SITE_KEY', type: 'secret_text' },
    ],
    secrets: [
      'EMDASH_ENCRYPTION_KEY',
      'EMDASH_PREVIEW_ADMIN_PASSWORD',
      'TURNSTILE_SECRET_KEY',
      'PUBLIC_TURNSTILE_SITE_KEY',
    ].map((name) => ({ name, type: 'secret_text' })),
    workers: [{ id: WORKER, tag: 'c81a2d22c29840ed9d61681a3270dbff', routes: [] }],
    domains: [],
    subdomain: { enabled: true },
    accountSubdomain: { subdomain: 'cinagroup' },
    organization: { auth_domain: VALUES.CF_ACCESS_TEAM_DOMAIN },
    provider: {
      id: IDP,
      type: 'oidc',
      name: 'CinaAuth EmDash preview',
      config: {
        auth_url: 'https://auth.cinaseek.si/api/auth/oauth2/authorize',
        token_url: 'https://auth.cinaseek.si/api/auth/oauth2/token',
        certs_url: 'https://auth.cinaseek.si/api/auth/jwks/cloudflare-access',
        client_id: 'PRIVATE-CLIENT-ID',
        client_secret: 'PRIVATE-CLIENT-SECRET',
        claims: ['email_verified'],
        pkce_enabled: true,
      },
    },
    apps: [
      {
        id: ADMIN_APP_ID,
        aud: AUD,
        type: 'self_hosted',
        name: 'CinaGroup EmDash preview admin',
        domain: `${HOST}/_emdash`,
        destinations: [{ type: 'public', uri: `${HOST}/_emdash` }],
        allowed_idps: [IDP],
        auto_redirect_to_identity: true,
        allow_authenticate_via_warp: false,
        policies: [
          {
            name: 'Verified CinaAuth preview administrator',
            decision: 'allow',
            include: [{ email: { email: EMAIL } }],
            require: [{ oidc: { claim_name: 'email_verified', claim_value: 'true', identity_provider_id: IDP } }],
          },
        ],
      },
      {
        id: MEDIA_APP_ID,
        aud: 'b'.repeat(64),
        type: 'self_hosted',
        name: 'CinaGroup EmDash preview public file media',
        domain: `${HOST}/_emdash/api/media/file/*`,
        destinations: [{ type: 'public', uri: `${HOST}/_emdash/api/media/file/*` }],
        policies: [{ name: 'Public preview file media', decision: 'bypass', include: [{ everyone: {} }] }],
      },
    ],
  };
  const calls = [];
  const fetchImpl = async (input, init) => {
    const url = new URL(input);
    const path = url.pathname.replace(`/client/v4/accounts/${ACCOUNT}`, '');
    calls.push({ url, path, init });
    assert.equal(url.origin, 'https://api.cloudflare.com');
    assert.ok(url.pathname.startsWith(`/client/v4/accounts/${ACCOUNT}/`));
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
    assert.ok(['GET', 'PATCH'].includes(init.method));
    const override = await onRequest?.({ url, path, init, state, calls });
    if (override) return override;
    if (path === `/workers/scripts/${WORKER}/settings`) {
      state.settingsReads++;
      return ok({ bindings: state.bindings });
    }
    if (path === '/workers/scripts') return ok(state.workers);
    if (path === '/workers/domains') return ok(state.domains);
    if (path === `/workers/scripts/${WORKER}/subdomain`) return ok(state.subdomain);
    if (path === '/workers/subdomain') return ok(state.accountSubdomain);
    if (path === `/workers/scripts/${WORKER}/secrets`) {
      state.secretsReads++;
      return ok(state.secrets);
    }
    if (path === '/access/organizations') return ok(state.organization);
    if (path === '/access/identity_providers') return ok([state.provider]);
    if (path === `/access/identity_providers/${IDP}`) return ok(state.provider);
    if (path === '/access/apps') return ok(state.apps);
    const policies = path.match(/^\/access\/apps\/([^/]+)\/policies$/);
    if (policies) return ok(state.apps.find((app) => app.id === policies[1])?.policies);
    const app = path.match(/^\/access\/apps\/([^/]+)$/);
    if (app) return ok(state.apps.find((item) => item.id === app[1]));
    if (path === `/workers/scripts/${WORKER}/secrets-bulk` && init.method === 'PATCH') {
      const body = JSON.parse(init.body);
      for (const [name, secret] of Object.entries(body.secrets)) {
        assert.ok(!state.bindings.some((binding) => binding.name === name), 'Must write absent targets only');
        state.bindings.push({ name, type: secret.type });
        state.secrets.push({ name, type: secret.type });
      }
      return ok(
        Object.fromEntries(Object.entries(body.secrets).map(([name, secret]) => [name, { name, type: secret.type }]))
      );
    }
    assert.fail(`Unexpected mock endpoint ${path}`);
  };
  return { state, calls, fetchImpl };
}

const run = (mock, operation = 'configure', overrides = {}) =>
  configureEmDashAccessRuntime({
    operation,
    environment: ENV,
    workerConfig: CLONE(LOCAL),
    fetchImpl: mock.fetchImpl,
    ...overrides,
  });
const writes = (mock) => mock.calls.filter(({ init }) => init.method !== 'GET');
const assertNoWrites = (mock) => assert.equal(writes(mock).length, 0);
const addExisting = (mock, names = Object.keys(VALUES)) => {
  for (const name of names) {
    mock.state.bindings.push({ name, type: 'secret_text' });
    mock.state.secrets.push({ name, type: 'secret_text' });
  }
};

test('audit verifies the real Access plan and exact isolated Worker using reads only', async () => {
  const mock = fixture();
  const report = await run(mock, 'audit');
  assert.equal(report.state, 'ready-to-create');
  assert.equal(report.existingRuntimeBindingCount, 0);
  assert.equal(report.existingSecretValuesRead, false);
  assert.equal(report.accessAndWorkerBoundaryVerified, true);
  assertNoWrites(mock);
  assert.equal(mock.calls.filter(({ path }) => path.endsWith('/policies')).length, 2);
  for (const sensitive of [TOKEN, EMAIL, 'PRIVATE-CLIENT-ID', 'PRIVATE-CLIENT-SECRET'])
    assert.ok(!JSON.stringify(report).includes(sensitive));
});

test('configure makes one exact six-binding batch and preserves all unrelated secrets', async () => {
  const mock = fixture();
  const old = CLONE(mock.state.secrets);
  const report = await run(mock);
  assert.equal(writes(mock).length, 1);
  const [{ path, init }] = writes(mock);
  assert.equal(path, `/workers/scripts/${WORKER}/secrets-bulk`);
  assert.equal(init.headers['Content-Type'], 'application/json');
  const submitted = JSON.parse(init.body).secrets;
  assert.deepEqual(Object.keys(submitted).sort(), Object.keys(VALUES).sort());
  for (const [name, text] of Object.entries(VALUES))
    assert.deepEqual(submitted[name], { name, text, type: 'secret_text' });
  assert.deepEqual(mock.state.secrets.slice(0, old.length), old);
  assert.equal(mock.state.settingsReads, 3);
  assert.equal(mock.state.secretsReads, 3);
  assert.equal(report.state, 'created');
  assert.equal(report.createdBindingCount, 6);
  assert.equal(report.existingSecretNamesPreserved, true);
  assert.equal(report.valuesVerifiedByReadback, false);
  for (const sensitive of [TOKEN, EMAIL, 'PRIVATE-CLIENT-ID', 'PRIVATE-CLIENT-SECRET'])
    assert.ok(!JSON.stringify(report).includes(sensitive));
});

test('repeating configure never overwrites masked target values or reports them verified', async () => {
  const mock = fixture();
  await run(mock);
  mock.calls.length = 0;
  const audit = await run(mock, 'audit');
  assert.equal(audit.state, 'existing-unverifiable');
  assert.equal(audit.existingConfigurationUnverifiable, true);
  assert.equal(audit.existingRuntimeBindingCount, 6);
  await assert.rejects(run(mock), /values are masked/);
  assertNoWrites(mock);
});

test('partial existing runtime configuration is refused before any write', async () => {
  const mock = fixture();
  addExisting(mock, ['CF_ACCESS_TEAM_DOMAIN']);
  assert.equal((await run(mock, 'audit')).existingRuntimeBindingCount, 1);
  await assert.rejects(run(mock), /partial configuration/);
  assertNoWrites(mock);
});

test('every runtime value rejects missing, LF, CRLF and surrounding spaces before network', async () => {
  for (const name of Object.keys(VALUES)) {
    for (const value of [
      undefined,
      `${VALUES[name]}\n`,
      `${VALUES[name]}\r\n`,
      `${VALUES[name]} `,
      ` ${VALUES[name]}`,
    ]) {
      const mock = fixture();
      await assert.rejects(
        run(mock, 'configure', { environment: { ...ENV, [name]: value } }),
        /binding.*missing or invalid/
      );
      assert.equal(mock.calls.length, 0);
    }
  }
});

test('invalid fixed runtime values and credentials fail before network without leaking input', async () => {
  for (const [name, value] of [
    ['EMDASH_AUTH_MODE', 'legacy-password'],
    ['CF_ACCESS_TEAM_DOMAIN', 'other.cloudflareaccess.com'],
    ['CF_ACCESS_AUDIENCE', 'b'.repeat(63)],
    ['CF_ACCESS_AUDIENCE', 'A'.repeat(64)],
    ['CF_ACCESS_CINA_AUTH_IDP_ID', 'private-invalid-idp'],
    ['CF_ACCESS_CINA_AUTH_IDP_TYPE', 'onetimepin'],
    ['EMDASH_ACCESS_ADMIN_EMAIL', 'Editor@preview.example'],
    ['EMDASH_ACCESS_ADMIN_EMAIL', 'a..b@preview.example'],
    ['CLOUDFLARE_ACCOUNT_ID', 'b'.repeat(32)],
    ['CLOUDFLARE_API_TOKEN', `${TOKEN}\n`],
  ]) {
    const mock = fixture();
    await assert.rejects(run(mock, 'configure', { environment: { ...ENV, [name]: value } }));
    assert.equal(mock.calls.length, 0);
  }
});

test('local production routes or incorrect resources fail before network', async () => {
  for (const change of [
    (c) => {
      c.name = 'production';
    },
    (c) => {
      c.routes = ['cinagroup.com/*'];
    },
    (c) => {
      c.assets.run_worker_first = false;
    },
    (c) => {
      c.workers_dev = false;
    },
    (c) => {
      c.d1_databases[0].database_id = 'b'.repeat(32);
    },
    (c) => {
      c.r2_buckets[0].bucket_name = 'production-media';
    },
    (c) => {
      c.d1_databases.push({ binding: 'OTHER', database_id: 'b'.repeat(32) });
    },
  ]) {
    const config = CLONE(LOCAL);
    change(config);
    const mock = fixture();
    await assert.rejects(run(mock, 'configure', { workerConfig: config }), /isolated preview Worker/);
    assert.equal(mock.calls.length, 0);
  }
});

test('remote routes, custom domains, wrong resources or subdomain cannot receive runtime writes', async () => {
  for (const change of [
    (s) => {
      s.workers[0].routes = [{ pattern: 'cinagroup.com/*' }];
    },
    (s) => {
      s.workers[0].routes = undefined;
    },
    (s) => {
      s.domains.push({ hostname: 'cinagroup.com' });
    },
    (s) => {
      s.bindings[0].database_id = 'b'.repeat(32);
    },
    (s) => {
      s.bindings[2].bucket_name = 'production-media';
    },
    (s) => {
      s.bindings.push({ name: 'OTHER', type: 'd1', database_id: 'b'.repeat(32) });
    },
    (s) => {
      s.subdomain.enabled = false;
    },
    (s) => {
      s.accountSubdomain.subdomain = 'other';
    },
  ]) {
    const mock = fixture();
    change(mock.state);
    await assert.rejects(run(mock), /not isolated/);
    assertNoWrites(mock);
  }
});

test('Access app, verified-email policy, IdP, team or AUD mismatch cannot receive runtime writes', async () => {
  for (const change of [
    (s) => {
      s.apps[0].aud = 'b'.repeat(64);
    },
    (s) => {
      s.apps[0].allowed_idps = ['b'.repeat(32)];
    },
    (s) => {
      s.apps[0].policies[0].include = [{ everyone: {} }];
    },
    (s) => {
      s.apps[0].policies[0].require = [];
    },
    (s) => {
      s.apps[0].policies[0].require[0].oidc.claim_value = 'false';
    },
    (s) => {
      s.apps[0].policies[0].require[0].oidc.identity_provider_id = 'b'.repeat(32);
    },
    (s) => {
      s.apps[0].domain = HOST;
    },
    (s) => {
      s.apps.pop();
    },
    (s) => {
      s.organization.auth_domain = 'other.cloudflareaccess.com';
    },
    (s) => {
      s.provider.type = 'onetimepin';
    },
    (s) => {
      s.provider.config.claims = [];
    },
    (s) => {
      s.provider.config.auth_url = 'https://auth.cinaseek.si/other-authorize';
    },
    (s) => {
      s.provider.config.token_url = 'https://auth.cinaseek.si/other-token';
    },
    (s) => {
      s.provider.config.certs_url = 'https://auth.cinaseek.si/api/auth/jwks';
    },
  ]) {
    const mock = fixture();
    change(mock.state);
    await assert.rejects(run(mock), /Access application|identity provider/);
    assertNoWrites(mock);
  }
});

test('target plaintext binding, duplicate secret names or mismatched metadata fail closed', async () => {
  for (const change of [
    (s) => {
      s.bindings.push({ name: 'EMDASH_AUTH_MODE', type: 'plain_text', text: 'private-incorrect' });
    },
    (s) => {
      s.secrets.push({ ...s.secrets[0] });
    },
    (s) => {
      s.secrets.push({ name: 'EMDASH_AUTH_MODE', type: 'secret_text' });
    },
    (s) => {
      s.bindings.push({ name: 'EMDASH_AUTH_MODE', type: 'secret_text' });
    },
  ]) {
    const mock = fixture();
    change(mock.state);
    await assert.rejects(run(mock), /inventory is invalid|cannot be safely reconciled/);
    assertNoWrites(mock);
  }
});

test('unrelated secret_key and existing public key are preserved by the six-item batch', async () => {
  const mock = fixture();
  mock.state.bindings.push({ name: 'OTHER_ENCRYPTION_KEY', type: 'secret_key' });
  mock.state.secrets.push({ name: 'OTHER_ENCRYPTION_KEY', type: 'secret_key' });
  await run(mock);
  assert.ok(mock.state.secrets.some((s) => s.name === 'OTHER_ENCRYPTION_KEY' && s.type === 'secret_key'));
  assert.ok(mock.state.secrets.some((s) => s.name === 'PUBLIC_TURNSTILE_SITE_KEY'));
  assert.ok(!JSON.parse(writes(mock)[0].init.body).secrets.PUBLIC_TURNSTILE_SITE_KEY);
});

test('a target appearing on the second preflight prevents the batch', async () => {
  let mock;
  mock = fixture({
    onRequest({ path, state }) {
      if (path.endsWith('/settings') && state.settingsReads === 1) addExisting(mock, ['EMDASH_AUTH_MODE']);
    },
  });
  await assert.rejects(run(mock), /changed during preflight/);
  assertNoWrites(mock);
});

test('a policy changing on the second preflight prevents the batch', async () => {
  const mock = fixture({
    onRequest({ path, state }) {
      if (path === '/access/apps' && state.settingsReads === 2) state.apps[0].policies[0].include = [{ everyone: {} }];
    },
  });
  await assert.rejects(run(mock), /policy preflight failed/);
  assertNoWrites(mock);
});

test('a secret disappearing on the second preflight prevents the batch', async () => {
  const mock = fixture({
    onRequest({ path, state }) {
      if (path.endsWith('/settings') && state.settingsReads === 1) {
        state.bindings.pop();
        state.secrets.pop();
      }
    },
  });
  await assert.rejects(run(mock), /changed during preflight/);
  assertNoWrites(mock);
});

test('masked existing values are never accessed or compared against proposed values', async () => {
  const mock = fixture();
  addExisting(mock);
  const protectedNames = mock.state.secrets.map((entry) => ({
    name: entry.name,
    type: entry.type,
    get text() {
      throw new Error('PRIVATE-VALUE-NEVER-READ');
    },
  }));
  const fetchImpl = async (input, init) =>
    new URL(input).pathname.endsWith('/secrets')
      ? { ok: true, json: async () => ({ success: true, result: protectedNames }) }
      : mock.fetchImpl(input, init);
  const report = await run(mock, 'audit', { fetchImpl });
  assert.equal(report.existingConfigurationUnverifiable, true);
  await assert.rejects(run(mock, 'configure', { fetchImpl }), /values are masked/);
  assertNoWrites(mock);
});

test('an unknown preflight exception cannot disclose token, email, client credentials or error causes', async () => {
  const mock = fixture({
    onRequest() {
      throw new Error(`${TOKEN} ${EMAIL} PRIVATE-CLIENT-SECRET`);
    },
  });
  await assert.rejects(run(mock), (error) => {
    assert.match(safeRuntimeConfigurationError(error), /preflight failed/);
    assert.ok(!String(error).includes(TOKEN));
    assert.ok(!String(error).includes(EMAIL));
    assert.ok(!String(error).includes('PRIVATE-CLIENT-SECRET'));
    assert.equal(error.cause, undefined);
    return true;
  });
  assertNoWrites(mock);
  assert.equal(
    safeRuntimeConfigurationError(new Error(`${TOKEN} ${EMAIL}`)),
    'Access runtime configuration failed; sensitive diagnostics suppressed'
  );
});

test('untrusted failure JSON and invalid JSON cannot leak response diagnostics', async () => {
  for (const bad of [
    () => Response.json({ success: false, errors: [{ message: `${TOKEN} ${EMAIL}` }] }, { status: 403 }),
    () => new Response(`${TOKEN} ${EMAIL}`, { status: 502 }),
    () => ({
      ok: true,
      json() {
        throw new Error(`${TOKEN} ${EMAIL}`);
      },
    }),
  ]) {
    const mock = fixture({ onRequest: bad });
    await assert.rejects(run(mock), (error) => {
      assert.ok(!String(error).includes(TOKEN));
      assert.ok(!String(error).includes(EMAIL));
      return true;
    });
    assertNoWrites(mock);
  }
});

test('unknown bulk-write outcome never retries and instructs an audit', async () => {
  for (const response of [
    () => {
      throw new Error(`${TOKEN} ${EMAIL}`);
    },
    () => new Response(`${TOKEN} ${EMAIL}`, { status: 200 }),
    () => Response.json({ success: false, errors: [{ message: `${TOKEN} ${EMAIL}` }] }, { status: 403 }),
  ]) {
    const mock = fixture({
      onRequest({ init }) {
        if (init.method === 'PATCH') return response();
      },
    });
    await assert.rejects(run(mock), (error) => {
      assert.match(String(error), /audit before retrying/);
      assert.ok(!String(error).includes(TOKEN));
      assert.ok(!String(error).includes(EMAIL));
      return true;
    });
    assert.equal(writes(mock).length, 1);
  }
});

test('post-write missing target or loss of an existing secret reports failure with no second write', async () => {
  for (const change of [
    (s) => {
      s.bindings.pop();
      s.secrets.pop();
    },
    (s) => {
      s.bindings = s.bindings.filter((b) => b.name !== 'PUBLIC_TURNSTILE_SITE_KEY');
      s.secrets = s.secrets.filter((b) => b.name !== 'PUBLIC_TURNSTILE_SITE_KEY');
    },
  ]) {
    const mock = fixture({
      onRequest({ path, state }) {
        if (path.endsWith('/settings') && state.settingsReads === 2) change(state);
      },
    });
    await assert.rejects(run(mock), /retain every existing secret|verification failed/);
    assert.equal(writes(mock).length, 1);
  }
});

test('post-write upstream failure is explicitly an unknown verification state', async () => {
  const mock = fixture({
    onRequest({ path, state }) {
      if (path.endsWith('/settings') && state.settingsReads === 2) throw new Error(`${TOKEN} ${EMAIL}`);
    },
  });
  await assert.rejects(run(mock), /write completed but verification failed; audit before retrying/);
  assert.equal(writes(mock).length, 1);
});

test('custom-domain collision on a later inventory page prevents any write', async () => {
  const mock = fixture({
    onRequest({ path, url }) {
      if (path === '/workers/domains')
        return ok(url.searchParams.get('page') === '1' ? [] : [{ hostname: 'cinagroup.com' }], { total_pages: 2 });
    },
  });
  await assert.rejects(run(mock), /not isolated/);
  assertNoWrites(mock);
  assert.deepEqual(
    mock.calls.filter(({ path }) => path === '/workers/domains').map(({ url }) => url.searchParams.get('page')),
    ['1', '2']
  );
});

test('unsupported CLI operation fails without leaking environment or making requests', () => {
  const script = fileURLToPath(new URL('../scripts/configure-emdash-access-runtime.mjs', import.meta.url));
  const child = spawnSync(process.execPath, [script, 'delete'], { env: { ...process.env, ...ENV }, encoding: 'utf8' });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /Unsupported Access runtime configuration operation/);
  for (const sensitive of [TOKEN, EMAIL]) assert.ok(!`${child.stdout}${child.stderr}`.includes(sensitive));
});
