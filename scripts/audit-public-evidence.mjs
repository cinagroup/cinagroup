import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const sourceOnly = process.argv.includes('--source-only');
const failures = [];
const publishableSourceRoots = ['src/pages', 'src/components', 'src/layouts', 'src/assets/styles'].map((directory) =>
  path.join(root, directory)
);
const legacyWidgetDefinitions = new Set(
  ['Testimonials.astro', 'Stats.astro', 'Brands.astro'].map((file) =>
    path.join(root, 'src', 'components', 'widgets', file)
  )
);
const textExtensions = new Set(['.astro', '.html', '.js', '.jsx', '.md', '.mdx', '.ts', '.tsx']);

const exists = async (target) => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

const walk = async (directory) => {
  if (!(await exists(directory))) return [];

  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else files.push(absolute);
  }
  return files;
};

const relative = (file) => path.relative(root, file).replaceAll(path.sep, '/');
const brandAssetDir = path.join(root, 'public', 'images', 'brands');
const publishedBrandAssetFiles = (await walk(brandAssetDir)).map((file) => path.basename(file));
const blockedLegacyBrandAssets = [
  'ebay-189064_1280.png',
  'google-1015751_1280.png',
  'icon-720944_1280.png',
  'meta-6850393_1280.png',
  'microsoft-80658_1280.png',
  'node-js-736399_1280.png',
  'paypal-784404_1280.png',
  'visa-6850402_1280.png',
  'yahoo-76684_1280.png',
];
const sourceFiles = (await Promise.all(publishableSourceRoots.map(walk)))
  .flat()
  .filter((file) => textExtensions.has(path.extname(file)));

if (publishedBrandAssetFiles.length) {
  failures.push(
    `public/images/brands: unapproved brand assets must not be publicly routable (${publishedBrandAssetFiles.join(', ')})`
  );
}

for (const file of sourceFiles) {
  if (legacyWidgetDefinitions.has(file)) continue;

  const source = await readFile(file, 'utf8');
  for (const widget of ['Testimonials', 'Stats', 'Brands']) {
    const importsLegacyWidget = new RegExp(
      `from\\s+['"][^'"]*components/widgets/${widget}\\.astro['"]|<${widget}\\b`,
      'i'
    ).test(source.replaceAll('\\', '/'));
    if (importsLegacyWidget) {
      failures.push(
        `${relative(file)}: ${widget} cannot be published without approved attribution and evidence-backed data`
      );
    }
  }

  if (/[/\\]images[/\\]brands[/\\]/i.test(source)) {
    failures.push(`${relative(file)}: references an unapproved third-party brand asset directory`);
  }
  for (const asset of blockedLegacyBrandAssets) {
    if (source.toLowerCase().includes(asset.toLowerCase())) {
      failures.push(`${relative(file)}: references unapproved brand asset ${asset}`);
    }
  }
}

const caseModuleUrl = pathToFileURL(path.join(root, 'src', 'data', 'public-cases.ts')).href;
const { caseStudies, illustrativeCaseTemplate, publicCaseStudies, validatePublicCaseStudy } = await import(
  caseModuleUrl
);

const gateProbeFailures = validatePublicCaseStudy({
  status: 'public',
  slug: 'gate-probe',
  title: 'Gate probe',
  summary: 'Runtime validation probe',
  attribution: {
    organization: 'Probe organization',
    displayName: 'Probe organization',
    approval: { approvedBy: 'Probe approver', approvedAt: '9999-12-31', scope: 'Probe only' },
  },
  evidence: [
    {
      tier: 'repository',
      label: 'Repository-only evidence',
      href: 'https://example.com/repository',
      verifiedAt: '9999-12-31',
    },
  ],
  methodology: 'Probe method',
  measurementWindow: 'Probe window',
  limitations: 'Probe limitations',
});
if (!gateProbeFailures.some((failure) => failure.includes('customer-approved-case'))) {
  failures.push('src/data/public-cases.ts: runtime gate must require customer-approved approval evidence');
}
if (gateProbeFailures.filter((failure) => failure.includes('future')).length < 2) {
  failures.push('src/data/public-cases.ts: runtime gate must reject future approval and verification dates');
}

