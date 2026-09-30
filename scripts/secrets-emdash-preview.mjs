import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workerName = 'cinagroup-emdash-preview';
const hostname = `${workerName}.cinagroup.workers.dev`;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const encryptionName = 'EMDASH_ENCRYPTION_KEY';

class PreviewSecretError extends Error {}

export function safePreviewSecretError(error) {
  return error instanceof PreviewSecretError
    ? error.message
    : 'Preview secret operation failed; sensitive diagnostics suppressed';
}

function assertPreviewConfig() {
  const raw = readFileSync(resolve(scriptDirectory, '../wrangler.jsonc'), 'utf8');
  const config = JSON.parse(raw.replace(/,\s*([}\]])/g, '$1'));
  const db = (name) => config.d1_databases?.find((item) => item.binding === name);
  if (
    config.name !== workerName ||
    config.route ||
    config.routes?.length ||
    config.domains?.length ||
    config.workers_dev === false ||
    config.assets?.run_worker_first !== true ||
    db('DB')?.database_id !== '050ec919-1b18-4de8-86a8-62c16c28e59c' ||
    db('CONTACT_DB')?.database_id !== 'a24a999d-f784-4ee1-8dcd-888a7be43e7c' ||
    config.r2_buckets?.find((item) => item.binding === 'MEDIA')?.bucket_name !== 'cinagroup-emdash-media-preview'
  ) {
    throw new PreviewSecretError('Checked-in Wrangler config is not the isolated preview target');
  }
}

async function uploadEncryptionKey(key, accountId, token) {
  const wrangler = resolve(scriptDirectory, '../node_modules/wrangler/bin/wrangler.js');
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      [wrangler, 'secret', 'bulk', '--name', workerName, '--config', 'wrangler.jsonc'],
      {
        cwd: resolve(scriptDirectory, '..'),
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: token },
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    child.stdout.resume();
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.once('error', () => rejectPromise(new PreviewSecretError('Unable to start Wrangler secret bulk')));
    child.once('close', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new PreviewSecretError(`Preview encryption secret upload failed (exit ${code})`));
    });
    child.stdin.end(JSON.stringify({ [encryptionName]: key }));
  });
}

