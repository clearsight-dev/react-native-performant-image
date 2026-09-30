/**
 * Props comparison for React.memo.
 *
 * The default comparison treats a new object as a change, and list rows almost
 * always pass fresh objects: `source={{ uri }}`, `style={{ width, height }}`,
 * `style={[a, b]}`. That re-renders every visible image whenever the row
 * re-renders. These props are compared by value instead, a level or two deep,
 * which is cheap and catches the common case. Everything else, callbacks
 * included, is compared by identity, so a changed handler is never silently
 * dropped.
 */

type Compare = (a: unknown, b: unknown) => boolean;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Same keys, and each value equal under `inner`. Arrays compare item by item. */
function byValue(inner: Compare): Compare {
  const compare: Compare = (a, b) => {
    if (Object.is(a, b)) return true;
    if (!isObject(a) || !isObject(b)) return false;
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      return a.every((item, i) => compare(item, b[i]));
    }
    const aKeys = Object.keys(a);
    if (aKeys.length !== Object.keys(b).length) return false;
    return aKeys.every((k) => Object.prototype.hasOwnProperty.call(b, k) && inner(a[k], b[k]));
  };
  return compare;
}

const identity: Compare = Object.is;
const oneLevel = byValue(identity);
/** `{ uri, headers: { ... } }`: the headers object is compared by value too. */
const source = byValue((a, b) => oneLevel(a, b));

const BY_KEY: Record<string, Compare> = {
  source,
  style: oneLevel,
  placeholder: oneLevel,
};

export function arePropsEqual<P extends object>(prev: P, next: P): boolean {
  const prevKeys = Object.keys(prev);
  if (prevKeys.length !== Object.keys(next).length) return false;
  return prevKeys.every((key) => {
    if (!Object.prototype.hasOwnProperty.call(next, key)) return false;
    const compare = BY_KEY[key] ?? identity;
    return compare((prev as Record<string, unknown>)[key], (next as Record<string, unknown>)[key]);
  });
}
