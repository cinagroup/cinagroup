import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ContentRepository, MediaRepository, OptionsRepository, SchemaRegistry } from 'emdash';
import { runMigrations } from 'emdash/db';
import { createPresentationD1Database } from '../scripts/initialize-site-content.mjs';
import {
  importPresentationCaptureTrigger,
  inspectPresentationCaptureTrigger,
  PresentationCaptureImportUncertainError,
} from '../scripts/presentation-d1-capture-import.mjs';
import { initializeSiteContent, SITE_CONTENT_INITIALIZATION_MARKER } from '../src/emdash/initialize-site-content.ts';

const normalizeDdl = (value) => value.replace(/\s+/g, ' ').trim().replace(/;$/, '');
const complete = () => ({
  success: true,
  type: 'import',
  status: 'complete',
  result: {
    num_queries: 1,
    final_bookmark: 'fixture-final-bookmark',
    meta: { duration: 1, rows_read: 0, rows_written: 0, size_after: 4096 },
  },
});

// Emulate only the documented import transport. Integration cases below execute
// the uploaded bytes in native SQLite and use public EmDash SDK entry points.
function importTransport(overrides = {}) {
  const actions = [];
  const uploads = [];
  return {
    actions,
    uploads,
    dependencies: {
      async api(path, method, action) {
        assert.match(path, /^\/accounts\/[a-f0-9]{32}\/d1\/database\/[a-f0-9-]{36}\/import$/);
        assert.equal(method, 'POST');
        actions.push(structuredClone(action));
        if (Object.hasOwn(overrides, action.action)) return overrides[action.action](action);
        if (action.action === 'init')
          return {
            success: true,
            filename: `fixture-${action.etag}.sql`,
            upload_url: `https://fixture.r2.cloudflarestorage.com/import/${action.etag}?fixture-secret=hidden`,
          };
        if (action.action === 'ingest') return overrides.execute ? overrides.execute(uploads.at(-1)) : complete();
        assert.fail('Unexpected poll');
      },
      async fetchUpload(url, options) {
        assert.equal(options.method, 'PUT');
        assert.equal(options.redirect, 'error');
        assert.equal(options.headers['Content-Length'], String(options.body.length));
        assert.deepEqual(Object.keys(options.headers), ['Content-Length'], 'upload never forwards API credentials');
        assert.equal(options.signal.aborted, false);
        const bytes = Buffer.from(options.body);
        const etag = createHash('md5').update(bytes).digest('hex');
        const sql = bytes.toString('utf8');
        assert.match(sql, /^-- cinagroup native capture import attempt [a-f0-9-]{36}\n/);
        assert.equal(url.pathname, `/import/${etag}`);
        uploads.push({ bytes, etag, sql });
        if (overrides.upload) return overrides.upload(url, options);
        return new Response(null, { status: 200, headers: { etag: `"${etag}"` } });
      },
      wait: overrides.wait ?? (async () => {}),
    },
  };
}

function presentationSeed() {
  return {
    version: '1',
    defaultLocale: 'en',
    collections: [
      {
        slug: 'site_profile',
        label: 'Site Presentation',
        routable: false,
        supports: ['drafts', 'revisions'],
        fields: [
          { slug: 'title', label: 'Title', type: 'string' },
          { slug: 'hero_image', label: 'Image', type: 'image' },
        ],
      },
    ],
    content: {
      site_profile: [
        { id: 'profile-en', slug: 'site', locale: 'en', status: 'published', data: { title: 'Original title' } },
      ],
    },
  };
}

