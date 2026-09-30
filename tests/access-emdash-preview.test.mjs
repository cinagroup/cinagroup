import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { auditEmDashPreviewAccess } from '../scripts/access-emdash-preview.mjs';

const ACCOUNT_ID = 'a'.repeat(32);
const TOKEN = 'cf_audit_token_DO_NOT_PRINT';
const HOST = 'cinagroup-emdash-preview.cinagroup.workers.dev';

const success = (result, result_info) =>
  Response.json({ success: true, result, ...(result_info ? { result_info } : {}) });

function auditFetch({ organization = {}, identityProviders = [], applications = [], onRequest } = {}) {
  const requests = [];
  const fetchImpl = async (input, init) => {
    const url = new URL(input);
    requests.push({ url, init });
    onRequest?.(url, init);
    assert.equal(url.origin, 'https://api.cloudflare.com');
    assert.match(
      url.pathname,
      new RegExp(`^/client/v4/accounts/${ACCOUNT_ID}/access/(organizations|identity_providers|apps)$`)
    );
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
    if (url.pathname.endsWith('/organizations')) return success(organization);
    if (url.pathname.endsWith('/identity_providers')) return success(identityProviders);
    return success(applications);
  };
  return { requests, fetchImpl };
}

test('default audit uses only fixed GET endpoints and returns a strict, nonsecret projection', async () => {
  const secret = 'client-secret-NEVER-PRINT';
  const { requests, fetchImpl } = auditFetch({
    organization: { auth_domain: 'myteam.cloudflareaccess.com', admin_email: 'owner@example.com', secret },
    identityProviders: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'CinaAuth',
        type: 'oidc',
        config: {
          auth_url: 'https://auth.example.com/authorize?secret=hidden',
          token_url: 'https://auth.example.com/token',
          certs_url: 'https://auth.example.com/jwks',
          client_id: 'client-id-DO-NOT-PRINT',
          client_secret: secret,
          claims: ['email_verified'],
        },
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Other OIDC',
        type: 'oidc',
        config: { client_secret: secret },
      },
      { id: '33333333-3333-4333-8333-333333333333', name: 'user@example.com', type: 'onetimepin' },
    ],
    applications: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        name: 'EmDash preview',
        type: 'self_hosted',
        domain: `${HOST}/_emdash`,
        aud: 'aud_preview_123',
        allowed_idps: ['11111111-1111-4111-8111-111111111111'],
        destinations: [
          {
            type: 'public',
            uri: `${HOST}/_emdash/*`,
            overrides: [{ behavior: 'public', path_pattern: '/_emdash/api/media/file/*' }],
          },
        ],
        policies: [{ include: [{ email: { email: 'owner@example.com' } }] }],
        client_secret: secret,
      },
      { name: 'Unrelated app', type: 'self_hosted', domain: 'other.example.com/admin', aud: 'other_aud' },
    ],
  });

  const result = await auditEmDashPreviewAccess({ accountId: ACCOUNT_ID, token: TOKEN, fetchImpl });
  assert.equal(result.organization.teamDomain, 'https://myteam.cloudflareaccess.com');
  assert.equal(result.identityProviders.items[0].name, 'CinaAuth');
  assert.equal(result.identityProviders.items[0].readiness.clientSecretPresentInResponse, true);
  assert.equal(result.identityProviders.items[0].requiresLoginVerification, true);
  assert.equal(result.identityProviders.items[2].name, '[redacted]');
  assert.equal(result.applications.items.length, 1);
  assert.equal(result.applications.items[0].aud, 'aud_preview_123');
  assert.deepEqual(result.applications.items[0].paths[1].publicOverrides, ['/_emdash/api/media/file/*']);
  assert.deepEqual(
    requests.map(({ url }) => url.pathname),
    [
      `/client/v4/accounts/${ACCOUNT_ID}/access/organizations`,
      `/client/v4/accounts/${ACCOUNT_ID}/access/identity_providers`,
      `/client/v4/accounts/${ACCOUNT_ID}/access/apps`,
    ]
  );
  const output = JSON.stringify(result);
  for (const forbidden of [
    secret,
    TOKEN,
    'client-id-DO-NOT-PRINT',
    'owner@example.com',
    'auth.example.com',
    'other_aud',
  ]) {
    assert.ok(!output.includes(forbidden), forbidden);
  }
});

test('403 is permission_limited for each resource while remaining fixed GET audits continue', async () => {
  const paths = [];
  const result = await auditEmDashPreviewAccess({
    accountId: ACCOUNT_ID,
    token: TOKEN,
    fetchImpl: async (input, init) => {
      const url = new URL(input);
      paths.push(url.pathname);
      assert.equal(init.method, 'GET');
      return Response.json({ success: false, errors: [{ message: `secret ${TOKEN}` }] }, { status: 403 });
    },
  });
  assert.equal(result.organization.state, 'permission_limited');
  assert.equal(result.identityProviders.state, 'permission_limited');
  assert.equal(result.applications.state, 'permission_limited');
  assert.equal(paths.length, 3);
  assert.ok(!JSON.stringify(result).includes(TOKEN));
});

