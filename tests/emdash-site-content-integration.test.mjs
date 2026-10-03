import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { Kysely } from 'kysely';
import { createDialect } from 'emdash/db/sqlite';
import { runMigrations } from 'emdash/db';
import { emdashLoader } from 'emdash/runtime';
import {
  ContentRepository,
  createContentAccessWithWrite,
  applySeed,
  MediaRepository,
  OptionsRepository,
  SchemaRegistry,
  getMenuWithCacheHint,
  getSiteSettingsWithCacheHint,
  runWithContext,
  setSiteSettings,
} from 'emdash';
import { validateSeed } from 'emdash/seed';
import { loadCmsBlogIndex } from '../src/emdash/cms-blog-index.ts';
import { formatCmsBlogDate } from '../src/emdash/cms-blog-display.ts';
import { resolvePostSeoImage } from '../src/emdash/post-seo-runtime.ts';
import {
  bindPresentationMedia,
  createPresentationD1Database,
  downloadPresentationBackup,
  lookupPresentationMedia,
  mergePresentationSeedParts,
  readPresentationAssets,
} from '../scripts/initialize-site-content.mjs';
import { initializeSiteContent, SITE_CONTENT_INITIALIZATION_MARKER } from '../src/emdash/initialize-site-content.ts';
import { DEFAULT_HOME_COPY, HOME_LOCALES } from '../src/data/site/home-defaults.ts';
import { homeOrganizationStructuredData, loadHomeContent } from '../src/emdash/home-content.ts';
import { createSitePresentationLoader, flattenPresentationMenu } from '../src/emdash/site-presentation-model.ts';
import { createCinaAuthAccessGuard } from '../src/emdash/cinaauth-access-guard.ts';

