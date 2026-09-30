import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import TurboImage from 'react-native-turbo-image';
import type { Failure, Success, TurboImageProps } from 'react-native-turbo-image';

import { scheduler } from './scheduler';
import { arePropsEqual } from './shallowEqual';

export interface PerformantImageProps extends Omit<TurboImageProps, 'source'> {
  /** Remote URL of the image. */
  uri: string;
  /** Request headers, e.g. auth for a private CDN. */
  headers?: TurboImageProps['source']['headers'];
  /** Cache under this key instead of the URL (useful for signed URLs that rotate). */
  cacheKey?: TurboImageProps['source']['cacheKey'];
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
}

function PerformantImageComponent({
  uri,
  headers,
  cacheKey,
  retryDelayMs = 300,
  maxRetries = 2,
  onFailure,
  onSuccess,
  showPlaceholderOnFailure = true,
  ...rest
}: PerformantImageProps) {
  const [retryKey, setRetryKey] = useState(0);

  // One scheduler entry per image URL. Keying the owner on `uri` means a
  // late failure from the previous URL can never cancel or retry the new one.
  const owner = useMemo(() => ({ uri }), [uri]);
  useEffect(() => () => scheduler.cancel(owner), [owner]);

  // The handlers below stay stable across renders, so TurboImage never sees a
  // prop change just because the parent passed a new inline callback. They
  // read the current props from here instead.
  const latest = useRef({ onFailure, onSuccess, retryDelayMs, maxRetries });
  latest.current = { onFailure, onSuccess, retryDelayMs, maxRetries };

  const handleFailure = useCallback(
    (event: NativeSyntheticEvent<Failure>) => {
      const current = latest.current;
      current.onFailure?.(event);
      scheduler.reportFailure(owner, {
        retryDelayMs: current.retryDelayMs,
        maxRetries: current.maxRetries,
        onRetry: () => setRetryKey((k) => k + 1),
      });
    },
    [owner],
  );

  const handleSuccess = useCallback(
    (event: NativeSyntheticEvent<Success>) => {
      scheduler.reportSuccess(owner);
      latest.current.onSuccess?.(event);
    },
    [owner],
  );

  // A fresh `headers` object on every render must not look like a new source.
  const headersKey = headers === undefined ? '' : JSON.stringify(headers);
  const source = useMemo(
    () => ({ uri, headers, cacheKey }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- compared by value via headersKey
    [uri, headersKey, cacheKey],
  );

  return (
    <TurboImage
      {...rest}
      // A new key remounts only this image, which makes the native view
      // request it again. No other row in the list is touched.
      key={`${uri}-${retryKey}`}
      source={source}
      showPlaceholderOnFailure={showPlaceholderOnFailure}
      onFailure={handleFailure}
      onSuccess={handleSuccess}
    />
  );
}

/**
 * Drop-in `TurboImage` that recovers by itself when a load fails.
 *
 * - Online failure: retries with exponential backoff and jitter, up to `maxRetries`.
 * - Offline failure (or out of retries): waits, then retries once the device is
 *   back online, staggered across all waiting images.
 * - Healthy images cost nothing: no listener, no timer, no re-render.
 */
export const PerformantImage = memo(PerformantImageComponent, arePropsEqual);
PerformantImage.displayName = 'PerformantImage';
