import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { Kysely, sql } from 'kysely';
import { createDialect } from 'emdash/db/sqlite';
import { runMigrations } from 'emdash/db';
import { applySeed, ContentRepository, FTSManager, OptionsRepository } from 'emdash';
import { composeD1ApplicationBackupSql, readD1ApplicationBackupPlan } from '../scripts/d1-application-backup.mjs';
import { downloadPresentationBackup } from '../scripts/initialize-site-content.mjs';

const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const literal = (value) => {
  if (value == null) return 'NULL';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (value instanceof Uint8Array) return "X'" + Buffer.from(value).toString('hex') + "'";
  return "'" + String(value).replaceAll("'", "''") + "'";
};
const query = (db) => async (statement) => (await sql.raw(statement).execute(db)).rows.map((row) => ({ ...row }));
const metadataApi = (read, exportBackup) => async (path, _method, body) => {
  if (path.endsWith('/query')) return [{ success: true, results: await read(body.sql) }];
  assert.ok(path.endsWith('/export'));
  return exportBackup(body);
};

// This mirrors a table-filtered SQL snapshot, including schema objects before
// INSERTs. Implicit rowids are intentionally not exported: native content IDs
// remain identical, while regenerated FTS must join to the restored rowids.
async function ordinarySnapshot(read, plan, includeObjects = true) {
  const schema = await read(
    'SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type, name;'
  );
  const statements = ['PRAGMA foreign_keys=OFF;', 'PRAGMA defer_foreign_keys=TRUE;'];
  for (const table of plan.tables)
    statements.push(schema.find((row) => row.type === 'table' && row.name === table).sql + ';');
  if (includeObjects) statements.push(...plan.supplementarySchema.map((row) => row.sql + ';'));
  for (const table of plan.tables) {
    for (const row of await read(`SELECT * FROM ${quote(table)};`)) {
      statements.push(
        `INSERT INTO ${quote(table)} (${Object.keys(row).map(quote).join(',')}) VALUES (${Object.values(row).map(literal).join(',')});`
      );
    }
  }
  return Buffer.from(statements.join('\n'));
}

async function withNativePosts(callback) {
  const db = new Kysely({ dialect: createDialect({ url: ':memory:' }) });
  try {
    await runMigrations(db);
    await applySeed(
      db,
      {
        version: '1',
        collections: [
          {
            slug: 'posts',
            label: 'Posts',
            supports: ['search'],
            fields: [
              { slug: 'title', label: 'Title', type: 'string', searchable: true },
              { slug: 'excerpt', label: 'Excerpt', type: 'text', searchable: true },
              { slug: 'content', label: 'Article', type: 'portableText', searchable: true },
            ],
          },
        ],
      },
      { onConflict: 'skip' }
    );
    await new FTSManager(db).rebuildIndex('posts', ['title', 'excerpt', 'content']);
    await callback(db, query(db));
  } finally {
    await db.destroy();
  }
}

const selectedPosts = (sqlite, phrase) =>
  sqlite
    .prepare(
      `SELECT c.slug FROM _emdash_fts_posts AS f JOIN ec_posts AS c ON c.rowid=f.rowid WHERE _emdash_fts_posts MATCH ? AND c.status='published' AND c.deleted_at IS NULL ORDER BY c.slug`
    )
    .all(phrase)
    .map((row) => row.slug);

