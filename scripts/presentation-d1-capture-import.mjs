import { createHash, randomUUID } from 'node:crypto';
import { ACCOUNT, DATABASE, productionApi } from './emdash-production.mjs';

const collections = new Set([
  'site_profile',
  'site_pages',
  'page_about',
  'page_services',
  'page_contact',
  'page_pricing',
  'page_products',
  'page_english',
]);
// Installed EmDash capture version 1, with only its identity/table/operation
// slots removed. An SDK template change requires a new reviewed compatibility fix.
const nativeShapeSha256 = '06ea3d395d054275d3b3db9feb8c6101d28b04eb26ad732d7ce4d936e2444999';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const importPath = `/accounts/${ACCOUNT}/d1/database/${DATABASE}/import`;

export function inspectPresentationCaptureTrigger(statement, parameters = []) {
  if (!/^\s*CREATE\s+TRIGGER\s+"emdash_mu_/i.test(statement)) return null;
  if (parameters.length || Buffer.byteLength(statement, 'utf8') > 16384)
    throw new Error('Unsupported native capture trigger parameters or size');
  const normalized = statement.replace(/\s+/g, ' ').trim().replace(/;$/, '');
  const header =
    /^CREATE TRIGGER "(emdash_mu_([a-f0-9]{32})_(ai|au|ad))" AFTER (INSERT|UPDATE|DELETE) ON "ec_([a-z][a-z0-9_]*)" FOR EACH ROW BEGIN /.exec(
      normalized
    );
  const collectionId = /AND collection_id = '([0-7][0-9A-HJKMNP-TV-Z]{25})'/.exec(normalized)?.[1];
  if (
    !header ||
    !collectionId ||
    !collections.has(header[5]) ||
    { INSERT: 'ai', UPDATE: 'au', DELETE: 'ad' }[header[4]] !== header[3] ||
    sha256(`1:${collectionId}:${header[5]}`).slice(0, 32) !== header[2]
  )
    throw new Error('Unsupported native capture trigger identity');
  const shape = normalized
    .replaceAll(header[1], 'TRIGGER')
    .replace(`AFTER ${header[4]} ON`, 'AFTER OPERATION ON')
    .replaceAll(`"ec_${header[5]}"`, '"TABLE"')
    .replaceAll(`'${header[5]}'`, "'SLUG'")
    .replaceAll(`'${collectionId}'`, "'ID'")
    .replaceAll(header[4] === 'DELETE' ? 'OLD.id' : 'NEW.id', 'ROW.id');
  if (sha256(shape) !== nativeShapeSha256) throw new Error('Unsupported native capture trigger template');
  return { name: header[1], operation: header[4], collection: header[5], collectionId };
}

function uploadUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Native capture import upload location is invalid');
  }
  if (
    parsed.protocol !== 'https:' ||
    !parsed.hostname.endsWith('.r2.cloudflarestorage.com') ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.port
  )
    throw new Error('Native capture import upload location is invalid');
  return parsed;
}

export class PresentationCaptureImportUncertainError extends Error {
  constructor(stage, bookmark) {
    super(
      'Native capture import outcome is uncertain; inspect the import bookmark and installed capture state before resuming'
    );
    this.name = 'PresentationCaptureImportUncertainError';
    this.stage = stage;
    if (
      typeof bookmark === 'string' &&
      bookmark.length <= 1024 &&
      [...bookmark].every((character) => character.charCodeAt(0) >= 32)
    )
      this.importBookmark = bookmark;
  }
}

