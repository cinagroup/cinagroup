import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateRetentionUntil,
  ContactRequestError,
  escapeHtml,
  handleContactRequest,
  parseContactRequest,
  validateContactPayload,
  verifyTurnstile,
} from '../src/server/contact-core.js';

const submissionId = '0198f5d0-7c8c-7a31-9f00-123456789abc';

function validPayload(overrides = {}) {
  return {
    submission_id: submissionId,
    locale: 'en',
    name: '  Ada Lovelace  ',
    email: '  Ada.Lovelace@EXAMPLE.COM ',
    company: 'Analytical Engines',
    subject: 'product-workflow',
    message: 'We need a reliable workflow with observable acceptance evidence.',
    website: '',
    'cf-turnstile-response': 'test-widget-token',
    ...overrides,
  };
}

function contactRequest(payload = validPayload(), headers = {}) {
  return new Request('https://cinagroup.com/api/contact', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.10',
      Origin: 'https://cinagroup.com',
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

function successfulSiteverify(hostname = 'cinagroup.com', calls = []) {
  return async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ success: true, action: 'contact', hostname });
  };
}

function contactEnv(database, overrides = {}) {
  return { CONTACT_DB: database, TURNSTILE_SECRET_KEY: 'test-secret-placeholder', ...overrides };
}

function assertApiSecurityHeaders(response) {
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(
    response.headers.get('Content-Security-Policy'),
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  );
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
}

class MockD1 {
  constructor({ failWrites = false } = {}) {
    this.failWrites = failWrites;
    this.rows = new Map();
    this.stats = { insertAttempts: 0 };
  }

  prepare(sql) {
    const { failWrites, rows, stats } = this;
    return {
      bind(...values) {
        return {
          async run() {
            if (failWrites) throw new Error('simulated D1 outage');
            if (sql.includes('INSERT INTO contact_submissions')) {
              stats.insertAttempts += 1;
              const [
                id,
                createdAt,
                retentionUntil,
                locale,
                name,
                email,
                company,
                subject,
                message,
                status,
                notificationStatus,
                sourceHost,
              ] = values;
              if (rows.has(id)) return { success: true, meta: { changes: 0 } };
              rows.set(id, {
                submission_id: id,
                created_at: createdAt,
                retention_until: retentionUntil,
                locale,
                name,
                email,
                company,
                subject,
                message,
                status,
                notification_status: notificationStatus,
                source_host: sourceHost,
              });
              return { success: true, meta: { changes: 1 } };
            }
            if (sql.includes('UPDATE contact_submissions')) {
              const [notificationStatus, attemptedAt, notificationError, id] = values;
              const row = rows.get(id);
              if (row) {
                row.notification_status = notificationStatus;
                row.notification_attempted_at = attemptedAt;
                row.notification_error = notificationError;
              }
              return { success: true, meta: { changes: row ? 1 : 0 } };
            }
            throw new Error(`Unexpected run query: ${sql}`);
          },
          async first() {
            if (!sql.includes('FROM contact_submissions')) throw new Error(`Unexpected first query: ${sql}`);
            const row = rows.get(values[0]) || null;
            if (sql.includes('locale = ?2') && row?.locale !== values[1]) return null;
            return row;
          },
        };
      },
    };
  }
}

test('normalizes and validates an accepted contact payload', () => {
  const parsed = validateContactPayload(validPayload());
  assert.equal(parsed.name, 'Ada Lovelace');
  assert.equal(parsed.email, 'Ada.Lovelace@example.com');
  assert.equal(parsed.submissionId, submissionId);
  assert.equal(validateContactPayload(validPayload({ locale: 'zh' })).locale, 'zh');
});

test('calculates a 12-month retention date with end-of-month clamping', () => {
  assert.equal(calculateRetentionUntil('2026-08-31T01:02:03.000Z'), '2027-08-31T01:02:03.000Z');
  assert.equal(calculateRetentionUntil('2024-02-29T12:00:00.000Z'), '2025-02-28T12:00:00.000Z');
});

