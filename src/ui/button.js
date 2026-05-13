import { UI, CONFIG, TIMING } from '../config.js';
import { state } from '../state.js';
import { root, isElementAlive, clamp } from '../utils.js';
import { setDbg } from './debug-panel.js';
import { clearCurrentHit } from '../core/freeze.js';

var _plusBtn;

export function createPlusBtn() {
  _plusBtn = document.createElement('button');
  _plusBtn.textContent = '+1';
  _plusBtn.style.cssText = 'position:fixed;display:none;z-index:' + UI.Z_INDEX
    + ';padding:4px 10px;border:1px solid rgba(255,255,255,.82);border-radius:8px;background:rgba(0,0,0,.86);color:#fff;font-size:12px;line-height:1;cursor:pointer;user-select:none;pointer-events:auto;box-shadow:0 2px 10px rgba(0,0,0,.4);transform:translate(-50%,-50%);will-change:left,top;opacity:' + CONFIG.btnOpacity;
  return _plusBtn;
}

function placeBtn(el, rect) {
  if (!el || !isElementAlive(el)) return;
  var r = rect || el.getBoundingClientRect();
  if (r.width <= 4) return;
  // X 跟随鼠标，clamp 到弹幕矩形内（留出按钮半宽边距）
  var halfW = UI.BTN_APPROX_W / 2;
  var x = clamp(state.mouse.x, r.left + halfW, r.right - halfW);
  // 弹幕太窄放不下按钮时，退回到弹幕中心
  if (r.right - r.left < UI.BTN_APPROX_W) x = r.left + r.width / 2;
  var y = r.top + r.height / 2;
  var m = UI.MARGIN_PX;
  x = clamp(x, m + halfW, innerWidth - m - halfW);
  y = clamp(y, m + UI.BTN_APPROX_H / 2, innerHeight - m - UI.BTN_APPROX_H / 2);
  _plusBtn.style.left = x + 'px';
  _plusBtn.style.top = y + 'px';
}

export function showBtn(el, rect) {
  var r = root();
  if (_plusBtn.parentNode !== r) r.appendChild(_plusBtn);
  placeBtn(el, rect);
  _plusBtn.style.display = 'block';
  setDbg('btnVisible', true);
}

export function hideBtn() {
  _plusBtn.style.display = 'none';
  setDbg('btnVisible', false);
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
