import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const routingPath = path.join(root, 'src', 'i18n', 'routing.ts');
const pagesRoot = path.join(root, 'src', 'pages');

const fail = (message) => {
  throw new Error(`i18n route audit failed: ${message}`);
};

const exists = async (file) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

const routingSource = await readFile(routingPath, 'utf8');
const transpiled = ts.transpileModule(routingSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  fileName: routingPath,
});
if (transpiled.diagnostics?.length) {
  fail(`routing.ts could not be transpiled: ${transpiled.diagnostics.map((item) => item.messageText).join('; ')}`);
}

const routingModuleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`;
const {
  defaultLang,
  getBaseRoute,
  getLanguageAlternates,
  getLocalizedRoutePath,
  isRouteAvailable,
  localizeInternalHref,
  routeMatrix,
  supportedLocales,
} = await import(routingModuleUrl);

const sourceCandidates = (route, locale) => {
  if (route === '/blog') {
    return locale === 'en' ? [path.join(pagesRoot, '[...blog]', 'index.astro')] : [];
  }

  const prefix = locale === defaultLang ? [] : [locale];
  const routeParts = route === '/' ? [] : route.slice(1).split('/');
  const stem = path.join(pagesRoot, ...prefix, ...routeParts);
  if (route === '/') {
    return ['astro', 'md', 'mdx'].map((extension) => path.join(stem, `index.${extension}`));
  }
  return [
    ...['astro', 'md', 'mdx'].map((extension) => `${stem}.${extension}`),
    ...['astro', 'md', 'mdx'].map((extension) => path.join(stem, `index.${extension}`)),
  ];
};

const findSource = async (route, locale) => {
  for (const candidate of sourceCandidates(route, locale)) {
    if (await exists(candidate)) return candidate;
  }
  return undefined;
};

let checkedRouteFiles = 0;
for (const [route, locales] of Object.entries(routeMatrix)) {
  if (!route.startsWith('/') || (route !== '/' && route.endsWith('/'))) fail(`matrix key is not normalized: ${route}`);
  if (!locales.includes(defaultLang)) fail(`${route} has no English default`);
  if (new Set(locales).size !== locales.length) fail(`${route} contains duplicate locales`);

  for (const locale of supportedLocales) {
    const source = await findSource(route, locale);
    const declared = locales.includes(locale);
    if (declared && !source) fail(`${route} declares ${locale}, but no page source exists`);
    if (!declared && source) fail(`${route} has a ${locale} page source, but the matrix omits it`);
    if (source) checkedRouteFiles += 1;
  }
}

const expectedNewRoutes = [
  ...['zh', 'ko', 'ru', 'es', 'pt', 'fr'].map((locale) => `/${locale}/about/`),
  ...['zh', 'ja', 'ko', 'ru', 'es', 'pt', 'fr'].flatMap((locale) => [
    `/${locale}/privacy/`,
    `/${locale}/terms/`,
  ]),
];
if (expectedNewRoutes.length !== 20) fail('the expected localized route inventory is not 20');
for (const localizedPath of expectedNewRoutes) {
  const parts = localizedPath.split('/').filter(Boolean);
  const locale = parts.shift();
  const route = `/${parts.join('/')}`;
  if (!isRouteAvailable(route, locale)) fail(`${localizedPath} is missing from the route matrix`);
  if (!(await findSource(route, locale))) fail(`${localizedPath} has no page source`);
}

const origin = 'https://cinagroup.com';
for (const [route, locales] of Object.entries(routeMatrix)) {
  const expectedLanguages = [...locales, 'x-default'];
  const expectedEnglish = new URL(getLocalizedRoutePath(route, defaultLang), origin).toString();
  let reciprocalSignature;

  for (const locale of locales) {
    const localizedPath = getLocalizedRoutePath(route, locale);
    const alternates = getLanguageAlternates(localizedPath, origin);
    const languages = alternates.map(({ hreflang }) => hreflang);
    if (JSON.stringify(languages) !== JSON.stringify(expectedLanguages)) {
      fail(`${localizedPath} has an incomplete alternate set: ${languages.join(', ')}`);
    }

    const xDefault = alternates.find(({ hreflang }) => hreflang === 'x-default');
    if (xDefault?.href !== expectedEnglish) fail(`${localizedPath} has an invalid x-default`);
    for (const alternate of alternates) {
      if (alternate.hreflang !== 'x-default' && !locales.includes(alternate.hreflang)) {
        fail(`${localizedPath} links a nonexistent ${alternate.hreflang} translation`);
      }
    }

    const signature = JSON.stringify(alternates);
    reciprocalSignature ??= signature;
    if (signature !== reciprocalSignature) fail(`${localizedPath} does not return the reciprocal alternate set`);
  }
}

const navigationSource = await readFile(path.join(root, 'src', 'navigation.ts'), 'utf8');
const navigationRoutes = new Set(['/blog']);
for (const pattern of [/href:\s*['"](\/[^'"]*)['"]/g, /getPermalink\(\s*['"](\/[^'"]*)['"]/g]) {
  for (const match of navigationSource.matchAll(pattern)) navigationRoutes.add(getBaseRoute(match[1]));
}

for (const route of navigationRoutes) {
  if (!(route in routeMatrix)) fail(`navigation route ${route} is not represented in the matrix`);
  for (const locale of supportedLocales) {
    const href = localizeInternalHref(`${route}${route === '/' ? '' : '/'}#audit`, locale);
    if (!href?.endsWith('#audit')) fail(`${route} loses its fragment for ${locale}`);
    const targetRoute = getBaseRoute(href);
    const firstSegment = href.split('/').filter(Boolean)[0];
    const targetLocale = supportedLocales.includes(firstSegment) ? firstSegment : defaultLang;
    if (!isRouteAvailable(targetRoute, targetLocale)) fail(`${href} is a dead navigation link for ${locale}`);
  }
}

const headerSource = await readFile(path.join(root, 'src', 'components', 'widgets', 'Header.astro'), 'utf8');
const footerSource = await readFile(path.join(root, 'src', 'components', 'widgets', 'Footer.astro'), 'utf8');
for (const [name, source] of [
  ['Header', headerSource],
  ['Footer', footerSource],
]) {
  if (!source.includes('localizeInternalHref')) fail(`${name} is not using the central route helper`);
  if (/localized(?:Page|Footer)Paths|additionalLanguagePaths/.test(source)) {
    fail(`${name} still contains a duplicate availability set`);
  }
}

const metadataSource = await readFile(path.join(root, 'src', 'components', 'common', 'Metadata.astro'), 'utf8');
if (!metadataSource.includes('getLanguageAlternates') || !metadataSource.includes('seoProps.languageAlternates')) {
  fail('Metadata is not emitting alternates from the central matrix');
}
if (!metadataSource.includes('getCanonical(String(Astro.url.pathname))')) {
  fail('Metadata canonical is no longer derived from the query/hash-free pathname');
}

console.log(
  `i18n route audit: PASS (${Object.keys(routeMatrix).length} matrix routes, ${checkedRouteFiles} page sources, ${expectedNewRoutes.length} added localized routes, ${navigationRoutes.size} navigation targets)`,
);
