import { CONFIG, UI, storageSet } from '../config.js';
import { root, clamp } from '../utils.js';
import { setDbg, renderDebug } from './debug-panel.js';

var _plusBtn;
var _entry;
var _panel;
var _panelOpen = false;
var _resetBtn;
var _resetArmed = false;
var _resetTimer = 0;

var GEAR_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';

export function initControlPanel(plusBtn) {
  _plusBtn = plusBtn;
  createEntry();
  createPanel();
  ensureControlPanel();
}

export function ensureControlPanel() {
  if (!_entry || !_panel) return;
  var rightPart = findRightPart();
  if (rightPart && _entry.parentNode !== rightPart) {
    closePanel();
    rightPart.insertBefore(_entry, rightPart.firstChild);
    setEntryInBarStyle();
  } else if (!rightPart && _entry.parentNode !== root()) {
    closePanel();
    root().appendChild(_entry);
    setEntryFallbackStyle();
  }
  if (_panelOpen) {
    var r = root();
    if (_panel.parentNode !== r) r.appendChild(_panel);
    anchorPanel();
  }
}

function findRightPart() {
  return document.querySelector('.control-panel-icon-row.superChat .icon-right-part')
    || document.querySelector('.control-panel-icon-row .icon-right-part');
}

function createEntry() {
  _entry = document.createElement('button');
  _entry.type = 'button';
  _entry.dataset.dm1Control = 'entry';
  _entry.title = 'DM+1 设置';
  _entry.setAttribute('aria-label', 'DM+1 设置');
  _entry.innerHTML = GEAR_SVG;
  setEntryInBarStyle();
  _entry.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    togglePanel();
  });
}

function setEntryInBarStyle() {
  _entry.style.cssText = 'background:transparent;border:0;padding:0;margin:0 6px;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;color:#fff;cursor:pointer;opacity:.85;';
}

function setEntryFallbackStyle() {
  _entry.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:' + (UI.Z_INDEX - 2)
    + ';width:36px;height:36px;border:1px solid rgba(255,255,255,.3);border-radius:8px;background:rgba(18,20,24,.9);color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.35);opacity:.9;';
}

function createPanel() {
  _panel = document.createElement('div');
  _panel.dataset.dm1Panel = '1';
  _panel.style.cssText = 'position:fixed;display:none;z-index:' + (UI.Z_INDEX - 2)
    + ';width:240px;padding:10px 12px;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:rgba(18,20,24,.94);color:#e8eaed;font:12px/1.6 "PingFang SC","Microsoft YaHei",sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.45);user-select:none;';
  _panel.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:13px;font-weight:600;">'
    + '<span>DM+1 设置</span><span data-dm1-panel-close style="cursor:pointer;color:#9aa0a6;font-size:14px;line-height:1;">×</span></div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin:6px 0;">'
    + '<span>发送冷却</span><input data-dm1-cooldown type="checkbox" style="accent-color:#fb7299;width:14px;height:14px;cursor:pointer;"></div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin:6px 0;">'
    + '<span>发送间隔</span><select data-dm1-interval style="width:96px;background:#2a2d33;color:#e8eaed;border:1px solid rgba(255,255,255,.18);border-radius:6px;padding:2px 4px;"></select></div>'
    + '<div style="margin:6px 0;"><div style="margin-bottom:4px;">按钮透明度</div>'
    + '<div data-dm1-opacity style="display:flex;gap:4px;"></div></div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin:6px 0;">'
    + '<span>调试面板</span><input data-dm1-debug type="checkbox" style="accent-color:#fb7299;width:14px;height:14px;cursor:pointer;"></div>'
    + '<button data-dm1-reset style="width:100%;margin-top:4px;padding:5px 0;border:1px solid rgba(255,255,255,.18);border-radius:6px;background:transparent;color:#e8eaed;font-size:12px;cursor:pointer;">重置所有设置</button>'
    + '<div style="margin-top:8px;text-align:right;color:#8a9199;font-size:11px;">' + getVersion() + '</div>';

  var interval = _panel.querySelector('[data-dm1-interval]');
  CONFIG.cooldownMsOptions.forEach(function (ms) {
    var label = ms === 0 ? '无间隔' : (ms / 1000).toFixed(1) + 's';
    var opt = document.createElement('option');
    opt.value = String(ms);
    opt.textContent = label;
    interval.appendChild(opt);
  });
  interval.value = String(CONFIG.cooldownMs);
  interval.disabled = !CONFIG.enableSendCooldown;

  var opacityBox = _panel.querySelector('[data-dm1-opacity]');
  UI.OPACITY_OPTIONS.forEach(function (v) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.value = String(v);
    btn.textContent = Math.round(v * 100) + '%';
    btn.style.cssText = 'flex:1;padding:3px 0;border:1px solid rgba(255,255,255,.18);border-radius:6px;background:transparent;color:#e8eaed;font-size:11px;cursor:pointer;';
    btn.addEventListener('click', function () {
      CONFIG.btnOpacity = v;
      storageSet('btnOpacity', v);
      if (_plusBtn) _plusBtn.style.opacity = String(v);
      syncOpacityButtons();
    });
    opacityBox.appendChild(btn);
  });

  _panel.querySelector('[data-dm1-cooldown]').checked = CONFIG.enableSendCooldown;
  _panel.querySelector('[data-dm1-debug]').checked = CONFIG.debug;
  _panel.querySelector('[data-dm1-cooldown]').addEventListener('change', function (e) {
    CONFIG.enableSendCooldown = e.target.checked;
    storageSet('enableSendCooldown', CONFIG.enableSendCooldown);
    setDbg('enableSendCooldown', CONFIG.enableSendCooldown);
    interval.disabled = !e.target.checked;
  });
  interval.addEventListener('change', function () {
    CONFIG.cooldownMs = Number(interval.value);
    storageSet('cooldownMs', CONFIG.cooldownMs);
    setDbg('cooldownMs', CONFIG.cooldownMs);
  });
  _panel.querySelector('[data-dm1-debug]').addEventListener('change', function (e) {
    CONFIG.debug = e.target.checked;
    storageSet('debug', CONFIG.debug);
    var dp = document.querySelector('[data-dm1-debug="1"]');
    if (dp) dp.style.display = CONFIG.debug ? 'block' : 'none';
    if (CONFIG.debug) {
      setDbg('cooldownMs', CONFIG.cooldownMs);
      setDbg('enableSendCooldown', CONFIG.enableSendCooldown);
      setDbg('fullscreen', !!document.fullscreenElement);
      renderDebug();
    }
  });
  _panel.querySelector('[data-dm1-panel-close]').addEventListener('click', closePanel);

  _resetBtn = _panel.querySelector('[data-dm1-reset]');
  _resetBtn.addEventListener('click', onResetClick);
  syncOpacityButtons();
}

