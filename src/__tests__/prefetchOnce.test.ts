// prefetchOnce (0.3.0, from amore-v2's usePrefetchPhotos): each photo once per launch, a failed one
// tried again by the next list that has it.
import assert from 'node:assert/strict';
import test from 'node:test';

import { forgetPrefetched, prefetchOnce } from '../prefetchOnce';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('each URL is sent once, empty ones never', async () => {
  forgetPrefetched();
  const sent: string[] = [];
  const prefetch = async (url: string) => {
    sent.push(url);
    return true;
  };
  prefetchOnce(['a', null, 'b', undefined, ''], prefetch);
  prefetchOnce(['a', 'b', 'c'], prefetch);
  await settle();
  assert.deepEqual(sent, ['a', 'b', 'c']);
});

test('a prefetch that says no, rejects or throws is forgotten, so the next list tries it again', async () => {
  forgetPrefetched();
  const sent: string[] = [];
  const answers: Record<string, () => Promise<boolean>> = {
    no: async () => false,
    rejects: () => Promise.reject(new Error('offline')),
    throws: () => {
      throw new Error('boom');
    },
  };
  const prefetch = (url: string) => {
    sent.push(url);
    return answers[url]!();
  };
  prefetchOnce(['no', 'rejects', 'throws'], prefetch);
  await settle();
  prefetchOnce(['no', 'rejects', 'throws'], prefetch);
  await settle();
  assert.deepEqual(sent, ['no', 'rejects', 'throws', 'no', 'rejects', 'throws']);
});
