import { getScope } from './env-detector.js';
import { firstMatch } from '../utils.js';
import { DM_CONTAINER_SELECTORS, DM_CLASS, CONFIG } from '../config.js';
import { state } from '../state.js';
import { getDmText } from './danmu-parser.js';
import { cacheParsed, getCachedParsed } from './danmu-cache.js';
import { rescue } from '../ui/safe-container.js';
import { setDbg } from '../ui/debug-panel.js';

export function isDanmuNode(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  if (!(node instanceof HTMLElement)) return false;
  return !!(node.classList && node.classList.contains(DM_CLASS))
    && node.getAttribute('role') === 'comment';
}

export function eachDanmuNode(root, fn) {
  if (!root || !root.getElementsByClassName) return false;
  var list = root.getElementsByClassName(DM_CLASS);
  for (var i = 0; i < list.length; i++) {
    var el = list[i];
    if (el.getAttribute && el.getAttribute('role') !== 'comment') continue;
    if (fn(el) === true) return true;
  }
  return false;
}

function cacheIfNeeded(el) {
  if (!(el instanceof HTMLElement)) return;
  var cached = getCachedParsed(el);
  if (cached) return;
  var parsed = getDmText(el);
  cacheParsed(el, parsed);
}

export function scanAndCache(root, opts) {
  if (!root || !root.getElementsByClassName) return;
  var doInvalidate = opts && opts.invalidate;
  var count = 0;
  eachDanmuNode(root, function (el) {
    if (!(el instanceof HTMLElement)) return;
    var cached = getCachedParsed(el);
    if (!cached) {
      cacheParsed(el, getDmText(el));
    } else if (doInvalidate && el.textContent !== cached._raw) {
      cached._raw = el.textContent;
      var fresh = getDmText(el);
      if (fresh.text !== cached.text || fresh.type !== cached.type) {
        cacheParsed(el, fresh);
      }
    }
    count++;
  });
  if (CONFIG.debug) {
    var container = findDmContainer();
    if (container && root === container) {
      setDbg('dmCount', count);
    } else if (!container) {
      setDbg('dmCount', 0);
    }
  }
}

export function findDmContainer() {
  return firstMatch(getScope(), DM_CONTAINER_SELECTORS);
}

var _mo;

export function bindObserverTarget(container) {
  if (state.dmObserverTarget && !state.dmObserverTarget.isConnected) {
    state.dmObserverTarget = null;
  }
  var scope = getScope();
  var dmContainer = container && container.isConnected ? container : findDmContainer();
  var nextTarget = dmContainer
    || scope.querySelector('.bilibili-live-player-video, #live-player')
    || scope;
  if (state.dmObserverTarget === nextTarget) return;
  if (_mo) _mo.disconnect();

  state.dmObserverTarget = nextTarget;
  _mo = new MutationObserver(function (mutations) {
    for (var mi = 0; mi < mutations.length; mi++) {
      var added = mutations[mi].addedNodes;
      var removed = mutations[mi].removedNodes;
      for (var ai = 0; ai < added.length; ai++) {
        var node = added[ai];
        if (isDanmuNode(node)) cacheIfNeeded(node);
        else if (node.nodeType === Node.ELEMENT_NODE) scanAndCache(node);
      }
      for (var ri = 0; ri < removed.length; ri++) {
        var rm = removed[ri];
        if (rm.nodeType === Node.ELEMENT_NODE && rm.dataset && rm.dataset.dm1Frozen === '1') {
          rescue(rm);
          setDbg('currentConnected', true);
        }
      }
    }
  });
  _mo.observe(state.dmObserverTarget, { childList: true, subtree: true });
}
