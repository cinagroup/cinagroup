import { createHash } from 'node:crypto';

const identifier = /^[a-z][a-z0-9_]{0,127}$/;
const shadowSuffixes = ['data', 'idx', 'content', 'docsize', 'config'];
const systemName = (name) => /^sqlite_/i.test(name) || name.toLowerCase() === '_cf_kv';
const quoted = (name) => '"' + name.replaceAll('"', '""') + '"';
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function nativeFtsDefinition(name, ddl) {
  const collection = name.slice('_emdash_fts_'.length);
  if (!name.startsWith('_emdash_fts_') || !identifier.test(collection))
    throw new Error('Unsupported virtual table in application backup');
  const matched =
    /^\s*CREATE\s+VIRTUAL\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([a-z0-9_]+)"|([a-z0-9_]+))\s+USING\s+fts5\s*\(([\s\S]*)\)\s*;?\s*$/i.exec(
      ddl ?? ''
    );
  if (!matched || (matched[1] ?? matched[2]) !== name) throw new Error('Unsupported native FTS definition');
  const parts = matched[3].split(',').map((part) => part.trim());
  if (!/^"?id"?\s+UNINDEXED$/i.test(parts.shift() ?? '') || !/^"?locale"?\s+UNINDEXED$/i.test(parts.shift() ?? ''))
    throw new Error('Unsupported native FTS identity columns');
  const tokenizer = /^tokenize\s*=\s*'(porter unicode61|unicode61|trigram)'$/i.exec(parts.pop() ?? '');
  const fields = parts.map((part) => /^"?([a-z][a-z0-9_]*)"?$/.exec(part)?.[1]);
  if (
    !tokenizer ||
    !fields.length ||
    fields.some((field) => !field || !identifier.test(field) || ['id', 'locale', 'rowid'].includes(field)) ||
    new Set(fields).size !== fields.length
  )
    throw new Error('Unsupported native FTS fields or options');
  return {
    name,
    collection,
    contentTable: `ec_${collection}`,
    fields,
    tokenizer: tokenizer[1],
    ddl: ddl.trim().replace(/;$/, '') + ';',
  };
}