function syncOpacityButtons() {
  var btns = _panel.querySelectorAll('[data-dm1-opacity] button');
  for (var i = 0; i < btns.length; i++) {
    var active = Number(btns[i].dataset.value) === CONFIG.btnOpacity;
    btns[i].style.borderColor = active ? '#fb7299' : 'rgba(255,255,255,.18)';
    btns[i].style.color = active ? '#fb7299' : '#e8eaed';
  }
}

function togglePanel() {
  if (_panelOpen) closePanel();
  else openPanel();
}

function openPanel() {
  if (!_entry || !_entry.isConnected) return;
  var r = root();
  if (_panel.parentNode !== r) r.appendChild(_panel);
  _panel.style.display = 'block';
  anchorPanel();
  _panelOpen = true;
  document.addEventListener('mousedown', onDocMouseDown, true);
  document.addEventListener('keydown', onDocKeyDown, true);
  window.addEventListener('resize', onViewportChange, true);
  window.addEventListener('orientationchange', onViewportChange, true);
}

function closePanel() {
  if (!_panel) return;
  _panelOpen = false;
  _panel.style.display = 'none';
  document.removeEventListener('mousedown', onDocMouseDown, true);
  document.removeEventListener('keydown', onDocKeyDown, true);
  window.removeEventListener('resize', onViewportChange, true);
  window.removeEventListener('orientationchange', onViewportChange, true);
  disarmReset();
}

function anchorPanel() {
  var r = _entry.getBoundingClientRect();
  var w = _panel.offsetWidth || 240;
  var h = _panel.offsetHeight || 200;
  var gap = 8;
  var left = clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8);
  var top = r.top - h - gap;
  if (top < 8) top = r.bottom + gap;
  top = Math.min(Math.max(top, 8), innerHeight - h - 8);
  _panel.style.left = left + 'px';
  _panel.style.top = top + 'px';
}

function onDocMouseDown(e) {
  if (_panel.contains(e.target) || _entry.contains(e.target)) return;
  closePanel();
}

function onDocKeyDown(e) {
  if (e.key === 'Escape') closePanel();
}

function onViewportChange() {
  if (_panelOpen) anchorPanel();
}

function onResetClick() {
  if (!_resetArmed) {
    _resetArmed = true;
    _resetBtn.textContent = '确认重置？';
    _resetTimer = setTimeout(disarmReset, 3000);
    return;
  }
  ['enableSendCooldown', 'cooldownMs', 'debug', 'btnOpacity'].forEach(function (k) {
    try { GM_deleteValue && GM_deleteValue(k); } catch (e) {}
    try { localStorage.removeItem('dm1_' + k); } catch (e) {}
  });
  location.reload();
}

function disarmReset() {
  if (_resetTimer) { clearTimeout(_resetTimer); _resetTimer = 0; }
  _resetArmed = false;
  if (_resetBtn) _resetBtn.textContent = '重置所有设置';
}

function getVersion() {
  return typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';
}
