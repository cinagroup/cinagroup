import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { sql } from 'kysely';
import { SchemaRegistry } from 'emdash';
import { SITE_APPEARANCE_FIELDS } from '../src/emdash/site-appearance.ts';
import { ACCOUNT, DATABASE, WORKER, productionApi, verifyProductionConfig } from './emdash-production.mjs';
import { createPresentationD1Database, downloadPresentationBackup } from './initialize-site-content.mjs';
import { importPresentationCaptureTrigger } from './presentation-d1-capture-import.mjs';
import { sealSiteContentBackup } from './site-content-backup.mjs';

const COLLECTION = 'site_profile';
const BASE_FIELDS = {
  title: 'string',
  site_name: 'string',
  tagline: 'text',
  contact_email: 'string',
  footer_description: 'text',
  header_cta_label: 'string',
  header_cta_href: 'string',
  logo_dark: 'image',
  extra_social_links: 'repeater',
};
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const contract = (field) => ({
  slug: field.slug,
  label: field.label,
  type: field.type,
  required: field.required ?? false,
  unique: field.unique ?? false,
  translatable: field.translatable ?? true,
  searchable: field.searchable ?? false,
  indexed: field.indexed ?? false,
  defaultValue: field.defaultValue ?? null,
  widget: field.widget ?? null,
  options: field.options ?? null,
  validation: field.validation ?? null,
});
const fail = (code) => {
  throw new Error(code);
};

/** Read-only, bounded to the existing presentation model. No initialization is replayed. */
export async function planSiteAppearanceSchema(db) {
  const collection = await new SchemaRegistry(db).getCollectionWithFields(COLLECTION);
  if (
    !collection ||
    collection.routable !== false ||
    !['drafts', 'revisions'].every((support) => collection.supports.includes(support))
  )
    fail('SITE_APPEARANCE_COLLECTION_CONFLICT');
  for (const [slug, type] of Object.entries(BASE_FIELDS)) {
    const field = collection.fields.find((candidate) => candidate.slug === slug);
    if (!field || field.type !== type || field.translatable !== true) fail('SITE_APPEARANCE_BASE_SCHEMA_CONFLICT');
  }
  const { rows: columns } = await sql`PRAGMA table_info("ec_site_profile")`.execute(db);
  const { rows: captureTriggers } =
    await sql`SELECT name, tbl_name, sql FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = 'ec_site_profile' AND name LIKE 'emdash_mu_%' ORDER BY name`.execute(
      db
    );
  const captureOwner = await db
    .selectFrom('_emdash_media_usage_index_status')
    .select(['collection_id', 'scope_key', 'adapter_id', 'scope_type', 'capture_state', 'schema_version'])
    .where('scope_key', '=', COLLECTION)
    .where('adapter_id', '=', 'content-media')
    .where('scope_type', '=', 'collection')
    .executeTakeFirst();
  if (captureTriggers.length && (captureTriggers.length !== 3 || captureOwner?.collection_id !== collection.id))
    fail('SITE_APPEARANCE_CAPTURE_CONFLICT');
  const captureSha256 = digest({ triggers: captureTriggers, owner: captureOwner });
  const add = [];
  const preserve = [];
  for (const input of SITE_APPEARANCE_FIELDS) {
    const field = collection.fields.find((candidate) => candidate.slug === input.slug);
    const column = columns.find((candidate) => candidate.name === input.slug);
    if (!field) {
      // A committed column without its metadata (or vice versa) is not silently repaired.
      if (column) fail('SITE_APPEARANCE_ORPHAN_COLUMN');
      add.push(input.slug);
      continue;
    }
    if (!isDeepStrictEqual(contract(field), contract(input))) fail('SITE_APPEARANCE_FIELD_CONFLICT');
    const storage = input.type === 'integer' ? 'INTEGER' : 'TEXT';
    if (!column || column.type.toUpperCase() !== storage || column.notnull !== 0 || column.dflt_value !== null)
      fail('SITE_APPEARANCE_COLUMN_CONFLICT');
    preserve.push(input.slug);
  }
  const plan = {
    version: 1,
    collection: COLLECTION,
    collectionId: collection.id,
    status: add.length ? 'addition-required' : 'already-complete',
    scope: { schemaOnly: true, optionalNonTranslatableFields: 19, contentWrites: false, initializationReplay: false },
    add,
    preserve,
    definitionSha256: digest(SITE_APPEARANCE_FIELDS),
    captureSha256,
    schemaSha256: digest({
      id: collection.id,
      supports: collection.supports,
      routable: collection.routable,
      fields: collection.fields
        .map((field) => ({ id: field.id, sortOrder: field.sortOrder, ...contract(field) }))
        .sort((a, b) => a.slug.localeCompare(b.slug)),
      columns,
    }),
    protectedSchemaSha256: digest({
      id: collection.id,
      supports: collection.supports,
      routable: collection.routable,
      fields: collection.fields
        .filter((field) => !SITE_APPEARANCE_FIELDS.some((input) => input.slug === field.slug))
        .map((field) => ({ id: field.id, sortOrder: field.sortOrder, ...contract(field) }))
        .sort((a, b) => a.slug.localeCompare(b.slug)),
      columns: columns.filter((column) => !SITE_APPEARANCE_FIELDS.some((input) => input.slug === column.name)),
      captureSha256,
    }),
  };
  return { ...plan, planSha256: digest(plan) };
}

