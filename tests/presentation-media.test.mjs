import assert from 'node:assert/strict';
import test from 'node:test';
import { Kysely } from 'kysely';
import { createDialect } from 'emdash/db/sqlite';
import { runMigrations } from 'emdash/db';
import { MediaRepository } from 'emdash';
import { createPresentationMediaResolver } from '../src/emdash/presentation-media.ts';

async function withMedia(callback) {
  const db = new Kysely({ dialect: createDialect({ url: ':memory:' }) });
  try {
    await runMigrations(db);
    const repository = new MediaRepository(db);
    await callback(
      repository,
      createPresentationMediaResolver((id) => repository.findById(id))
    );
  } finally {
    await db.destroy();
  }
}

const createImage = (repository, changes = {}) =>
  repository.create({
    filename: 'cinagroup-horizontal-white.png',
    storageKey: 'site-presentation/v1/hash/cinagroup-horizontal-white.png',
    mimeType: 'image/png',
    width: 832,
    height: 288,
    alt: 'Official white wordmark',
    status: 'ready',
    ...changes,
  });

test('native editor image values without src resolve the selected current media row', async () => {
  await withMedia(async (repository, resolve) => {
    const saved = await createImage(repository);
    assert.deepEqual(
      await resolve({
        id: saved.id,
        provider: 'local',
        filename: saved.filename,
        meta: { storageKey: saved.storageKey },
      }),
      {
        url: '/_emdash/api/media/file/site-presentation/v1/hash/cinagroup-horizontal-white.png',
        width: 832,
        height: 288,
        alt: 'Official white wordmark',
        contentType: 'image/png',
      }
    );
  });
});

test('native ids override stale or forged src, URL, dimensions and storage metadata snapshots', async () => {
  await withMedia(async (repository, resolve) => {
    const saved = await createImage(repository, {
      storageKey: 'uploads/白字 logo+v2.svg',
      mimeType: 'image/svg+xml',
      width: 1024,
      height: 320,
    });
    const result = await resolve({
      id: saved.id,
      provider: 'local',
      alt: 'Edited logo alt',
      src: 'https://external.example/forged.png',
      url: '/wrong-logo.png',
      width: 1,
      height: 1,
      contentType: 'text/html',
      meta: { storageKey: 'backups/private.png' },
    });
    assert.deepEqual(result, {
      url: '/_emdash/api/media/file/uploads/%E7%99%BD%E5%AD%97%20logo+v2.svg',
      width: 1024,
      height: 320,
      alt: 'Edited logo alt',
      contentType: 'image/svg+xml',
    });
  });
});

test('unavailable, non-image and protected media never fall back to native value snapshots', async () => {
  await withMedia(async (repository, resolve) => {
    const rejected = [];
    for (const status of ['pending', 'failed']) rejected.push(await createImage(repository, { status }));
    rejected.push(await createImage(repository, { mimeType: 'text/html', storageKey: 'uploads/logo.html' }));
    for (const storageKey of [
      'backups/private.png',
      'TRANSFERS/export.png',
      '../logo.png',
      'uploads/./logo.png',
      'uploads//logo.png',
      '/uploads/logo.png',
      'uploads\\logo.png',
      'uploads/%2e%2e/logo.png',
      'uploads/logo.png?download',
      'uploads/logo.png#private',
    ])
      rejected.push(await createImage(repository, { storageKey }));
    for (const item of rejected)
      assert.equal(
        await resolve({ id: item.id, provider: 'local', src: '/forged.png', meta: { storageKey: 'uploads/good.png' } }),
        undefined,
        item.storageKey + ':' + item.status
      );
    assert.equal(await resolve({ id: 'missing', src: '/forged.png' }), undefined);
    for (const id of ['', null, 10, '../bad', 'a'.repeat(101)])
      assert.equal(await resolve({ id, src: '/forged.png' }), undefined);
    const good = await createImage(repository);
    assert.equal(await resolve({ id: good.id, provider: 'remote', src: '/forged.png' }), undefined);
    assert.equal(await resolve({ provider: 'remote', src: '/forged.png' }), undefined);
  });
});

test('legacy root URL values remain usable without enabling remote URLs or invalid native fallbacks', async () => {
  const resolve = createPresentationMediaResolver(async () => {
    throw new Error('Legacy values must not read media');
  });
  assert.deepEqual(await resolve({ src: '/brand/white.png', width: 832, height: 288, alt: 'White logo' }), {
    url: '/brand/white.png',
    width: 832,
    height: 288,
    alt: 'White logo',
    contentType: undefined,
  });
  assert.equal((await resolve({ url: '/brand/logo.svg', provider: 'local' })).url, '/brand/logo.svg');
  for (const value of [
    null,
    [],
    '/brand/logo.png',
    { src: '//external.example/logo.png' },
    { src: 'https://external.example/logo.png' },
  ])
    assert.equal(await resolve(value), undefined);
  assert.equal(await resolve({ id: 'exists', src: '/stale.png' }), undefined, 'lookup failure cannot use stale src');
});

test('later media edits are read afresh instead of remaining cached in the resolver', async () => {
  await withMedia(async (repository, resolve) => {
    const saved = await createImage(repository);
    const value = { id: saved.id, provider: 'local', meta: { storageKey: saved.storageKey } };
    assert.equal((await resolve(value)).width, 832);
    await repository.update(saved.id, { width: 1200, height: 400, alt: 'Updated white wordmark' });
    const next = await resolve(value);
    assert.equal(next.width, 1200);
    assert.equal(next.height, 400);
    assert.equal(next.alt, 'Updated white wordmark');
    await repository.delete(saved.id);
    assert.equal(await resolve(value), undefined);
  });
});
