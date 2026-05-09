export function root() {
  return document.fullscreenElement || document.body;
}

export function isElementAlive(el) {
  return !!(el && el.isConnected);
}

export function pointInRect(x, y, r, p) {
  p = p || 0;
  return x >= r.left - p && x <= r.right + p && y >= r.top - p && y <= r.bottom + p;
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
