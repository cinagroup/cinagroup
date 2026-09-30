import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Cloudflare Worker Tail API: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/tail/
// The installed Wrangler 4.127.1 sends { filters: [{ method: [...] }] }, uses trace-v1,
// and sends { debug: false } after the WebSocket opens. Never print the tail URL.
const API_ORIGIN = 'https://api.cloudflare.com';
const ACCOUNT_ID = '7ea8e46d8210bad342fa7595f7935fea';
const WORKER_NAME = 'cinagroup-emdash-preview';
const PREVIEW_ORIGIN = 'https://cinagroup-emdash-preview.cinagroup.workers.dev';
const EXPECTED_VERSION = '8a486133-6176-43ed-9812-eabd5b2969b0';
const EXPECTED_DB = '050ec919-1b18-4de8-86a8-62c16c28e59c';
const EXPECTED_CONTACT_DB = 'a24a999d-f784-4ee1-8dcd-888a7be43e7c';
const EXPECTED_MEDIA = 'cinagroup-emdash-media-preview';
const API_PREFIX = `/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}`;
const PATHS = ['/', '/ko/blog/', '/fr/blog/', '/zh/blog/'];
const PROBES = Object.freeze(
  PATHS.flatMap((path) => ['GET', 'HEAD'].map((method) => ({ method, path, url: `${PREVIEW_ORIGIN}${path}` })))
);
const PROBE_KEYS = new Set(PROBES.map(({ method, url }) => `${method} ${url}`));
const KNOWN_OUTCOMES = new Set(['ok', 'exception', 'canceled', 'exceededCpu', 'exceededMemory', 'unknown']);
const KNOWN_EXCEPTION_NAMES = new Set([
  'Error',
  'TypeError',
  'ReferenceError',
  'RangeError',
  'SyntaxError',
  'DOMException',
  'D1Error',
  'SqliteError',
  'DatabaseError',
]);
const KNOWN_EXCEPTION_CODES = new Set([
  'D1_ERROR',
  'SQLITE_ERROR',
  'SQLITE_MISUSE',
  'SQLITE_BUSY',
  'ERR_MODULE_NOT_FOUND',
  'ERR_INVALID_ARG_TYPE',
]);
const ASTRO_500_PREFIX = '[cinagroup-preview-500] ';
const ASTRO_500_CATEGORIES = new Set([
  'no_error',
  'cross_request_io',
  'global_scope_io',
  'resource_limit',
  'binding_missing',
  'database',
  'module_resolution',
  'astro_route',
  'unknown',
]);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TAIL_ID = /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i;

class SafeDiagnosticError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const fail = (code) => {
  throw new SafeDiagnosticError(code);
};
const safeStatus = (value) => (Number.isInteger(value) && value >= 100 && value <= 599 ? value : null);
const safeId = (value) => typeof value === 'string' && value === value.trim() && UUID.test(value);

function stageFromText(texts) {
  for (const text of texts) {
    if (typeof text !== 'string') continue;
    if (text.startsWith(ASTRO_500_PREFIX)) return 'astro_500';
    if (text.includes('Cannot perform I/O on behalf of a different request')) return 'cross_request_io';
    if (
      text.includes('Disallowed operation called within global scope') ||
      (text.includes('global scope') && text.includes('I/O'))
    )
      return 'global_scope_io';
    if (text.includes('exceeded resource limits') || text.includes('resource exceeded')) return 'resource_limit';
    if (text.includes('Setup probe failed (non-fatal):') || text.includes('Setup middleware error:'))
      return 'setup_probe';
    if (
      text.includes('[emdash] database schema is unavailable in manual migration mode:') ||
      text.includes('[emdash] database migrations are pending:')
    )
      return 'database_schema';
    if (text.includes('[emdash] runtime init failed (page renders without CMS data):')) return 'runtime_init';
    if (text.includes('EmDash middleware error:')) return 'emdash_middleware';
    if (
      text.includes('Unable to load the published EmDash blog index') ||
      text.includes('Unable to add published EmDash posts to the blog index')
    )
      return 'cms_blog_index';
    if (text.includes('D1_ERROR') || text.includes('SQLITE_ERROR') || text.includes('no such table')) return 'database';
    if (text.includes('AstroError') || text.includes('Astro rendering')) return 'astro';
  }
  return 'unknown';
}