async function withNativeDatabase(callback, { interruptAt } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  const queried = [];
  const imported = [];
  let importNumber = 0;
  const transport = importTransport({
    execute(upload) {
      if (++importNumber === interruptAt)
        return { success: false, type: 'import', status: 'error', errors: ['failed'] };
      sqlite.exec(upload.sql);
      return complete();
    },
  });
  const db = createPresentationD1Database(
    async (sql, params) => {
      assert.ok(params.length <= 100);
      assert.ok(!/^\s*CREATE\s+TRIGGER\s+"emdash_mu_/i.test(sql), 'native capture must never use REST /query');
      queried.push(sql);
      const statement = sqlite.prepare(sql);
      const results = statement.columns().length ? statement.all(...params) : (statement.run(...params), []);
      const meta = sqlite.prepare('SELECT changes() AS changes, last_insert_rowid() AS last_row_id').get();
      return { success: true, results, meta };
    },
    {
      captureImport(sql, params) {
        imported.push(sql);
        return importPresentationCaptureTrigger(sql, params, transport.dependencies);
      },
    }
  );
  try {
    await runMigrations(db);
    // The production database already completed capture activation. Reproduce
    // that state before adding a new collection; expanded fixtures miss this path.
    await db.updateTable('_emdash_media_usage_activation').set({ state: 'active' }).execute();
    return await callback({ db, sqlite, queried, imported, transport });
  } finally {
    await db.destroy();
    sqlite.close();
  }
}

let nativeStatementsPromise;
function nativeStatements() {
  nativeStatementsPromise ??= withNativeDatabase(async ({ db, imported }) => {
    const seed = presentationSeed();
    await new SchemaRegistry(db).createSeedCollection(seed.collections[0], seed.collections[0].fields);
    assert.equal(imported.length, 3);
    return imported;
  });
  return nativeStatementsPromise;
}

test('active native SDK collection creation installs exact capture DDL and captures media edits with its write fence', async () => {
  await withNativeDatabase(async ({ db, sqlite, imported, transport }) => {
    assert.equal((await initializeSiteContent({ db, seed: presentationSeed(), dryRun: false })).status, 'complete');
    assert.equal(imported.length, 3);
    assert.deepEqual(
      imported.map((sql) => inspectPresentationCaptureTrigger(sql).operation),
      ['INSERT', 'UPDATE', 'DELETE']
    );
    const triggers = sqlite
      .prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = 'ec_site_profile'")
      .all();
    assert.equal(triggers.length, 3);
    for (const statement of imported) {
      const identity = inspectPresentationCaptureTrigger(statement);
      assert.equal(normalizeDdl(triggers.find((row) => row.name === identity.name).sql), normalizeDdl(statement));
    }
    assert.equal(new Set(transport.uploads.map((item) => item.etag)).size, 3);
    const content = new ContentRepository(db);
    const entry = await content.findBySlug('site_profile', 'site', 'en');
    assert.ok(entry);
    const lifecycle = () =>
      sqlite.prepare("SELECT * FROM _emdash_media_usage_index_status WHERE scope_key = 'site_profile'").get();
    const work = () => sqlite.prepare('SELECT * FROM _emdash_media_usage_work WHERE content_id = ?').get(entry.id);
    assert.equal(lifecycle().capture_state, 'active');
    const media = await new MediaRepository(db).create({
      filename: 'approved.png',
      mimeType: 'image/png',
      storageKey: 'fixture/approved.png',
      status: 'ready',
      size: 10,
    });
    const before = work();
    await content.update('site_profile', entry.id, {
      data: { hero_image: { id: media.id, provider: 'local', alt: 'Approved fixture image' } },
    });
    assert.ok(work().work_version > before.work_version);
    assert.ok(work().change_epoch > before.change_epoch);
    assert.equal(work().state, 'pending');
    const saved = sqlite.prepare('SELECT title, hero_image FROM ec_site_profile WHERE id = ?').get(entry.id);
    const captured = work();
    await db
      .updateTable('_emdash_media_usage_index_status')
      .set({ capture_state: 'installing' })
      .where('scope_key', '=', 'site_profile')
      .execute();
    await assert.rejects(
      content.update('site_profile', entry.id, { data: { title: 'Must be rejected' } }),
      /media usage capture inactive/
    );
    assert.deepEqual(sqlite.prepare('SELECT title, hero_image FROM ec_site_profile WHERE id = ?').get(entry.id), saved);
    assert.deepEqual(work(), captured);
    await db
      .updateTable('_emdash_media_usage_index_status')
      .set({ capture_state: 'active' })
      .where('scope_key', '=', 'site_profile')
      .execute();
    assert.equal(await content.delete('site_profile', entry.id), true);
    const trashed = work();
    assert.equal(await content.permanentDelete('site_profile', entry.id), true);
    assert.ok(work().work_version > trashed.work_version, 'DELETE trigger records native permanent deletion');
    assert.equal(work().state, 'pending');
  });
});

test('a deterministic partial native installation resumes the original collection ID without resetting its table', async () => {
  await withNativeDatabase(
    async ({ db, sqlite, imported }) => {
      const seed = presentationSeed();
      await assert.rejects(initializeSiteContent({ db, seed, dryRun: false }), /Native capture import failed/);
      const before = sqlite
        .prepare("SELECT * FROM _emdash_media_usage_index_status WHERE scope_key = 'site_profile'")
        .get();
      assert.equal(before.capture_state, 'installing');
      assert.equal(
        sqlite
          .prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type='trigger' AND tbl_name='ec_site_profile'")
          .get().count,
        1
      );
      assert.equal(await new SchemaRegistry(db).getCollection('site_profile'), null);
      assert.equal((await new OptionsRepository(db).get(SITE_CONTENT_INITIALIZATION_MARKER)).status, 'failed');
      assert.equal((await initializeSiteContent({ db, seed, dryRun: false, resume: true })).status, 'complete');
      const collection = await new SchemaRegistry(db).getCollection('site_profile');
      assert.equal(collection.id, before.collection_id);
      assert.equal(
        sqlite
          .prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type='trigger' AND tbl_name='ec_site_profile'")
          .get().count,
        3
      );
      assert.equal(
        sqlite
          .prepare("SELECT capture_state FROM _emdash_media_usage_index_status WHERE scope_key='site_profile'")
          .get().capture_state,
        'active'
      );
      assert.equal(
        (await new ContentRepository(db).findBySlug('site_profile', 'site', 'en')).data.title,
        'Original title'
      );
      assert.ok(imported.every((sql) => inspectPresentationCaptureTrigger(sql).collectionId === before.collection_id));
    },
    { interruptAt: 2 }
  );
});

test('only exact reviewed native statements can enter import, including all three operations', async () => {
  const statements = await nativeStatements();
  for (const statement of statements) assert.ok(inspectPresentationCaptureTrigger(statement));
  assert.equal(inspectPresentationCaptureTrigger('SELECT 1'), null);
  const statement = statements[0];
  for (const candidate of [
    statement + '; SELECT 1;',
    statement.replaceAll('site_profile', 'posts'),
    statement.replace(/emdash_mu_[a-f0-9]{32}/, 'emdash_mu_00000000000000000000000000000000'),
    statement.replace("status = 'complete'", "status = 'never'"),
    statement.replaceAll(inspectPresentationCaptureTrigger(statement).collectionId, '01ARZ3NDEKTSV4RRFFQ69G5FAV'),
  ]) {
    const transport = importTransport();
    await assert.rejects(
      importPresentationCaptureTrigger(candidate, [], transport.dependencies),
      /Unsupported native capture/
    );
    assert.equal(transport.actions.length, 0);
  }
  await assert.rejects(
    importPresentationCaptureTrigger(statement, ['secret'], importTransport().dependencies),
    /parameters or size/
  );
  await assert.rejects(
    importPresentationCaptureTrigger(statement + ' '.repeat(16384), [], importTransport().dependencies),
    /parameters or size/
  );
  await assert.rejects(importPresentationCaptureTrigger('SELECT 1', [], importTransport().dependencies), /Only native/);
});

test('fresh import attempts cannot reuse a previous completed ETag proof', async () => {
  const [statement] = await nativeStatements();
  const transport = importTransport();
  await importPresentationCaptureTrigger(statement, [], transport.dependencies);
  await importPresentationCaptureTrigger(statement, [], transport.dependencies);
  assert.notEqual(transport.actions[0].etag, transport.actions[2].etag);
  assert.equal(normalizeDdl(transport.uploads[0].sql.replace(/^--[^\n]*\n/, '')), normalizeDdl(statement));
  assert.equal(normalizeDdl(transport.uploads[1].sql.replace(/^--[^\n]*\n/, '')), normalizeDdl(statement));
  const cached = importTransport({ init: complete });
  await assert.rejects(
    importPresentationCaptureTrigger(statement, [], cached.dependencies),
    PresentationCaptureImportUncertainError
  );
  assert.deepEqual(
    cached.actions.map((action) => action.action),
    ['init']
  );
  assert.equal(cached.uploads.length, 0);
});

test('new upload initialization requires success true and a bounded HTTPS R2 location', async () => {
  const [statement] = await nativeStatements();
  for (const success of [false, undefined, 'true', 1]) {
    const transport = importTransport({
      init: () => ({ success, upload_url: 'https://fixture.r2.cloudflarestorage.com/file', filename: 'file' }),
    });
    await assert.rejects(
      importPresentationCaptureTrigger(statement, [], transport.dependencies),
      /initialization failed/
    );
    assert.equal(transport.uploads.length, 0);
  }
  for (const url of [
    'https://attacker.example/import',
    'https://r2.cloudflarestorage.com.attacker.example/file',
    'http://fixture.r2.cloudflarestorage.com/file',
    'https://user:password@fixture.r2.cloudflarestorage.com/file',
    'https://fixture.r2.cloudflarestorage.com:8443/file',
    'https://fixture.r2.cloudflarestorage.com/file#secret',
  ]) {
    const transport = importTransport({ init: () => ({ success: true, upload_url: url, filename: 'file' }) });
    await assert.rejects(
      importPresentationCaptureTrigger(statement, [], transport.dependencies),
      /upload location is invalid/
    );
    assert.equal(transport.uploads.length, 0);
  }
  const missing = importTransport({
    init: () => ({ success: true, upload_url: 'https://fixture.r2.cloudflarestorage.com/file' }),
  });
  await assert.rejects(importPresentationCaptureTrigger(statement, [], missing.dependencies), /filename is missing/);
  assert.equal(missing.uploads.length, 0);
});

test('upload failures and ETag mismatches never dispatch ingest or reveal provider details', async () => {
  const [statement] = await nativeStatements();
  for (const upload of [
    () => new Response(null, { status: 302, headers: { location: 'https://attacker.example/secret' } }),
    () => new Response(null, { status: 200, headers: { etag: 'wrong-content' } }),
    () => new Response(null, { status: 200 }),
    () => {
      throw new Error('provider secret credential');
    },
  ]) {
    const transport = importTransport({ upload });
    await assert.rejects(importPresentationCaptureTrigger(statement, [], transport.dependencies), (error) => {
      assert.match(error.message, /^Native capture import upload/);
      assert.doesNotMatch(error.stack, /provider secret credential|attacker\.example/);
      return true;
    });
    assert.deepEqual(
      transport.actions.map((action) => action.action),
      ['init']
    );
  }
});

test('active import polling uses the exact bookmark and one completed query proof', async () => {
  const [statement] = await nativeStatements();
  const transport = importTransport({
    ingest: () => ({ success: true, type: 'import', status: 'active', at_bookmark: 'fixture-active-bookmark' }),
    poll: (action) => {
      assert.equal(action.current_bookmark, 'fixture-active-bookmark');
      return complete();
    },
  });
  const result = await importPresentationCaptureTrigger(statement, [], transport.dependencies);
  assert.deepEqual(
    transport.actions.map((action) => action.action),
    ['init', 'ingest', 'poll']
  );
  assert.deepEqual(result, {
    success: true,
    results: [],
    meta: { ...complete().result.meta, changes: 0, last_row_id: null },
  });
});

test('only declared terminal failures are resumable; ambiguous responses after ingest remain uncertain', async () => {
  const [statement] = await nativeStatements();
  const terminal = importTransport({
    ingest: () => ({ success: false, type: 'import', status: 'error', errors: ['provider secret'] }),
  });
  await assert.rejects(importPresentationCaptureTrigger(statement, [], terminal.dependencies), (error) => {
    assert.equal(error.message, 'Native capture import failed');
    assert.ok(!(error instanceof PresentationCaptureImportUncertainError));
    assert.doesNotMatch(error.stack, /provider secret/);
    return true;
  });
  for (const response of [
    null,
    { success: false, type: 'import', status: 'active' },
    { success: true, type: 'export', status: 'complete' },
    { success: true, type: 'import', status: 'unknown' },
    { success: true, type: 'import', status: 'active' },
    { success: true, type: 'import', status: 'active', at_bookmark: 'bookmark', errors: ['provider secret'] },
    { ...complete(), errors: 'provider secret' },
    { ...complete(), result: undefined },
    { ...complete(), result: { ...complete().result, num_queries: 2 } },
    { ...complete(), result: { ...complete().result, final_bookmark: '' } },
    { ...complete(), result: { ...complete().result, meta: { ...complete().result.meta, duration: NaN } } },
    { ...complete(), result: { ...complete().result, meta: { ...complete().result.meta, rows_read: 0.5 } } },
    { ...complete(), result: { ...complete().result, meta: { ...complete().result.meta, changes: -1 } } },
    { ...complete(), result: { ...complete().result, meta: { ...complete().result.meta, changes: null } } },
    { ...complete(), result: { ...complete().result, meta: { ...complete().result.meta, last_row_id: 1.5 } } },
  ]) {
    const transport = importTransport({ ingest: () => response });
    await assert.rejects(importPresentationCaptureTrigger(statement, [], transport.dependencies), (error) => {
      assert.ok(error instanceof PresentationCaptureImportUncertainError);
      assert.doesNotMatch(error.stack, /provider secret|fixture-secret/);
      return true;
    });
    assert.deepEqual(
      transport.actions.map((action) => action.action),
      ['init', 'ingest']
    );
  }
});

test('transport exceptions, interrupted polling waits and exhausted polls do not retry writes', async () => {
  const [statement] = await nativeStatements();
  const active = () => ({ success: true, type: 'import', status: 'active', at_bookmark: 'fixture-active-bookmark' });
  for (const overrides of [
    {
      ingest: () => {
        throw new Error('private response credential');
      },
    },
    {
      ingest: active,
      poll: () => {
        throw new Error('private response credential');
      },
    },
    {
      ingest: active,
      wait: () => {
        throw new Error('private response credential');
      },
    },
    { ingest: active, poll: active },
  ]) {
    const transport = importTransport(overrides);
    await assert.rejects(importPresentationCaptureTrigger(statement, [], transport.dependencies), (error) => {
      assert.ok(error instanceof PresentationCaptureImportUncertainError);
      assert.doesNotMatch(error.stack, /private response credential/);
      return true;
    });
    assert.equal(transport.actions.filter((action) => action.action === 'ingest').length, 1);
    assert.ok(transport.actions.filter((action) => action.action === 'poll').length <= 60);
  }
});
