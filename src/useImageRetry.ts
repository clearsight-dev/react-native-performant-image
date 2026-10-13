import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { scheduler } from './scheduler';

/** A ref that always holds the latest value, for handlers that must keep one identity. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/** The value before the last change; undefined until it first changes. */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<{ latest: T; previous: T | undefined }>({ latest: value, previous: undefined });
  if (ref.current.latest !== value) ref.current = { latest: value, previous: ref.current.latest };
  return ref.current.previous;
}

interface Options {
  uri: string;
  retryDelayMs: number;
  maxRetries: number;
}

/**
 * The retry wiring both platforms share. `retryKey` goes into the image's
 * `key`: bumping it remounts just that image, which makes it load again.
 * `failed` is true once the current `uri` has failed. Both reporters keep one
 * identity while the `uri` stays the same.
 */
export function useImageRetry({ uri, retryDelayMs, maxRetries }: Options) {
  const [retryKey, setRetryKey] = useState(0);
  const [failedUri, setFailedUri] = useState<string | undefined>(undefined);

  // One scheduler entry per image URL. Keying the owner on `uri` means a
  // late failure from the previous URL can never cancel or retry the new one.
  const owner = useMemo(() => ({ uri }), [uri]);
  useEffect(() => () => scheduler.cancel(owner), [owner]);

  const options = useLatest({ retryDelayMs, maxRetries });

  const reportFailure = useCallback(() => {
    setFailedUri(owner.uri);
    scheduler.reportFailure(owner, {
      ...options.current,
      onRetry: () => setRetryKey((k) => k + 1),
    });
  }, [owner, options]);

  const reportSuccess = useCallback(() => scheduler.reportSuccess(owner), [owner]);

  return { retryKey, failed: failedUri === uri, reportFailure, reportSuccess };
}
