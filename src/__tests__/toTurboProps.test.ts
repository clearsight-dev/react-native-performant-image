import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { IGNORED_ON_NATIVE, toTurboProps } from '../toTurboProps';
import type { ImageProps } from '../types';

const map = (props: Partial<ImageProps>) =>
  toTurboProps({ source: { uri: 'https://cdn/a.jpg' }, ...props } as ImageProps) as Record<string, unknown>;

describe('toTurboProps', () => {
  it('renames React Native props to their TurboImage equivalents', () => {
    const out = map({ blurRadius: 4, tintColor: 'red', progressiveRenderingEnabled: true, fadeDuration: 150 });
    assert.equal(out.blur, 4);
    assert.equal(out.tint, 'red');
    assert.equal(out.isProgressiveImageRenderingEnabled, true);
    assert.equal(out.fadeDuration, 150);
    for (const key of ['blurRadius', 'tintColor', 'progressiveRenderingEnabled']) assert.ok(!(key in out), key);
  });

  it('lets `transition` win over fadeDuration', () => {
    assert.equal(map({ transition: 300, fadeDuration: 150 }).fadeDuration, 300);
  });

  it('passes resizeMode through, mapping the two TurboImage lacks', () => {
    assert.equal(map({ resizeMode: 'contain' }).resizeMode, 'contain');
    assert.equal(map({ resizeMode: 'repeat' }).resizeMode, 'cover');
    assert.equal(map({ resizeMode: 'none' }).resizeMode, 'center');
  });

  it('moves width, height and radius props into the style, style winning', () => {
    const style = { width: 50 };
    assert.deepEqual(map({ width: 10, height: 20, borderRadius: 4, style }).style, [
      { width: 10, height: 20, borderRadius: 4 },
      style,
    ]);
    assert.equal(map({ style }).style, style);
  });

  it('shows the placeholder, and keeps it on failure', () => {
    const out = map({ placeholder: { blurhash: 'LEHV6n' } });
    assert.deepEqual(out.placeholder, { blurhash: 'LEHV6n' });
    assert.equal(out.showPlaceholderOnFailure, true);
  });

  it('uses alt as the accessibility label, as React Native does', () => {
    const out = map({ alt: 'Red shoe' });
    assert.equal(out.accessibilityLabel, 'Red shoe');
    assert.equal(out.accessible, true);
    assert.equal(map({ alt: 'x', accessibilityLabel: 'y' }).accessibilityLabel, 'y');
  });

  it('passes view and accessibility props through', () => {
    const out = map({ testID: 'img', accessibilityRole: 'image' });
    assert.equal(out.testID, 'img');
    assert.equal(out.accessibilityRole, 'image');
  });

  it('drops props TurboImage has no equivalent for, and the ones wired separately', () => {
    const out = map({
      defaultSource: 1,
      capInsets: { top: 1 },
      resizeMethod: 'resize',
      crossOrigin: 'anonymous',
      onLoad: () => {},
      onError: () => {},
      retryDelayMs: 10,
      maxRetries: 1,
      src: 'https://cdn/b.jpg',
    });
    for (const key of [...IGNORED_ON_NATIVE, 'source', 'src', 'onLoad', 'onError', 'retryDelayMs', 'maxRetries']) {
      assert.ok(!(key in out), `${key} should not reach TurboImage`);
    }
  });

  it('adds nothing that was not asked for', () => {
    assert.deepEqual(Object.keys(map({})), ['style']);
  });
});
