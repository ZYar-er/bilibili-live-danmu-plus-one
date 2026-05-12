import { UI } from '../config.js';
import { root } from '../utils.js';

var _safeContainer;

export function ensureSafeContainer() {
  if (!_safeContainer) {
    _safeContainer = document.createElement('div');
    _safeContainer.dataset.dm1Safe = '1';
    _safeContainer.style.cssText = 'position:fixed;inset:0;overflow:visible;pointer-events:none;z-index:' + (UI.Z_INDEX - 1);
  }
  var r = root();
  if (_safeContainer.parentNode !== r) r.appendChild(_safeContainer);
  return _safeContainer;
}

export function getSafeContainer() {
  return _safeContainer;
}

export function rescue(el) {
  ensureSafeContainer();
  el.style.pointerEvents = 'auto';
  _safeContainer.appendChild(el);
}
