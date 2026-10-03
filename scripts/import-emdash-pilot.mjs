import { pathToFileURL } from 'node:url';

import { EmDashClient } from 'emdash/client';

import { preparePilot } from './prepare-emdash-pilot.mjs';

export const PREVIEW_ORIGIN = 'https://cinagroup-emdash-preview.cinagroup.workers.dev';
const PREVIEW_HOSTNAME = new URL(PREVIEW_ORIGIN).hostname;
const SITE_LOCALES = ['en', 'zh', 'ja', 'ko', 'ru', 'es', 'pt', 'fr'];
const WORKER_NAME = 'cinagroup-emdash-preview';
const EMDASH_DB_ID = '050ec919-1b18-4de8-86a8-62c16c28e59c';
const CONTACT_DB_ID = 'a24a999d-f784-4ee1-8dcd-888a7be43e7c';
const REQUIRED_FIELDS = new Map([
  ['title', 'string'],
  ['content', 'portableText'],
  ['editorial_status', 'select'],
  ['legacy_status', 'select'],
  ['origin', 'select'],
  ['translation_key', 'string'],
  ['legacy_source_path', 'string'],
  ['legacy_source_hash', 'string'],
]);

export class PilotImportError extends Error {}

function fail(message) {
  throw new PilotImportError(message);
}

export function validateDraftSeed(seed) {
  const entries = seed?.content?.posts;
  if (!Array.isArray(entries) || entries.length !== 3) fail('Expected exactly the three reviewed pilot candidates');
  const ids = new Set();
  const routes = new Set();
  for (const entry of entries) {
    if (!entry || entry.status !== 'draft' || entry.data?.editorial_status !== 'in_review') {
      fail('Every pilot entry must remain an in-review draft');
    }
    if (!['zh', 'ja'].includes(entry.locale) || !/^[a-z0-9-]+$/.test(entry.slug ?? '')) {
      fail('Unexpected pilot locale or slug');
    }
    if (!/^[a-f0-9]{64}$/.test(entry.data.legacy_source_hash ?? '')) fail('Missing source hash');
    const route = `${entry.locale}:${entry.slug}`;
    if (ids.has(entry.id) || routes.has(route)) fail('Duplicate pilot ID or route');
    ids.add(entry.id);
    routes.add(route);
    if (entry.translationOf && !ids.has(entry.translationOf)) {
      fail('Translations must follow their source entry');
    }
  }
  return entries;
}

export function assertPreviewOrigin(value = PREVIEW_ORIGIN) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== PREVIEW_HOSTNAME ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    fail('The import target must be the exact isolated workers.dev preview origin');
  }
  return url.origin;
}

function gateCookie(header) {
  const cookie = /(?:^|,\s*)emdash_preview_access=([^;,\s]+)/.exec(header ?? '')?.[1];
  if (!cookie || !/^v1\.\d{10}\.[a-f0-9]{64}$/.test(cookie)) fail('Preview admin gate did not issue a valid cookie');
  return `emdash_preview_access=${cookie}`;
}

/** The gate uses Basic once; API requests retain their separate Bearer token. */
export async function openPreviewGate(fetchFn, password) {
  if (typeof password !== 'string' || password.length < 32) fail('A 32+ character preview admin password is required');
  const url = new URL('/_emdash/api/setup/status', PREVIEW_ORIGIN);
  const authorization = `Basic ${Buffer.from(`preview:${password}`).toString('base64')}`;
  const response = await fetchFn(url, {
    method: 'GET',
    headers: { Authorization: authorization },
    redirect: 'error',
    cache: 'no-store',
  });
  if (response.status !== 200) fail(`Preview admin gate/setup check returned HTTP ${response.status}`);
  const cookie = gateCookie(response.headers.get('set-cookie'));
  const payload = await response.json();
  if (payload?.success !== true || payload?.data?.needsSetup !== false) {
    fail('EmDash first-admin setup must be completed before the REST import');
  }
  return cookie;
}

export function createPreviewClient(token, cookie) {
  if (typeof token !== 'string' || !token.startsWith('ec_')) fail('An EmDash API or OAuth token is required');
  return new EmDashClient({
    baseUrl: PREVIEW_ORIGIN,
    token,
    interceptors: [
      (request, next) => {
        if (new URL(request.url).origin !== PREVIEW_ORIGIN) fail('Refusing a request outside the preview Worker');
        const headers = new Headers(request.headers);
        headers.set('Cookie', cookie);
        return next(new Request(request, { headers }));
      },
    ],
  });
}

