var _parsedCache = new WeakMap();

export function cacheParsed(el, payload) {
  if (!el) return;
  payload._raw = el.textContent;
  _parsedCache.set(el, payload);
}

export function getCachedParsed(el) {
  return _parsedCache.get(el);
}

export function clearParsedCache() {
  _parsedCache = new WeakMap();
}

export function invalidateStale(nodes, getDmTextFn) {
  var changed = 0;
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    if (!(el instanceof HTMLElement)) continue;
    var cached = _parsedCache.get(el);
    if (!cached) continue;
    if (el.textContent === cached._raw) continue;
    var fresh = getDmTextFn(el);
    if (fresh.text !== cached.text || fresh.type !== cached.type) {
      _parsedCache.set(el, fresh);
      changed++;
    }
  }
  return changed;
}