test('network and malformed Cloudflare errors suppress raw bodies and exception messages', async () => {
  const report = await auditEmDashPreviewAccess({
    accountId: ACCOUNT_ID,
    token: TOKEN,
    fetchImpl: async (input) => {
      const path = new URL(input).pathname;
      if (path.endsWith('/organizations')) throw new Error(`network failed with ${TOKEN}`);
      if (path.endsWith('/identity_providers')) return new Response('not JSON with secret_value');
      return Response.json({ success: false, errors: [{ message: 'secret_value' }] });
    },
  });
  assert.equal(report.organization.state, 'request_failed');
  assert.equal(report.identityProviders.state, 'invalid_response');
  assert.equal(report.applications.state, 'api_rejected');
  assert.ok(!JSON.stringify(report).includes(TOKEN));
  assert.ok(!JSON.stringify(report).includes('secret_value'));
});

test('pagination remains on the exact Access IdP endpoint and never returns partial results', async () => {
  const pages = [];
  const report = await auditEmDashPreviewAccess({
    accountId: ACCOUNT_ID,
    token: TOKEN,
    fetchImpl: async (input, init) => {
      const url = new URL(input);
      assert.equal(init.method, 'GET');
      assert.equal(url.origin, 'https://api.cloudflare.com');
      if (url.pathname.endsWith('/organizations')) return success({ auth_domain: 'team.cloudflareaccess.com' });
      if (url.pathname.endsWith('/apps')) return success([]);
      assert.ok(url.pathname.endsWith('/identity_providers'));
      pages.push(url.searchParams.get('page'));
      assert.equal(url.searchParams.get('per_page'), '100');
      const page = Number(url.searchParams.get('page'));
      return success(
        page === 1
          ? [{ id: '11111111-1111-4111-8111-111111111111', name: 'First', type: 'oidc' }]
          : [{ id: '22222222-2222-4222-8222-222222222222', name: 'Second', type: 'oidc' }],
        { total_pages: 2 }
      );
    },
  });
  assert.deepEqual(pages, ['1', '2']);
  assert.deepEqual(
    report.identityProviders.items.map((item) => item.name),
    ['First', 'Second']
  );
});

test('unknown operations and missing credentials fail before network or credential echo', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    throw new Error('unexpected request');
  };
  await assert.rejects(
    auditEmDashPreviewAccess({ operation: 'configure', accountId: ACCOUNT_ID, token: TOKEN, fetchImpl }),
    /read-only audit/
  );
  await assert.rejects(
    auditEmDashPreviewAccess({ accountId: ACCOUNT_ID, token: '', fetchImpl }),
    /CLOUDFLARE_API_TOKEN/
  );
  assert.equal(calls, 0);

  const script = fileURLToPath(new URL('../scripts/access-emdash-preview.mjs', import.meta.url));
  const child = spawnSync(process.execPath, [script, 'configure'], {
    env: { ...process.env, CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID },
    encoding: 'utf8',
  });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /read-only audit/);
  assert.ok(!`${child.stdout}${child.stderr}`.includes(TOKEN));
});

test('CLI fails an incomplete audit while preserving sanitized status output', () => {
  const script = fileURLToPath(new URL('../scripts/access-emdash-preview.mjs', import.meta.url));
  const preload = `data:text/javascript,${encodeURIComponent("globalThis.fetch = async () => Response.json({ success: false, errors: [{ message: 'secret_value' }] }, { status: 403 });")}`;
  const child = spawnSync(process.execPath, ['--import', preload, script, 'audit'], {
    env: { ...process.env, CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID },
    encoding: 'utf8',
  });
  assert.equal(child.status, 1);
  assert.match(child.stdout, /"permission_limited"/);
  assert.match(child.stderr, /Access audit incomplete/);
  assert.ok(!`${child.stdout}${child.stderr}`.includes(TOKEN));
  assert.ok(!`${child.stdout}${child.stderr}`.includes('secret_value'));
});

test('untrusted app URLs cannot redirect the auditor or appear as preview matches', async () => {
  const { fetchImpl, requests } = auditFetch({
    applications: [
      { name: 'Attacker', domain: `https://${HOST}.evil.example/_emdash`, aud: 'wrong' },
      { name: 'Userinfo', domain: `https://${HOST}@evil.example/_emdash`, aud: 'wrong' },
      { name: 'Broad app', domain: '*.cinagroup.workers.dev/_emdash', aud: 'broad' },
    ],
  });
  const report = await auditEmDashPreviewAccess({ accountId: ACCOUNT_ID, token: TOKEN, fetchImpl });
  assert.deepEqual(
    report.applications.items.map((item) => item.name),
    ['Broad app']
  );
  assert.equal(requests.length, 3);
  assert.ok(requests.every(({ url }) => url.origin === 'https://api.cloudflare.com'));
});
