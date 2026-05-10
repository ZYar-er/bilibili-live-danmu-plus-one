import { getScope } from './env-detector.js';
import { DM_CONTAINER_SELECTORS, DM_NODE_SELECTOR } from '../config.js';
import { state } from '../state.js';
import { getDmText } from './danmu-parser.js';
import { showBtn, hideBtn, clearCurrentHit, freeze } from '../ui/button.js';
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

function attachEvents(el) {
  if (!(el instanceof HTMLElement)) return;
  if (el.dataset.dm1Bound === '1') return;
  el.dataset.dm1Bound = '1';
  el.style.pointerEvents = 'auto';

  el.addEventListener('mouseenter', function () {
    if (state.leaveTimer) { clearTimeout(state.leaveTimer); state.leaveTimer = 0; }
    var payload = getDmText(el);
    if (!payload.text) return;
    if (state.currentHit && state.currentHit.el === el) return;
    if (state.currentHit) { hideBtn(); clearCurrentHit(); }
    state.currentHit = { el: el, text: payload.text, type: payload.type };
    freeze(el);
    setDbg('hitText', payload.text);
    setDbg('hitType', payload.type);
    setDbg('currentConnected', true);
    showBtn(el);
  });

  el.addEventListener('mouseleave', function () {
    state.leaveTimer = setTimeout(function () {
      state.leaveTimer = 0;
      hideBtn();
      clearCurrentHit();
    }, 50);
  });
}

export function scanAndBind(root) {
  if (!root || !root.querySelectorAll) return;
  var nodes = root.querySelectorAll(DM_NODE_SELECTOR);
  var boundCount = 0;
  for (var i = 0; i < nodes.length; i++) {
    attachEvents(nodes[i]);
    boundCount++;
  }
  setDbg('dmCount', boundCount);
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
        if (isDanmuNode(node)) attachEvents(node);
        if (node.nodeType === Node.ELEMENT_NODE) scanAndBind(node);
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
