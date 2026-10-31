import assert from 'node:assert/strict';
import test from 'node:test';

import { archiveMonths, isArchiveIndex, searchArchive } from '../src/utils/blog-archive-search.ts';

const entry = (title, excerpt, date) => ({ title, excerpt, date, url: '/blog/example/', displayDate: date });
const entries = [
  entry('OpenAI releases agents', 'Tool support', '2026-11-01'),
  entry('Google agents', 'OpenAI integration', '2026-10-31'),
  entry('OpenAI morning briefing', 'Tools for agents', '2026-10-31'),
  entry('Research update', 'Open models', '2026-04-01'),
];

test('month options include only available calendar months with counts, newest first', () => {
  assert.deepEqual(archiveMonths(entries), [
    { value: '2026-11', count: 1 },
    { value: '2026-10', count: 2 },
    { value: '2026-04', count: 1 },
  ]);
  assert.deepEqual(archiveMonths([]), []);
});

test('all words match across titles and summaries, independent of case, order and whitespace', () => {
  assert.deepEqual(searchArchive(entries, '  AGENTS   OpenAI ', '2026-10', 'newest'), [entries[1], entries[2]]);
  assert.deepEqual(searchArchive(entries, 'agents impossible', '', 'newest'), []);
});

test('oldest order reverses publication order, including same-day morning and evening editions', () => {
  const original = structuredClone(entries);
  assert.deepEqual(searchArchive(entries, '', '2026-10', 'oldest'), [entries[2], entries[1]]);
  assert.deepEqual(searchArchive(entries, '', '', 'oldest'), [...entries].reverse());
  assert.deepEqual(entries, original);
});

test('month filtering is exact and empty filters preserve the full public index', () => {
  assert.deepEqual(searchArchive(entries, '', '2026-01', 'newest'), []);
  assert.deepEqual(searchArchive(entries, '', '', 'newest'), entries);
});

test('invalid successful responses, malformed fields and unsafe URLs cannot enter the index cache', () => {
  const valid = entry('Briefing', 'Summary', '2026-10-31');
  valid.url = '/blog/ai-news-briefing-2026-10-31-06/';
  assert.equal(isArchiveIndex([valid]), true);
  assert.equal(isArchiveIndex([]), true);
  for (const value of [
    {},
    null,
    [null],
    [{ ...valid, excerpt: null }],
    [{ ...valid, url: 'javascript:alert(1)' }],
    [{ ...valid, date: '2026-13-31' }],
  ]) {
    assert.equal(isArchiveIndex(value), false);
  }
});