function generatedSeed() {
  const files = ['seed/site-shell.json', 'seed/site-presentation.json', 'seed/site-inner-pages.json'];
  // This generated part is supplied by a parallel task. Once present it is tested by the same import.
  if (existsSync('seed/site-english-pages.json')) files.push('seed/site-english-pages.json');
  return mergePresentationSeedParts(files.map((file) => JSON.parse(readFileSync(file, 'utf8'))));
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

async function registerApprovedMedia(db) {
  const media = new MediaRepository(db);
  const assets = readPresentationAssets();
  for (const asset of assets) {
    await media.create({
      filename: basename(asset.file),
      mimeType: asset.type,
      storageKey: asset.key,
      contentHash: asset.hash,
      status: 'ready',
      size: asset.bytes.length,
      width: asset.width,
      height: asset.height,
      alt: asset.alt,
    });
  }
  return lookupPresentationMedia(media, assets);
}

// Use the actual EmDash live loader and its ALS database override. The injected read
// is only transport/context: field parsing, revision loading and SEO folding are native.
const nativeEntry = (db, collection, slug, locale, revisionId) =>
  runWithContext({ db, dbIsIsolated: true, editMode: false, locale }, async () => {
    const entry = await emdashLoader().loadEntry({
      filter: { type: collection, id: slug, locale, ...(revisionId ? { revisionId } : {}) },
    });
    assert.equal(entry?.error, undefined);
    return { entry: entry ?? null, isPreview: Boolean(revisionId), cacheHint: entry?.cacheHint };
  });

async function readPresentation(db, locale) {
  const loader = createSitePresentationLoader({
    settings: getSiteSettingsWithCacheHint,
    menu: (name, lang) => getMenuWithCacheHint(name, { locale: lang, trailingSlash: 'always' }),
    profile: (lang) => nativeEntry(db, 'site_profile', 'site', lang),
  });
  return runWithContext({ db, dbIsIsolated: true, editMode: false, locale }, () =>
    loader({ locals: {}, url: new URL(`https://cinagroup.com/${locale === 'en' ? '' : `${locale}/`}`) }, locale)
  );
}

// D1 must be the first dialect used here: EmDash caches transaction capability per process.
// This matches the production CLI, whose process only uses the D1 dialect.
test('the production D1 REST adapter executes official seed queries without transaction support', async () => {
  const sqlite = new DatabaseSync(':memory:');
  const queries = [];
  const db = createPresentationD1Database(async (query, params) => {
    assert.ok(params.length <= 100, 'D1 bound parameter limit');
    assert.ok(Buffer.byteLength(query, 'utf8') <= 100000, 'D1 SQL statement limit');
    queries.push(query);
    const statement = sqlite.prepare(query);
    const results = statement.columns().length ? statement.all(...params) : (statement.run(...params), []);
    const meta = sqlite.prepare('SELECT changes() AS changes, last_insert_rowid() AS last_row_id').get();
    return { success: true, results, meta };
  });
  try {
    await runMigrations(db);
    const seed = bindPresentationMedia(generatedSeed(), await registerApprovedMedia(db));
    const result = await initializeSiteContent({ db, seed, dryRun: false });
    assert.equal(result.status, 'complete');
    for (const collection of seed.collections) {
      const columns = sqlite.prepare(`PRAGMA table_info(ec_${collection.slug})`).all();
      assert.ok(columns.length <= 100, `${collection.slug} fits D1 column limit`);
    }
    assert.ok(queries.some((query) => /ec_site_pages/.test(query)));
    const home = await loadHomeContent('en', (lang) => nativeEntry(db, 'site_pages', 'home', lang));
    assert.equal(home.source, 'emdash');
    assert.equal(home.content.heroTitle, DEFAULT_HOME_COPY.en.heroTitle);
  } finally {
    await db.destroy();
    sqlite.close();
  }
});

test('generated full seed uses real native schemas, locale menus and approved media paths', async () => {
  const seed = generatedSeed();
  assert.deepEqual(validateSeed(seed).errors, []);
  assert.ok(seed.collections.length >= 7);
  assert.equal(seed.menus.length, 24);
  for (const menu of seed.menus) {
    const walk = (items) =>
      items.forEach((item) => {
        assert.ok(
          item.url.startsWith('/') || item.url === '#' || /^https?:\/\//.test(item.url),
          `${menu.name}:${menu.locale}:${item.label} has a real route`
        );
        if (item.children) walk(item.children);
      });
    walk(menu.items);
  }
  const assets = readPresentationAssets();
  assert.equal(assets.length, 6);
  const guard = createCinaAuthAccessGuard({
    runtimeBindings: () => {
      throw new Error('Public media must bypass credentials');
    },
    authorize: async () => {
      throw new Error('Public media must bypass identity');
    },
  });
  for (const asset of assets) {
    const metadata = await sharp(asset.bytes).metadata();
    assert.equal(metadata.width, asset.width, asset.file);
    assert.equal(metadata.height, asset.height, asset.file);
    assert.equal(asset.hash, createHash('sha256').update(readFileSync(asset.file)).digest('hex'));
    assert.ok(asset.key.startsWith(`site-presentation/v1/${asset.hash}/`));
    for (const method of ['GET', 'HEAD']) {
      const response = await guard(
        new Request(`https://cinagroup.com/_emdash/api/media/file/${asset.key}`, { method }),
        async () => new Response('public media', { status: 200 })
      );
      assert.equal(response.status, 200);
    }
  }
  await withDatabase(async (db) => {
    const refs = await registerApprovedMedia(db);
    bindPresentationMedia(seed, refs);
    const plan = await initializeSiteContent({ db, seed });
    assert.equal(plan.status, 'dry-run');
    assert.equal(await new OptionsRepository(db).get(SITE_CONTENT_INITIALIZATION_MARKER), null);
    const result = await initializeSiteContent({ db, seed, dryRun: false });
    assert.equal(result.status, 'complete');
    assert.equal(
      result.result.content.created,
      Object.values(seed.content).reduce((sum, items) => sum + items.length, 0)
    );
    const registry = new SchemaRegistry(db);
    assert.equal((await registry.getCollectionWithFields('site_pages')).fields.length, 24);
    for (const locale of HOME_LOCALES) {
      const home = await loadHomeContent(locale, (lang) => nativeEntry(db, 'site_pages', 'home', lang));
      assert.equal(home.source, 'emdash');
      assert.equal(home.content.heroTitle, DEFAULT_HOME_COPY[locale].heroTitle);
      assert.equal(home.content.heroImage.id, refs.hero.id);
      const presentation = await readPresentation(db, locale);
      assert.equal(presentation.logo.url, refs.logo.src);
      assert.equal(presentation.darkLogo.url, refs.logoDark.src);
      assert.equal(presentation.favicon.url, refs.favicon.src);
      assert.equal(presentation.defaultOgImage.url, refs.og.src);
      assert.equal(presentation.headerCtaHref, locale === 'en' ? '/contact/' : `/${locale}/contact/`);
      assert.ok(
        flattenPresentationMenu(presentation.menus.primary).some(
          (item) => item.url === (locale === 'en' ? '/pricing/' : `/${locale}/pricing/`)
        )
      );
    }
  });
});

test('native publication, settings and menu edits survive a repeated fully bound initialization', async () => {
  await withDatabase(async (db) => {
    const refs = await registerApprovedMedia(db);
    const seed = bindPresentationMedia(generatedSeed(), refs);
    await initializeSiteContent({ db, seed, dryRun: false });
    const repository = new ContentRepository(db);
    const row = await repository.findBySlug('site_pages', 'home', 'zh');
    await repository.updateDraftAware('site_pages', row.id, {
      data: {
        hero_title: '后台已发布的首页标题',
        hero_lead: '后台修改的 Hero 介绍',
        title: 'Published homepage SEO title',
        description: 'Published homepage SEO description',
      },
    });
    await repository.publish('site_pages', row.id);
    await setSiteSettings(
      {
        title: 'Editor selected site name',
        logo: { mediaId: refs.logoDark.id, alt: 'Updated logo' },
        social: { github: 'https://github.com/cinagroup/emdash' },
      },
      db
    );
    const menu = await db
      .selectFrom('_emdash_menus')
      .select('id')
      .where('name', '=', 'primary')
      .where('locale', '=', 'zh')
      .executeTakeFirstOrThrow();
    const menuItem = await db
      .selectFrom('_emdash_menu_items')
      .select('id')
      .where('menu_id', '=', menu.id)
      .where('custom_url', '=', '/zh/pricing/')
      .executeTakeFirstOrThrow();
    await db.updateTable('_emdash_menu_items').set({ label: '后台菜单修改' }).where('id', '=', menuItem.id).execute();
    const menuBefore = await db.selectFrom('_emdash_menu_items').selectAll().execute();
    const editedProfile = await repository.findBySlug('site_profile', 'site', 'zh');
    await repository.updateDraftAware('site_profile', editedProfile.id, {
      data: { footer_description: '尚未发布的页脚文案' },
    });
    let home = await loadHomeContent('zh', (lang) => nativeEntry(db, 'site_pages', 'home', lang));
    assert.equal(home.content.heroTitle, '后台已发布的首页标题');
    assert.equal(home.content.heroLead, '后台修改的 Hero 介绍');
    assert.equal(home.content.title, 'Published homepage SEO title');
    assert.equal(home.content.description, 'Published homepage SEO description');
    await createContentAccessWithWrite(db).update('site_pages', row.id, {
      seo: {
        title: 'Native SEO panel title',
        description: 'Native SEO panel description',
        image: refs.og.id,
        canonical: '/zh/',
      },
    });
    home = await loadHomeContent('zh', (lang) => nativeEntry(db, 'site_pages', 'home', lang));
    assert.equal(home.content.title, 'Native SEO panel title');
    assert.equal(home.content.description, 'Native SEO panel description');
    assert.equal(home.content.seo.canonical, 'https://cinagroup.com/zh/');
    const ogImage = await runWithContext({ db, dbIsIsolated: true, editMode: false }, () =>
      resolvePostSeoImage(home.content.seo)
    );
    assert.equal(ogImage, `https://cinagroup.com${refs.og.src}`);
    let presentation = await readPresentation(db, 'zh');
    const organization = homeOrganizationStructuredData(presentation);
    assert.equal(organization.name, 'Editor selected site name');
    assert.equal(organization.logo, `https://cinagroup.com${refs.logoDark.src}`);
    assert.ok(organization.sameAs.includes('https://github.com/cinagroup/emdash'));
    assert.ok(flattenPresentationMenu(presentation.menus.primary).some((item) => item.label === '后台菜单修改'));
    assert.notEqual(presentation.footerDescription, '尚未发布的页脚文案');

    // A later draft must stay out of the public columns read by the real loader.
    await repository.updateDraftAware('site_pages', row.id, { data: { hero_title: '尚未发布的首页标题' } });
    home = await loadHomeContent('zh', (lang) => nativeEntry(db, 'site_pages', 'home', lang));
    assert.equal(home.content.heroTitle, '后台已发布的首页标题');
    const pending = await repository.findBySlug('site_pages', 'home', 'zh');
    const preview = await loadHomeContent('zh', (lang) =>
      nativeEntry(db, 'site_pages', 'home', lang, pending.draftRevisionId)
    );
    assert.equal(preview.isPreview, true);
    assert.equal(preview.content.heroTitle, '尚未发布的首页标题');

    // Rebuild from actual disk seeds, then use persisted media IDs before marker validation.
    const repeated = bindPresentationMedia(
      generatedSeed(),
      await lookupPresentationMedia(new MediaRepository(db), readPresentationAssets())
    );
    assert.equal((await initializeSiteContent({ db, seed: repeated })).status, 'already-complete');
    assert.equal((await initializeSiteContent({ db, seed: repeated, dryRun: false })).status, 'already-complete');
    assert.deepEqual(await db.selectFrom('_emdash_menu_items').selectAll().execute(), menuBefore);
    home = await loadHomeContent('zh', (lang) => nativeEntry(db, 'site_pages', 'home', lang));
    assert.equal(home.content.heroTitle, '后台已发布的首页标题');
    presentation = await readPresentation(db, 'zh');
    assert.equal(presentation.siteName, 'Editor selected site name');
    await repository.unpublish('site_pages', row.id);
    const hidden = await loadHomeContent('zh', (lang) => nativeEntry(db, 'site_pages', 'home', lang));
    assert.equal(hidden.source, 'fallback');
    assert.equal(hidden.content.heroTitle, DEFAULT_HOME_COPY.zh.heroTitle);
  });
});

test('backup polling must complete with a bookmark and nonempty private SQL bytes', async () => {
  const calls = [];
  const responses = [
    { at_bookmark: 'bookmark' },
    { status: 'complete', at_bookmark: 'bookmark', result: { signed_url: 'https://backup.example.test/private.sql' } },
  ];
  const result = await downloadPresentationBackup(
    async (_path, _method, body) => {
      calls.push(body);
      return responses.shift();
    },
    async () => new Response('CREATE TABLE options(name TEXT);'),
    async () => {}
  );
  assert.equal(calls[1].current_bookmark, 'bookmark');
  assert.equal(result.proof.bytes, result.bytes.length);
  assert.match(result.proof.sha256, /^[a-f0-9]{64}$/);
  for (const bytes of ['', '  \n ']) {
    await assert.rejects(
      downloadPresentationBackup(
        async () => ({
          status: 'complete',
          at_bookmark: 'bookmark',
          result: { signed_url: 'https://backup.example.test/private.sql' },
        }),
        async () => new Response(bytes)
      ),
      /empty/
    );
  }
  await assert.rejects(
    downloadPresentationBackup(async () => ({ status: 'error' })),
    /backup failed/
  );
});

test('native settings drive only the CMS list page size, date format and timezone', async () => {
  await withDatabase(async (db) => {
    const postSeed = JSON.parse(readFileSync('seed/seed.json', 'utf8'));
    await applySeed(db, { version: '1', collections: postSeed.collections }, { onConflict: 'skip' });
    const repository = new ContentRepository(db);
    for (let index = 0; index < 6; index++) {
      const row = await repository.create({
        type: 'posts',
        slug: `sdk-article-${index}`,
        locale: 'ko',
        status: 'draft',
        data: {
          title: `SDK article ${index}`,
          excerpt: 'Reviewed article example',
          content: [],
          publish_date: '2026-01-23T00:30:00.000Z',
          editorial_status: 'approved',
          origin: 'editorial',
          review_status: 'approved',
          reviewed_by: 'Editor',
          reviewed_at: '2026-01-22T00:00:00.000Z',
          verification_status: 'source_reviewed',
          verified_by: 'Researcher',
          verified_at: '2026-01-22T00:00:00.000Z',
          sources: [{ title: 'Official source', url: 'https://www.cloudflare.com/news/' }],
        },
      });
      if (index < 5) await repository.publish('posts', row.id);
    }
    const load = (requestUrl) =>
      runWithContext({ db, dbIsIsolated: true, editMode: false, locale: 'ko' }, () =>
        loadCmsBlogIndex(
          'ko',
          requestUrl,
          { fetch: async () => new Response(null, { status: 404 }) },
          async (cursor) => {
            const page = await emdashLoader().loadCollection({
              filter: {
                type: 'posts',
                locale: 'ko',
                status: 'published',
                orderBy: { published_at: 'desc' },
                limit: 2,
                cursor,
              },
            });
            assert.equal(page.error, undefined);
            return page;
          },
          getSiteSettingsWithCacheHint().then(({ data }) => data)
        )
      );
    await setSiteSettings({ postsPerPage: 2, dateFormat: 'yyyy-MM-dd', timezone: 'America/New_York' }, db);
    const secondPage = await load('https://cinagroup.com/ko/blog/?page=2');
    assert.equal(secondPage.posts.length, 2);
    assert.equal(secondPage.pagination.total, 5);
    assert.equal(secondPage.pagination.totalPages, 3);
    assert.equal(secondPage.pagination.canonicalHref, '/ko/blog/?page=2');
    assert.equal(secondPage.pagination.previousHref, '/ko/blog/');
    assert.equal(secondPage.pagination.nextHref, '/ko/blog/?page=3');
    assert.equal(formatCmsBlogDate(secondPage.posts[0].publishDate, 'ko', secondPage.displaySettings), '2026-01-22');
    assert.ok(secondPage.posts.every((post) => post.slug !== 'sdk-article-5'));
    await setSiteSettings({ postsPerPage: 4, dateFormat: 'dd/MM/yyyy', timezone: 'Asia/Singapore' }, db);
    const firstPage = await load('https://cinagroup.com/ko/blog/');
    assert.equal(firstPage.posts.length, 4);
    assert.equal(firstPage.pagination.totalPages, 2);
    assert.equal(formatCmsBlogDate(firstPage.posts[0].publishDate, 'ko', firstPage.displaySettings), '23/01/2026');
  });
});
