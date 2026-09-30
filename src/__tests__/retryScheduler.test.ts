import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  createRetryScheduler,
  isOnline,
  type Online,
  type RetryScheduler,
} from '../retryScheduler';

/** Manual clock: timers fire only when the test advances time. */
function fakeTimers() {
  let now = 0;
  let seq = 0;
  const pending = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimeout(fn: () => void, ms: number) {
      pending.set(++seq, { at: now + ms, fn });
      return seq;
    },
    clearTimeout(handle: unknown) {
      pending.delete(handle as number);
    },
    advance(ms: number) {
      const until = now + ms;
      for (;;) {
        const next = [...pending.entries()]
          .filter(([, t]) => t.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        pending.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = until;
    },
    get count() {
      return pending.size;
    },
  };
}

function fakeConnectivity() {
  let listener: ((online: Online) => void) | null = null;
  let subscriptions = 0;
  return {
    subscribe(l: (online: Online) => void) {
      listener = l;
      subscriptions += 1;
      return () => {
        listener = null;
      };
    },
    emit(online: Online) {
      listener?.(online);
    },
    get listening() {
      return listener !== null;
    },
    get subscriptions() {
      return subscriptions;
    },
  };
}

describe('retry scheduler', () => {
  let timers: ReturnType<typeof fakeTimers>;
  let net: ReturnType<typeof fakeConnectivity>;
  let scheduler: RetryScheduler;
  const retries: string[] = [];
  const fail = (owner: object, name: string, retryDelayMs = 100, maxRetries = 2) =>
    scheduler.reportFailure(owner, { retryDelayMs, maxRetries, onRetry: () => retries.push(name) });

  beforeEach(() => {
    timers = fakeTimers();
    net = fakeConnectivity();
    // No jitter, so delays are exact.
    scheduler = createRetryScheduler(net, timers, () => 0);
    retries.length = 0;
  });

  it('costs nothing until an image fails', () => {
    assert.equal(net.listening, false);
    assert.equal(scheduler.size, 0);
  });

  it('retries an online failure with exponential backoff, then waits', () => {
    const a = {};
    net.emit(true);
    fail(a, 'a');
    net.emit(true);
    timers.advance(99);
    assert.deepEqual(retries, []);
    timers.advance(1);
    assert.deepEqual(retries, ['a']); // 100ms

    fail(a, 'a');
    timers.advance(199);
    assert.deepEqual(retries, ['a']);
    timers.advance(1);
    assert.deepEqual(retries, ['a', 'a']); // 200ms

    // Out of retries while online: nothing more is scheduled.
    fail(a, 'a');
    timers.advance(60_000);
    assert.deepEqual(retries, ['a', 'a']);
    assert.equal(timers.count, 0);
  });

  it('waits while offline and retries on reconnect, oldest first, staggered', () => {
    const [a, b, c] = [{}, {}, {}];
    fail(a, 'a');
    net.emit(false);
    // `a` failed before we knew we were offline, so it was on the backoff path.
    timers.advance(100);
    fail(a, 'a');
    fail(b, 'b');
    fail(c, 'c');
    timers.advance(60_000);
    assert.deepEqual(retries, ['a']); // nothing retries while offline

    net.emit(true);
    timers.advance(100);
    assert.deepEqual(retries, ['a', 'a']);
    timers.advance(50);
    assert.deepEqual(retries, ['a', 'a', 'b']);
    timers.advance(50);
    assert.deepEqual(retries, ['a', 'a', 'b', 'c']);
  });

  it('gives a fresh retry budget after reconnecting', () => {
    const a = {};
    net.emit(true);
    fail(a, 'a', 100, 1);
    timers.advance(100);
    fail(a, 'a', 100, 1); // budget spent: waits
    timers.advance(60_000);
    assert.deepEqual(retries, ['a']);

    net.emit(false);
    net.emit(true);
    timers.advance(100);
    assert.deepEqual(retries, ['a', 'a']);
    fail(a, 'a', 100, 1); // budget was reset, so this backs off again
    timers.advance(100);
    assert.deepEqual(retries, ['a', 'a', 'a']);
  });

  it('never retries after cancel, and stops listening when nothing is left', () => {
    const a = {};
    fail(a, 'a');
    assert.equal(net.listening, true);
    scheduler.cancel(a);
    timers.advance(60_000);
    assert.deepEqual(retries, []);
    assert.equal(net.listening, false);
    assert.equal(scheduler.size, 0);
  });

  it('forgets an image once it loads', () => {
    const [a, b] = [{}, {}];
    fail(a, 'a');
    fail(b, 'b');
    scheduler.reportSuccess(a);
    assert.equal(scheduler.size, 1);
    assert.equal(net.listening, true);
    scheduler.reportSuccess(b);
    assert.equal(net.listening, false);
  });

  it('shares one subscription across all failed images', () => {
    fail({}, 'a');
    fail({}, 'b');
    fail({}, 'c');
    assert.equal(net.subscriptions, 1);
  });

  it('does not double-schedule an image that fails again before retrying', () => {
    const a = {};
    net.emit(true);
    fail(a, 'a');
    fail(a, 'a');
    assert.equal(timers.count, 1);
  });

  it('caps delays at maxDelayMs', () => {
    scheduler.configure({ maxDelayMs: 500 });
    const a = {};
    net.emit(true);
    fail(a, 'a', 10_000, 3);
    timers.advance(500);
    assert.deepEqual(retries, ['a']);
  });

  it('applies jitter within one base delay', () => {
    const jittery = createRetryScheduler(net, timers, () => 0.999);
    jittery.reportFailure({}, { retryDelayMs: 100, maxRetries: 2, onRetry: () => retries.push('j') });
    timers.advance(199);
    assert.deepEqual(retries, []);
    timers.advance(1);
    assert.deepEqual(retries, ['j']);
  });
});

describe('isOnline', () => {
  it('treats an unknown reachability as online, not offline', () => {
    assert.equal(isOnline({ isConnected: true, isInternetReachable: null }), true);
  });
  it('is offline only on an explicit false', () => {
    assert.equal(isOnline({ isConnected: false, isInternetReachable: null }), false);
    assert.equal(isOnline({ isConnected: true, isInternetReachable: false }), false);
  });
  it('is unknown before NetInfo has an answer', () => {
    assert.equal(isOnline({ isConnected: null, isInternetReachable: null }), undefined);
  });
});
