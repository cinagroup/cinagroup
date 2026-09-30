import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  diagnoseEmDashPublic,
  projectDeployment,
  projectSettings,
  summarizeTailEvent,
} from '../scripts/diagnose-emdash-public.mjs';

const ACCOUNT_ID = '7ea8e46d8210bad342fa7595f7935fea';
const WORKER = 'cinagroup-emdash-preview';
const ORIGIN = `https://${WORKER}.cinagroup.workers.dev`;
const API_PATH = `/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER}`;
const VERSION = '8a486133-6176-43ed-9812-eabd5b2969b0';
const TOKEN = 'NEVER-PRINT-TOKEN';
const PRIVATE = 'private-person@example.test';
const TAIL_URL = 'wss://tail.example.test/socket?private=NEVER-PRINT-TAIL-URL';
const TAIL_ID = 'a'.repeat(32);
const ok = (result) => Response.json({ success: true, result, errors: [{ message: PRIVATE }] });

const settings = {
  bindings: [
    { name: 'DB', type: 'd1', database_id: '050ec919-1b18-4de8-86a8-62c16c28e59c' },
    { name: 'CONTACT_DB', type: 'd1', database_id: 'a24a999d-f784-4ee1-8dcd-888a7be43e7c' },
    { name: 'MEDIA', type: 'r2_bucket', bucket_name: 'cinagroup-emdash-media-preview' },
    { name: 'SESSION', type: 'kv_namespace', namespace_id: 'b'.repeat(32) },
    { name: 'ASSETS', type: 'assets' },
    { name: 'IMAGES', type: 'images' },
    { name: 'EMDASH_AUTH_MODE', type: 'secret_text', text: TOKEN },
    { name: 'EMDASH_ACCESS_ADMIN_EMAIL', type: 'secret_text', text: PRIVATE },
  ],
};

class FakeSocket extends EventTarget {
  constructor(url, protocol) {
    super();
    this.url = url;
    this.protocol = protocol;
    this.sent = [];
    this.closed = false;
    queueMicrotask(() => this.dispatchEvent(new Event('open')));
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.dispatchEvent(new Event('close'));
  }
  emitTrace(trace, binary = false) {
    const data = JSON.stringify(trace);
    this.dispatchEvent(new MessageEvent('message', { data: binary ? new Blob([data]) : data }));
  }
}

function fakeCloudflare({
  tailUrl = TAIL_URL,
  tailId = TAIL_ID,
  status = 500,
  omitTail = false,
  binaryTail = false,
  onRequest,
} = {}) {
  const calls = [];
  const sockets = [];
  const WebSocketImpl = class extends FakeSocket {
    constructor(url, protocol) {
      super(url, protocol);
      sockets.push(this);
    }
  };
  const fetchImpl = async (input, init) => {
    const url = new URL(input);
    calls.push({ url, init });
    const override = onRequest?.(url, init);
    if (override) return override;
    if (url.origin === 'https://api.cloudflare.com') {
      assert.ok(url.pathname.startsWith(API_PATH));
      assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
      if (url.pathname.endsWith('/deployments'))
        return ok({ deployments: [{ versions: [{ version_id: VERSION, percentage: 100 }] }] });
      if (url.pathname.endsWith('/settings')) return ok(settings);
      if (url.pathname.endsWith('/tails') && init.method === 'POST') {
        assert.deepEqual(JSON.parse(init.body), { filters: [{ method: ['GET', 'HEAD'] }] });
        return ok({ id: tailId, expires_at: '2026-09-30T12:00:00Z', url: tailUrl });
      }
      if (url.pathname.endsWith(`/tails/${tailId}`) && init.method === 'DELETE') return ok(null);
      assert.fail(`Unexpected API path ${url.pathname}`);
    }
    assert.equal(url.origin, ORIGIN);
    assert.ok(['/', '/ko/blog/', '/fr/blog/', '/zh/blog/'].includes(url.pathname));
    assert.ok(['GET', 'HEAD'].includes(init.method));
    assert.equal(init.headers, undefined);
    assert.equal(init.redirect, 'manual');
    if (!omitTail) {
      queueMicrotask(() =>
        sockets.at(-1).emitTrace(
          {
            scriptName: WORKER,
            event: { request: { method: init.method, url: input, headers: { Cookie: TOKEN } }, response: { status } },
            outcome: 'exception',
            logs: [{ message: ['Setup probe failed (non-fatal):', { secret: TOKEN, email: PRIVATE }] }],
            exceptions: [
              {
                name: 'TypeError',
                code: 'D1_ERROR',
                message: `SQLITE_ERROR secret ${TOKEN}`,
                stack: `stack ${PRIVATE}`,
              },
            ],
          },
          binaryTail
        )
      );
    }
    return new Response(null, { status });
  };
  return { calls, sockets, fetchImpl, WebSocketImpl };
}

