const indexName = 'idx_fields_collection_slug';
const tableName = '_emdash_fields';
const nativeDefinition = `CREATE UNIQUE INDEX "${indexName}" ON "${tableName}" ("collection_id", "slug")`;
const requiredColumns = {
  id: 'TEXT',
  collection_id: 'TEXT',
  slug: 'TEXT',
  label: 'TEXT',
  type: 'TEXT',
  column_type: 'TEXT',
  required: 'INTEGER',
  unique: 'INTEGER',
  default_value: 'TEXT',
  validation: 'TEXT',
  widget: 'TEXT',
  options: 'TEXT',
  sort_order: 'INTEGER',
  created_at: 'TEXT',
  searchable: 'INTEGER',
  translatable: 'INTEGER',
  indexed: 'INTEGER',
};

export class NativeSiteContentIndexError extends Error {
  constructor(code) {
    super(code);
    this.name = 'NativeSiteContentIndexError';
    this.code = code;
  }
}

const fail = (code) => {
  throw new NativeSiteContentIndexError(code);
};
const normalizeDdl = (sql) => sql.replace(/\s+/g, ' ').trim().replace(/;$/, '').toLowerCase();

/** Inspect the one original native unique index required by seed field resume. */
export async function inspectNativeSiteContentIndexes(query) {
  const rows = async (sql, params = []) => {
    const result = await query(sql, params);
    if (result?.success !== true || !Array.isArray(result.results)) fail('NATIVE_SITE_INDEX_QUERY_INVALID');
    return result.results;
  };
  const migration = await rows('SELECT name FROM "_emdash_migrations" WHERE name = ?', ['003_schema_registry']);
  if (migration.length !== 1 || migration[0].name !== '003_schema_registry')
    fail('NATIVE_SITE_INDEX_MIGRATION_MISSING');
  const columns = await rows(`PRAGMA table_info("${tableName}")`);
  for (const [name, type] of Object.entries(requiredColumns)) {
    const matches = columns.filter((column) => column.name === name);
    if (matches.length !== 1 || typeof matches[0].type !== 'string' || matches[0].type.toUpperCase() !== type)
      fail('NATIVE_SITE_INDEX_SCHEMA_UNSUPPORTED');
  }
  if (
    columns.find((column) => column.name === 'id').pk !== 1 ||
    ['collection_id', 'slug'].some((name) => columns.find((column) => column.name === name).notnull !== 1)
  )
    fail('NATIVE_SITE_INDEX_SCHEMA_UNSUPPORTED');
  const duplicate = await rows(
    `SELECT collection_id, slug, COUNT(*) AS duplicate_count FROM "${tableName}" GROUP BY collection_id, slug HAVING COUNT(*) > 1 LIMIT 1`
  );
  if (duplicate.length) fail('NATIVE_SITE_INDEX_DUPLICATE_FIELDS');
  const named = await rows('SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name = ?', [indexName]);
  const indexes = await rows(`PRAGMA index_list("${tableName}")`);
  const listed = indexes.filter((index) => index.name === indexName);
  if (!named.length && !listed.length)
    return { status: 'repair-required', index: indexName, table: tableName, definition: nativeDefinition };
  if (
    named.length !== 1 ||
    named[0].type !== 'index' ||
    named[0].tbl_name !== tableName ||
    typeof named[0].sql !== 'string' ||
    normalizeDdl(named[0].sql) !== normalizeDdl(nativeDefinition) ||
    listed.length !== 1 ||
    listed[0].unique !== 1 ||
    listed[0].partial !== 0
  )
    fail('NATIVE_SITE_INDEX_DEFINITION_CONFLICT');
  const indexedColumns = await rows(`PRAGMA index_info("${indexName}")`);
  if (
    indexedColumns.length !== 2 ||
    indexedColumns[0].seqno !== 0 ||
    indexedColumns[0].name !== 'collection_id' ||
    indexedColumns[1].seqno !== 1 ||
    indexedColumns[1].name !== 'slug'
  )
    fail('NATIVE_SITE_INDEX_DEFINITION_CONFLICT');
  return { status: 'already-present', index: indexName, table: tableName, definition: nativeDefinition };
}

/** Caller must complete its private application backup before setting apply. */
export async function ensureNativeSiteContentIndexes(query, { apply = false } = {}) {
  if (typeof apply !== 'boolean') fail('NATIVE_SITE_INDEX_OPERATION_INVALID');
  const plan = await inspectNativeSiteContentIndexes(query);
  if (!apply || plan.status === 'already-present') return plan;
  const result = await query(nativeDefinition.replace('INDEX ', 'INDEX IF NOT EXISTS '), []);
  if (result?.success !== true || !Array.isArray(result.results) || result.results.length)
    fail('NATIVE_SITE_INDEX_CREATE_UNCONFIRMED');
  const after = await inspectNativeSiteContentIndexes(query);
  if (after.status !== 'already-present') fail('NATIVE_SITE_INDEX_CREATE_UNCONFIRMED');
  return { ...after, status: 'repaired' };
}
