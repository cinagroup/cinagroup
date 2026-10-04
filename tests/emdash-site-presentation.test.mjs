import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SITE_APPEARANCE } from '../src/emdash/site-appearance.ts';
import {
  safePresentationHref,
  presentationMedia,
  presentationMenu,
  mapSitePresentation,
  publishedSiteProfile,
  createSitePresentationLoader,
} from '../src/emdash/site-presentation-model.ts';

const profileResult = (locale = 'zh', data = {}) => ({
  entry: { data: { status: 'published', locale, slug: 'site', ...data } },
  isPreview: false,
  cacheHint: { tags: ['profile'] },
});
const menu = (locale = 'zh', items = []) => ({ locale, items });
const request = (path = '/zh/') => ({ locals: {}, url: new URL(path, 'https://cinagroup.com') });

test('menu links reject executable protocols, remote authority escapes and credentials', () => {
  for (const href of [
    'javascript:alert(1)',
    'data:text/html,x',
    '//evil.example/a',
    '/\\evil.example',
    'https://user:password@example.com',
    'https://example.com/a b',
    'file:///tmp/a',
    'ftp://example.com/a',
    'relative/path',
  ]) {
    assert.equal(safePresentationHref(href), undefined, href);
  }
  for (const href of [
    '/zh/contact/',
    '#pricing',
    'https://example.com/a',
    'http://example.com/a',
    'mailto:info@cinagroup.com',
    'tel:+123',
  ]) {
    assert.equal(safePresentationHref(href), href);
  }
});

test('site media resolves only local uploads and validates intrinsic dimensions', () => {
  assert.deepEqual(
    presentationMedia({
      url: '/_emdash/api/media/file/logo.webp',
      alt: 'Logo',
      width: 832,
      height: 288,
      contentType: 'image/webp',
    }),
    {
      url: '/_emdash/api/media/file/logo.webp',
      alt: 'Logo',
      width: 832,
      height: 288,
      contentType: 'image/webp',
    }
  );
  assert.equal(presentationMedia({ url: 'https://remote.example/logo.png' }), undefined);
  assert.equal(presentationMedia({ mediaId: 'unresolved' }), undefined);
  assert.equal(presentationMedia({ src: '/logo.png', width: -1, height: Number.NaN }).width, undefined);
});

test('menus use the exact locale, preserve intentional emptiness, and sanitize nested links', () => {
  assert.equal(presentationMenu(menu('en'), 'zh'), undefined);
  assert.deepEqual(presentationMenu(menu(), 'zh'), []);
  assert.deepEqual(
    presentationMenu(
      menu('zh', [
        {
          label: '产品',
          url: 'javascript:alert(1)',
          children: [
            { label: '安全链接', url: '/zh/cinaseek/', target: '_blank', children: [] },
            { label: '拒绝', url: 'data:text/html,x' },
          ],
        },
      ]),
      'zh'
    ),
    [
      {
        label: '产品',
        url: '#',
        target: undefined,
        children: [{ label: '安全链接', url: '/zh/cinaseek/', target: '_blank', children: [] }],
      },
    ]
  );
});

test('public profile rejects preview, drafts, locale fallback and a different singleton', () => {
  assert.equal(publishedSiteProfile(profileResult(), 'zh').slug, 'site');
  for (const result of [
    { ...profileResult(), isPreview: true },
    { ...profileResult(), fallbackLocale: 'en' },
    { ...profileResult(), error: new Error('missing') },
    profileResult('en'),
    profileResult('zh', { status: 'draft' }),
    profileResult('zh', { slug: 'other' }),
  ])
    assert.equal(publishedSiteProfile(result, 'zh'), undefined);
});

