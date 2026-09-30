import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { scheduler } from './scheduler';

/** A ref that always holds the latest value, for handlers that must keep one identity. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

interface Options {
  uri: string;
  retryDelayMs: number;
  maxRetries: number;
}

/**
 * The retry wiring both platforms share. `retryKey` goes into the image's
 * `key`: bumping it remounts just that image, which makes it load again.
 * Both reporters keep one identity for the image's lifetime.
 */
export function useImageRetry({ uri, retryDelayMs, maxRetries }: Options) {
  const [retryKey, setRetryKey] = useState(0);

  // One scheduler entry per image URL. Keying the owner on `uri` means a
  // late failure from the previous URL can never cancel or retry the new one.
  const owner = useMemo(() => ({ uri }), [uri]);
  useEffect(() => () => scheduler.cancel(owner), [owner]);

  const options = useLatest({ retryDelayMs, maxRetries });

  const reportFailure = useCallback(() => {
    scheduler.reportFailure(owner, {
      ...options.current,
      onRetry: () => setRetryKey((k) => k + 1),
    });
  }, [owner, options]);

  const reportSuccess = useCallback(() => scheduler.reportSuccess(owner), [owner]);

  return { retryKey, reportFailure, reportSuccess };
}
