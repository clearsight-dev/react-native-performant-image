// photosToWarm (0.3.1): which of a list's photos the one batched prefetch sends —
// non-empty, deduped in order, minus the ones already warmed this launch.
import assert from 'node:assert/strict';
import test from 'node:test';

import { photosToWarm } from '../prefetchSelection';

test('drops empty entries and keeps order', () => {
  assert.deepEqual(photosToWarm(['a', null, 'b', undefined, '', 'c'], new Set()), ['a', 'b', 'c']);
});

test('dedupes within the list', () => {
  assert.deepEqual(photosToWarm(['a', 'b', 'a', 'b', 'c'], new Set()), ['a', 'b', 'c']);
});

test('skips photos already warmed this launch', () => {
  assert.deepEqual(photosToWarm(['a', 'b', 'c'], new Set(['a', 'c'])), ['b']);
});

test('nothing to warm is an empty list, never a throw', () => {
  assert.deepEqual(photosToWarm([], new Set()), []);
  assert.deepEqual(photosToWarm([null, undefined, ''], new Set()), []);
  assert.deepEqual(photosToWarm(['a', 'b'], new Set(['a', 'b'])), []);
});