if (!Array.isArray(caseStudies) || !Array.isArray(publicCaseStudies)) {
  failures.push('src/data/public-cases.ts: caseStudies and publicCaseStudies must be arrays');
} else {
  const publicSlugs = new Set();
  for (const [index, item] of caseStudies.entries()) {
    if (!item || typeof item !== 'object') {
      failures.push(`caseStudies[${index}]: case must be an object`);
      continue;
    }

    if (item.status === 'public') {
      const caseFailures = validatePublicCaseStudy(item);
      caseFailures.forEach((failure) => failures.push(`caseStudies[${index}]: ${failure}`));
      if (publicSlugs.has(item.slug)) failures.push(`caseStudies[${index}]: duplicate public slug ${item.slug}`);
      publicSlugs.add(item.slug);
    } else if ('slug' in item) {
      failures.push(`caseStudies[${index}]: non-public records must not expose a routable slug`);
    }
  }

  if (publicCaseStudies.length !== publicSlugs.size) {
    failures.push('src/data/public-cases.ts: publicCaseStudies must contain every and only valid status=public record');
  }
  for (const item of publicCaseStudies) {
    if (item.status !== 'public' || !publicSlugs.has(item.slug)) {
      failures.push(`publicCaseStudies: ${item?.slug ?? 'unknown'} is not an approved public case`);
    }
  }
  if (caseStudies.includes(illustrativeCaseTemplate)) {
    failures.push('src/data/public-cases.ts: illustrativeCaseTemplate must never be included in the routed case list');
  }
}

const workPage = await readFile(path.join(root, 'src', 'pages', 'work', 'index.astro'), 'utf8');
if (!/import\s+{\s*publicCaseStudies\s*}/.test(workPage)) {
  failures.push('src/pages/work/index.astro: must render the filtered publicCaseStudies export');
}
if (/\bcases?Studies\b/.test(workPage.replace(/publicCaseStudies/g, ''))) {
  failures.push('src/pages/work/index.astro: must not import or render the unfiltered caseStudies dataset');
}

let builtHtmlCount = 0;
if (!sourceOnly) {
  const distDir = path.join(root, 'dist');
  const distFiles = await walk(distDir);
  const htmlFiles = distFiles.filter((file) => file.endsWith('.html'));
  const builtTextFiles = distFiles.filter((file) =>
    ['.html', '.css', '.js', '.mjs', '.json'].includes(path.extname(file))
  );
  builtHtmlCount = htmlFiles.length;
  if (htmlFiles.length === 0) failures.push('dist: no built HTML found; build before running the full evidence audit');

  for (const file of builtTextFiles) {
    const output = await readFile(file, 'utf8');
    if (/[/\\]images[/\\]brands[/\\]/i.test(output)) {
      failures.push(`${relative(file)}: built page references the unapproved brand asset directory`);
    }
    for (const asset of blockedLegacyBrandAssets) {
      if (output.toLowerCase().includes(asset.toLowerCase())) {
        failures.push(`${relative(file)}: built page references unapproved brand asset ${asset}`);
      }
    }
  }

  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8');
    if (/<blockquote\b[^>]*class=["'][^"']*\bflex-auto\b/i.test(html)) {
      failures.push(`${relative(file)}: built page contains the legacy unaudited testimonial pattern`);
    }
    if (/\btext-\[2\.6rem\]\b/.test(html)) {
      failures.push(`${relative(file)}: built page contains the legacy metric widget without methodology`);
    }
  }

  const builtWorkPage = path.join(distDir, 'work', 'index.html');
  if (!(await exists(builtWorkPage))) {
    failures.push('dist/work/index.html: evidence page was not built');
  } else {
    const html = await readFile(builtWorkPage, 'utf8');
    const caseCards = [...html.matchAll(/<article\b[^>]*\bdata-public-case=["'][^"']+["'][^>]*>/gi)];
    if (caseCards.length !== publicCaseStudies.length) {
      failures.push(
        `dist/work/index.html: rendered ${caseCards.length} public cases but the approved model contains ${publicCaseStudies.length}`
      );
    }
    for (const match of caseCards) {
      for (const marker of [
        'data-approved-attribution="true"',
        'data-methodology="true"',
        'data-measurement-window="true"',
        'data-limitations="true"',
      ]) {
        if (!match[0].includes(marker)) failures.push(`dist/work/index.html: public case card is missing ${marker}`);
      }
    }

    const metricBlocks = [...html.matchAll(/<div\b[^>]*\bdata-evidence-metric=["']approved["'][^>]*>/gi)];
    for (const match of metricBlocks) {
      for (const marker of ['data-methodology="true"', 'data-measurement-window="true"', 'data-limitations="true"']) {
        if (!match[0].includes(marker)) failures.push(`dist/work/index.html: public metric is missing ${marker}`);
      }
    }
  }
}

if (failures.length) {
  console.error(`Public evidence audit failed with ${failures.length} issue(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `Public evidence audit passed: ${publicCaseStudies.length} approved public cases, ${blockedLegacyBrandAssets.length} blocked legacy brand asset names, ${sourceFiles.length} publishable source files${sourceOnly ? '' : `, ${builtHtmlCount} built HTML files`}.`
);
