import { DEFAULT_SITE_APPEARANCE } from '../emdash/site-appearance.ts';
import { readableAccent, siteAppearanceCss } from '../emdash/site-appearance-css.ts';

export const PRIMARY_PRESETS = [
  '#f31717',
  '#0554f2',
  '#ff6a3e',
  '#766df4',
  '#c89d66',
  '#f7961c',
  '#6dc77a',
  '#0f7173',
] as const;
export const SECONDARY_PRESETS = [
  '#161c2d',
  '#0a267a',
  '#16243d',
  '#1e2843',
  '#083d59',
  '#191825',
  '#030925',
  '#14212b',
] as const;

export interface VisitorAppearance {
  primaryColor?: string;
  /** The reference switcher's dark base, separate from the CMS gradient companion. */
  secondaryColor?: string;
  layout?: 'wide' | 'boxed';
}

const hexColor = (value: unknown): value is string =>
  typeof value === 'string' && value.length === 7 && /^#[\da-f]{6}$/i.test(value);

/** Browser storage is untrusted: retain only known, bounded preferences. */
export function parseVisitorAppearance(value: unknown): VisitorAppearance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: VisitorAppearance = {};
  if (hexColor(source.primaryColor)) result.primaryColor = source.primaryColor.toLowerCase();
  const secondary = hexColor(source.secondaryColor) ? source.secondaryColor.toLowerCase() : undefined;
  if (secondary && SECONDARY_PRESETS.some((color) => color === secondary)) result.secondaryColor = secondary;
  if (source.layout === 'wide' || source.layout === 'boxed') result.layout = source.layout;
  return result;
}

const PRIMARY_PROPERTIES = [
  '--fx-primary',
  '--fx-primary-hover',
  '--color-brand',
  '--color-brand-strong',
  '--color-brand-soft',
  '--color-accent',
  '--color-on-brand',
  '--gradient-brand',
  '--fx-band-end',
  '--fx-link-light',
  '--fx-link-dark',
];
export const VISITOR_APPEARANCE_PROPERTIES = [
  ...PRIMARY_PROPERTIES,
  '--fx-visitor-secondary',
  '--fx-footer-bg',
] as const;

/** Match the secondary dark surface used by visitor-appearance.css, with a safe foreground. */
export function mixSecondarySurface(hex: string): string {
  return `#${[1, 3, 5]
    .map((offset) =>
      Math.round(Number.parseInt(hex.slice(offset, offset + 2), 16) * 0.8 + 255 * 0.2)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}

export function projectVisitorAppearance(
  base: { primaryColor: string; gradientColor: string },
  value: VisitorAppearance
): { properties: Record<string, string>; headerContrast?: 'light' | 'dark' } {
  const preferences = parseVisitorAppearance(value);
  const gradient = hexColor(base.gradientColor) ? base.gradientColor : DEFAULT_SITE_APPEARANCE.secondaryColor;
  const properties: Record<string, string> = {};
  let headerContrast: 'light' | 'dark' | undefined;
  if (preferences.primaryColor) {
    const projected = siteAppearanceCss({
      ...DEFAULT_SITE_APPEARANCE,
      primaryColor: preferences.primaryColor,
      secondaryColor: gradient,
    });
    const variables = Object.fromEntries(
      projected.style.split(';').map((entry) => {
        const split = entry.indexOf(':');
        return [entry.slice(0, split), entry.slice(split + 1)];
      })
    );
    for (const name of PRIMARY_PROPERTIES) properties[name] = variables[name];
    headerContrast = projected.headerContrast;
  }
  if (preferences.secondaryColor) {
    properties['--fx-visitor-secondary'] = preferences.secondaryColor;
    properties['--fx-footer-bg'] = preferences.secondaryColor;
    let link = gradient;
    for (const background of [preferences.secondaryColor, mixSecondarySurface(preferences.secondaryColor), '#263747']) {
      link = readableAccent(link, background, '#ffffff');
    }
    properties['--fx-link-dark'] = link;
  }
  return { properties, headerContrast };
}
