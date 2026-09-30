import React, { memo, useCallback, useMemo } from 'react';
import { Image as RNImage } from 'react-native';
import type { ImageErrorEvent, ImageLoadEvent } from 'react-native';

import { arePropsEqual } from './shallowEqual';
import { remoteSource, srcUri } from './source';
import type { ImageProps } from './types';
import { useImageRetry, useLatest } from './useImageRetry';

/**
 * Web version of Image: React Native's `Image`, which react-native-web renders
 * as a browser image, with the same retries as native.
 *
 * Web builds pick this file over `Image.tsx` through the `.web` extension
 * (Expo, Metro, and react-native-web webpack setups all do), so
 * react-native-turbo-image and NetInfo are never loaded in the browser.
 *
 * The extras (`placeholder`, `transition`) have no web equivalent and are
 * ignored here, as are `source.headers`: a plain browser image request can't
 * carry headers.
 */
function ImageComponent({
  retryDelayMs = 300,
  maxRetries = 2,
  placeholder: _placeholder,
  transition: _transition,
  onLoad,
  onError,
  onLoadStart,
  onLoadEnd,
  src,
  srcSet,
  source,
  ...rnProps
}: ImageProps) {
  const remote = remoteSource(source, src, srcSet);
  // react-native-web's Image only reads `source`, so `src` / `srcSet` become one.
  const fromSrc = srcUri(src, srcSet);
  const resolvedSource = useMemo(() => (fromSrc ? { uri: fromSrc } : source), [fromSrc, source]);
  const { retryKey, reportFailure, reportSuccess } = useImageRetry({
    uri: remote?.uri ?? '',
    retryDelayMs,
    maxRetries,
  });
  const isRemote = remote !== null;

  // react-native-web's Image restarts the download whenever one of its load
  // handlers changes identity, so these keep one identity and read the
  // current callbacks from here.
  const handlers = useLatest({ onLoad, onError, onLoadStart, onLoadEnd });

  const handleLoad = useCallback(
    (e: ImageLoadEvent) => {
      if (isRemote) reportSuccess();
      // react-native-web passes the DOM load event; give callers React Native's shape.
      const img = (e.nativeEvent as unknown as { target?: HTMLImageElement }).target;
      handlers.current.onLoad?.({
        ...e,
        nativeEvent: {
          source: {
            width: img?.naturalWidth ?? 0,
            height: img?.naturalHeight ?? 0,
            uri: remote?.uri ?? img?.currentSrc ?? '',
          },
        },
      } as ImageLoadEvent);
    },
    [isRemote, reportSuccess, handlers, remote?.uri],
  );
  const handleError = useCallback(
    (e: ImageErrorEvent) => {
      handlers.current.onError?.(e);
      if (isRemote) reportFailure();
    },
    [isRemote, reportFailure, handlers],
  );
  const handleLoadStart = useCallback(() => handlers.current.onLoadStart?.(), [handlers]);
  const handleLoadEnd = useCallback(() => handlers.current.onLoadEnd?.(), [handlers]);

  return (
    <RNImage
      {...rnProps}
      source={resolvedSource}
      key={`${remote?.uri ?? ''}-${retryKey}`}
      onLoad={handleLoad}
      onError={handleError}
      onLoadStart={onLoadStart ? handleLoadStart : undefined}
      onLoadEnd={onLoadEnd ? handleLoadEnd : undefined}
    />
  );
}

const resolved = <T,>(value: T) => Promise.resolve(value);

const statics = {
  getSize: RNImage.getSize,
  getSizeWithHeaders: RNImage.getSizeWithHeaders,
  resolveAssetSource: RNImage.resolveAssetSource,
  queryCache: RNImage.queryCache,
  abortPrefetch: RNImage.abortPrefetch,
  prefetch: (url: string): Promise<boolean> => RNImage.prefetch(url),
  /** The browser owns its image caches; kept so shared code runs on web. */
  clearMemoryCache: (): Promise<void> => resolved(undefined),
  /** The browser owns its image caches; kept so shared code runs on web. */
  clearDiskCache: (): Promise<void> => resolved(undefined),
};

const MemoImage = memo(ImageComponent, arePropsEqual);
MemoImage.displayName = 'Image';

export const Image = Object.assign(MemoImage, statics);
