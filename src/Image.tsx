import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Image as RNImage, Platform, StyleSheet, View } from 'react-native';
import type { ImageErrorEvent, ImageLoadEvent, ImageProgressEventIOS, NativeSyntheticEvent } from 'react-native';
import TurboImage from 'react-native-turbo-image';
import type { Failure, Progress, Success, TurboImageProps } from 'react-native-turbo-image';

import { isFromPreviousSource, needsSuccessEvent } from './events';
import { planPlaceholder } from './placeholder';
import { arePropsEqual } from './shallowEqual';
import { remoteSource, type RemoteSource } from './source';
import { toTurboProps } from './toTurboProps';
import type { ImageProps } from './types';
import { useImageRetry, useLatest, usePrevious } from './useImageRetry';

/** TurboImage's iOS fade-in when `fadeDuration` isn't given. */
const IOS_DEFAULT_FADE_MS = 300;

const EXTRAS = ['retryDelayMs', 'maxRetries', 'placeholder', 'blurhash', 'thumbhash', 'transition', 'resize'] as const;

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
  const { retryKey, failed, reportFailure, reportSuccess } = useImageRetry({
    uri: remote.uri,
    retryDelayMs: props.retryDelayMs ?? 300,
    maxRetries: props.maxRetries ?? 2,
  });
  const previousUri = usePrevious(remote.uri);

  // Handlers keep one identity and read the current callbacks from here, so
  // new inline callbacks from the parent never look like a prop change.
  const handlers = useLatest({
    onLoad: props.onLoad,
    onError: props.onError,
    onLoadStart: props.onLoadStart,
    onLoadEnd: props.onLoadEnd,
    onProgress: props.onProgress,
  });

  // False for a late event from the source shown before, which is dropped.
  const onSuccess = useCallback(
    (e: NativeSyntheticEvent<Success>): boolean => {
      if (isFromPreviousSource(e.nativeEvent.source, remote.uri, previousUri)) return false;
      reportSuccess();
      const { width, height } = e.nativeEvent;
      handlers.current.onLoad?.({
        ...e,
        nativeEvent: { source: { width, height, uri: remote.uri } },
      } as ImageLoadEvent);
      return true;
    },
    [reportSuccess, handlers, remote.uri, previousUri],
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

  const plan = planPlaceholder(
    Platform.OS,
    { memoryCacheKey: props.placeholder?.memoryCacheKey, blurhash: props.blurhash, thumbhash: props.thumbhash },
    remote.uri,
  );
  const turbo = toTurboProps(props, plan.native);
  // Only ask the native side for events someone is listening to. `onFailure` always: it drives retries.
  const mainProps: TurboImageProps = {
    ...turbo,
    source,
    onFailure,
    onStart: props.onLoadStart ? onStart : undefined,
    onCompletion: props.onLoadEnd ? onCompletion : undefined,
    onProgress: props.onProgress ? onProgress : undefined,
  };

  // The key holds only the retry count. A new source (a recycled list row) goes to the same native
  // view, which cancels the load it had running. Keying on the source remounted the view instead,
  // leaving the old load running (TurboImage doesn't cancel it on iOS) to finish after its view had
  // gone: the likely cause of the Nuke crashes seen in production. A retry bumps the key, so only
  // that image remounts and loads again.
  if (plan.underlayUri) {
    return (
      <UnderlaidImage
        underlayUri={plan.underlayUri}
        uri={remote.uri}
        retryKey={retryKey}
        image={mainProps}
        onImageLoaded={onSuccess}
        fadeMs={turbo.fadeDuration ?? IOS_DEFAULT_FADE_MS}
      />
    );
  }
  const listensForSuccess = needsSuccessEvent({ hasOnLoad: props.onLoad !== undefined, failed });
  return <TurboImage {...mainProps} key={retryKey} onSuccess={listensForSuccess ? onSuccess : undefined} />;
}

/**
 * iOS, with `placeholder.memoryCacheKey`: the in-memory image is drawn behind the real one, with
 * the same resizeMode (TurboImage would stretch it, see `planPlaceholder`). Both fill a view that
 * takes the image's style; the placeholder goes once the image has faded in over it, so a
 * transparent image never shows it through. Only these images carry the extra state and timer, and
 * they always listen for the success event. A new source keeps both native views and brings the
 * placeholder back until the new image is in.
 */
function UnderlaidImage({
  underlayUri,
  uri,
  retryKey,
  image,
  onImageLoaded,
  fadeMs,
}: {
  underlayUri: string;
  uri: string;
  retryKey: number;
  image: TurboImageProps;
  /** False when the event was a late one from the previous source. */
  onImageLoaded: (e: NativeSyntheticEvent<Success>) => boolean;
  fadeMs: number;
}) {
  // The source whose image has faded in over the placeholder.
  const [coveredUri, setCoveredUri] = useState<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // A new source starts over: a timer left from the last one must not drop the placeholder, and
  // coming back to a source shown earlier must show it again. Before paint, so no frame misses it.
  useLayoutEffect(() => {
    clearTimeout(timer.current);
    setCoveredUri(undefined);
  }, [uri]);

  const { style, onLayout, pointerEvents, ...imageProps } = image;
  const onImageSuccess = useCallback(
    (e: NativeSyntheticEvent<Success>) => {
      if (!onImageLoaded(e)) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCoveredUri(uri), fadeMs);
    },
    [onImageLoaded, fadeMs, uri],
  );

  return (
    <View style={[style, styles.frame]} onLayout={onLayout} pointerEvents={pointerEvents}>
      {coveredUri !== uri && (
        <TurboImage
          source={{ uri: underlayUri }}
          style={StyleSheet.absoluteFill}
          resizeMode={imageProps.resizeMode}
          fadeDuration={0}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        />
      )}
      <TurboImage {...imageProps} key={retryKey} style={StyleSheet.absoluteFill} onSuccess={onImageSuccess} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Clips both images to the style's corner radius, as the image alone would be.
  frame: { overflow: 'hidden' },
});

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
 * - Healthy images cost nothing: no listener, no timer, no re-render, and on iOS no load
 *   event unless `onLoad` is given.
 * - A new source (a recycled list row) loads in the same native view, which cancels the old load.
 *
 * On web, `Image.web.tsx` is used instead.
 */
export const Image = Object.assign(MemoImage, statics);
