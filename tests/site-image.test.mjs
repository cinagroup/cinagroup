import assert from 'node:assert/strict';
import test from 'node:test';
import { Kysely } from 'kysely';
import { createDialect } from 'emdash/db/sqlite';
import { runMigrations } from 'emdash/db';
import { MediaRepository } from 'emdash';
import { createSiteImageResolver, siteImageFromMedia } from '../src/emdash/site-image.ts';

const image = { id: 'original', src: '/stale.webp', width: 1, height: 1, meta: { storageKey: 'stale.webp' } };
const media = {
  id: 'original',
  status: 'ready',
  mimeType: 'image/webp',
  storageKey: 'site-presentation/v1/hash/workspace.webp',
  width: 1536,
  height: 1024,
  focalX: 0.25,
  focalY: 0.75,
};

test('ready native metadata selects the actual nested media URL and dimensions instead of cached ImageValue fields', () => {
  assert.deepEqual(siteImageFromMedia(image, media), {
    src: '/_emdash/api/media/file/site-presentation/v1/hash/workspace.webp',
    width: 1536,
    height: 1024,
    objectPosition: '25% 75%',
  });
  assert.equal(
    siteImageFromMedia(image, { ...media, storageKey: 'uploads/工作 空间.webp' }).src,
    '/_emdash/api/media/file/uploads/%E5%B7%A5%E4%BD%9C%20%E7%A9%BA%E9%97%B4.webp'
  );
});

test('pending, wrong-id, non-image and protected or noncanonical storage keys never render', () => {
  for (const item of [
    { ...media, status: 'pending' },
    { ...media, status: 'failed' },
    { ...media, id: 'other' },
    { ...media, mimeType: 'text/html' },
    ...[
      '../private.webp',
      'uploads/./x.webp',
      'uploads//x.webp',
      'backups/x.webp',
      'TRANSFERS/x.webp',
      '/x.webp',
      'x%2fprivate.webp',
      'x?key=private',
      'x\\private.webp',
    ].map((storageKey) => ({ ...media, storageKey })),
    null,
  ])
    assert.equal(siteImageFromMedia(image, item), undefined);
});

test('native media updates are fresh across requests while repeated components share only request-local reads', async () => {
  const db = new Kysely({ dialect: createDialect({ url: ':memory:' }) });
  try {
    await runMigrations(db);
    const repository = new MediaRepository(db);
    const saved = await repository.create({
      filename: 'workspace.webp',
      mimeType: 'image/webp',
      storageKey: media.storageKey,
      status: 'ready',
      width: 1536,
      height: 1024,
    });
    let reads = 0;
    const resolve = createSiteImageResolver(async (id) => {
      reads++;
      return repository.findById(id);
    });
    const value = { ...image, id: saved.id };
    const request = {};
    const first = await resolve(value, '/fallback.webp', request);
    assert.equal(first.src, '/_emdash/api/media/file/' + media.storageKey);
    assert.deepEqual(await resolve(value, '/fallback.webp', request), first);
    assert.equal(reads, 1);
    await repository.update(saved.id, { focalX: 0.1, focalY: 0.9 });
    assert.equal((await resolve(value, '/fallback.webp', {})).objectPosition, '10% 90%');
    assert.equal(reads, 2);
    assert.equal((await resolve({ id: 'missing' }, '/fallback.webp', {})).src, '/fallback.webp');
    assert.equal((await resolve({ ...value, provider: 'external' }, '/fallback.webp', {})).src, '/fallback.webp');
  } finally {
    await db.destroy();
  }
});