const args = (fake, overrides = {}) => ({
  accountId: ACCOUNT_ID,
  token: TOKEN,
  fetchImpl: fake.fetchImpl,
  WebSocketImpl: fake.WebSocketImpl,
  captureMs: 0,
  ...overrides,
});

test('fixed preview inventory, ephemeral tail, eight anonymous probes, and cleanup produce only sanitized output', async () => {
  const fake = fakeCloudflare();
  const report = await diagnoseEmDashPublic(args(fake));
  assert.equal(report.cleanup, 'deleted');
  assert.equal(report.tailComplete, true);
  assert.deepEqual(report.deployment.activeVersions, [{ versionId: VERSION, percentage: 100 }]);
  assert.equal(report.deployment.matchesExpectedVersion, true);
  assert.equal(report.settings.dbExpected, true);
  assert.equal(report.settings.contactDbExpected, true);
  assert.equal(report.settings.mediaExpected, true);
  assert.equal(report.settings.sessionPresent, true);
  assert.equal(report.settings.secretBindingCount, 2);
  assert.equal(report.probes.length, 8);
  assert.ok(report.probes.every((probe) => probe.status === 500 && probe.tail.length === 1));
  assert.equal(report.probes[0].tail[0].stage, 'setup_probe');
  assert.equal(report.probes[0].tail[0].exceptionName, 'TypeError');
  assert.equal(report.probes[0].tail[0].exceptionCode, 'D1_ERROR');
  assert.equal(fake.sockets[0].protocol, 'trace-v1');
  assert.deepEqual(fake.sockets[0].sent, ['{"debug":false}']);
  assert.equal(fake.sockets[0].closed, true);
  assert.deepEqual(
    fake.calls.slice(0, 3).map(({ init }) => init.method),
    ['GET', 'GET', 'POST']
  );
  assert.equal(fake.calls.at(-1).init.method, 'DELETE');
  const output = JSON.stringify(report);
  for (const secret of [TOKEN, PRIVATE, TAIL_URL, TAIL_ID]) assert.ok(!output.includes(secret));
});

test('raw URL, method, and Worker name must match exactly before any tail content is classified', () => {
  const base = {
    scriptName: WORKER,
    event: { request: { method: 'GET', url: `${ORIGIN}/ko/blog/` } },
    outcome: 'ok',
    logs: [{ message: ['EmDash middleware error:', PRIVATE] }],
    exceptions: [{ name: 'Email Secret 123', code: PRIVATE, message: PRIVATE, stack: TOKEN }],
  };
  for (const changed of [
    { ...base, event: { request: { method: 'GET', url: `${ORIGIN}/ko/blog/?x=1` } } },
    { ...base, event: { request: { method: 'GET', url: 'https://other.example.test/ko/blog/' } } },
    { ...base, event: { request: { method: 'POST', url: `${ORIGIN}/ko/blog/` } } },
    { ...base, scriptName: 'other-worker' },
    { ...base, event: { cron: '* * * * *' } },
  ])
    assert.equal(summarizeTailEvent(changed), null);
  const result = summarizeTailEvent(base);
  assert.deepEqual(result, {
    method: 'GET',
    path: '/ko/blog/',
    outcome: 'ok',
    responseStatus: null,
    stage: 'emdash_middleware',
    exceptionName: 'Other',
    exceptionCode: null,
  });
  assert.ok(!JSON.stringify(result).includes(PRIVATE));
});

