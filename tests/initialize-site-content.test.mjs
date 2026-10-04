import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { Kysely } from 'kysely';
import { createDialect } from 'emdash/db/sqlite';
import { runMigrations } from 'emdash/db';
import { applySeed, ContentRepository, OptionsRepository, SchemaRegistry } from 'emdash';
import { initializeSiteContent, SITE_CONTENT_INITIALIZATION_MARKER } from '../src/emdash/initialize-site-content.ts';
import {
  hasUncertainPresentationCaptureImport,
  createPresentationD1Database,
} from '../scripts/initialize-site-content.mjs';
import { PresentationCaptureImportUncertainError } from '../scripts/presentation-d1-capture-import.mjs';

const locales = ['en', 'zh', 'ja', 'ko', 'ru', 'es', 'fr', 'pt'];

function fixture() {
  return {
    version: '1',
    defaultLocale: 'en',
    collections: ['site_pages', 'site_profile'].map((slug) => ({
      slug,
      label: slug,
      routable: false,
      supports: ['drafts', 'revisions'],
      fields: [{ slug: 'title', label: 'Title', type: 'string', required: true }],
    })),
    content: Object.fromEntries(
      ['site_pages', 'site_profile'].map((collection) => [
        collection,
        locales.map((locale) => ({
          id: `${collection}-${locale}`,
          slug: collection === 'site_pages' ? 'home' : 'site',
          locale,
          status: 'published',
          data: { title: `Current ${locale}` },
          ...(locale === 'en' ? {} : { translationOf: `${collection}-en` }),
        })),
      ])
    ),
    menus: ['primary', 'footer', 'footer-legal'].flatMap((name) =>
      locales.map((locale) => ({
        id: `${name}-${locale}`,
        name,
        label: name,
        locale,
        ...(locale === 'en' ? {} : { translationOf: `${name}-en` }),
        items: [
          { type: 'custom', label: 'Home', url: locale === 'en' ? '/' : `/${locale}/` },
          { type: 'custom', label: 'Contact', url: '/contact/' },
        ],
      }))
    ),
    settings: { title: 'CinaGroup', postsPerPage: 6 },
  };
}

async function withDatabase(callback) {
  const db = new Kysely({ dialect: createDialect({ url: ':memory:' }) });
  try {
    await runMigrations(db);
    await callback(db);
  } finally {
    await db.destroy();
  }
}

async function withInterruptedRegisteredSchema(callback, { failAt = 1 } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  let fieldInsert = 0;
  const db = createPresentationD1Database(async (statement, parameters) => {
    if (
      (/^\s*insert into "_emdash_fields"/i.test(statement) && ++fieldInsert === failAt) ||
      (failAt === 'finalize' &&
        /^\s*update "_emdash_media_usage_index_status"/i.test(statement) &&
        parameters[0] === 'active')
    ) {
      failAt = null;
      throw new Error('simulated committed registration before field failure');
    }
    const prepared = sqlite.prepare(statement);
    const results = prepared.columns().length ? prepared.all(...parameters) : (prepared.run(...parameters), []);
    const meta = sqlite.prepare('SELECT changes() AS changes, last_insert_rowid() AS last_row_id').get();
    return { success: true, results, meta };
  });
  const collection = JSON.parse(readFileSync(new URL('../seed/site-shell.json', import.meta.url), 'utf8'))
    .collections[0];
  const seed = {
    version: '1',
    defaultLocale: 'en',
    collections: [collection],
    content: {
      site_profile: [
        { id: 'site-profile-en', slug: 'site', locale: 'en', status: 'published', data: { title: 'Original title' } },
      ],
    },
  };
  try {
    await runMigrations(db);
    await db.updateTable('_emdash_media_usage_activation').set({ state: 'active' }).execute();
    await assert.rejects(initializeSiteContent({ db, seed, dryRun: false }), /simulated committed registration/);
    const registered = await new SchemaRegistry(db).getCollection('site_profile');
    assert.ok(registered);
    const lifecycle = sqlite
      .prepare("SELECT * FROM _emdash_media_usage_index_status WHERE scope_key = 'site_profile'")
      .get();
    assert.equal(lifecycle.capture_state, 'ready');
    assert.equal(lifecycle.collection_id, registered.id);
    assert.match(lifecycle.cursor, /^media-usage-seed:v1:sha256:[a-f0-9]{64}$/);
    const marker = await new OptionsRepository(db).getVersioned(SITE_CONTENT_INITIALIZATION_MARKER);
    assert.equal(marker.value.status, 'failed');
    return await callback({ db, sqlite, seed, collection, registered, lifecycle, marker });
  } finally {
    await db.destroy();
    sqlite.close();
  }
}

