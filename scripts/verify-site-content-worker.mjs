import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import { ContentRepository, MediaRepository, setSiteSettings } from 'emdash';
import { parse } from 'parse5';
import {
  bindPresentationMedia,
  createPresentationD1Database,
  lookupPresentationMedia,
  mergePresentationSeedParts,
  readPresentationAssets,
} from './initialize-site-content.mjs';
import { initializeSiteContent } from '../src/emdash/initialize-site-content.ts';

/** Exercise the already compiled Worker with local, ephemeral native CMS/R2 data. */
export async function verifySiteContentWorker(server) {
  if (process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_ACCOUNT_ID)
    throw new Error('Site content Worker verification must remain offline');
  let environment = await server.getWorker().getEnv();
  const db = createPresentationD1Database(async (sql, params) =>
    environment.DB.prepare(sql)
      .bind(...params)
      .all()
  );
  const assets = readPresentationAssets();
  const media = new MediaRepository(db);
  try {
    for (const asset of assets) {
      await environment.MEDIA.put(asset.key, asset.bytes, { httpMetadata: { contentType: asset.type } });
      await media.create({
        filename: basename(asset.file),
        storageKey: asset.key,
        contentHash: asset.hash,
        status: 'ready',
        mimeType: asset.type,
        size: asset.bytes.length,
        width: asset.width,
        height: asset.height,
        alt: asset.alt,
      });
    }
    const references = await lookupPresentationMedia(media, assets);
    const seed = bindPresentationMedia(
      mergePresentationSeedParts(
        [
          'seed/site-shell.json',
          'seed/site-presentation.json',
          'seed/site-inner-pages.json',
          'seed/site-english-pages.json',
        ].map((file) => JSON.parse(readFileSync(file, 'utf8')))
      ),
      references
    );
    const result = await initializeSiteContent({ db, seed, dryRun: false });
    assert.equal(result.status, 'complete');

    // Seed a published revision and a later draft before restarting the isolated
    // test Worker. The compiled public route must select the published snapshot.
    const content = new ContentRepository(db);
    const home = await content.findBySlug('site_pages', 'home', 'zh');
    await content.updateDraftAware('site_pages', home.id, { data: { hero_title: 'CMS published homepage proof' } });
    await content.publish('site_pages', home.id);
    await content.updateDraftAware('site_pages', home.id, {
      data: { hero_title: 'PRIVATE unpublished homepage proof' },
    });
    const english = await content.findBySlug('page_english', 'about', 'en');
    const englishTexts = english.data.texts.map((row) =>
      row.key === 'hero_title' ? { ...row, value: 'CMS published English page proof' } : row
    );
    await content.updateDraftAware('page_english', english.id, { data: { texts: englishTexts } });
    await content.publish('page_english', english.id);
    const services = await content.findBySlug('page_services', 'services', 'zh');
    await content.updateDraftAware('page_services', services.id, {
      data: { title: 'CMS published inner page proof' },
    });
    await content.publish('page_services', services.id);
    await setSiteSettings({ title: 'CMS site identity proof' }, db);
    const menu = await db
      .selectFrom('_emdash_menus')
      .select('id')
      .where('name', '=', 'primary')
      .where('locale', '=', 'zh')
      .executeTakeFirstOrThrow();
    await db
      .updateTable('_emdash_menu_items')
      .set({ label: 'CMS published menu proof' })
      .where('menu_id', '=', menu.id)
      .where('custom_url', '=', '/zh/pricing/')
      .execute();

    // Node-side native SDK writes intentionally bypass the production admin
    // invalidation hooks. Reload the Worker once, preserving local storage,
    // to test a clean deployment snapshot with the actual compiled routes.
    await server.update((options) => ({
      ...options,
      workers: options.workers.map((worker) => ({
        ...worker,
        config: { ...worker.config, vars: { ...worker.config.vars, CINA_CONTENT_AUDIT: 'seeded' } },
      })),
    }));
    // Reload invalidates binding proxies; reacquire while retaining storage.
    environment = await server.getWorker().getEnv();
    const html = async (route, method = 'GET') => {
      const response = await server.fetch('https://cinagroup.com' + route, { method, redirect: 'manual' });
      assert.equal(response.status, 200, route);
      assert.equal(response.headers.get('X-CinaGroup-Deployment'), 'emdash-production', route);
      assert.ok(response.headers.get('Content-Type')?.includes('text/html'), route);
      const body = await response.text();
      if (method === 'HEAD') assert.equal(body, '', route);
      return body;
    };
    const locales = ['', 'zh/', 'ja/', 'ko/', 'ru/', 'es/', 'pt/', 'fr/'];
    for (const locale of locales) {
      const body = await html('/' + locale);
      assert.ok(body.includes('data-site-content-source="emdash"'), locale + ' homepage reads CMS');
      assert.ok(body.includes('CMS site identity proof'), locale + ' reads native settings');
      assert.ok(body.includes(references.logo.src), locale + ' header uses registered original logo');
      assert.ok(body.includes(references.logoDark.src), locale + ' footer uses registered original logo');
      const renderedImages = [];
      const findImages = (node) => {
        if (node.tagName === 'img') {
          const attrs = Object.fromEntries(node.attrs.map(({ name, value }) => [name, value]));
          if (attrs.class?.split(/\s+/).includes('fx-hero-image')) renderedImages.push(attrs.src);
        }
        for (const child of node.childNodes ?? []) findImages(child);
      };
      findImages(parse(body));
      assert.deepEqual(renderedImages, [references.hero.src, references.about.src], locale + ' actual homepage images');
      for (const source of renderedImages) {
        const response = await server.fetch(new URL(source, 'https://cinagroup.com').href);
        assert.equal(response.status, 200, locale + ' rendered media delivery: ' + source);
        assert.ok(response.headers.get('Content-Type')?.startsWith('image/'));
        const asset = assets.find((item) => source.endsWith('/' + item.key));
        assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'), asset.hash);
      }
      await html('/' + locale, 'HEAD');
      for (const slug of [
        'about',
        'services',
        'contact',
        'pricing',
        'cinaseek',
        'cinaclaw',
        'cinatoken',
        'cinaskill',
        'cinachain',
      ])
        await html('/' + locale + slug + '/');
    }
    const chinese = await html('/zh/');
    assert.ok(chinese.includes('CMS published homepage proof'));
    assert.ok(chinese.includes('CMS published menu proof'));
    assert.equal(chinese.includes('PRIVATE unpublished homepage proof'), false);
    assert.ok((await html('/about/')).includes('CMS published English page proof'));
    assert.ok((await html('/zh/services/')).includes('CMS published inner page proof'));
    await html('/work/');
    // A different isolate's setting write must be visible without another deployment.
    await setSiteSettings({ title: 'CMS updated identity without redeploy' }, db);
    assert.ok((await html('/zh/')).includes('CMS updated identity without redeploy'));
    assert.ok((await html('/blog/10/')).includes('CMS updated identity without redeploy'));
    assert.ok((await html('/fr/blog/')).includes('CMS updated identity without redeploy'));
    for (const asset of assets) {
      const response = await server.fetch('https://cinagroup.com/_emdash/api/media/file/' + asset.key);
      assert.equal(response.status, 200, asset.file);
      assert.equal(
        createHash('sha256')
          .update(Buffer.from(await response.arrayBuffer()))
          .digest('hex'),
        asset.hash
      );
    }
    assert.equal(
      (await server.fetch('https://cinagroup.com/_emdash/api/media/upload', { method: 'POST' })).status,
      503
    );
    assert.equal((await initializeSiteContent({ db, seed, dryRun: false })).status, 'already-complete');
    console.log('Compiled Worker CMS acceptance: 8 homepages, 73 inner pages, settings/menus, 6 media, draft boundary');
  } finally {
    await db.destroy();
  }
}
