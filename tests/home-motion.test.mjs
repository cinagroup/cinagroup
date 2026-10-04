import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { transform } from '@astrojs/compiler';
import ts from 'typescript';

const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
const helperScript = transpile(
  await readFile(new URL('../src/components/flexina/motion-preference.ts', import.meta.url), 'utf8')
);
async function clientScript(name) {
  const result = await transform(
    await readFile(new URL(`../src/components/flexina/${name}.astro`, import.meta.url), 'utf8')
  );
  assert.equal(result.diagnostics.filter((diagnostic) => diagnostic.severity === 1).length, 0);
  return transpile(result.scripts[0].code);
}
const [siteScript, heroScript, preferenceScript] = await Promise.all(
  ['SiteMotion', 'HeroSlider', 'MotionPreferences'].map(clientScript)
);

function createRuntime({
  reduced = false,
  config = {},
  observerAvailable = true,
  animationAvailable = true,
  storageAvailable = true,
  legacy = false,
} = {}) {
  const document = new EventTarget();
  class Element extends EventTarget {
    constructor(tag = 'DIV') {
      super();
      this.tagName = tag;
      this.dataset = {};
      this.style = {};
      this.hidden = false;
      this.isConnected = true;
      this.children = [];
      this.childNodes = [];
      this.selectors = new Map();
      this.animations = [];
      this.attributes = new Map();
      this.classes = new Set();
      this.classList = { toggle: (name, active) => (active ? this.classes.add(name) : this.classes.delete(name)) };
    }
    appendChild(child) {
      child.parentElement = this;
      this.childNodes.push(child);
      if (child instanceof Element) this.children.push(child);
      return child;
    }
    replaceChild(child, old) {
      const index = this.childNodes.indexOf(old);
      this.childNodes[index] = child;
      child.parentElement = this;
      if (child instanceof Element) this.children.push(child);
      old.parentElement = undefined;
    }
    get textContent() {
      return this.childNodes.map((node) => node.textContent ?? '').join('');
    }
    set textContent(value) {
      this.childNodes = [{ nodeType: 3, textContent: value }];
    }
    querySelectorAll(selector) {
      return this.selectors.get(selector) ?? [];
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    }
    hasAttribute(name) {
      const key = name.replace(/^data-/, '').replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      return this.attributes.has(name) || (name.startsWith('data-') && Object.hasOwn(this.dataset, key));
    }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }
    contains(element) {
      return this === element || this.children.some((child) => child.contains(element));
    }
    closest(selector) {
      if (selector === 'main' && this.tagName === 'MAIN') return this;
      return this.parentElement?.closest(selector) ?? null;
    }
    matches() {
      return false;
    }
    focus() {
      document.activeElement = this;
    }
    animate(keyframes, options) {
      if (this.rejectsAnimation) throw new Error('Unsupported animation');
      let resolveFinished;
      let rejectFinished;
      let finished;
      const animation = {
        keyframes,
        options,
        cancelled: false,
        get finished() {
          finished ??= new Promise((resolve, reject) => {
            resolveFinished = resolve;
            rejectFinished = reject;
          });
          return finished;
        },
        cancel() {
          this.cancelled = true;
          rejectFinished?.(new Error('Animation cancelled'));
        },
        finish() {
          resolveFinished?.();
        },
      };
      this.animations.push(animation);
      return animation;
    }
  }
  if (!animationAvailable) delete Element.prototype.animate;
  const html = new Element('HTML');
  Object.assign(html.dataset, config);
  const body = new Element('BODY');
  html.appendChild(body);
  if (legacy) body.setAttribute('data-legacy-article-shell', '');
  document.documentElement = html;
  document.body = body;
  document.activeElement = null;
  document.hidden = false;
  document.createElement = (tag) => new Element(tag.toUpperCase());
  const preference = new EventTarget();
  preference.matches = reduced;
  preference.change = (matches) => {
    preference.matches = matches;
    preference.dispatchEvent(new Event('change'));
  };
  const window = new EventTarget();
  const storage = new Map();
  window.localStorage = {
    getItem: (key) => {
      if (!storageAvailable) throw new Error('Storage unavailable');
      return storage.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (!storageAvailable) throw new Error('Storage unavailable');
      storage.set(key, value);
    },
  };
  window.matchMedia = () => preference;
  const timers = new Map();
  let timerId = 0;
  window.setTimeout = (callback, delay) => {
    timers.set(++timerId, { callback, delay });
    return timerId;
  };
  window.clearTimeout = (timer) => timers.delete(timer);
  const observers = [];
  class Observer {
    observed = new Set();
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe(target) {
      this.observed.add(target);
    }
    unobserve(target) {
      this.observed.delete(target);
    }
    disconnect() {
      this.observed.clear();
    }
    notify(target, isIntersecting = true) {
      this.callback([{ target, isIntersecting }]);
    }
  }
  if (observerAvailable) window.IntersectionObserver = Observer;
  const reveals = [new Element(), new Element(), new Element()];
  reveals.forEach((target) => body.appendChild(target));
  const waves = [];
  const ambient = [];
  const heroes = [];
  const hoverTargets = [];
  const preferenceRoots = [];
  document.querySelectorAll = (selector) => {
    if (selector.includes('[data-fx-reveal]')) return reveals;
    if (selector === 'svg[data-fx-wave]') return waves;
    if (selector === '[data-fx-ambient]') return ambient;
    if (selector === '[data-fx-hero]') return heroes;
    if (selector === '[data-fx-motion-preferences]') return preferenceRoots;
    if (selector.includes('a.btn')) return hoverTargets;
    return [];
  };
  const globals = {
    document,
    window,
    HTMLElement: Element,
    IntersectionObserver: Observer,
    AbortController,
    CustomEvent,
    Node: { TEXT_NODE: 3 },
    queueMicrotask,
  };
  const helperExports = {};
  vm.runInNewContext(helperScript, { ...globals, exports: helperExports });
  const run = (script) => vm.runInNewContext(script, { ...globals, exports: {}, require: () => helperExports });
  const pointer = (type) => {
    const event = new Event(type);
    event.pointerType = 'mouse';
    return event;
  };
  function wave() {
    const svg = new Element('SVG');
    svg.pauses = 0;
    svg.resumes = 0;
    svg.resets = 0;
    svg.pauseAnimations = () => svg.pauses++;
    svg.unpauseAnimations = () => svg.resumes++;
    svg.setCurrentTime = () => svg.resets++;
    const animation = {
      begins: 0,
      ends: 0,
      beginElement() {
        this.begins++;
      },
      endElement() {
        this.ends++;
      },
    };
    svg.selectors.set('[data-fx-wave-animation]', [animation]);
    waves.push(svg);
    body.appendChild(svg);
    return { svg, animation };
  }
  function hero(count = 2) {
    const root = new Element();
    const panels = Array.from({ length: count }, () => new Element());
    panels.forEach((panel) => {
      const parts = Array.from({ length: 4 }, () => new Element());
      parts[1].dataset.fxTitle = '';
      parts.forEach((part) => panel.appendChild(part));
      panel.selectors.set('[data-fx-hero-part]', parts);
      root.appendChild(panel);
    });
    root.selectors.set('[data-fx-slide]', panels);
    const controls = {};
    if (count > 1) {
      for (const name of ['controls', 'previous', 'next', 'pause', 'announcement', 'position']) {
        controls[name] = new Element();
        root.selectors.set(`[data-fx-${name}]`, [controls[name]]);
        root.appendChild(controls[name]);
      }
    }
    heroes.push(root);
    body.appendChild(root);
    return { root, panels, controls };
  }
  return {
    document,
    window,
    html,
    body,
    Element,
    preference,
    observers,
    reveals,
    waves,
    ambient,
    heroes,
    hoverTargets,
    preferenceRoots,
    timers,
    storage,
    helper: helperExports,
    run,
    pointer,
    wave,
    hero,
  };
}

