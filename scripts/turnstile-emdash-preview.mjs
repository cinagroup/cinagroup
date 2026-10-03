import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workerName = 'cinagroup-emdash-preview';
const hostname = 'cinagroup-emdash-preview.cinagroup.workers.dev';
const widgetName = 'cinagroup-emdash-preview-contact';
const secretNames = ['TURNSTILE_SECRET_KEY', 'TURNSTILE_PREVIEW_HOSTNAME'];
const accountSubdomain = 'cinagroup';
const scriptDirectory = dirname(fileURLToPath(import.meta.url));

function assertPreviewConfig() {
  const raw = readFileSync(resolve(scriptDirectory, '../wrangler.jsonc'), 'utf8');
  const config = JSON.parse(raw.replace(/,\s*([}\]])/g, '$1'));
  const binding = (name) => config.d1_databases?.find((item) => item.binding === name);
  if (
    config.name !== workerName ||
    config.route ||
    config.routes?.length ||
    config.domains?.length ||
    config.workers_dev === false ||
    config.assets?.run_worker_first !== true ||
    binding('DB')?.database_id !== '050ec919-1b18-4de8-86a8-62c16c28e59c' ||
    binding('CONTACT_DB')?.database_id !== 'a24a999d-f784-4ee1-8dcd-888a7be43e7c' ||
    config.r2_buckets?.find((item) => item.binding === 'MEDIA')?.bucket_name !==
      'cinagroup-emdash-media-preview'
  ) {
    throw new Error('Checked-in Wrangler config is not the isolated preview target');
  }
}

function validateWidget(widget) {
  if (
    widget?.name !== widgetName ||
    !/^[A-Za-z0-9_-]{10,32}$/.test(widget.sitekey ?? '') ||
    widget.mode !== 'managed' ||
    widget.clearance_level !== 'no_clearance' ||
    !Array.isArray(widget.domains) ||
    widget.domains.length !== 1 ||
    widget.domains[0] !== hostname
  ) {
    throw new Error('Preview Turnstile widget differs from the exact hostname and safe configuration');
  }
  return widget;
}

async function uploadWorkerSecrets(secrets, accountId, token) {
  const wrangler = resolve(scriptDirectory, '../node_modules/wrangler/bin/wrangler.js');
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [wrangler, 'secret', 'bulk', '--name', workerName, '--config', 'wrangler.jsonc'], {
      cwd: resolve(scriptDirectory, '..'),
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: token },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // Wrangler output is deliberately suppressed: it may contain API diagnostics.
    child.stdout.resume();
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.once('error', () => rejectPromise(new Error('Unable to start Wrangler secret bulk')));
    child.once('close', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`Wrangler secret bulk failed (exit ${code}); check Workers Scripts Write permission`));
    });
    child.stdin.end(JSON.stringify(secrets));
  });
}

