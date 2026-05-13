var _parsedCache = new WeakMap();

export function cacheParsed(el, payload) {
  if (!el) return;
  _parsedCache.set(el, payload);
}

export function getCachedParsed(el) {
  return _parsedCache.get(el);
}

export function clearParsedCache() {
  _parsedCache = new WeakMap();
}
