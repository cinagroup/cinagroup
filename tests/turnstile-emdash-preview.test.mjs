import assert from 'node:assert/strict';
import test from 'node:test';

import { runPreviewTurnstile } from '../scripts/turnstile-emdash-preview.mjs';

const accountId = 'a'.repeat(32);
const token = 'local-test-token';
const hostname = 'cinagroup-emdash-preview.cinagroup.workers.dev';
const widgetName = 'cinagroup-emdash-preview-contact';
const sitekey = '0x4AAAAAAApreviewWidget';
const secret = 'local-test-secret-never-print';
const previewBindings = () => [
  { name: 'DB', type: 'd1', database_id: '050ec919-1b18-4de8-86a8-62c16c28e59c' },
  { name: 'CONTACT_DB', type: 'd1', database_id: 'a24a999d-f784-4ee1-8dcd-888a7be43e7c' },
  { name: 'MEDIA', type: 'r2_bucket', bucket_name: 'cinagroup-emdash-media-preview' },
];

function mockCloudflare({
  widget = null,
  domains = [],
  routes = [],
  bindings = previewBindings(),
  listStatus = 200,
} = {}) {
  const state = {
    widget,
    domains,
    routes,
    bindings,
    secretNames: [],
    requests: [],
    creates: 0,
    uploads: 0,
    liveNoindex: true,
    liveAdminStatus: 503,
  };
  const respond = (result, status = 200, resultInfo) =>
    Response.json(
      {
        success: status === 200,
        result,
        result_info: resultInfo,
        ...(status === 200 ? {} : { errors: [{ code: 9109 }] }),
      },
      { status }
    );
  const fetchImpl = async (url, options) => {
    const request = new URL(url);
    if (request.hostname === hostname) {
      state.requests.push({ path: request.pathname, method: 'LIVE', body: null });
      return new Response('', {
        status: request.pathname === '/' ? 200 : state.liveAdminStatus,
        headers: {
          ...(state.liveNoindex ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
          ...(request.pathname.startsWith('/_emdash')
            ? { 'Cache-Control': 'no-store', 'WWW-Authenticate': 'Basic realm="Preview"' }
            : {}),
        },
      });
    }
    const path = request.pathname.split(`/accounts/${accountId}`)[1];
    state.requests.push({ path, method: options.method, body: options.body ? JSON.parse(options.body) : null });
    if (path === '/workers/scripts/cinagroup-emdash-preview/settings') return respond({ bindings: state.bindings });
    if (path === '/workers/scripts') return respond([{ id: 'cinagroup-emdash-preview', routes: state.routes }]);
    if (path === '/workers/domains') return respond(state.domains);
    if (path === '/workers/scripts/cinagroup-emdash-preview/subdomain') return respond({ enabled: true });
    if (path === '/workers/subdomain') return respond({ subdomain: 'cinagroup' });
    if (path === '/workers/scripts/cinagroup-emdash-preview/secrets') {
      return respond(state.secretNames.map((name) => ({ name, type: 'secret_text' })));
    }
    if (path === '/challenges/widgets' && options.method === 'GET') {
      if (listStatus !== 200) return respond(null, listStatus);
      const visible = state.widget ? [{ ...state.widget, secret: undefined }] : [];
      return respond(visible, 200, { total_pages: 1 });
    }
    if (path === '/challenges/widgets' && options.method === 'POST') {
      state.creates++;
      state.widget = { ...JSON.parse(options.body), sitekey, secret };
      return respond(state.widget);
    }
    if (path === `/challenges/widgets/${sitekey}`) return respond(state.widget);
    throw new Error(`Unexpected Cloudflare API path ${path}`);
  };
  const uploadSecrets = async (values) => {
    assert.deepEqual(values, { TURNSTILE_SECRET_KEY: secret, TURNSTILE_PREVIEW_HOSTNAME: hostname });
    state.uploads++;
    state.secretNames = Object.keys(values);
  };
  return { state, fetchImpl, uploadSecrets };
}

function exactWidget(overrides = {}) {
  return {
    name: widgetName,
    sitekey,
    secret,
    mode: 'managed',
    clearance_level: 'no_clearance',
    domains: [hostname],
    ...overrides,
  };
}

test('audit is read-only and reports an absent exact preview widget', async () => {
  const mock = mockCloudflare();
  const result = await runPreviewTurnstile({ operation: 'audit-turnstile', accountId, token, ...mock });
  assert.equal(result.sitekey, null);
  assert.equal(result.secretNamesPresent, false);
  assert.equal(mock.state.creates, 0);
  assert(mock.state.requests.every((request) => request.method === 'GET'));
});

test('audit reports an existing widget without fetching its secret', async () => {
  const mock = mockCloudflare({ widget: exactWidget() });
  const result = await runPreviewTurnstile({ operation: 'audit-turnstile', accountId, token, ...mock });
  assert.equal(result.sitekey, sitekey);
  assert.equal(result.wroteSecrets, false);
  assert(mock.state.requests.every((request) => request.method === 'GET'));
  assert(!mock.state.requests.some((request) => request.path === `/challenges/widgets/${sitekey}`));
});

test('Worker inventory accepts null routes as empty but rejects an absent routes field', async () => {
  const emptyRoutes = mockCloudflare({ widget: exactWidget(), routes: null });
  const result = await runPreviewTurnstile({ operation: 'audit-turnstile', accountId, token, ...emptyRoutes });
  assert.equal(result.sitekey, sitekey);

  const missingRoutes = mockCloudflare({ widget: exactWidget() });
  missingRoutes.state.routes = undefined;
  await assert.rejects(
    runPreviewTurnstile({ operation: 'configure-turnstile', accountId, token, ...missingRoutes }),
    /route\/domain/
  );
  assert.equal(missingRoutes.state.creates, 0);
  assert.equal(missingRoutes.state.uploads, 0);
});

test('configure creates one exact-host widget and refreshes matching Worker secrets on retry', async () => {
  const mock = mockCloudflare();
  const options = { operation: 'configure-turnstile', accountId, token, ...mock };
  const first = await runPreviewTurnstile(options);
  assert.equal(first.sitekey, sitekey);
  assert.equal(first.created, true);
  assert.equal(first.wroteSecrets, true);
  assert.equal(mock.state.creates, 1);
  assert.equal(mock.state.uploads, 1);
  assert.deepEqual(mock.state.widget.domains, [hostname]);
  assert.equal(mock.state.widget.mode, 'managed');
  assert(!JSON.stringify(first).includes(secret));

  const second = await runPreviewTurnstile({ ...options, configuredSiteKey: sitekey });
  assert.equal(second.created, false);
  assert.equal(second.wroteSecrets, true);
  assert.equal(mock.state.creates, 1);
  assert.equal(mock.state.uploads, 2);
  assert.equal(mock.state.requests.filter((request) => request.method === 'POST').length, 1);
  assert.equal(mock.state.requests.filter((request) => request.method === 'LIVE').length, 4);
});

test('a failed secret upload leaves an existing widget that can be resumed safely', async () => {
  const mock = mockCloudflare();
  const options = { operation: 'configure-turnstile', accountId, token, ...mock };
  await assert.rejects(
    runPreviewTurnstile({
      ...options,
      uploadSecrets: async () => {
        throw new Error('simulated upload failure');
      },
    }),
    /simulated upload failure/
  );
  assert.equal(mock.state.creates, 1);
  const resumed = await runPreviewTurnstile(options);
  assert.equal(resumed.created, false);
  assert.equal(resumed.wroteSecrets, true);
  assert.equal(mock.state.creates, 1);
});

test('foreign widget domains, Worker routes, and mismatched site keys fail before writes', async () => {
  for (const mock of [
    mockCloudflare({ widget: exactWidget({ domains: ['cinagroup.com'] }) }),
    mockCloudflare({ widget: exactWidget({ name: widgetName.toUpperCase() }) }),
    mockCloudflare({ widget: exactWidget(), routes: [{ pattern: 'cinagroup.com/*' }] }),
    mockCloudflare({ widget: exactWidget(), domains: [{ hostname: 'cinagroup.com' }] }),
    mockCloudflare({
      widget: exactWidget(),
      bindings: previewBindings().map((item) =>
        item.name === 'CONTACT_DB' ? { ...item, database_id: 'production-database-id' } : item
      ),
    }),
  ]) {
    await assert.rejects(
      runPreviewTurnstile({ operation: 'configure-turnstile', accountId, token, ...mock }),
      /differs|route\/domain|case-variant|non-preview D1 or R2/
    );
    assert(mock.state.requests.every((request) => request.method === 'GET'));
  }
  const mock = mockCloudflare({ widget: exactWidget() });
  await assert.rejects(
    runPreviewTurnstile({
      operation: 'configure-turnstile',
      accountId,
      token,
      configuredSiteKey: 'wrong-sitekey',
      ...mock,
    }),
    /site key variable/
  );
});

test('missing Turnstile API permission reports a sanitized failure without a write', async () => {
  const mock = mockCloudflare({ listStatus: 403 });
  await assert.rejects(
    runPreviewTurnstile({ operation: 'configure-turnstile', accountId, token, ...mock }),
    /HTTP 403.*Turnstile Sites and Workers Scripts permissions/
  );
  assert.equal(mock.state.creates, 0);
  assert(!JSON.stringify(mock.state.requests).includes(secret));
});

test('secret deployment rechecks routes and public noindex before reporting a site key', async () => {
  const routed = mockCloudflare({ widget: exactWidget(), routes: null });
  await assert.rejects(
    runPreviewTurnstile({
      operation: 'configure-turnstile',
      accountId,
      token,
      ...routed,
      uploadSecrets: async (values) => {
        await routed.uploadSecrets(values);
        routed.state.routes = [{ pattern: 'cinagroup.com/*' }];
      },
    }),
    /route\/domain/
  );
  assert.equal(routed.state.uploads, 1);
  assert(!routed.state.requests.some((request) => request.method === 'LIVE'));

  const noindexMissing = mockCloudflare({ widget: exactWidget() });
  await assert.rejects(
    runPreviewTurnstile({
      operation: 'configure-turnstile',
      accountId,
      token,
      ...noindexMissing,
      uploadSecrets: async (values) => {
        await noindexMissing.uploadSecrets(values);
        noindexMissing.state.liveNoindex = false;
      },
    }),
    /missing Worker-level noindex header/
  );

  const adminProtected = mockCloudflare({ widget: exactWidget() });
  adminProtected.state.liveAdminStatus = 401;
  const success = await runPreviewTurnstile({
    operation: 'configure-turnstile',
    accountId,
    token,
    ...adminProtected,
  });
  assert.equal(success.sitekey, sitekey);

  const adminExposed = mockCloudflare({ widget: exactWidget() });
  adminExposed.state.liveAdminStatus = 200;
  await assert.rejects(
    runPreviewTurnstile({
      operation: 'configure-turnstile',
      accountId,
      token,
      ...adminExposed,
      pauseImpl: async () => {},
    }),
    /expected HTTP 401 or 503, received 200/
  );
});
