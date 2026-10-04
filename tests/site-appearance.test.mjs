import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SITE_APPEARANCE, SITE_APPEARANCE_FIELDS, mapSiteAppearance } from '../src/emdash/site-appearance.ts';
import { createSitePresentationLoader, mapSitePresentation } from '../src/emdash/site-presentation-model.ts';

test('older profiles keep their exact data and receive complete, independent safe defaults', () => {
  const profile = { title: 'Existing name', contact_email: 'info@cinagroup.com', footer_description: 'Existing copy' };
  const before = structuredClone(profile);
  const result = mapSitePresentation({}, {}, profile, 'zh');
  assert.deepEqual(result.appearance, DEFAULT_SITE_APPEARANCE);
  assert.deepEqual(profile, before);
  assert.equal(result.footerDescription, profile.footer_description);
  result.appearance.width = 'wide';
  assert.equal(mapSiteAppearance(profile).width, 'standard');
  assert.equal(mapSiteAppearance(undefined).footerWave, true);
});

test('reviewed design fields map all public presets and native enabled/disabled selectors', () => {
  const result = mapSiteAppearance({
    design_primary_color: '#12AbEF',
    design_secondary_color: '#ABCDEF',
    design_fonts: 'system',
    design_width: 'wide',
    design_layout: 'boxed',
    design_background_pattern: 'grid',
    design_radius: 'square',
    design_shadow: 'strong',
    design_spacing: 'spacious',
    design_color_mode: 'dark',
    design_motion: 'subtle',
    design_reveal_duration_ms: 1800,
    design_hero_autoplay: 'disabled',
    design_hero_interval_seconds: 30,
    design_footer_style: 'charcoal',
    design_footer_wave: 'disabled',
    design_wave_duration_seconds: 6,
    design_sticky_header: 'disabled',
    design_back_to_top: 'disabled',
  });
  assert.deepEqual(result, {
    primaryColor: '#12abef',
    secondaryColor: '#abcdef',
    fonts: 'system',
    width: 'wide',
    layout: 'boxed',
    backgroundPattern: 'grid',
    radius: 'square',
    shadow: 'strong',
    spacing: 'spacious',
    colorMode: 'dark',
    motion: 'subtle',
    revealDurationMs: 1800,
    heroAutoplay: false,
    heroIntervalSeconds: 30,
    footerStyle: 'charcoal',
    footerWave: false,
    waveDurationSeconds: 6,
    stickyHeader: false,
    backToTop: false,
  });
  for (const value of ['default', 'enabled', null, undefined]) {
    assert.equal(mapSiteAppearance({ design_hero_autoplay: value }).heroAutoplay, true);
  }
});

test('CSS injection, remote resources, unknown choices and non-integer or out-of-range timings fall back', () => {
  for (const value of ['red', '#123', '#123456;--x:url(https://example.com)', '#123456\n', ' #123456', {}, 12]) {
    assert.equal(mapSiteAppearance({ design_primary_color: value }).primaryColor, DEFAULT_SITE_APPEARANCE.primaryColor);
  }
  const invalid = Object.fromEntries(
    SITE_APPEARANCE_FIELDS.map(({ slug }) => [slug, 'url(https://remote.example/font)'])
  );
  assert.deepEqual(mapSiteAppearance(invalid), DEFAULT_SITE_APPEARANCE);
  for (const [slug, key, min, max] of [
    ['design_reveal_duration_ms', 'revealDurationMs', 400, 1800],
    ['design_hero_interval_seconds', 'heroIntervalSeconds', 8, 30],
    ['design_wave_duration_seconds', 'waveDurationSeconds', 6, 30],
  ]) {
    for (const value of [min - 1, max + 1, min + 0.5, String(min), Infinity, NaN, true])
      assert.equal(mapSiteAppearance({ [slug]: value })[key], DEFAULT_SITE_APPEARANCE[key]);
    assert.equal(mapSiteAppearance({ [slug]: min })[key], min);
    assert.equal(mapSiteAppearance({ [slug]: max })[key], max);
  }
  assert.equal(
    mapSiteAppearance({ design_footer_wave: false }).footerWave,
    true,
    'unreviewed boolean storage does not masquerade as a selector'
  );
});

test('preview, draft, wrong-locale and fallback profiles cannot supply public appearance', async () => {
  const readers = (response) =>
    createSitePresentationLoader({
      settings: async () => ({ data: {} }),
      menu: async () => null,
      profile: async () => response,
    });
  const valid = { entry: { data: { slug: 'site', locale: 'zh', status: 'published', design_motion: 'off' } } };
  assert.equal((await readers(valid)({ locals: {} }, 'zh')).appearance.motion, 'off');
  for (const response of [
    { ...valid, isPreview: true },
    { ...valid, fallbackLocale: 'en' },
    { ...valid, error: 'unavailable' },
    { entry: { data: { ...valid.entry.data, status: 'draft' } } },
    { entry: { data: { ...valid.entry.data, locale: 'en' } } },
  ])
    assert.deepEqual((await readers(response)({ locals: {} }, 'zh')).appearance, DEFAULT_SITE_APPEARANCE);
});
