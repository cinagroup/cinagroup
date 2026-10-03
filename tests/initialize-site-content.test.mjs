import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Kysely } from 'kysely';
import { createDialect } from 'emdash/db/sqlite';
import { runMigrations } from 'emdash/db';
import { applySeed, ContentRepository, OptionsRepository, SchemaRegistry } from 'emdash';
import { initializeSiteContent, SITE_CONTENT_INITIALIZATION_MARKER } from '../src/emdash/initialize-site-content.ts';

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