/** Check the currently deployed Worker, rather than trusting only the repository config. */
export async function auditPreviewWorker({ fetchFn = fetch, accountId, cloudflareToken }) {
  if (!/^[a-f0-9]{32}$/i.test(accountId ?? '') || !cloudflareToken) {
    fail('Cloudflare account ID and API token are required to audit the deployed Worker');
  }
  async function accountGet(path) {
    const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`);
    const response = await fetchFn(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cloudflareToken}` },
      redirect: 'error',
      cache: 'no-store',
    });
    if (response.status !== 200) fail(`Cloudflare Worker audit returned HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.success !== true) fail('Cloudflare Worker audit failed');
    return payload.result;
  }

  const [settings, scripts, domains, subdomain, accountSubdomain] = await Promise.all([
    accountGet(`/workers/scripts/${WORKER_NAME}/settings`),
    accountGet('/workers/scripts'),
    accountGet(`/workers/domains?service=${WORKER_NAME}`),
    accountGet(`/workers/scripts/${WORKER_NAME}/subdomain`),
    accountGet('/workers/subdomain'),
  ]);
  if (!Array.isArray(settings?.bindings) || !Array.isArray(scripts) || !Array.isArray(domains)) {
    fail('Cloudflare Worker audit returned an unexpected shape');
  }
  const bindings = settings.bindings;
  const exactlyOne = (name) => {
    const matches = bindings.filter((binding) => binding.name === name);
    if (matches.length !== 1) fail(`Expected one ${name} preview binding`);
    return matches[0];
  };
  const db = exactlyOne('DB');
  const contact = exactlyOne('CONTACT_DB');
  const media = exactlyOne('MEDIA');
  if (db.type !== 'd1' || db.database_id !== EMDASH_DB_ID) fail('Worker DB binding is not the isolated EmDash D1');
  if (contact.type !== 'd1' || contact.database_id !== CONTACT_DB_ID) fail('Worker CONTACT_DB binding is not the preview D1');
  if (media.type !== 'r2_bucket' || media.bucket_name !== 'cinagroup-emdash-media-preview') {
    fail('Worker MEDIA binding is not the isolated preview R2 bucket');
  }
  const worker = scripts.find((candidate) => candidate.id === WORKER_NAME);
  // Cloudflare represents no zone routes as null.
  if (
    !worker ||
    (worker.routes !== null && (!Array.isArray(worker.routes) || worker.routes.length !== 0)) ||
    domains.some((domain) => domain.service === WORKER_NAME)
  ) {
    fail('Preview Worker has an unknown route or custom domain');
  }
  if (subdomain?.enabled !== true || `${WORKER_NAME}.${accountSubdomain?.subdomain}.workers.dev` !== PREVIEW_HOSTNAME) {
    fail('Preview Worker workers.dev hostname does not match the isolated target');
  }
  return true;
}

async function listTrash(fetchFn, token, cookie, locale) {
  const items = [];
  let cursor;
  do {
    const url = new URL('/_emdash/api/content/posts/trash', PREVIEW_ORIGIN);
    url.searchParams.set('locale', locale);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    const response = await fetchFn(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Cookie: cookie },
      redirect: 'error',
      cache: 'no-store',
    });
    if (response.status !== 200) fail(`Preview trash inventory returned HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.success !== true || !Array.isArray(payload.data?.items)) fail('Invalid preview trash inventory');
    items.push(...payload.data.items);
    cursor = payload.data.nextCursor;
  } while (cursor);
  return items;
}

function matchExisting(entry, existing) {
  const data = existing?.data ?? {};
  return (
    existing?.slug === entry.slug &&
    existing?.locale === entry.locale &&
    existing?.status === 'draft' &&
    existing?.publishedAt === null &&
    data.legacy_source_path === entry.data.legacy_source_path &&
    data.legacy_source_hash === entry.data.legacy_source_hash &&
    data.translation_key === entry.data.translation_key &&
    data.origin === entry.data.origin &&
    data.title === entry.data.title &&
    data.editorial_status === 'in_review'
  );
}

