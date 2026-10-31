import assert from 'node:assert/strict';
import test from 'node:test';
import { appearanceContrast } from '../src/emdash/site-appearance-css.ts';
import { getAppearanceStrings } from '../src/i18n/appearance.ts';
import { supportedLocales } from '../src/i18n/routing.ts';
import {
  PRIMARY_PRESETS,
  BACKGROUND_PATTERNS,
  SECONDARY_PRESETS,
  mixSecondarySurface,
  parseVisitorAppearance,
  projectVisitorAppearance,
} from '../src/utils/visitor-appearance.ts';

const published = { primaryColor: '#03c2f6', gradientColor: '#42d7ff' };

test('saved preferences keep only validated colors and layout choices', () => {
  const preferences = parseVisitorAppearance({
    primaryColor: '#12AbEF',
    secondaryColor: SECONDARY_PRESETS[0],
    layout: 'boxed',
    theme: 'dark',
    css: 'background:url(https://untrusted.example/image)',
    design_secondary_color: '#ffffff',
  });
  assert.deepEqual(preferences, { primaryColor: '#12abef', secondaryColor: SECONDARY_PRESETS[0], layout: 'boxed' });
  assert.deepEqual(parseVisitorAppearance({ primaryColor: '#000000', layout: 'wide' }), {
    primaryColor: '#000000',
    layout: 'wide',
  });
});

test('invalid saved values cannot become CSS, attributes, or resource requests', () => {
  for (const value of [undefined, null, true, 0, [], '#03c2f6', '{"primary":"#03c2f6"}']) {
    assert.deepEqual(parseVisitorAppearance(value), {});
  }
  for (const primary of [
    '#123',
    'red',
    '#12gg00',
    '#123456\n',
    ' #123456',
    '#123456;--bad:url(https://untrusted.example)',
    '</style><script>alert(1)</script>',
    {},
    123456,
  ]) {
    assert.deepEqual(parseVisitorAppearance({ primaryColor: primary }), {});
  }
  for (const secondary of ['#ffffff', published.gradientColor, '#123', 'red', 'url(https://untrusted.example)', null]) {
    assert.deepEqual(parseVisitorAppearance({ secondaryColor: secondary }), {});
  }
  for (const layout of ['full', 'BOXED', 'boxed" onload="alert(1)', null, false]) {
    assert.deepEqual(parseVisitorAppearance({ layout }), {});
  }
});

test('invalid fields do not discard a valid independent preference', () => {
  assert.deepEqual(parseVisitorAppearance({ primaryColor: '#03c2f6', secondaryColor: '#ffffff', layout: 'unsafe' }), {
    primaryColor: '#03c2f6',
  });
  for (const secondary of SECONDARY_PRESETS) {
    assert.equal(parseVisitorAppearance({ secondaryColor: secondary }).secondaryColor, secondary);
  }
});

test('primary choices preserve readable labels and choose a matching header wordmark', () => {
  for (const primary of [...PRIMARY_PRESETS, '#000000', '#ffffff', '#777777']) {
    const result = projectVisitorAppearance(published, { primaryColor: primary });
    const properties = result.properties;
    assert.equal(properties['--fx-primary'], primary);
    assert.ok(appearanceContrast(properties['--color-on-brand'], primary) >= 4.5, `primary label ${primary}`);
    assert.ok(
      appearanceContrast(properties['--color-on-brand'], properties['--fx-primary-hover']) >= 4.5,
      `hover label ${primary}`
    );
    assert.ok(appearanceContrast(properties['--fx-link-light'], '#f7f7f7') >= 4.5, `light link ${primary}`);
    assert.ok(appearanceContrast(properties['--fx-link-dark'], '#263747') >= 4.5, `dark link ${primary}`);
    assert.equal(result.headerContrast, properties['--color-on-brand'] === '#ffffff' ? 'light' : 'dark');
    assert.equal(published.primaryColor, '#03c2f6');
    assert.equal(published.gradientColor, '#42d7ff');
  }
  assert.equal(projectVisitorAppearance(published, { primaryColor: '#000000' }).headerContrast, 'light');
  assert.equal(projectVisitorAppearance(published, { primaryColor: '#ffffff' }).headerContrast, 'dark');
});

