import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { browserConnectivity } from '../browserConnectivity';
import type { Online } from '../retryScheduler';

function fakeWindow(onLine: boolean) {
  const target = new EventTarget();
  return Object.assign(target, { navigator: { onLine } });
}

describe('browserConnectivity', () => {
  it('reports the current state as soon as it subscribes', () => {
    const seen: Online[] = [];
    browserConnectivity(fakeWindow(false)).subscribe((o) => seen.push(o));
    assert.deepEqual(seen, [false]);
  });

  it('follows the browser online / offline events', () => {
    const win = fakeWindow(true);
    const seen: Online[] = [];
    browserConnectivity(win).subscribe((o) => seen.push(o));
    win.dispatchEvent(new Event('offline'));
    win.dispatchEvent(new Event('online'));
    assert.deepEqual(seen, [true, false, true]);
  });

  it('stops listening on unsubscribe', () => {
    const win = fakeWindow(true);
    const seen: Online[] = [];
    const off = browserConnectivity(win).subscribe((o) => seen.push(o));
    off();
    win.dispatchEvent(new Event('offline'));
    assert.deepEqual(seen, [true]);
  });

  it('is a no-op without a window (server rendering)', () => {
    const seen: Online[] = [];
    const off = browserConnectivity(undefined).subscribe((o) => seen.push(o));
    off();
    assert.deepEqual(seen, []);
  });
});
