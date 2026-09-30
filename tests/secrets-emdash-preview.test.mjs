import assert from 'node:assert/strict';
import test from 'node:test';
import { runPreviewSecrets } from '../scripts/secrets-emdash-preview.mjs';

const accountId = 'a'.repeat(32);
const token = 'local-test-token';
const encryptionKey = `emdash_enc_v1_${Buffer.alloc(32, 9).toString('base64url')}`;
const hostname = 'cinagroup-emdash-preview.cinagroup.workers.dev';

function mockCloudflare() {
  const state = {
    secrets: ['TURNSTILE_SECRET_KEY', 'TURNSTILE_PREVIEW_HOSTNAME'],
    routes: null,
    domains: [],
    bindings: [
      { name: 'DB', type: 'd1', database_id: '050ec919-1b18-4de8-86a8-62c16c28e59c' },
      { name: 'CONTACT_DB', type: 'd1', database_id: 'a24a999d-f784-4ee1-8dcd-888a7be43e7c' },
      { name: 'MEDIA', type: 'r2_bucket', bucket_name: 'cinagroup-emdash-media-preview' },
    ],
    requests: [],
    uploads: 0,
    liveAdminStatus: 503,
    liveNoindex: true,
  };
  const fetchImpl = async (url, options) => {
    const request = new URL(url);
    state.requests.push({ method: options?.method ?? 'GET', hostname: request.hostname });
    if (request.hostname === hostname)
      return new Response(null, {
        status: request.pathname === '/' ? 200 : state.liveAdminStatus,
        headers: {
          ...(state.liveNoindex ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
          'Cache-Control': 'no-store',
          'WWW-Authenticate': 'Basic realm="Preview"',
        },
      });
    const path = request.pathname.split(`/accounts/${accountId}`)[1];
    const values = {
      '/workers/scripts/cinagroup-emdash-preview/settings': { bindings: state.bindings },
      '/workers/scripts': [{ id: 'cinagroup-emdash-preview', routes: state.routes }],
      '/workers/domains': state.domains,
      '/workers/scripts/cinagroup-emdash-preview/subdomain': { enabled: true },
      '/workers/subdomain': { subdomain: 'cinagroup' },
      '/workers/scripts/cinagroup-emdash-preview/secrets': state.secrets.map((name) => ({ name })),
    };
    assert(Object.hasOwn(values, path), `Unexpected API path ${path}`);
    return Response.json({ success: true, result: values[path] });
  };
  const uploadKey = async (key) => {
    assert.equal(key, encryptionKey);
    state.uploads++;
    state.secrets.push('EMDASH_ENCRYPTION_KEY');
  };
  return { state, fetchImpl, uploadKey };
}

function run(mock, operation = 'configure-encryption', overrides = {}) {
  return runPreviewSecrets({ operation, accountId, token, encryptionKey, ...mock, ...overrides });
}

test('secret audit reports names only and performs no mutation', async () => {
  const mock = mockCloudflare();
  const result = await run(mock, 'audit-secrets');
  assert.equal(result.encryptionKeyPresent, false);
  assert.equal(result.adminPasswordPresent, false);
  assert.equal(mock.state.uploads, 0);
  assert(mock.state.requests.every((item) => item.method === 'GET'));
  assert(!JSON.stringify(result).includes(encryptionKey));
});

test('configure creates a missing key once, preserves existing secrets, and never rotates on retry', async () => {
  const mock = mockCloudflare();
  mock.state.secrets.push('EMDASH_PREVIEW_ADMIN_PASSWORD');
  mock.state.liveAdminStatus = 401;
  const first = await run(mock);
  assert.deepEqual(first, { hostname, encryptionKeyPresent: true, adminPasswordPresent: true, created: true });
  const second = await run(mock, 'configure-encryption', { encryptionKey: 'different-key' });
  assert.equal(second.created, false);
  assert.equal(mock.state.uploads, 1);
  assert(mock.state.secrets.includes('TURNSTILE_SECRET_KEY'));
  assert(!JSON.stringify(first).includes(encryptionKey));
});

test('invalid key format and unknown operations fail before a write', async () => {
  for (const key of ['', 'random-string'.repeat(5), `emdash_enc_v1_${'A'.repeat(42)}`]) {
    const mock = mockCloudflare();
    await assert.rejects(run(mock, 'configure-encryption', { encryptionKey: key }), /EmDash v1 key/);
    assert.equal(mock.state.uploads, 0);
  }
  const mock = mockCloudflare();
  await assert.rejects(run(mock, 'deploy'), /Unknown preview secrets operation/);
  assert.equal(mock.state.requests.length, 0);
});

test('production binding, custom domain, and missing route inventory prevent writes', async () => {
  for (const mutate of [
    (state) => {
      state.bindings[0].database_id = 'production-db';
    },
    (state) => {
      state.domains = [{ hostname: 'cinagroup.com' }];
    },
    (state) => {
      state.routes = [{ pattern: 'cinagroup.com/*' }];
    },
    (state) => {
      state.routes = undefined;
    },
  ]) {
    const mock = mockCloudflare();
    mutate(mock.state);
    await assert.rejects(run(mock), /not isolated/);
    assert.equal(mock.state.uploads, 0);
  }
});

test('concurrent creation is detected before an existing key can be overwritten', async () => {
  const mock = mockCloudflare();
  let listings = 0;
  const fetchImpl = async (url, options) => {
    if (new URL(url).pathname.endsWith('/secrets') && ++listings === 2)
      mock.state.secrets.push('EMDASH_ENCRYPTION_KEY');
    return mock.fetchImpl(url, options);
  };
  await assert.rejects(run(mock, 'configure-encryption', { fetchImpl }), /appeared during audit/);
  assert.equal(mock.state.uploads, 0);
});

test('secret update must preserve names and live noindex/admin guards', async () => {
  const removed = mockCloudflare();
  await assert.rejects(
    run(removed, 'configure-encryption', {
      uploadKey: async (key) => {
        await removed.uploadKey(key);
        removed.state.secrets = ['EMDASH_ENCRYPTION_KEY'];
      },
    }),
    /preserve existing/
  );
  for (const mutate of [
    (state) => {
      state.liveNoindex = false;
    },
    (state) => {
      state.liveAdminStatus = 200;
    },
    (state) => {
      state.routes = [{ pattern: 'cinagroup.com/*' }];
    },
  ]) {
    const mock = mockCloudflare();
    await assert.rejects(
      run(mock, 'configure-encryption', {
        uploadKey: async (key) => {
          await mock.uploadKey(key);
          mutate(mock.state);
        },
        pauseImpl: async () => {},
      }),
      /noindex|unexpected status|not isolated/
    );
  }
});
