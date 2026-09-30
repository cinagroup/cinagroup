import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { configureEmDashPreviewAccess } from '../scripts/configure-emdash-access-preview.mjs';

const ACCOUNT_ID = '7ea8e46d8210bad342fa7595f7935fea';
const TEAM_DOMAIN = 'cinagroup.cloudflareaccess.com';
const HOST = 'cinagroup-emdash-preview.cinagroup.workers.dev';
const WORKER_ID = 'c81a2d22c29840ed9d61681a3270dbff';
const IDP_ID = '4b05ed38-1315-4d88-b25c-ee1c2b0f37f5';
const EMAIL = 'editor@preview.example';
const TOKEN = 'TOKEN-NEVER-PRINT';
const GOOD_IDP_CONFIG = Object.freeze({
  auth_url: 'https://auth.cinaseek.si/api/auth/oauth2/authorize',
  token_url: 'https://auth.cinaseek.si/api/auth/oauth2/token',
  certs_url: 'https://auth.cinaseek.si/api/auth/jwks/cloudflare-access',
  client_id: 'PRIVATE-CLIENT-ID',
  client_secret: 'PRIVATE-CLIENT-SECRET',
  claims: ['email_verified'],
  pkce_enabled: true,
});
const appId = (index) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`;
const ok = (result, resultInfo) =>
  Response.json({ success: true, result, ...(resultInfo ? { result_info: resultInfo } : {}) });

function fakeCloudflare({ teamDomain = TEAM_DOMAIN, providerOverrides = {}, existing = [], onRequest } = {}) {
  const provider = {
    id: IDP_ID,
    name: 'CinaAuth EmDash preview',
    type: 'oidc',
    config: { ...GOOD_IDP_CONFIG },
    ...providerOverrides,
  };
  const apps = [...existing];
  const calls = [];
  const fetchImpl = async (input, init) => {
    const url = new URL(input);
    calls.push({ url, init });
    assert.equal(url.origin, 'https://api.cloudflare.com');
    assert.ok(url.pathname.startsWith(`/client/v4/accounts/${ACCOUNT_ID}/`));
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
    assert.ok(['GET', 'POST'].includes(init.method));
    const overridden = onRequest?.(url, init, apps);
    if (overridden) return overridden;
    if (url.pathname.endsWith('/organizations')) return ok({ auth_domain: teamDomain, secret: TOKEN });
    if (url.pathname.endsWith('/identity_providers')) return ok([provider]);
    if (url.pathname.endsWith('/workers/scripts')) return ok([{ id: 'cinagroup-emdash-preview', tag: WORKER_ID }]);
    if (url.pathname.endsWith('/apps') && init.method === 'GET') return ok(apps);
    if (url.pathname.endsWith('/apps') && init.method === 'POST') {
      const body = JSON.parse(init.body);
      const created = { ...body, id: appId(apps.length + 1), aud: `aud_${apps.length + 1}` };
      apps.push(created);
      return ok(created);
    }
    const policyMatch = url.pathname.match(/\/apps\/([^/]+)\/policies$/);
    if (policyMatch) return ok(apps.find((app) => app.id === policyMatch[1])?.policies);
    const appMatch = url.pathname.match(/\/apps\/([^/]+)$/);
    if (appMatch) return ok(apps.find((app) => app.id === appMatch[1]));
    assert.fail(`Unexpected endpoint ${url.pathname}`);
  };
  return { apps, calls, fetchImpl };
}

const config = (fetchImpl, operation = 'plan') => ({
  operation,
  accountId: ACCOUNT_ID,
  token: TOKEN,
  adminEmail: EMAIL,
  idpId: IDP_ID,
  fetchImpl,
});

test('default plan reads fixed endpoints and reports only two proposed scoped apps', async () => {
  const cloudflare = fakeCloudflare();
  const report = await configureEmDashPreviewAccess(config(cloudflare.fetchImpl));
  assert.equal(report.operation, 'plan');
  assert.deepEqual(
    report.applications.map((app) => [app.role, app.path, app.state]),
    [
      ['admin', '/_emdash', 'would_create'],
      ['publicMedia', '/_emdash/api/media/file/*', 'would_create'],
    ]
  );
  assert.ok(cloudflare.calls.every(({ init }) => init.method === 'GET'));
  assert.deepEqual(
    cloudflare.calls.map(({ url }) => url.pathname),
    [
      `/client/v4/accounts/${ACCOUNT_ID}/access/organizations`,
      `/client/v4/accounts/${ACCOUNT_ID}/access/identity_providers`,
      `/client/v4/accounts/${ACCOUNT_ID}/workers/scripts`,
      `/client/v4/accounts/${ACCOUNT_ID}/access/apps`,
    ]
  );
  for (const secret of [TOKEN, EMAIL, 'PRIVATE-CLIENT-ID', 'PRIVATE-CLIENT-SECRET']) {
    assert.ok(!JSON.stringify(report).includes(secret));
  }
});

test('real HTTPS team domain is accepted but alternate schemes, credentials, and query strings are rejected', async () => {
  for (const teamDomain of [`https://${TEAM_DOMAIN}`, `https://${TEAM_DOMAIN}/`]) {
    const cloudflare = fakeCloudflare({ teamDomain });
    const report = await configureEmDashPreviewAccess(config(cloudflare.fetchImpl));
    assert.equal(report.operation, 'plan');
    assert.ok(cloudflare.calls.every(({ init }) => init.method === 'GET'));
  }
  for (const teamDomain of [
    `http://${TEAM_DOMAIN}`,
    `https://user@${TEAM_DOMAIN}`,
    `https://${TEAM_DOMAIN}?x=1`,
    `https://${TEAM_DOMAIN}//`,
  ]) {
    const cloudflare = fakeCloudflare({ teamDomain });
    await assert.rejects(configureEmDashPreviewAccess(config(cloudflare.fetchImpl, 'configure')), /team domain/);
    assert.ok(cloudflare.calls.every(({ init }) => init.method === 'GET'));
  }
});

