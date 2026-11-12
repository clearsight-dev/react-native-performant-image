/**
 * Which of a list's photos still need warming (0.3.1). Pure, so it runs in Node's
 * tests; the one batched prefetch that warms them is `warmOnce` (the `usePrefetchImages` hook).
 */

/**
 * The photos to send to the cache: dropped of empties, deduped in order, and
 * minus the ones already warmed this launch. `warmed` is the module-level set
 * `usePrefetchImages` keeps — a photo is warmed once per launch.
 */
export function photosToWarm(
  urls: ReadonlyArray<string | null | undefined>,
  warmed: ReadonlySet<string>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (!url || warmed.has(url) || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}
