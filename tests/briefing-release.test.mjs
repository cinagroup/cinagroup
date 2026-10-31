import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { verifyBriefingRelease } from '../scripts/verify-briefing-release.mjs';

const path = 'src/data/post/ai-news-briefing-2026-10-17-18.md';
const read = () => Buffer.from('reviewed content');
const hash = createHash('sha256').update(read()).digest('hex');
const row = (status) => `| [ai-news-briefing-2026-10-17-18.md](../${path}) | 0 | ${status} |`;
const approved = `approved; sha256=${hash}; reviewer=editor; reviewed=2026-10-30`;

test('release requires a recorded approval for the exact briefing content', () => {
  assert.equal(verifyBriefingRelease([path], row(approved), read), 1);
  assert.throws(() => verifyBriefingRelease([path], row('pending'), read), /Missing complete review approval/);
  assert.throws(() => verifyBriefingRelease([path], '', read), /Missing complete review approval/);
  assert.throws(() => verifyBriefingRelease([path], row(approved), () => Buffer.from('changed')), /does not match/);
  assert.throws(() => verifyBriefingRelease([path], row(approved) + '\n' + row(approved), read), /Duplicate/);
});
