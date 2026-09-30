/**
 * The web component, end to end: real React DOM, real react-native-web
 * Image, in jsdom. The browser's image loading is replaced by a fake whose
 * failures the test controls, so the retry path runs for real.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { after, before, beforeEach, describe, it } from 'node:test';

import type * as Index from '../index';

// Resolve modules the way a web bundler does: `react-native` is
// react-native-web, and `./x` prefers `./x.web` when there is one.
type Resolver = (request: string, parent: unknown, ...rest: unknown[]) => string;
const M = Module as unknown as { _resolveFilename: Resolver };
const originalResolve = M._resolveFilename;
M._resolveFilename = function resolve(this: unknown, request, parent, ...rest) {
  const req = request === 'react-native' ? 'react-native-web' : request;
  if (req.startsWith('.')) {
    try {
      return originalResolve.call(this, `${req}.web`, parent, ...rest);
    } catch {
      // No web variant: fall through to the plain file.
    }
  }
  return originalResolve.call(this, req, parent, ...rest);
};

/** How many more times each URL fails before it loads. */
const failuresLeft = new Map<string, number>();
/** Every URL the browser was asked to load, in order. */
const requested: string[] = [];

class FakeImage {
  onload: ((e: unknown) => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 640;
  naturalHeight = 480;
  set src(value: string) {
    requested.push(value);
    const left = failuresLeft.get(value) ?? 0;
    if (left > 0) failuresLeft.set(value, left - 1);
    setTimeout(() => (left > 0 ? this.onerror?.() : this.onload?.({ target: this })), 1);
  }
  decode() {
    return Promise.resolve();
  }
}

let win: any;
let React: typeof import('react');
let createRoot: (el: Element) => { render(node: unknown): void; unmount(): void };
let lib: typeof Index;
const errors: string[] = [];

before(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'https://app.example/',
  });
  win = dom.window;
  win.Image = FakeImage;
  // Expose the DOM as browser globals, as a page's scripts would see it.
  // Node's own globals (timers, URL, fetch, ...) are left alone.
  const g = globalThis as Record<string, unknown>;
  g.window = win;
  for (const key of Object.getOwnPropertyNames(win)) {
    if (key in g) continue;
    let value: unknown;
    try {
      value = win[key];
    } catch {
      continue; // a getter jsdom doesn't support in this setup
    }
    g[key] = typeof value === 'function' && !/^[A-Z]/.test(key) ? value.bind(win) : value;
  }
  Object.defineProperty(g, 'navigator', { value: win.navigator, configurable: true, writable: true });
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
    originalError(...args);
  };
  React = require('react');
  createRoot = require('react-dom/client').createRoot;
  lib = require('../index');
  lib.configurePerformantImage({ staggerMs: 5 });
});

after(() => {
  M._resolveFilename = originalResolve;
});

beforeEach(() => {
  failuresLeft.clear();
  requested.length = 0;
  errors.length = 0;
});

async function waitFor(check: () => boolean, ms = 2000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 5));
  }
}

function mount(props: Record<string, unknown>) {
  const el = win.document.createElement('div');
  win.document.body.appendChild(el);
  const root = createRoot(el);
  root.render(React.createElement(lib.Image as any, { style: { width: 100, height: 100 }, ...props }));
  return { el, root };
}

describe('Image on web', () => {
  it('retries a failed load and reports it with React Native event shapes', async () => {
    const uri = 'https://cdn.example/a.jpg';
    failuresLeft.set(uri, 1);
    const errorsSeen: unknown[] = [];
    const loads: unknown[] = [];
    const { root } = mount({
      source: { uri },
      retryDelayMs: 10,
      onError: (e: any) => errorsSeen.push(e.nativeEvent.error),
      onLoad: (e: any) => loads.push(e.nativeEvent),
    });
    await waitFor(() => loads.length === 1);
    assert.equal(errorsSeen.length, 1);
    assert.deepEqual(loads[0], { source: { width: 640, height: 480, uri } });
    assert.deepEqual(requested, [uri, uri]);
    root.unmount();
  });

  it('accepts `src` as React Native does', async () => {
    const uri = 'https://cdn.example/src.jpg';
    let loaded = false;
    const { root } = mount({ src: uri, onLoad: () => (loaded = true) });
    await waitFor(() => loaded);
    assert.deepEqual(requested, [uri]);
    root.unmount();
  });

  it('waits out an outage and retries when the browser is back online', async () => {
    const uri = 'https://cdn.example/b.jpg';
    failuresLeft.set(uri, 99);
    let loaded = false;
    const { root } = mount({ source: { uri }, retryDelayMs: 10, maxRetries: 1, onLoad: () => (loaded = true) });
    // First load plus its one retry, then it waits.
    await waitFor(() => requested.length === 2);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(requested.length, 2);

    failuresLeft.set(uri, 0);
    win.dispatchEvent(new win.Event('offline'));
    win.dispatchEvent(new win.Event('online'));
    await waitFor(() => loaded);
    assert.equal(requested.length, 3);
    root.unmount();
  });

  it('stops retrying once the image unmounts', async () => {
    const uri = 'https://cdn.example/c.jpg';
    failuresLeft.set(uri, 99);
    const { root } = mount({ source: { uri }, retryDelayMs: 20 });
    await waitFor(() => requested.length === 1);
    root.unmount();
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(requested.length, 1);
  });

  it('does not retry a non-remote source', async () => {
    const uri = 'data:image/png;base64,AAAA';
    failuresLeft.set(uri, 99);
    let failed = false;
    const { root } = mount({ source: { uri }, retryDelayMs: 10, onError: () => (failed = true) });
    await waitFor(() => failed);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(requested.length, 1);
    root.unmount();
  });

  it('keeps the extras out of the DOM', async () => {
    const uri = 'https://cdn.example/d.jpg';
    const { el, root } = mount({
      source: { uri },
      placeholder: { blurhash: 'x' },
      transition: 200,
      retryDelayMs: 50,
      maxRetries: 1,
      testID: 'product-image',
    });
    await waitFor(() => requested.length === 1);
    const html = el.innerHTML.toLowerCase();
    for (const attr of ['placeholder', 'transition', 'retrydelay', 'maxretries', 'blurhash']) {
      assert.ok(!html.includes(attr), `${attr} leaked into the DOM`);
    }
    assert.ok(el.innerHTML.includes('data-testid="product-image"'));
    assert.deepEqual(errors.filter((e) => /Unknown|not a valid|React does not recognize/.test(e)), []);
    root.unmount();
  });

  it('ignores source headers on web and loads the plain URL', async () => {
    const uri = 'https://private.example/e.jpg';
    let loaded = false;
    const { el, root } = mount({
      source: { uri, headers: { Authorization: 'Bearer t' } },
      onLoad: () => (loaded = true),
    });
    await waitFor(() => loaded);
    assert.deepEqual(requested, [uri]);
    assert.ok(!el.innerHTML.includes('Bearer'));
    root.unmount();
  });

  it('exposes the Image statics, cache clearing included', async () => {
    const { Image } = lib;
    assert.equal(typeof Image.getSize, 'function');
    assert.equal(typeof Image.prefetch, 'function');
    await Image.clearMemoryCache();
    await Image.clearDiskCache();
  });
});
