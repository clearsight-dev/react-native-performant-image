import type { ImageProps as RNImageProps } from 'react-native';

/** An image already decoded in memory, drawn while the real one loads. */
export interface ImagePlaceholder {
  /**
   * The URL it was loaded from. Drawn at once, whatever size it was decoded
   * at, with this image's `resizeMode`: a list's thumbnail can open a detail
   * screen's larger image with no blank frame. Nothing is shown if it is no
   * longer in memory.
   */
  memoryCacheKey: string;
}

/**
 * React Native's `Image` props, so swapping the import is the whole
 * migration, plus a few extras.
 */
export interface ImageProps extends RNImageProps {
  /**
   * Base delay before a retry. While online it is the backoff unit (delay,
   * then 2x, 4x, ... plus jitter); after a reconnect it is the wait before the
   * first image retries. @default 300
   */
  retryDelayMs?: number;
  /**
   * Retries allowed while the device stays online. After that the image waits
   * for the connection to drop and come back before trying again. @default 2
   */
  maxRetries?: number;
  /**
   * An image already in memory, shown while this one loads and kept if it
   * fails. Same idea as expo-image's `placeholder`. Native only.
   */
  placeholder?: ImagePlaceholder;
  /**
   * Optional. A blurhash drawn while the image loads, and kept if it fails.
   * With a `placeholder` too: Android falls back to it when the in-memory
   * image is gone, iOS shows only the in-memory image. Native only.
   */
  blurhash?: string;
  /** Optional. A thumbhash, as `blurhash` (it wins when both are given). Native only. */
  thumbhash?: string;
  /**
   * Fade-in duration in ms once the image has loaded. Like RN's
   * `fadeDuration`, which is Android-only, but on iOS too. Native only.
   */
  transition?: number;
  /**
   * Decode width in points, never upscaled. Without it, Android decodes at the
   * view's size, which blurs an image that is then scaled up (a pinch-zoom).
   * Give the width to zoom to. iOS decodes at full size anyway, so this only
   * shrinks there. Native only.
   */
  resize?: number;
}
