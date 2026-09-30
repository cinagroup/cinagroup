import assert from 'node:assert/strict';
import test from 'node:test';
import { runPreviewSecrets, safePreviewSecretError } from '../scripts/secrets-emdash-preview.mjs';

const accountId = 'a'.repeat(32);
const token = 'local-test-token';
const encryptionKey = `emdash_enc_v1_${Buffer.alloc(32, 9).toString('base64url')}`;
const hostname = 'cinagroup-emdash-preview.cinagroup.workers.dev';
const adminPassword = 'Local-admin-test-password-0123456789abcd';
const validAccessCookie = `emdash_preview_access=v1.${Math.floor(Date.now() / 1000) + 28_800}.${'a'.repeat(64)}; Path=/_emdash; HttpOnly; Secure; SameSite=Strict`;

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
    passwordUploads: 0,
    liveAdminStatus: 503,
    liveNoindex: true,
    liveNoStore: true,
    liveBasicChallenge: true,
    authenticatedAdminStatus: 200,
    authenticatedAdminLocation: undefined,
    authenticatedAdminCookie: validAccessCookie,
    authenticatedAdminContentType: 'text/html; charset=utf-8',
  };
  const fetchImpl = async (url, options) => {
    const request = new URL(url);
    const authenticated =
      request.hostname === hostname &&
      request.pathname === '/_emdash/admin/' &&
      new Headers(options?.headers).get('Authorization') ===
        `Basic ${Buffer.from(`preview:${adminPassword}`).toString('base64')}`;
    state.requests.push({
      method: options?.method ?? 'GET',
      hostname: request.hostname,
      path: request.pathname,
      authenticated,
      redirect: options?.redirect,
    });
    if (request.hostname === hostname)
      return new Response(
        authenticated && state.authenticatedAdminStatus === 200
          ? '<!doctype html><html><body>Admin</body></html>'
          : null,
        {
          status:
            request.pathname === '/' ? 200 : authenticated ? state.authenticatedAdminStatus : state.liveAdminStatus,
          headers: {
            'Content-Type': authenticated ? state.authenticatedAdminContentType : 'text/html; charset=utf-8',
            ...(state.liveNoindex ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
            ...(state.liveNoStore ? { 'Cache-Control': 'no-store' } : {}),
            ...(state.liveBasicChallenge ? { 'WWW-Authenticate': 'Basic realm="Preview"' } : {}),
            ...(authenticated && state.authenticatedAdminLocation
              ? { Location: state.authenticatedAdminLocation }
              : {}),
            ...(authenticated && state.authenticatedAdminCookie
              ? { 'Set-Cookie': state.authenticatedAdminCookie }
              : {}),
          },
        }
      );
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
  const uploadPassword = async (value, uploadAccountId, uploadToken) => {
    assert.equal(value, adminPassword);
    assert.equal(uploadAccountId, accountId);
    assert.equal(uploadToken, token);
    state.passwordUploads++;
    state.secrets.push('EMDASH_PREVIEW_ADMIN_PASSWORD');
    state.liveAdminStatus = 401;
  };
  return { state, fetchImpl, uploadKey, uploadPassword };
}

function run(mock, operation = 'configure-encryption', overrides = {}) {
  return runPreviewSecrets({ operation, accountId, token, encryptionKey, adminPassword, ...mock, ...overrides });
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
  assert.deepEqual(first, {
    hostname,
    encryptionKeyPresent: true,
    adminPasswordPresent: true,
    created: true,
    adminPasswordCreated: false,
  });
  const second = await run(mock, 'configure-encryption', { encryptionKey: 'different-key' });
  assert.equal(second.created, false);
  assert.equal(mock.state.uploads, 1);
  assert(mock.state.secrets.includes('TURNSTILE_SECRET_KEY'));
  assert(!JSON.stringify(first).includes(encryptionKey));
});

