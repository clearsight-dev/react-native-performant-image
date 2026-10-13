import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isFromPreviousSource, needsSuccessEvent } from '../events';

const A = 'https://cdn/a_360x.jpg';
const B = 'https://cdn/b_360x.jpg';

describe('needsSuccessEvent', () => {
  it('skips the event for a healthy image nobody listens to', () => {
    assert.equal(needsSuccessEvent({ hasOnLoad: false, failed: false }), false);
  });

  it('asks for it when the caller listens', () => {
    assert.equal(needsSuccessEvent({ hasOnLoad: true, failed: false }), true);
  });

  it('asks for it once the source has failed, so a later success clears the retry', () => {
    assert.equal(needsSuccessEvent({ hasOnLoad: false, failed: true }), true);
  });
});

describe('isFromPreviousSource', () => {
  it("takes the current source's event", () => {
    assert.equal(isFromPreviousSource(A, A, B), false);
  });

  it('drops a late event from the source shown before', () => {
    assert.equal(isFromPreviousSource(B, A, B), true);
  });

  it('takes an event with no address, or one before the source ever changed', () => {
    assert.equal(isFromPreviousSource(undefined, A, B), false);
    assert.equal(isFromPreviousSource(B, A, undefined), false);
  });

  it('takes the current source written differently by the native side', () => {
    assert.equal(isFromPreviousSource('https://cdn/a%20b.jpg', 'https://cdn/a b.jpg', B), false);
  });
});
