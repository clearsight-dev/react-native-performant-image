/**
 * Props comparison for React.memo.
 *
 * The default comparison treats a new object as a change, and list rows almost
 * always pass fresh objects: `style={{ width, height }}`, `style={[a, b]}`,
 * `headers={{ Authorization }}`. That re-renders every visible image whenever
 * the row re-renders. These props are compared one level deep instead, which
 * is cheap and catches the common case. Everything else, callbacks included,
 * is compared by identity, so a changed handler is never silently dropped.
 */
const DEEP_ONE_LEVEL = new Set(['style', 'headers']);

function shallowObjectEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => shallowObjectEqual(item, b[i]));
  }
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every(
    (k) =>
      Object.prototype.hasOwnProperty.call(b, k) &&
      Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

export function arePropsEqual<P extends object>(prev: P, next: P): boolean {
  const prevKeys = Object.keys(prev);
  if (prevKeys.length !== Object.keys(next).length) return false;
  return prevKeys.every((key) => {
    if (!Object.prototype.hasOwnProperty.call(next, key)) return false;
    const a = (prev as Record<string, unknown>)[key];
    const b = (next as Record<string, unknown>)[key];
    return DEEP_ONE_LEVEL.has(key) ? shallowObjectEqual(a, b) : Object.is(a, b);
  });
}