/** Audit or configure only the exact preview Turnstile widget and Worker. */
export async function runPreviewTurnstile({
  operation,
  accountId,
  token,
  configuredSiteKey = '',
  fetchImpl = fetch,
  uploadSecrets = uploadWorkerSecrets,
  pauseImpl = (duration) => new Promise((done) => setTimeout(done, duration)),
}) {
  if (!['audit-turnstile', 'configure-turnstile'].includes(operation)) throw new Error('Unknown Turnstile operation');
  if (!/^[a-f0-9]{32}$/i.test(accountId ?? '') || !token) {
    throw new Error('GitHub Cloudflare account ID or API token is missing');
  }
  assertPreviewConfig();

  async function api(path, label, method = 'GET', payload) {
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    let body;
    try {
      body = await response.json();
    } catch {
      throw new Error(`${label}: Cloudflare returned HTTP ${response.status} without JSON`);
    }
    if (!response.ok || body.success !== true) {
      const codes = Array.isArray(body.errors) ? body.errors.map((error) => error.code).join(',') : 'unknown';
      const permission = response.status === 403 ? '; check Turnstile Sites and Workers Scripts permissions' : '';
      throw new Error(`${label}: Cloudflare HTTP ${response.status}, error code(s) ${codes}${permission}`);
    }
    return body;
  }

  async function inspectWorkerBoundary() {
    const [settings, scripts, domains, subdomain, account] = await Promise.all([
      api(`/workers/scripts/${workerName}/settings`, 'Preview Worker settings'),
      api('/workers/scripts', 'Preview Worker inventory'),
      api(`/workers/domains?service=${workerName}`, 'Preview Worker custom domains'),
      api(`/workers/scripts/${workerName}/subdomain`, 'Preview Worker subdomain'),
      api('/workers/subdomain', 'Account workers.dev subdomain'),
    ]);
    if (!Array.isArray(settings.result?.bindings) || !Array.isArray(scripts.result) || !Array.isArray(domains.result)) {
      throw new Error('Unexpected preview Worker inventory format');
    }
    const binding = (name) => {
      const matches = settings.result.bindings.filter((item) => item.name === name);
      if (matches.length !== 1) throw new Error(`Preview Worker ${name} binding is missing or duplicated`);
      return matches[0];
    };
    const db = binding('DB');
    const contact = binding('CONTACT_DB');
    const media = binding('MEDIA');
    if (
      db.type !== 'd1' ||
      db.database_id !== '050ec919-1b18-4de8-86a8-62c16c28e59c' ||
      contact.type !== 'd1' ||
      contact.database_id !== 'a24a999d-f784-4ee1-8dcd-888a7be43e7c' ||
      media.type !== 'r2_bucket' ||
      media.bucket_name !== 'cinagroup-emdash-media-preview'
    ) {
      throw new Error('Preview Worker has a non-preview D1 or R2 binding');
    }
    const workers = scripts.result.filter((item) => item.id === workerName);
    const workerRoutes = workers[0]?.routes;
    if (
      workers.length !== 1 ||
      !(workerRoutes === null || (Array.isArray(workerRoutes) && workerRoutes.length === 0)) ||
      domains.result.length !== 0 ||
      subdomain.result?.enabled !== true ||
      account.result?.subdomain !== accountSubdomain
    ) {
      throw new Error('Preview Worker is missing, has a route/domain, or does not use the exact workers.dev hostname');
    }
  }

  await inspectWorkerBoundary();
  const secrets = await api(`/workers/scripts/${workerName}/secrets`, 'Preview Worker secrets');
  if (!Array.isArray(secrets.result)) throw new Error('Unexpected preview Worker secret inventory format');
  const boundSecrets = new Set(secrets.result.map((item) => item.name));

  const widgets = [];
  for (let page = 1; page <= 100; page++) {
    const query = new URLSearchParams({ filter: `name:${widgetName}`, page: String(page), per_page: '100' });
    const listed = await api(`/challenges/widgets?${query}`, 'Preview Turnstile widget list');
    if (!Array.isArray(listed.result)) throw new Error('Unexpected Turnstile widget list format');
    const similarlyNamed = listed.result.filter((item) => item.name?.toLowerCase() === widgetName.toLowerCase());
    if (similarlyNamed.some((item) => item.name !== widgetName)) {
      throw new Error('A case-variant preview Turnstile widget name already exists');
    }
    widgets.push(...similarlyNamed);
    const totalPages = listed.result_info?.total_pages;
    if (Number.isInteger(totalPages) && totalPages >= 1 && page >= totalPages) break;
    if (listed.result.length < 100) break;
    if (page === 100) throw new Error('Turnstile widget list exceeded safe pagination limit');
  }
  if (widgets.length > 1) throw new Error('Multiple exact-name preview Turnstile widgets exist');
  let widget = widgets[0] ? validateWidget(widgets[0]) : null;
  const siteKeyVariable = configuredSiteKey.trim();
  if (siteKeyVariable && siteKeyVariable !== widget?.sitekey) {
    throw new Error('GitHub preview Turnstile site key variable does not match the isolated widget');
  }
  if (!widget && secretNames.some((name) => boundSecrets.has(name))) {
    throw new Error('Preview Worker has Turnstile secrets but the exact-name widget is missing');
  }

  let created = false;
  if (operation === 'configure-turnstile' && !widget) {
    const response = await api('/challenges/widgets', 'Create preview Turnstile widget', 'POST', {
      name: widgetName,
      domains: [hostname],
      mode: 'managed',
      clearance_level: 'no_clearance',
    });
    widget = validateWidget(response.result);
    if (typeof widget.secret !== 'string' || !widget.secret) {
      throw new Error('Created Turnstile widget did not return a usable secret');
    }
    created = true;
  }

  if (operation === 'configure-turnstile') {
    if (!created) {
      const response = await api(
        `/challenges/widgets/${encodeURIComponent(widget.sitekey)}`,
        'Preview Turnstile widget details'
      );
      widget = validateWidget(response.result);
    }
    if (typeof widget.secret !== 'string' || !widget.secret) {
      throw new Error('Turnstile widget details did not provide a usable secret');
    }
    await uploadSecrets(
      { TURNSTILE_SECRET_KEY: widget.secret, TURNSTILE_PREVIEW_HOSTNAME: hostname },
      accountId,
      token
    );
    const updated = await api(`/workers/scripts/${workerName}/secrets`, 'Verify preview Worker secrets');
    if (!Array.isArray(updated.result) || !secretNames.every((name) => updated.result.some((item) => item.name === name))) {
      throw new Error('Preview Worker Turnstile secret names did not verify after upload');
    }
    await inspectWorkerBoundary();

    async function checkLivePath(path, expectedStatuses) {
      let lastStatus;
      for (let attempt = 0; attempt < 4; attempt++) {
        const response = await fetchImpl(`https://${hostname}${path}`, { redirect: 'manual' });
        lastStatus = response.status;
        if (expectedStatuses.includes(lastStatus)) {
          if (!response.headers.get('X-Robots-Tag')?.includes('noindex')) {
            throw new Error(`Preview ${path}: missing Worker-level noindex header after secret deployment`);
          }
          if (path.startsWith('/_emdash') && !response.headers.get('Cache-Control')?.includes('no-store')) {
            throw new Error('Preview admin guard did not disable caching after secret deployment');
          }
          if (lastStatus === 401 && !response.headers.get('WWW-Authenticate')?.startsWith('Basic ')) {
            throw new Error('Preview admin guard did not challenge with HTTP Basic after secret deployment');
          }
          return;
        }
        if (attempt < 3) await pauseImpl(3000);
      }
      throw new Error(`Preview ${path}: expected HTTP ${expectedStatuses.join(' or ')}, received ${lastStatus}`);
    }

    await Promise.all([checkLivePath('/', [200]), checkLivePath('/_emdash/admin/setup', [401, 503])]);
  }

  return {
    hostname,
    sitekey: widget?.sitekey ?? null,
    created,
    secretNamesPresent: operation === 'configure-turnstile' ? true : secretNames.every((name) => boundSecrets.has(name)),
    wroteSecrets: operation === 'configure-turnstile',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runPreviewTurnstile({
    operation: process.argv[2],
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    token: process.env.CLOUDFLARE_API_TOKEN,
    configuredSiteKey: process.env.EMDASH_PREVIEW_TURNSTILE_SITE_KEY ?? '',
  });
  const lines = [
    '### Isolated preview Turnstile',
    '',
    `- Hostname: ${result.hostname}`,
    `- Widget: ${result.sitekey ? (result.created ? 'created' : 'present') : 'missing'}`,
    `- Public site key: ${result.sitekey ?? 'not yet created'}`,
    `- Worker secret names: ${result.secretNamesPresent ? 'present' : 'missing'}`,
    `- Worker secret update: ${result.wroteSecrets ? 'completed' : 'none (read-only audit)'}`,
    '- Set GitHub Actions variable EMDASH_PREVIEW_TURNSTILE_SITE_KEY to the public site key, then redeploy the preview Worker.',
  ];
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  console.log(lines.slice(2, 7).join('\n'));
}
