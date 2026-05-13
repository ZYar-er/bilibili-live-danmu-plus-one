import { CONFIG } from '../config.js';
import { state } from '../state.js';
import { setDbg } from '../ui/debug-panel.js';

function setNativeValue(el, value) {
  var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  var desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc && desc.set) desc.set.call(el, value);
  else el.value = value;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText' }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// 精准 → 宽泛 降级链
function findInput() {
  // 1. 侧栏：容器限定 textarea（始终可见，优先）
  var el = document.querySelector('.chat-input-ctnr textarea.chat-input');
  if (el) return el;
  // 2. 全屏：容器限定 input
  el = document.querySelector('#fullscreen-danmaku-vm input.chat-input');
  if (el) return el;
  // 3. 宽泛兜底
  return document.querySelector('.chat-input');
}

function findSendBtn() {
  var btn;
  // 1. 侧栏：容器限定发送按钮（最精确）
  btn = document.querySelector('.chat-input-ctnr button.send-btn');
  if (btn) return btn;
  // 2. 侧栏：类名限定
  btn = document.querySelector('.bl-button.send-btn');
  if (btn) return btn;
  // 3. 全屏：容器限定
  btn = document.querySelector('#fullscreen-danmaku-vm .send-danmaku');
  if (btn) return btn;
  // 4. 全屏：容器内任意 button
  btn = document.querySelector('#fullscreen-danmaku-vm button');
  if (btn) return btn;
  // 5. 宽泛扫描：文本匹配
  var btns = document.querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    var text = (btns[i].textContent || '').trim();
    if (/^发送/.test(text)) return btns[i];
  }
  return null;
}

function canSend(now) {
  if (!CONFIG.enableSendCooldown) return true;
  return now - state.lastSendAt >= CONFIG.cooldownMs;
}

export function sendDanmaku(text) {
  var now = Date.now();
  if (!canSend(now)) { setDbg('lastErr', 'cooldown'); return false; }
  var input = findInput();
  if (!input) { setDbg('lastErr', 'input_not_found'); return false; }
  var finalText = CONFIG.appendPlusOne ? text + ' +1' : text;
  input.focus();
  setNativeValue(input, finalText);
  state.lastSendAt = now;
  var btn = findSendBtn();
  if (btn) { btn.click(); setDbg('lastErr', ''); }
  else {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
    setDbg('lastErr', 'send_btn_not_found_use_enter');
  }
  setDbg('lastSend', finalText);
  return true;
}