/** Preempt /query for only the verified native capture DDL; never retry a failed write. */
export async function importPresentationCaptureTrigger(
  statement,
  parameters = [],
  {
    api = productionApi,
    fetchUpload = fetch,
    wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds)),
  } = {}
) {
  const identity = inspectPresentationCaptureTrigger(statement, parameters);
  if (!identity) throw new Error('Only native presentation capture triggers may use SQL import');
  // D1 caches import operations by file ETag. A failed SDK installation may drop
  // its partial trigger set before recreating it, so an earlier completed import
  // is not proof of this installation. A fresh comment changes the file ETag
  // without changing the trigger definition SQLite stores and the SDK verifies.
  const bytes = Buffer.from(
    `-- cinagroup native capture import attempt ${randomUUID()}\n` + statement.trimEnd().replace(/;$/, '') + ';\n'
  );
  const etag = createHash('md5').update(bytes).digest('hex');
  const request = async (action) => {
    try {
      return await api(importPath, 'POST', action);
    } catch {
      throw new PresentationCaptureImportUncertainError(action.action, action.current_bookmark);
    }
  };
  let result = await request({ action: 'init', etag });
  if (!result || typeof result !== 'object' || result.success !== true)
    throw new Error('Native capture import initialization failed');
  if (!Object.hasOwn(result, 'upload_url'))
    throw new PresentationCaptureImportUncertainError('init', result.at_bookmark ?? result.result?.final_bookmark);
  {
    const target = uploadUrl(result.upload_url);
    if (typeof result.filename !== 'string' || !result.filename)
      throw new Error('Native capture import upload filename is missing');
    let response;
    try {
      response = await fetchUpload(target, {
        method: 'PUT',
        headers: { 'Content-Length': String(bytes.length) },
        body: bytes,
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new Error('Native capture import upload response failed');
    }
    if (response?.status !== 200 || response.headers?.get('etag')?.replace(/^"|"$/g, '') !== etag)
      throw new Error('Native capture import upload verification failed');
    result = await request({ action: 'ingest', filename: result.filename, etag });
  }
  for (let attempt = 0; ; attempt++) {
    // A declared terminal error is safe for the initialization lock to record as
    // failed. Other malformed/unknown responses cannot prove ingestion stopped.
    if (result?.type === 'import' && result.status === 'error') throw new Error('Native capture import failed');
    if (
      !result ||
      result.success !== true ||
      result.type !== 'import' ||
      !['active', 'complete'].includes(result.status) ||
      (Object.hasOwn(result, 'errors') && (!Array.isArray(result.errors) || result.errors.length))
    )
      throw new PresentationCaptureImportUncertainError('poll', result?.at_bookmark);
    if (result.status === 'complete') break;
    if (attempt >= 60 || typeof result.at_bookmark !== 'string' || !result.at_bookmark)
      throw new PresentationCaptureImportUncertainError('poll', result.at_bookmark);
    try {
      await wait(1000);
    } catch {
      throw new PresentationCaptureImportUncertainError('poll', result.at_bookmark);
    }
    result = await request({ action: 'poll', current_bookmark: result.at_bookmark });
  }
  const completed = result.result;
  if (
    !completed ||
    completed.num_queries !== 1 ||
    typeof completed.final_bookmark !== 'string' ||
    !completed.final_bookmark ||
    !completed.meta ||
    ['duration', 'rows_read', 'rows_written', 'size_after'].some(
      (name) =>
        typeof completed.meta[name] !== 'number' || !Number.isFinite(completed.meta[name]) || completed.meta[name] < 0
    ) ||
    ['rows_read', 'rows_written', 'size_after'].some((name) => !Number.isSafeInteger(completed.meta[name]))
  )
    throw new PresentationCaptureImportUncertainError('complete', completed?.final_bookmark);
  // The native SDK reads sqlite_master next and compares the actual DDL itself.
  // CREATE TRIGGER returns no rows; preserve import metadata for the D1 driver.
  const changes = Object.hasOwn(completed.meta, 'changes') ? completed.meta.changes : 0;
  const lastRowId = completed.meta.last_row_id ?? null;
  if (
    !Number.isSafeInteger(changes) ||
    changes < 0 ||
    (lastRowId !== null && (!Number.isSafeInteger(lastRowId) || lastRowId < 0))
  )
    throw new PresentationCaptureImportUncertainError('complete', completed.final_bookmark);
  return { success: true, results: [], meta: { ...completed.meta, changes, last_row_id: lastRowId } };
}