/** Creates an absent encryption key only. Existing keys are never rotated by this operation. */
export async function runPreviewSecrets({
  operation,
  accountId,
  token,
  encryptionKey = '',
  fetchImpl = fetch,
  uploadKey = uploadEncryptionKey,
  pauseImpl = (duration) => new Promise((done) => setTimeout(done, duration)),
}) {
  if (!['audit-secrets', 'configure-encryption'].includes(operation))
    throw new PreviewSecretError('Unknown preview secrets operation');
  if (!/^[a-f0-9]{32}$/i.test(accountId ?? '') || typeof token !== 'string' || !/^[\x21-\x7e]+$/.test(token)) {
    throw new PreviewSecretError('Cloudflare credentials are missing or invalid');
  }
  assertPreviewConfig();

  async function api(path) {
    let response;
    try {
      response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new PreviewSecretError('Preview secret audit: Cloudflare request failed');
    }
    let body;
    try {
      body = await response.json();
    } catch {
      throw new PreviewSecretError(`Preview secret audit: HTTP ${response.status} without JSON`);
    }
    if (!response.ok || body.success !== true) {
      const codes = Array.isArray(body.errors)
        ? body.errors
            .slice(0, 10)
            .map((error) => (Number.isSafeInteger(error?.code) ? error.code : 'unknown'))
            .join(',')
        : 'unknown';
      throw new PreviewSecretError(`Preview secret audit: Cloudflare HTTP ${response.status}, error code(s) ${codes}`);
    }
    return body.result;
  }

  async function inspectBoundary() {
    const [settings, scripts, domains, subdomain, account] = await Promise.all([
      api(`/workers/scripts/${workerName}/settings`),
      api('/workers/scripts'),
      api(`/workers/domains?service=${workerName}`),
      api(`/workers/scripts/${workerName}/subdomain`),
      api('/workers/subdomain'),
    ]);
    if (!Array.isArray(settings?.bindings) || !Array.isArray(scripts) || !Array.isArray(domains)) {
      throw new PreviewSecretError('Unexpected preview Worker inventory');
    }
    const binding = (name) => {
      const matches = settings.bindings.filter((item) => item.name === name);
      if (matches.length !== 1) throw new PreviewSecretError(`Preview Worker ${name} binding is missing or duplicated`);
      return matches[0];
    };
    const db = binding('DB');
    const contact = binding('CONTACT_DB');
    const media = binding('MEDIA');
    const workers = scripts.filter((item) => item.id === workerName);
    if (
      db.type !== 'd1' ||
      db.database_id !== '050ec919-1b18-4de8-86a8-62c16c28e59c' ||
      contact.type !== 'd1' ||
      contact.database_id !== 'a24a999d-f784-4ee1-8dcd-888a7be43e7c' ||
      media.type !== 'r2_bucket' ||
      media.bucket_name !== 'cinagroup-emdash-media-preview' ||
      workers.length !== 1 ||
      !(workers[0].routes === null || (Array.isArray(workers[0].routes) && workers[0].routes.length === 0)) ||
      domains.length !== 0 ||
      subdomain?.enabled !== true ||
      account?.subdomain !== 'cinagroup'
    ) {
      throw new PreviewSecretError('Worker is not isolated to the exact preview bindings and workers.dev hostname');
    }
  }

  async function secretNames() {
    const secrets = await api(`/workers/scripts/${workerName}/secrets`);
    if (!Array.isArray(secrets) || secrets.some((item) => typeof item.name !== 'string')) {
      throw new PreviewSecretError('Unexpected preview Worker secret inventory');
    }
    return new Set(secrets.map((item) => item.name));
  }

  await inspectBoundary();
  const before = await secretNames();
  let created = false;
  if (operation === 'configure-encryption' && !before.has(encryptionName)) {
    if (
      !/^emdash_enc_v1_[A-Za-z0-9_-]{43}$/.test(encryptionKey) ||
      Buffer.from(encryptionKey.slice(14), 'base64url').length !== 32 ||
      Buffer.from(encryptionKey.slice(14), 'base64url').toString('base64url') !== encryptionKey.slice(14)
    ) {
      throw new PreviewSecretError(
        'GitHub EMDASH_ENCRYPTION_KEY must be an EmDash v1 key generated from 32 random bytes'
      );
    }
    // Recheck immediately before the write, including the absence of a key.
    await inspectBoundary();
    if ((await secretNames()).has(encryptionName))
      throw new PreviewSecretError('Encryption key appeared during audit; refusing to replace it');
    await uploadKey(encryptionKey, accountId, token);
    created = true;
    const after = await secretNames();
    if (!after.has(encryptionName) || [...before].some((name) => !after.has(name))) {
      throw new PreviewSecretError('Encryption secret upload did not preserve existing preview secret names');
    }
    await inspectBoundary();
    for (const [path, statuses] of [
      ['/', [200]],
      ['/_emdash/admin/setup', [401, 503]],
    ]) {
      let accepted = false;
      for (let attempt = 0; attempt < 4; attempt++) {
        const response = await fetchImpl(`https://${hostname}${path}`, { redirect: 'manual' });
        await response.body?.cancel();
        if (statuses.includes(response.status)) {
          if (!response.headers.get('X-Robots-Tag')?.includes('noindex'))
            throw new PreviewSecretError('Secret deployment lost preview noindex');
          if (
            path.startsWith('/_emdash') &&
            (!response.headers.get('Cache-Control')?.includes('no-store') ||
              (response.status === 401 && !response.headers.get('WWW-Authenticate')?.startsWith('Basic ')))
          )
            throw new PreviewSecretError('Secret deployment lost the preview admin guard');
          accepted = true;
          break;
        }
        if (attempt < 3) await pauseImpl(3000);
      }
      if (!accepted) throw new PreviewSecretError(`Secret deployment returned an unexpected status at ${path}`);
    }
  }
  return {
    hostname,
    encryptionKeyPresent: created || before.has(encryptionName),
    adminPasswordPresent: before.has('EMDASH_PREVIEW_ADMIN_PASSWORD'),
    created,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runPreviewSecrets({
      operation: process.argv[2],
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      token: process.env.CLOUDFLARE_API_TOKEN,
      encryptionKey: process.env.EMDASH_ENCRYPTION_KEY ?? '',
    });
    const lines = [
      '### Isolated preview secrets',
      '',
      `- Encryption key: ${result.encryptionKeyPresent ? 'present' : 'missing'}`,
      `- Admin password: ${result.adminPasswordPresent ? 'present (value not inspected)' : 'missing'}`,
      `- Encryption key write: ${result.created ? 'created; existing secret names preserved; live guards verified' : 'none; existing keys never replaced'}`,
    ];
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
    console.log(lines.slice(2).join('\n'));
  } catch (error) {
    console.error(safePreviewSecretError(error));
    process.exitCode = 1;
  }
}