test('one complete ordinary snapshot restores native SDK FTS, prose, rowids and existing sync triggers', async () => {
  await withNativePosts(async (db, read) => {
    const repository = new ContentRepository(db);
    const create = (slug, status, data) => repository.create({ type: 'posts', slug, locale: 'zh', status, data });
    const removed = await create('removed-rowid', 'published', { title: 'Removed', excerpt: 'Removed', content: [] });
    const prose = [
      { _type: 'block', style: 'normal', children: [{ _type: 'span', text: "搜索 测试 O'Reilly lexicalfixture" }] },
      { _type: 'image', alt: 'accessiblefixture', caption: 'captionfixture' },
      { _type: 'code', code: 'codefixture' },
    ];
    const published = await create('published-article', 'published', {
      title: "真实发布 O'Reilly",
      excerpt: '中文 搜索 内容',
      content: prose,
    });
    await create('draft-article', 'draft', { title: 'Unpublished', excerpt: 'lexicalfixture', content: [] });
    const deleted = await create('trashed-article', 'published', {
      title: 'Trashed',
      excerpt: 'deletedfixture',
      content: [],
    });
    await db.deleteFrom('ec_posts').where('id', '=', removed.id).execute();
    await db
      .updateTable('ec_posts')
      .set({ deleted_at: '2026-10-03T00:00:00.000Z' })
      .where('id', '=', deleted.id)
      .execute();
    // Legacy portable-text scalar/string/null values use native extraction's fallback.
    const legacy = await create('legacy-text', 'published', { title: 'Legacy', excerpt: '', content: [] });
    await db
      .updateTable('ec_posts')
      .set({ content: 'legacyfixture plain prose' })
      .where('id', '=', legacy.id)
      .execute();
    const scalar = await create('legacy-scalar', 'published', { title: 'Scalar', excerpt: '', content: [] });
    await db.updateTable('ec_posts').set({ content: '2024' }).where('id', '=', scalar.id).execute();
    const nullable = await create('legacy-null', 'published', { title: 'Null', excerpt: '', content: [] });
    await db.updateTable('ec_posts').set({ content: null }).where('id', '=', nullable.id).execute();
    await new OptionsRepository(db).set('site:title', { text: "Site ' 中文" });
    await sql.raw('CREATE TABLE "_emdash_fts_user_notes" (id TEXT PRIMARY KEY, payload BLOB);').execute(db);
    await db
      .insertInto('_emdash_fts_user_notes')
      .values({ id: 'ordinary-prefix', payload: Buffer.from([0, 1, 255]) })
      .execute();
    await sql.raw('CREATE TABLE "_cf_KV" (key TEXT, value TEXT);').execute(db);
    await sql.raw("INSERT INTO _cf_KV VALUES ('internal', 'excluded');").execute(db);
    await sql.raw("CREATE VIEW published_titles AS SELECT title FROM ec_posts WHERE status='published';").execute(db);
    const plan = await readD1ApplicationBackupPlan(read);
    assert.ok(
      plan.tables.includes('_emdash_fts_user_notes'),
      'ordinary tables are never excluded by an FTS-looking prefix'
    );
    assert.ok(plan.tables.includes('users') && plan.tables.includes('credentials') && plan.tables.includes('options'));
    assert.ok(!plan.tables.includes('_cf_KV'));
    assert.ok(
      !plan.tables.some((table) => plan.nativeFts.some((fts) => table === fts.name || table.startsWith(fts.name + '_')))
    );
    assert.equal(plan.nativeFts.length, 1);
    assert.equal(
      plan.supplementarySchema.filter((row) => row.type === 'trigger' && row.name.startsWith('_emdash_fts_posts_'))
        .length,
      3
    );
    const sourceContent = await read('SELECT * FROM ec_posts ORDER BY id;');
    const sourceIndex = await read('SELECT id, locale, title, excerpt, content FROM _emdash_fts_posts ORDER BY id;');
    const sourceRowids = await read('SELECT rowid, id FROM ec_posts ORDER BY id;');
    const dump = await ordinarySnapshot(read, plan);
    const calls = [];
    const downloaded = await downloadPresentationBackup(
      metadataApi(read, async (body) => {
        calls.push(body);
        return {
          status: 'complete',
          at_bookmark: 'native-snapshot',
          result: { signed_url: 'https://backup.example.test/snapshot.sql' },
        };
      }),
      async () => new Response(dump),
      async () => {}
    );
    assert.equal(calls.length, 1, 'all ordinary tables share one export snapshot');
    assert.deepEqual(calls[0].dump_options.tables, plan.tables);
    assert.equal(downloaded.proof.format, 'cinagroup-d1-application-sql-v1');
    assert.equal(downloaded.proof.tableCount, plan.tables.length);
    assert.equal(downloaded.proof.ftsIndexCount, 1);
    assert.ok(downloaded.bytes.includes(dump), 'the returned ordinary export bytes are preserved');
    for (const includeObjects of [true, false]) {
      const restored = new DatabaseSync(':memory:');
      try {
        restored.exec(
          includeObjects
            ? downloaded.bytes.toString('utf8')
            : composeD1ApplicationBackupSql(plan, await ordinarySnapshot(read, plan, false)).toString('utf8')
        );
        assert.deepEqual(restored.prepare('PRAGMA foreign_key_check;').all(), []);
        assert.deepEqual(
          restored
            .prepare('SELECT * FROM ec_posts ORDER BY id;')
            .all()
            .map((row) => ({ ...row })),
          sourceContent
        );
        assert.deepEqual(
          restored
            .prepare('SELECT id, locale, title, excerpt, content FROM _emdash_fts_posts ORDER BY id;')
            .all()
            .map((row) => ({ ...row })),
          sourceIndex
        );
        assert.notDeepEqual(
          restored
            .prepare('SELECT rowid, id FROM ec_posts ORDER BY id;')
            .all()
            .map((row) => ({ ...row })),
          sourceRowids,
          'restoring implicit rowids changes their values'
        );
        assert.equal(
          restored
            .prepare(
              'SELECT COUNT(*) AS count FROM _emdash_fts_posts f JOIN ec_posts c ON f.rowid=c.rowid AND f.id=c.id WHERE c.deleted_at IS NULL'
            )
            .get().count,
          sourceIndex.length
        );
        assert.deepEqual(selectedPosts(restored, 'lexicalfixture'), ['published-article']);
        assert.deepEqual(selectedPosts(restored, '搜索'), ['published-article']);
        for (const term of ['accessiblefixture', 'captionfixture', 'codefixture'])
          assert.deepEqual(selectedPosts(restored, term), ['published-article']);
        assert.deepEqual(selectedPosts(restored, '_type'), [], 'Portable Text structure is not indexed');
        assert.deepEqual(selectedPosts(restored, 'deletedfixture'), []);
        assert.deepEqual(selectedPosts(restored, 'legacyfixture'), ['legacy-text']);
        assert.equal(
          Buffer.from(restored.prepare('SELECT payload FROM _emdash_fts_user_notes').get().payload).toString('hex'),
          '0001ff'
        );
        assert.equal(
          restored.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name='_cf_KV'").get().count,
          0
        );
        assert.ok(restored.prepare('SELECT * FROM published_titles;').all().length > 0, 'omitted views are restored');
        restored
          .prepare('UPDATE ec_posts SET content=? WHERE id=?')
          .run(JSON.stringify([{ text: 'updatedfixture' }]), published.id);
        assert.deepEqual(selectedPosts(restored, 'updatedfixture'), ['published-article']);
        assert.deepEqual(selectedPosts(restored, 'lexicalfixture'), []);
        restored.prepare('UPDATE ec_posts SET deleted_at=? WHERE id=?').run('2026-10-04T00:00:00.000Z', published.id);
        assert.deepEqual(selectedPosts(restored, 'updatedfixture'), []);
        restored.prepare('UPDATE ec_posts SET deleted_at=NULL WHERE id=?').run(published.id);
        assert.deepEqual(selectedPosts(restored, 'updatedfixture'), ['published-article']);
        restored.prepare('DELETE FROM ec_posts WHERE id=?').run(published.id);
        assert.deepEqual(selectedPosts(restored, 'updatedfixture'), []);
        restored
          .prepare('INSERT INTO ec_posts(id,slug,locale,status,title,excerpt,content) VALUES(?,?,?,?,?,?,?)')
          .run('new-native-id', 'new-article', 'zh', 'published', 'Inserted', 'insertfixture', '[]');
        assert.deepEqual(selectedPosts(restored, 'insertfixture'), ['new-article']);
      } finally {
        restored.close();
      }
    }
  });
});