test('admin email with leading or trailing whitespace or final newline is rejected before network', async () => {
  for (const adminEmail of [` ${EMAIL}`, `${EMAIL} `, `${EMAIL}\n`, `${EMAIL}\r\n`]) {
    const cloudflare = fakeCloudflare();
    await assert.rejects(
      configureEmDashPreviewAccess({ ...config(cloudflare.fetchImpl, 'configure'), adminEmail }),
      /ADMIN_EMAIL/
    );
    assert.equal(cloudflare.calls.length, 0);
  }
});

test('token with leading or trailing whitespace is rejected before network', async () => {
  for (const token of [` ${TOKEN}`, `${TOKEN} `, `${TOKEN}\n`]) {
    const cloudflare = fakeCloudflare();
    await assert.rejects(
      configureEmDashPreviewAccess({ ...config(cloudflare.fetchImpl, 'configure'), token }),
      /CLOUDFLARE_API_TOKEN/
    );
    assert.equal(cloudflare.calls.length, 0);
  }
});

test('configure creates only scoped admin and more-specific media bypass apps, then verifies both', async () => {
  const cloudflare = fakeCloudflare();
  const report = await configureEmDashPreviewAccess(config(cloudflare.fetchImpl, 'configure'));
  const posts = cloudflare.calls.filter(({ init }) => init.method === 'POST');
  assert.equal(posts.length, 2);
  assert.ok(posts.every(({ url }) => url.pathname === `/client/v4/accounts/${ACCOUNT_ID}/access/apps`));
  const [admin, media] = posts.map(({ init }) => JSON.parse(init.body));
  assert.equal(admin.domain, `${HOST}/_emdash`);
  assert.deepEqual(admin.destinations, [{ type: 'public', uri: `${HOST}/_emdash` }]);
  assert.deepEqual(admin.allowed_idps, [IDP_ID]);
  assert.equal(admin.auto_redirect_to_identity, true);
  assert.equal(admin.allow_authenticate_via_warp, false);
  assert.equal(admin.policies[0].decision, 'allow');
  assert.deepEqual(admin.policies[0].include, [{ email: { email: EMAIL } }]);
  assert.deepEqual(admin.policies[0].require, [
    { oidc: { claim_name: 'email_verified', claim_value: 'true', identity_provider_id: IDP_ID } },
  ]);
  assert.equal(media.domain, `${HOST}/_emdash/api/media/file/*`);
  assert.deepEqual(media.destinations, [{ type: 'public', uri: `${HOST}/_emdash/api/media/file/*` }]);
  assert.deepEqual(media.policies, [
    { name: 'Public preview file media', decision: 'bypass', include: [{ everyone: {} }] },
  ]);
  assert.equal(report.applications[0].aud, 'aud_1');
  assert.deepEqual(
    report.applications.map((app) => app.state),
    ['created', 'created']
  );
  for (const secret of [TOKEN, EMAIL, 'PRIVATE-CLIENT-ID', 'PRIVATE-CLIENT-SECRET']) {
    assert.ok(!JSON.stringify(report).includes(secret));
  }
});