test('rejects honeypot submissions and invalid fields', () => {
  assert.throws(
    () => validateContactPayload(validPayload({ website: 'https://spam.example' })),
    (error) => error instanceof ContactRequestError && error.code === 'spam_rejected'
  );
  assert.throws(
    () => validateContactPayload(validPayload({ email: 'invalid', message: 'short' })),
    (error) =>
      error instanceof ContactRequestError &&
      error.code === 'validation_failed' &&
      error.details.fields.email === 'invalid_email' &&
      error.details.fields.message === 'too_short'
  );
});

test('requires a same-origin request and supported content type', async () => {
  await assert.rejects(
    parseContactRequest(contactRequest(validPayload(), { Origin: 'https://attacker.example' })),
    (error) => error instanceof ContactRequestError && error.code === 'cross_origin_rejected'
  );
  await assert.rejects(
    parseContactRequest(contactRequest(validPayload(), { 'Content-Type': 'text/plain' })),
    (error) => error instanceof ContactRequestError && error.code === 'unsupported_media_type'
  );
});

test('rejects a body larger than the bounded request limit', async () => {
  const request = new Request('https://cinagroup.com/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://cinagroup.com' },
    body: JSON.stringify({ ...validPayload(), message: 'x'.repeat(25 * 1024) }),
  });
  await assert.rejects(
    parseContactRequest(request),
    (error) => error instanceof ContactRequestError && error.code === 'body_too_large'
  );
});

test('reports success only after D1 persistence and keeps retries idempotent', async () => {
  const database = new MockD1();
  const validationCalls = [];
  const context = (request) => ({
    request,
    env: contactEnv(database),
    waitUntil: () => assert.fail('unexpected task'),
  });
  const dependencies = {
    now: () => new Date('2026-08-31T01:02:03.000Z'),
    fetch: successfulSiteverify('cinagroup.com', validationCalls),
  };

  const first = await handleContactRequest(context(contactRequest()), dependencies);
  assert.equal(first.status, 201);
  assertApiSecurityHeaders(first);
  assert.equal(database.rows.size, 1);
  assert.equal(validationCalls.length, 1);
  const verificationBody = new URLSearchParams(validationCalls[0].init.body);
  assert.ok(validationCalls[0].init.signal instanceof AbortSignal);
  assert.equal(verificationBody.get('response'), 'test-widget-token');
  assert.equal(verificationBody.get('idempotency_key'), submissionId);
  assert.equal(verificationBody.get('remoteip'), '203.0.113.10');
  assert.deepEqual(await first.json(), {
    ok: true,
    submissionId,
    createdAt: '2026-08-31T01:02:03.000Z',
    retentionUntil: '2027-08-31T01:02:03.000Z',
    status: 'received',
    notificationStatus: 'not_configured',
    idempotent: false,
  });

  const retry = await handleContactRequest(
    {
      request: contactRequest(validPayload({ 'cf-turnstile-response': undefined })),
      env: { CONTACT_DB: database },
      waitUntil: () => assert.fail('unexpected task'),
    },
    dependencies
  );
  assert.equal(retry.status, 200);
  assert.equal(database.rows.size, 1);
  assert.equal(validationCalls.length, 1);
  assert.equal((await retry.json()).idempotent, true);
  assert.equal(database.rows.get(submissionId).retention_until, '2027-08-31T01:02:03.000Z');
});

test('rejects reuse of a submission UUID with different content', async () => {
  const database = new MockD1();
  const context = (request) => ({ request, env: contactEnv(database), waitUntil() {} });
  const dependencies = { fetch: successfulSiteverify() };
  await handleContactRequest(context(contactRequest()), dependencies);

  const conflict = await handleContactRequest(
    context(contactRequest(validPayload({ message: 'A different message that still meets the minimum length.' }))),
    dependencies
  );
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, 'submission_id_conflict');
  assert.equal(database.rows.size, 1);
});

