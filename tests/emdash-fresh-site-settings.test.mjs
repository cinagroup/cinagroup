import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Kysely } from 'kysely';
import { createDialect } from 'emdash/db/sqlite';
import { runMigrations } from 'emdash/db';
import {
  getSiteSettingsWithCacheHint,
  MediaRepository,
  OptionsRepository,
  runWithContext,
  setSiteSettings,
} from 'emdash';
import { getFreshSiteSettingsWithCacheHint, readFreshSiteSettingsWithDb } from '../src/emdash/fresh-site-settings.ts';
import { createSitePresentationLoader } from '../src/emdash/site-presentation-model.ts';
import { cmsBlogDisplaySettings } from '../src/emdash/cms-blog-display.ts';

const nativeRequest = (db, callback) =>
  runWithContext({ db, dbIsIsolated: true, editMode: false, locale: 'en' }, callback);
async function withDatabase(callback) {
  const queries = [];
  const db = new Kysely({ dialect: createDialect({ url: ':memory:' }), log: (event) => queries.push(event.query.sql) });
  try {
    await runMigrations(db);
    await callback(db, queries);
  } finally {
    await db.destroy();
  }
}
const image = (media, key, input = {}) =>
  media.create({
    filename: key.split('/').at(-1),
    mimeType: 'image/png',
    storageKey: key,
    status: 'ready',
    width: 832,
    height: 288,
    ...input,
  });

test('a warm SDK batch stays stale after another writer; later fresh requests see new settings and selected media', async () => {
  await withDatabase(async (db, queries) => {
    const media = new MediaRepository(db);
    const original = await image(media, 'site/old.png');
    const edited = await image(media, 'site/新 logo+v2.svg', { mimeType: 'image/svg+xml', width: 1024, height: 320 });
    await setSiteSettings(
      {
        title: 'Before another isolate saved',
        tagline: 'Old tagline',
        postsPerPage: 10,
        dateFormat: 'yyyy-MM-dd',
        timezone: 'UTC',
        logo: { mediaId: original.id },
        favicon: { mediaId: original.id },
        seo: { defaultOgImage: { mediaId: original.id } },
      },
      db
    );
    const warm = await nativeRequest(db, getSiteSettingsWithCacheHint);
    assert.equal(warm.data.title, 'Before another isolate saved');
    assert.equal(warm.data.logo.url, '/_emdash/api/media/file/site/old.png');
    // Direct repository writes model an admin write in another isolate: this
    // process cannot receive the writer's native SingleFlightCache invalidation.
    await new OptionsRepository(db).setMany({
      'site:title': 'Admin saved new global title',
      'site:tagline': 'Latest global tagline',
      'site:postsPerPage': 3,
      'site:dateFormat': 'dd/MM/yyyy',
      'site:timezone': 'Asia/Singapore',
      'site:logo': { mediaId: edited.id, alt: 'Edited logo', url: '/obsolete.png', width: 1, contentType: 'text/html' },
      'site:favicon': { mediaId: edited.id, alt: '' },
      'site:seo': {
        defaultOgImage: { mediaId: edited.id },
        titleSeparator: ' | ',
        googleVerification: 'current-verification',
      },
      'site:social': { github: 'https://github.com/cinagroup/emdash' },
    });
    const stale = await nativeRequest(db, getSiteSettingsWithCacheHint);
    assert.equal(stale.data.title, warm.data.title, 'reproduce cross-request isolate staleness');
    assert.equal(stale.data.logo.url, warm.data.logo.url);
    queries.length = 0;
    const fresh = await nativeRequest(db, async () => {
      const first = getFreshSiteSettingsWithCacheHint();
      assert.equal(getFreshSiteSettingsWithCacheHint(), first, 'same request shares its promise');
      const result = await first;
      const presentation = createSitePresentationLoader({
        settings: getFreshSiteSettingsWithCacheHint,
        menu: async (_name, locale) => ({ data: { locale, items: [] } }),
        profile: async () => undefined,
      });
      const hints = [];
      const loaded = await presentation({ locals: {}, url: new URL('https://cinagroup.com/') }, 'en', (hint) =>
        hints.push(hint)
      );
      assert.equal(loaded.siteName, 'Admin saved new global title');
      assert.equal(loaded.logo.url, '/_emdash/api/media/file/site/%E6%96%B0%20logo+v2.svg');
      assert.equal(loaded.favicon.contentType, 'image/svg+xml');
      assert.equal(loaded.defaultOgImage.width, 1024);
      assert.deepEqual(hints, [{ tags: ['emdash:settings'] }]);
      assert.deepEqual(cmsBlogDisplaySettings(result.data), {
        postsPerPage: 3,
        dateFormat: 'dd/MM/yyyy',
        timezone: 'Asia/Singapore',
      });
      return result;
    });
    assert.equal(fresh.data.tagline, 'Latest global tagline');
    assert.equal(fresh.data.logo.mediaId, edited.id);
    assert.equal(fresh.data.logo.alt, 'Edited logo');
    assert.equal(fresh.data.logo.contentType, 'image/svg+xml');
    assert.equal(fresh.data.logo.width, 1024);
    assert.equal(fresh.data.logo.height, 320);
    assert.equal(fresh.data.favicon.alt, '');
    assert.equal(queries.filter((query) => /from "options"/i.test(query)).length, 1);
    assert.equal(
      queries.filter((query) => /from "media"/i.test(query)).length,
      1,
      'one lookup shared by logo, favicon, OG image'
    );
    // Ready media metadata itself is also read afresh between requests.
    await media.update(edited.id, { width: 1280, height: 720 });
    const next = await nativeRequest(db, getFreshSiteSettingsWithCacheHint);
    assert.equal(next.data.logo.width, 1280);
    assert.equal(next.data.seo.defaultOgImage.height, 720);
  });
});

