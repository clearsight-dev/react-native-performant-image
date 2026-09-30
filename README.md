<div align="center">
  <h1>@tiledev/react-native-performant-image</h1>
  <p><strong>A drop-in replacement for React Native's <code>Image</code>: native-speed loading (Nuke on iOS, Coil on Android) that recovers by itself from network failures, on iOS, Android and web.</strong></p>

  <p>
    <a href="LICENSE"><img src="https://img.shields.io/npm/l/@tiledev/react-native-performant-image" alt="License"></a>
    <a href="https://www.npmjs.com/package/@tiledev/react-native-performant-image"><img src="https://img.shields.io/npm/v/@tiledev/react-native-performant-image" alt="npm version"></a>
    <a href="https://bundlephobia.com/package/@tiledev/react-native-performant-image"><img src="https://img.shields.io/bundlephobia/minzip/@tiledev/react-native-performant-image" alt="bundle size"></a>
  </p>
</div>

---

### 👑 Architectural Engineering & Ownership
> This package is maintained under the official **@tiledev** organization for production stability.
>
> **Architected, engineered, and open-sourced by [@mk843](https://github.com/mk843) (Manas Luthra).**
> *For core engine design reviews, deep technical breakdowns, or architectural consulting, connect via [LinkedIn](https://www.linkedin.com/in/manas-luthra).*

---

## 🚀 Why This Exists

React Native's `Image` is fine for a few images and struggles with image-heavy screens. `react-native-turbo-image` fixes the speed by handing loading, decoding and caching to **Nuke on iOS** and **Coil on Android**, but it has its own API, and it doesn't recover: if an image fails because the connection dropped mid-scroll, it stays broken until the row remounts.

This package gives you both, behind the API you already use. Change one import:

```diff
- import { Image } from 'react-native';
+ import { Image } from '@tiledev/react-native-performant-image';
```

Every existing `<Image>` keeps working: same props, same events, same static methods.

## ✨ How It Works

- **Same API as React Native.** `source`, `src`, `srcSet`, `style`, `resizeMode`, `onLoad`, `onError`, `onLoadStart`, `onLoadEnd`, `onProgress`, `blurRadius`, `tintColor`, `alt`, `Image.getSize`, `Image.prefetch`, and the rest. Events keep React Native's shapes.
- **Native engines for remote images.** `http(s)` images load through TurboImage (Nuke / Coil). Bundled `require()` assets, `file://` and `data:` URIs go to React Native's own `Image`, which already handles them well and has nothing to retry.
- **Healthy images cost nothing.** An image that loads registers no listener, no timer and no state. All the machinery below exists only for images that failed.
- **One network listener for the whole app.** Failed images share a single NetInfo subscription, created when the first image fails and removed when the last one recovers. A grid of 500 images never means 500 listeners.
- **Online failures retry with backoff.** A failure while the device is online (a timeout, a flaky CDN) retries after `retryDelayMs`, then 2×, 4×… with random jitter, up to `maxRetries`.
- **Offline failures wait for the network.** A failure while offline, or one that has used up its retries, waits. When the connection comes back, waiting images retry oldest first, spaced `staggerMs` apart, so a screen of broken images reloads as a quick ripple rather than one burst of requests.
- **Only the failed image reloads.** Its key changes, so that one native view remounts. Nothing else in the list re-renders.
- **No leaks on fast scrolling.** Unmounting an image, or changing its source, cancels its pending retry immediately.
- **Cheap re-renders.** The component is memoized with a comparison that treats a fresh-but-identical inline `source` (headers included), `style` or `placeholder` as unchanged, and the handlers it passes down keep a stable identity.

## 📦 Installation

```bash
npm install @tiledev/react-native-performant-image react-native-turbo-image @react-native-community/netinfo
cd ios && pod install
```

Supports iOS and Android (React Native 0.73+), and web through react-native-web (see [Web](#-web)).

## 🛠️ Usage

Use it exactly like React Native's `Image`:

```tsx
import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { Image } from '@tiledev/react-native-performant-image';

export function ProductGrid({ products }) {
  return (
    <FlatList
      data={products}
      numColumns={2}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.image}
          resizeMode="cover"
          placeholder={{ blurhash: item.blurhash }}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', aspectRatio: 1 },
});
```

### Extra props

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `retryDelayMs` | `number` | `300` | Base retry delay: the backoff unit while online, and the wait before the first retry after reconnecting. |
| `maxRetries` | `number` | `2` | Retries while online before the image waits for a reconnect instead. |
| `placeholder` | `{ blurhash?: string; thumbhash?: string }` | — | Shown while the image loads, and kept if it fails. Like expo-image's `placeholder`. Native only. |
| `transition` | `number` | — | Fade-in duration in ms once loaded. Like React Native's `fadeDuration`, which is Android-only, but on iOS too. Native only. |

### Extra static methods

| Method | Description |
| :--- | :--- |
| `Image.clearMemoryCache()` | Drop decoded images from memory (as in expo-image). No-op on web. |
| `Image.clearDiskCache()` | Drop the on-disk image cache (as in expo-image). No-op on web. |

`Image.prefetch(url)` warms the cache this component actually reads (Nuke / Coil) rather than React Native's. The other statics (`getSize`, `getSizeWithHeaders`, `resolveAssetSource`, `queryCache`, `abortPrefetch`) are React Native's own.

### App-wide tuning

```ts
import { configurePerformantImage } from '@tiledev/react-native-performant-image';

// Call once at startup.
configurePerformantImage({ staggerMs: 80, maxDelayMs: 20_000 });
```

| Option | Default | Description |
| :--- | :--- | :--- |
| `staggerMs` | `50` | Gap between retries when the connection comes back. |
| `maxDelayMs` | `30000` | Upper bound for any single retry delay, backoff included. |

## 📱 Differences on iOS and Android

Remote images use TurboImage, which covers almost all of React Native's `Image`. Where it doesn't:

| React Native prop | On iOS / Android |
| :--- | :--- |
| `resizeMode="repeat"` | Renders as `cover`. |
| `resizeMode="none"` | Renders as `center`. |
| `source` array, `srcSet` | The first remote entry is loaded; the native engines choose their own decode size. |
| `defaultSource`, `loadingIndicatorSource` | Ignored. Use `placeholder` instead. |
| `capInsets`, `resizeMethod`, `onPartialLoad`, `crossOrigin`, `referrerPolicy`, `source.cache` | Ignored. |

`onProgress` reports `{ loaded, total }` on both platforms, not just iOS.

Bundled `require()` assets, `file://` and `data:` URIs render through React Native's `Image` unchanged, so every prop works for them.

## 🌐 Web

`react-native-turbo-image` is native-only, so web builds use `Image.web` instead: React Native's `Image`, which react-native-web renders as a browser image, with the same retries. On web the connection state comes from the browser's own `online` / `offline` events, so neither TurboImage nor NetInfo is ever loaded in the browser.

Almost every prop passes straight through, since react-native-web's `Image` takes React Native's props. `src` and `srcSet` are turned into `source`, which is all react-native-web reads, and `onLoad` gets React Native's `{ nativeEvent: { source: { width, height, uri } } }` shape rather than the DOM event.

**Ignored on web:** `placeholder` and `transition` (the extras), and `source.headers`: a plain browser image request can't carry headers, so a private image on web needs a URL that works without them (a signed URL, or a cookie on the same site).

**Setup:** Expo and Metro pick up `.web` files for web builds with no configuration. For a custom webpack setup, use the standard react-native-web configuration:

```js
resolve: {
  alias: { 'react-native$': 'react-native-web' },
  extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js'],
},
```

## 🏎️ Production Checklist

Retrying fixes broken images. What makes an image-heavy list fast is mostly how you feed it:

1. **Request images at display size.** Downloading and decoding a 2000 px image into a 180 px cell is the biggest cost in most grids. Ask your CDN for the size you render (Shopify: `&width=360`).
2. **Use a recycling list.** For long grids, `@shopify/flash-list` recycles cells instead of creating new ones. With `FlatList`, give rows a fixed height (`getItemLayout`) and keep `windowSize` modest.
3. **Keep styles static.** Put styles in `StyleSheet.create`. Inline objects work, and the memo check handles them, but a static style skips even that check.
4. **Hoist `headers`.** Build the headers object once rather than per row.
5. **Show something while loading.** Pass a `placeholder` so cells don't pop in empty.
6. **Prefetch the next page.** Call `Image.prefetch(url)` for images just below the fold before the user scrolls to them.

## 🧪 Development

```bash
npm install
npm run lint   # type-check
npm test       # retry policy, source rules, prop mapping, memo check, and the web component in jsdom
npm run build
```

The retry policy (`src/retryScheduler.ts`) and the React Native → TurboImage prop mapping (`src/toTurboProps.ts`) have no React Native runtime imports, so they are tested directly in Node. The web component is tested end to end: real React DOM and react-native-web in jsdom, with a fake browser image loader whose failures each test controls.

---

## 🤝 Contributing & Ecosystem Credit

This architecture was designed to bridge critical gaps in the modern React Native image loading ecosystem. If you hit rendering problems in high-throughput grids, open an issue or reach out to the author **[@mk843](https://github.com/mk843)** on [LinkedIn](https://www.linkedin.com/in/manas-luthra).

Licensed under the [MIT License](LICENSE). Created with ⚡ by the engineering team at **Tiledev**.
