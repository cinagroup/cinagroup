import {
  applySeed,
  ContentRepository,
  MediaRepository,
  OptionsRepository,
  SchemaRegistry,
  isSafeHref,
  FIELD_TYPE_TO_COLUMN,
} from 'emdash';
import type { Database, CreateCollectionInput, CreateFieldInput } from 'emdash';
import type { SeedFile, SeedMenu, SeedMenuItem, SeedApplyResult, SeedCollection } from 'emdash/seed';
import { validateSeed } from 'emdash/seed';
import { sql, type Kysely } from 'kysely';

export const SITE_CONTENT_INITIALIZATION_MARKER = 'cinagroup:site-content-initialization:v1';
const COLLECTION_SLUGS: Record<string, readonly string[]> = {
  site_pages: ['home'],
  site_profile: ['site'],
  page_about: ['about'],
  page_services: ['services'],
  page_contact: ['contact'],
  page_pricing: ['pricing'],
  page_products: ['cinaseek', 'cinaclaw', 'cinatoken', 'cinaskill', 'cinachain'],
  page_english: [
    'about',
    'services',
    'contact',
    'pricing',
    'cinaseek',
    'cinaclaw',
    'cinatoken',
    'cinaskill',
    'cinachain',
    'work',
  ],
};
const COLLECTIONS = new Set(Object.keys(COLLECTION_SLUGS));
const MENUS = new Set(['primary', 'footer', 'footer-legal']);
const LOCALES = new Set(['en', 'zh', 'ja', 'ko', 'ru', 'es', 'fr', 'pt']);
const SETTINGS = new Set([
  'title',
  'tagline',
  'logo',
  'favicon',
  'url',
  'postsPerPage',
  'dateFormat',
  'timezone',
  'social',
  'seo',
]);

export interface InitializationPlan {
  collections: { create: string[]; preserve: string[]; resume?: string[] };
  content: { create: string[]; preserve: string[] };
  menus: { create: string[]; preserve: string[] };
  settings: { create: string[]; preserve: string[] };
}

interface InitializationMarker {
  version: 1;
  status: 'running' | 'failed' | 'complete';
  fingerprint: string;
  startedAt: string;
  completedAt?: string;
  initialPlan: InitializationPlan;
}

export interface SiteContentInitializationOptions {
  db: Kysely<Database>;
  /** Reviewed public data only; referenced media must already be registered and ready. */
  seed: SeedFile;
  /** Defaults to true. A dry run performs no writes, including no marker writes. */
  dryRun?: boolean;
  /** Resume a failed run of the identical seed. Running locks are never taken over. */
  resume?: boolean;
  /** Keep the running lock when remote transport cannot prove whether a write finished. */
  retainLockOnError?: (error: unknown) => boolean;
}

export interface SiteContentInitializationResult {
  status: 'dry-run' | 'complete' | 'already-complete';
  plan: InitializationPlan;
  result?: SeedApplyResult;
}

export class SiteContentInitializationError extends Error {
  public readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = 'SiteContentInitializationError';
  }
}

function fail(code: string): never {
  throw new SiteContentInitializationError(code);
}