test('the known baseline without FTS sync triggers remains faithfully restorable', async () => {
  await withNativePosts(async (db, read) => {
    for (const suffix of ['insert', 'update', 'delete'])
      await sql.raw(`DROP TRIGGER "_emdash_fts_posts_${suffix}";`).execute(db);
    await new ContentRepository(db).create({
      type: 'posts',
      slug: 'baseline-article',
      locale: 'en',
      status: 'published',
      data: { title: 'baselinefixture', excerpt: 'Saved content', content: [] },
    });
    const plan = await readD1ApplicationBackupPlan(read);
    assert.equal(
      plan.supplementarySchema.filter((row) => row.type === 'trigger' && row.name.startsWith('_emdash_fts_posts_'))
        .length,
      0
    );
    const restored = new DatabaseSync(':memory:');
    try {
      restored.exec(composeD1ApplicationBackupSql(plan, await ordinarySnapshot(read, plan)).toString('utf8'));
      assert.deepEqual(
        selectedPosts(restored, 'baselinefixture'),
        ['baseline-article'],
        'derived index is rebuilt from the ordinary snapshot'
      );
      assert.equal(
        restored
          .prepare(
            "SELECT COUNT(*) AS count FROM sqlite_schema WHERE type='trigger' AND name LIKE '_emdash_fts_posts_%'"
          )
          .get().count,
        0,
        'missing triggers are not invented'
      );
    } finally {
      restored.close();
    }
  });
});

