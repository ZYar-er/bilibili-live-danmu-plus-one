import { DM_CONTAINER_SELECTORS, DM_NODE_SELECTOR, UI } from '../config.js';
import { pointInRect, isElementAlive, firstMatch } from '../utils.js';
import { getScope } from './env-detector.js';
import { eachDanmuNode } from './observer.js';

export { cacheParsed, getCachedParsed, clearParsedCache } from './danmu-cache.js';

function resolveDanmuNode(node) {
  var cur = node;
  while (cur && cur.nodeType === Node.ELEMENT_NODE) {
    if (cur.matches && cur.matches(DM_NODE_SELECTOR)) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function resolveContainer(container) {
  if (container && isElementAlive(container)) return container;
  return firstMatch(getScope(), DM_CONTAINER_SELECTORS);
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

export function hitTestFromStack(x, y, container) {
  var stack = document.elementsFromPoint(x, y);
  for (var i = 0; i < stack.length; i++) {
    var el = resolveDanmuNode(stack[i]);
    if (!el) continue;
    if (container && !container.contains(el)) continue;
    if (!isElementAlive(el)) continue;
    var r = el.getBoundingClientRect();
    if (r.width <= 4) continue;
    if (!pointInRect(x, y, r, UI.HIT_PADDING_PX)) continue;
    return { el: el, rect: r, rectText: rectText(r), selector: buildSelector(el), source: 'elementsFromPoint' };
  }
  return null;
}

export function fallbackScan(container, x, y) {
  if (!container) return null;
  var hit = null;
  eachDanmuNode(container, function (el) {
    if (!isElementAlive(el)) return;
    var r = el.getBoundingClientRect();
    if (r.width <= 4) return;
    if (!pointInRect(x, y, r, UI.HIT_PADDING_PX)) return;
    hit = { el: el, rect: r, rectText: rectText(r), selector: buildSelector(el), source: 'fallbackScan' };
    return true;
  });
  return hit;
}

export function hitTest(x, y, container, containerRect) {
  if (x == null || y == null) return null;
  var dmContainer = resolveContainer(container);
  if (dmContainer) {
    var cr = containerRect || dmContainer.getBoundingClientRect();
    if (cr.width > 0 && cr.height > 0 && !pointInRect(x, y, cr, UI.HIT_PADDING_PX)) return null;
  }
  var hit = hitTestFromStack(x, y, dmContainer);
  if (hit) return hit;
  return fallbackScan(dmContainer, x, y);
}
