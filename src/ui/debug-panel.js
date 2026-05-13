import { UI } from '../config.js';
import { CONFIG } from '../config.js';
import { state } from '../state.js';
import { root } from '../utils.js';
import { getScope, isActivityShell } from '../core/env-detector.js';

var _debugPanel;

export function initDebugPanel() {
  if (isActivityShell()) {
    var existingTop = document.querySelector('[data-dm1-debug="1"]');
    if (existingTop) existingTop.remove();
    return null;
  }
  if (_debugPanel && _debugPanel.isConnected) return _debugPanel;
  var existing = document.querySelector('[data-dm1-debug="1"]');
  if (existing) {
    _debugPanel = existing;
    _debugPanel.style.display = CONFIG.debug ? 'block' : 'none';
    ensureDebugPanelParent();
    return _debugPanel;
  }
  _debugPanel = document.createElement('div');
  _debugPanel.dataset.dm1Debug = '1';
  _debugPanel.style.cssText = 'position:fixed;left:10px;top:10px;z-index:' + UI.Z_INDEX
    + ';min-width:360px;max-width:52vw;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.72);color:#7CFFB2;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;white-space:pre-wrap;word-break:break-all;pointer-events:none;display:'
    + (CONFIG.debug ? 'block' : 'none');
  ensureDebugPanelParent();
  return _debugPanel;
}

// 全屏切换时需迁移到 fullscreenElement 下，否则会被视频层遮挡
export function ensureDebugPanelParent() {
  if (!_debugPanel) return;
  var r = root();
  if (_debugPanel.parentNode !== r) r.appendChild(_debugPanel);
}

var DBG = {
  frame: 0, dmCount: 0, mouse: '0,0',
  hitText: '', hitType: '', btnVisible: false, frozen: false,
  hitSource: '', hitSelector: '', hitRect: '',
  currentConnected: false, lastSend: '', lastErr: '', fullscreen: false,
  cooldownMs: CONFIG.cooldownMs,
  enableSendCooldown: CONFIG.enableSendCooldown,
};

export function setDbg(k, v) {
  if (!CONFIG.debug) return;
  if (DBG[k] === v) return;
  DBG[k] = v;
  renderDebug();
}

export function renderDebug() {
  if (!CONFIG.debug || !_debugPanel) return;
  _debugPanel.textContent =
    '[DM+1 DEBUG v0.0.1]\n'
    + 'frame            : ' + DBG.frame + '\n'
    + 'dmCount          : ' + DBG.dmCount + '\n'
    + 'mouse            : ' + DBG.mouse + '\n'
    + 'hitType          : ' + (DBG.hitType || '(none)') + '\n'
    + 'hitText          : ' + (DBG.hitText || '(none)') + '\n'
    + 'hitSource        : ' + (DBG.hitSource || '(none)') + '\n'
    + 'hitSelector      : ' + (DBG.hitSelector || '(none)') + '\n'
    + 'hitRect          : ' + (DBG.hitRect || '(none)') + '\n'
    + 'btnVisible       : ' + DBG.btnVisible + '\n'
    + 'frozen           : ' + DBG.frozen + '\n'
    + 'currentConnected : ' + DBG.currentConnected + '\n'
    + 'lastSend         : ' + (DBG.lastSend || '(none)') + '\n'
    + 'lastErr          : ' + (DBG.lastErr || '(none)') + '\n'
    + 'enableCooldown   : ' + DBG.enableSendCooldown + '\n'
    + 'cooldownMs       : ' + DBG.cooldownMs + '\n'
    + 'fullscreen       : ' + DBG.fullscreen;
}
