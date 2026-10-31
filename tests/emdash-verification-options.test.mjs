import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseVerificationOptions } from '../scripts/emdash-verification-options.mjs';

test('migration parity is explicit and restricted to staging verification', () => {
  assert.deepEqual(parseVerificationOptions([]), { staging: false, migrationParity: false });
  assert.deepEqual(parseVerificationOptions(['--staging']), { staging: true, migrationParity: false });
  assert.deepEqual(parseVerificationOptions(['--staging', '--migration-parity']), {
    staging: true,
    migrationParity: true,
  });
  assert.throws(() => parseVerificationOptions(['--migration-parity']));
  assert.throws(() => parseVerificationOptions(['--staging', '--staging']));
  assert.throws(() => parseVerificationOptions(['--stagin']));
});