test('does not claim success when CONTACT_DB is missing or a write fails', async () => {
  const noBinding = await handleContactRequest({ request: contactRequest(), env: {}, waitUntil() {} });
  assert.equal(noBinding.status, 503);
  assert.equal((await noBinding.json()).error.code, 'persistence_unavailable');

  const database = new MockD1({ failWrites: true });
  const failedWrite = await handleContactRequest(
    {
      request: contactRequest(),
      env: contactEnv(database),
      waitUntil() {},
    },
    { fetch: successfulSiteverify() }
  );
  assert.equal(failedWrite.status, 503);
  assert.equal((await failedWrite.json()).error.code, 'persistence_unavailable');
});

test('native form uses PRG and refreshing confirmation does not repeat the write', async () => {
  const database = new MockD1();
  const body = new URLSearchParams(validPayload({ locale: 'fr' })).toString();
  const request = new Request('https://cinagroup.com/api/contact', {
    method: 'POST',
    headers: {
      Accept: 'text/html',
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'https://cinagroup.com',
    },
    body,
  });
  const response = await handleContactRequest(
    { request, env: contactEnv(database), waitUntil() {} },
    { fetch: successfulSiteverify() }
  );
  assert.equal(response.status, 303);
  assertApiSecurityHeaders(response);
  assert.equal(database.stats.insertAttempts, 1);

  const location = response.headers.get('Location');
  assert.ok(location);
  const confirmationUrl = new URL(location);
  assert.equal(confirmationUrl.pathname, '/api/contact');
  assert.equal(confirmationUrl.searchParams.get('locale'), 'fr');
  assert.equal(confirmationUrl.searchParams.get('submission_id'), submissionId);
  const confirmationRequest = () => new Request(location, { headers: { Accept: 'text/html' } });
  const confirmation = await handleContactRequest({
    request: confirmationRequest(),
    env: { CONTACT_DB: database },
    waitUntil() {},
  });
  assert.equal(confirmation.status, 200);
  assertApiSecurityHeaders(confirmation);
  assert.match(confirmation.headers.get('Content-Type'), /^text\/html/);
  const confirmationHtml = await confirmation.text();
  assert.match(confirmationHtml, /Demande reçue/);
  assert.match(confirmationHtml, /<meta name="robots" content="noindex">/);

  const refreshed = await handleContactRequest({
    request: confirmationRequest(),
    env: { CONTACT_DB: database },
    waitUntil() {},
  });
  assert.equal(refreshed.status, 200);
  assert.equal(database.stats.insertAttempts, 1);
});

test('escapes all HTML metacharacters in confirmation output helpers', () => {
  assert.equal(
    escapeHtml(`<script data-x="'">alert('&')</script>`),
    '&lt;script data-x=&quot;&#39;&quot;&gt;alert(&#39;&amp;&#39;)&lt;/script&gt;'
  );
});

test('webhook failure leaves an accepted submission pending', async () => {
  const database = new MockD1();
  const backgroundTasks = [];
  const response = await handleContactRequest(
    {
      request: contactRequest(),
      env: contactEnv(database, { CONTACT_WEBHOOK_URL: 'https://notifications.example/contact' }),
      waitUntil(promise) {
        backgroundTasks.push(promise);
      },
    },
    {
      now: () => new Date('2026-08-31T01:02:03.000Z'),
      fetch: async (url) =>
        String(url).includes('/turnstile/v0/siteverify')
          ? Response.json({ success: true, action: 'contact', hostname: 'cinagroup.com' })
          : new Response(null, { status: 503 }),
    }
  );

  assert.equal(response.status, 201);
  assert.equal((await response.json()).notificationStatus, 'pending');
  await Promise.all(backgroundTasks);
  assert.equal(database.rows.get(submissionId).notification_status, 'pending');
  assert.equal(database.rows.get(submissionId).notification_error, 'Webhook returned HTTP 503');
});

