/**
 * The retry engine behind every Image, shared by all of them.
 *
 * Why one shared scheduler instead of per-image listeners: a product grid can
 * mount hundreds of images, and a NetInfo listener per image means hundreds of
 * callbacks on every connectivity change — work done on the JS thread while the
 * list is scrolling. Here a healthy image registers nothing at all. Only images
 * that FAILED hold an entry, and a single NetInfo subscription exists only
 * while at least one entry does.
 *
 * Pure: no React, no React Native, no NetInfo. Connectivity, timers and
 * randomness are injected, so the whole policy is unit-testable in plain Node.
 */

/** Online / offline / not known yet. */
export type Online = boolean | undefined;

export interface Connectivity {
  /** Starts listening; the listener may be called immediately. Returns an unsubscribe. */
  subscribe(listener: (online: Online) => void): () => void;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface SchedulerConfig {
  /**
   * Gap between consecutive retries when the connection comes back, so a
   * screen of failed images reloads as a quick ripple instead of one burst of
   * simultaneous requests. @default 50
   */
  staggerMs: number;
  /** Upper bound for any single retry delay, backoff included. @default 30000 */
  maxDelayMs: number;
}

export interface FailureOptions {
  /** Base delay before a retry; also the backoff unit and the jitter range. */
  retryDelayMs: number;
  /** Retries allowed while online before waiting for a reconnect instead. */
  maxRetries: number;
  /** Reload the image. Never called after cancel() or reportSuccess(). */
  onRetry: () => void;
}

interface Entry extends FailureOptions {
  attempts: number;
  timer: unknown;
}

export interface RetryScheduler {
  /** An image failed to load. Decides whether and when it retries. */
  reportFailure(owner: object, options: FailureOptions): void;
  /** An image loaded. Forgets its failures. */
  reportSuccess(owner: object): void;
  /** The image unmounted or changed source. Drops any pending retry. */
  cancel(owner: object): void;
  configure(config: Partial<SchedulerConfig>): void;
  /** For tests and debugging: how many images currently hold an entry. */
  readonly size: number;
}

/**
 * NetInfo state -> online. Only an explicit `false` means offline:
 * `isInternetReachable` is `null` until the first reachability probe finishes
 * (and on some Android setups stays that way), and treating that as offline
 * would park every failed image waiting for a reconnect that never comes.
 */
export function isOnline(state: {
  isConnected: boolean | null;
  isInternetReachable?: boolean | null;
}): Online {
  if (state.isConnected === false || state.isInternetReachable === false) return false;
  if (state.isConnected === true) return true;
  return undefined;
}

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createRetryScheduler(
  connectivity: Connectivity,
  timers: Timers = defaultTimers,
  random: () => number = Math.random,
): RetryScheduler {
  const config: SchedulerConfig = { staggerMs: 50, maxDelayMs: 30_000 };
  const entries = new Map<object, Entry>();
  // Images waiting for the connection to come back, in the order they failed.
  const waiting = new Set<object>();
  let online: Online;
  let unsubscribe: (() => void) | null = null;

  const schedule = (entry: Entry, delay: number) => {
    entry.timer = timers.setTimeout(() => {
      entry.timer = undefined;
      entry.onRetry();
    }, Math.min(delay, config.maxDelayMs));
  };

  const clear = (entry: Entry) => {
    if (entry.timer !== undefined) timers.clearTimeout(entry.timer);
    entry.timer = undefined;
  };

  const onConnectivity = (next: Online) => {
    const wasOffline = online === false;
    online = next;
    if (next === false || !wasOffline) return;
    // Back online: retry everything that was waiting, oldest failure first,
    // spread out, each with a fresh retry budget.
    let k = 0;
    for (const owner of waiting) {
      const entry = entries.get(owner);
      if (!entry) continue;
      entry.attempts = 0;
      clear(entry);
      schedule(entry, entry.retryDelayMs + k++ * config.staggerMs);
    }
    waiting.clear();
  };

  const release = (owner: object) => {
    const entry = entries.get(owner);
    if (entry) clear(entry);
    entries.delete(owner);
    waiting.delete(owner);
    if (entries.size === 0 && unsubscribe) {
      unsubscribe();
      unsubscribe = null;
      // Nothing is listening any more, so the last known state goes stale.
      online = undefined;
    }
  };

  return {
    reportFailure(owner, options) {
      let entry = entries.get(owner);
      if (entry) {
        clear(entry);
        Object.assign(entry, options);
      } else {
        entry = { ...options, attempts: 0, timer: undefined };
        entries.set(owner, entry);
      }
      if (!unsubscribe) unsubscribe = connectivity.subscribe(onConnectivity);

      // Offline, or out of retries while online (a dead URL, a server that
      // keeps failing): wait for the connection to come back rather than
      // hammering the network.
      if (online === false || entry.attempts >= entry.maxRetries) {
        waiting.add(owner);
        return;
      }
      waiting.delete(owner);
      // Online (or not known yet): exponential backoff plus jitter, so images
      // that failed together don't all retry in the same frame.
      const backoff = entry.retryDelayMs * 2 ** entry.attempts;
      entry.attempts += 1;
      schedule(entry, backoff + random() * entry.retryDelayMs);
    },
    reportSuccess: release,
    cancel: release,
    configure(next) {
      Object.assign(config, next);
    },
    get size() {
      return entries.size;
    },
  };
}
