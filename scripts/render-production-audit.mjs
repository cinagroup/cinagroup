import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createTestHarness } from 'wrangler';
import { verifyProductionConfig } from './emdash-production.mjs';

const root = process.cwd();
if (process.env.EMDASH_BUILD_TARGET !== 'production') throw new Error('Production build required');
if (process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_ACCOUNT_ID)
  throw new Error('Offline content audit must not receive Cloudflare credentials');

const pointer = path.resolve('.wrangler/deploy/config.json');
const configPath = path.resolve(path.dirname(pointer), JSON.parse(await readFile(pointer, 'utf8')).configPath);
const config = JSON.parse(await readFile(configPath, 'utf8'));
verifyProductionConfig(config);
const client = path.resolve(path.dirname(configPath), config.assets.directory);
if (client !== path.resolve('dist/client')) throw new Error('Unexpected production asset directory');
const auditDir = path.resolve('dist/audit');
const walk = async (dir) => {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Audit input must not contain symbolic links');
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(file)));
    else if (entry.isFile()) files.push(file);
  }
  return files;
};
const publicPath = (pathname) =>
  pathname.startsWith('/') &&
  !pathname.includes('..') &&
  !pathname.includes('\\') &&
  !/^\/(?:(?:en|zh|ja|ko|ru|es|pt|fr)\/)?(?:_emdash|api|_actions|cms-preview)(?:\/|$)/.test(pathname);
const routeFor = (relative) => {
  const normalized = relative.split(path.sep).join('/');
  if (normalized === 'index.html') return '/';
  if (normalized.endsWith('/index.html')) return '/' + normalized.slice(0, -10);
  return '/' + normalized.replace(/\.html$/, '/');
};
const routes = new Set();
for (const file of await walk(client)) {
  if (!file.endsWith('.html')) continue;
  const route = routeFor(path.relative(client, file));
  if (!publicPath(route)) throw new Error('Private HTML emitted in public assets');
  routes.add(route);
}
for (const file of await walk(path.resolve('src/pages'))) {
  const relative = path.relative(path.resolve('src/pages'), file).split(path.sep).join('/');
  if (relative.includes('[') || !/\.(?:astro|md|mdx)$/.test(relative) || relative === '500.astro') continue;
  const route = routeFor(relative.replace(/\.(?:astro|md|mdx)$/, '.html'));
  if (publicPath(route)) routes.add(route);
}
for (const locale of ['', 'zh/', 'ja/', 'ko/', 'ru/', 'es/', 'pt/', 'fr/']) routes.add('/' + locale + 'blog/');
for (const route of ['/rss.xml', '/robots.txt', '/sitemap-index.xml', '/sitemap-0.xml', '/sitemap-emdash.xml'])
  routes.add(route);

// Use only ephemeral local bindings. This is the compiled production Worker,
// but neither credentials nor production data are available to this harness.
const bundleDir = path.resolve('dist/offline-worker');
const originalEntry = path.resolve(path.dirname(configPath), config.main);
const bundleEntry = config.no_bundle ? path.basename(originalEntry) : path.parse(originalEntry).name + '.js';
const server = createTestHarness({
  root,
  workers: [{
    config: {
      name: config.name,
      main: path.join(bundleDir, bundleEntry),
      compatibility_date: config.compatibility_date,
      compatibility_flags: config.compatibility_flags,
      no_bundle: true,
      find_additional_modules: true,
      rules: config.rules,
      assets: { ...config.assets, directory: client },
      vars: { EMDASH_DEPLOYMENT_TARGET: 'production' },
      d1_databases: [
        { binding: 'DB', database_name: 'offline-cms', database_id: 'offline-cms', remote: false },
        { binding: 'CONTACT_DB', database_name: 'offline-contact', database_id: 'offline-contact', remote: false },
      ],
      r2_buckets: [{ binding: 'MEDIA', bucket_name: 'offline-media', remote: false }],
      kv_namespaces: [{ binding: 'SESSION', id: 'offline-session', remote: false }],
      images: { binding: 'IMAGES', remote: false },
      durable_objects: config.durable_objects,
      migrations: config.migrations,
    },
  }],
});
let rendered = 0;
try {
  await server.listen();
  await cp(client, auditDir, { recursive: true });
  // Initialize native schema before concurrent reads; no CMS content is seeded.
  const initial = await server.fetch('https://cinagroup.com/', { redirect: 'manual' });
  if (initial.status !== 200) throw new Error('Offline production home failed: ' + initial.status);
  await initial.body?.cancel();
  for (const route of [...routes].sort()) {
    if (!publicPath(route)) throw new Error('Private route reached offline audit');
    const response = await server.fetch('https://cinagroup.com' + route, { redirect: 'manual' });
    const expected = /\/(?:404)\/$/.test(route) ? [200, 404] : [200];
    if (!expected.includes(response.status)) throw new Error('Offline production ' + route + ': ' + response.status);
    if (response.headers.get('X-CinaGroup-Deployment') !== 'emdash-production')
      throw new Error('Offline snapshot bypassed production Worker: ' + route);
    const contentType = response.headers.get('Content-Type') ?? '';
    if (!/^(?:text\/html|text\/plain|application\/xml|text\/xml)/i.test(contentType))
      throw new Error('Unexpected audit response type: ' + route);
    const output = route.endsWith('/') ? route.slice(1) + 'index.html' : route.slice(1);
    const target = path.join(auditDir, output);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await response.text());
    rendered++;
  }
  console.log('Compiled production public responses audited offline: ' + rendered + '; mirror: dist/audit');
} catch (error) {
  server.debug();
  throw error;
} finally {
  await server.close();
}
