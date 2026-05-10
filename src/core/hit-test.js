import { DM_NODE_SELECTOR, UI } from '../config.js';
import { pointInRect, isElementAlive } from '../utils.js';
import { getScope } from './env-detector.js';

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

function resolveDanmuNode(node) {
  var cur = node;
  while (cur && cur.nodeType === Node.ELEMENT_NODE) {
    if (cur.matches && cur.matches(DM_NODE_SELECTOR)) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function buildSelector(el) {
  var parts = [];
  var cur = el;
  for (var i = 0; i < 4 && cur && cur !== document.body; i++) {
    var tag = cur.tagName ? cur.tagName.toLowerCase() : 'node';
    var id = cur.id ? ('#' + cur.id) : '';
    var cls = cur.classList && cur.classList.length
      ? ('.' + Array.prototype.slice.call(cur.classList, 0, 2).join('.'))
      : '';
    parts.unshift(tag + id + cls);
    cur = cur.parentElement;
  }
  return parts.join(' > ');
}

function rectText(r) {
  return Math.round(r.left) + ',' + Math.round(r.top) + ','
    + Math.round(r.width) + ',' + Math.round(r.height);
}

export function hitTestFromStack(x, y) {
  var stack = document.elementsFromPoint(x, y);
  for (var i = 0; i < stack.length; i++) {
    var el = resolveDanmuNode(stack[i]);
    if (!el) continue;
    if (!isElementAlive(el)) continue;
    var r = el.getBoundingClientRect();
    if (r.width <= 4) continue;
    if (!pointInRect(x, y, r, UI.HIT_PADDING_PX)) continue;
    return { el: el, rect: r, rectText: rectText(r), selector: buildSelector(el), source: 'elementsFromPoint' };
  }
  return null;
}

export function fallbackScan(container, x, y) {
  var scope = container || getScope();
  if (!scope || !scope.querySelectorAll) return null;
  var nodes = scope.querySelectorAll(DM_NODE_SELECTOR);
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    if (!isElementAlive(el)) continue;
    var r = el.getBoundingClientRect();
    if (r.width <= 4) continue;
    if (!pointInRect(x, y, r, UI.HIT_PADDING_PX)) continue;
    return { el: el, rect: r, rectText: rectText(r), selector: buildSelector(el), source: 'fallbackScan' };
  }
  return null;
}

export function hitTest(x, y, container) {
  if (x == null || y == null) return null;
  var hit = hitTestFromStack(x, y);
  if (hit) return hit;
  return fallbackScan(container, x, y);
}
