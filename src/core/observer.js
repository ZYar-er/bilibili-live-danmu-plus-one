import { getScope } from './env-detector.js';
import { DM_CONTAINER_SELECTORS, DM_NODE_SELECTOR } from '../config.js';
import { state } from '../state.js';
import { getDmText } from './danmu-parser.js';
import { cacheParsed, getCachedParsed } from './hit-test.js';
import { rescue } from '../ui/safe-container.js';
import { setDbg } from '../ui/debug-panel.js';

function firstMatch(scope, selectors) {
  for (var i = 0; i < selectors.length; i++) {
    var el = scope.querySelector(selectors[i]);
    if (el) return el;
  }
  return null;
}

export function isDanmuNode(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  if (!(node instanceof HTMLElement)) return false;
  if (node.matches && node.matches(DM_NODE_SELECTOR)) return true;
  return false;
}

function cacheIfNeeded(el) {
  if (!(el instanceof HTMLElement)) return;
  var cached = getCachedParsed(el);
  if (cached) return;
  var parsed = getDmText(el);
  cacheParsed(el, parsed);
}

export function scanAndCache(root) {
  if (!root || !root.querySelectorAll) return;
  var nodes = root.querySelectorAll(DM_NODE_SELECTOR);
  var count = 0;
  for (var i = 0; i < nodes.length; i++) {
    cacheIfNeeded(nodes[i]);
    count++;
  }
  var container = findDmContainer();
  if (container && root === container) {
    setDbg('dmCount', count);
  } else if (!container) {
    setDbg('dmCount', 0);
  }
}

export function findDmContainer() {
  return firstMatch(getScope(), DM_CONTAINER_SELECTORS);
}

var _mo;

export function bindObserverTarget() {
  if (state.dmObserverTarget && !state.dmObserverTarget.isConnected) {
    state.dmObserverTarget = null;
  }
  var scope = getScope();
  var nextTarget = findDmContainer()
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
        if (node.nodeType === Node.ELEMENT_NODE) scanAndCache(node);
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
