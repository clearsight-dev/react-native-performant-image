/**
 * Warms a list's photos in ONE prefetch call (0.3.1). react-native-turbo-image's
 * prefetch takes an array; sending the whole list at once builds a single native
 * `ImagePrefetcher` instead of one per photo.
 *
 * Why it matters: turbo-image 1.24.3 (iOS) keeps its prefetchers in a dictionary
 * with no lock. A prefetch call inserts on the RN shadow queue
 * (`TurboImageViewManager.swift:46`) and its completion removes on main (`:50`).
 * The old per-photo loop fired one insert and one remove per URL in a tight
 * burst, so the two queues mutated that dictionary at the same time, and the app
 * crashed (SIGABRT/SIGSEGV, "ImagePrefetcher deallocated with non-zero retain
 * count"; Sentry `EP` `H6` `HJ`). One call per list cuts that to one insert and
 * one remove, which makes the race far rarer. It does NOT close it: two lists
 * warming at once can still collide. Only a native patch that confines the
 * dictionary to one queue gets it to zero.
 *
 * Pure (no React, no react-native), so it runs in Node's tests; `usePrefetchImages`
 * is the hook.
 */
import { photosToWarm } from './prefetchSelection';

/**
 * Sends the photos of `urls` not already warmed this launch to `prefetch` as one
 * batch, and remembers them — forgetting the whole batch if that one prefetch
 * says no (resolves `false`) or throws/rejects, so the next list that has them
 * tries again. `warmed` is the caller's module-level set (once per launch).
 */
export function warmOnce(
  urls: ReadonlyArray<string | null | undefined>,
  warmed: Set<string>,
  prefetch: (urls: string[]) => unknown,
): void {
  const batch = photosToWarm(urls, warmed);
  if (batch.length === 0) return;

  // Remember them now, so a re-render with the same list doesn't send them again.
  for (const url of batch) warmed.add(url);
  const forget = () => {
    for (const url of batch) warmed.delete(url);
  };

  let started: unknown;
  try {
    started = prefetch(batch);
  } catch {
    forget();
    return;
  }
  // `prefetch` may hand back a non-Promise; Promise.resolve wraps anything, where
  // a bare `.then` would throw uncaught. Only an explicit `false` or a rejection
  // forgets the batch.
  Promise.resolve(started)
    .then((ok) => {
      if (ok === false) forget();
    })
    .catch(forget);
}