test('unknown virtual modules, native external content and orphan shadows fail before export', async () => {
  const sqlite = new DatabaseSync(':memory:');
  const read = async (statement) => sqlite.prepare(statement).all();
  try {
    sqlite.exec('CREATE TABLE options(name TEXT); CREATE VIRTUAL TABLE arbitrary_search USING fts5(value);');
    await assert.rejects(readD1ApplicationBackupPlan(read), /Unsupported virtual table/);
    sqlite.exec(
      "DROP TABLE arbitrary_search; CREATE VIRTUAL TABLE _emdash_fts_posts USING fts5(id UNINDEXED, locale UNINDEXED, title, content='options', tokenize='porter unicode61');"
    );
    await assert.rejects(readD1ApplicationBackupPlan(read), /Unsupported native FTS fields or options/);
    sqlite.exec('DROP TABLE _emdash_fts_posts;');
    await assert.rejects(
      readD1ApplicationBackupPlan(async (statement) => {
        const rows = await read(statement);
        return statement.startsWith('PRAGMA table_list')
          ? [...rows, { schema: 'main', type: 'shadow', name: '_orphan_data' }]
          : rows;
      }),
      /Unknown or incomplete/
    );
  } finally {
    sqlite.close();
  }
});

test('ordinary SQL coverage ignores table-looking row strings and refuses incomplete snapshots', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('CREATE TABLE options(name TEXT); CREATE TABLE users(name TEXT);');
    const plan = await readD1ApplicationBackupPlan(async (statement) => sqlite.prepare(statement).all());
    await assert.rejects(
      async () =>
        composeD1ApplicationBackupSql(
          plan,
          Buffer.from(
            "CREATE TABLE options(name TEXT); INSERT INTO options VALUES ('; CREATE TABLE users(name TEXT); --');"
          )
        ),
      /complete application table inventory/
    );
    assert.throws(
      () =>
        composeD1ApplicationBackupSql(
          plan,
          Buffer.from('CREATE TABLE options(name TEXT); CREATE TABLE users(name TEXT); CREATE TABLE extra(name TEXT);')
        ),
      /complete application table inventory/
    );
    assert.throws(
      () =>
        composeD1ApplicationBackupSql(
          plan,
          Buffer.from(
            'CREATE TABLE options(name TEXT); CREATE TABLE users(name TEXT); CREATE VIRTUAL TABLE hidden USING fts5(value);'
          )
        ),
      /unexpectedly contains a virtual/
    );
  } finally {
    sqlite.close();
  }
});

test('catalog changes during an export stop before returning a backup proof', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('CREATE TABLE options(name TEXT);');
    let exports = 0;
    const api = metadataApi(
      async (statement) => sqlite.prepare(statement).all(),
      async () => {
        exports++;
        return {
          status: 'complete',
          at_bookmark: 'snapshot',
          result: { signed_url: 'https://backup.example.test/snapshot.sql' },
        };
      }
    );
    await assert.rejects(
      downloadPresentationBackup(api, async () => {
        sqlite.exec('CREATE TABLE concurrent_model(name TEXT);');
        return new Response('CREATE TABLE options(name TEXT);');
      }),
      /schema changed during export/
    );
    assert.equal(exports, 1);
  } finally {
    sqlite.close();
  }
});
