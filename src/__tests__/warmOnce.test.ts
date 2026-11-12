// warmOnce (0.3.1): a list's photos warmed in ONE prefetch call, once per launch,
// and the whole batch forgotten (so the next list retries) when that call fails.
import assert from 'node:assert/strict';
import test from 'node:test';

import { warmOnce } from '../warmOnce';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('sends a list as ONE call — deduped, empties dropped, once per launch', async () => {
  const warmed = new Set<string>();
  const calls: string[][] = [];
  const prefetch = async (urls: string[]) => {
    calls.push(urls);
    return true;
  };

  warmOnce(['a', null, 'b', undefined, '', 'a'], warmed, prefetch);
  warmOnce(['a', 'b', 'c'], warmed, prefetch); // only 'c' is new
  warmOnce(['a', 'b', 'c'], warmed, prefetch); // nothing new → no call
  await settle();

  // One call per list, each the whole batch at once (not one call per photo).
  assert.deepEqual(calls, [['a', 'b'], ['c']]);
});

test('nothing to warm never calls prefetch', async () => {
  const warmed = new Set<string>(['a']);
  let called = false;
  warmOnce([null, '', 'a'], warmed, () => {
    called = true;
    return Promise.resolve(true);
  });
  await settle();
  assert.equal(called, false);
});

test('a batch that says no, rejects or throws is forgotten, so the next list retries it', async () => {
  const warmed = new Set<string>();
  const calls: string[][] = [];
  let outcome: 'no' | 'reject' | 'throw' | 'ok' = 'no';
  const prefetch = (urls: string[]) => {
    calls.push(urls);
    if (outcome === 'throw') throw new Error('boom');
    if (outcome === 'reject') return Promise.reject(new Error('offline'));
    return Promise.resolve(outcome === 'ok');
  };

  outcome = 'no';
  warmOnce(['x'], warmed, prefetch);
  await settle();
  outcome = 'reject';
  warmOnce(['x'], warmed, prefetch); // retried after the 'no'
  await settle();
  outcome = 'throw';
  warmOnce(['x'], warmed, prefetch); // retried after the rejection
  await settle();
  outcome = 'ok';
  warmOnce(['x'], warmed, prefetch); // retried after the throw, succeeds
  await settle();
  warmOnce(['x'], warmed, prefetch); // now remembered → no further call
  await settle();

  assert.deepEqual(calls, [['x'], ['x'], ['x'], ['x']]);
  assert.ok(warmed.has('x'));
});

test('a non-Promise return never throws and is treated as sent', async () => {
  const warmed = new Set<string>();
  // A native prefetch that returns void instead of a Promise must not crash here.
  assert.doesNotThrow(() => warmOnce(['a', 'b'], warmed, () => undefined as unknown));
  await settle();
  assert.deepEqual([...warmed].sort(), ['a', 'b']);
});