function menuKey(menu: Pick<SeedMenu, 'name' | 'locale'>): string {
  return `${menu.name}:${menu.locale}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validatePublicData(value: unknown, mediaIds: Set<string>): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item) => validatePublicData(item, mediaIds));
    return;
  }
  const record = value as Record<string, unknown>;
  // $media downloads are not durably deduplicated across seed runs. Upload once
  // through the normal media pipeline, then supply persisted media references.
  if ('$media' in record || '$ref' in record) fail('UNRESOLVED_SEED_REFERENCE');
  if (record.provider === 'local') {
    if (typeof record.id !== 'string' || !record.id) fail('INVALID_MEDIA_REFERENCE');
    mediaIds.add(record.id);
  }
  if ('mediaId' in record) {
    if (typeof record.mediaId !== 'string' || !record.mediaId) fail('INVALID_MEDIA_REFERENCE');
    mediaIds.add(record.mediaId);
  }
  Object.values(record).forEach((item) => validatePublicData(item, mediaIds));
}

function validateMenuItems(items: SeedMenuItem[], locale: string): void {
  for (const item of items) {
    // Public navigation uses explicit existing routes; no automatic collection
    // URL mapping or content-reference fallback is introduced by initialization.
    if (item.type !== 'custom' || !item.url || !isSafeHref(item.url)) fail('INVALID_MENU_ROUTE');
    if (item.locale && item.locale !== locale) fail('MENU_LOCALE_MISMATCH');
    if (item.children) validateMenuItems(item.children, locale);
  }
}

export function validateSiteContentInitializationSeed(seed: SeedFile): Set<string> {
  if (!validateSeed(seed).valid) fail('INVALID_SEED');
  if (!seed.collections?.length || seed.collections.some((item) => !COLLECTIONS.has(item.slug)))
    fail('UNOWNED_COLLECTION');
  if (
    seed.taxonomies?.length ||
    seed.relations?.length ||
    seed.blockTypes?.length ||
    seed.redirects?.length ||
    seed.widgetAreas?.length ||
    seed.sections?.length ||
    seed.bylines?.length
  )
    fail('UNOWNED_SEED_STRUCTURE');
  const declared = new Set(seed.collections.map((item) => item.slug));
  const ids = new Set<string>();
  for (const [collection, entries] of Object.entries(seed.content ?? {})) {
    if (!declared.has(collection)) fail('UNOWNED_CONTENT');
    const identities = new Set<string>();
    for (const entry of entries) {
      if (!entry.locale || !LOCALES.has(entry.locale) || !entry.slug) fail('INVALID_CONTENT_IDENTITY');
      if (
        !COLLECTION_SLUGS[collection].includes(entry.slug) ||
        (collection === 'page_english' && entry.locale !== 'en')
      )
        fail('UNOWNED_CONTENT_SLUG');
      const identity = entry.slug + ':' + entry.locale;
      if (identities.has(identity) || ids.has(entry.id)) fail('DUPLICATE_CONTENT_IDENTITY');
      identities.add(identity);
      ids.add(entry.id);
    }
  }
  const menuKeys = new Set<string>();
  for (const menu of seed.menus ?? []) {
    if (!MENUS.has(menu.name) || !menu.locale || !LOCALES.has(menu.locale)) fail('UNOWNED_MENU');
    if (menuKeys.has(menuKey(menu))) fail('DUPLICATE_MENU');
    menuKeys.add(menuKey(menu));
    validateMenuItems(menu.items, menu.locale);
  }
  if (Object.keys(seed.settings ?? {}).some((key) => !SETTINGS.has(key))) fail('UNOWNED_SETTING');
  const mediaIds = new Set<string>();
  validatePublicData(seed.content, mediaIds);
  validatePublicData(seed.settings, mediaIds);
  return mediaIds;
}

/** Match the public SDK's applySeed input, including its explicit field defaults. */
function nativeSeedCollectionInput(collection: SeedCollection): {
  input: Omit<CreateCollectionInput, 'source'>;
  fields: CreateFieldInput[];
} {
  // Relations and block normalization can allocate identities. This narrow
  // recovery supports only the presentation schemas reviewed with this seed.
  if (collection.fields.some((field) => field.type === 'reference' || field.type === 'blocks'))
    fail('INITIALIZATION_SCHEMA_RESUME_UNSUPPORTED');
  return {
    input: {
      slug: collection.slug,
      label: collection.label,
      labelSingular: collection.labelSingular,
      description: collection.description,
      icon: collection.icon,
      admin: collection.admin,
      supports: collection.supports || [],
      urlPattern: collection.urlPattern,
      routable: collection.routable,
      hidden: collection.hidden,
      sortOrder: collection.sortOrder,
      group: collection.group,
      commentsEnabled: collection.commentsEnabled,
      editLocking: collection.editLocking,
    },
    fields: collection.fields.map((field) => ({
      slug: field.slug,
      label: field.label,
      type: field.type,
      required: field.required || false,
      unique: field.unique || false,
      searchable: field.searchable || false,
      indexed: field.indexed || false,
      translatable: field.translatable,
      defaultValue: field.defaultValue,
      validation: field.validation as CreateFieldInput['validation'],
      widget: field.widget,
      options: field.options,
    })),
  };
}

/** Pinned EmDash capture version 1 fingerprint, verified against SDK-created fixtures. */
async function nativeSeedCollectionFingerprint(collection: SeedCollection): Promise<string> {
  const { input, fields } = nativeSeedCollectionInput(collection);
  const supports = input.supports ?? ['drafts', 'revisions'];
  return (
    'media-usage-seed:v1:sha256:' +
    (await fingerprint({
      version: 1,
      collection: {
        slug: input.slug,
        label: input.label,
        labelSingular: input.labelSingular ?? null,
        description: input.description ?? null,
        icon: input.icon ?? null,
        admin: input.admin ?? null,
        supports,
        hasSeo: input.hasSeo ?? supports.includes('seo'),
        hidden: input.hidden ?? false,
        sortOrder: input.sortOrder ?? null,
        ...(input.group ? { group: input.group } : {}),
        commentsEnabled: input.commentsEnabled ?? false,
        ...(input.editLocking === false ? { editLocking: false } : {}),
        urlPattern: input.urlPattern ?? null,
        routable: input.routable ?? true,
      },
      fields: fields.map((field, sortOrder) => ({
        slug: field.slug,
        label: field.label,
        type: field.type,
        required: field.required ?? false,
        unique: field.unique ?? false,
        defaultValue: field.defaultValue === undefined ? null : JSON.stringify(field.defaultValue),
        validation: field.validation ? JSON.stringify(field.validation) : null,
        widget: field.widget ?? null,
        options: field.options ? JSON.stringify(field.options) : null,
        sortOrder,
        searchable: field.searchable ?? false,
        translatable: field.translatable ?? true,
      })),
    }))
  );
}

async function verifyRegisteredSchemaResume(
  db: Kysely<Database>,
  collection: SeedCollection,
  previous: InitializationMarker | undefined,
  collectionId: string
): Promise<boolean> {
  const lifecycle = await db
    .selectFrom('_emdash_media_usage_index_status')
    .select(['collection_id', 'capture_state', 'cursor'])
    .where('adapter_id', '=', 'content-media')
    .where('scope_type', '=', 'collection')
    .where('scope_key', '=', collection.slug)
    .executeTakeFirst();
  if (!lifecycle || !['installing', 'ready'].includes(lifecycle.capture_state ?? '')) return false;
  if (previous?.status !== 'failed' || !previous.initialPlan.collections.create.includes(collection.slug))
    fail('INITIALIZATION_SCHEMA_RESUME_NOT_OWNED');
  const activation = await db
    .selectFrom('_emdash_media_usage_activation')
    .select(['state', 'runtime_generation'])
    .where('task_key', '=', 'incremental_capture')
    .executeTakeFirst();
  if (
    activation?.state !== 'active' ||
    activation.runtime_generation !== 1 ||
    lifecycle.collection_id !== collectionId ||
    lifecycle.cursor !== (await nativeSeedCollectionFingerprint(collection))
  )
    fail('INITIALIZATION_SCHEMA_RESUME_IDENTITY_MISMATCH');
  const { input, fields } = nativeSeedCollectionInput(collection);
  const row = await db
    .selectFrom('_emdash_collections')
    .selectAll()
    .where('id', '=', collectionId)
    .executeTakeFirstOrThrow();
  const expected = {
    slug: input.slug,
    label: input.label,
    label_singular: input.labelSingular ?? null,
    description: input.description ?? null,
    icon: input.icon ?? null,
    admin_config: input.admin ? JSON.stringify(input.admin) : null,
    supports: JSON.stringify(input.supports ?? ['drafts', 'revisions']),
    source: 'seed',
    has_seo: input.supports?.includes('seo') ? 1 : 0,
    routable: input.routable === false ? 0 : 1,
    hidden: input.hidden ? 1 : 0,
    sort_order: input.sortOrder ?? null,
    nav_group: input.group?.trim() || null,
    comments_enabled: input.commentsEnabled ? 1 : 0,
    edit_locking: input.editLocking === false ? 0 : 1,
    url_pattern: input.urlPattern ?? null,
    title_field: null,
    date_field: null,
  };
  if (Object.entries(expected).some(([key, value]) => row[key as keyof typeof row] !== value))
    fail('INITIALIZATION_SCHEMA_RESUME_EDITED');
  const stored = await db.selectFrom('_emdash_fields').selectAll().where('collection_id', '=', collectionId).execute();
  const seen = new Set<string>();
  for (const actual of stored) {
    const sortOrder = fields.findIndex((field) => field.slug === actual.slug);
    const field = fields[sortOrder];
    if (!field || seen.has(actual.slug)) fail('INITIALIZATION_SCHEMA_RESUME_EDITED');
    seen.add(actual.slug);
    const expectedField = {
      slug: field.slug,
      label: field.label,
      type: field.type,
      column_type: FIELD_TYPE_TO_COLUMN[field.type],
      required: field.required ? 1 : 0,
      unique: field.unique ? 1 : 0,
      default_value: field.defaultValue === undefined ? null : JSON.stringify(field.defaultValue),
      validation: field.validation ? JSON.stringify(field.validation) : null,
      widget: field.widget ?? null,
      options: field.options ? JSON.stringify(field.options) : null,
      sort_order: sortOrder,
      searchable: field.searchable ? 1 : 0,
      indexed: field.indexed ? 1 : 0,
      translatable: field.translatable === false ? 0 : 1,
    };
    if (Object.entries(expectedField).some(([key, value]) => actual[key as keyof typeof actual] !== value))
      fail('INITIALIZATION_SCHEMA_RESUME_EDITED');
  }
  const content = await sql<{
    count: number;
  }>`SELECT COUNT(*) AS count FROM ${sql.ref('ec_' + collection.slug)}`.execute(db);
  if (content.rows[0]?.count !== 0) fail('INITIALIZATION_SCHEMA_RESUME_CONTENT_PRESENT');
  return true;
}

async function makePlan(
  db: Kysely<Database>,
  seed: SeedFile,
  previous?: InitializationMarker
): Promise<InitializationPlan> {
  const plan: InitializationPlan = {
    collections: { create: [], preserve: [], resume: [] },
    content: { create: [], preserve: [] },
    menus: { create: [], preserve: [] },
    settings: { create: [], preserve: [] },
  };
  const registry = new SchemaRegistry(db);
  const content = new ContentRepository(db);
  const existingCollections = new Set<string>();
  for (const collection of seed.collections ?? []) {
    const existing = await registry.getCollectionWithFields(collection.slug);
    if (!existing) {
      plan.collections.create.push(collection.slug);
      continue;
    }
    if (await verifyRegisteredSchemaResume(db, collection, previous, existing.id)) {
      plan.collections.resume!.push(collection.slug);
      continue;
    }
    // skip preserves whole existing collections, so missing or changed fields
    // must be reviewed rather than silently accepting a partly applied schema.
    if (
      collection.fields.some((field) => {
        const actual = existing.fields.find((candidate) => candidate.slug === field.slug);
        return !actual || actual.type !== field.type || actual.translatable !== (field.translatable ?? true);
      }) ||
      (existing.routable !== false) !== (collection.routable !== false)
    )
      fail('EXISTING_SCHEMA_INCOMPATIBLE');
    existingCollections.add(collection.slug);
    plan.collections.preserve.push(collection.slug);
  }
  for (const [collection, entries] of Object.entries(seed.content ?? {})) {
    for (const entry of entries) {
      const key = `${collection}:${entry.slug}:${entry.locale}`;
      const existing = existingCollections.has(collection)
        ? await content.findBySlugIncludingTrashed(collection, entry.slug!, entry.locale)
        : null;
      (existing ? plan.content.preserve : plan.content.create).push(key);
    }
  }
  for (const menu of seed.menus ?? []) {
    const existing = await db
      .selectFrom('_emdash_menus')
      .select('id')
      .where('name', '=', menu.name)
      .where('locale', '=', menu.locale!)
      .executeTakeFirst();
    (existing ? plan.menus.preserve : plan.menus.create).push(menuKey(menu));
  }
  for (const key of Object.keys(seed.settings ?? {})) {
    const existing = await db.selectFrom('options').select('name').where('name', '=', `site:${key}`).executeTakeFirst();
    (existing ? plan.settings.preserve : plan.settings.create).push(key);
  }
  return plan;
}

function expectedMenuShape(items: SeedMenuItem[]): unknown[] {
  return items.map((item) => ({
    type: item.type,
    label: item.label ?? '',
    url: item.url ?? null,
    target: item.target ?? null,
    title: item.titleAttr ?? null,
    classes: item.cssClasses ?? null,
    children: expectedMenuShape(item.children ?? []),
  }));
}

async function verifyOwnedMenu(db: Kysely<Database>, menu: SeedMenu): Promise<void> {
  const existing = await db
    .selectFrom('_emdash_menus')
    .select('id')
    .where('name', '=', menu.name)
    .where('locale', '=', menu.locale!)
    .executeTakeFirst();
  if (!existing) fail('INITIALIZATION_MENU_MISSING');
  const rows = await db
    .selectFrom('_emdash_menu_items')
    .selectAll()
    .where('menu_id', '=', existing.id)
    .orderBy('sort_order', 'asc')
    .orderBy('id', 'asc')
    .execute();
  const shape = (parentId: string | null): unknown[] =>
    rows
      .filter((item) => item.parent_id === parentId)
      .map((item) => ({
        type: item.type,
        label: item.label,
        url: item.custom_url,
        target: item.target,
        title: item.title_attr,
        classes: item.css_classes,
        children: shape(item.id),
      }));
  if (
    rows.some((row) => row.locale !== menu.locale) ||
    stableJson(shape(null)) !== stableJson(expectedMenuShape(menu.items))
  ) {
    // applySeed recreates menus even in skip mode. Never invoke it on an
    // existing partial menu: stop for review instead of erasing an editor's work.
    fail('INITIALIZATION_MENU_INCOMPLETE_OR_EDITED');
  }
}

/**
 * Run in a serialized CI job against an already initialized EmDash database.
 * The caller owns remote D1/R2 transport and authentication. This function never
 * runs migrations, resets setup, changes users/posts, or reads private options.
 */
export async function initializeSiteContent({
  db,
  seed,
  dryRun = true,
  resume = false,
  retainLockOnError,
}: SiteContentInitializationOptions): Promise<SiteContentInitializationResult> {
  const mediaIds = validateSiteContentInitializationSeed(seed);
  const digest = await fingerprint(seed);
  const options = new OptionsRepository(db);
  const previous = await options.getVersioned<InitializationMarker>(SITE_CONTENT_INITIALIZATION_MARKER);
  if (previous) {
    if (previous.value.version !== 1 || previous.value.fingerprint !== digest) fail('INITIALIZATION_MARKER_CONFLICT');
    if (previous.value.status === 'complete') return { status: 'already-complete', plan: previous.value.initialPlan };
    if (!dryRun && (previous.value.status !== 'failed' || !resume)) fail('INITIALIZATION_LOCKED');
  }
  const plan = await makePlan(db, seed, previous?.value);
  if (dryRun) return { status: 'dry-run', plan };
  const media = new MediaRepository(db);
  for (const id of mediaIds) {
    const item = await media.findById(id);
    if (!item || item.status !== 'ready') fail('MEDIA_NOT_READY');
  }
  const initialPlan = previous?.value.initialPlan ?? plan;
  // Existing menus must be preserved in full. Verify only menus this run had
  // planned to create, so an interrupted creation cannot be mistaken for success.
  for (const menu of seed.menus ?? []) {
    if (initialPlan.menus.create.includes(menuKey(menu)) && plan.menus.preserve.includes(menuKey(menu))) {
      await verifyOwnedMenu(db, menu);
    }
  }
  const marker: InitializationMarker = {
    version: 1,
    status: 'running',
    fingerprint: digest,
    startedAt: new Date().toISOString(),
    initialPlan,
  };
  const lock = await options.compareAndSet(SITE_CONTENT_INITIALIZATION_MARKER, previous?.revision ?? null, marker);
  if (!lock.applied) fail('INITIALIZATION_LOCKED');
  try {
    for (const collection of seed.collections ?? []) {
      if (!plan.collections.resume?.includes(collection.slug)) continue;
      // Re-read ownership and exact definitions under the initialization lock;
      // the SDK resumes its fenced creation, fills missing fields, and validates
      // the entire field set without replacing any registered row or table.
      const registry = new SchemaRegistry(db);
      const registered = await registry.getCollection(collection.slug);
      if (!registered || !(await verifyRegisteredSchemaResume(db, collection, previous?.value, registered.id)))
        fail('INITIALIZATION_SCHEMA_RESUME_IDENTITY_MISMATCH');
      const { input, fields } = nativeSeedCollectionInput(collection);
      await registry.createSeedCollection(input, fields);
      if (collection.titleField || collection.dateField) {
        await registry.updateCollection(collection.slug, {
          titleField: collection.titleField,
          dateField: collection.dateField,
        });
      }
    }
    const missing = new Set(plan.menus.create);
    const filteredSeed: SeedFile = { ...seed, menus: (seed.menus ?? []).filter((menu) => missing.has(menuKey(menu))) };
    // Missing translation anchors are deliberately not passed back as menus:
    // applySeed would destroy their current items. A partially seeded locale
    // group must be reviewed before introducing additional locale variants.
    const availableMenuIds = new Set(filteredSeed.menus?.map((menu) => menu.id).filter(Boolean));
    if (filteredSeed.menus?.some((menu) => menu.translationOf && !availableMenuIds.has(menu.translationOf))) {
      fail('MENU_TRANSLATION_ANCHOR_ALREADY_EXISTS');
    }
    const result = await applySeed(db, filteredSeed, { includeContent: true, onConflict: 'skip' });
    for (const menu of filteredSeed.menus ?? []) await verifyOwnedMenu(db, menu);
    const done = await options.compareAndSet(SITE_CONTENT_INITIALIZATION_MARKER, lock.revision, {
      ...marker,
      status: 'complete',
      completedAt: new Date().toISOString(),
    });
    if (!done.applied) fail('INITIALIZATION_LOCK_LOST');
    return { status: 'complete', plan: initialPlan, result };
  } catch (error) {
    // An unconfirmed remote write may still be active. Never mark it resumable
    // until an operator has inspected its completion and installed schema.
    if (!retainLockOnError?.(error)) {
      await options.compareAndSet(SITE_CONTENT_INITIALIZATION_MARKER, lock.revision, { ...marker, status: 'failed' });
    }
    throw error;
  }
}