/** Only metadata is queried; no FTS rows or business data are read separately from the export snapshot. */
export async function readD1ApplicationBackupPlan(query) {
  const objects = await query('PRAGMA table_list;');
  if (
    !Array.isArray(objects) ||
    objects.some(
      (row) =>
        !row ||
        typeof row.name !== 'string' ||
        !['main', 'temp'].includes(row.schema) ||
        !['table', 'view', 'virtual', 'shadow'].includes(row.type)
    )
  )
    throw new Error('Application backup table inventory is invalid');
  const main = objects.filter((row) => row.schema === 'main' && !systemName(row.name));
  if (new Set(main.map((row) => row.name)).size !== main.length)
    throw new Error('Application backup table inventory is ambiguous');
  const schema = await query(
    'SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type, name;'
  );
  if (
    !Array.isArray(schema) ||
    schema.some(
      (row) =>
        !row ||
        typeof row.name !== 'string' ||
        typeof row.tbl_name !== 'string' ||
        typeof row.sql !== 'string' ||
        !['table', 'view', 'index', 'trigger'].includes(row.type)
    )
  )
    throw new Error('Application backup schema inventory is invalid');
  const nativeFts = main
    .filter((row) => row.type === 'virtual')
    .map((row) =>
      nativeFtsDefinition(row.name, schema.find((entry) => entry.type === 'table' && entry.name === row.name)?.sql)
    );
  const expectedShadows = new Set(nativeFts.flatMap((fts) => shadowSuffixes.map((suffix) => `${fts.name}_${suffix}`)));
  const actualShadows = main.filter((row) => row.type === 'shadow');
  if (actualShadows.some((row) => !expectedShadows.has(row.name)) || actualShadows.length !== expectedShadows.size)
    throw new Error('Unknown or incomplete virtual-table shadow inventory');
  const tables = main
    .filter((row) => row.type === 'table')
    .map((row) => row.name)
    .sort();
  if (!tables.length) throw new Error('Application backup requires a nonempty explicit ordinary-table selection');
  if (tables.some((name) => !schema.some((row) => row.type === 'table' && row.name === name)))
    throw new Error('Application backup ordinary schema is incomplete');
  let metadata = [];
  if (nativeFts.length) {
    if (!tables.includes('_emdash_collections') || !tables.includes('_emdash_fields'))
      throw new Error('Native FTS collection metadata is unavailable');
    metadata = await query(
      'SELECT c.id AS collection_id, c.slug AS collection_slug, c.search_config, f.slug AS field_slug, f.type AS field_type, f.searchable FROM _emdash_collections AS c LEFT JOIN _emdash_fields AS f ON f.collection_id = c.id ORDER BY c.slug, f.slug;'
    );
    if (!Array.isArray(metadata)) throw new Error('Native FTS field inventory is invalid');
  }
  for (const fts of nativeFts) {
    if (!tables.includes(fts.contentTable)) throw new Error('Native FTS content table is unavailable');
    const fields = metadata.filter((row) => row.collection_slug === fts.collection && Number(row.searchable) === 1);
    if (
      fields.length !== fts.fields.length ||
      fields.some((field) => !fts.fields.includes(field.field_slug) || typeof field.field_type !== 'string') ||
      new Set(fields.map((field) => field.field_slug)).size !== fields.length
    )
      throw new Error('Native FTS fields do not match registered searchable fields');
    const columns = await query(`PRAGMA table_info(${quoted(fts.contentTable)});`);
    if (
      !Array.isArray(columns) ||
      ['id', 'locale', 'deleted_at', ...fts.fields].some((name) => !columns.some((column) => column.name === name))
    )
      throw new Error('Native FTS content columns are incomplete');
    fts.fieldTypes = fts.fields.map((name) => fields.find((field) => field.field_slug === name).field_type);
  }
  const internal = new Set([
    '_cf_KV',
    ...objects.filter((row) => row.schema === 'main' && systemName(row.name)).map((row) => row.name),
  ]);
  const businessSchema = schema.filter((row) => !systemName(row.name) && !internal.has(row.tbl_name));
  const schemaSha256 = hash({
    tables: main
      .map(({ name, type, ncol, wr, strict }) => ({ name, type, ncol, wr, strict }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    schema: businessSchema,
    metadata,
    nativeFts,
  });
  // A table-filtered export need not include views or associated schema objects.
  // Retain their exact definitions too; IF NOT EXISTS avoids duplicate creation.
  const supplementarySchema = businessSchema.filter(
    (row) => ['index', 'trigger', 'view'].includes(row.type) && !expectedShadows.has(row.tbl_name)
  );
  return { tables, nativeFts, supplementarySchema, schemaSha256 };
}

function searchValueExpression(reference, type) {
  if (type !== 'portableText') return reference;
  // Kept in lockstep with installed EmDash FTSManager and migration 064:
  // self-contained FTS stores prose rather than Portable Text JSON tokens.
  return `CASE WHEN ${reference} IS NULL THEN NULL WHEN json_valid(${reference}) AND json_type(${reference}) IN ('array', 'object') THEN (SELECT group_concat(j.value, ' ') FROM json_tree(${reference}) AS j WHERE j.key IN ('text', 'alt', 'caption', 'code') AND j.type = 'text') ELSE ${reference} END`;
}
function ifNotExists(row) {
  const expression = /^\s*CREATE\s+(UNIQUE\s+)?(INDEX|TRIGGER|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?/i;
  if (!expression.test(row.sql)) throw new Error('Unsupported supplementary application schema');
  return (
    row.sql
      .replace(expression, (_match, unique, type) => `CREATE ${unique ?? ''}${type} IF NOT EXISTS `)
      .trim()
      .replace(/;$/, '') + ';'
  );
}

/** SQL statement boundaries outside strings/comments; table-looking text inside row values is ignored. */
function statementStarts(sql) {
  const starts = [];
  let start = 0;
  let quote;
  for (let index = 0; index < sql.length; index++) {
    const character = sql[index];
    if (quote) {
      if (character === quote) {
        if (sql[index + 1] === quote) index++;
        else quote = undefined;
      }
      continue;
    }
    if (character === '-' && sql[index + 1] === '-') {
      const end = sql.indexOf('\n', index + 2);
      index = end < 0 ? sql.length : end;
      continue;
    }
    if (character === '/' && sql[index + 1] === '*') {
      const end = sql.indexOf('*/', index + 2);
      if (end < 0) throw new Error('Unterminated export SQL comment');
      index = end + 1;
      continue;
    }
    if (["'", '"', '`', '['].includes(character)) {
      quote = character === '[' ? ']' : character;
      continue;
    }
    if (character === ';') {
      starts.push(
        sql
          .slice(start, index + 1)
          .replace(/^\s*(?:(?:--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)\s*)*/, '')
          .trim()
      );
      start = index + 1;
    }
  }
  if (quote) throw new Error('Unterminated export SQL string');
  starts.push(sql.slice(start).trim());
  return starts;
}
export function composeD1ApplicationBackupSql(plan, exportBytes) {
  const exported = Buffer.from(exportBytes).toString('utf8');
  if (!exported.trim()) throw new Error('Production backup download was empty');
  const declared = new Set();
  for (const statement of statementStarts(exported)) {
    if (/^CREATE\s+VIRTUAL\s+TABLE\b/i.test(statement))
      throw new Error('Ordinary export unexpectedly contains a virtual table');
    const table =
      /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"((?:[^"\n]|"")+)"|`((?:[^`\n]|``)+)`|\[([^\]\n]+)\]|([^\s(]+))\s*\(/i.exec(
        statement
      );
    if (table) declared.add((table[1] ?? table[2] ?? table[3] ?? table[4]).replaceAll('""', '"').replaceAll('``', '`'));
  }
  if (
    plan.tables.some((name) => !declared.has(name)) ||
    [...declared].some((name) => !plan.tables.includes(name) && !systemName(name))
  )
    throw new Error('Ordinary export does not match the complete application table inventory');
  const prelude =
    [
      '-- CinaGroup D1 application backup v1: ordinary snapshot plus derived native FTS recovery.',
      '-- Native virtual definitions precede data because exported triggers may reference them.',
      ...plan.nativeFts.map((fts) => fts.ddl),
    ].join('\n') + '\n';
  const indexSql = plan.nativeFts.map((fts) => {
    const values = fts.fields.map((field, index) =>
      searchValueExpression(`${quoted(fts.contentTable)}.${quoted(field)}`, fts.fieldTypes[index])
    );
    return `DELETE FROM ${quoted(fts.name)};\nINSERT OR REPLACE INTO ${quoted(fts.name)}(rowid, id, locale, ${fts.fields.map(quoted).join(', ')}) SELECT rowid, id, locale, ${values.join(', ')} FROM ${quoted(fts.contentTable)} WHERE deleted_at IS NULL;`;
  });
  const suffix =
    [
      '-- Preserve application schema objects even if the table-filtered export omitted them.',
      ...plan.supplementarySchema.map(ifNotExists),
      '-- Rebuild native FTS from restored ordinary content, using restored rowids.',
      ...indexSql,
    ].join('\n') + '\n';
  return Buffer.concat([Buffer.from(prelude), Buffer.from(exportBytes), Buffer.from('\n' + suffix)]);
}
