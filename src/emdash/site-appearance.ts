import type { CreateFieldInput } from 'emdash';

/** Public appearance values are bounded presets, never authored CSS or script. */
export interface SiteAppearance {
  primaryColor: string;
  secondaryColor: string;
  fonts: 'flexina' | 'system';
  width: 'compact' | 'standard' | 'wide';
  layout: 'wide' | 'boxed';
  backgroundPattern: 'none' | 'dots' | 'grid' | 'diagonal';
  radius: 'reference' | 'soft' | 'square';
  shadow: 'soft' | 'none' | 'strong';
  spacing: 'standard' | 'compact' | 'spacious';
  colorMode: 'system' | 'light' | 'dark';
  motion: 'standard' | 'subtle' | 'off';
  revealDurationMs: number;
  heroAutoplay: boolean;
  heroIntervalSeconds: number;
  footerStyle: 'navy' | 'charcoal';
  footerWave: boolean;
  waveDurationSeconds: number;
  stickyHeader: boolean;
  backToTop: boolean;
}

export const DEFAULT_SITE_APPEARANCE: Readonly<SiteAppearance> = Object.freeze({
  primaryColor: '#03c2f6',
  secondaryColor: '#42d7ff',
  fonts: 'flexina',
  width: 'standard',
  layout: 'wide',
  backgroundPattern: 'none',
  radius: 'reference',
  shadow: 'soft',
  spacing: 'standard',
  colorMode: 'system',
  motion: 'standard',
  revealDurationMs: 1000,
  heroAutoplay: true,
  heroIntervalSeconds: 12,
  footerStyle: 'navy',
  footerWave: true,
  waveDurationSeconds: 10,
  stickyHeader: true,
  backToTop: true,
});

const enumField = (slug: string, label: string, values: string[]): CreateFieldInput => ({
  slug,
  label,
  type: 'select',
  validation: { options: values },
  translatable: false,
});
const integerField = (slug: string, label: string, min: number, max: number): CreateFieldInput => ({
  slug,
  label,
  type: 'integer',
  validation: { min, max },
  translatable: false,
});
const colorField = (slug: string, label: string): CreateFieldInput => ({
  slug,
  label,
  type: 'string',
  validation: { pattern: '^(?:#[0-9a-fA-F]{6})?$', minLength: 0, maxLength: 7 },
  translatable: false,
});
const toggleField = (slug: string, label: string) => enumField(slug, label, ['default', 'enabled', 'disabled']);

// No SQL/default value: existing entries and historical revisions remain untouched.
// Empty means the reviewed public default, including enabled optional switches.
export const SITE_APPEARANCE_FIELDS: ReadonlyArray<CreateFieldInput> = [
  colorField('design_primary_color', 'Design — Primary color (#RRGGBB; empty: #03c2f6)'),
  colorField('design_secondary_color', 'Design — Secondary color (#RRGGBB; empty: #42d7ff)'),
  enumField('design_fonts', 'Design — Fonts (empty: flexina)', ['flexina', 'system']),
  enumField('design_width', 'Design — Content width (1120 / 1252 / 1440 px; empty: standard)', [
    'compact',
    'standard',
    'wide',
  ]),
  enumField('design_layout', 'Design — Page layout (empty: wide)', ['wide', 'boxed']),
  enumField('design_background_pattern', 'Design — Background pattern (empty: none)', [
    'none',
    'dots',
    'grid',
    'diagonal',
  ]),
  enumField('design_radius', 'Design — Corners (empty: reference)', ['reference', 'soft', 'square']),
  enumField('design_shadow', 'Design — Shadows (empty: soft)', ['soft', 'none', 'strong']),
  enumField('design_spacing', 'Design — Section spacing (empty: standard)', ['standard', 'compact', 'spacious']),
  enumField('design_color_mode', 'Design — Default color mode (visitor preference wins; empty: system)', [
    'system',
    'light',
    'dark',
  ]),
  enumField(
    'design_motion',
    'Motion — Animation style (Auto follows system; site off always wins; default: standard)',
    ['standard', 'subtle', 'off']
  ),
  integerField('design_reveal_duration_ms', 'Motion — Reveal duration (400–1800 ms; default/reset: 1000)', 400, 1800),
  toggleField('design_hero_autoplay', 'Motion — Hero autoplay (default: enabled)'),
  integerField('design_hero_interval_seconds', 'Motion — Hero interval (8–30 seconds; default/reset: 12)', 8, 30),
  enumField('design_footer_style', 'Design — Footer background (empty: navy)', ['navy', 'charcoal']),
  toggleField('design_footer_wave', 'Design — Footer wave (default: enabled)'),
  integerField('design_wave_duration_seconds', 'Motion — Wave duration (6–30 seconds; default/reset: 10)', 6, 30),
  toggleField('design_sticky_header', 'Design — Sticky header (default: enabled)'),
  toggleField('design_back_to_top', 'Design — Back to top button (default: enabled)'),
];
export const SITE_APPEARANCE_FIELD_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  SITE_APPEARANCE_FIELDS.map(({ slug, label }) => [slug, label])
);

function choice<T extends string>(value: unknown, fallback: T, values: readonly T[]): T {
  return typeof value === 'string' && values.includes(value as T) ? (value as T) : fallback;
}
function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length === 7 && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value.toLowerCase()
    : fallback;
}
function integer(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}
function enabled(value: unknown, fallback: boolean): boolean {
  return value === 'enabled' ? true : value === 'disabled' ? false : fallback;
}

/** Call only with an already verified, locale-matching published site profile. */
export function mapSiteAppearance(profile?: Record<string, unknown>): SiteAppearance {
  const d = DEFAULT_SITE_APPEARANCE;
  const p = profile ?? {};
  return {
    primaryColor: color(p.design_primary_color, d.primaryColor),
    secondaryColor: color(p.design_secondary_color, d.secondaryColor),
    fonts: choice(p.design_fonts, d.fonts, ['flexina', 'system']),
    width: choice(p.design_width, d.width, ['compact', 'standard', 'wide']),
    layout: choice(p.design_layout, d.layout, ['wide', 'boxed']),
    backgroundPattern: choice(p.design_background_pattern, d.backgroundPattern, ['none', 'dots', 'grid', 'diagonal']),
    radius: choice(p.design_radius, d.radius, ['reference', 'soft', 'square']),
    shadow: choice(p.design_shadow, d.shadow, ['soft', 'none', 'strong']),
    spacing: choice(p.design_spacing, d.spacing, ['standard', 'compact', 'spacious']),
    colorMode: choice(p.design_color_mode, d.colorMode, ['system', 'light', 'dark']),
    motion: choice(p.design_motion, d.motion, ['standard', 'subtle', 'off']),
    revealDurationMs: integer(p.design_reveal_duration_ms, d.revealDurationMs, 400, 1800),
    heroAutoplay: enabled(p.design_hero_autoplay, d.heroAutoplay),
    heroIntervalSeconds: integer(p.design_hero_interval_seconds, d.heroIntervalSeconds, 8, 30),
    footerStyle: choice(p.design_footer_style, d.footerStyle, ['navy', 'charcoal']),
    footerWave: enabled(p.design_footer_wave, d.footerWave),
    waveDurationSeconds: integer(p.design_wave_duration_seconds, d.waveDurationSeconds, 6, 30),
    stickyHeader: enabled(p.design_sticky_header, d.stickyHeader),
    backToTop: enabled(p.design_back_to_top, d.backToTop),
  };
}