test('rerun is idempotent and verifies exact existing apps without POST', async () => {
  const cloudflare = fakeCloudflare();
  await configureEmDashPreviewAccess(config(cloudflare.fetchImpl, 'configure'));
  cloudflare.calls.length = 0;
  const report = await configureEmDashPreviewAccess(config(cloudflare.fetchImpl, 'configure'));
  assert.deepEqual(
    report.applications.map((app) => app.state),
    ['existing', 'existing']
  );
  assert.ok(cloudflare.calls.every(({ init }) => init.method === 'GET'));
  assert.equal(cloudflare.calls.filter(({ url }) => url.pathname.endsWith('/policies')).length, 2);
});

test('an owned-name app with a changed allow policy is a conflict and is never overwritten', async () => {
  const cloudflare = fakeCloudflare();
  await configureEmDashPreviewAccess(config(cloudflare.fetchImpl, 'configure'));
  cloudflare.apps[0].policies[0].include = [{ everyone: {} }];
  cloudflare.calls.length = 0;
  await assert.rejects(
    configureEmDashPreviewAccess(config(cloudflare.fetchImpl, 'configure')),
    /differs from the expected configuration/
  );
  assert.ok(cloudflare.calls.every(({ init }) => init.method === 'GET'));
});

test('a collision on a later Access apps page prevents creation', async () => {
  const collision = { id: appId(99), name: 'Other app', domain: `${HOST}/_emdash/admin` };
  const cloudflare = fakeCloudflare({
    onRequest(url, init) {
      if (init.method === 'GET' && url.pathname.endsWith('/apps')) {
        return ok(url.searchParams.get('page') === '1' ? [] : [collision], { total_pages: 2 });
      }
      return null;
    },
  });
  await assert.rejects(
    configureEmDashPreviewAccess(config(cloudflare.fetchImpl, 'configure')),
    /targets the isolated preview hostname/
  );
  assert.ok(cloudflare.calls.every(({ init }) => init.method === 'GET'));
  assert.deepEqual(
    cloudflare.calls.filter(({ url }) => url.pathname.endsWith('/apps')).map(({ url }) => url.searchParams.get('page')),
    ['1', '2']
  );
});

test('same-host or Worker-wide Access conflicts prevent all writes', async () => {
  for (const existing of [
    [{ id: appId(9), name: 'Unrelated host app', domain: HOST, destinations: [{ type: 'public', uri: HOST }] }],
    [{ id: appId(9), name: 'Wildcard app', domain: '*.cinagroup.workers.dev', destinations: [] }],
    [{ id: appId(9), name: 'All Workers', destinations: [{ type: 'all_workers' }] }],
    [{ id: appId(9), name: 'This Worker', destinations: [{ type: 'worker', worker_id: WORKER_ID }] }],
    [
      {
        id: appId(9),
        name: 'Legacy extra domain',
        domain: 'other.example.test',
        self_hosted_domains: [`${HOST}/_emdash`],
      },
    ],
    [
      {
        id: appId(9),
        name: 'Legacy empty destinations',
        domain: 'other.example.test',
        destinations: [],
        self_hosted_domains: [`${HOST}/_emdash`],
      },
    ],
  ]) {
    const cloudflare = fakeCloudflare({ existing });
    await assert.rejects(configureEmDashPreviewAccess(config(cloudflare.fetchImpl, 'configure')), /Access application/);
    assert.ok(cloudflare.calls.every(({ init }) => init.method === 'GET'));
  }
});

test('a different Worker destination is unrelated and does not block scoped app creation', async () => {
  const otherWorkerApp = {
    id: appId(9),
    name: 'Other Worker',
    destinations: [{ type: 'worker', worker_id: 'b'.repeat(32) }],
  };
  const cloudflare = fakeCloudflare({ existing: [otherWorkerApp] });
  const report = await configureEmDashPreviewAccess(config(cloudflare.fetchImpl, 'configure'));
  assert.deepEqual(
    report.applications.map((app) => app.state),
    ['created', 'created']
  );
  assert.equal(cloudflare.apps[0], otherWorkerApp);
});

test('missing immutable preview Worker ID fails preflight before any app creation', async () => {
  const cloudflare = fakeCloudflare({
    onRequest(url) {
      if (url.pathname.endsWith('/workers/scripts')) return ok([{ id: 'cinagroup-emdash-preview' }]);
      return null;
    },
  });
  await assert.rejects(
    configureEmDashPreviewAccess(config(cloudflare.fetchImpl, 'configure')),
    /Worker ID is unavailable/
  );
  assert.ok(cloudflare.calls.every(({ init }) => init.method === 'GET'));
});

