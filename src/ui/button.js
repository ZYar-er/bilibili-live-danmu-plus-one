import { UI, CONFIG, TIMING } from '../config.js';
import { state } from '../state.js';
import { root, isElementAlive, clamp } from '../utils.js';
import { getScope } from '../core/env-detector.js';
import { setDbg } from './debug-panel.js';
import { rescue } from './safe-container.js';

export { rescue };

var _plusBtn;

export function createPlusBtn() {
  _plusBtn = document.createElement('button');
  _plusBtn.textContent = '+1';
  _plusBtn.style.cssText = 'position:fixed;display:none;z-index:' + UI.Z_INDEX
    + ';padding:4px 10px;border:1px solid rgba(255,255,255,.82);border-radius:8px;background:rgba(0,0,0,.86);color:#fff;font-size:12px;line-height:1;cursor:pointer;user-select:none;pointer-events:auto;box-shadow:0 2px 10px rgba(0,0,0,.4);transform:translate(-50%,-50%);will-change:left,top;opacity:' + CONFIG.btnOpacity;
  return _plusBtn;
}

function placeBtn(el) {
  if (!el || !isElementAlive(el)) return;
  var r = el.getBoundingClientRect();
  if (r.width <= 4) return;
  var x = r.left + r.width * UI.HORIZONTAL_RATIO;
  var y = r.top + r.height / 2;
  var m = UI.MARGIN_PX;
  x = clamp(x, m + UI.BTN_APPROX_W / 2, innerWidth - m - UI.BTN_APPROX_W / 2);
  y = clamp(y, m + UI.BTN_APPROX_H / 2, innerHeight - m - UI.BTN_APPROX_H / 2);
  _plusBtn.style.left = x + 'px';
  _plusBtn.style.top = y + 'px';
}

export function showBtn(el) {
  var r = root();
  if (_plusBtn.parentNode !== r) r.appendChild(_plusBtn);
  placeBtn(el);
  _plusBtn.style.display = 'block';
  setDbg('btnVisible', true);
}

export function hideBtn() {
  _plusBtn.style.display = 'none';
  setDbg('btnVisible', false);
}

export function placeBtnTick(el) {
  placeBtn(el);
}

export function mountOverlay() {
  var r = root();
  if (_plusBtn && _plusBtn.parentNode !== r) r.appendChild(_plusBtn);
}

export function setupButtonEvents() {
  // 按钮 hover 取消/启动 leaveTimer
  _plusBtn.addEventListener('mouseenter', function () {
    if (state.leaveTimer) { clearTimeout(state.leaveTimer); state.leaveTimer = 0; }
  });
  _plusBtn.addEventListener('mouseleave', function () {
    state.leaveTimer = setTimeout(function () {
      state.leaveTimer = 0;
      hideBtn();
      clearCurrentHit();
    }, TIMING.LEAVE_DELAY_MS);
  });

  // 按钮点击
  var _sendDanmaku; // 由 index 注入
  _plusBtn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    var now = Date.now();
    if (state.clickLocked || now - state.lastClickAt < TIMING.CLICK_DEBOUNCE_MS) return;
    state.lastClickAt = now;
    if (!state.currentHit || !state.currentHit.text) return;
    state.clickLocked = true;
    setBtnFeedback();
    _sendDanmaku(state.currentHit.text);
    setTimeout(function () {
      resetBtnFeedback();
      state.clickLocked = false;
      hideBtn();
      clearCurrentHit();
    }, TIMING.FEEDBACK_MS);
  });

  return {
    injectSender: function (sendFn) { _sendDanmaku = sendFn; }
  };
}

function setBtnFeedback() {
  _plusBtn.textContent = '✓';
  _plusBtn.disabled = true;
  _plusBtn.style.opacity = '0.7';
  _plusBtn.style.cursor = 'default';
}

function resetBtnFeedback() {
  _plusBtn.textContent = '+1';
  _plusBtn.disabled = false;
  _plusBtn.style.opacity = CONFIG.btnOpacity;
  _plusBtn.style.cursor = '';
}

// ===== freeze / unfreeze / clearCurrentHit =====
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
  var wasInSafe = el.parentNode && el.parentNode === document.querySelector('[data-dm1-safe]');
  el.style.animationPlayState = el.dataset.dm1OldAnimPlay || '';
  delete el.dataset.dm1OldAnimPlay;
  delete el.dataset.dm1Frozen;
  if (wasInSafe) {
    el.addEventListener('animationend', function () { if (el.parentNode) el.remove(); });
    setTimeout(function () { if (el.parentNode) el.remove(); }, TIMING.GHOST_CLEANUP_MS);
  }
  setDbg('frozen', false);
}

export function clearCurrentHit() {
  var el = state.currentHit && state.currentHit.el;
  if (el && isElementAlive(el)) {
    unfreeze(el);
    // 从安全容器中移除
    if (el.parentNode && el.parentNode.dataset && el.parentNode.dataset.dm1Safe === '1') {
      el.remove();
    }
  }
  state.currentHit = null;
  setDbg('hitText', '');
  setDbg('hitType', '');
  setDbg('currentConnected', false);
}
