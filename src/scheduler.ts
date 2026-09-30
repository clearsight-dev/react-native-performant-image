import NetInfo from '@react-native-community/netinfo';

import { createRetryScheduler, isOnline, type SchedulerConfig } from './retryScheduler';

/** The one scheduler every PerformantImage in the app shares. */
export const scheduler = createRetryScheduler({
  subscribe: (listener) => NetInfo.addEventListener((state) => listener(isOnline(state))),
});

/**
 * Tune retry behaviour app-wide. Call once at startup, before images mount.
 *
 * ```ts
 * configurePerformantImage({ staggerMs: 80, maxDelayMs: 20_000 });
 * ```
 */
export function configurePerformantImage(config: Partial<SchedulerConfig>): void {
  scheduler.configure(config);
}
