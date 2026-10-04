import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from 'emdash/db';
import { SchemaRegistry } from 'emdash';
import { createPresentationD1Database } from '../scripts/initialize-site-content.mjs';
import {
  inspectNativeSiteContentIndexes,
  ensureNativeSiteContentIndexes,
} from '../scripts/ensure-native-site-content-indexes.mjs';

const nativeName = 'idx_fields_collection_slug';
async function withFixture(callback) {
  const sqlite = new DatabaseSync(':memory:');
  const history = [];
  const query = async (sql, params = []) => {
    history.push(sql);
    const statement = sqlite.prepare(sql);
    const results = statement.columns().length ? statement.all(...params) : (statement.run(...params), []);
    const meta = sqlite.prepare('SELECT changes() AS changes, last_insert_rowid() AS last_row_id').get();
    return { success: true, results, meta };
  };
  const db = createPresentationD1Database(query);
  try {
    await runMigrations(db);
    await new SchemaRegistry(db).createSeedCollection(
      { slug: 'site_profile', label: 'Presentation', supports: ['drafts', 'revisions'], routable: false },
      [
        { slug: 'title', label: 'Title', type: 'string' },
        { slug: 'tagline', label: 'Tagline', type: 'text' },
      ]
    );
    history.length = 0;
    await callback({ sqlite, query, history });
  } finally {
    await db.destroy();
    sqlite.close();
  }
}
const content = (sqlite) => sqlite.prepare('SELECT * FROM _emdash_fields ORDER BY id').all();
const writes = (history) => history.filter((sql) => /^(?:CREATE|DROP|INSERT|UPDATE|DELETE)/i.test(sql));

test('inspection and already-present ensure are read-only and retain the original native unique index', async () => {
  await withFixture(async ({ sqlite, query, history }) => {
    const before = content(sqlite);
    const definition = sqlite.prepare('SELECT sql FROM sqlite_schema WHERE name = ?').get(nativeName).sql;
    assert.equal((await inspectNativeSiteContentIndexes(query)).status, 'already-present');
    assert.equal((await ensureNativeSiteContentIndexes(query, { apply: true })).status, 'already-present');
    assert.deepEqual(writes(history), []);
    assert.deepEqual(content(sqlite), before);
    assert.equal(sqlite.prepare('SELECT sql FROM sqlite_schema WHERE name = ?').get(nativeName).sql, definition);
  });
});

test('only the missing original composite unique index is repaired and repeated repair is a no-op', async () => {
  await withFixture(async ({ sqlite, query, history }) => {
    const before = content(sqlite);
    sqlite.exec(`DROP INDEX ${nativeName}`);
    const plan = await ensureNativeSiteContentIndexes(query);
    assert.equal(plan.status, 'repair-required');
    assert.deepEqual(writes(history), []);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM sqlite_schema WHERE name = ?').get(nativeName).count, 0);
    assert.equal((await ensureNativeSiteContentIndexes(query, { apply: true })).status, 'repaired');
    assert.equal(writes(history).length, 1);
    assert.equal(
      writes(history)[0],
      'CREATE UNIQUE INDEX IF NOT EXISTS "idx_fields_collection_slug" ON "_emdash_fields" ("collection_id", "slug")'
    );
    assert.equal((await ensureNativeSiteContentIndexes(query, { apply: true })).status, 'already-present');
    assert.equal(writes(history).length, 1);
    assert.deepEqual(content(sqlite), before);
    // The repaired constraint restores the SDK's actual resume target semantics.
    const row = before[0];
    sqlite
      .prepare(
        'INSERT INTO _emdash_fields(id,collection_id,slug,label,type,column_type) VALUES(?,?,?,?,?,?) ON CONFLICT(collection_id,slug) DO NOTHING'
      )
      .run('different-id', row.collection_id, row.slug, row.label, row.type, row.column_type);
    assert.deepEqual(content(sqlite), before);
  });
});

