import type { Connectivity, Online } from './retryScheduler';

interface BrowserLike {
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
  navigator?: { onLine?: boolean };
}

/**
 * Connectivity from the browser's own `online` / `offline` events.
 *
 * Used on web instead of NetInfo: the browser already knows, and NetInfo's
 * web reachability check would add a network request of its own. Only
 * `navigator.onLine === false` counts as offline; `true` means "has a
 * network", which is the same guarantee NetInfo's `isConnected` gives.
 *
 * Without a window (server rendering) this is a no-op: nothing is scheduled
 * on the server anyway, since images only fail in the browser.
 */
export function browserConnectivity(env: BrowserLike | undefined): Connectivity {
  return {
    subscribe(listener) {
      if (!env?.addEventListener || !env.removeEventListener) return () => {};
      const read = (): Online => (env.navigator?.onLine === false ? false : true);
      const onOnline = () => listener(true);
      const onOffline = () => listener(false);
      env.addEventListener('online', onOnline);
      env.addEventListener('offline', onOffline);
      listener(read());
      return () => {
        env.removeEventListener?.('online', onOnline);
        env.removeEventListener?.('offline', onOffline);
      };
    },
  };
}