test('invalid key format and unknown operations fail before a write', async () => {
  // The final character's unused low bits must be zero (EmDash rejects aliases).
  const noncanonical = encryptionKey.slice(0, -1) + 'l';
  assert.equal(Buffer.from(noncanonical.slice(14), 'base64url').toString('base64url'), encryptionKey.slice(14));
  for (const key of ['', 'random-string'.repeat(5), `emdash_enc_v1_${'A'.repeat(42)}`, noncanonical]) {
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

test('invalid credentials and unknown diagnostics never enter operator output', async () => {
  const mock = mockCloudflare();
  await assert.rejects(run(mock, 'audit-secrets', { token: `${token}\n` }), (error) => {
    assert.match(safePreviewSecretError(error), /credentials/);
    assert(!safePreviewSecretError(error).includes(token));
    return true;
  });
  assert.equal(mock.state.requests.length, 0);
  await assert.rejects(
    run(mock, 'audit-secrets', {
      fetchImpl: async () => {
        throw new TypeError(`unsafe ${token} ${encryptionKey}`);
      },
    }),
    (error) => {
      assert.equal(safePreviewSecretError(error), 'Preview secret audit: Cloudflare request failed');
      return true;
    }
  );
  assert(!safePreviewSecretError(new Error(encryptionKey)).includes(encryptionKey));
  await assert.rejects(
    run(mock, 'audit-secrets', {
      fetchImpl: async () => Response.json({ success: false, errors: [{ code: token }] }, { status: 403 }),
    }),
    (error) => {
      assert.match(safePreviewSecretError(error), /HTTP 403.*unknown/);
      assert(!safePreviewSecretError(error).includes(token));
      return true;
    }
  );
});

test('existing admin password is never replaced or probed with a different supplied password', async () => {
  const mock = mockCloudflare();
  mock.state.secrets.push('EMDASH_PREVIEW_ADMIN_PASSWORD');
  const result = await run(mock, 'configure-admin-password', { adminPassword: 'different-existing-password' });
  assert.equal(result.adminPasswordPresent, true);
  assert.equal(result.adminPasswordCreated, false);
  assert.equal(result.created, false);
  assert.equal(mock.state.passwordUploads, 0);
  assert.equal(mock.state.uploads, 0);
  assert(!mock.state.requests.some((request) => request.authenticated));
});

test('missing admin password is created once after two boundary audits and absence checks, preserving every secret name', async () => {
  const mock = mockCloudflare();
  mock.state.secrets.push('EMDASH_ENCRYPTION_KEY', 'EXISTING_PLUGIN_SECRET');
  const namesBefore = [...mock.state.secrets];
  const uploadPassword = async (...args) => {
    assert(mock.state.requests.filter((request) => request.path.endsWith('/settings')).length >= 2);
    assert(mock.state.requests.filter((request) => request.path.endsWith('/secrets')).length >= 2);
    await mock.uploadPassword(...args);
  };
  const first = await run(mock, 'configure-admin-password', { uploadPassword, pauseImpl: async () => {} });
  assert.deepEqual(first, {
    hostname,
    encryptionKeyPresent: true,
    adminPasswordPresent: true,
    created: false,
    adminPasswordCreated: true,
  });
  assert.equal(mock.state.passwordUploads, 1);
  assert.equal(mock.state.uploads, 0);
  for (const name of namesBefore) assert(mock.state.secrets.includes(name), name);
  assert(mock.state.requests.some((request) => request.path === '/_emdash/admin/setup' && !request.authenticated));
  assert(
    mock.state.requests.some(
      (request) => request.path === '/_emdash/admin/' && request.authenticated && request.method === 'GET'
    )
  );
  assert(!JSON.stringify(first).includes(adminPassword));
  assert(!JSON.stringify(first).includes(token));
  assert(!JSON.stringify(first).includes(validAccessCookie));
  const second = await run(mock, 'configure-admin-password', { adminPassword: 'different-password' });
  assert.equal(second.adminPasswordCreated, false);
  assert.equal(mock.state.passwordUploads, 1);
});

test('other secret operations never implicitly create the admin password', async () => {
  for (const operation of ['audit-secrets', 'configure-encryption']) {
    const mock = mockCloudflare();
    const result = await run(mock, operation, { pauseImpl: async () => {} });
    assert.equal(mock.state.passwordUploads, 0);
    assert.equal(result.adminPasswordPresent, false);
    assert.equal(result.adminPasswordCreated, false);
  }
});

test('invalid admin password values fail without uploading or exposing their values', async () => {
  for (const value of [
    '',
    'short',
    'A'.repeat(31),
    'A'.repeat(129),
    undefined,
    null,
    12345,
    {},
    [],
    adminPassword + ' ',
    'A'.repeat(31) + '\n',
    'A'.repeat(31) + '\t',
    'A'.repeat(31) + '\0',
    'A'.repeat(31) + '\x7f',
    'A'.repeat(31) + 'é',
  ]) {
    const mock = mockCloudflare();
    await assert.rejects(run(mock, 'configure-admin-password', { adminPassword: value }), (error) => {
      const output = safePreviewSecretError(error);
      assert.match(output, /password|ASCII|32|128/);
      assert(!output.includes(adminPassword));
      assert(!output.includes(token));
      return true;
    });
    assert.equal(mock.state.passwordUploads, 0);
    assert.equal(mock.state.uploads, 0);
  }
});

test('a concurrently created admin password aborts before overwrite', async () => {
  const mock = mockCloudflare();
  let listings = 0;
  const fetchImpl = async (url, options) => {
    if (new URL(url).pathname.endsWith('/secrets') && ++listings === 2)
      mock.state.secrets.push('EMDASH_PREVIEW_ADMIN_PASSWORD');
    return mock.fetchImpl(url, options);
  };
  await assert.rejects(
    run(mock, 'configure-admin-password', { fetchImpl }),
    /appeared during audit|refusing to replace/
  );
  assert.equal(mock.state.passwordUploads, 0);
});

test('initial or pre-write preview boundary failure blocks the admin password upload', async () => {
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
    await assert.rejects(run(mock, 'configure-admin-password'), /not isolated/);
    assert.equal(mock.state.passwordUploads, 0);
  }
  const mock = mockCloudflare();
  let settingsCalls = 0;
  const fetchImpl = async (url, options) => {
    if (new URL(url).pathname.endsWith('/settings') && ++settingsCalls === 2)
      mock.state.bindings[0].database_id = 'production-db';
    return mock.fetchImpl(url, options);
  };
  await assert.rejects(run(mock, 'configure-admin-password', { fetchImpl }), /not isolated/);
  assert.equal(mock.state.passwordUploads, 0);
});

test('admin password creation rejects a secret-name loss and failed anonymous guards', async () => {
  const removed = mockCloudflare();
  await assert.rejects(
    run(removed, 'configure-admin-password', {
      uploadPassword: async (...args) => {
        await removed.uploadPassword(...args);
        removed.state.secrets = ['EMDASH_PREVIEW_ADMIN_PASSWORD'];
      },
    }),
    /preserve existing/
  );
  for (const mutate of [
    (state) => {
      state.liveAdminStatus = 503;
    },
    (state) => {
      state.liveNoindex = false;
    },
    (state) => {
      state.liveNoStore = false;
    },
    (state) => {
      state.liveBasicChallenge = false;
    },
  ]) {
    const mock = mockCloudflare();
    await assert.rejects(
      run(mock, 'configure-admin-password', {
        uploadPassword: async (...args) => {
          await mock.uploadPassword(...args);
          mutate(mock.state);
        },
        pauseImpl: async () => {},
      }),
      /noindex|admin guard|unexpected status/
    );
    assert.equal(mock.state.passwordUploads, 1);
  }
});

test('authenticated admin success accepts only HTML 200 or a same-origin admin redirect', async () => {
  for (const [status, location] of [
    [200, undefined],
    [301, '/_emdash/admin/setup'],
    [302, `https://${hostname}/_emdash/admin/setup`],
    [303, '/_emdash/admin/setup'],
    [307, '/_emdash/admin/'],
    [308, '/_emdash/admin/setup'],
  ]) {
    const mock = mockCloudflare();
    mock.state.authenticatedAdminStatus = status;
    mock.state.authenticatedAdminLocation = location;
    const result = await run(mock, 'configure-admin-password', { pauseImpl: async () => {} });
    assert.equal(result.adminPasswordCreated, true);
    assert(mock.state.requests.some((request) => request.authenticated && request.path === '/_emdash/admin/'));
  }
  for (const location of ['https://cinagroup.com/_emdash/admin/setup', '/', '/_emdash/admin-wrong/setup']) {
    const mock = mockCloudflare();
    mock.state.authenticatedAdminStatus = 302;
    mock.state.authenticatedAdminLocation = location;
    await assert.rejects(
      run(mock, 'configure-admin-password', { pauseImpl: async () => {} }),
      /authentication|unexpected status/
    );
  }
});

test('authenticated admin failure and unsafe fetch diagnostics never reveal credentials or cookies', async () => {
  for (const mutate of [
    (state) => {
      state.authenticatedAdminStatus = 401;
    },
    (state) => {
      state.authenticatedAdminCookie = undefined;
    },
    (state) => {
      state.authenticatedAdminCookie = 'emdash_preview_access=invalid; Path=/_emdash';
    },
    (state) => {
      state.authenticatedAdminCookie = validAccessCookie.replace('; Secure', '');
    },
    (state) => {
      state.authenticatedAdminCookie = validAccessCookie.replace('; HttpOnly', '');
    },
    (state) => {
      state.authenticatedAdminCookie = validAccessCookie.replace('Path=/_emdash', 'Path=/');
    },
    (state) => {
      state.authenticatedAdminCookie = validAccessCookie.replace('SameSite=Strict', 'SameSite=Lax');
    },
    (state) => {
      state.authenticatedAdminContentType = 'application/json';
    },
    (state) => {
      state.authenticatedAdminStatus = 302;
      state.authenticatedAdminLocation = undefined;
    },
  ]) {
    const mock = mockCloudflare();
    mutate(mock.state);
    await assert.rejects(run(mock, 'configure-admin-password', { pauseImpl: async () => {} }), (error) => {
      const output = safePreviewSecretError(error);
      assert.match(output, /authentication|unexpected status/);
      for (const sensitive of [
        adminPassword,
        token,
        validAccessCookie,
        Buffer.from(`preview:${adminPassword}`).toString('base64'),
      ]) {
        assert(!output.includes(sensitive));
      }
      return true;
    });
  }
  const mock = mockCloudflare();
  const fetchImpl = async (url, options) => {
    if (new URL(url).hostname === hostname && new Headers(options?.headers).has('Authorization'))
      throw new TypeError(`unsafe ${adminPassword} ${token} ${validAccessCookie}`);
    return mock.fetchImpl(url, options);
  };
  await assert.rejects(run(mock, 'configure-admin-password', { fetchImpl, pauseImpl: async () => {} }), (error) => {
    const output = safePreviewSecretError(error);
    assert(!output.includes(adminPassword));
    assert(!output.includes(token));
    assert(!output.includes(validAccessCookie));
    return true;
  });
});
