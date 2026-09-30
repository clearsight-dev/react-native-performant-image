import { browserConnectivity } from './browserConnectivity';
import { createRetryScheduler, type SchedulerConfig } from './retryScheduler';

/**
 * The one scheduler every Image in the page shares. Web variant of
 * `scheduler.ts`: listens to the browser's online/offline events, so web
 * builds never load NetInfo.
 */
export const scheduler = createRetryScheduler(
  browserConnectivity(typeof window === 'undefined' ? undefined : window),
);

/** See `scheduler.ts`. */
export function configurePerformantImage(config: Partial<SchedulerConfig>): void {
  scheduler.configure(config);
}
