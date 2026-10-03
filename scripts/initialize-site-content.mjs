import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Kysely, SqliteAdapter } from 'kysely';
import { D1Dialect } from 'kysely-d1';
import { MediaRepository } from 'emdash';
import { validateSeed } from 'emdash/seed';
import { initializeSiteContent } from '../src/emdash/initialize-site-content.ts';
import { ACCOUNT, DATABASE, productionApi, verifyProductionConfig } from './emdash-production.mjs';

const BUCKET = 'cinagroup-emdash-media-production';
export const SITE_PRESENTATION_MEDIA_SPECS = [
  {
    name: 'logo',
    file: 'public/brand/cinagroup-horizontal.png',
    type: 'image/png',
    width: 832,
    height: 288,
    alt: 'CinaGroup',
    caption: 'Official CinaBrand v2.1.1; unchanged original asset.',
  },
  {
    name: 'logoDark',
    file: 'public/brand/cinagroup-horizontal-white.png',
    type: 'image/png',
    width: 832,
    height: 288,
    alt: 'CinaGroup',
    caption: 'Official CinaBrand v2.1.1 white wordmark; unchanged original asset.',
  },
  {
    name: 'favicon',
    file: 'public/logo.png',
    type: 'image/png',
    width: 256,
    height: 256,
    alt: 'CinaGroup',
    caption: 'Official CinaBrand site icon; unchanged existing asset.',
  },
  {
    name: 'hero',
    file: 'public/images/flexina/city-workspace.webp',
    type: 'image/webp',
    width: 1536,
    height: 1024,
    alt: 'Illustrative modern commercial district',
    caption: 'Original OpenAI ImageGen output, 2026-10-03. Illustrative environment, not an actual CinaGroup office.',
  },
  {
    name: 'about',
    file: 'public/images/flexina/office-workspace.webp',
    type: 'image/webp',
    width: 1536,
    height: 1024,
    alt: 'Illustrative daylight workspace',
    caption: 'Original OpenAI ImageGen output, 2026-10-03. Illustrative environment, not actual CinaGroup premises.',
  },
  {
    name: 'og',
    file: 'src/assets/images/cinagroup-system-hero-v1.png',
    type: 'image/png',
    width: 1672,
    height: 941,
    alt: 'CinaGroup product system',
    caption: 'Existing approved CinaGroup product system illustration.',
  },
];

export function mergePresentationSeedParts(parts) {
  return {
    version: '1',
    defaultLocale: 'en',
    collections: parts.flatMap((part) => part.collections ?? []),
    menus: parts.flatMap((part) => part.menus ?? []),
    settings: parts.reduce((settings, part) => ({ ...settings, ...part.settings }), {}),
    content: parts.reduce((content, part) => {
      for (const [collection, entries] of Object.entries(part.content ?? {})) {
        content[collection] = [...(content[collection] ?? []), ...entries];
      }
      return content;
    }, {}),
  };
}

/** Kysely's D1 driver consumes the same result/meta shape returned by the REST query endpoint. */
export function createPresentationD1Database(query) {
  class PresentationD1Adapter extends SqliteAdapter {
    compoundSelectLimit = 5;
  }
  class PresentationD1Dialect extends D1Dialect {
    createAdapter() {
      return new PresentationD1Adapter();
    }
  }
  const binding = {
    prepare(sql) {
      return {
        bind(...params) {
          return { all: () => query(sql, params) };
        },
      };
    },
  };
  return new Kysely({ dialect: new PresentationD1Dialect({ database: binding }) });
}

export function readPresentationAssets() {
  return SITE_PRESENTATION_MEDIA_SPECS.map((spec) => {
    const bytes = readFileSync(spec.file);
    if (!bytes.length) throw new Error(`Empty presentation media: ${spec.name}`);
    const hash = createHash('sha256').update(bytes).digest('hex');
    return { ...spec, bytes, hash, key: `site-presentation/v1/${hash}/${basename(spec.file)}` };
  });
}

function mediaReference(item) {
  if (item.status !== 'ready') throw new Error('Existing presentation media is not ready');
  if (
    !item.storageKey ||
    item.storageKey.split('/').some((segment) => !segment || segment === '.' || segment === '..') ||
    /^(?:backups|transfers)\//i.test(item.storageKey)
  )
    throw new Error('Existing presentation media has a non-public storage key');
  return {
    id: item.id,
    provider: 'local',
    src: `/_emdash/api/media/file/${encodeURI(item.storageKey)}`,
    filename: item.filename,
    mimeType: item.mimeType,
    width: item.width,
    height: item.height,
    alt: item.alt,
  };
}

/** This lookup never uploads or modifies a media record, including during plan. */
export async function lookupPresentationMedia(media, assets) {
  const references = {};
  for (const asset of assets) {
    const item = await media.findByContentHash(asset.hash);
    if (item) references[asset.name] = mediaReference(item);
  }
  return references;
}

export function bindPresentationMedia(seed, references) {
  if (references.logo) seed.settings.logo = { mediaId: references.logo.id, alt: 'CinaGroup' };
  if (references.favicon) seed.settings.favicon = { mediaId: references.favicon.id, alt: 'CinaGroup' };
  if (references.og)
    seed.settings.seo = { ...seed.settings.seo, defaultOgImage: { mediaId: references.og.id, alt: references.og.alt } };
  if (references.logoDark)
    for (const entry of seed.content.site_profile ?? []) entry.data.logo_dark = references.logoDark;
  for (const entry of seed.content.site_pages ?? []) {
    if (references.hero) entry.data.hero_image = references.hero;
    if (references.about) entry.data.about_image = references.about;
  }
  return seed;
}

