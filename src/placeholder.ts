/** The props that show something while an image loads. */
export interface PlaceholderInput {
  memoryCacheKey?: string;
  blurhash?: string;
  thumbhash?: string;
}

/** TurboImage's own `placeholder` prop. */
export type NativePlaceholder = PlaceholderInput;

/** How those props are drawn on one platform. */
export interface PlaceholderPlan {
  /** Passed to TurboImage's own `placeholder`. */
  native?: NativePlaceholder;
  /** Drawn as a second image behind the real one, with the same resizeMode, until it has loaded. */
  underlayUri?: string;
}

/**
 * Where the in-memory image and the hashes are drawn.
 *
 * Android (Coil) draws `memoryCacheKey` itself, with the view's scale type. iOS can't: NukeUI puts
 * a placeholder in an image view of its own, which keeps UIKit's default stretch-to-fill, and
 * TurboImage only applies `resizeMode` to it when `resizeMode` itself changes. A photo of another
 * shape than the view (a tall product shot in a square gallery) is then squashed until the real
 * image arrives. So on iOS the in-memory image is drawn as an image of its own, behind the real one,
 * and the hashes are dropped there: TurboImage draws them inside the image view, on top of it.
 * Android keeps them as the fallback for an in-memory image that has been evicted.
 *
 * A key equal to the image's own URL is dropped on both: the engines already look the image itself
 * up in memory first.
 *
 * Pure (the platform is passed in), so it is tested without a native runtime.
 */
export function planPlaceholder(os: string, input: PlaceholderInput, uri: string): PlaceholderPlan {
  // One hash only: iOS decodes both off the main thread, and the last to finish would show.
  const hashes: NativePlaceholder =
    input.thumbhash !== undefined ? { thumbhash: input.thumbhash } : input.blurhash !== undefined ? { blurhash: input.blurhash } : {};
  const hasHash = Object.keys(hashes).length > 0;
  const key = input.memoryCacheKey && input.memoryCacheKey !== uri ? input.memoryCacheKey : undefined;
  if (!key) return hasHash ? { native: hashes } : {};
  if (os === 'ios') return { underlayUri: key };
  return { native: { memoryCacheKey: key, ...hashes } };
}
