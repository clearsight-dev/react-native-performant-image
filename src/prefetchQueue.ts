/**
 * Every `Image.prefetch` goes through this queue (0.3.2), so turbo-image gets ONE prefetch at a time,
 * however the app calls it: a list at once, or one photo at a time in a loop.
 *
 * Why: react-native-turbo-image 1.24.3 (iOS) keeps its prefetchers in a dictionary with no lock. A
 * prefetch inserts on React Native's UI-manager (shadow) queue (`TurboImageViewManager.swift:46`) and its
 * completion removes on main (`:50`). Two prefetches that overlap can touch that dictionary from both
 * queues at once and crash the app (Sentry EP / H6 / HJ). 0.3.1 batched `usePrefetchImages`, but an app
 * that calls `Image.prefetch(url)` per photo still sent one native prefetch per photo.
 *
 * What it does:
 * - **Merges.** Calls made within one merge window (a frame) become one native call, deduped. Each
 *   caller still gets its own promise.
 * - **One at a time.** The next native call waits for the previous one to finish, plus a gap. turbo-image
 *   resolves the promise a moment BEFORE it removes the prefetcher, so the gap keeps the next insert off
 *   that remove.
 * - **Never stuck.** turbo-image sets its completion handler after starting, so a prefetch of photos
 *   already cached can finish without ever resolving. After `timeoutMs` the queue moves on and treats
 *   it as done (the photos are being, or were, fetched).
 * - **Bounded.** A native call carries at most `maxBatch` photos. A single caller's list is never split.
 *
 * This narrows the race a lot; it cannot close it, since the race is inside turbo-image. Only a native
 * patch (one queue for the dictionary) gets it to zero.
 *
 * Pure (no react-native), so it runs in Node's tests. `Image.tsx` binds it to `TurboImage.prefetch`.
 */

export type NativePrefetch = (urls: string[]) => unknown;

export interface Timers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

export interface PrefetchQueueOptions {
  /** How long calls are gathered into one native call. Default one frame. */
  mergeWindowMs?: number;
  /** Pause between one native call finishing and the next starting. Default one frame. */
  gapMs?: number;
  /** After this long without an answer, a native call counts as done. Default 10 s. */
  timeoutMs?: number;
  /** Most photos in one native call. Default 100. */
  maxBatch?: number;
  /** For tests. */
  timers?: Timers;
}

interface Waiter {
  urls: string[];
  resolve: (ok: boolean) => void;
  reject: (error: unknown) => void;
}

const defaultTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createPrefetchQueue(nativePrefetch: NativePrefetch, options: PrefetchQueueOptions = {}) {
  const mergeWindowMs = options.mergeWindowMs ?? 16;
  const gapMs = options.gapMs ?? 16;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxBatch = Math.max(1, options.maxBatch ?? 100);
  const timers = options.timers ?? defaultTimers;

  const waiting: Waiter[] = [];
  /** A native call is running, or the gap after one is. */
  let busy = false;
  /** A flush is already scheduled. */
  let scheduled = false;

  function schedule(ms: number) {
    if (scheduled) return;
    scheduled = true;
    timers.set(() => {
      scheduled = false;
      flush();
    }, ms);
  }

  /** Whole callers, in order, up to `maxBatch` distinct photos (always at least one caller). */
  function takeBatch(): { waiters: Waiter[]; urls: string[] } {
    const taken: Waiter[] = [];
    const urls = new Set<string>();
    for (;;) {
      const next = waiting[0];
      if (!next) break;
      const added = next.urls.filter((u) => !urls.has(u)).length;
      if (taken.length > 0 && urls.size + added > maxBatch) break;
      for (const u of next.urls) urls.add(u);
      taken.push(next);
      waiting.shift();
    }
    return { waiters: taken, urls: [...urls] };
  }

  function flush() {
    if (busy || waiting.length === 0) return;
    busy = true;
    const { waiters, urls } = takeBatch();

    let settled = false;
    let timeout: unknown;
    const finish = (outcome: { ok: boolean } | { error: unknown }) => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) timers.clear(timeout);
      for (const w of waiters) {
        if ('error' in outcome) w.reject(outcome.error);
        else w.resolve(outcome.ok);
      }
      // The gap: turbo-image resolves before it removes its prefetcher.
      timers.set(() => {
        busy = false;
        if (waiting.length > 0) schedule(0);
      }, gapMs);
    };

    let started: unknown;
    try {
      started = nativePrefetch(urls);
    } catch (error) {
      finish({ error });
      return;
    }
    timeout = timers.set(() => finish({ ok: true }), timeoutMs);
    // A non-Promise return (void) counts as started. Only an explicit `false` is a no.
    Promise.resolve(started).then(
      (ok) => finish({ ok: ok !== false }),
      (error) => finish({ error }),
    );
  }

  return {
    /** Queue these photos. Resolves `false` only if turbo-image says no; rejects if it throws or rejects. */
    prefetch(urls: readonly string[]): Promise<boolean> {
      const list = [...new Set(urls.filter((u) => typeof u === 'string' && u.length > 0))];
      if (list.length === 0) return Promise.resolve(true);
      return new Promise<boolean>((resolve, reject) => {
        waiting.push({ urls: list, resolve, reject });
        if (!busy) schedule(mergeWindowMs);
      });
    },
    /** For tests and diagnostics. */
    state() {
      return { busy, queued: waiting.length };
    },
  };
}
