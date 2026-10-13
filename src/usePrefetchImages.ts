import { useEffect } from 'react';
// `./Image` is `Image.web` in a web build: the browser's own prefetch.
import { Image } from './Image';
import { prefetchOnce } from './prefetchOnce';

/**
 * Sends each photo of a list to the image cache (Nuke/Coil on disk; the browser's on the web) as soon
 * as the list has it, once per URL per launch (0.3.0). For a list stored on the device (favourites, a
 * waitlist), so its photos draw offline too. Pass the URLs the list draws, at the size it draws them;
 * a new array only when the list changes (it is the effect's key).
 */
export function usePrefetchImages(urls: ReadonlyArray<string | null | undefined>): void {
  useEffect(() => {
    prefetchOnce(urls, Image.prefetch);
  }, [urls]);
}
