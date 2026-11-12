/**
 * Sends each photo to the image cache once per launch (0.3.0, from amore-v2's `usePrefetchPhotos`):
 * for a list kept on the device (favourites, a waitlist), so it draws its photos offline too, scrolled
 * to or not. A prefetch that fails is forgotten, so the next list that has it tries again. Plain, so it
 * runs in Node's tests; `usePrefetchImages` is the hook.
 */

/** URLs already sent this launch (and not failed since). */
const prefetched = new Set<string>();

/** Sends every URL not already sent to `prefetch`; forgets one whose prefetch says no or throws. */
export function prefetchOnce(
  urls: ReadonlyArray<string | null | undefined>,
  prefetch: (url: string) => Promise<boolean>,
): void {
  for (const url of urls) {
    if (!url || prefetched.has(url)) continue;
    prefetched.add(url);
    let started: unknown;
    try {
      started = prefetch(url);
    } catch {
      prefetched.delete(url);
      continue;
    }
    // `prefetch` may hand back a non-Promise (a native prefetch that returns
    // void): `Promise.resolve` adopts a thenable and wraps anything else, where
    // `started.then(...)` on a bare value would throw, uncaught. Only an
    // explicit `false` or a rejection forgets the URL, so a void return is kept.
    Promise.resolve(started)
      .then((ok) => {
        if (ok === false) prefetched.delete(url);
      })
      .catch(() => prefetched.delete(url));
  }
}

/** For tests: forget every URL sent, as a fresh launch would. */
export function forgetPrefetched(): void {
  prefetched.clear();
}