function safeAstro500(texts) {
  for (const text of texts) {
    if (typeof text !== 'string' || !text.startsWith(ASTRO_500_PREFIX) || text.length > 4096) continue;
    let candidate;
    try {
      candidate = JSON.parse(text.slice(ASTRO_500_PREFIX.length));
    } catch {
      continue;
    }
    if (!candidate || !ASTRO_500_CATEGORIES.has(candidate.category)) continue;
    const errorName =
      KNOWN_EXCEPTION_NAMES.has(candidate.errorName) || candidate.errorName === 'AstroError'
        ? candidate.errorName
        : 'Other';
    const errorCode =
      KNOWN_EXCEPTION_CODES.has(candidate.errorCode) || candidate.errorCode === 'BINDING_NOT_FOUND'
        ? candidate.errorCode
        : Number.isInteger(candidate.errorCode) && candidate.errorCode >= 0 && candidate.errorCode <= 9999
          ? candidate.errorCode
          : null;
    const workerLine =
      Number.isInteger(candidate.workerLine) && candidate.workerLine > 0 && candidate.workerLine <= 10_000_000
        ? candidate.workerLine
        : null;
    const workerColumn =
      Number.isInteger(candidate.workerColumn) && candidate.workerColumn > 0 && candidate.workerColumn <= 100_000
        ? candidate.workerColumn
        : null;
    return { category: candidate.category, errorName, errorCode, workerLine, workerColumn };
  }
  return null;
}

function safeException(exception) {
  if (!exception || typeof exception !== 'object') return null;
  const name = KNOWN_EXCEPTION_NAMES.has(exception.name) ? exception.name : 'Other';
  const code = KNOWN_EXCEPTION_CODES.has(exception.code)
    ? exception.code
    : Number.isInteger(exception.code) && exception.code >= 0 && exception.code <= 9999
      ? exception.code
      : null;
  return { name, code };
}

/** Discard all other tail events, including same-path URLs with query strings or another host. */
export function summarizeTailEvent(trace) {
  if (!trace || typeof trace !== 'object') return null;
  if (trace.scriptName && trace.scriptName !== WORKER_NAME) return null;
  const request = trace.event?.request;
  if (!request || !PROBE_KEYS.has(`${request.method} ${request.url}`)) return null;
  const logs = Array.isArray(trace.logs) ? trace.logs : [];
  const logTexts = [];
  let errorLogCount = 0;
  let warningLogCount = 0;
  for (const log of logs) {
    if (log?.level === 'error') errorLogCount += 1;
    if (log?.level === 'warn') warningLogCount += 1;
    for (const item of Array.isArray(log?.message) ? log.message : [log?.message]) {
      if (typeof item === 'string') logTexts.push(item);
      else if (item && typeof item === 'object' && typeof item.message === 'string') logTexts.push(item.message);
    }
  }
  const exceptions = Array.isArray(trace.exceptions) ? trace.exceptions : [];
  const firstException = exceptions.length > 0 ? safeException(exceptions[0]) : null;
  const astro500 = safeAstro500(logTexts);
  const stageFromLogs = stageFromText([...logTexts, ...exceptions.map((item) => item?.message)]);
  const stage =
    stageFromLogs === 'unknown' && ['exceededCpu', 'exceededMemory'].includes(trace.outcome)
      ? 'resource_limit'
      : stageFromLogs;
  return {
    method: request.method,
    path: new URL(request.url).pathname,
    outcome: KNOWN_OUTCOMES.has(trace.outcome) ? trace.outcome : 'unknown',
    responseStatus: safeStatus(trace.event?.response?.status),
    stage,
    logCount: logs.length,
    errorLogCount,
    warningLogCount,
    astro500,
    exceptionName: firstException?.name ?? null,
    exceptionCode: firstException?.code ?? null,
  };
}

export function projectDeployment(result) {
  const active = result?.deployments?.[0];
  if (!active || !Array.isArray(active.versions) || active.versions.length < 1 || active.versions.length > 5)
    fail('invalid_deployment_inventory');
  const activeVersions = active.versions.map(({ version_id: versionId, percentage }) => {
    if (!safeId(versionId) || typeof percentage !== 'number' || percentage <= 0 || percentage > 100)
      fail('invalid_deployment_inventory');
    return { versionId, percentage };
  });
  return {
    activeVersions,
    matchesExpectedVersion: activeVersions.some(({ versionId }) => versionId === EXPECTED_VERSION),
  };
}

