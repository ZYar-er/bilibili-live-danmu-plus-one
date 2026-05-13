import { TIMING } from '../config.js';
import { state } from '../state.js';
import { isElementAlive } from '../utils.js';
import { setDbg } from '../ui/debug-panel.js';
import { getSafeContainer } from '../ui/safe-container.js';

function parseDurationMs(value) {
  var v = String(value || '').trim();
  if (!v) return 0;
  if (v.endsWith('ms')) return parseFloat(v) || 0;
  if (v.endsWith('s')) return (parseFloat(v) || 0) * 1000;
  return parseFloat(v) || 0;
}

function shouldRemoveGhostNow(el) {
  var cs = getComputedStyle(el);
  if (!cs) return false;
  var name = cs.animationName;
  if (!name || name === 'none') return true;
  var durations = String(cs.animationDuration || '').split(',');
  for (var i = 0; i < durations.length; i++) {
    if (parseDurationMs(durations[i]) > 0) return false;
  }
  return true;
}

export function freeze(el) {
  if (!isElementAlive(el)) return;
  if (el.dataset.dm1Frozen === '1') return;
  el.dataset.dm1Frozen = '1';
  el.dataset.dm1OldAnimPlay = el.style.animationPlayState || '';
  el.style.setProperty('animation-play-state', 'paused', 'important');
  setDbg('frozen', true);
}

export function unfreeze(el) {
  if (!el || el.dataset.dm1Frozen !== '1') return;
  var safeContainer = getSafeContainer();
  var wasInSafe = el.parentNode && safeContainer && el.parentNode === safeContainer;
  el.style.animationPlayState = el.dataset.dm1OldAnimPlay || '';
  delete el.dataset.dm1OldAnimPlay;
  delete el.dataset.dm1Frozen;
  if (wasInSafe) {
    if (shouldRemoveGhostNow(el)) {
      if (el.parentNode) el.remove();
    } else if (el.dataset.dm1RescueCleaned !== '1') {
      el.dataset.dm1RescueCleaned = '1';
      el.addEventListener('animationend', function () { if (el.parentNode) el.remove(); });
      setTimeout(function () { if (el.parentNode) el.remove(); }, TIMING.GHOST_CLEANUP_MS);
    }
  }
  setDbg('frozen', false);
}

export function clearCurrentHit() {
  var el = state.currentHit && state.currentHit.el;
  if (el && isElementAlive(el)) {
    unfreeze(el);
  }
  state.currentHit = null;
  state.frozenRect = null;
  setDbg('hitText', '');
  setDbg('hitType', '');
  setDbg('currentConnected', false);
}
