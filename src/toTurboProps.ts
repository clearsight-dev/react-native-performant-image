import type { StyleProp, ViewStyle } from 'react-native';
import type { ResizeMode, TurboImageProps } from 'react-native-turbo-image';

import type { ImageProps } from './types';

/** React Native Image props this module translates into TurboImage ones. */
const TRANSLATED = [
  'source',
  'src',
  'srcSet',
  'style',
  'width',
  'height',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'resizeMode',
  'blurRadius',
  'tintColor',
  'fadeDuration',
  'progressiveRenderingEnabled',
  'alt',
  'onLoad',
  'onError',
  'onLoadStart',
  'onLoadEnd',
  'onProgress',
  'retryDelayMs',
  'maxRetries',
  'placeholder',
  'transition',
] as const;

/**
 * React Native Image props TurboImage has no equivalent for. Accepted, so any
 * existing `<Image>` compiles unchanged, and ignored on iOS and Android.
 * Keep in step with the README.
 */
export const IGNORED_ON_NATIVE = [
  'defaultSource',
  'loadingIndicatorSource',
  'capInsets',
  'resizeMethod',
  'onPartialLoad',
  'crossOrigin',
  'referrerPolicy',
] as const;

/** Everything TurboImage takes except the source and the load events. */
export type TurboStaticProps = Omit<
  TurboImageProps,
  'source' | 'onStart' | 'onSuccess' | 'onFailure' | 'onProgress' | 'onCompletion'
>;

/**
 * TurboImage has no `repeat` or `none`. `repeat` becomes `cover`, React
 * Native's own default; `none` (no scaling) becomes `center`, the closest mode
 * that keeps the image unstretched.
 */
function toResizeMode(mode: ImageProps['resizeMode']): ResizeMode | undefined {
  if (mode === 'repeat') return 'cover';
  if (mode === 'none') return 'center';
  return mode;
}

/**
 * Translate React Native Image props into TurboImage props (everything but
 * the source and the events, which the component wires itself). Pure, so the
 * mapping is tested without a native runtime.
 */
export function toTurboProps(props: ImageProps): TurboStaticProps {
  const passthrough: Record<string, unknown> = { ...props };
  for (const key of TRANSLATED) delete passthrough[key];
  for (const key of IGNORED_ON_NATIVE) delete passthrough[key];

  // RN Image takes these as props as well as styles; TurboImage only as styles.
  const propStyle: Record<string, number> = {};
  for (const key of [
    'width',
    'height',
    'borderRadius',
    'borderTopLeftRadius',
    'borderTopRightRadius',
    'borderBottomLeftRadius',
    'borderBottomRightRadius',
  ] as const) {
    const value = props[key];
    if (value !== undefined) propStyle[key] = value;
  }
  // TurboImage takes a ViewStyle. The ImageStyle-only keys (resizeMode,
  // tintColor, overlayColor) are ignored by the native view.
  const style = (
    Object.keys(propStyle).length ? [propStyle, props.style] : props.style
  ) as StyleProp<ViewStyle>;

  const out: TurboStaticProps = { ...(passthrough as Partial<TurboStaticProps>), style };
  const set = <K extends keyof TurboStaticProps>(key: K, value: TurboStaticProps[K] | undefined) => {
    if (value !== undefined) out[key] = value as TurboStaticProps[K];
  };
  set('resizeMode', toResizeMode(props.resizeMode));
  set('blur', props.blurRadius);
  set('tint', props.tintColor);
  set('fadeDuration', props.transition ?? props.fadeDuration);
  set('isProgressiveImageRenderingEnabled', props.progressiveRenderingEnabled);
  if (props.placeholder) {
    set('placeholder', props.placeholder);
    set('showPlaceholderOnFailure', true);
  }
  // As React Native does: `alt` is the accessibility label, and makes the image accessible.
  if (props.alt !== undefined) {
    set('accessibilityLabel', props.accessibilityLabel ?? props.alt);
    set('accessible', props.accessible ?? true);
  }
  return out;
}
