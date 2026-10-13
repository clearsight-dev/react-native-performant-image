/**
 * Whether an image asks its native view for the success event. iOS sends no event nobody listens
 * to, so a healthy image with no `onLoad` costs no JS work when it loads. The event is needed when
 * the caller passed `onLoad`, and once this source has failed: its success must clear the pending
 * retry (an iOS image also reloads by itself when the app comes back to the foreground). An image
 * with an in-memory placeholder behind it always listens; see `UnderlaidImage`.
 */
export function needsSuccessEvent(image: { hasOnLoad: boolean; failed: boolean }): boolean {
  return image.hasOnLoad || image.failed;
}

/**
 * A success event for the source this image showed before. The native view stays the same when the
 * source changes (a recycled list row), and a load that finished just before the change can reach
 * JS after it: that picture is gone, so the event is not this source's. Only an exact match with
 * the previous source counts, so a native address written differently (`%20` for a space) is never
 * mistaken for a late one.
 */
export function isFromPreviousSource(loadedUri: string | undefined, uri: string, previousUri: string | undefined): boolean {
  return loadedUri !== undefined && loadedUri !== uri && loadedUri === previousUri;
}
