import {
  parseVisitorAppearance,
  projectVisitorAppearance,
  VISITOR_APPEARANCE_PROPERTIES,
  type VisitorAppearance,
} from '~/utils/visitor-appearance';

const STORAGE_KEY = 'cinagroup:appearance:v1';
interface AppearanceBaseline {
  primaryColor: string;
  gradientColor: string;
  layout: string;
  backgroundPattern: string;
  headerContrast: string;
  properties: Record<string, { value: string; priority: string }>;
}

let preferences: VisitorAppearance = {};
function decodeStored(value: string | null): VisitorAppearance {
  try {
    return value && value.length <= 2048 ? parseVisitorAppearance(JSON.parse(value)) : {};
  } catch {
    return {};
  }
}
try {
  preferences = decodeStored(localStorage.getItem(STORAGE_KEY));
} catch {
  // In-memory choices remain usable if the browser blocks storage.
}

function captureBaseline(page: Document): AppearanceBaseline {
  const html = page.documentElement;
  const controls = page.querySelector<HTMLElement>('[data-appearance-switcher]');
  const properties = Object.fromEntries(
    VISITOR_APPEARANCE_PROPERTIES.map((name) => [
      name,
      { value: html.style.getPropertyValue(name), priority: html.style.getPropertyPriority(name) },
    ])
  );
  return {
    primaryColor: html.style.getPropertyValue('--fx-primary').trim() || controls?.dataset.defaultPrimary || '#03c2f6',
    gradientColor:
      html.style.getPropertyValue('--fx-secondary').trim() || controls?.dataset.defaultGradient || '#42d7ff',
    layout: html.dataset.fxLayout || controls?.dataset.defaultLayout || 'wide',
    backgroundPattern: html.dataset.fxBackgroundPattern || controls?.dataset.defaultPattern || 'none',
    headerContrast: html.dataset.fxHeaderContrast || 'dark',
    properties,
  };
}

let baseline = captureBaseline(document);

function applyAppearance(page: Document, defaults: AppearanceBaseline) {
  if (!page.body?.classList.contains('marketing-template')) return;
  const html = page.documentElement;
  // Restore only owned properties; keep independent motion and theme preferences intact.
  for (const [name, property] of Object.entries(defaults.properties)) {
    if (property.value) html.style.setProperty(name, property.value, property.priority);
    else html.style.removeProperty(name);
  }
  const projection = projectVisitorAppearance(defaults, preferences);
  for (const [name, value] of Object.entries(projection.properties)) html.style.setProperty(name, value);
  html.dataset.fxLayout = preferences.layout ?? defaults.layout;
  html.dataset.fxBackgroundPattern = preferences.backgroundPattern ?? defaults.backgroundPattern;
  html.dataset.fxHeaderContrast = projection.headerContrast ?? defaults.headerContrast;
  if (preferences.secondaryColor) html.setAttribute('data-fx-visitor-secondary', '');
  else html.removeAttribute('data-fx-visitor-secondary');
}

function savePreferences() {
  try {
    if (Object.keys(preferences).length) localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Preferences still work for this visit and Astro navigation.
  }
}

function syncControls(root: HTMLElement) {
  const primary = preferences.primaryColor ?? baseline.primaryColor;
  const picker = root.querySelector<HTMLInputElement>('[data-appearance-primary]');
  if (picker) picker.value = primary;
  const output = root.querySelector<HTMLElement>('[data-appearance-primary-value]');
  if (output) output.textContent = primary;
  root.querySelectorAll<HTMLButtonElement>('[data-appearance-primary-preset]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.appearancePrimaryPreset === primary));
  });
  root.querySelectorAll<HTMLButtonElement>('[data-appearance-secondary]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.appearanceSecondary === preferences.secondaryColor));
  });
  root
    .querySelector('[data-appearance-secondary-default]')
    ?.setAttribute('aria-pressed', String(!preferences.secondaryColor));
  root.querySelectorAll<HTMLButtonElement>('[data-appearance-layout]').forEach((button) => {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.appearanceLayout === (preferences.layout ?? baseline.layout))
    );
  });
  root.querySelectorAll<HTMLButtonElement>('[data-appearance-pattern]').forEach((button) => {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.appearancePattern === (preferences.backgroundPattern ?? baseline.backgroundPattern))
    );
  });
  root
    .querySelector('[data-appearance-pattern-default]')
    ?.setAttribute('aria-pressed', String(!preferences.backgroundPattern));
}

function closePanel(root: HTMLElement, restoreFocus = false) {
  const panel = root.querySelector<HTMLElement>('[data-appearance-panel]');
  const toggle = root.querySelector<HTMLButtonElement>('[data-appearance-toggle]');
  if (panel) panel.hidden = true;
  toggle?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) toggle?.focus({ preventScroll: true });
}

