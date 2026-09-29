import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { validateSeed } from 'emdash/seed';

import {
  markdownToPortableText,
  PilotError,
  prepareMarkdownSource,
  preparePilot,
} from '../scripts/prepare-emdash-pilot.mjs';

const SAMPLE_PATH = 'src/content/blog/example-zh.md';
const markdown = (more = '', body = '# Heading\n\nA **reviewed** [source](https://www.cloudflare.com/news/).\n') =>
  `---\nstatus: published\norigin: editorial\nlanguage: zh-CN\ntranslationKey: example\ntitle: Example\npublishDate: 2026-09-01T00:00:00.000Z\n${more}---\n\n${body}`;

test('real pilot produces valid EmDash seed entries that remain drafts', () => {
  const { seed, report, warnings } = preparePilot();
  assert.deepEqual(warnings, []);
  assert.deepEqual(validateSeed(seed).errors, []);
  assert.equal(seed.content.posts.length, 3);
  assert.equal(report.length, 3);
  for (const entry of seed.content.posts) {
    assert.equal(entry.status, 'draft');
    assert.equal(entry.data.editorial_status, 'in_review');
    assert.ok(entry.data.content.length > 0);
    assert.match(entry.data.legacy_source_hash, /^[a-f0-9]{64}$/);
  }
  assert.equal(seed.content.posts[0].data.legacy_status, 'published');
  assert.equal(seed.content.posts[0].locale, 'zh');
  const table = seed.content.posts[0].data.content.find((block) => block._type === 'table');
  assert.equal(table.rows.length, 8);
  assert.equal(table.rows[0].cells.length, 3);
  assert.match(table.rows[1].cells[0].content.map((span) => span.text).join(''), /OpenAI IPO/);
  assert.ok(seed.content.posts[1].data.content.some((block) => block._type === 'break'));
  assert.equal(seed.content.posts[2].translationOf, seed.content.posts[1].id);
  assert.equal(seed.content.posts[2].locale, 'ja');
  assert.equal(report[0].canonical, 'https://cinagroup.com/zh/blog/news-briefing-2026-06-15-06-zh/');
  assert.equal(report[0].sourceCount, 0);
});

test('maps locale, citation, review, verification and provenance without authorizing publication', () => {
  const source = markdown(
    `sources:\n  - title: Official\n    url: https://www.cloudflare.com/news/\n    kind: primary\nverification:\n  status: fact_checked\n  verifiedBy: Researcher\n  verifiedAt: 2026-09-02\nreview:\n  status: approved\n  reviewedBy: Editor\n  reviewedAt: 2026-09-03\nmetadata:\n  canonical: https://cinagroup.com/zh/blog/example-zh/\n`
  );
  const { entry, report } = prepareMarkdownSource(source, SAMPLE_PATH);
  assert.equal(entry.slug, 'example-zh');
  assert.equal(entry.locale, 'zh');
  assert.equal(entry.status, 'draft');
  assert.equal(entry.data.editorial_status, 'in_review');
  assert.equal(entry.data.legacy_status, 'published');
  assert.equal(entry.data.translation_key, 'example');
  assert.equal(entry.data.sources[0].kind, 'primary');
  assert.equal(entry.data.review_status, 'approved');
  assert.equal(entry.data.reviewed_by, 'Editor');
  assert.equal(entry.data.verification_status, 'fact_checked');
  assert.equal(entry.data.verified_by, 'Researcher');
  assert.equal(report.canonical, 'https://cinagroup.com/zh/blog/example-zh/');
  assert.deepEqual(prepareMarkdownSource(source, SAMPLE_PATH).entry, entry);
});

test('rejects unsupported Markdown rather than silently flattening it', () => {
  for (const body of [
    '<div>unmapped HTML</div>',
    '![image](https://example.org/image.png)',
    'Text with a footnote[^1].\n\n[^1]: Citation.',
    '- [x] Complete',
  ]) {
    assert.throws(() => markdownToPortableText(body, SAMPLE_PATH), PilotError, body);
  }
});

test('rejects route, locale, status and canonical conflicts', () => {
  assert.throws(
    () =>
      prepareMarkdownSource(
        markdown('metadata:\n  canonical: https://cinagroup.com/ja/blog/example-zh/\n'),
        SAMPLE_PATH
      ),
    /canonical conflicts/
  );
  assert.throws(
    () => prepareMarkdownSource(markdown().replace('language: zh-CN', 'language: ja'), SAMPLE_PATH),
    /slug suffix zh conflicts/
  );
  assert.throws(
    () => prepareMarkdownSource(markdown().replace('status: published', 'status: unknown'), SAMPLE_PATH),
    /unsupported status/
  );
  assert.throws(() => prepareMarkdownSource(markdown(), 'src/content/blog/Example-zh.md'), /unsupported slug/);
  assert.throws(
    () => prepareMarkdownSource(markdown(), 'src/content/blog/ai-news-briefing-2026-03-20.md'),
    /immutable archives/
  );
  assert.throws(
    () =>
      preparePilot([
        'src/content/blog/news-briefing-2026-03-20-zh.md',
        'src/content/blog/news-briefing-2026-03-20-zh.md',
      ]),
    /duplicate slug\/locale/
  );
});

test('pilot excludes immutable English archives and prevents unsupported metadata loss', () => {
  assert.throws(() => preparePilot(['src/data/post/ai-news-briefing-2026-03-20.md']), /immutable archives/);
  assert.throws(
    () => prepareMarkdownSource(markdown('unmappedField: present\n'), SAMPLE_PATH),
    /unsupported frontmatter fields/
  );
  assert.throws(
    () => prepareMarkdownSource(markdown('image: /assets/example.jpg\n'), SAMPLE_PATH),
    /explicit media mapping/
  );
  const article = readFileSync('src/content/blog/news-briefing-2026-03-20-zh.md', 'utf8');
  assert.match(article, /translationKey:/);
});