test('wrong account, team, or non-preview IdP cannot create an app', async () => {
  const cloudflare = fakeCloudflare();
  await assert.rejects(
    configureEmDashPreviewAccess({ ...config(cloudflare.fetchImpl, 'configure'), accountId: 'b'.repeat(32) }),
    /isolated preview account/
  );
  assert.equal(cloudflare.calls.length, 0);
  const wrongTeam = fakeCloudflare({ teamDomain: 'other.cloudflareaccess.com' });
  await assert.rejects(configureEmDashPreviewAccess(config(wrongTeam.fetchImpl, 'configure')), /team domain/);
  assert.ok(wrongTeam.calls.every(({ init }) => init.method === 'GET'));
  const oldIdp = fakeCloudflare({ providerOverrides: { name: 'CinaAuth' } });
  await assert.rejects(
    configureEmDashPreviewAccess(config(oldIdp.fetchImpl, 'configure')),
    /incomplete or not isolated/
  );
  assert.ok(oldIdp.calls.every(({ init }) => init.method === 'GET'));
  const missingClaim = fakeCloudflare({ providerOverrides: { config: { claims: [] } } });
  await assert.rejects(
    configureEmDashPreviewAccess(config(missingClaim.fetchImpl, 'configure')),
    /incomplete or not isolated/
  );
  assert.ok(missingClaim.calls.every(({ init }) => init.method === 'GET'));
  for (const configOverride of [
    { auth_url: 'https://evil.example.test/authorize' },
    { token_url: 'https://auth.cinaseek.si/api/auth/oauth2/wrong' },
    { certs_url: 'https://auth.cinaseek.si/api/auth/jwks/wrong' },
    { pkce_enabled: false },
  ]) {
    const changedIdp = fakeCloudflare({ providerOverrides: { config: { ...GOOD_IDP_CONFIG, ...configOverride } } });
    await assert.rejects(
      configureEmDashPreviewAccess(config(changedIdp.fetchImpl, 'configure')),
      /incomplete or not isolated/
    );
    assert.ok(changedIdp.calls.every(({ init }) => init.method === 'GET'));
  }
});

test('a failed media creation preserves the verified admin app and can resume safely', async () => {
  let failMedia = true;
  const cloudflare = fakeCloudflare({
    onRequest(url, init) {
      if (init.method === 'POST' && JSON.parse(init.body).domain.endsWith('/file/*') && failMedia) {
        return Response.json({ success: false, errors: [{ message: `leak ${TOKEN} ${EMAIL}` }] }, { status: 403 });
      }
      return null;
    },
  });
  await assert.rejects(
    configureEmDashPreviewAccess(config(cloudflare.fetchImpl, 'configure')),
    /outcome unknown; run read-only audit/
  );
  assert.equal(cloudflare.apps.length, 1);
  failMedia = false;
  cloudflare.calls.length = 0;
  const report = await configureEmDashPreviewAccess(config(cloudflare.fetchImpl, 'configure'));
  assert.deepEqual(
    report.applications.map((app) => app.state),
    ['existing', 'created']
  );
  assert.equal(cloudflare.calls.filter(({ init }) => init.method === 'POST').length, 1);
});

test('any ambiguous POST response requires read-only audit before retry', async () => {
  const responses = [
    new Response('bad gateway', { status: 502 }),
    new Response('not-json', { status: 200 }),
    Response.json({ success: false, errors: [{ message: `leak ${TOKEN} ${EMAIL}` }] }),
    ok({ id: 'invalid-id' }),
  ];
  for (const response of responses) {
    const cloudflare = fakeCloudflare({
      onRequest(url, init) {
        if (url.pathname.endsWith('/apps') && init.method === 'POST') return response;
        return null;
      },
    });
    await assert.rejects(
      configureEmDashPreviewAccess(config(cloudflare.fetchImpl, 'configure')),
      /outcome unknown; run read-only audit/
    );
    assert.equal(cloudflare.calls.filter(({ init }) => init.method === 'POST').length, 1);
  }
});

test('unsupported operation fails without a request or echoing environment values', async () => {
  let calls = 0;
  await assert.rejects(
    configureEmDashPreviewAccess({
      ...config(async () => {
        calls++;
      }),
      operation: 'delete',
    }),
    /Unsupported preview Access operation/
  );
  assert.equal(calls, 0);
  const script = fileURLToPath(new URL('../scripts/configure-emdash-access-preview.mjs', import.meta.url));
  const child = spawnSync(process.execPath, [script, 'delete'], {
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: TOKEN,
      CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
      EMDASH_ACCESS_ADMIN_EMAIL: EMAIL,
      CF_ACCESS_CINA_AUTH_IDP_ID: IDP_ID,
    },
    encoding: 'utf8',
  });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /Unsupported preview Access operation/);
  assert.ok(!`${child.stdout}${child.stderr}`.includes(TOKEN));
  assert.ok(!`${child.stdout}${child.stderr}`.includes(EMAIL));
});