export async function preflightPilot({ client, entries, trashByLocale }) {
  validateDraftSeed({ content: { posts: entries } });
  const collection = await client.collection('posts');
  const fields = new Map(collection.fields?.map((field) => [field.slug, field.type]));
  for (const [name, type] of REQUIRED_FIELDS) {
    if (fields.get(name) !== type) fail(`Remote posts collection has an incompatible ${name} field`);
  }
  if (!['drafts', 'preview'].every((support) => collection.supports?.includes(support))) {
    fail('Remote posts collection lacks draft or preview support');
  }

  const pilotKeys = new Set(entries.map((entry) => entry.data.translation_key));
  const pilotRoutes = new Set(entries.map((entry) => `${entry.locale}:${entry.slug}`));
  // Trash requires content:read_drafts. Check it first: EmDash would silently
  // restrict an ordinary list to published items for a lesser-privileged token.
  for (const locale of SITE_LOCALES) {
    const trash = await trashByLocale(locale);
    if (!Array.isArray(trash)) fail('Invalid preview trash inventory');
    for (const item of trash) {
      if (pilotRoutes.has(`${locale}:${item.slug}`) || pilotKeys.has(item.data?.translation_key)) {
        fail(`Pilot route or translation key already exists in the ${locale} trash`);
      }
    }
  }
  const inventory = [];
  // Explicit `all` and no locale filter includes drafts and translations
  // outside the pilot locales. Page through the entire active collection.
  for await (const item of client.listAll('posts', { status: 'all', limit: 100 })) inventory.push(item);
  for (const item of inventory) {
    if (pilotKeys.has(item.data?.translation_key) && !pilotRoutes.has(`${item.locale}:${item.slug}`)) {
      fail(`Existing content outside the pilot shares translation key ${item.data.translation_key}`);
    }
  }

  const planned = [];
  const existingBySeedId = new Map();
  for (const entry of entries) {
    const related = inventory.filter(
      (item) =>
        item.locale === entry.locale &&
        (item.slug === entry.slug || item.data?.translation_key === entry.data.translation_key)
    );
    const exactRoute = related.find((item) => item.slug === entry.slug);
    if (related.length > (exactRoute ? 1 : 0)) fail(`Conflicting translation key at ${entry.locale}:${entry.slug}`);
    if (exactRoute && !matchExisting(entry, exactRoute)) fail(`Conflicting existing content at ${entry.locale}:${entry.slug}`);
    if (exactRoute) existingBySeedId.set(entry.id, exactRoute);
    planned.push({ entry, action: exactRoute ? 'reuse' : 'create', existingId: exactRoute?.id });
  }

  for (const item of planned) {
    if (!item.entry.translationOf || item.action !== 'reuse') continue;
    const source = existingBySeedId.get(item.entry.translationOf);
    if (!source || !source.translationGroup || source.translationGroup !== inventory.find((row) => row.id === item.existingId)?.translationGroup) {
      fail(`Existing translation ${item.entry.locale}:${item.entry.slug} has an unverified translation group`);
    }
  }
  return planned;
}

export async function applyPilot({ client, plan }) {
  const realIds = new Map();
  const translationGroups = new Map();
  for (const { entry, action, existingId } of plan) {
    let id = existingId;
    if (action === 'create') {
      // Recheck after inventory; a concurrent writer may have created this route.
      try {
        await client.get('posts', entry.slug, { locale: entry.locale, raw: true });
        fail(`Pilot route appeared during import: ${entry.locale}:${entry.slug}`);
      } catch (error) {
        if (!(error?.status === 404 && error?.code === 'NOT_FOUND')) throw error;
      }
      const translationOf = entry.translationOf ? realIds.get(entry.translationOf) : undefined;
      if (entry.translationOf && !translationOf) fail(`Missing translation source for ${entry.slug}`);
      const created = await client.create('posts', {
        data: entry.data,
        slug: entry.slug,
        locale: entry.locale,
        status: 'draft',
        ...(translationOf ? { translationOf } : {}),
      });
      id = created.id;
    }
    if (!id) fail(`Missing EmDash ID for ${entry.slug}`);
    const remote = await client.get('posts', id, { locale: entry.locale, raw: true });
    if (!matchExisting(entry, remote)) fail(`Post-write verification failed for ${entry.locale}:${entry.slug}`);
    if (typeof remote.translationGroup !== 'string' || !remote.translationGroup) {
      fail(`Missing translation group for ${entry.locale}:${entry.slug}`);
    }
    realIds.set(entry.id, id);
    translationGroups.set(entry.id, remote.translationGroup);
    if (entry.translationOf && remote.translationGroup !== translationGroups.get(entry.translationOf)) {
      fail(`Translation link verification failed for ${entry.locale}:${entry.slug}`);
    }
  }
  return realIds;
}

function assertNoindex(response, label) {
  if (response.headers.get('x-robots-tag') !== 'noindex, nofollow') {
    fail(`${label} is missing the preview noindex header`);
  }
}

async function publicFetch(fetchFn, url) {
  let current = new URL(url, PREVIEW_ORIGIN);
  for (let redirectCount = 0; redirectCount < 4; redirectCount++) {
    if (current.origin !== PREVIEW_ORIGIN) fail('Preview verification redirected outside the isolated Worker');
    const response = await fetchFn(current, { method: 'GET', redirect: 'manual', cache: 'no-store' });
    assertNoindex(response, 'Preview response');
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) fail('Preview redirect lacks a location');
    current = new URL(location, current);
  }
  fail('Preview response redirected too many times');
}