test('an owned ready registration with no fields has a read-only resume plan and completes through the native SDK', async () => {
  await withInterruptedRegisteredSchema(async ({ db, sqlite, seed, collection, registered, marker }) => {
    const beforeTriggers = sqlite
      .prepare("SELECT name, sql FROM sqlite_schema WHERE type='trigger' AND tbl_name='ec_site_profile' ORDER BY name")
      .all();
    const plan = await initializeSiteContent({ db, seed, dryRun: true });
    assert.deepEqual(plan.plan.collections.resume, ['site_profile']);
    assert.deepEqual(plan.plan.collections.preserve, []);
    assert.deepEqual(plan.plan.collections.create, []);
    assert.deepEqual(await new OptionsRepository(db).getVersioned(SITE_CONTENT_INITIALIZATION_MARKER), marker);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM _emdash_fields').get().count, 0);
    await assert.rejects(initializeSiteContent({ db, seed, dryRun: false }), { code: 'INITIALIZATION_LOCKED' });
    assert.equal((await initializeSiteContent({ db, seed, dryRun: false, resume: true })).status, 'complete');
    const completed = await new SchemaRegistry(db).getCollectionWithFields('site_profile');
    assert.equal(completed.id, registered.id);
    assert.equal(completed.fields.length, collection.fields.length);
    assert.equal(completed.titleField, 'title');
    assert.deepEqual(
      sqlite
        .prepare(
          "SELECT name, sql FROM sqlite_schema WHERE type='trigger' AND tbl_name='ec_site_profile' ORDER BY name"
        )
        .all(),
      beforeTriggers
    );
    assert.equal(
      sqlite.prepare("SELECT capture_state FROM _emdash_media_usage_index_status WHERE scope_key='site_profile'").get()
        .capture_state,
      'active'
    );
    assert.equal(
      (await new ContentRepository(db).findBySlug('site_profile', 'site', 'en')).data.title,
      'Original title'
    );
    assert.equal((await initializeSiteContent({ db, seed, dryRun: false, resume: true })).status, 'already-complete');
  });
});

test('a ready registration preserves already committed field IDs and exact definitions while filling the remaining fields', async () => {
  await withInterruptedRegisteredSchema(
    async ({ db, sqlite, seed, collection, registered }) => {
      const before = await db
        .selectFrom('_emdash_fields')
        .selectAll()
        .where('collection_id', '=', registered.id)
        .orderBy('sort_order')
        .execute();
      assert.equal(before.length, 6);
      assert.equal((await initializeSiteContent({ db, seed, dryRun: false, resume: true })).status, 'complete');
      for (const row of before) {
        assert.deepEqual(
          await db.selectFrom('_emdash_fields').selectAll().where('id', '=', row.id).executeTakeFirst(),
          row
        );
      }
      assert.equal(
        (await new SchemaRegistry(db).getCollectionWithFields('site_profile')).fields.length,
        collection.fields.length
      );
      assert.equal(
        sqlite
          .prepare("SELECT capture_state FROM _emdash_media_usage_index_status WHERE scope_key='site_profile'")
          .get().capture_state,
        'active'
      );
    },
    { failAt: 2 }
  );
});