/** Poll and fully download the private SQL export before allowing the first media/content write. */
export async function downloadPresentationBackup(
  api = productionApi,
  fetchBackup = fetch,
  wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms))
) {
  const path = `/accounts/${ACCOUNT}/d1/database/${DATABASE}/export`;
  let backup = await api(path, 'POST', { output_format: 'polling' });
  for (let attempt = 0; backup.status !== 'complete' && attempt < 60; attempt++) {
    if (backup.status === 'error') throw new Error('Production backup failed');
    if (!backup.at_bookmark) throw new Error('Production backup polling bookmark missing');
    await wait(1000);
    backup = await api(path, 'POST', { output_format: 'polling', current_bookmark: backup.at_bookmark });
  }
  if (backup.status !== 'complete' || !backup.result?.signed_url || !backup.at_bookmark)
    throw new Error('Production backup did not complete');
  const response = await fetchBackup(backup.result.signed_url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error('Production backup download failed');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || !bytes.toString('utf8').trim()) throw new Error('Production backup download was empty');
  return {
    bytes,
    proof: {
      database: DATABASE,
      bookmark: backup.at_bookmark,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
  };
}

async function main(command = process.argv[2] ?? 'validate') {
  if (!['validate', 'plan', 'apply', 'resume'].includes(command))
    throw new Error('Unknown site initialization operation');
  verifyProductionConfig(JSON.parse(readFileSync('wrangler.production.jsonc', 'utf8').replace(/,\s*([}\]])/g, '$1')));
  const parts = [
    'seed/site-shell.json',
    'seed/site-presentation.json',
    'seed/site-inner-pages.json',
    'seed/site-english-pages.json',
  ].map((file) => JSON.parse(readFileSync(file, 'utf8')));
  const seed = mergePresentationSeedParts(parts);
  const validation = validateSeed(seed);
  if (!validation.valid) throw new Error(`Invalid presentation seed: ${JSON.stringify(validation.errors)}`);
  const assets = readPresentationAssets();
  if (command === 'validate') {
    console.log(
      JSON.stringify({
        status: 'validated',
        collections: seed.collections.length,
        menus: seed.menus.length,
        entries: Object.values(seed.content).reduce((sum, items) => sum + items.length, 0),
        media: assets.length,
      })
    );
    return;
  }
  const query = async (sql, params = []) => {
    const result = await productionApi(`/accounts/${ACCOUNT}/d1/database/${DATABASE}/query`, 'POST', { sql, params });
    if (!Array.isArray(result) || result.length !== 1 || result[0].success !== true || !result[0].meta)
      throw new Error('Presentation D1 query failed');
    return result[0];
  };
  const db = createPresentationD1Database(query);
  try {
    const database = await productionApi(`/accounts/${ACCOUNT}/d1/database/${DATABASE}`);
    if (database.name !== 'cinagroup-emdash-production') throw new Error('Production database name mismatch');
    const media = new MediaRepository(db);
    // Existing persisted IDs must enter the fingerprint before plan/resume reads the marker.
    const references = await lookupPresentationMedia(media, assets);
    bindPresentationMedia(seed, references);
    const plan = await initializeSiteContent({ db, seed, dryRun: true });
    console.log(JSON.stringify(plan));
    if (command === 'plan' || plan.status === 'already-complete') return;

    const { bytes: backupBytes, proof: backupProof } = await downloadPresentationBackup();
    const privateDirectory = mkdtempSync(join(tmpdir(), 'cinagroup-presentation-backup-'));
    writeFileSync(join(privateDirectory, 'before.sql'), backupBytes, { mode: 0o600 });
    console.log(JSON.stringify({ backup: backupProof }));
    for (const asset of assets) {
      if (references[asset.name]) continue;
      execFileSync(
        process.execPath,
        [
          'node_modules/wrangler/bin/wrangler.js',
          'r2',
          'object',
          'put',
          `${BUCKET}/${asset.key}`,
          '--remote',
          '--file',
          asset.file,
          '--content-type',
          asset.type,
          '--config',
          'wrangler.production.jsonc',
        ],
        { stdio: 'pipe' }
      );
      const item = await media.create({
        filename: basename(asset.file),
        mimeType: asset.type,
        size: asset.bytes.length,
        width: asset.width,
        height: asset.height,
        alt: asset.alt,
        caption: asset.caption,
        storageKey: asset.key,
        contentHash: asset.hash,
        status: 'ready',
      });
      references[asset.name] = mediaReference(item);
    }
    bindPresentationMedia(seed, references);
    // The second plan and apply now share the identical fully bound seed fingerprint.
    await initializeSiteContent({ db, seed, dryRun: true });
    const result = await initializeSiteContent({ db, seed, dryRun: false, resume: command === 'resume' });
    console.log(JSON.stringify({ result, media: Object.keys(references), backup: backupProof }));
    writeFileSync(
      'site-content-initialization-report.json',
      JSON.stringify({ result, media: references, backup: backupProof }, null, 2) + '\n'
    );
  } finally {
    await db.destroy();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
