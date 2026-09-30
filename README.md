<div align="center">
  <h1>@tiledev/react-native-performant-image</h1>
  <p><strong>Self-healing image loading for React Native lists, built on react-native-turbo-image (Nuke on iOS, Coil on Android).</strong></p>

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

`react-native-turbo-image` is one of the fastest image components for React Native: it hands loading, decoding and caching to **Nuke on iOS** and **Coil on Android**. What it doesn't do is recover. If an image fails because the connection dropped mid-scroll, it stays broken until the row remounts.

`@tiledev/react-native-performant-image` is a drop-in wrapper that fixes that, without adding work to the images that load fine.

## ✨ How It Works

- **Healthy images cost nothing.** An image that loads registers no listener, no timer and no state. All the machinery below exists only for images that failed.
- **One network listener for the whole app.** Failed images share a single NetInfo subscription, which is created when the first image fails and removed when the last one recovers. A grid of 500 images never means 500 listeners.
- **Online failures retry with backoff.** A failure while the device is online (a timeout, a flaky CDN) retries after `retryDelayMs`, then 2×, 4×… with random jitter, up to `maxRetries`.
- **Offline failures wait for the network.** A failure while offline, or one that has used up its retries, waits. When the connection comes back, waiting images retry oldest first, spaced `staggerMs` apart, so a screen of broken images reloads as a quick ripple rather than one burst of requests.
- **Only the failed image reloads.** Its key changes to `${uri}-${retryKey}`, so that one native view remounts. Nothing else in the list re-renders.
- **No leaks on fast scrolling.** Unmounting an image, or changing its `uri`, cancels its pending retry immediately, so rows recycled out of view never receive late updates.
- **Cheap re-renders.** The component is memoized with a comparison that treats a fresh-but-identical inline `style`, style array or `headers` object as unchanged, and its native event handlers keep a stable identity.

## 📦 Installation

```bash
npm install @tiledev/react-native-performant-image react-native-turbo-image @react-native-community/netinfo
cd ios && pod install
```

Supports iOS and Android (React Native 0.73+). `react-native-turbo-image` has no web implementation, so neither does this package.

## 🛠️ Usage

```tsx
import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { PerformantImage } from '@tiledev/react-native-performant-image';

export function ProductGrid({ products }) {
  return (
    <FlatList
      data={products}
      numColumns={2}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <PerformantImage
          uri={item.imageUrl}
          style={styles.image}
          resizeMode="cover"
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', aspectRatio: 1 },
});
```

### App-wide tuning

```ts
import { configurePerformantImage } from '@tiledev/react-native-performant-image';

// Call once at startup.
configurePerformantImage({ staggerMs: 80, maxDelayMs: 20_000 });
```

## ⚙️ Properties

Accepts every `TurboImageProps` prop except `source`, which is built for you from `uri`, `headers` and `cacheKey`. `style` is required, as in TurboImage.

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `uri` | `string` | *Required* | Remote URL of the image. |
| `headers` | `HeadersInit` | — | Request headers, e.g. auth for a private CDN. |
| `cacheKey` | `string` | — | Cache under this key instead of the URL, e.g. for signed URLs that rotate. |
| `retryDelayMs` | `number` | `300` | Base retry delay: the backoff unit while online, and the wait before the first retry after reconnecting. |
| `maxRetries` | `number` | `2` | Retries while online before the image waits for a reconnect instead. |
| `showPlaceholderOnFailure` | `boolean` | `true` | Passed to TurboImage; defaults to `true` here so a failed image shows its placeholder while it waits. |

Your own `onFailure` and `onSuccess` handlers still fire; the retry logic runs alongside them.

### `configurePerformantImage(config)`

| Option | Default | Description |
| :--- | :--- | :--- |
| `staggerMs` | `50` | Gap between retries when the connection comes back. |
| `maxDelayMs` | `30000` | Upper bound for any single retry delay, backoff included. |

## 🏎️ Production Checklist

Retrying fixes broken images. What makes an image-heavy list fast is mostly how you feed it:

1. **Request images at display size.** Downloading and decoding a 2000 px image into a 180 px cell is the biggest cost in most grids. Ask your CDN for the size you render (Shopify: `&width=360`), or use TurboImage's `resize` prop.
2. **Use a recycling list.** For long grids, `@shopify/flash-list` recycles cells instead of creating new ones. With `FlatList`, give rows a fixed height (`getItemLayout`) and keep `windowSize` modest.
3. **Keep styles static.** Put styles in `StyleSheet.create`. Inline objects work, and the memo check handles them, but a static style skips even that check.
4. **Hoist `headers`.** Create the headers object once (outside the component, or in `useMemo`) rather than per row.
5. **Show something while loading.** Pass a `placeholder` (blurhash or thumbhash) so cells don't pop in empty.
6. **Prefetch the next page.** Call `TurboImage.prefetch(...)` for images just below the fold before the user scrolls to them.

## 🧪 Development

```bash
npm install
npm run lint   # type-check
npm test       # retry scheduler + memo comparison tests (Node's built-in runner)
npm run build
```

The retry policy lives in `src/retryScheduler.ts` with no React or React Native imports, so it is tested directly in Node with a fake clock and a fake network.

---

## 🤝 Contributing & Ecosystem Credit

This architecture was designed to bridge critical gaps in the modern React Native image loading ecosystem. If you hit rendering problems in high-throughput grids, open an issue or reach out to the author **[@mk843](https://github.com/mk843)** on [LinkedIn](https://www.linkedin.com/in/manas-luthra).

Licensed under the [MIT License](LICENSE). Created with ⚡ by the engineering team at **Tiledev**.