const visible = (targets) =>
  targets.forEach((target) => {
    assert.equal(target.hidden, false);
    assert.deepEqual(target.style, {});
  });

test('motion settings use safe defaults and bounded configuration values', () => {
  const runtime = createRuntime();
  assert.equal(runtime.helper.readMotionState().revealDurationMs, 1000);
  Object.assign(runtime.html.dataset, {
    fxMotionStyle: 'invalid',
    fxRevealDuration: '9999',
    fxHeroInterval: '-10',
    fxHeroAutoplay: 'false',
    fxStickyHeader: 'false',
  });
  const state = runtime.helper.readMotionState();
  assert.equal(state.style, 'standard');
  assert.equal(state.revealDurationMs, 1800);
  assert.equal(state.heroIntervalMs, 8000);
  assert.equal(state.heroAutoplay, false);
  assert.equal(state.stickyHeader, false);
});

test('auto respects reduced motion; explicit visitor on works and administrator off always wins', () => {
  const runtime = createRuntime({ reduced: true });
  assert.equal(runtime.helper.readMotionState().enabled, false);
  runtime.helper.setVisitorMotionPreference('on');
  assert.equal(runtime.helper.readMotionState().enabled, true);
  assert.equal(runtime.html.dataset.fxMotionEnabled, 'true');
  assert.equal(runtime.storage.get(runtime.helper.MOTION_STORAGE_KEY), 'on');
  runtime.html.dataset.fxMotionStyle = 'off';
  runtime.helper.publishMotionState();
  assert.equal(runtime.html.dataset.fxMotionEnabled, 'false');
  runtime.html.dataset.fxMotionStyle = 'standard';
  runtime.helper.setVisitorMotionPreference('off');
  runtime.preference.change(false);
  assert.equal(runtime.helper.readMotionState().enabled, false);
});

