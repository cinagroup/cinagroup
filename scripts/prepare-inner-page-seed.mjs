import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ABOUT_COPY } from '../src/data/site/about-defaults.ts';
import { DEFAULT_SERVICES_COPY } from '../src/data/site/services-defaults.ts';
import { DEFAULT_CONTACT_COPY } from '../src/data/site/contact-defaults.ts';
import { DEFAULT_PRICING_COPY } from '../src/data/site/pricing-defaults.ts';
import { defaultProductCopy } from '../src/data/site/product-defaults.ts';
import { INNER_PAGE_LOCALES, pageCopySeedFields, pageCopySeedData } from '../src/emdash/page-copy-model.ts';
import { validateSeed } from 'emdash/seed';

const products = ['cinaseek', 'cinaclaw', 'cinatoken', 'cinaskill', 'cinachain'];
const definitions = [
  { slug: 'page_about', label: 'About Page', route: 'about', defaults: DEFAULT_ABOUT_COPY },
  { slug: 'page_services', label: 'Services Page', route: 'services', defaults: DEFAULT_SERVICES_COPY },
  { slug: 'page_contact', label: 'Contact Page', route: 'contact', defaults: DEFAULT_CONTACT_COPY },
  { slug: 'page_pricing', label: 'Pricing Page', route: 'pricing', defaults: DEFAULT_PRICING_COPY },
  { slug: 'page_products', label: 'Product Pages', route: null, defaults: null },
];

export function prepareInnerPagesSeed() {
  const collections = definitions.map((definition, index) => ({
    slug: definition.slug,
    label: definition.label,
    labelSingular: definition.label,
    description:
      'Existing localized public copy. Evidence, disclosures, form submission and illustrative qualifiers stay code controlled.',
    group: 'Website',
    sortOrder: index + 2,
    titleField: 'title',
    supports: ['drafts', 'revisions', 'preview', 'seo'],
    routable: true,
    urlPattern: definition.route ? `/${definition.route}/` : '/{slug}/',
    fields: pageCopySeedFields(
      definition.defaults ? definition.defaults.zh : defaultProductCopy('zh', 'cinaseek'),
      definition.slug
    ),
  }));
  const content = Object.fromEntries(
    definitions.map((definition) => {
      const slugs = definition.route ? [definition.route] : products;
      return [
        definition.slug,
        slugs.flatMap((slug) =>
          INNER_PAGE_LOCALES.map((locale) => ({
            id: `${definition.slug}:${slug}:${locale}`,
            slug,
            locale,
            status: 'published',
            ...(locale === 'zh' ? {} : { translationOf: `${definition.slug}:${slug}:zh` }),
            data: pageCopySeedData(
              definition.defaults ? definition.defaults[locale] : defaultProductCopy(locale, slug),
              definition.slug
            ),
          }))
        ),
      ];
    })
  );
  const seed = {
    version: '1',
    defaultLocale: 'en',
    meta: {
      name: 'CinaGroup existing localized inner pages',
      description: 'Existing audited public copy; initialize missing records without overriding edits.',
      author: 'CinaGroup',
    },
    collections,
    content,
  };
  const validation = validateSeed(seed);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  return seed;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const seed = prepareInnerPagesSeed();
  const output = fileURLToPath(new URL('../seed/site-inner-pages.json', import.meta.url));
  writeFileSync(output, JSON.stringify(seed, null, 2) + '\n');
  console.log(
    JSON.stringify({
      collections: seed.collections.length,
      entries: Object.values(seed.content).reduce((sum, entries) => sum + entries.length, 0),
    })
  );
}