/** Verify that drafts remain private while their short-lived signed previews work. */
export async function verifyLiveDrafts({ entries, ids, token, cookie, fetchFn = fetch }) {
  for (const entry of entries) {
    const id = ids.get(entry.id);
    if (!id) fail(`Missing imported ID for ${entry.slug}`);
    const unsigned = new URL(`/cms-preview/${encodeURIComponent(entry.slug)}/`, PREVIEW_ORIGIN);
    unsigned.searchParams.set('locale', entry.locale);
    const unsignedResponse = await publicFetch(fetchFn, unsigned);
    if (unsignedResponse.status !== 404) fail(`Unsigned draft is visible at ${entry.locale}:${entry.slug}`);

    const previewEndpoint = new URL(`/_emdash/api/content/posts/${encodeURIComponent(id)}/preview-url`, PREVIEW_ORIGIN);
    const response = await fetchFn(previewEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: cookie,
        Origin: PREVIEW_ORIGIN,
        'Content-Type': 'application/json',
        'X-EmDash-Request': '1',
      },
      body: JSON.stringify({ expiresIn: '5m' }),
      redirect: 'error',
      cache: 'no-store',
    });
    if (response.status !== 200) fail(`Preview URL API returned HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.success !== true || typeof payload.data?.url !== 'string') fail('Invalid signed preview response');
    const signed = new URL(payload.data.url, PREVIEW_ORIGIN);
    if (signed.origin !== PREVIEW_ORIGIN || !signed.searchParams.has('_preview')) {
      fail('Signed preview URL points outside the isolated Worker or lacks its token');
    }
    const signedResponse = await publicFetch(fetchFn, signed);
    if (signedResponse.status !== 200 || !(await signedResponse.text()).includes(entry.data.title)) {
      fail(`Signed draft preview failed for ${entry.locale}:${entry.slug}`);
    }
  }

  for (const locale of [...new Set(entries.map((entry) => entry.locale))]) {
    const list = new URL('/cms-preview/', PREVIEW_ORIGIN);
    list.searchParams.set('locale', locale);
    const response = await publicFetch(fetchFn, list);
    if (response.status !== 200) fail(`Public CMS preview list failed for ${locale}`);
    const html = await response.text();
    for (const entry of entries.filter((candidate) => candidate.locale === locale)) {
      if (html.includes(`/cms-preview/${encodeURIComponent(entry.slug)}/`)) {
        fail(`Draft appears in public CMS preview list: ${locale}:${entry.slug}`);
      }
    }
  }
}

export async function runPilotImport({
  apply = false,
  fetchFn = fetch,
  client,
  token,
  password,
  trashByLocale,
  accountId,
  cloudflareToken,
} = {}) {
  const { seed, report } = preparePilot();
  const entries = validateDraftSeed(seed);
  if (apply && (!accountId || !cloudflareToken)) fail('Apply requires a current Cloudflare Worker binding audit');
  const bindingAudit = accountId && cloudflareToken
    ? await auditPreviewWorker({ fetchFn, accountId, cloudflareToken })
    : false;
  const authCookie = client ? undefined : await openPreviewGate(fetchFn, password);
  const api = client ?? createPreviewClient(token, authCookie);
  const plan = await preflightPilot({
    client: api,
    entries,
    trashByLocale: trashByLocale ?? ((locale) => listTrash(fetchFn, token, authCookie, locale)),
  });
  const summary = plan.map(({ entry, action }) => ({
    locale: entry.locale,
    slug: entry.slug,
    action,
    sourceCount: report.find((item) => item.slug === entry.slug)?.sourceCount,
  }));
  if (!apply) return { target: PREVIEW_ORIGIN, mode: 'preflight', bindingAudit, summary };
  const ids = await applyPilot({ client: api, plan });
  await verifyLiveDrafts({ entries, ids, token, cookie: authCookie, fetchFn });
  return { target: PREVIEW_ORIGIN, mode: 'applied', bindingAudit, summary, verifiedDrafts: ids.size };
}

async function main(args) {
  if (args.includes('--help')) {
    console.log('Usage: node scripts/import-emdash-pilot.mjs [--apply]');
    console.log('Without --apply, only reads the isolated EmDash preview. Credentials are read from EMDASH_TOKEN and EMDASH_PREVIEW_ADMIN_PASSWORD.');
    console.log('Apply additionally requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN for a current binding and route audit.');
    return;
  }
  if (args.some((arg) => arg !== '--apply') || args.filter((arg) => arg === '--apply').length > 1) {
    fail('Only --apply is accepted');
  }
  assertPreviewOrigin();
  const result = await runPilotImport({
    apply: args.includes('--apply'),
    token: process.env.EMDASH_TOKEN,
    password: process.env.EMDASH_PREVIEW_ADMIN_PASSWORD,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareToken: process.env.CLOUDFLARE_API_TOKEN,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    // Never print arbitrary API errors or request objects: they may include credentials.
    console.error(error instanceof PilotImportError ? error.message : 'EmDash preview import failed; inspect the private operator log');
    process.exitCode = 1;
  });
}
