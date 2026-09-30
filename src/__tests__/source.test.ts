import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { remoteSource, srcUri } from '../source';

describe('remoteSource', () => {
  it('reads a remote source object, headers included', () => {
    assert.deepEqual(remoteSource({ uri: 'https://cdn/a.jpg', headers: { A: '1' } }), {
      uri: 'https://cdn/a.jpg',
      headers: { A: '1' },
    });
  });

  it('leaves bundled require() assets to React Native', () => {
    assert.equal(remoteSource(42), null);
  });

  it('leaves file:// and data: URIs to React Native', () => {
    assert.equal(remoteSource({ uri: 'file:///tmp/a.jpg' }), null);
    assert.equal(remoteSource({ uri: 'data:image/png;base64,AAAA' }), null);
  });

  it('takes the first remote entry of a source array', () => {
    assert.deepEqual(
      remoteSource([{ uri: 'file:///a.jpg' }, { uri: 'https://cdn/b.jpg' }, { uri: 'https://cdn/c.jpg' }]),
      { uri: 'https://cdn/b.jpg' },
    );
  });

  it('follows React Native precedence: srcSet, then src, then source', () => {
    assert.deepEqual(
      remoteSource(
        { uri: 'https://cdn/source.jpg' },
        'https://cdn/src.jpg',
        'https://cdn/1x.jpg 1x, https://cdn/2x.jpg 2x',
      ),
      { uri: 'https://cdn/1x.jpg' },
    );
    assert.deepEqual(remoteSource({ uri: 'https://cdn/source.jpg' }, 'https://cdn/src.jpg'), {
      uri: 'https://cdn/src.jpg',
    });
  });

  it('has nothing to load without a source', () => {
    assert.equal(remoteSource(undefined), null);
    assert.equal(remoteSource({}), null);
  });
});

describe('srcUri', () => {
  it('picks the first srcSet candidate, else src', () => {
    assert.equal(srcUri('https://cdn/a.jpg', 'https://cdn/1x.jpg 1x, https://cdn/2x.jpg 2x'), 'https://cdn/1x.jpg');
    assert.equal(srcUri('https://cdn/a.jpg'), 'https://cdn/a.jpg');
    assert.equal(srcUri(), undefined);
  });
});
