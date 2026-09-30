import React, { memo, useCallback, useMemo } from 'react';
import { Image as RNImage } from 'react-native';
import type { ImageErrorEvent, ImageLoadEvent, ImageProgressEventIOS, NativeSyntheticEvent } from 'react-native';
import TurboImage from 'react-native-turbo-image';
import type { Failure, Progress, Success } from 'react-native-turbo-image';

import { arePropsEqual } from './shallowEqual';
import { remoteSource, type RemoteSource } from './source';
import { toTurboProps } from './toTurboProps';
import type { ImageProps } from './types';
import { useImageRetry, useLatest } from './useImageRetry';

const EXTRAS = ['retryDelayMs', 'maxRetries', 'placeholder', 'transition'] as const;

function ImageComponent(props: ImageProps) {
  const remote = remoteSource(props.source, props.src, props.srcSet);
  if (!remote) {
    // A bundled require(), file:// or data: URI: nothing to retry, and
    // React Native's own Image handles these best.
    const rnProps: Record<string, unknown> = { ...props };
    for (const key of EXTRAS) delete rnProps[key];
    return <RNImage {...(rnProps as ImageProps)} />;
  }
  return <RemoteImage props={props} remote={remote} />;
}

function RemoteImage({ props, remote }: { props: ImageProps; remote: RemoteSource }) {
  const { retryKey, reportFailure, reportSuccess } = useImageRetry({
    uri: remote.uri,
    retryDelayMs: props.retryDelayMs ?? 300,
    maxRetries: props.maxRetries ?? 2,
  });

  // Handlers keep one identity and read the current callbacks from here, so
  // new inline callbacks from the parent never look like a prop change.
  const handlers = useLatest({
    onLoad: props.onLoad,
    onError: props.onError,
    onLoadStart: props.onLoadStart,
    onLoadEnd: props.onLoadEnd,
    onProgress: props.onProgress,
  });

  const onSuccess = useCallback(
    (e: NativeSyntheticEvent<Success>) => {
      reportSuccess();
      const { width, height } = e.nativeEvent;
      handlers.current.onLoad?.({
        ...e,
        nativeEvent: { source: { width, height, uri: remote.uri } },
      } as ImageLoadEvent);
    },
    [reportSuccess, handlers, remote.uri],
  );
  const onFailure = useCallback(
    (e: NativeSyntheticEvent<Failure>) => {
      // Same shape as React Native's error event: { nativeEvent: { error } }.
      handlers.current.onError?.(e as unknown as ImageErrorEvent);
      reportFailure();
    },
    [reportFailure, handlers],
  );
  const onStart = useCallback(() => handlers.current.onLoadStart?.(), [handlers]);
  const onCompletion = useCallback(() => handlers.current.onLoadEnd?.(), [handlers]);
  const onProgress = useCallback(
    (e: NativeSyntheticEvent<Progress>) =>
      handlers.current.onProgress?.({
        ...e,
        nativeEvent: { loaded: e.nativeEvent.completed, total: e.nativeEvent.total },
      } as ImageProgressEventIOS),
    [handlers],
  );

  // A fresh `headers` object on every render must not look like a new source.
  const headersKey = remote.headers ? JSON.stringify(remote.headers) : '';
  const source = useMemo(
    () => (remote.headers ? { uri: remote.uri, headers: remote.headers } : { uri: remote.uri }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- compared by value via headersKey
    [remote.uri, headersKey],
  );

  return (
    <TurboImage
      {...toTurboProps(props)}
      // A new key remounts only this image, which makes the native view
      // request it again. No other row in the list is touched.
      key={`${remote.uri}-${retryKey}`}
      source={source}
      onSuccess={onSuccess}
      onFailure={onFailure}
      // Only ask the native side for events someone is listening to.
      onStart={props.onLoadStart ? onStart : undefined}
      onCompletion={props.onLoadEnd ? onCompletion : undefined}
      onProgress={props.onProgress ? onProgress : undefined}
    />
  );
}

const statics = {
  getSize: RNImage.getSize,
  getSizeWithHeaders: RNImage.getSizeWithHeaders,
  resolveAssetSource: RNImage.resolveAssetSource,
  queryCache: RNImage.queryCache,
  abortPrefetch: RNImage.abortPrefetch,
  /** Warms the cache this component reads (Nuke / Coil), not React Native's. */
  prefetch: (url: string): Promise<boolean> => TurboImage.prefetch([{ uri: url }]),
  /** expo-image style: drop decoded images from memory. */
  clearMemoryCache: (): Promise<void> => TurboImage.clearMemoryCache(),
  /** expo-image style: drop the on-disk cache. */
  clearDiskCache: (): Promise<void> => TurboImage.clearDiskCache(),
};

const MemoImage = memo(ImageComponent, arePropsEqual);
MemoImage.displayName = 'Image';

/**
 * React Native's `Image`, rebuilt on react-native-turbo-image (Nuke / Coil),
 * that recovers by itself when a load fails. Same props and statics, so
 * swapping the import is the whole migration.
 *
 * - Online failure: retries with exponential backoff and jitter, up to `maxRetries`.
 * - Offline failure (or out of retries): waits, then retries once the device is
 *   back online, staggered across all waiting images.
 * - Healthy images cost nothing: no listener, no timer, no re-render.
 *
 * On web, `Image.web.tsx` is used instead.
 */
export const Image = Object.assign(MemoImage, statics);
