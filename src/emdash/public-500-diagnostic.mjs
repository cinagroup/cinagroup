// Project the error object available to 500.astro without returning messages, paths, or stacks.
const ERROR_NAMES = new Set([
  'Error',
  'TypeError',
  'ReferenceError',
  'RangeError',
  'SyntaxError',
  'DOMException',
  'D1Error',
  'SqliteError',
  'AstroError',
]);
const ERROR_CODES = new Set([
  'D1_ERROR',
  'SQLITE_ERROR',
  'SQLITE_MISUSE',
  'SQLITE_BUSY',
  'BINDING_NOT_FOUND',
  'ERR_MODULE_NOT_FOUND',
  'ERR_INVALID_ARG_TYPE',
]);
const WORKER_FRAME =
  /(?:^|[\s(/\\])(?:_worker|worker|index|entry|chunks\/[A-Za-z0-9_-]{1,120})\.m?js:(\d{1,7}):(\d{1,5})(?=$|[\s)])/m;

function property(error, key) {
  if (error === null || (typeof error !== 'object' && typeof error !== 'function')) return undefined;
  try {
    return error[key];
  } catch {
    return undefined;
  }
}

function categoryFromText(text, code) {
  if (text.includes('Cannot perform I/O on behalf of a different request')) return 'cross_request_io';
  if (
    text.includes('Disallowed operation called within global scope') ||
    (text.includes('global scope') && text.includes('I/O'))
  )
    return 'global_scope_io';
  if (
    text.includes('exceeded resource limits') ||
    text.includes('exceeded CPU time') ||
    text.includes('exceeded memory')
  )
    return 'resource_limit';
  if (code === 'BINDING_NOT_FOUND' || (text.includes('ASSETS') && text.includes('binding'))) return 'binding_missing';
  if (code === 'D1_ERROR' || code === 'SQLITE_ERROR' || text.includes('no such table')) return 'database';
  if (code === 'ERR_MODULE_NOT_FOUND' || text.includes('Unable to resolve') || text.includes('Cannot find module'))
    return 'module_resolution';
  if (
    text.includes('AstroError') ||
    text.includes('component instance for route') ||
    text.includes("Astro couldn't find the correct page")
  )
    return 'astro_route';
  return 'unknown';
}

export function classifyPublic500(error) {
  const rawName = property(error, 'name');
  const rawCode = property(error, 'code');
  const rawMessage = property(error, 'message');
  const rawStack = property(error, 'stack');
  const errorName = ERROR_NAMES.has(rawName) ? rawName : 'Other';
  const errorCode = ERROR_CODES.has(rawCode)
    ? rawCode
    : Number.isInteger(rawCode) && rawCode >= 0 && rawCode <= 9999
      ? rawCode
      : null;
  const message = typeof rawMessage === 'string' ? rawMessage.slice(0, 8192) : '';
  const stack = typeof rawStack === 'string' ? rawStack.slice(0, 8192) : '';
  const match = WORKER_FRAME.exec(stack);
  const workerLine = match ? Number(match[1]) : null;
  const workerColumn = match ? Number(match[2]) : null;
  return {
    category: error === undefined || error === null ? 'no_error' : categoryFromText(`${message}\n${stack}`, errorCode),
    errorName,
    errorCode,
    workerLine: workerLine && workerLine <= 10_000_000 ? workerLine : null,
    workerColumn: workerColumn && workerColumn <= 100_000 ? workerColumn : null,
  };
}