function updatePreferences(root: HTMLElement, next: VisitorAppearance, reset = false, announce = true) {
  preferences = parseVisitorAppearance(next);
  savePreferences();
  applyAppearance(document, baseline);
  syncControls(root);
  const status = root.querySelector<HTMLElement>('[data-appearance-status]');
  if (status && announce) status.textContent = (reset ? root.dataset.resetMessage : root.dataset.updatedMessage) ?? '';
}

function initializeSwitcher() {
  const root = document.querySelector<HTMLElement>('[data-appearance-switcher]');
  if (!root) return;
  applyAppearance(document, baseline);
  syncControls(root);
  root.hidden = false;
  if (root.dataset.appearanceReady) return;
  root.dataset.appearanceReady = 'true';
  const toggle = root.querySelector<HTMLButtonElement>('[data-appearance-toggle]');
  const panel = root.querySelector<HTMLElement>('[data-appearance-panel]');
  toggle?.addEventListener('click', () => {
    if (!panel) return;
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) root.querySelector<HTMLButtonElement>('[data-appearance-close]')?.focus({ preventScroll: true });
  });
  root.querySelector('[data-appearance-close]')?.addEventListener('click', () => closePanel(root, true));
  root.querySelectorAll<HTMLButtonElement>('[data-appearance-primary-preset]').forEach((button) => {
    button.addEventListener('click', () =>
      updatePreferences(root, { ...preferences, primaryColor: button.dataset.appearancePrimaryPreset })
    );
  });
  const picker = root.querySelector<HTMLInputElement>('[data-appearance-primary]');
  picker?.addEventListener('input', () =>
    updatePreferences(root, { ...preferences, primaryColor: picker.value }, false, false)
  );
  picker?.addEventListener('change', () => updatePreferences(root, { ...preferences, primaryColor: picker.value }));
  root.querySelectorAll<HTMLButtonElement>('[data-appearance-secondary]').forEach((button) => {
    button.addEventListener('click', () =>
      updatePreferences(root, { ...preferences, secondaryColor: button.dataset.appearanceSecondary })
    );
  });
  root.querySelector('[data-appearance-secondary-default]')?.addEventListener('click', () => {
    const next = { ...preferences };
    delete next.secondaryColor;
    updatePreferences(root, next);
  });
  root.querySelectorAll<HTMLButtonElement>('[data-appearance-layout]').forEach((button) => {
    button.addEventListener('click', () =>
      updatePreferences(root, { ...preferences, layout: button.dataset.appearanceLayout as 'wide' | 'boxed' })
    );
  });
  root.querySelector('[data-appearance-reset]')?.addEventListener('click', () => updatePreferences(root, {}, true));
  root.querySelectorAll<HTMLButtonElement>('[data-appearance-pattern]').forEach((button) => {
    button.addEventListener('click', () => {
      const pattern = button.dataset.appearancePattern as VisitorAppearance['backgroundPattern'];
      updatePreferences(root, {
        ...preferences,
        backgroundPattern: pattern,
        ...(pattern && pattern !== 'none' ? { layout: 'boxed' } : {}),
      });
    });
  });
  root.querySelector('[data-appearance-pattern-default]')?.addEventListener('click', () => {
    const next = { ...preferences };
    delete next.backgroundPattern;
    updatePreferences(root, next);
  });
  root.addEventListener('focusout', (event) => {
    if (event.relatedTarget instanceof Node && !root.contains(event.relatedTarget)) closePanel(root);
  });
}

document.addEventListener('pointerdown', (event) => {
  const root = document.querySelector<HTMLElement>('[data-appearance-switcher]');
  if (root && event.target instanceof Node && !root.contains(event.target)) closePanel(root);
});
document.addEventListener('keydown', (event) => {
  const root = document.querySelector<HTMLElement>('[data-appearance-switcher]');
  const panel = root?.querySelector<HTMLElement>('[data-appearance-panel]');
  if (root && panel && !panel.hidden && event.key === 'Escape') {
    event.preventDefault();
    closePanel(root, true);
  }
});
document.addEventListener('astro:before-swap', (event) => {
  // Capture each incoming page's published baseline before applying visitor overrides.
  baseline = captureBaseline(event.newDocument);
  applyAppearance(event.newDocument, baseline);
});
document.addEventListener('astro:page-load', initializeSwitcher);
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  preferences = decodeStored(event.newValue);
  applyAppearance(document, baseline);
  const root = document.querySelector<HTMLElement>('[data-appearance-switcher]');
  if (root) syncControls(root);
});
initializeSwitcher();