test('a complete field set still resumes its ready lifecycle and refuses edited definitions', async () => {
  await withInterruptedRegisteredSchema(
    async ({ db, seed, collection, registered, sqlite }) => {
      const before = await db
        .selectFrom('_emdash_fields')
        .selectAll()
        .where('collection_id', '=', registered.id)
        .orderBy('id')
        .execute();
      assert.equal(before.length, collection.fields.length);
      assert.deepEqual((await initializeSiteContent({ db, seed })).plan.collections.resume, ['site_profile']);
      assert.equal((await initializeSiteContent({ db, seed, dryRun: false, resume: true })).status, 'complete');
      assert.deepEqual(
        await db
          .selectFrom('_emdash_fields')
          .selectAll()
          .where('collection_id', '=', registered.id)
          .orderBy('id')
          .execute(),
        before
      );
      assert.equal(
        sqlite
          .prepare("SELECT capture_state FROM _emdash_media_usage_index_status WHERE scope_key='site_profile'")
          .get().capture_state,
        'active'
      );
    },
    { failAt: 'finalize' }
  );
  await withInterruptedRegisteredSchema(
    async ({ db, seed, registered, collection }) => {
      await db
        .updateTable('_emdash_fields')
        .set({ indexed: 1 })
        .where('collection_id', '=', registered.id)
        .where('slug', '=', 'title')
        .execute();
      const before = await db
        .selectFrom('_emdash_fields')
        .selectAll()
        .where('collection_id', '=', registered.id)
        .orderBy('id')
        .execute();
      assert.equal(before.length, collection.fields.length);
      await assert.rejects(initializeSiteContent({ db, seed, dryRun: false, resume: true }), {
        code: 'INITIALIZATION_SCHEMA_RESUME_EDITED',
      });
      assert.deepEqual(
        await db
          .selectFrom('_emdash_fields')
          .selectAll()
          .where('collection_id', '=', registered.id)
          .orderBy('id')
          .execute(),
        before
      );
    },
    { failAt: 'finalize' }
  );
});

test('unfinished registration recovery refuses changes to its native identity, lifecycle, metadata, or initial ownership before writes', async () => {
  const mutations = [
    ({ sqlite }) =>
      sqlite.exec(
        "UPDATE _emdash_media_usage_index_status SET cursor='media-usage-seed:v1:sha256:0000000000000000000000000000000000000000000000000000000000000000' WHERE scope_key='site_profile'"
      ),
    ({ sqlite }) =>
      sqlite.exec(
        "UPDATE _emdash_media_usage_index_status SET collection_id='01ARZ3NDEKTSV4RRFFQ69G5FAV' WHERE scope_key='site_profile'"
      ),
    ({ sqlite }) => sqlite.exec('UPDATE _emdash_media_usage_activation SET runtime_generation=2'),
    ({ sqlite }) => sqlite.exec("UPDATE _emdash_media_usage_activation SET state='expanded'"),
    ({ sqlite }) => sqlite.exec("UPDATE _emdash_collections SET label='Editor chosen label' WHERE slug='site_profile'"),
    ({ sqlite }) => sqlite.exec("UPDATE _emdash_collections SET source='manual' WHERE slug='site_profile'"),
    async ({ db, marker }) =>
      new OptionsRepository(db).set(SITE_CONTENT_INITIALIZATION_MARKER, {
        ...marker.value,
        initialPlan: { ...marker.value.initialPlan, collections: { create: [], preserve: ['site_profile'] } },
      }),
  ];
  for (const mutate of mutations) {
    await withInterruptedRegisteredSchema(async (context) => {
      await mutate(context);
      const { db, sqlite, seed } = context;
      const before = await new OptionsRepository(db).getVersioned(SITE_CONTENT_INITIALIZATION_MARKER);
      await assert.rejects(
        initializeSiteContent({ db, seed, dryRun: false, resume: true }),
        /INITIALIZATION_SCHEMA_RESUME_/
      );
      assert.deepEqual(await new OptionsRepository(db).getVersioned(SITE_CONTENT_INITIALIZATION_MARKER), before);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM _emdash_fields').get().count, 0);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM ec_site_profile').get().count, 0);
    });
  }
});

