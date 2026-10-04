import type { SiteAppearance } from './site-appearance.ts';

const rgb = (hex: string) => [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
const luminance = (hex: string) =>
  rgb(hex).reduce((sum, channel, index) => {
    const value = channel / 255;
    const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);

export function appearanceContrast(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function readableAccent(color: string, background: string, destination: string): string {
  const source = rgb(color);
  const target = rgb(destination);
  for (let amount = 0; amount <= 100; amount += 1) {
    const candidate = `#${source
      .map((value, index) =>
        Math.round(value + ((target[index] - value) * amount) / 100)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')}`;
    if (appearanceContrast(candidate, background) >= 4.5) return candidate;
  }
  return destination;
}

/** Only validated appearance presets reach this projection; never interpolate authored CSS. */
export function siteAppearanceCss(appearance: SiteAppearance): { style: string; headerContrast: 'light' | 'dark' } {
  const { primaryColor: primary, secondaryColor: secondary } = appearance;
  const candidates = ['#062432', '#ffffff', '#000000'];
  const gradientForeground = candidates.find(
    (color) => appearanceContrast(color, primary) >= 4.5 && appearanceContrast(color, secondary) >= 4.5
  );
  const foreground = gradientForeground ?? candidates.find((color) => appearanceContrast(color, primary) >= 4.5)!;
  // Very different gradient endpoints can make every foreground unreadable. Use a solid primary then.
  const gradient = gradientForeground ? `linear-gradient(-137deg,${primary},${secondary})` : primary;
  const contentWidth = { compact: 1120, standard: 1252, wide: 1440 }[appearance.width];
  const cardRadius = { reference: 20, soft: 10, square: 0 }[appearance.radius];
  const buttonRadius = { reference: 100, soft: 12, square: 0 }[appearance.radius];
  const sectionSpace = { standard: 110, compact: 80, spacious: 140 }[appearance.spacing];
  const innerSpace = { standard: 90, compact: 64, spacious: 116 }[appearance.spacing];
  const shadows = {
    soft: ['0 8px 20px rgb(0 0 0 / 8%)', '0 12px 30px rgb(0 0 0 / 6%)', '0 15px 40px rgb(0 0 0 / 8%)'],
    none: ['none', 'none', 'none'],
    strong: ['0 10px 28px rgb(0 0 0 / 14%)', '0 18px 44px rgb(0 0 0 / 16%)', '0 22px 56px rgb(0 0 0 / 22%)'],
  }[appearance.shadow];
  const fontBody = appearance.fonts === 'system' ? 'system-ui,sans-serif' : "'DM Sans Variable',system-ui,sans-serif";
  const fontHeading =
    appearance.fonts === 'system' ? 'system-ui,sans-serif' : "'Red Hat Display Variable',system-ui,sans-serif";
  const variables: Record<string, string> = {
    '--fx-primary': primary,
    '--fx-secondary': secondary,
    '--fx-primary-hover': gradientForeground ? secondary : primary,
    '--color-brand': primary,
    '--color-brand-strong': primary,
    '--color-brand-soft': secondary,
    '--color-accent': secondary,
    '--color-on-brand': foreground,
    '--gradient-brand': gradient,
    '--fx-band-end': gradientForeground ? secondary : primary,
    '--fx-link-light': primary === '#03c2f6' ? '#007d9e' : readableAccent(primary, '#f7f7f7', '#000000'),
    '--fx-link-dark': readableAccent(secondary, '#263747', '#ffffff'),
    '--font-body': fontBody,
    '--font-heading': fontHeading,
    '--wide-width': `${contentWidth}px`,
    '--fx-inner-width': `${contentWidth - 48}px`,
    '--fx-boxed-width': `${Math.max(contentWidth, 1200)}px`,
    '--fx-card-radius': `${cardRadius}px`,
    '--fx-image-radius': `${Math.min(cardRadius, 12)}px`,
    '--fx-button-radius': `${buttonRadius}px`,
    '--radius-lg': `${cardRadius}px`,
    '--radius': `${buttonRadius}px`,
    '--fx-section-space': `${sectionSpace}px`,
    '--fx-inner-section-space': `${innerSpace}px`,
    '--fx-shadow-small': shadows[0],
    '--fx-shadow-card': shadows[1],
    '--fx-shadow-hover': shadows[2],
    '--fx-shadow-frame':
      appearance.shadow === 'none' ? 'none' : `0 0 50px rgb(0 0 0 / ${appearance.shadow === 'strong' ? '24%' : '12%'})`,
    '--shadow-lg': shadows[2],
    '--fx-footer-bg': appearance.footerStyle === 'charcoal' ? '#17191f' : '#0e1422',
    '--fx-wave-duration': `${appearance.waveDurationSeconds}s`,
  };
  return {
    style: Object.entries(variables)
      .map(([name, value]) => `${name}:${value}`)
      .join(';'),
    headerContrast: foreground === '#ffffff' ? 'light' : 'dark',
  };
}

export function siteAppearanceAttributes(appearance: SiteAppearance): Record<string, string> {
  const css = siteAppearanceCss(appearance);
  return {
    style: css.style,
    'data-fx-layout': appearance.layout,
    'data-fx-background-pattern': appearance.backgroundPattern,
    'data-fx-header-contrast': css.headerContrast,
    'data-fx-motion-style': appearance.motion,
    'data-fx-reveal-duration': String(appearance.revealDurationMs),
    'data-fx-hero-autoplay': String(appearance.heroAutoplay),
    'data-fx-hero-interval': String(appearance.heroIntervalSeconds * 1000),
    'data-fx-sticky-header': String(appearance.stickyHeader),
    'data-fx-default-color-mode': appearance.colorMode,
  };
}