test('global duplicate collection/slug pairs stop before any repair and retain both existing rows', async () => {
  await withFixture(async ({ sqlite, query, history }) => {
    sqlite.exec(`DROP INDEX ${nativeName}`);
    sqlite.exec(
      "INSERT INTO _emdash_fields (id,collection_id,slug,label,type,column_type) SELECT 'duplicate-id',collection_id,slug,label,type,column_type FROM _emdash_fields LIMIT 1"
    );
    const before = content(sqlite);
    await assert.rejects(ensureNativeSiteContentIndexes(query, { apply: true }), {
      code: 'NATIVE_SITE_INDEX_DUPLICATE_FIELDS',
    });
    assert.deepEqual(writes(history), []);
    assert.deepEqual(content(sqlite), before);
  });
});

test('same-name nonunique, partial, reordered, expression and foreign-table indexes are never replaced', async () => {
  for (const impostor of [
    'CREATE INDEX idx_fields_collection_slug ON _emdash_fields(collection_id,slug)',
    'CREATE UNIQUE INDEX idx_fields_collection_slug ON _emdash_fields(collection_id,slug) WHERE slug IS NOT NULL',
    'CREATE UNIQUE INDEX idx_fields_collection_slug ON _emdash_fields(slug,collection_id)',
    'CREATE UNIQUE INDEX idx_fields_collection_slug ON _emdash_fields(collection_id,lower(slug))',
    'CREATE UNIQUE INDEX idx_fields_collection_slug ON media(id,filename)',
  ]) {
    await withFixture(async ({ sqlite, query, history }) => {
      sqlite.exec(`DROP INDEX ${nativeName}`);
      sqlite.exec(impostor);
      const before = sqlite.prepare('SELECT sql FROM sqlite_schema WHERE name = ?').get(nativeName).sql;
      await assert.rejects(ensureNativeSiteContentIndexes(query, { apply: true }), {
        code: 'NATIVE_SITE_INDEX_DEFINITION_CONFLICT',
      });
      assert.deepEqual(writes(history), []);
      assert.equal(sqlite.prepare('SELECT sql FROM sqlite_schema WHERE name = ?').get(nativeName).sql, before);
    });
  }
});

test('missing native migration or field columns stop rather than replaying setup or migrations', async () => {
  await withFixture(async ({ sqlite, query, history }) => {
    sqlite.exec("DELETE FROM _emdash_migrations WHERE name='003_schema_registry'");
    await assert.rejects(ensureNativeSiteContentIndexes(query, { apply: true }), {
      code: 'NATIVE_SITE_INDEX_MIGRATION_MISSING',
    });
    assert.deepEqual(writes(history), []);
  });
  await withFixture(async ({ sqlite, query, history }) => {
    sqlite.exec('ALTER TABLE _emdash_fields DROP COLUMN indexed');
    await assert.rejects(ensureNativeSiteContentIndexes(query, { apply: true }), {
      code: 'NATIVE_SITE_INDEX_SCHEMA_UNSUPPORTED',
    });
    assert.deepEqual(writes(history), []);
  });
});

test('a conflicting index that appears between inspection and creation fails revalidation without overwrite', async () => {
  await withFixture(async ({ sqlite, query }) => {
    sqlite.exec(`DROP INDEX ${nativeName}`);
    const racingQuery = async (sql, params) => {
      if (/^CREATE UNIQUE INDEX IF NOT EXISTS/.test(sql))
        sqlite.exec('CREATE INDEX idx_fields_collection_slug ON _emdash_fields(slug)');
      return query(sql, params);
    };
    await assert.rejects(ensureNativeSiteContentIndexes(racingQuery, { apply: true }), {
      code: 'NATIVE_SITE_INDEX_DEFINITION_CONFLICT',
    });
    assert.equal(
      sqlite.prepare('SELECT sql FROM sqlite_schema WHERE name = ?').get(nativeName).sql,
      'CREATE INDEX idx_fields_collection_slug ON _emdash_fields(slug)'
    );
  });
});

test('invalid query results and nonboolean operations cannot authorize a schema write', async () => {
  for (const result of [{ results: [] }, { success: true }, { success: false, results: [] }])
    await assert.rejects(
      inspectNativeSiteContentIndexes(async () => result),
      { code: 'NATIVE_SITE_INDEX_QUERY_INVALID' }
    );
  let calls = 0;
  await assert.rejects(
    ensureNativeSiteContentIndexes(
      async () => {
        calls++;
      },
      { apply: 'true' }
    ),
    { code: 'NATIVE_SITE_INDEX_OPERATION_INVALID' }
  );
  assert.equal(calls, 0);
});
