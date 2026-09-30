import type { ImageProps as RNImageProps } from 'react-native';

/** A compact preview decoded natively while the real image loads. */
export interface ImagePlaceholder {
  blurhash?: string;
  thumbhash?: string;
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
   * Shown while the image loads, and kept if it fails. Same idea as
   * expo-image's `placeholder`, for blurhash / thumbhash strings. Native only.
   */
  placeholder?: ImagePlaceholder;
  /**
   * Fade-in duration in ms once the image has loaded. Like RN's
   * `fadeDuration`, which is Android-only, but on iOS too. Native only.
   */
  transition?: number;
}