test('fails closed for secret, token, timeout, invalid JSON, and Siteverify failures', async () => {
  const missingSecretDatabase = new MockD1();
  const missingSecret = await handleContactRequest({
    request: contactRequest(),
    env: { CONTACT_DB: missingSecretDatabase },
    waitUntil() {},
  });
  assert.equal(missingSecret.status, 503);
  assertApiSecurityHeaders(missingSecret);
  assert.deepEqual(await missingSecret.json(), { ok: false, error: { code: 'verification_unavailable' } });
  assert.equal(missingSecretDatabase.stats.insertAttempts, 0);

  const rejectedDatabase = new MockD1();
  const rejected = await handleContactRequest(
    { request: contactRequest(), env: contactEnv(rejectedDatabase), waitUntil() {} },
    { fetch: async () => Response.json({ success: false, 'error-codes': ['test-only-code'] }) }
  );
  assert.equal(rejected.status, 403);
  assert.deepEqual(await rejected.json(), { ok: false, error: { code: 'verification_failed' } });
  assert.equal(rejectedDatabase.stats.insertAttempts, 0);

  let observedTimeoutAbort = false;
  await assert.rejects(
    verifyTurnstile(
      {
        secret: 'test-secret-placeholder',
        token: 'x'.repeat(2049),
        idempotencyKey: submissionId,
        requestHostname: 'cinagroup.com',
      },
      () => assert.fail('overlong tokens must be rejected before fetch')
    ),
    (error) => error instanceof ContactRequestError && error.code === 'verification_failed'
  );

  await assert.rejects(
    verifyTurnstile(
      {
        secret: 'official-test-secret-placeholder',
        token: 'XXXX.DUMMY.TOKEN.XXXX',
        idempotencyKey: submissionId,
        requestHostname: 'homepage-cj7.pages.dev',
        testMode: true,
      },
      () => assert.fail('test mode must be rejected on the production Pages hostname before fetch')
    ),
    (error) => error instanceof ContactRequestError && error.code === 'verification_failed'
  );

  await assert.rejects(
    verifyTurnstile(
      {
        secret: 'test-secret-placeholder',
        token: 'test-widget-token',
        idempotencyKey: submissionId,
        requestHostname: 'cinagroup.com',
      },
      async () => new Response('{not-json', { headers: { 'Content-Type': 'application/json' } })
    ),
    (error) => error instanceof ContactRequestError && error.code === 'verification_unavailable'
  );

  await assert.rejects(
    verifyTurnstile(
      {
        secret: 'test-secret-placeholder',
        token: 'test-widget-token',
        idempotencyKey: submissionId,
        requestHostname: 'cinagroup.com',
        timeoutMs: 10,
      },
      (_url, init) =>
        new Promise((resolve, reject) => {
          // AbortSignal.timeout() uses an unref'ed timer in Node on Linux. Keep the
          // mocked request alive long enough for that signal to fire, just as a real
          // network request would, while still failing if the abort never happens.
          const requestTimer = setTimeout(
            () => resolve(Response.json({ success: true, action: 'contact', hostname: 'cinagroup.com' })),
            1000
          );
          const rejectAbort = () => {
            observedTimeoutAbort = true;
            clearTimeout(requestTimer);
            reject(init.signal.reason);
          };
          if (init.signal.aborted) rejectAbort();
          else init.signal.addEventListener('abort', rejectAbort, { once: true });
        })
    ),
    (error) => error instanceof ContactRequestError && error.code === 'verification_unavailable'
  );
  assert.equal(observedTimeoutAbort, true);
});

test('strictly validates Turnstile action and request hostname without exposing mismatch details', async () => {
  const scenarios = [
    { result: { success: true, action: 'login', hostname: 'cinagroup.com' } },
    { result: { success: true, action: 'contact', hostname: 'attacker.example' } },
  ];

  for (const { result } of scenarios) {
    const database = new MockD1();
    const response = await handleContactRequest(
      { request: contactRequest(), env: contactEnv(database), waitUntil() {} },
      { fetch: async () => Response.json(result) }
    );
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { ok: false, error: { code: 'verification_failed' } });
    assert.equal(database.stats.insertAttempts, 0);
  }
});

