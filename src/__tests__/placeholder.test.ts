import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { planPlaceholder } from '../placeholder';

const URI = 'https://cdn/a_1080x.jpg';
const CARD = 'https://cdn/a_660x.jpg';

describe('planPlaceholder', () => {
  it('has nothing to plan without a placeholder or a hash', () => {
    assert.deepEqual(planPlaceholder('ios', {}, URI), {});
    assert.deepEqual(planPlaceholder('android', {}, URI), {});
  });

  it('lets Android draw the in-memory image itself, the hash as its fallback', () => {
    assert.deepEqual(planPlaceholder('android', { memoryCacheKey: CARD, blurhash: 'LEHV6n' }, URI), {
      native: { memoryCacheKey: CARD, blurhash: 'LEHV6n' },
    });
  });

  it('draws the in-memory image behind the image on iOS, where TurboImage would stretch it', () => {
    assert.deepEqual(planPlaceholder('ios', { memoryCacheKey: CARD }, URI), { underlayUri: CARD });
  });

  it('drops the hash on iOS when the in-memory image goes behind: TurboImage would draw it on top', () => {
    assert.deepEqual(planPlaceholder('ios', { memoryCacheKey: CARD, thumbhash: 'abc' }, URI), { underlayUri: CARD });
  });

  it("drops a key that is the image's own URL: the engines look that up first", () => {
    assert.deepEqual(planPlaceholder('ios', { memoryCacheKey: URI }, URI), {});
    assert.deepEqual(planPlaceholder('android', { memoryCacheKey: URI, blurhash: 'x' }, URI), {
      native: { blurhash: 'x' },
    });
  });

  it('passes a hash alone to TurboImage, on both', () => {
    assert.deepEqual(planPlaceholder('ios', { blurhash: 'x' }, URI), { native: { blurhash: 'x' } });
    assert.deepEqual(planPlaceholder('android', { thumbhash: 'y' }, URI), { native: { thumbhash: 'y' } });
  });

  it('sends one hash only, thumbhash first', () => {
    assert.deepEqual(planPlaceholder('ios', { blurhash: 'x', thumbhash: 'y' }, URI), { native: { thumbhash: 'y' } });
  });
});