test('unfinished registration recovery never modifies an existing edited field or unexpected content', async () => {
  await withInterruptedRegisteredSchema(
    async ({ db, seed, registered }) => {
      await db
        .updateTable('_emdash_fields')
        .set({ label: 'Editor field label' })
        .where('collection_id', '=', registered.id)
        .where('slug', '=', 'title')
        .execute();
      const before = await db
        .selectFrom('_emdash_fields')
        .selectAll()
        .where('collection_id', '=', registered.id)
        .execute();
      await assert.rejects(initializeSiteContent({ db, seed, dryRun: false, resume: true }), {
        code: 'INITIALIZATION_SCHEMA_RESUME_EDITED',
      });
      assert.deepEqual(
        await db.selectFrom('_emdash_fields').selectAll().where('collection_id', '=', registered.id).execute(),
        before
      );
    },
    { failAt: 2 }
  );
  await withInterruptedRegisteredSchema(async ({ db, sqlite, seed }) => {
    // Test-only fixture: bypass the native write fence to represent unexpected
    // content already present. The production initializer only reads this table.
    sqlite.exec("UPDATE _emdash_media_usage_index_status SET capture_state='active' WHERE scope_key='site_profile'");
    sqlite.exec(
      "INSERT INTO ec_site_profile(id,slug,locale,status,title) VALUES('editor-content','site','en','draft','Editor content')"
    );
    sqlite.exec("UPDATE _emdash_media_usage_index_status SET capture_state='ready' WHERE scope_key='site_profile'");
    const before = sqlite.prepare('SELECT * FROM ec_site_profile').all();
    await assert.rejects(initializeSiteContent({ db, seed, dryRun: false, resume: true }), {
      code: 'INITIALIZATION_SCHEMA_RESUME_CONTENT_PRESENT',
    });
    assert.deepEqual(sqlite.prepare('SELECT * FROM ec_site_profile').all(), before);
  });
});

test('dry run does not create schema, content, menus, settings, or the marker', async () => {
  await withDatabase(async (db) => {
    const result = await initializeSiteContent({ db, seed: fixture() });
    assert.equal(result.status, 'dry-run');
    assert.equal(result.plan.content.create.length, 16);
    assert.equal(result.plan.menus.create.length, 24);
    assert.equal(await new SchemaRegistry(db).getCollection('site_pages'), null);
    assert.equal(await new OptionsRepository(db).get(SITE_CONTENT_INITIALIZATION_MARKER), null);
    assert.deepEqual(await db.selectFrom('_emdash_menus').selectAll().execute(), []);
    assert.equal(await new OptionsRepository(db).get('site:title'), null);
  });
});

test('official seed writes are idempotent and preserve existing settings, content and menu edits', async () => {
  await withDatabase(async (db) => {
    const seed = fixture();
    const options = new OptionsRepository(db);
    await options.set('site:title', 'Editor chosen brand');
    await options.set('unrelated:private-option', 'untouched');
    await applySeed(
      db,
      {
        version: '1',
        collections: [seed.collections[1]],
        content: {
          site_profile: [
            { ...seed.content.site_profile[0], status: 'draft', data: { title: 'Editor chosen profile' } },
          ],
        },
        menus: [
          {
            name: 'primary',
            locale: 'zh',
            label: 'Editor menu',
            items: [{ type: 'custom', label: 'Keep me', url: '/zh/contact/' }],
          },
        ],
      },
      { includeContent: true, onConflict: 'skip' }
    );
    const beforeMenu = await db.selectFrom('_emdash_menu_items').selectAll().execute();
    const result = await initializeSiteContent({ db, seed, dryRun: false });
    assert.equal(result.status, 'complete');
    assert.equal(await options.get('site:title'), 'Editor chosen brand');
    assert.equal(await options.get('site:postsPerPage'), 6);
    assert.equal(await options.get('unrelated:private-option'), 'untouched');
    const profile = await new ContentRepository(db).findBySlug('site_profile', 'site', 'en');
    assert.equal(profile.status, 'draft');
    assert.equal(profile.data.title, 'Editor chosen profile');
    const kept = await db
      .selectFrom('_emdash_menu_items')
      .selectAll()
      .where('id', '=', beforeMenu[0].id)
      .executeTakeFirst();
    assert.deepEqual(kept, beforeMenu[0]);
    const englishHome = await new ContentRepository(db).findBySlug('site_pages', 'home', 'en');
    const chineseHome = await new ContentRepository(db).findBySlug('site_pages', 'home', 'zh');
    assert.equal(englishHome.status, 'published');
    assert.ok(englishHome.liveRevisionId);
    assert.equal(chineseHome.translationGroup, englishHome.translationGroup);
    const countBefore = await db.selectFrom('_emdash_menu_items').selectAll().execute();
    assert.equal((await initializeSiteContent({ db, seed, dryRun: false })).status, 'already-complete');
    assert.deepEqual(await db.selectFrom('_emdash_menu_items').selectAll().execute(), countBefore);
  });
});

