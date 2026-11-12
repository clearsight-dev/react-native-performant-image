// createPrefetchQueue (0.3.2): every Image.prefetch merged and sent ONE native call at a time, so
// turbo-image's unlocked prefetcher dictionary is never touched by two prefetches at once.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createPrefetchQueue, type Timers } from '../prefetchQueue';

/** Timers driven by the test: nothing runs until `advance`. */
function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    set: (fn, ms) => {
      const id = nextId++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clear: (id) => {
      pending.delete(id as number);
    },
  };
  /** Runs every timer due by `now + ms`, in order, letting promises settle in between. */
  async function advance(ms: number) {
    const end = now + ms;
    for (;;) {
      await flushMicrotasks();
      let dueId: number | undefined;
      let dueAt = Infinity;
      for (const [id, t] of pending) {
        if (t.at <= end && t.at < dueAt) {
          dueAt = t.at;
          dueId = id;
        }
      }
      if (dueId === undefined) break;
      const t = pending.get(dueId)!;
      pending.delete(dueId);
      now = t.at;
      t.fn();
    }
    now = end;
    await flushMicrotasks();
  }
  return { timers, advance };
}

const flushMicrotasks = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

/** A native prefetch whose calls the test answers by hand. */
function controlledNative() {
  const calls: { urls: string[]; resolve: (ok: unknown) => void; reject: (e: unknown) => void }[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const native = (urls: string[]) =>
    new Promise((resolve, reject) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const done = (fn: (v: unknown) => void) => (v: unknown) => {
        inFlight--;
        fn(v);
      };
      calls.push({ urls, resolve: done(resolve), reject: done(reject) });
    });
  /** The i-th native call, which must have happened. */
  const call = (i: number) => {
    const c = calls[i];
    assert.ok(c, `native call ${i} was made`);
    return c;
  };
  return { native, calls, call, maxInFlight: () => maxInFlight };
}

test('60 per-photo calls in one moment become ONE native call', async () => {
  const { timers, advance } = fakeTimers();
  const { native, calls, call } = controlledNative();
  const q = createPrefetchQueue(native, { timers });

  const urls = Array.from({ length: 60 }, (_, i) => `p${i}`);
  const results = urls.map((u) => q.prefetch([u]));
  await advance(16);

  assert.equal(calls.length, 1);
  assert.deepEqual(call(0).urls, urls);
  call(0).resolve(true);
  assert.deepEqual(await Promise.all(results), urls.map(() => true));
});

test('never two native calls at once: later calls wait, then go out merged', async () => {
  const { timers, advance } = fakeTimers();
  const { native, calls, call, maxInFlight } = controlledNative();
  const q = createPrefetchQueue(native, { timers });

  const first = q.prefetch(['a']);
  await advance(16);
  assert.equal(calls.length, 1);

  // Arrive while the first is running: none reaches native yet.
  const second = q.prefetch(['b']);
  const third = q.prefetch(['c', 'b']);
  await advance(1000);
  assert.equal(calls.length, 1);

  call(0).resolve(true);
  await advance(15); // still inside the gap
  assert.equal(calls.length, 1);
  await advance(1);
  assert.equal(calls.length, 2);
  assert.deepEqual(call(1).urls, ['b', 'c']);

  call(1).resolve(true);
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(await third, true);
  assert.equal(maxInFlight(), 1);
});

test('a native call that never answers times out, counts as done, and the queue moves on', async () => {
  const { timers, advance } = fakeTimers();
  const { native, calls, call } = controlledNative();
  const q = createPrefetchQueue(native, { timers, timeoutMs: 10_000 });

  const lost = q.prefetch(['a']);
  await advance(16);
  const next = q.prefetch(['b']);
  await advance(9_999);
  assert.equal(calls.length, 1);
  await advance(1);
  assert.equal(await lost, true);

  await advance(16);
  assert.equal(calls.length, 2);
  // A late answer for the timed-out call changes nothing.
  call(0).resolve(false);
  call(1).resolve(true);
  assert.equal(await next, true);
});

test('native false resolves false; rejection and a synchronous throw reject; the queue keeps going', async () => {
  const { timers, advance } = fakeTimers();
  const { native, calls, call } = controlledNative();
  let throwNext = false;
  const q = createPrefetchQueue(
    (urls) => {
      if (throwNext) {
        throwNext = false;
        throw new Error('native threw');
      }
      return native(urls);
    },
    { timers },
  );

  const no = q.prefetch(['a']);
  await advance(16);
  call(0).resolve(false);
  assert.equal(await no, false);

  const rejected = q.prefetch(['b']);
  await advance(32);
  call(1).reject(new Error('native rejected'));
  await assert.rejects(rejected, /native rejected/);

  throwNext = true;
  const thrown = q.prefetch(['c']);
  await advance(32);
  await assert.rejects(thrown, /native threw/);

  const after = q.prefetch(['d']);
  await advance(32);
  assert.deepEqual(call(2).urls, ['d']);
  call(2).resolve(true);
  assert.equal(await after, true);
});

test('a void (non-Promise) native return counts as done', async () => {
  const { timers, advance } = fakeTimers();
  const sent: string[][] = [];
  const q = createPrefetchQueue(
    (urls) => {
      sent.push(urls);
    },
    { timers },
  );
  const done = q.prefetch(['a']);
  await advance(16);
  assert.equal(await done, true);
  assert.deepEqual(sent, [['a']]);
});

test('batches hold at most maxBatch photos, and never split one caller', async () => {
  const { timers, advance } = fakeTimers();
  const { native, calls, call } = controlledNative();
  const q = createPrefetchQueue(native, { timers, maxBatch: 100 });
  const list = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

  const a = q.prefetch(list('a', 60));
  const b = q.prefetch(list('b', 60)); // 120 > 100: next batch
  const big = q.prefetch(list('c', 150)); // alone, though over the cap
  await advance(16);
  assert.equal(call(0).urls.length, 60);
  call(0).resolve(true);
  await advance(32);
  assert.equal(call(1).urls.length, 60);
  call(1).resolve(true);
  await advance(32);
  assert.equal(call(2).urls.length, 150);
  call(2).resolve(true);
  assert.deepEqual(await Promise.all([a, b, big]), [true, true, true]);
});

test('empty or blank lists resolve true without a native call', async () => {
  const { timers, advance } = fakeTimers();
  let called = false;
  const q = createPrefetchQueue(
    () => {
      called = true;
      return true;
    },
    { timers },
  );
  assert.equal(await q.prefetch([]), true);
  assert.equal(await q.prefetch(['']), true);
  await advance(100);
  assert.equal(called, false);
});