test('visitor preference works when local storage is unavailable', () => {
  const runtime = createRuntime({ reduced: true, storageAvailable: false });
  assert.doesNotThrow(() => runtime.helper.setVisitorMotionPreference('on'));
  assert.equal(runtime.helper.readMotionState().enabled, true);
});

test('shared reveals use configured duration, run once, and repeated page-load creates no extra observer', () => {
  const runtime = createRuntime({ config: { fxRevealDuration: '1400' } });
  runtime.run(siteScript);
  const target = runtime.reveals[0];
  assert.equal(runtime.observers.length, 1);
  runtime.observers[0].notify(target, false);
  assert.equal(target.animations.length, 0);
  runtime.observers[0].notify(target);
  assert.equal(target.animations[0].options.duration, 1400);
  assert.equal(target.animations[0].keyframes[0].translate, '0 32px');
  assert.equal(runtime.observers[0].observed.has(target), false);
  runtime.observers[0].notify(target);
  runtime.document.dispatchEvent(new Event('astro:page-load'));
  assert.equal(target.animations.length, 1);
  assert.equal(runtime.observers.length, 1);
  visible(runtime.reveals);
});

test('subtle reveals retain the smaller motion and shorter timing', () => {
  const runtime = createRuntime({ config: { fxMotionStyle: 'subtle' } });
  runtime.run(siteScript);
  runtime.observers[0].notify(runtime.reveals[0]);
  assert.equal(runtime.reveals[0].animations[0].options.duration, 520);
  assert.equal(runtime.reveals[0].animations[0].keyframes[0].translate, '0 12px');
});

test('late keyboard focus cancels only its reveal and disabled motion cancels all others', async () => {
  const runtime = createRuntime();
  runtime.run(siteScript);
  const [target, other] = runtime.reveals;
  const link = new runtime.Element('A');
  target.appendChild(link);
  runtime.observers[0].notify(target);
  runtime.observers[0].notify(other);
  runtime.document.activeElement = link;
  runtime.document.dispatchEvent(new Event('focusin'));
  assert.equal(target.animations[0].cancelled, true);
  assert.equal(other.animations[0].cancelled, false);
  runtime.helper.setVisitorMotionPreference('off');
  assert.equal(other.animations[0].cancelled, true);
  assert.equal(runtime.observers[0].observed.has(runtime.reveals[2]), false);
  runtime.helper.setVisitorMotionPreference('on');
  assert.equal(runtime.observers[0].observed.has(runtime.reveals[2]), true);
  assert.equal(runtime.observers[0].observed.has(target), false);
  await Promise.resolve();
});

test('wave begins only in view, pauses offscreen and hidden, resets on off, and ambient follows the same state', () => {
  const runtime = createRuntime();
  const { svg, animation } = runtime.wave();
  const decoration = new runtime.Element();
  runtime.ambient.push(decoration);
  runtime.run(siteScript);
  assert.equal(animation.begins, 0);
  runtime.observers[0].notify(svg);
  runtime.observers[0].notify(decoration);
  assert.equal(animation.begins, 1);
  assert.equal(svg.dataset.fxWaveActive, 'true');
  assert.equal(decoration.dataset.fxAmbientActive, 'true');
  runtime.observers[0].notify(svg, false);
  assert.equal(svg.dataset.fxWaveActive, 'false');
  assert.equal(animation.ends, 0);
  runtime.observers[0].notify(svg);
  assert.equal(animation.begins, 1);
  runtime.document.hidden = true;
  runtime.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(svg.dataset.fxWaveActive, 'false');
  assert.equal(decoration.dataset.fxAmbientActive, 'false');
  runtime.document.hidden = false;
  runtime.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(svg.dataset.fxWaveActive, 'true');
  runtime.helper.setVisitorMotionPreference('off');
  assert.equal(animation.ends, 1);
  assert.equal(svg.dataset.fxWaveActive, 'false');
  assert.equal(decoration.dataset.fxAmbientActive, 'false');
  runtime.helper.setVisitorMotionPreference('on');
  assert.equal(animation.begins, 2);
});

