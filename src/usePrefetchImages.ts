import { useEffect } from 'react';

// `./Image` is `Image.web` in a web build. `Image.prefetch` takes one URL or a
// whole list; the list form is what keeps this to a single native prefetcher.
import { Image } from './Image';
import { warmOnce } from './warmOnce';

/** Photos sent to the cache this launch (and not failed since). */
const warmed = new Set<string>();

/**
 * Sends each photo of a list to the image cache (Nuke/Coil on the device, the
 * browser's on the web), once per URL per launch, in ONE prefetch call for the
 * whole list. For a list kept on the device (favourites, a waitlist) so its
 * photos draw offline too. Pass the URLs the list draws, at the size it draws
 * them; a new array only when the list changes (it is the effect's key).
 *
 * The single-call batch replaces the old per-photo loop, whose burst of prefetch
 * calls raced on turbo-image's unlocked prefetcher dictionary across two queues
 * and crashed the app (see `warmOnce`). Batching makes that crash much rarer but
 * cannot rule it out. The signature is unchanged — a tile keeps calling
 * `usePrefetchImages(urls)`.
 */
export function usePrefetchImages(urls: ReadonlyArray<string | null | undefined>): void {
  useEffect(() => {
    warmOnce(urls, warmed, Image.prefetch);
  }, [urls]);
}
