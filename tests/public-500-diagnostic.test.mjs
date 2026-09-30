import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyPublic500 } from '../src/emdash/public-500-diagnostic.mjs';

const PRIVATE = 'private-person@example.test';
const TOKEN = 'NEVER-PRINT-TOKEN';

test('classifies a caught cross-request I/O error without leaking message, URL, or stack', () => {
  const error = Object.assign(
    new TypeError(`Cannot perform I/O on behalf of a different request ${PRIVATE} ${TOKEN}`),
    {
      code: 'D1_ERROR',
    }
  );
  error.stack = `TypeError: ${error.message}\n    at load (file:///worker.js:12345:67)\n    at https://private.example.test/${TOKEN}`;
  assert.deepEqual(classifyPublic500(error), {
    category: 'cross_request_io',
    errorName: 'TypeError',
    errorCode: 'D1_ERROR',
    workerLine: 12345,
    workerColumn: 67,
  });
  for (const secret of [PRIVATE, TOKEN, 'private.example.test']) {
    assert.ok(!JSON.stringify(classifyPublic500(error)).includes(secret));
  }
});

test('returns only fixed categories and rejects arbitrary names, codes, and source paths', () => {
  const error = {
    name: `Secret ${PRIVATE}`,
    code: TOKEN,
    message: `Cannot find module ${TOKEN}`,
    stack: `at load (https://private.example.test/source.js:44:9)`,
  };
  assert.deepEqual(classifyPublic500(error), {
    category: 'module_resolution',
    errorName: 'Other',
    errorCode: null,
    workerLine: null,
    workerColumn: null,
  });
  assert.equal(classifyPublic500(null).category, 'no_error');
  assert.equal(classifyPublic500({ message: 'no such table: options' }).category, 'database');
  assert.equal(classifyPublic500({ code: 'BINDING_NOT_FOUND' }).category, 'binding_missing');
});

test('a hostile thrown object cannot break the diagnostics route', () => {
  const hostile = {
    get message() {
      throw new Error(TOKEN);
    },
    get stack() {
      throw new Error(PRIVATE);
    },
  };
  const output = classifyPublic500(hostile);
  assert.equal(output.category, 'unknown');
  assert.ok(!JSON.stringify(output).includes(TOKEN));
  assert.ok(!JSON.stringify(output).includes(PRIVATE));
});

test('compiled module frames expose only numeric offsets', () => {
  const error = new TypeError('private body');
  error.stack = 'TypeError: private body\n    at handler (chunks/astro_BuildPrivate.mjs:24681:29)';
  const result = classifyPublic500(error);
  assert.equal(result.workerLine, 24681);
  assert.equal(result.workerColumn, 29);
  assert.ok(!JSON.stringify(result).includes('BuildPrivate'));
  assert.ok(!JSON.stringify(result).includes('private body'));
});
