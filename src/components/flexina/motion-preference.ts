export const MOTION_CHANGE_EVENT = 'cina:motion-preference-change';
export const MOTION_STORAGE_KEY = 'cinagroup-motion-preference';
export type VisitorMotionPreference = 'auto' | 'on' | 'off';
export type SiteMotionStyle = 'standard' | 'subtle' | 'off';

export interface MotionState {
  enabled: boolean;
  preference: VisitorMotionPreference;
  style: SiteMotionStyle;
  revealDurationMs: number;
  heroAutoplay: boolean;
  heroIntervalMs: number;
  stickyHeader: boolean;
}

let transientPreference: VisitorMotionPreference = 'auto';
const preferenceValue = (value: unknown): VisitorMotionPreference | undefined =>
  value === 'auto' || value === 'on' || value === 'off' ? value : undefined;

export function getVisitorMotionPreference(): VisitorMotionPreference {
  try {
    return preferenceValue(window.localStorage.getItem(MOTION_STORAGE_KEY)) ?? 'auto';
  } catch {
    return transientPreference;
  }
}

function boundedNumber(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const number = Number(value);
  return value && Number.isFinite(number) ? Math.round(Math.min(maximum, Math.max(minimum, number))) : fallback;
}

export function readMotionState(): MotionState {
  const config = document.documentElement.dataset;
  const style: SiteMotionStyle = ['standard', 'subtle', 'off'].includes(config.fxMotionStyle ?? '')
    ? (config.fxMotionStyle as SiteMotionStyle)
    : 'standard';
  const preference = getVisitorMotionPreference();
  const enabled =
    style !== 'off' &&
    preference !== 'off' &&
    (preference === 'on' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  return {
    enabled,
    preference,
    style,
    revealDurationMs: boundedNumber(config.fxRevealDuration, 1000, 400, 1800),
    heroAutoplay: config.fxHeroAutoplay !== 'false',
    heroIntervalMs: boundedNumber(config.fxHeroInterval, 12_000, 8000, 30_000),
    stickyHeader: config.fxStickyHeader !== 'false',
  };
}

export function publishMotionState(): MotionState {
  const state = readMotionState();
  document.documentElement.dataset.fxMotionEnabled = String(state.enabled);
  document.dispatchEvent(new CustomEvent(MOTION_CHANGE_EVENT, { detail: state }));
  return state;
}

export function setVisitorMotionPreference(preference: VisitorMotionPreference): MotionState {
  transientPreference = preferenceValue(preference) ?? 'auto';
  try {
    window.localStorage.setItem(MOTION_STORAGE_KEY, transientPreference);
  } catch {
    // The explicit choice still works for this page when browser storage is unavailable.
  }
  return publishMotionState();
}
