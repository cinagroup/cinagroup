import assert from 'node:assert/strict';
import test from 'node:test';
import { publicPostSeo } from '../src/emdash/post-seo.ts';

test('editor SEO overrides preserve text and only site-owned destinations', () => {
  const seo = publicPostSeo({
    title: 'Editor title',
    description: 'Editor description',
    image: '/_emdash/api/media/file/image.webp',
    canonical: '/blog/article/',
    noIndex: true,
  });
  assert.equal(seo.title, 'Editor title');
  assert.equal(seo.description, 'Editor description');
  assert.equal(seo.image, 'https://cinagroup.com/_emdash/api/media/file/image.webp');
  assert.equal(seo.canonical, 'https://cinagroup.com/blog/article/');
  assert.equal(seo.noIndex, true);
});

test('invalid SEO destinations never emit executable, external, credential or protocol-relative URLs', () => {
  for (const value of [
    'javascript:alert(1)',
    'https://other.example/file',
    '//other.example/file',
    'https://user:password@cinagroup.com/file',
    'https://cinagroup.com\\evil.test/path',
  ]) {
    assert.equal(publicPostSeo({ image: value, canonical: value }).image, undefined, value);
    assert.equal(publicPostSeo({ image: value, canonical: value }).canonical, undefined, value);
  }
  assert.equal(publicPostSeo({ title: 'a\u0000b', description: 'a'.repeat(2001) }).title, undefined);
  assert.equal(publicPostSeo({ noIndex: 'false' }).noIndex, false);
});

test('native SEO media IDs resolve to the canonical public media endpoint', () => {
  assert.equal(publicPostSeo({ image: '01K00000000000000000000000' }).imageMediaId, '01K00000000000000000000000');
  assert.equal(publicPostSeo({ image: '01K00000000000000000000000' }).image, undefined);
});
