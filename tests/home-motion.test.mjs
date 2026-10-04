import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { transform } from '@astrojs/compiler';
import ts from 'typescript';

const source = await readFile(new URL('../src/components/flexina/HomeMotion.astro', import.meta.url), 'utf8');
const compiled = await transform(source);
assert.equal(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 1).length, 0);
const script = ts.transpileModule(compiled.scripts[0].code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const heroSource = await readFile(new URL('../src/components/flexina/HeroSlider.astro', import.meta.url), 'utf8');
const heroCompiled = await transform(heroSource);
assert.equal(heroCompiled.diagnostics.filter((diagnostic) => diagnostic.severity === 1).length, 0);
const heroScript = ts.transpileModule(heroCompiled.scripts[0].code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function createRuntime({ reduced = false, observerAvailable = true, animationAvailable = true } = {}) {
  class MotionPreference extends EventTarget {
    matches = reduced;

    change(matches) {
      this.matches = matches;
      this.dispatchEvent(new Event('change'));
    }
  }

  class Element extends EventTarget {
    dataset = {};
    style = {};
    hidden = false;
    isConnected = true;
    animations = [];
    targets = [];
    rejectsAnimation = false;

    querySelectorAll() {
      return this.targets;
    }

    contains(element) {
      return element === this || this.targets.includes(element);
    }

    animate() {
      if (this.rejectsAnimation) throw new Error('Unsupported animation');
      let rejectFinished;
      const animation = {
        cancelled: false,
        finished: new Promise((_resolve, reject) => {
          rejectFinished = reject;
        }),
        cancel() {
          this.cancelled = true;
          rejectFinished(new Error('Animation cancelled'));
        },
      };
      this.animations.push(animation);
      return animation;
    }
  }

  if (!animationAvailable) delete Element.prototype.animate;
  const observers = [];
  class Observer {
    observed = new Set();
    disconnects = 0;

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
      this.disconnects++;
      this.observed.clear();
    }

    notify(target, isIntersecting = true) {
      this.callback([{ target, isIntersecting }]);
    }
  }

  const preference = new MotionPreference();
  const document = new EventTarget();
  document.activeElement = null;
  document.querySelectorAll = () => document.roots;
  function replaceHome() {
    document.roots?.forEach((oldRoot) => {
      oldRoot.isConnected = false;
    });
    const root = new Element();
    root.targets = Array.from({ length: 3 }, () => new Element());
    document.roots = [root];
    return root;
  }
  const root = replaceHome();
  const window = { matchMedia: () => preference };
  if (observerAvailable) window.IntersectionObserver = Observer;
  vm.runInNewContext(script, {
    document,
    window,
    HTMLElement: Element,
    IntersectionObserver: Observer,
    AbortController,
  });
  return { document, root, preference, observers, replaceHome };
}

function assertVisibleFallback(targets) {
  targets.forEach((target) => {
    assert.equal(target.hidden, false);
    assert.deepEqual(target.style, {});
  });
}

function createHeroRuntime() {
  class Element extends EventTarget {
    dataset = {};
    selectors = new Map();
    parts = [];
    animations = [];
    isConnected = true;
    classList = { toggle() {} };

    querySelector(selector) {
      return this.selectors.get(selector) ?? null;
    }

    querySelectorAll() {
      return this.parts;
    }

    setAttribute() {}

    contains(element) {
      return element === this || this.parts.some((part) => part.contains(element));
    }

    animate() {
      const animation = {
        cancelled: false,
        cancel() {
          this.cancelled = true;
        },
      };
      this.animations.push(animation);
      return animation;
    }
  }

  const root = new Element();
  const panels = Array.from({ length: 2 }, () => new Element());
  panels.forEach((panel) => {
    panel.parts = Array.from({ length: 4 }, () => new Element());
  });
  root.parts = panels;
  for (const selector of ['controls', 'previous', 'next', 'pause', 'announcement', 'position']) {
    root.selectors.set(`[data-fx-${selector}]`, new Element());
  }
  const preference = new EventTarget();
  preference.matches = false;
  const document = new EventTarget();
  document.activeElement = null;
  document.hidden = false;
  document.querySelectorAll = () => [root];
  const timers = new Set();
  const window = {
    matchMedia: () => preference,
    setTimeout() {
      const timer = timers.size + 1;
      timers.add(timer);
      return timer;
    },
    clearTimeout(timer) {
      timers.delete(timer);
    },
  };
  vm.runInNewContext(heroScript, { document, window, HTMLElement: Element, AbortController, queueMicrotask });
  return { root, panels, document, timers };
}

test('entry reveals run once and repeated Astro page-load does not duplicate observers', () => {
  const runtime = createRuntime();
  const { root, observers, document } = runtime;
  const target = root.targets[0];
  assert.equal(root.dataset.fxMotion, 'enabled');
  assert.equal(observers.length, 1);
  assert.equal(observers[0].observed.size, 3);
  assertVisibleFallback(root.targets);
  observers[0].notify(target, false);
  assert.equal(target.animations.length, 0);
  observers[0].notify(target);
  assert.equal(target.animations.length, 1);
  assert.equal(observers[0].observed.has(target), false);
  observers[0].notify(target);
  document.dispatchEvent(new Event('astro:page-load'));
  assert.equal(target.animations.length, 1);
  assert.equal(observers.length, 1);
});

test('reduced motion keeps content visible, cancels active animation and observes only unseen content on reenable', async () => {
  const { root, observers, preference } = createRuntime({ reduced: true });
  const target = root.targets[0];
  assert.equal(root.dataset.fxMotion, 'reduced');
  assert.equal(observers[0].observed.size, 0);
  assertVisibleFallback(root.targets);
  preference.change(false);
  assert.equal(observers[0].observed.size, 3);
  observers[0].notify(target);
  const animation = target.animations[0];
  preference.change(true);
  await Promise.resolve();
  assert.equal(animation.cancelled, true);
  assert.equal(observers[0].observed.size, 0);
  assertVisibleFallback(root.targets);
  preference.change(false);
  assert.equal(observers[0].observed.size, 2);
  assert.equal(observers[0].observed.has(target), false);
});

test('navigation cancels animations, disconnects observers and removes preference listener before initializing a new page', async () => {
  const { root, observers, document, preference, replaceHome } = createRuntime();
  observers[0].notify(root.targets[0]);
  const animation = root.targets[0].animations[0];
  document.dispatchEvent(new Event('astro:before-swap'));
  await Promise.resolve();
  assert.equal(animation.cancelled, true);
  assert.equal(observers[0].observed.size, 0);
  assert.equal(root.dataset.fxMotion, undefined);
  preference.change(true);
  assert.equal(root.dataset.fxMotion, undefined);
  const nextRoot = replaceHome();
  document.dispatchEvent(new Event('astro:page-load'));
  assert.equal(observers.length, 2);
  assert.equal(nextRoot.dataset.fxMotion, 'reduced');
  assert.equal(observers[1].observed.size, 0);
});

test('keyboard-focused targets remain visible without being faded away', () => {
  const { root, observers, document } = createRuntime();
  document.activeElement = root.targets[0];
  observers[0].notify(root.targets[0]);
  assert.equal(root.targets[0].animations.length, 0);
  assert.equal(observers[0].observed.has(root.targets[0]), false);
  assertVisibleFallback(root.targets);
});

test('focus entering after a reveal has started immediately cancels that target without stopping other reveals', async () => {
  const { root, observers, document } = createRuntime();
  const target = root.targets[0];
  const otherTarget = root.targets[1];
  const focusedLink = new target.constructor();
  target.targets.push(focusedLink);
  observers[0].notify(target);
  observers[0].notify(otherTarget);
  const animation = target.animations[0];
  const otherAnimation = otherTarget.animations[0];
  assert.equal(animation.cancelled, false);
  document.activeElement = focusedLink;
  root.dispatchEvent(new Event('focusin'));
  assert.equal(animation.cancelled, true);
  assert.equal(otherAnimation.cancelled, false);
  assertVisibleFallback([target]);
  await Promise.resolve();
});

test('focus entering the hero during its stagger cancels every active segment and pauses rotation', () => {
  const { root, panels, document, timers } = createHeroRuntime();
  const animations = panels[0].parts.map((part) => part.animations[0]);
  assert.equal(
    animations.every((animation) => animation && !animation.cancelled),
    true
  );
  assert.equal(timers.size, 1);
  document.activeElement = panels[0].parts[3];
  root.dispatchEvent(new Event('focusin'));
  assert.equal(
    animations.every((animation) => animation.cancelled),
    true
  );
  assert.equal(timers.size, 0);
});

test('missing browser APIs leave content visible without registering reveal observers', () => {
  for (const options of [{ observerAvailable: false }, { animationAvailable: false }]) {
    const { root, observers } = createRuntime(options);
    assert.equal(observers.length, 0);
    assert.equal(root.dataset.fxMotion, undefined);
    assertVisibleFallback(root.targets);
    assert.equal(
      root.targets.every((target) => target.animations.length === 0),
      true
    );
  }
});

test('one rejected browser animation keeps that target visible and does not block other reveals', () => {
  const { root, observers } = createRuntime();
  root.targets[0].rejectsAnimation = true;
  assert.doesNotThrow(() => observers[0].notify(root.targets[0]));
  assertVisibleFallback([root.targets[0]]);
  observers[0].notify(root.targets[1]);
  assert.equal(root.targets[1].animations.length, 1);
});