test('native settings, localized profile and authored empty menus have explicit priorities', () => {
  const presentation = mapSitePresentation(
    {
      title: 'Edited global name',
      tagline: 'Edited global description',
      logo: { url: '/logo.png' },
      favicon: { url: '/icon.png' },
      seo: {
        defaultOgImage: { url: '/share.webp' },
        titleSeparator: '|',
        googleVerification: 'google',
        bingVerification: 'bing',
      },
      social: { twitter: 'https://x.com/edited', github: 'javascript:alert(1)' },
    },
    { primary: menu(), footer: menu('en') },
    {
      site_name: '本地初始名',
      tagline: '本地初始描述',
      footer_description: '编辑过的页脚',
      contact_email: 'support@cinagroup.com',
      logo_dark: { src: '/white-logo.png' },
      header_cta_label: '联系团队',
      header_cta_href: '/zh/contact/',
      extra_social_links: [
        { label: 'RSS', url: '/rss.xml', icon: 'rss' },
        { label: 'bad', url: '/x', icon: 'unapproved' },
      ],
    },
    'zh'
  );
  assert.equal(presentation.siteName, 'Edited global name');
  assert.equal(presentation.tagline, 'Edited global description');
  assert.equal(presentation.footerDescription, '编辑过的页脚');
  assert.equal(presentation.contactEmail, 'support@cinagroup.com');
  assert.equal(presentation.darkLogo.url, '/white-logo.png');
  assert.equal(presentation.favicon.url, '/icon.png');
  assert.equal(presentation.defaultOgImage.url, '/share.webp');
  assert.equal(presentation.headerCtaHref, '/zh/contact/');
  assert.equal(presentation.titleSeparator, '|');
  assert.deepEqual(presentation.menus.primary, []);
  assert.equal(presentation.menus.footer, undefined);
  assert.deepEqual(
    presentation.socialLinks.map((item) => item.href),
    ['https://x.com/edited', '/rss.xml']
  );
  assert.equal(
    mapSitePresentation({}, {}, { contact_email: 'a@b.com?subject=x', header_cta_href: 'javascript:alert(1)' }, 'zh')
      .contactEmail,
    undefined
  );
  assert.equal(mapSitePresentation({}, {}, { header_cta_href: 'javascript:alert(1)' }, 'zh').headerCtaHref, undefined);
  assert.equal(mapSitePresentation({}, {}, undefined, 'zh').socialLinks, undefined);
  assert.deepEqual(mapSitePresentation({ social: {} }, {}, undefined, 'zh').socialLinks, []);
});

test('all components in one request share the reads, while later requests see fresh data', async () => {
  const calls = { settings: 0, menus: [], profile: 0 };
  let title = 'Before edit';
  const load = createSitePresentationLoader({
    settings: async () => {
      calls.settings++;
      return { data: { title }, cacheHint: { tags: ['settings'] } };
    },
    menu: async (name, locale) => {
      calls.menus.push([name, locale]);
      return { data: menu(locale), cacheHint: { tags: [`menu:${name}`] } };
    },
    profile: async (locale) => {
      calls.profile++;
      return profileResult(locale, { footer_description: 'Footer' });
    },
  });
  const hints = [];
  const firstRequest = request();
  const first = load(firstRequest, 'zh', (hint) => hints.push(hint));
  assert.equal(load(firstRequest, 'zh'), first);
  assert.equal((await first).siteName, 'Before edit');
  assert.equal(calls.settings, 1);
  assert.equal(calls.profile, 1);
  assert.deepEqual(calls.menus, [
    ['primary', 'zh'],
    ['footer', 'zh'],
    ['footer-legal', 'zh'],
  ]);
  assert.equal(hints.length, 5);
  title = 'After edit';
  assert.equal((await load(request(), 'zh')).siteName, 'After edit');
  assert.equal(calls.settings, 2);
});

test('prerender needs no database and failed CMS reads retain independent valid data', async () => {
  let reads = 0;
  const load = createSitePresentationLoader({
    settings: async () => {
      reads++;
      throw new Error('runtime unavailable');
    },
    menu: async (name, locale) => {
      reads++;
      if (name === 'primary') throw new Error('missing');
      return { data: menu(locale) };
    },
    profile: async (locale) => {
      reads++;
      return profileResult(locale, { footer_description: 'Published footer' });
    },
  });
  assert.deepEqual(await load({ ...request(), isPrerendered: true }, 'zh'), {
    appearance: DEFAULT_SITE_APPEARANCE,
    menus: {},
  });
  assert.equal(reads, 0);
  const presentation = await load(request(), 'zh');
  assert.equal(presentation.siteName, undefined);
  assert.equal(presentation.footerDescription, 'Published footer');
  assert.equal(presentation.menus.primary, undefined);
  assert.deepEqual(presentation.menus.footer, []);
  assert.equal(reads, 5);
});