test('initialization refuses changes to posts before making any writes', async () => {
  await withDatabase(async (db) => {
    const seed = fixture();
    seed.collections[0].slug = 'posts';
    await assert.rejects(initializeSiteContent({ db, seed, dryRun: false }), { code: 'UNOWNED_COLLECTION' });
    assert.equal(await new OptionsRepository(db).get(SITE_CONTENT_INITIALIZATION_MARKER), null);
    assert.equal(await new SchemaRegistry(db).getCollection('posts'), null);
  });
});

test('a failed menu creation is detected on resume and never destroys partial items', async () => {
  await withDatabase(async (db) => {
    const seed = fixture();
    // A deliberate SQLite-only failure simulates D1 committing an item before
    // the following statement fails. It does not touch a production database.
    const { sql } = await import('kysely');
    await sql
      .raw(
        `CREATE TRIGGER test_abort_menu BEFORE INSERT ON _emdash_menu_items
      WHEN NEW.custom_url = '/contact/' BEGIN SELECT RAISE(ABORT, 'simulated interruption'); END`
      )
      .execute(db);
    await assert.rejects(initializeSiteContent({ db, seed, dryRun: false }), /simulated interruption/);
    const options = new OptionsRepository(db);
    assert.equal((await options.get(SITE_CONTENT_INITIALIZATION_MARKER)).status, 'failed');
    const before = await db.selectFrom('_emdash_menu_items').selectAll().execute();
    assert.equal(before.length, 1);
    await sql.raw('DROP TRIGGER test_abort_menu').execute(db);
    await assert.rejects(initializeSiteContent({ db, seed, dryRun: false, resume: true }), {
      code: 'INITIALIZATION_MENU_INCOMPLETE_OR_EDITED',
    });
    assert.deepEqual(await db.selectFrom('_emdash_menu_items').selectAll().execute(), before);
    assert.equal((await options.get(SITE_CONTENT_INITIALIZATION_MARKER)).status, 'failed');
  });
});

test('an unconfirmed remote write retains the running lock and cannot be resumed', async () => {
  await withDatabase(async (db) => {
    const { sql } = await import('kysely');
    await sql
      .raw(
        `CREATE TRIGGER test_unconfirmed_write BEFORE INSERT ON _emdash_menu_items
      BEGIN SELECT RAISE(ABORT, 'simulated unconfirmed remote write'); END`
      )
      .execute(db);
    const seed = fixture();
    let observed = false;
    await assert.rejects(
      initializeSiteContent({
        db,
        seed,
        dryRun: false,
        retainLockOnError(error) {
          observed = true;
          assert.match(error.message, /simulated unconfirmed remote write/);
          return hasUncertainPresentationCaptureImport(
            new Error('SDK wrapper', {
              cause: new PresentationCaptureImportUncertainError('poll', 'test-bookmark'),
            })
          );
        },
      }),
      /simulated unconfirmed remote write/
    );
    assert.equal(observed, true);
    const options = new OptionsRepository(db);
    const before = await options.getVersioned(SITE_CONTENT_INITIALIZATION_MARKER);
    assert.equal(before.value.status, 'running');
    await sql.raw('DROP TRIGGER test_unconfirmed_write').execute(db);
    await assert.rejects(initializeSiteContent({ db, seed, dryRun: false, resume: true }), {
      code: 'INITIALIZATION_LOCKED',
    });
    assert.deepEqual(await options.getVersioned(SITE_CONTENT_INITIALIZATION_MARKER), before);
    assert.deepEqual(await db.selectFrom('_emdash_menu_items').selectAll().execute(), []);
  });
});

test('uncertain capture errors are recognized through cause and aggregate wrappers', () => {
  const uncertain = new PresentationCaptureImportUncertainError('ingest');
  const wrapper = new Error('SDK wrapper', { cause: uncertain });
  assert.equal(hasUncertainPresentationCaptureImport(new AggregateError([new Error('ordinary'), wrapper])), true);
  assert.equal(hasUncertainPresentationCaptureImport(new Error('ordinary')), false);
  const cyclic = new Error('cycle');
  cyclic.cause = cyclic;
  assert.equal(hasUncertainPresentationCaptureImport(cyclic), false);
});