/** The caller must review the plan and durably save a verified backup before writes. */
export async function applySiteAppearanceSchema(db, { expectedPlanSha256, beforeApply } = {}) {
  const initial = await planSiteAppearanceSchema(db);
  if (!/^[a-f0-9]{64}$/.test(expectedPlanSha256 ?? '') || initial.planSha256 !== expectedPlanSha256)
    fail('SITE_APPEARANCE_PLAN_CHANGED');
  if (initial.status === 'already-complete') return { ...initial, added: [] };
  if (typeof beforeApply !== 'function') fail('SITE_APPEARANCE_BACKUP_REQUIRED');
  await beforeApply(initial);
  if ((await planSiteAppearanceSchema(db)).planSha256 !== initial.planSha256) fail('SITE_APPEARANCE_PLAN_CHANGED');
  const registry = new SchemaRegistry(db);
  const added = [];
  for (const slug of initial.add) {
    const current = await planSiteAppearanceSchema(db);
    if (
      current.collectionId !== initial.collectionId ||
      current.protectedSchemaSha256 !== initial.protectedSchemaSha256 ||
      !current.add.includes(slug)
    )
      fail('SITE_APPEARANCE_PLAN_CHANGED');
    const input = SITE_APPEARANCE_FIELDS.find((field) => field.slug === slug);
    // Public native registry maintains the physical column, metadata and capture state.
    // D1 writes are not transactional; stop on any failure and require a fresh plan.
    await registry.createField(COLLECTION, structuredClone(input));
    added.push(slug);
  }
  const final = await planSiteAppearanceSchema(db);
  if (final.status !== 'already-complete' || final.protectedSchemaSha256 !== initial.protectedSchemaSha256)
    fail('SITE_APPEARANCE_VERIFICATION_FAILED');
  return { ...final, added };
}

async function main() {
  const [operation = 'plan', expectedPlanSha256] = process.argv.slice(2);
  if (!['plan', 'apply'].includes(operation) || (operation === 'plan' && expectedPlanSha256) || process.argv.length > 4)
    fail('Usage: update-site-appearance.mjs plan | apply <reviewed-plan-sha256>');
  verifyProductionConfig(JSON.parse(readFileSync('wrangler.production.jsonc', 'utf8').replace(/,\s*([}\]])/g, '$1')));
  const database = await productionApi(`/accounts/${ACCOUNT}/d1/database/${DATABASE}`);
  if (database.name !== WORKER) fail('SITE_APPEARANCE_DATABASE_CONFLICT');
  const query = async (statement, params = []) => {
    const result = await productionApi(`/accounts/${ACCOUNT}/d1/database/${DATABASE}/query`, 'POST', {
      sql: statement,
      params,
    });
    if (!Array.isArray(result) || result.length !== 1 || result[0].success !== true || !result[0].meta)
      fail('SITE_APPEARANCE_D1_QUERY_FAILED');
    return result[0];
  };
  const db = createPresentationD1Database(query, { captureImport: importPresentationCaptureTrigger });
  try {
    if (operation === 'plan') {
      console.log(JSON.stringify(await planSiteAppearanceSchema(db), null, 2));
      return;
    }
    const result = await applySiteAppearanceSchema(db, {
      expectedPlanSha256,
      async beforeApply(plan) {
        const { bytes, proof } = await downloadPresentationBackup();
        const sealed = sealSiteContentBackup(
          bytes,
          readFileSync(new URL('./keys/site-content-backup-public.pem', import.meta.url), 'utf8'),
          proof
        );
        // Exclusive creation preserves every earlier backup. Plaintext SQL is never written.
        mkdirSync('.backups', { recursive: true });
        const path = resolve(
          '.backups',
          `site-appearance-backup-${Date.now()}-${plan.planSha256.slice(0, 12)}.enc.json`
        );
        writeFileSync(path, JSON.stringify(sealed) + '\n', { mode: 0o600, flag: 'wx' });
        console.log(JSON.stringify({ backupPath: path, backup: proof, keyFingerprint: sealed.keyFingerprint }));
      },
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.destroy();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    // Native SDK messages can include SQL; avoid logging statements or private rows.
    console.error(
      /^(?:SITE_APPEARANCE_|Usage:|Cloudflare \d+ codes )/.test(error?.message ?? '')
        ? error.message
        : 'SITE_APPEARANCE_UPDATE_FAILED; inspect the reviewed backup and schema before a fresh plan'
    );
    process.exitCode = 1;
  }
}