test('missing animation or observer APIs and rejected animation keep normal content visible', () => {
  for (const options of [{ observerAvailable: false }, { animationAvailable: false }]) {
    const runtime = createRuntime(options);
    runtime.run(siteScript);
    runtime.observers[0]?.notify(runtime.reveals[0]);
    assert.equal(runtime.reveals[0].animations.length, 0);
    visible(runtime.reveals);
  }
  const runtime = createRuntime();
  runtime.run(siteScript);
  runtime.reveals[0].rejectsAnimation = true;
  assert.doesNotThrow(() => runtime.observers[0].notify(runtime.reveals[0]));
  runtime.observers[0].notify(runtime.reveals[1]);
  assert.equal(runtime.reveals[1].animations.length, 1);
});

test('SMIL feature fallback remains static without breaking other reveals', () => {
  const runtime = createRuntime();
  const { svg, animation } = runtime.wave();
  animation.beginElement = undefined;
  runtime.run(siteScript);
  assert.doesNotThrow(() => runtime.observers[0].notify(svg));
  assert.notEqual(svg.dataset.fxWaveActive, 'true');
  runtime.observers[0].notify(runtime.reveals[0]);
  assert.equal(runtime.reveals[0].animations.length, 1);
});

test('navigation tears down animations, wave and preference listeners before a new body initializes', async () => {
  const runtime = createRuntime();
  const { svg, animation } = runtime.wave();
  runtime.run(siteScript);
  runtime.observers[0].notify(runtime.reveals[0]);
  runtime.observers[0].notify(svg);
  runtime.document.dispatchEvent(new Event('astro:before-swap'));
  assert.equal(runtime.reveals[0].animations[0].cancelled, true);
  assert.equal(runtime.observers[0].observed.size, 0);
  assert.equal(animation.ends, 1);
  assert.equal(svg.dataset.fxWaveActive, 'false');
  runtime.preference.change(true);
  assert.equal(runtime.body.dataset.fxMotion, undefined);
  runtime.document.body = new runtime.Element('BODY');
  runtime.document.dispatchEvent(new Event('astro:page-load'));
  assert.equal(runtime.observers.length, 2);
  assert.equal(runtime.document.body.dataset.fxMotion, 'off');
  await Promise.resolve();
});

test('historical article main is excluded while shared footer still reveals', () => {
  const runtime = createRuntime({ legacy: true });
  const main = new runtime.Element('MAIN');
  runtime.body.appendChild(main);
  main.appendChild(runtime.reveals[0]);
  runtime.run(siteScript);
  assert.equal(runtime.observers[0].observed.has(runtime.reveals[0]), false);
  assert.equal(runtime.observers[0].observed.has(runtime.reveals[1]), true);
});

test('hover animates existing label without changing text order or the neighboring icon', () => {
  const runtime = createRuntime();
  const button = new runtime.Element('A');
  const text = { nodeType: 3, textContent: 'Contact ' };
  const icon = new runtime.Element('SVG');
  icon.textContent = '';
  button.appendChild(text);
  button.appendChild(icon);
  runtime.hoverTargets.push(button);
  runtime.run(siteScript);
  const label = button.childNodes[0];
  button.selectors.set('[data-fx-button-label]', [label]);
  assert.equal(button.textContent, 'Contact ');
  assert.equal(button.childNodes[1], icon);
  button.dispatchEvent(runtime.pointer('pointerenter'));
  assert.equal(label.animations.length, 1);
  runtime.helper.setVisitorMotionPreference('off');
  assert.equal(label.animations[0].cancelled, true);
  button.dispatchEvent(runtime.pointer('pointerenter'));
  assert.equal(label.animations.length, 1);
});

