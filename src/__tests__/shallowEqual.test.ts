import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { arePropsEqual } from '../shallowEqual';

describe('arePropsEqual', () => {
  const onFailure = () => {};

  it('treats a fresh but identical inline style as unchanged', () => {
    assert.equal(
      arePropsEqual({ uri: 'x', style: { width: 10, height: 10 } }, { uri: 'x', style: { width: 10, height: 10 } }),
      true,
    );
  });

  it('treats a fresh but identical style array as unchanged', () => {
    const base = { flex: 1 };
    assert.equal(
      arePropsEqual({ style: [base, { width: 10 }] }, { style: [base, { width: 10 }] }),
      true,
    );
  });

  it('treats fresh but identical headers as unchanged', () => {
    assert.equal(
      arePropsEqual({ headers: { Authorization: 't' } }, { headers: { Authorization: 't' } }),
      true,
    );
  });

  it('sees a changed style value', () => {
    assert.equal(arePropsEqual({ style: { width: 10 } }, { style: { width: 11 } }), false);
  });

  it('sees a changed uri', () => {
    assert.equal(arePropsEqual({ uri: 'a' }, { uri: 'b' }), false);
  });

  it('compares callbacks by identity so a new handler is never dropped', () => {
    assert.equal(arePropsEqual({ onFailure }, { onFailure }), true);
    assert.equal(arePropsEqual({ onFailure }, { onFailure: () => {} }), false);
  });

  it('sees a prop being added or swapped for another', () => {
    assert.equal(arePropsEqual({ uri: 'a' }, { uri: 'a', blur: 2 }), false);
    assert.equal(arePropsEqual({ blur: undefined }, { tint: undefined }), false);
  });
});
