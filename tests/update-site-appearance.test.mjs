import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import { runMigrations } from 'emdash/db';
import {
  ContentRepository,
  SchemaRegistry,
  createHookPipeline,
  generateManifest,
  handleContentPublish,
  runWithContext,
} from 'emdash';
import { emdashLoader } from 'emdash/runtime';
import { createPresentationD1Database } from '../scripts/initialize-site-content.mjs';
import { inspectPresentationCaptureTrigger } from '../scripts/presentation-d1-capture-import.mjs';
import { applySiteAppearanceSchema, planSiteAppearanceSchema } from '../scripts/update-site-appearance.mjs';
import { DEFAULT_SITE_APPEARANCE, SITE_APPEARANCE_FIELDS } from '../src/emdash/site-appearance.ts';
import { localizeAdminPresentationManifest } from '../src/emdash/admin-presentation-i18n.ts';
import { mapSitePresentation, publishedSiteProfile } from '../src/emdash/site-presentation-model.ts';

const LOCALES = ['en', 'zh', 'ja', 'ko', 'ru', 'es', 'pt', 'fr'];
const profileSchema = JSON.parse(readFileSync('seed/site-shell.json', 'utf8')).collections[0];
const writes = (history) =>
  history.filter((statement) => /^\s*(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i.test(statement));

// Exercise the production dialect and its no-transaction D1 result shape.
async function withFixture(callback) {
  const sqlite = new DatabaseSync(':memory:');
  const history = [];
  let refuse;
  const query = async (statement, params = []) => {
    history.push(statement);
    if (refuse?.(statement)) throw new Error('Fixture transport write refused');
    const prepared = sqlite.prepare(statement);
    const results = prepared.columns().length ? prepared.all(...params) : (prepared.run(...params), []);
    const meta = sqlite.prepare('SELECT changes() AS changes, last_insert_rowid() AS last_row_id').get();
    return { success: true, results, meta };
  };
  const db = createPresentationD1Database(query, {
    captureImport(statement, params) {
      assert.ok(inspectPresentationCaptureTrigger(statement, params));
      sqlite.exec(statement);
      return Promise.resolve({ success: true, results: [], meta: { changes: 0, last_row_id: null } });
    },
  });
  const i18nKey = Symbol.for('emdash:i18n-config');
  const previousI18n = globalThis[i18nKey];
  globalThis[i18nKey] = { defaultLocale: 'en', locales: LOCALES };
  try {
    await runMigrations(db);
    await db.updateTable('_emdash_media_usage_activation').set({ state: 'active' }).execute();
    await new SchemaRegistry(db).createSeedCollection(profileSchema, profileSchema.fields);
    const repo = new ContentRepository(db);
    const ids = {};
    for (const locale of LOCALES) {
      const row = await repo.create({
        type: 'site_profile',
        slug: 'site',
        locale,
        status: 'draft',
        ...(locale === 'en' ? {} : { translationOf: ids.en }),
        data: {
          title: `${locale} entry`,
          footer_description: `${locale} existing footer`,
          contact_email: 'info@cinagroup.com',
        },
      });
      ids[locale] = row.id;
      await repo.publish('site_profile', row.id);
    }
    history.length = 0;
    await callback({
      db,
      sqlite,
      repo,
      ids,
      history,
      refuseWrites: (predicate) => {
        refuse = predicate;
      },
    });
  } finally {
    globalThis[i18nKey] = previousI18n;
    await db.destroy();
    sqlite.close();
  }
}

function protectedRows(sqlite) {
  const tables = sqlite
    .prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all();
  return Object.fromEntries(
    tables
      .filter(({ name }) => name !== '_emdash_fields' && !name.startsWith('_emdash_media_usage'))
      .map(({ name }) => {
        const columns = sqlite
          .prepare(`PRAGMA table_info("${name}")`)
          .all()
          .filter(({ name: column }) => !SITE_APPEARANCE_FIELDS.some(({ slug }) => slug === column));
        const selection = columns.map(({ name: column }) => `"${column}"`).join(',');
        return [name, sqlite.prepare(`SELECT ${selection} FROM "${name}"`).all()];
      })
  );
}
async function readPublic(db, locale) {
  return runWithContext({ db, dbIsIsolated: true, editMode: false, locale }, async () => {
    const entry = await emdashLoader().loadEntry({ filter: { type: 'site_profile', id: 'site', locale } });
    assert.equal(entry?.error, undefined);
    const response = { entry, isPreview: false };
    return mapSitePresentation({}, {}, publishedSiteProfile(response, locale), locale);
  });
}

test('planning is read-only; native addition preserves all original application rows and field IDs and is idempotent', async () => {
  await withFixture(async ({ db, sqlite, history }) => {
    const rowsBefore = protectedRows(sqlite);
    const fieldsBefore = sqlite.prepare('SELECT * FROM _emdash_fields ORDER BY id').all();
    const captureBefore = sqlite
      .prepare("SELECT name, sql FROM sqlite_schema WHERE type='trigger' AND name LIKE 'emdash_mu_%' ORDER BY name")
      .all();
    assert.equal(captureBefore.length, 3);
    const captureOwnerBefore = sqlite
      .prepare(
        "SELECT collection_id, scope_key, capture_state, schema_version FROM _emdash_media_usage_index_status WHERE scope_key='site_profile'"
      )
      .get();
    const first = await planSiteAppearanceSchema(db);
    assert.equal(first.add.length, 19);
    assert.deepEqual(writes(history), []);
    let backups = 0;
    const result = await applySiteAppearanceSchema(db, {
      expectedPlanSha256: first.planSha256,
      beforeApply() {
        backups++;
        assert.deepEqual(protectedRows(sqlite), rowsBefore);
      },
    });
    assert.equal(backups, 1);
    assert.equal(result.status, 'already-complete');
    assert.deepEqual(result.added, first.add);
    assert.deepEqual(
      protectedRows(sqlite),
      rowsBefore,
      'entries, revisions, menus, options, users and original values remain untouched'
    );
    assert.deepEqual(
      sqlite
        .prepare("SELECT name, sql FROM sqlite_schema WHERE type='trigger' AND name LIKE 'emdash_mu_%' ORDER BY name")
        .all(),
      captureBefore
    );
    assert.deepEqual(
      sqlite
        .prepare(
          "SELECT collection_id, scope_key, capture_state, schema_version FROM _emdash_media_usage_index_status WHERE scope_key='site_profile'"
        )
        .get(),
      captureOwnerBefore
    );
    for (const field of fieldsBefore)
      assert.deepEqual(sqlite.prepare('SELECT * FROM _emdash_fields WHERE id=?').get(field.id), field);
    for (const input of SITE_APPEARANCE_FIELDS) {
      assert.ok(
        sqlite
          .prepare(`SELECT "${input.slug}" AS value FROM ec_site_profile`)
          .all()
          .every(({ value }) => value === null)
      );
    }
    const count = history.length;
    await applySiteAppearanceSchema(db, { expectedPlanSha256: result.planSha256 });
    assert.deepEqual(writes(history.slice(count)), []);
    for (const locale of LOCALES) assert.deepEqual((await readPublic(db, locale)).appearance, DEFAULT_SITE_APPEARANCE);
    const manifest = { success: true, data: await generateManifest({}, {}, { db }) };
    const original = structuredClone(manifest.data.collections.site_profile.fields);
    localizeAdminPresentationManifest(manifest, 'zh-CN');
    assert.equal(manifest.data.collections.site_profile.fields.design_hero_autoplay.options[1].label, '启用');
    for (const input of SITE_APPEARANCE_FIELDS) {
      const field = manifest.data.collections.site_profile.fields[input.slug];
      assert.notEqual(field.label, input.label);
      assert.deepEqual(field.validation, original[input.slug].validation);
      assert.deepEqual(
        field.options?.map(({ value }) => value),
        original[input.slug].options?.map(({ value }) => value)
      );
    }
  });
});

test('required backup and reviewed plan fences reject changes before the first schema write', async () => {
  await withFixture(async ({ db, history }) => {
    const first = await planSiteAppearanceSchema(db);
    await assert.rejects(applySiteAppearanceSchema(db, { expectedPlanSha256: first.planSha256 }), /BACKUP_REQUIRED/);
    await assert.rejects(
      applySiteAppearanceSchema(db, {
        expectedPlanSha256: '0'.repeat(64),
        beforeApply() {
          assert.fail();
        },
      }),
      /PLAN_CHANGED/
    );
    assert.deepEqual(writes(history), []);
    await assert.rejects(
      applySiteAppearanceSchema(db, {
        expectedPlanSha256: first.planSha256,
        async beforeApply() {
          await new SchemaRegistry(db).createField('site_profile', structuredClone(SITE_APPEARANCE_FIELDS[0]));
        },
      }),
      /PLAN_CHANGED/
    );
    assert.equal((await planSiteAppearanceSchema(db)).add.length, 18);
    const current = await planSiteAppearanceSchema(db);
    await applySiteAppearanceSchema(db, { expectedPlanSha256: current.planSha256, beforeApply() {} });
  });
});

test('conflicting field metadata, orphan columns and partially committed D1 writes stop without repair or content changes', async () => {
  for (const kind of ['field', 'column', 'partial']) {
    await withFixture(async ({ db, sqlite, history, refuseWrites }) => {
      const before = protectedRows(sqlite);
      if (kind === 'field') {
        await new SchemaRegistry(db).createField('site_profile', { ...SITE_APPEARANCE_FIELDS[0], translatable: true });
      } else if (kind === 'column') {
        sqlite.exec('ALTER TABLE ec_site_profile ADD COLUMN design_primary_color TEXT');
      } else {
        const plan = await planSiteAppearanceSchema(db);
        refuseWrites((statement) =>
          /^\s*alter\s+table\s+"ec_site_profile"\s+add\s+column\s+"design_primary_color"/i.test(statement)
        );
        await assert.rejects(
          applySiteAppearanceSchema(db, { expectedPlanSha256: plan.planSha256, beforeApply() {} }),
          /Fixture transport write refused/
        );
        refuseWrites(undefined);
      }
      const count = history.length;
      await assert.rejects(
        planSiteAppearanceSchema(db),
        /SITE_APPEARANCE_(?:FIELD_CONFLICT|ORPHAN_COLUMN|COLUMN_CONFLICT)/
      );
      assert.deepEqual(writes(history.slice(count)), []);
      assert.deepEqual(protectedRows(sqlite), before);
    });
  }
});

test('native published shared appearance reaches all eight locales while drafts and localized copy remain separate', async () => {
  await withFixture(async ({ db, repo, ids }) => {
    const plan = await planSiteAppearanceSchema(db);
    await applySiteAppearanceSchema(db, { expectedPlanSha256: plan.planSha256, beforeApply() {} });
    await repo.updateDraftAware('site_profile', ids.ja, {
      data: { design_width: 'compact', footer_description: 'Unpublished Japanese copy' },
    });
    await repo.updateDraftAware('site_profile', ids.zh, {
      data: {
        design_primary_color: '#123456',
        design_motion: 'off',
        design_footer_wave: 'disabled',
        design_width: 'wide',
        footer_description: 'Published Chinese copy',
      },
    });
    for (const locale of LOCALES) assert.deepEqual((await readPublic(db, locale)).appearance, DEFAULT_SITE_APPEARANCE);
    const published = await handleContentPublish(db, 'site_profile', ids.zh);
    assert.equal(published.success, true, JSON.stringify(published.error));
    for (const locale of LOCALES) {
      const presentation = await readPublic(db, locale);
      assert.equal(presentation.appearance.primaryColor, '#123456');
      assert.equal(presentation.appearance.motion, 'off');
      assert.equal(presentation.appearance.footerWave, false);
      assert.equal(presentation.appearance.width, 'wide');
      assert.equal(
        presentation.footerDescription,
        locale === 'zh' ? 'Published Chinese copy' : `${locale} existing footer`
      );
    }
    const pendingJa = await repo.findById('site_profile', ids.ja);
    assert.ok(pendingJa.draftRevisionId, 'another locale pending draft remains staged');
    const draft = await db
      .selectFrom('revisions')
      .select('data')
      .where('id', '=', pendingJa.draftRevisionId)
      .executeTakeFirstOrThrow();
    const data = JSON.parse(draft.data);
    assert.equal(data.design_width, 'compact', 'explicit conflicting draft choice is preserved');
    assert.equal(data.design_motion, 'off', 'unchanged shared fields flow into pending draft');
    assert.equal(data.footer_description, 'Unpublished Japanese copy');
  });
});

test('real runtime accepts untouched nullable appearance in editor payloads and cleared colors without blocking old content', async () => {
  // Native runtime has one static Astro config import. The fixture has no plugins,
  // so this supplies only that build-time module; validation/save/publish stay native.
  const moduleHook = registerHooks({
    resolve(specifier, context, next) {
      return specifier === 'virtual:emdash/config'
        ? { url: 'data:text/javascript,export default {}', shortCircuit: true }
        : next(specifier, context);
    },
  });
  try {
    const { EmDashRuntime } = await import('emdash/internal/plugin-test-runtime');
    await withFixture(async ({ db, ids }) => {
      const plan = await planSiteAppearanceSchema(db);
      await applySiteAppearanceSchema(db, { expectedPlanSha256: plan.planSha256, beforeApply() {} });
      const hooks = createHookPipeline([], { db });
      const runtime = new EmDashRuntime({
        db,
        storage: null,
        configuredPlugins: [],
        sandboxedPlugins: new Map(),
        sandboxedPluginEntries: [],
        hooks,
        enabledPlugins: new Set(),
        pluginStates: new Map(),
        config: {},
        mediaProviders: new Map(),
        mediaProviderEntries: [],
        cronExecutor: null,
        cronScheduler: null,
        emailPipeline: null,
        allPipelinePlugins: [],
        pipelineFactoryOptions: { db },
        runtimeDeps: { config: {}, plugins: [], sandboxedPluginEntries: [], siteInfo: { locale: 'en' } },
        pipelineRef: { current: hooks },
      });
      const getData = async () => {
        const response = await runtime.handleContentGet('site_profile', ids.en, 'en');
        assert.equal(response.success, true);
        return response.data.item.data;
      };
      const save = async (changes) => {
        const response = await runtime.handleContentUpdate('site_profile', ids.en, {
          data: { ...(await getData()), ...changes },
          locale: 'en',
        });
        assert.equal(response.success, true, JSON.stringify(response.error));
      };
      const publish = async () => {
        const response = await runtime.handleContentPublish('site_profile', ids.en);
        assert.equal(response.success, true, JSON.stringify(response.error));
      };
      const initial = await getData();
      for (const input of SITE_APPEARANCE_FIELDS) assert.ok(initial[input.slug] == null);
      // ContentEditor starts with item.data and saves the entire formData object.
      await save({
        ...Object.fromEntries(SITE_APPEARANCE_FIELDS.map(({ slug }) => [slug, null])),
        footer_description: 'Updated existing text with nullable design fields',
      });
      await publish();
      assert.equal((await readPublic(db, 'en')).footerDescription, 'Updated existing text with nullable design fields');
      assert.deepEqual((await readPublic(db, 'en')).appearance, DEFAULT_SITE_APPEARANCE);
      await save({ design_primary_color: '#abcdef', design_secondary_color: '#123456' });
      await publish();
      assert.equal((await readPublic(db, 'en')).appearance.primaryColor, '#abcdef');
      // Clearing the native string Input posts "", not null. It must reset safely.
      await save({ design_primary_color: '', design_secondary_color: '' });
      await publish();
      for (const locale of LOCALES)
        assert.deepEqual((await readPublic(db, locale)).appearance, DEFAULT_SITE_APPEARANCE);
      const rejected = await runtime.handleContentUpdate('site_profile', ids.en, {
        data: { ...(await getData()), design_primary_color: '#fff;url(https://example.com)' },
        locale: 'en',
      });
      assert.equal(rejected.success, false);
      assert.equal(rejected.error.code, 'VALIDATION_ERROR');
      // Native numeric clearing posts Number("") === 0; bounds still refuse it.
      const emptyNumber = await runtime.handleContentUpdate('site_profile', ids.en, {
        data: { ...(await getData()), design_reveal_duration_ms: 0 },
        locale: 'en',
      });
      assert.equal(emptyNumber.success, false);
      assert.equal(emptyNumber.error.code, 'VALIDATION_ERROR');
      await save({
        design_reveal_duration_ms: 1000,
        design_hero_interval_seconds: 12,
        design_wave_duration_seconds: 10,
      });
      await publish();
      assert.deepEqual((await readPublic(db, 'en')).appearance, DEFAULT_SITE_APPEARANCE);
    });
  } finally {
    moduleHook.deregister();
  }
});