test('single-slide hero still plays grouped title animation without creating rotation controls', () => {
  const runtime = createRuntime();
  const { panels } = runtime.hero(1);
  runtime.run(heroScript);
  assert.equal(
    panels[0].children.every((part) => part.animations.length === 1),
    true
  );
  assert.equal(panels[0].children[1].animations[0].keyframes[0].scale, '0.94');
  assert.equal(runtime.timers.size, 0);
});

test('hero rotation follows configured interval and duration, replays next slide, and supports disabled autoplay', () => {
  const runtime = createRuntime({ config: { fxRevealDuration: '1600', fxHeroInterval: '9000' } });
  const { root, panels, controls } = runtime.hero();
  runtime.run(heroScript);
  assert.equal([...runtime.timers.values()][0].delay, 9000);
  assert.equal(panels[0].children[0].animations[0].options.duration, 1600);
  runtime.document.dispatchEvent(new Event('astro:page-load'));
  assert.equal(panels[0].children[0].animations.length, 1);
  controls.next.dispatchEvent(new Event('click'));
  assert.equal(
    panels[1].children.every((part) => part.animations.length === 1),
    true
  );
  assert.equal(panels[0].inert, true);
  assert.equal(panels[1].inert, false);
  runtime.html.dataset.fxHeroAutoplay = 'false';
  runtime.helper.publishMotionState();
  assert.equal(runtime.timers.size, 0);
  assert.equal(controls.pause.hidden, true);
  assert.equal(root.dataset.fxHeroPaused, 'false');
});

test('hero pauses for hover, focus, manual pause and hidden document, cancels late-focus segments and cleans navigation', () => {
  const runtime = createRuntime();
  const { root, panels, controls } = runtime.hero();
  runtime.run(heroScript);
  root.dispatchEvent(runtime.pointer('pointerenter'));
  assert.equal(runtime.timers.size, 0);
  root.dispatchEvent(runtime.pointer('pointerleave'));
  assert.equal(runtime.timers.size, 1);
  controls.pause.dispatchEvent(new Event('click'));
  assert.equal(runtime.timers.size, 0);
  controls.pause.dispatchEvent(new Event('click'));
  assert.equal(runtime.timers.size, 1);
  runtime.document.activeElement = panels[0].children[3];
  root.dispatchEvent(new Event('focusin'));
  assert.equal(
    panels[0].children.every((part) => part.animations[0].cancelled),
    true
  );
  assert.equal(runtime.timers.size, 0);
  runtime.document.hidden = true;
  runtime.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(root.dataset.fxHeroPaused, 'true');
  runtime.document.dispatchEvent(new Event('astro:before-swap'));
  assert.equal(runtime.timers.size, 0);
});

test('hero remains manually switchable with motion off and explicit on re-enables grouped animation', () => {
  const runtime = createRuntime({ reduced: true });
  const { panels, controls } = runtime.hero();
  runtime.run(heroScript);
  assert.equal(panels[0].children[0].animations.length, 0);
  controls.next.dispatchEvent(new Event('click'));
  assert.equal(panels[1].inert, false);
  assert.equal(runtime.timers.size, 0);
  runtime.helper.setVisitorMotionPreference('on');
  assert.equal(panels[1].children[0].animations.length, 1);
  assert.equal(runtime.timers.size, 1);
});

test('visitor control persists selection, reflects state and disables explicit on for administrator off', () => {
  const runtime = createRuntime({ reduced: true });
  const root = new runtime.Element();
  const buttons = ['auto', 'on', 'off'].map((value) => {
    const button = new runtime.Element('BUTTON');
    button.dataset.fxPreferenceOption = value;
    return button;
  });
  root.selectors.set('[data-fx-preference-option]', buttons);
  const status = new runtime.Element();
  root.dataset.disabledLabel = 'Disabled by site';
  root.selectors.set('[data-fx-motion-site-disabled]', [status]);
  runtime.preferenceRoots.push(root);
  runtime.run(preferenceScript);
  assert.equal(root.hidden, false);
  buttons[1].dispatchEvent(new Event('click'));
  assert.equal(runtime.html.dataset.fxMotionEnabled, 'true');
  assert.equal(buttons[1].attributes.get('aria-pressed'), 'true');
  runtime.html.dataset.fxMotionStyle = 'off';
  runtime.helper.publishMotionState();
  assert.equal(buttons[1].disabled, true);
  assert.equal(status.textContent, 'Disabled by site');
});
