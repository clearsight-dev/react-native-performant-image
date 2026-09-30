import type { ImageSourcePropType, ImageURISource } from 'react-native';

export interface RemoteSource {
  uri: string;
  headers?: { [key: string]: string };
}

/**
 * The remote image to load, read from React Native's image props, or null
 * when there is nothing remote to load: a bundled `require()` asset, a
 * `file://` / `data:` URI, or no source at all. Those need no retries, and
 * React Native's own Image already renders them well.
 *
 * Precedence follows React Native: `srcSet`, then `src`, then `source`. From
 * a `srcSet` or a `source` array, the first remote candidate is used; native
 * image engines pick their own decode size, so the density variants add
 * nothing there.
 */
export function remoteSource(
  source: ImageSourcePropType | undefined,
  src?: string,
  srcSet?: string,
): RemoteSource | null {
  let candidate: ImageURISource | undefined;
  const fromSrc = srcUri(src, srcSet);
  if (fromSrc) {
    candidate = { uri: fromSrc };
  } else if (Array.isArray(source)) {
    candidate = source.find((s) => typeof s?.uri === 'string' && isRemote(s.uri));
  } else if (source && typeof source === 'object') {
    candidate = source as ImageURISource;
  }
  if (!candidate?.uri || !isRemote(candidate.uri)) return null;
  return candidate.headers ? { uri: candidate.uri, headers: candidate.headers } : { uri: candidate.uri };
}

/** The URI React Native's `src` / `srcSet` props select: the first `srcSet` candidate, else `src`. */
export function srcUri(src?: string, srcSet?: string): string | undefined {
  if (srcSet) return srcSet.split(',')[0]?.trim().split(/\s+/)[0] || undefined;
  return src || undefined;
}

function isRemote(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}