test('known runtime I/O and resource failures use fixed categories only', () => {
  const base = {
    scriptName: WORKER,
    event: { request: { method: 'GET', url: `${ORIGIN}/ko/blog/` } },
    outcome: 'exception',
  };
  for (const [message, stage] of [
    [`Cannot perform I/O on behalf of a different request ${PRIVATE}`, 'cross_request_io'],
    [`I/O is blocked in global scope ${PRIVATE}`, 'global_scope_io'],
    [`resource exceeded ${PRIVATE}`, 'resource_limit'],
  ]) {
    const output = summarizeTailEvent({ ...base, exceptions: [{ name: 'Error', message }] });
    assert.equal(output.stage, stage);
    assert.ok(!JSON.stringify(output).includes(PRIVATE));
  }
  assert.equal(summarizeTailEvent({ ...base, outcome: 'exceededCpu' }).stage, 'resource_limit');
});

test('deployment and settings projections reject malformed state and never echo secret values', () => {
  assert.deepEqual(
    projectDeployment({
      deployments: [{ versions: [{ version_id: 'c'.repeat(8) + '-cccc-cccc-cccc-cccccccccccc', percentage: 100 }] }],
    }).matchesExpectedVersion,
    false
  );
  assert.throws(() => projectDeployment({ deployments: [] }), /invalid_deployment_inventory/);
  assert.throws(() => projectSettings({ bindings: 'bad' }), /invalid_worker_settings/);
  const output = JSON.stringify(projectSettings(settings));
  assert.ok(!output.includes(TOKEN));
  assert.ok(!output.includes(PRIVATE));
  assert.ok(!output.includes('b'.repeat(32)));
});

test('malformed tail WebSocket URL still deletes the created tail', async () => {
  const fake = fakeCloudflare({
    tailUrl: 'https://not-a-websocket.example.test/?secret=' + TOKEN,
    tailId: '123e4567-e89b-12d3-a456-426614174000',
  });
  await assert.rejects(
    diagnoseEmDashPublic(args(fake)),
    (error) => error.code === 'tail_invalid_websocket_url' && error.cleanup === 'deleted'
  );
  assert.equal(fake.calls.at(-1).init.method, 'DELETE');
  assert.equal(fake.calls.filter(({ init }) => init.method === 'GET').length, 2);
});

test('wrong account or whitespace token fails before any request', async () => {
  const fake = fakeCloudflare();
  await assert.rejects(diagnoseEmDashPublic(args(fake, { accountId: 'other' })), /wrong_preview_account/);
  await assert.rejects(diagnoseEmDashPublic(args(fake, { token: `${TOKEN}\n` })), /missing_or_invalid_token/);
  assert.equal(fake.calls.length, 0);
});

test('Cloudflare API failure is classified without raw error messages', async () => {
  const fake = fakeCloudflare({
    onRequest(url) {
      if (url.pathname.endsWith('/deployments'))
        return Response.json({ success: false, errors: [{ message: `secret ${TOKEN} ${PRIVATE}` }] }, { status: 403 });
      return null;
    },
  });
  await assert.rejects(
    diagnoseEmDashPublic(args(fake)),
    (error) => error.code === 'inventory_permission_limited' && !error.message.includes(TOKEN)
  );
  assert.equal(fake.calls.length, 1);
});

test('missing tail events is reported as incomplete while the session is cleaned up', async () => {
  const fake = fakeCloudflare({ omitTail: true });
  const report = await diagnoseEmDashPublic(args(fake));
  assert.equal(report.tailComplete, false);
  assert.equal(report.cleanup, 'deleted');
  assert.ok(report.probes.every((probe) => probe.tail.length === 0));
});

test('binary JSON Tail frames are decoded without exposing raw content', async () => {
  const fake = fakeCloudflare({ binaryTail: true });
  const report = await diagnoseEmDashPublic(args(fake));
  assert.equal(report.tailComplete, true);
  assert.equal(report.probes.length, 8);
  assert.ok(report.probes.every((probe) => probe.tail[0]?.stage === 'setup_probe'));
  for (const secret of [TOKEN, PRIVATE, TAIL_URL]) assert.ok(!JSON.stringify(report).includes(secret));
});

test('CLI requires an explicit run flag before reading credentials or using network', () => {
  const script = fileURLToPath(new URL('../scripts/diagnose-emdash-public.mjs', import.meta.url));
  const child = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, CLOUDFLARE_API_TOKEN: TOKEN },
  });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /explicit_run_flag_required/);
  assert.ok(!`${child.stdout}${child.stderr}`.includes(TOKEN));
});
