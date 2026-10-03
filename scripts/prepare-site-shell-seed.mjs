import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import yaml from 'js-yaml';

const config = yaml.load(readFileSync('src/config.yaml', 'utf8'));
const virtualConfig = {
  SITE: config.site,
  APP_BLOG: config.apps.blog,
  METADATA: config.metadata,
  I18N: config.i18n,
  UI: config.ui,
};
const result = await build({
  stdin: {
    contents: `export { headerData, footerData } from './src/navigation.ts'; export { getLocalizedLabel, localizeInternalHref, supportedLocales } from './src/i18n.ts';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  plugins: [
    {
      name: 'site-config',
      setup(builder) {
        builder.onResolve({ filter: /^astrowind:config$/ }, () => ({ path: 'config', namespace: 'site-config' }));
        builder.onLoad({ filter: /.*/, namespace: 'site-config' }, () => ({
          contents: Object.entries(virtualConfig)
            .map(([key, value]) => `export const ${key} = ${JSON.stringify(value)};`)
            .join('\n'),
          loader: 'js',
        }));
      },
    },
  ],
});
const { headerData, footerData, getLocalizedLabel, localizeInternalHref, supportedLocales } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
);
const locales = [...supportedLocales];
const label = (locale, value) => getLocalizedLabel(locale, value) ?? value;
const menuItem = (locale, item) => ({
  type: 'custom',
  label: label(locale, item.text ?? item.title),
  url: item.href ? localizeInternalHref(item.href, locale) : '#',
  ...(item.target ? { target: item.target } : {}),
  ...(item.links?.length ? { children: item.links.map((child) => menuItem(locale, child)) } : {}),
});
const field = (slug, fieldLabel, type = 'string') => ({ slug, label: fieldLabel, type });
const seed = {
  version: '1',
  defaultLocale: 'en',
  meta: {
    name: 'CinaGroup existing site presentation',
    description: 'Approved existing public values. Initialize missing records only.',
    author: 'CinaGroup',
  },
  settings: {
    title: config.site.name,
    url: config.site.site,
    tagline: config.metadata.description,
    postsPerPage: config.apps.blog.postsPerPage,
    dateFormat: 'MMMM d, yyyy',
    timezone: 'Asia/Singapore',
    social: {
      github: 'https://github.com/cinagroup',
      twitter: 'https://x.com/cinagroup',
      instagram: 'https://www.instagram.com/cinaseek/',
    },
    seo: { titleSeparator: ' — ' },
  },
  collections: [
    {
      slug: 'site_profile',
      label: 'Site Presentation',
      labelSingular: 'Site Presentation',
      description:
        'Public contact, footer and brand presentation. Global site identity and social/SEO settings are in Settings; navigation is in Menus.',
      supports: ['drafts', 'revisions'],
      routable: false,
      titleField: 'title',
      group: 'Website',
      sortOrder: 0,
      fields: [
        field('title', 'Entry name'),
        field('site_name', 'Localized default site name'),
        field('tagline', 'Localized site description', 'text'),
        field('contact_email', 'Public contact email'),
        field('footer_description', 'Footer introduction', 'text'),
        field('header_cta_label', 'Header contact button label'),
        field('header_cta_href', 'Header contact button URL'),
        field('logo_dark', 'Logo for dark backgrounds', 'image'),
        {
          slug: 'extra_social_links',
          label: 'Additional social links',
          type: 'repeater',
          validation: {
            subFields: [
              field('label', 'Label'),
              field('url', 'URL'),
              { ...field('icon', 'Icon', 'select'), validation: { options: ['tiktok', 'rss'] } },
            ],
          },
        },
      ],
    },
  ],
  menus: [],
  content: { site_profile: [] },
};
for (const locale of locales) {
  const pricingLabels = {
    en: 'Pricing',
    zh: '价格',
    ja: '料金',
    ko: '가격',
    ru: 'Цены',
    es: 'Precios',
    pt: 'Preços',
    fr: 'Tarifs',
  };
  const groups = [
    footerData.links[0],
    footerData.links[2],
    { title: footerData.links[1].title, links: [...footerData.links[1].links, ...footerData.links[3].links] },
  ];
  for (const [name, menuLabel, items] of [
    [
      'primary',
      'Primary navigation',
      [
        ...headerData.links.map((item) => menuItem(locale, item)),
        { type: 'custom', label: pricingLabels[locale], url: localizeInternalHref('/pricing/', locale) },
      ],
    ],
    ['footer', 'Footer navigation', groups.map((item) => menuItem(locale, item))],
    ['footer-legal', 'Legal links', footerData.secondaryLinks.map((item) => menuItem(locale, item))],
  ])
    seed.menus.push({
      id: `${name}-${locale}`,
      name,
      label: menuLabel,
      locale,
      ...(locale === 'en' ? {} : { translationOf: `${name}-en` }),
      items,
    });
  seed.content.site_profile.push({
    id: `site-profile-${locale}`,
    slug: 'site',
    locale,
    status: 'published',
    ...(locale === 'en' ? {} : { translationOf: 'site-profile-en' }),
    data: {
      title: `Site presentation (${locale})`,
      site_name: label(locale, 'CinaGroup'),
      tagline: config.metadata.description,
      contact_email: 'info@cinagroup.com',
      footer_description: label(locale, footerData.description),
      header_cta_label: label(locale, 'Contact'),
      header_cta_href: localizeInternalHref('/contact/', locale),
      extra_social_links: [
        { label: 'TikTok', url: 'https://tiktok.com/@cinaseek', icon: 'tiktok' },
        { label: 'RSS', url: localizeInternalHref('/rss.xml', locale), icon: 'rss' },
      ],
    },
  });
}
const output = resolve('seed/site-shell.json');
writeFileSync(output, JSON.stringify(seed, null, 2) + '\n');
console.log(
  `Prepared ${locales.length} site profiles and ${seed.menus.length} localized menus at ${pathToFileURL(output).pathname}`
);