test('only native public fields and resolved media metadata can leave the options prefix read', async () => {
  await withDatabase(async (db) => {
    const selected = await image(new MediaRepository(db), 'uploads/selected.png');
    await new OptionsRepository(db).setMany({
      'site:title': 'Public title',
      'site:tagline': '',
      'site:url': 'https://cinagroup.com',
      'site:postsPerPage': 4,
      'site:dateFormat': 'yyyy-MM-dd',
      'site:timezone': 'UTC',
      'site:unpublishedExtension': 'DO_NOT_EXPORT',
      'plugin:unpublishedOption': 'DO_NOT_EXPORT',
      'site:logo': {
        mediaId: selected.id,
        alt: '',
        url: 'https://untrusted.example/stale.png',
        contentType: 'text/html',
        width: 1,
        height: 1,
        unpublishedField: 'DO_NOT_EXPORT',
      },
      'site:social': {
        twitter: 'https://x.com/cinagroup',
        github: 'https://github.com/cinagroup',
        facebook: '',
        instagram: '',
        linkedin: '',
        youtube: '',
        extension: 'DO_NOT_EXPORT',
      },
      'site:seo': {
        titleSeparator: ' | ',
        robotsTxt: 'User-agent: *\nAllow: /',
        googleVerification: 'google',
        bingVerification: 'bing',
        extension: 'DO_NOT_EXPORT',
      },
    });
    const { data, cacheHint } = await readFreshSiteSettingsWithDb(db);
    assert.deepEqual(
      Object.keys(data).sort(),
      ['title', 'tagline', 'url', 'postsPerPage', 'dateFormat', 'timezone', 'logo', 'social', 'seo'].sort()
    );
    assert.equal(JSON.stringify(data).includes('DO_NOT_EXPORT'), false);
    assert.equal(data.tagline, '');
    assert.equal(data.social.facebook, '');
    assert.equal(data.seo.robotsTxt, 'User-agent: *\nAllow: /');
    assert.deepEqual(data.logo, {
      mediaId: selected.id,
      alt: '',
      url: '/_emdash/api/media/file/uploads/selected.png',
      contentType: 'image/png',
      width: 832,
      height: 288,
    });
    assert.deepEqual(cacheHint, { tags: ['emdash:settings'] });
  });
});

test('pending, failed, missing, non-image and protected/ambiguous storage keys never resolve as public theme media', async () => {
  await withDatabase(async (db) => {
    const media = new MediaRepository(db);
    const options = new OptionsRepository(db);
    const badKeys = [
      'backups/sealed.png',
      'Transfers/export.png',
      'uploads/../hidden.png',
      'uploads/./file.png',
      'uploads//file.png',
      '/uploads/file.png',
      'uploads\\file.png',
      'uploads/%2e%2e/file.png',
      'uploads/file.png?download',
      'uploads/file.png#fragment',
      'uploads/file\n.png',
    ];
    const references = [];
    for (const key of badKeys) references.push({ mediaId: (await image(media, key)).id });
    for (const status of ['pending', 'failed'])
      references.push({ mediaId: (await image(media, `uploads/${status}.png`, { status })).id });
    references.push(
      { mediaId: (await image(media, 'uploads/text.txt', { mimeType: 'text/plain' })).id },
      { mediaId: 'missing-media-id', url: '/forged-public.png' },
      { url: '/only-stale-url.png' },
      null
    );
    for (const reference of references) {
      await options.setMany({
        'site:title': 'Kept public text',
        'site:logo': reference,
        'site:favicon': reference,
        'site:seo': { titleSeparator: ' | ', defaultOgImage: reference },
      });
      const { data } = await nativeRequest(db, getFreshSiteSettingsWithCacheHint);
      assert.equal(data.title, 'Kept public text');
      assert.equal(data.logo, undefined);
      assert.equal(data.favicon, undefined);
      assert.equal(data.seo.defaultOgImage, undefined);
      assert.equal(data.seo.titleSeparator, ' | ');
    }
  });
});

test('an unsuccessful read is removed from the request cache so retry and later requests remain usable', async () => {
  const db = new Kysely({ dialect: createDialect({ url: ':memory:' }) });
  try {
    await nativeRequest(db, async () => {
      await assert.rejects(getFreshSiteSettingsWithCacheHint());
      await runMigrations(db);
      await new OptionsRepository(db).set('site:title', 'Recovered read');
      assert.equal((await getFreshSiteSettingsWithCacheHint()).data.title, 'Recovered read');
    });
    await new OptionsRepository(db).set('site:title', 'Next request edit');
    assert.equal((await nativeRequest(db, getFreshSiteSettingsWithCacheHint)).data.title, 'Next request edit');
  } finally {
    await db.destroy();
  }
});

test('both runtime consumers use the fresh settings reader and preserve site presentation request sharing', async () => {
  for (const filename of ['site-presentation.ts', 'cms-blog-index-runtime.ts']) {
    const source = await readFile(new URL('../src/emdash/' + filename, import.meta.url), 'utf8');
    assert.ok(source.includes("from './fresh-site-settings.ts'"));
    assert.ok(source.includes('getFreshSiteSettingsWithCacheHint'));
    assert.equal(source.includes('getSiteSettingsWithCacheHint'), false);
  }
});
