import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { arePropsEqual } from '../shallowEqual';

describe('arePropsEqual', () => {
  const onError = () => {};

  it('treats a fresh but identical inline style as unchanged', () => {
    assert.equal(
      arePropsEqual({ style: { width: 10, height: 10 } }, { style: { width: 10, height: 10 } }),
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

  it('treats a fresh but identical source, headers included, as unchanged', () => {
    assert.equal(
      arePropsEqual(
        { source: { uri: 'x', headers: { Authorization: 't' } } },
        { source: { uri: 'x', headers: { Authorization: 't' } } },
      ),
      true,
    );
  });

  it('sees a changed header', () => {
    assert.equal(
      arePropsEqual(
        { source: { uri: 'x', headers: { Authorization: 't' } } },
        { source: { uri: 'x', headers: { Authorization: 'u' } } },
      ),
      false,
    );
  });

  it('treats a fresh but identical placeholder as unchanged', () => {
    assert.equal(arePropsEqual({ placeholder: { blurhash: 'b' } }, { placeholder: { blurhash: 'b' } }), true);
  });

  it('compares a bundled require() source by identity', () => {
    assert.equal(arePropsEqual({ source: 12 }, { source: 12 }), true);
    assert.equal(arePropsEqual({ source: 12 }, { source: 13 }), false);
  });

  it('sees a changed style value', () => {
    assert.equal(arePropsEqual({ style: { width: 10 } }, { style: { width: 11 } }), false);
  });

  it('sees a changed uri', () => {
    assert.equal(arePropsEqual({ source: { uri: 'a' } }, { source: { uri: 'b' } }), false);
  });

  it('compares callbacks by identity so a new handler is never dropped', () => {
    assert.equal(arePropsEqual({ onError }, { onError }), true);
    assert.equal(arePropsEqual({ onError }, { onError: () => {} }), false);
  });

  it('sees a prop being added or swapped for another', () => {
    assert.equal(arePropsEqual({ blurRadius: 1 }, { blurRadius: 1, tintColor: 'red' }), false);
    assert.equal(arePropsEqual({ blurRadius: undefined }, { tintColor: undefined }), false);
  });
});
