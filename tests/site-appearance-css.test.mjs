import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { mapSiteAppearance } from '../src/emdash/site-appearance.ts';
import { appearanceContrast, siteAppearanceAttributes, siteAppearanceCss } from '../src/emdash/site-appearance-css.ts';

const variables = (style) =>
  Object.fromEntries(style.split(';').map((declaration) => declaration.split(/:(.*)/s).slice(0, 2)));

test('CMS colors keep links readable in both page color modes', () => {
  for (const color of ['#03c2f6', '#ffffff', '#000000', '#ff0000', '#777777', '#008844', '#ffdd00']) {
    const appearance = mapSiteAppearance({ design_primary_color: color, design_secondary_color: color });
    const css = variables(siteAppearanceCss(appearance).style);
    assert.ok(appearanceContrast(css['--fx-link-light'], '#ffffff') >= 4.5, `light link ${color}`);
    assert.ok(appearanceContrast(css['--fx-link-dark'], '#10151c') >= 4.5, `dark link ${color}`);
    assert.ok(appearanceContrast(css['--color-on-brand'], color) >= 4.5, `button label ${color}`);
    assert.ok(appearanceContrast(css['--color-on-brand'], css['--fx-primary-hover']) >= 4.5, `hover label ${color}`);
  }
});

test('a gradient with incompatible endpoints becomes a readable solid primary', () => {
  const css = variables(
    siteAppearanceCss(mapSiteAppearance({ design_primary_color: '#000000', design_secondary_color: '#ffffff' })).style
  );
  assert.equal(css['--gradient-brand'], '#000000');
  assert.equal(css['--fx-band-end'], '#000000');
  assert.equal(css['--fx-primary-hover'], '#000000');
  assert.ok(appearanceContrast(css['--color-on-brand'], css['--gradient-brand']) >= 4.5);
});

test('ordinary cyan gradients preserve both authored colors and readable labels', () => {
  const css = variables(siteAppearanceCss(mapSiteAppearance()).style);
  assert.match(css['--gradient-brand'], /#03c2f6,#42d7ff/);
  assert.ok(appearanceContrast(css['--color-on-brand'], '#03c2f6') >= 4.5);
  assert.ok(appearanceContrast(css['--color-on-brand'], '#42d7ff') >= 4.5);
});

test('all content width presets also size the footer and boxed surface', () => {
  for (const [preset, width] of [
    ['compact', 1120],
    ['standard', 1252],
    ['wide', 1440],
  ]) {
    const css = variables(siteAppearanceCss(mapSiteAppearance({ design_width: preset })).style);
    assert.equal(css['--wide-width'], `${width}px`);
    assert.equal(css['--fx-inner-width'], `${width - 48}px`);
    assert.ok(Number.parseInt(css['--fx-boxed-width']) >= width);
  }
});

test('safe mapped settings cannot introduce CSS declarations, asset fetches, or arbitrary font URLs', () => {
  const appearance = mapSiteAppearance({
    design_primary_color: '#fff; background:url(https://example.com/secret)',
    design_secondary_color: '</style><script>alert(1)</script>',
    design_fonts: 'url(https://example.com/font)',
    design_width: 'calc(100vw * 100)',
    design_layout: '" onload="alert(1)',
  });
  const attributes = siteAppearanceAttributes(appearance);
  assert.ok(!attributes.style.includes('https:'));
  assert.ok(!attributes.style.includes('<'));
  assert.ok(!attributes.style.includes('background:'));
  assert.equal(attributes['data-fx-layout'], 'wide');
  assert.equal(variables(attributes.style)['--wide-width'], '1252px');
});

test('published motion controls serialize bounds and false switches without HTML boolean coercion', () => {
  const attributes = siteAppearanceAttributes(
    mapSiteAppearance({
      design_motion: 'off',
      design_reveal_duration_ms: 1800,
      design_hero_autoplay: 'disabled',
      design_hero_interval_seconds: 30,
      design_sticky_header: 'disabled',
      design_color_mode: 'dark',
    })
  );
  assert.equal(attributes['data-fx-motion-style'], 'off');
  assert.equal(attributes['data-fx-reveal-duration'], '1800');
  assert.equal(attributes['data-fx-hero-autoplay'], 'false');
  assert.equal(attributes['data-fx-hero-interval'], '30000');
  assert.equal(attributes['data-fx-sticky-header'], 'false');
  assert.equal(attributes['data-fx-default-color-mode'], 'dark');
});

test('dark primary surfaces select the original white header wordmark variant', () => {
  assert.equal(siteAppearanceCss(mapSiteAppearance({ design_primary_color: '#121212' })).headerContrast, 'light');
  assert.equal(siteAppearanceCss(mapSiteAppearance()).headerContrast, 'dark');
});

test('shared lifecycle scripts preserve published color mode and re-read it after navigation', () => {
  const source = readFileSync(new URL('../src/components/common/BasicScripts.astro', import.meta.url), 'utf8');
  const script = source
    .split('<script is:inline define:vars={{ defaultTheme: UI.theme }}>')[1]
    .split('  function attachEvent')[0];
  for (const [saved, published, systemDark, expected, storageBlocked] of [
    [null, 'dark', false, 'dark', false],
    [null, 'light', true, 'light', false],
    ['light', 'dark', true, 'light', false],
    ['dark', 'light', false, 'dark', false],
    ['system', 'dark', false, 'light', false],
    [null, 'system', true, 'dark', false],
    [null, 'dark', false, 'dark', true],
  ]) {
    const classes = new Set();
    const html = {
      lang: 'en',
      dataset: { fxDefaultColorMode: published },
      classList: {
        contains: (value) => classes.has(value),
        add: (value) => classes.add(value),
        remove: (value) => classes.delete(value),
        toggle: (value, force) => (force ? classes.add(value) : classes.delete(value)),
      },
    };
    const window = { matchMedia: () => ({ matches: systemDark }) };
    const context = vm.createContext({
      window,
      defaultTheme: 'system',
      document: { documentElement: html, querySelectorAll: () => [] },
      localStorage: {
        getItem: () => {
          if (storageBlocked) throw new Error('Blocked');
          return saved;
        },
      },
    });
    vm.runInContext(`(() => {${script};window.testInitTheme = initTheme;})()`, context);
    assert.ok(classes.has(expected), `published=${published}, saved=${saved}, blocked=${storageBlocked}`);
    if (!saved) {
      html.dataset.fxDefaultColorMode = 'light';
      window.testInitTheme();
      assert.ok(classes.has('light'), 'after-swap reads current published setting');
    }
  }
});