export function projectSettings(result) {
  if (!result || !Array.isArray(result.bindings)) fail('invalid_worker_settings');
  const bindings = result.bindings;
  const only = (name, predicate) =>
    bindings.filter((item) => item?.name === name).length === 1 &&
    bindings.some((item) => item?.name === name && predicate(item));
  return {
    dbExpected: only('DB', (item) => item.type === 'd1' && item.database_id === EXPECTED_DB),
    contactDbExpected: only('CONTACT_DB', (item) => item.type === 'd1' && item.database_id === EXPECTED_CONTACT_DB),
    mediaExpected: only('MEDIA', (item) => item.type === 'r2_bucket' && item.bucket_name === EXPECTED_MEDIA),
    sessionPresent: only(
      'SESSION',
      (item) =>
        item.type === 'kv_namespace' &&
        typeof item.namespace_id === 'string' &&
        /^[a-f0-9]{32}$/i.test(item.namespace_id)
    ),
    assetsPresent: only('ASSETS', (item) => item.type === 'assets'),
    imagesPresent: only('IMAGES', (item) => item.type === 'images'),
    secretBindingCount: bindings.filter((item) => item?.type === 'secret_text' || item?.type === 'secret_key').length,
  };
}

function waitForOpen(socket, timeoutMs) {
  return new Promise((resolveOpen, rejectOpen) => {
    const timer = setTimeout(() => finish(false), timeoutMs);
    const onOpen = () => finish(true);
    const onFail = () => finish(false);
    function finish(success) {
      clearTimeout(timer);
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('error', onFail);
      socket.removeEventListener('close', onFail);
      if (success) resolveOpen();
      else rejectOpen(new SafeDiagnosticError('tail_websocket_unavailable'));
    }
    socket.addEventListener('open', onOpen);
    socket.addEventListener('error', onFail);
    socket.addEventListener('close', onFail);
  });
}

