import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image as RNImage, Platform, StyleSheet, View } from 'react-native';
import type { ImageErrorEvent, ImageLoadEvent, ImageProgressEventIOS, NativeSyntheticEvent } from 'react-native';
import TurboImage from 'react-native-turbo-image';
import type { Failure, Progress, Success, TurboImageProps } from 'react-native-turbo-image';

import { planPlaceholder } from './placeholder';
import { arePropsEqual } from './shallowEqual';
import { remoteSource, type RemoteSource } from './source';
import { toTurboProps } from './toTurboProps';
import type { ImageProps } from './types';
import { useImageRetry, useLatest } from './useImageRetry';

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

  const plan = planPlaceholder(
    Platform.OS,
    { memoryCacheKey: props.placeholder?.memoryCacheKey, blurhash: props.blurhash, thumbhash: props.thumbhash },
    remote.uri,
  );
  const turbo = toTurboProps(props, plan.native);
  // A new key remounts only this image, which makes the native view request it
  // again. No other row in the list is touched.
  const imageKey = `${remote.uri}-${retryKey}`;
  const mainProps: TurboImageProps = {
    ...turbo,
    source,
    onSuccess,
    onFailure,
    // Only ask the native side for events someone is listening to.
    onStart: props.onLoadStart ? onStart : undefined,
    onCompletion: props.onLoadEnd ? onCompletion : undefined,
    onProgress: props.onProgress ? onProgress : undefined,
  };

  if (plan.underlayUri) {
    return (
      <UnderlaidImage
        key={`${plan.underlayUri}|${imageKey}`}
        underlayUri={plan.underlayUri}
        imageKey={imageKey}
        image={mainProps}
        fadeMs={turbo.fadeDuration ?? IOS_DEFAULT_FADE_MS}
      />
    );
  }
  return <TurboImage {...mainProps} key={imageKey} />;
}

/**
 * iOS, with `placeholder.memoryCacheKey`: the in-memory image is drawn behind the real one, with
 * the same resizeMode (TurboImage would stretch it, see `planPlaceholder`). Both fill a view that
 * takes the image's style; the placeholder goes once the image has faded in over it, so a
 * transparent image never shows it through. Only these images carry the extra state and timer.
 */
function UnderlaidImage({
  underlayUri,
  imageKey,
  image,
  fadeMs,
}: {
  underlayUri: string;
  imageKey: string;
  image: TurboImageProps;
  fadeMs: number;
}) {
  const [covered, setCovered] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const { style, onLayout, pointerEvents, onSuccess, ...imageProps } = image;
  const onImageSuccess = useCallback(
    (e: NativeSyntheticEvent<Success>) => {
      onSuccess?.(e);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCovered(true), fadeMs);
    },
    [onSuccess, fadeMs],
  );

  return (
    <View style={[style, styles.frame]} onLayout={onLayout} pointerEvents={pointerEvents}>
      {!covered && (
        <TurboImage
          source={{ uri: underlayUri }}
          style={StyleSheet.absoluteFill}
          resizeMode={imageProps.resizeMode}
          fadeDuration={0}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        />
      )}
      <TurboImage {...imageProps} key={imageKey} style={StyleSheet.absoluteFill} onSuccess={onImageSuccess} />
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
 * - Healthy images cost nothing: no listener, no timer, no re-render.
 *
 * On web, `Image.web.tsx` is used instead.
 */
export const Image = Object.assign(MemoImage, statics);