test('secondary choices remain dark surfaces with readable white foregrounds', () => {
  assert.equal(SECONDARY_PRESETS.length, 8);
  assert.equal(new Set(SECONDARY_PRESETS).size, 8);
  for (const secondary of SECONDARY_PRESETS) {
    assert.ok(appearanceContrast('#ffffff', secondary) >= 4.5, `dark base ${secondary}`);
    const surface = mixSecondarySurface(secondary);
    assert.match(surface, /^#[0-9a-f]{6}$/i);
    assert.notEqual(surface, secondary);
    assert.ok(appearanceContrast('#ffffff', surface) >= 4.5, `soft dark surface ${secondary}`);
  }
  assert.ok(!SECONDARY_PRESETS.includes(published.gradientColor));
});

test('the visitor secondary base keeps the CMS gradient independent and dark links readable', () => {
  for (const secondaryColor of SECONDARY_PRESETS) {
    for (const gradientColor of [published.gradientColor, '#000000', '#ffffff', '#ff0000']) {
      const base = { ...published, gradientColor };
      const result = projectVisitorAppearance(base, { secondaryColor });
      assert.equal(result.properties['--fx-visitor-secondary'], secondaryColor);
      assert.equal(result.properties['--fx-footer-bg'], secondaryColor);
      assert.equal(result.properties['--fx-secondary'], undefined);
      assert.equal(result.properties['--gradient-brand'], undefined);
      assert.equal(result.headerContrast, undefined, 'a secondary choice does not change the primary wordmark');
      for (const background of [secondaryColor, mixSecondarySurface(secondaryColor), '#263747']) {
        assert.ok(
          appearanceContrast(result.properties['--fx-link-dark'], background) >= 4.5,
          `link on ${background}, gradient ${gradientColor}`
        );
      }
      assert.equal(base.gradientColor, gradientColor);
    }
  }
});

test('absence of visitor colors leaves the published appearance intact', () => {
  assert.deepEqual(projectVisitorAppearance(published, {}), { properties: {}, headerContrast: undefined });
  assert.deepEqual(projectVisitorAppearance(published, { layout: 'boxed' }), {
    properties: {},
    headerContrast: undefined,
  });
});

test('background preferences accept only named local patterns and preserve independent colors', () => {
  assert.equal(BACKGROUND_PATTERNS.length, 9);
  assert.equal(new Set(BACKGROUND_PATTERNS).size, 9);
  for (const backgroundPattern of BACKGROUND_PATTERNS) {
    assert.deepEqual(parseVisitorAppearance({ backgroundPattern }), { backgroundPattern });
    assert.deepEqual(projectVisitorAppearance(published, { backgroundPattern }), {
      properties: {},
      headerContrast: undefined,
    });
  }
  for (const backgroundPattern of [
    'GRID',
    ' grid',
    'grid\n',
    '',
    null,
    {},
    'url(https://untrusted.example)',
    'https://untrusted.example/pattern.png',
    'dots" onload="bad',
    '__proto__',
  ]) {
    assert.deepEqual(parseVisitorAppearance({ primaryColor: '#0554f2', backgroundPattern }), {
      primaryColor: '#0554f2',
    });
  }
  // Preferences saved before patterns were introduced remain valid without a migration.
  assert.deepEqual(parseVisitorAppearance({ primaryColor: '#0554f2', layout: 'boxed' }), {
    primaryColor: '#0554f2',
    layout: 'boxed',
  });
});

test('all eight locales provide clear appearance controls and browser-only feedback', () => {
  const english = getAppearanceStrings('en');
  assert.equal(english.primary, 'Primary Color');
  assert.equal(english.secondary, 'Secondary Color');
  assert.equal(english.layout, 'Layout Mode');
  assert.equal(english.backgroundPatterns, 'Background Patterns');
  assert.equal(getAppearanceStrings('zh').primary, '主色');
  assert.equal(getAppearanceStrings('zh').secondary, '辅助色');
  assert.match(getAppearanceStrings('zh').secondaryHint, /深色基底/);
  assert.equal(supportedLocales.length, 8);
  for (const locale of supportedLocales) {
    const copy = getAppearanceStrings(locale);
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(english).sort(), `complete locale ${locale}`);
    for (const [name, value] of Object.entries(copy)) {
      if (name === 'patterns') continue;
      assert.ok(typeof value === 'string' && value.trim(), `text in ${locale}`);
    }
    assert.deepEqual(Object.keys(copy.patterns).sort(), [...BACKGROUND_PATTERNS].sort(), `all patterns in ${locale}`);
    for (const label of Object.values(copy.patterns)) assert.ok(label.trim(), `pattern label in ${locale}`);
    assert.notEqual(copy.updated, copy.restored, `distinct feedback in ${locale}`);
    if (locale !== 'en') {
      assert.notEqual(copy.primary, english.primary, `localized primary in ${locale}`);
      assert.notEqual(copy.browserOnly, english.browserOnly, `localized scope notice in ${locale}`);
    }
  }
});