/** Remote diagnostic is fixed to one preview Worker and fixed anonymous public URLs. */
export async function diagnoseEmDashPublic({
  accountId,
  token,
  fetchImpl = fetch,
  WebSocketImpl = WebSocket,
  captureMs = 20000,
} = {}) {
  if (accountId !== ACCOUNT_ID) fail('wrong_preview_account');
  if (typeof token !== 'string' || token !== token.trim() || !/^[\x21-\x7e]{1,4096}$/.test(token))
    fail('missing_or_invalid_token');
  if (!Number.isInteger(captureMs) || captureMs < 0 || captureMs > 25000) fail('invalid_capture_window');
  const authorization = `Bearer ${token}`;

  async function api(path, method = 'GET', body) {
    let response;
    try {
      response = await fetchImpl(`${API_ORIGIN}${API_PREFIX}${path}`, {
        method,
        redirect: 'error',
        headers: {
          Authorization: authorization,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      fail(
        method === 'POST'
          ? 'tail_create_outcome_unknown'
          : method === 'DELETE'
            ? 'tail_cleanup_failed'
            : 'inventory_request_failed'
      );
    }
    if (!response.ok)
      fail(
        method === 'POST'
          ? 'tail_create_outcome_unknown'
          : method === 'DELETE'
            ? 'tail_cleanup_failed'
            : response.status === 403
              ? 'inventory_permission_limited'
              : 'inventory_http_error'
      );
    let payload;
    try {
      payload = await response.json();
    } catch {
      fail(
        method === 'POST'
          ? 'tail_create_outcome_unknown'
          : method === 'DELETE'
            ? 'tail_cleanup_failed'
            : 'inventory_invalid_response'
      );
    }
    if (payload?.success !== true)
      fail(
        method === 'POST'
          ? 'tail_create_outcome_unknown'
          : method === 'DELETE'
            ? 'tail_cleanup_failed'
            : 'inventory_rejected'
      );
    return payload.result;
  }

  const deployment = projectDeployment(await api('/deployments?page=1&per_page=1'));
  const settings = projectSettings(await api('/settings'));
  let tailId = null;
  let socket = null;
  let failure = null;
  let report = null;
  let cleanup = 'not_started';
  try {
    const tail = await api('/tails', 'POST', { filters: [{ method: ['GET', 'HEAD'] }] });
    if (typeof tail?.id !== 'string' || tail.id !== tail.id.trim() || !TAIL_ID.test(tail.id))
      fail('tail_create_outcome_unknown');
    tailId = tail.id;
    let tailUrl;
    try {
      tailUrl = new URL(tail.url);
    } catch {
      fail('tail_invalid_websocket_url');
    }
    if (tailUrl.protocol !== 'wss:' || !tailUrl.hostname || tailUrl.username || tailUrl.password || tailUrl.hash)
      fail('tail_invalid_websocket_url');
    try {
      socket = new WebSocketImpl(tailUrl.href, 'trace-v1');
    } catch {
      fail('tail_websocket_unavailable');
    }
    const captured = new Map();
    const pendingFrames = new Set();
    async function readFrame(data) {
      if (typeof data === 'string') return data.length <= 256_000 ? data : null;
      if (data instanceof Blob) return data.size <= 256_000 ? data.text() : null;
      const bytes =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : ArrayBuffer.isView(data)
            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            : null;
      if (!bytes || bytes.byteLength > 256_000) return null;
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    async function consumeFrame(data) {
      let raw;
      try {
        raw = await readFrame(data);
      } catch {
        return;
      }
      if (raw === null) return;
      let trace;
      try {
        trace = JSON.parse(raw);
      } catch {
        return;
      }
      for (const item of Array.isArray(trace) ? trace : [trace]) {
        const safe = summarizeTailEvent(item);
        if (!safe) continue;
        const key = `${safe.method} ${PREVIEW_ORIGIN}${safe.path}`;
        const prior = captured.get(key) ?? [];
        if (prior.length < 2) captured.set(key, [...prior, safe]);
      }
    }
    socket.addEventListener('message', (message) => {
      if (pendingFrames.size >= 64) return;
      const task = consumeFrame(message.data);
      pendingFrames.add(task);
      void task.finally(() => pendingFrames.delete(task));
    });
    await waitForOpen(socket, 5000);
    try {
      socket.send(JSON.stringify({ debug: false }));
    } catch {
      fail('tail_websocket_unavailable');
    }
    const probes = await Promise.all(
      PROBES.map(async ({ method, path, url }) => {
        try {
          const response = await fetchImpl(url, { method, redirect: 'manual', signal: AbortSignal.timeout(8000) });
          // Drain without retaining page content; canceling a healthy response can skew the tail outcome.
          if (response.body) {
            try {
              for await (const _chunk of response.body) {
                void _chunk;
              }
            } catch {
              /* status is still useful */
            }
          }
          return { method, path, status: safeStatus(response.status), networkError: false };
        } catch {
          return { method, path, status: null, networkError: true };
        }
      })
    );
    await new Promise((resolveDelay) => setTimeout(resolveDelay, captureMs));
    await Promise.allSettled([...pendingFrames]);
    report = {
      deployment,
      settings,
      probes: probes.map((probe) => ({
        ...probe,
        tail: captured.get(`${probe.method} ${PREVIEW_ORIGIN}${probe.path}`) ?? [],
      })),
    };
  } catch (error) {
    failure = error instanceof SafeDiagnosticError ? error : new SafeDiagnosticError('diagnostic_failed');
  } finally {
    try {
      socket?.close();
    } catch {
      // The ephemeral Tail is still deleted below.
    }
    if (tailId) {
      try {
        await api(`/tails/${tailId}`, 'DELETE');
        cleanup = 'deleted';
      } catch {
        cleanup = 'failed';
      }
    }
  }
  if (failure) {
    failure.cleanup = cleanup;
    throw failure;
  }
  if (cleanup !== 'deleted') fail('tail_cleanup_failed');
  return {
    ...report,
    cleanup,
    tailComplete: report.probes.every((probe) => probe.networkError || probe.tail.length > 0),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== '--run') fail('explicit_run_flag_required');
    const report = await diagnoseEmDashPublic({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      token: process.env.CLOUDFLARE_API_TOKEN,
    });
    await new Promise((resolveWrite) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`, resolveWrite));
    // The temporary Tail has already been deleted; a closing WebSocket can still
    // keep Node alive while waiting for its peer's close handshake.
    process.exit(report.tailComplete ? 0 : 1);
  } catch (error) {
    const code = error instanceof SafeDiagnosticError ? error.code : 'diagnostic_failed';
    const cleanup = error instanceof SafeDiagnosticError ? error.cleanup : undefined;
    await new Promise((resolveWrite) =>
      process.stderr.write(`${JSON.stringify({ error: code, ...(cleanup ? { cleanup } : {}) })}\n`, resolveWrite)
    );
    process.exit(1);
  }
}