test('allows only this Pages project preview hostnames and gates localhost behind an explicit flag', async () => {
  await assert.doesNotReject(() =>
    verifyTurnstile(
      {
        secret: 'test-secret-placeholder',
        token: 'test-widget-token',
        idempotencyKey: submissionId,
        requestHostname: 'homepage-cj7.pages.dev',
      },
      successfulSiteverify('homepage-cj7.pages.dev')
    )
  );

  await assert.doesNotReject(() =>
    verifyTurnstile(
      {
        secret: 'test-secret-placeholder',
        token: 'test-widget-token',
        idempotencyKey: submissionId,
        requestHostname: 'branch.homepage-cj7.pages.dev',
      },
      successfulSiteverify('branch.homepage-cj7.pages.dev')
    )
  );

  await assert.rejects(
    verifyTurnstile(
      {
        secret: 'test-secret-placeholder',
        token: 'test-widget-token',
        idempotencyKey: submissionId,
        requestHostname: 'attacker.pages.dev',
      },
      () => assert.fail('unrelated Pages hosts must be rejected before fetch')
    ),
    (error) => error instanceof ContactRequestError && error.code === 'verification_failed'
  );

  await assert.rejects(
    verifyTurnstile(
      {
        secret: 'test-secret-placeholder',
        token: 'test-widget-token',
        idempotencyKey: submissionId,
        requestHostname: 'localhost',
      },
      successfulSiteverify('localhost')
    ),
    (error) => error instanceof ContactRequestError && error.code === 'verification_failed'
  );

  await assert.doesNotReject(() =>
    verifyTurnstile(
      {
        secret: 'test-secret-placeholder',
        token: 'test-widget-token',
        idempotencyKey: submissionId,
        requestHostname: 'localhost',
        allowLocalhost: true,
      },
      successfulSiteverify('localhost')
    )
  );
});

test('gates the official Turnstile dummy response behind preview-only test mode', async () => {
  await assert.doesNotReject(() =>
    verifyTurnstile(
      {
        secret: 'official-test-secret-placeholder',
        token: 'XXXX.DUMMY.TOKEN.XXXX',
        idempotencyKey: submissionId,
        requestHostname: 'batch2-audit.homepage-cj7.pages.dev',
        testMode: true,
      },
      async () => Response.json({ success: true, action: null, hostname: 'example.com' })
    )
  );

  await assert.rejects(
    verifyTurnstile(
      {
        secret: 'official-test-secret-placeholder',
        token: 'XXXX.DUMMY.TOKEN.XXXX',
        idempotencyKey: submissionId,
        requestHostname: 'cinagroup.com',
        testMode: true,
      },
      () => assert.fail('test mode must be rejected on the production hostname before fetch')
    ),
    (error) => error instanceof ContactRequestError && error.code === 'verification_failed'
  );

  await assert.rejects(
    verifyTurnstile(
      {
        secret: 'official-test-secret-placeholder',
        token: 'not-the-official-dummy-token',
        idempotencyKey: submissionId,
        requestHostname: 'batch2-audit.homepage-cj7.pages.dev',
        testMode: true,
      },
      async () => Response.json({ success: true, action: null, hostname: 'example.com' })
    ),
    (error) => error instanceof ContactRequestError && error.code === 'verification_failed'
  );
});

test('native HTML verification failures stay generic and do not write', async () => {
  const database = new MockD1();
  const request = new Request('https://cinagroup.com/api/contact', {
    method: 'POST',
    headers: {
      Accept: 'text/html',
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'https://cinagroup.com',
    },
    body: new URLSearchParams(validPayload()).toString(),
  });
  const response = await handleContactRequest(
    { request, env: contactEnv(database), waitUntil() {} },
    { fetch: async () => Response.json({ success: false, 'error-codes': ['test-only-code'] }) }
  );
  assert.equal(response.status, 403);
  assertApiSecurityHeaders(response);
  assert.match(response.headers.get('Content-Type'), /^text\/html/);
  assert.doesNotMatch(await response.text(), /test-only-code|hostname|action/u);
  assert.equal(database.stats.insertAttempts, 0);
});
